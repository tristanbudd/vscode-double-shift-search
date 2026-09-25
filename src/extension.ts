import * as vscode from 'vscode';
import * as path from 'path';

import * as fs from 'fs/promises';

interface SearchItem extends vscode.QuickPickItem {
  type: 'editor' | 'file' | 'directory' | 'symbol' | 'action' | 'text';
  uri?: vscode.Uri;
  symbol?: vscode.SymbolInformation;
  action?: 'findInFiles' | 'commands';
  lineNumber?: number;
}

let cachedFilesPromise: Thenable<vscode.Uri[]> | undefined;
let cachedDirsPromise: Thenable<vscode.Uri[]> | undefined;

const DEFAULT_DEPRIORITIZED_FOLDERS = [
  'vendor', 'vendors', 'bower_components', 'third_party', 'third-party',
  'packages', 'Pods', 'venv', '.venv', 'site-packages', '__pycache__',
  'target', '.gradle', 'Carthage', 'DerivedData', '.tox', '.mypy_cache',
  '.pytest_cache', '.next', '.nuxt', 'coverage', '.cache'
];

interface GitRepositoryState {
  indexChanges: { uri: vscode.Uri }[];
}
interface GitRepository {
  state: GitRepositoryState;
}
interface GitAPI {
  repositories: GitRepository[];
}
interface GitExtensionExports {
  getAPI(version: 1): GitAPI;
}

const WATCHER_IGNORED_SEGMENTS = new Set(['node_modules', '.git', 'out', 'dist', 'build']);

function isWatcherIgnoredPath(fsPath: string): boolean {
  return fsPath.split(/[\\/]/).some(seg => WATCHER_IGNORED_SEGMENTS.has(seg));
}

export async function getStagedFileUris(): Promise<Set<string>> {
  const staged = new Set<string>();
  try {
    const gitExtension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
    if (!gitExtension) {
      return staged;
    }
    const exports = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
    const gitApi = exports.getAPI(1);
    for (const repo of gitApi.repositories) {
      for (const change of repo.state.indexChanges) {
        staged.add(change.uri.toString());
      }
    }
  } catch (e) {
    // The built-in git extension may be disabled or unavailable; treat as no staged files.
  }
  return staged;
}

export function getDeprioritizedFolderSet(): Set<string> {
  const config = vscode.workspace.getConfiguration('doubleShiftSearch');
  const folders = config.get<string[]>('deprioritizedFolders') || DEFAULT_DEPRIORITIZED_FOLDERS;
  return new Set(folders.map(f => f.toLowerCase()));
}

export function isInDeprioritizedFolder(fsPath: string, deprioritizedFolders: Set<string>): boolean {
  if (deprioritizedFolders.size === 0) {
    return false;
  }
  const segments = fsPath.split(/[\\/]/);
  return segments.some(seg => deprioritizedFolders.has(seg.toLowerCase()));
}

const HUMP_SEPARATORS = new Set(['-', '_', '.', '/', '\\']);

function isAsciiDigit(c: string): boolean { return c >= '0' && c <= '9'; }
function isAsciiLower(c: string): boolean { return c >= 'a' && c <= 'z'; }
function isAsciiUpper(c: string): boolean { return c >= 'A' && c <= 'Z'; }

// Hump starts: index 0, the char after a separator, a digit->letter transition, or a
// lower->upper transition. ASCII-only; does not special-case consecutive-uppercase runs
// (e.g. "IOError").
function getHumpIndices(text: string): number[] {
  const indices: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (i === 0) { indices.push(i); continue; }
    const prev = text[i - 1];
    const curr = text[i];
    if (HUMP_SEPARATORS.has(prev)) {
      indices.push(i);
    } else if (isAsciiDigit(prev) && (isAsciiLower(curr) || isAsciiUpper(curr))) {
      indices.push(i);
    } else if (isAsciiLower(prev) && isAsciiUpper(curr)) {
      indices.push(i);
    }
  }
  return indices;
}

const SUBSTRING_BASE = 1000;
const SUBSTRING_START_BONUS = 500;
const SUBSTRING_HUMP_BONUS = 250;
const SUBSTRING_PROXIMITY_CAP = 50;
const ACRONYM_BASE = 200;
const ACRONYM_FIRST_HUMP_BONUS = 100;
const ACRONYM_COMPACTNESS_CAP = 50;
const ACRONYM_SKIP_PENALTY_PER_HUMP = 10;
const LENGTH_TIEBREAK_WEIGHT = 0.1;

function scoreSingleTerm(term: string, text: string): number | null {
  const lowerTerm = term.toLowerCase();
  const lowerText = text.toLowerCase();

  // Tier 1: exact substring.
  const idx = lowerText.indexOf(lowerTerm);
  if (idx !== -1) {
    let score = SUBSTRING_BASE;
    if (idx === 0) {
      score += SUBSTRING_START_BONUS;
    } else if (getHumpIndices(text).includes(idx)) {
      score += SUBSTRING_HUMP_BONUS;
    }
    score += Math.max(0, SUBSTRING_PROXIMITY_CAP - idx);
    return score - text.length * LENGTH_TIEBREAK_WEIGHT;
  }

  // Tier 2: strict hump/acronym match - pattern chars must land on hump-boundary
  // characters of text, in order (not a free subsequence over the whole string).
  const humpIndices = getHumpIndices(text);
  if (humpIndices.length < lowerTerm.length) {
    return null;
  }

  let ptr = 0;
  let firstMatchRank = -1;
  for (let p = 0; p < lowerTerm.length; p++) {
    const ch = lowerTerm[p];
    let found = false;
    while (ptr < humpIndices.length) {
      const textCh = text[humpIndices[ptr]].toLowerCase();
      ptr++;
      if (textCh === ch) {
        if (firstMatchRank === -1) { firstMatchRank = ptr - 1; }
        found = true;
        break;
      }
    }
    if (!found) {
      return null;
    }
  }

  let score = ACRONYM_BASE;
  if (firstMatchRank === 0) { score += ACRONYM_FIRST_HUMP_BONUS; }
  const skipped = ptr - lowerTerm.length;
  score += Math.max(0, ACRONYM_COMPACTNESS_CAP - skipped * ACRONYM_SKIP_PENALTY_PER_HUMP);
  return score - text.length * LENGTH_TIEBREAK_WEIGHT;
}

// Multi-term AND-semantics (all terms must match) combined via sum: every candidate being
// compared already passed the AND filter, so summing rewards items where every term matches
// strongly instead of a min() dragging a great match down to its weakest term's score.
export function fuzzyScore(pattern: string, text: string): number | null {
  const terms = pattern.toLowerCase().split(' ').filter(t => t.length > 0);
  if (terms.length === 0) {
    return 0;
  }
  let total = 0;
  for (const term of terms) {
    const s = scoreSingleTerm(term, text);
    if (s === null) {
      return null;
    }
    total += s;
  }
  return total;
}

export function fuzzyMatch(pattern: string, text: string): boolean {
  return fuzzyScore(pattern, text) !== null;
}

function scoreSearchItem(item: SearchItem, query: string): number | null {
  const label = item.label.replace(/\$\([^)]+\)/g, '').trim();
  const labelScore = fuzzyScore(query, label);
  const descScore = fuzzyScore(query, item.description || '');
  if (labelScore === null && descScore === null) {
    return null;
  }
  if (labelScore === null) { return descScore as number; }
  if (descScore === null) { return labelScore; }
  return Math.max(labelScore, descScore);
}

// Filters + scores in one pass, then sorts by (primaryRank asc, score desc). primaryRank
// must reproduce whatever bucket order the source array already has (staged/deprioritized),
// so this is a secondary key WITHIN existing buckets - it never reorders across them.
function filterAndScoreItems(
  items: SearchItem[],
  query: string,
  getPrimaryRank: (item: SearchItem) => number
): SearchItem[] {
  const scored: { item: SearchItem; score: number }[] = [];
  for (const item of items) {
    const score = scoreSearchItem(item, query);
    if (score !== null) {
      scored.push({ item, score });
    }
  }
  scored.sort((a, b) => {
    const rankDiff = getPrimaryRank(a.item) - getPrimaryRank(b.item);
    return rankDiff !== 0 ? rankDiff : b.score - a.score;
  });
  return scored.map(s => s.item);
}


export function activate(context: vscode.ExtensionContext) {
  refreshFileCache();

  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  const onWatcherEvent = (uri: vscode.Uri) => {
    if (!isWatcherIgnoredPath(uri.fsPath)) {
      refreshFileCache();
    }
  };
  watcher.onDidCreate(onWatcherEvent);
  watcher.onDidDelete(onWatcherEvent);
  context.subscriptions.push(watcher);

  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => refreshFileCache()));

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && editor.document.uri.scheme === 'file') {
        const config = vscode.workspace.getConfiguration('doubleShiftSearch');
        const maxRecent = config.get<number>('maxRecentFiles') || 10;
        
        let recentFiles = context.workspaceState.get<string[]>('dss.recentFiles') || [];
        const uriString = editor.document.uri.toString();
        
        recentFiles = recentFiles.filter(u => u !== uriString);
        recentFiles.unshift(uriString);
        
        if (recentFiles.length > maxRecent) {
          recentFiles = recentFiles.slice(0, maxRecent);
        }
        
        context.workspaceState.update('dss.recentFiles', recentFiles);
      }
    })
  );

  let disposable = vscode.commands.registerCommand('doubleShiftSearch.search', () => showSearchEverywhere(context));
  context.subscriptions.push(disposable);
}

function refreshFileCache() {
  const config = vscode.workspace.getConfiguration('doubleShiftSearch');
  const excludeFolders = config.get<string[]>('excludeFolders') || [];

  cachedFilesPromise = vscode.workspace.findFiles('**/*').then(files => {
    if (excludeFolders.length === 0) {
      return files;
    }
    const isWin = process.platform === 'win32';
    const excludeSet = new Set(excludeFolders.map(f => isWin ? f.toLowerCase() : f));
    return files.filter(file => {
      const parts = file.fsPath.split(/[\\/]/);
      return !parts.some(part => excludeSet.has(isWin ? part.toLowerCase() : part));
    });
  });
  cachedDirsPromise = cachedFilesPromise.then(files => {
    const dirSet = new Set<string>();
    for (const file of files) {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(file);
      if (!workspaceFolder) {continue;}
      
      let currentPath = path.dirname(file.fsPath);
      const rootPath = workspaceFolder.uri.fsPath;

      // On Windows, fsPath casing (e.g. the drive letter) isn't guaranteed consistent
      // between a workspace folder URI and a file URI, so compare case-insensitively.
      const normalizeForComparison = (p: string): string => process.platform === 'win32' ? p.toLowerCase() : p;
      const normalizedRootPath = normalizeForComparison(rootPath);

      while (currentPath.length >= rootPath.length && normalizeForComparison(currentPath).startsWith(normalizedRootPath)) {
        if (dirSet.has(currentPath)) {break;}
        dirSet.add(currentPath);
        
        const nextPath = path.dirname(currentPath);
        if (nextPath === currentPath) {break;} // Reached root
        currentPath = nextPath;
      }
    }
    return Array.from(dirSet).map(dir => vscode.Uri.file(dir));
  });
}

async function showSearchEverywhere(context: vscode.ExtensionContext) {
  const quickPick = vscode.window.createQuickPick<SearchItem>();
  quickPick.placeholder = 'Search Everywhere (Files, Symbols, Open Editors)';
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;

  let isDisposed = false;
  quickPick.onDidHide(() => {
    isDisposed = true;
    quickPick.dispose();
  });

  const config = vscode.workspace.getConfiguration('doubleShiftSearch');
  if (config.get<boolean>('useSelectionAsQuery')) {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && !activeEditor.selection.isEmpty) {
      quickPick.value = activeEditor.document.getText(activeEditor.selection);
    }
  }

  quickPick.busy = true;
  quickPick.show();

  let cachedFiles: vscode.Uri[];
  let cachedDirs: vscode.Uri[];
  let stagedUris: Set<string>;
  try {
    [cachedFiles, cachedDirs, stagedUris] = await Promise.all([
      cachedFilesPromise || Promise.resolve([]),
      cachedDirsPromise || Promise.resolve([]),
      getStagedFileUris()
    ]);
  } catch (e) {
    console.error('Failed to load search data', e);
    if (!isDisposed) {
      quickPick.busy = false;
    }
    return;
  }

  if (isDisposed) {
    return;
  }

  const deprioritizedFolders = getDeprioritizedFolderSet();
  quickPick.busy = false;

  const openEditors: SearchItem[] = [];
  const addedUris = new Set<string>();
  const recentUris = context.workspaceState.get<string[]>('dss.recentFiles') || [];

  for (const uriStr of recentUris) {
    try {
      const uri = vscode.Uri.parse(uriStr);
      addedUris.add(uriStr);
      openEditors.push({
        label: `$(history) ${path.basename(uri.fsPath)}`,
        description: vscode.workspace.asRelativePath(uri),
        type: 'editor',
        uri: uri,
        alwaysShow: true
      });
    } catch (e) {}
  }

  for (const tabGroup of vscode.window.tabGroups.all) {
    for (const tab of tabGroup.tabs) {
      if (tab.input instanceof vscode.TabInputText) {
        const uri = tab.input.uri;
        const uriStr = uri.toString();
        if (!addedUris.has(uriStr)) {
          addedUris.add(uriStr);
          openEditors.push({
            label: `$(history) ${path.basename(uri.fsPath)}`,
            description: vscode.workspace.asRelativePath(uri),
            type: 'editor',
            uri: uri,
            alwaysShow: true
          });
        }
      }
    }
  }

  const getFileRank = (uri: vscode.Uri): number => {
    if (stagedUris.has(uri.toString())) { return 0; }
    if (isInDeprioritizedFolder(uri.fsPath, deprioritizedFolders)) { return 2; }
    return 1;
  };

  const openEditorUris = new Set(openEditors.map(e => e.uri?.toString()));
  const fileItems: SearchItem[] = cachedFiles
    .filter(uri => !openEditorUris.has(uri.toString()))
    .sort((a, b) => getFileRank(a) - getFileRank(b))
    .map(uri => ({
      label: `$(file) ${path.basename(uri.fsPath)}`,
      description: vscode.workspace.asRelativePath(uri),
      type: 'file',
      uri: uri,
      alwaysShow: true
    }));

  const getPathDepth = (fsPath: string): number => fsPath.split(/[\\/]/).length;

  const dirItems: SearchItem[] = [...cachedDirs]
    .sort((a, b) => {
      const aDeprioritized = isInDeprioritizedFolder(a.fsPath, deprioritizedFolders);
      const bDeprioritized = isInDeprioritizedFolder(b.fsPath, deprioritizedFolders);
      if (aDeprioritized !== bDeprioritized) { return aDeprioritized ? 1 : -1; }
      return getPathDepth(a.fsPath) - getPathDepth(b.fsPath);
    })
    .map(uri => ({
      label: `$(folder) ${path.basename(uri.fsPath)}`,
      description: vscode.workspace.asRelativePath(uri),
      type: 'directory',
      uri: uri,
      alwaysShow: true
    }));

  const baseItems: SearchItem[] = [];
  if (openEditors.length > 0) {
    baseItems.push(...openEditors);
  }
  if (dirItems.length > 0) {
    baseItems.push(...dirItems.slice(0, 20)); // Just show a few top-level dirs by default
  }
  if (fileItems.length > 0) {
    baseItems.push(...fileItems);
  }

  if (baseItems.length === 0) {
    baseItems.push({ label: 'No files found in workspace', description: '(The workspace may still be indexing)', type: 'action' });
  }

  let symbolTimeout: NodeJS.Timeout | undefined;
  let textSearchId = 0;

  const handleValueChange = (value: string) => {
    if (symbolTimeout) {
      clearTimeout(symbolTimeout);
    }

    const currentSearchId = ++textSearchId;

    const isDirPriority = value.endsWith('/') || value.endsWith('\\');
    const matchValue = isDirPriority ? value.slice(0, -1) : value;

    const filteredDirs = filterAndScoreItems(dirItems, matchValue, item =>
      isInDeprioritizedFolder(item.uri!.fsPath, deprioritizedFolders) ? 1 : 0
    );
    const filteredEditors = filterAndScoreItems(openEditors, matchValue, () => 0);
    const filteredFiles = filterAndScoreItems(fileItems, matchValue, item => getFileRank(item.uri!));

    let currentItems: SearchItem[] = [];
    
    if (isDirPriority) {
      if (filteredDirs.length > 0) {
        currentItems.push(...filteredDirs.slice(0, 50));
      }
      if (filteredEditors.length > 0) {
        currentItems.push(...filteredEditors);
      }
      if (filteredFiles.length > 0) {
        currentItems.push(...filteredFiles.slice(0, 100));
      }
    } else {
      if (filteredEditors.length > 0) {
        currentItems.push(...filteredEditors);
      }
      if (filteredDirs.length > 0) {
        currentItems.push(...filteredDirs.slice(0, 20));
      }
      if (filteredFiles.length > 0) {
        currentItems.push(...filteredFiles.slice(0, 100));
      }
    }

    if (currentItems.length === 0 && !value) {
      currentItems = [...baseItems].slice(0, 100);
    } else if (currentItems.length === 0) {
      currentItems = [{ label: '$(sync~spin) Searching...', alwaysShow: true, type: 'action' }];
    }

    quickPick.items = currentItems;

    if (!value) {
      quickPick.busy = false;
      return;
    }

    symbolTimeout = setTimeout(async () => {
      if (isDisposed) { return; }
      quickPick.busy = true;
      try {
        const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
          'vscode.executeWorkspaceSymbolProvider',
          value
        ) || [];

        const symbolItems: SearchItem[] = symbols.map(sym => {
          let icon = '$(symbol-misc)';
          switch (sym.kind) {
            case vscode.SymbolKind.Class: icon = '$(symbol-class)'; break;
            case vscode.SymbolKind.Function: icon = '$(symbol-method)'; break;
            case vscode.SymbolKind.Method: icon = '$(symbol-method)'; break;
            case vscode.SymbolKind.Variable: icon = '$(symbol-variable)'; break;
            case vscode.SymbolKind.Interface: icon = '$(symbol-interface)'; break;
            case vscode.SymbolKind.Module: icon = '$(symbol-namespace)'; break;
          }

          return {
            label: `${icon} ${sym.name}`,
            description: `${sym.containerName ? sym.containerName + ' - ' : ''}${vscode.workspace.asRelativePath(sym.location.uri)}`,
            type: 'symbol',
            symbol: sym,
            alwaysShow: true
          };
        });

        const getBaseItemsWithSymbols = (isSearchingText: boolean = false) => {
          const openEditorItems: SearchItem[] = [];
          const fileAndDirItems: SearchItem[] = [];
          
          for (const item of currentItems) {
            if (item.label === '$(warning) No results found' || item.label.includes('$(sync~spin)')) {
              continue;
            }
            if (item.type === 'editor') {
              openEditorItems.push(item);
            } else if (item.type === 'file' || item.type === 'directory') {
              fileAndDirItems.push(item);
            }
          }
          
          const result: SearchItem[] = [];
          result.push(...openEditorItems);
          if (symbolItems.length > 0) {
            result.push(...symbolItems.slice(0, 50));
          }
          result.push(...fileAndDirItems);

          if (isSearchingText) {
            result.push({ label: '$(sync~spin) Searching file contents...', alwaysShow: true, type: 'action' });
          }
          
          return result;
        };

        if (currentSearchId === textSearchId && !isDisposed) {
          if (quickPick.value === value) {
            quickPick.items = getBaseItemsWithSymbols(true);
          }
        }

        let textItems: SearchItem[] = [];
        if (currentSearchId === textSearchId) {
          const files = await (cachedFilesPromise || Promise.resolve([]));
          
          const activeEditor = vscode.window.activeTextEditor;
          const activeUriString = activeEditor?.document.uri.toString();
          const openUris = new Set(openEditors.map(e => e.uri?.toString()));

          const sortedFiles = [...files].sort((a, b) => {
            const aUri = a.toString();
            const bUri = b.toString();
            
            if (aUri === activeUriString && bUri !== activeUriString) { return -1; }
            if (aUri !== activeUriString && bUri === activeUriString) { return 1; }
            
            const aIsOpen = openUris.has(aUri);
            const bIsOpen = openUris.has(bUri);

            if (aIsOpen && !bIsOpen) { return -1; }
            if (!aIsOpen && bIsOpen) { return 1; }

            const aIsStaged = stagedUris.has(aUri);
            const bIsStaged = stagedUris.has(bUri);

            if (aIsStaged && !bIsStaged) { return -1; }
            if (!aIsStaged && bIsStaged) { return 1; }

            const aDeprioritized = isInDeprioritizedFolder(a.fsPath, deprioritizedFolders);
            const bDeprioritized = isInDeprioritizedFolder(b.fsPath, deprioritizedFolders);

            if (aDeprioritized && !bDeprioritized) { return 1; }
            if (!aDeprioritized && bDeprioritized) { return -1; }

            return 0;
          });

          textItems = await searchFileContents(value, sortedFiles, () => currentSearchId !== textSearchId);
        }

        if (currentSearchId === textSearchId && !isDisposed) {
          let finalItems = getBaseItemsWithSymbols();

          if (textItems.length > 0) {
            finalItems.push(...textItems);
          }

          if (finalItems.length === 0) {
            finalItems = [{ label: '$(warning) No results found', alwaysShow: true, type: 'action' }];
          }

          if (quickPick.value === value) {
            quickPick.items = finalItems;
          }
        }
      } catch (e) {
        console.error('Failed to fetch Deep Search results', e);
      } finally {
        if (currentSearchId === textSearchId && !isDisposed) {
          quickPick.busy = false;
        }
      }
    }, 300);
  };

  quickPick.onDidChangeValue(handleValueChange);

  // Process any text the user typed while we were awaiting cachedFiles
  handleValueChange(quickPick.value);

  quickPick.onDidAccept(() => {
    const selected = quickPick.selectedItems[0];
    if (selected) {
      if (selected.type === 'editor' || selected.type === 'file') {
        if (selected.uri) {
          vscode.workspace.openTextDocument(selected.uri).then(doc => {
            vscode.window.showTextDocument(doc);
          });
        }
      } else if (selected.type === 'directory') {
        if (selected.uri) {
          vscode.commands.executeCommand('revealInExplorer', selected.uri);
        }
      } else if (selected.type === 'symbol' && selected.symbol) {
        vscode.workspace.openTextDocument(selected.symbol.location.uri).then(doc => {
          vscode.window.showTextDocument(doc, {
            selection: selected.symbol!.location.range
          });
        });
      } else if (selected.type === 'text' && selected.uri) {
        vscode.workspace.openTextDocument(selected.uri).then(doc => {
          vscode.window.showTextDocument(doc).then(editor => {
            if (selected.lineNumber) {
              const pos = new vscode.Position(selected.lineNumber - 1, 0);
              editor.selection = new vscode.Selection(pos, pos);
              editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            }
          });
        });
      } else if (selected.type === 'action') {
        return;
      }
    }
    quickPick.hide();
  });
}

export function deactivate() { }

export async function searchFileContents(query: string, files: vscode.Uri[], isCancelled: () => boolean, maxResults = 50): Promise<SearchItem[]> {
  const results: SearchItem[] = [];
  const queryRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const batchSize = 20;

  const config = vscode.workspace.getConfiguration('doubleShiftSearch');
  const excludeExtensionsList = config.get<string[]>('excludeExtensions') || [
    '.zip', '.tar', '.gz', '.7z', '.rar', '.exe', '.dll', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.mp4', '.mp3',
    '.pdb', '.so', '.dylib', '.a', '.lib', '.o', '.obj', '.class', '.jar', '.pyc', '.nupkg', '.woff', '.woff2', '.ttf', '.otf', '.db', '.sqlite'
  ];
  const skipExtensions = new Set(excludeExtensionsList.map(ext => ext.toLowerCase()));

  for (let i = 0; i < files.length; i += batchSize) {
    if (isCancelled() || results.length >= maxResults) {
      break;
    }

    const batch = files.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(async (uri): Promise<SearchItem[]> => {
      try {
        if (isCancelled()) {
          return [];
        }
        if (uri.scheme !== 'file') {
          return [];
        }

        const ext = path.extname(uri.fsPath).toLowerCase();
        if (skipExtensions.has(ext)) {
          return [];
        }

        let content: string;
        const openDoc = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
        if (openDoc) {
          content = openDoc.getText();
        } else {
          const stat = await fs.stat(uri.fsPath);
          if (stat.size > 1024 * 1024) {
            return [];
          }

          let fd;
          try {
            fd = await fs.open(uri.fsPath, 'r');
            const buffer = Buffer.alloc(4096);
            const { bytesRead } = await fd.read(buffer, 0, 4096, 0);
            
            let isBinary = false;
            for (let j = 0; j < bytesRead; j++) {
              if (buffer[j] === 0x00) {
                isBinary = true;
                break;
              }
            }
            if (isBinary) {
              return [];
            }
          } catch (e) {
            // Ignore open/read errors and just skip file
            return [];
          } finally {
            if (fd) {
              await fd.close();
            }
          }

          content = await fs.readFile(uri.fsPath, 'utf8');
        }

        const fileResults: SearchItem[] = [];
        const match = queryRegex.exec(content);

        if (match) {
          const index = match.index;
          const startOfLine = content.lastIndexOf('\n', index) + 1;
          const rawEndOfLine = content.indexOf('\n', index);
          const endOfLine = rawEndOfLine === -1 ? content.length : rawEndOfLine;

          // Cap the snippet length, but center the window on the match itself so a hit
          // past offset 500 on a long line still shows up in the preview.
          const maxSnippetLength = 500;
          let sliceStart = startOfLine;
          let sliceEnd = endOfLine;
          if (sliceEnd - sliceStart > maxSnippetLength) {
            sliceStart = Math.max(startOfLine, index - Math.floor(maxSnippetLength / 2));
            sliceEnd = Math.min(endOfLine, sliceStart + maxSnippetLength);
          }

          const snippet = content.slice(sliceStart, sliceEnd);
          const matchOffset = index - sliceStart;
          const lineNumber = content.slice(0, index).split('\n').length;

          // Same centering applies to the shorter display window, so the match still
          // survives being cropped down to a description-sized preview.
          const maxDescriptionLength = 80;
          let description: string;
          if (snippet.length > maxDescriptionLength) {
            let descStart = Math.max(0, matchOffset - Math.floor(maxDescriptionLength / 2));
            const descEnd = Math.min(snippet.length, descStart + maxDescriptionLength);
            descStart = Math.max(0, descEnd - maxDescriptionLength);
            const prefix = descStart > 0 ? '...' : '';
            const suffix = descEnd < snippet.length ? '...' : '';
            description = `${prefix}${snippet.slice(descStart, descEnd).trim()}${suffix}`;
          } else {
            description = snippet.trim();
          }

          fileResults.push({
            label: `$(text-size) ${path.basename(uri.fsPath)}:${lineNumber}`,
            description: description,
            type: 'text',
            uri: uri,
            lineNumber: lineNumber,
            alwaysShow: true
          });
        }
        return fileResults;
      } catch (e) {
        return [];
      }
    }));

    for (const fileResults of batchResults) {
      for (const result of fileResults) {
        if (results.length < maxResults) {
          results.push(result);
        }
      }
    }

    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return results;
}
