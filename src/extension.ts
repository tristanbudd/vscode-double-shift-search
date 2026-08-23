import * as vscode from 'vscode';
import * as path from 'path';

import * as fs from 'fs/promises';

interface SearchItem extends vscode.QuickPickItem {
  type: 'editor' | 'file' | 'symbol' | 'action' | 'text';
  uri?: vscode.Uri;
  symbol?: vscode.SymbolInformation;
  action?: 'findInFiles' | 'commands';
  lineNumber?: number;
}

let cachedFilesPromise: Thenable<vscode.Uri[]> | undefined;

export function fuzzyMatch(pattern: string, text: string): boolean {
  if (!pattern) {
    return true;
  }
  pattern = pattern.toLowerCase();
  text = text.toLowerCase();

  const terms = pattern.split(' ').filter(t => t.length > 0);
  return terms.every(term => text.includes(term));
}


export function activate(context: vscode.ExtensionContext) {
  refreshFileCache();

  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  watcher.onDidCreate(() => refreshFileCache());
  watcher.onDidDelete(() => refreshFileCache());
  context.subscriptions.push(watcher);

  let disposable = vscode.commands.registerCommand('doubleShiftSearch.search', showSearchEverywhere);
  context.subscriptions.push(disposable);
}

function refreshFileCache() {
  cachedFilesPromise = vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/out/**,**/dist/**,**/build/**}');
}

async function showSearchEverywhere() {
  const quickPick = vscode.window.createQuickPick<SearchItem>();
  quickPick.placeholder = 'Search Everywhere (Files, Symbols, Open Editors)';
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;

  let isDisposed = false;

  const config = vscode.workspace.getConfiguration('doubleShiftSearch');
  if (config.get<boolean>('useSelectionAsQuery')) {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && !activeEditor.selection.isEmpty) {
      quickPick.value = activeEditor.document.getText(activeEditor.selection);
    }
  }

  quickPick.busy = true;
  quickPick.show();

  const cachedFiles = await (cachedFilesPromise || Promise.resolve([]));
  quickPick.busy = false;

  const openEditors: SearchItem[] = [];
  for (const tabGroup of vscode.window.tabGroups.all) {
    for (const tab of tabGroup.tabs) {
      if (tab.input instanceof vscode.TabInputText) {
        const uri = tab.input.uri;
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

  const openEditorUris = new Set(openEditors.map(e => e.uri?.toString()));
  const fileItems: SearchItem[] = cachedFiles
    .filter(uri => !openEditorUris.has(uri.toString()))
    .map(uri => ({
      label: `$(file) ${path.basename(uri.fsPath)}`,
      description: vscode.workspace.asRelativePath(uri),
      type: 'file',
      uri: uri,
      alwaysShow: true
    }));

  const baseItems: SearchItem[] = [];
  if (openEditors.length > 0) {
    baseItems.push(...openEditors);
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

    const filteredEditors = openEditors.filter(item =>
      fuzzyMatch(value, item.label.replace(/\$\([^)]+\)/g, '').trim()) ||
      fuzzyMatch(value, item.description || '')
    );
    const filteredFiles = fileItems.filter(item =>
      fuzzyMatch(value, item.label.replace(/\$\([^)]+\)/g, '').trim()) ||
      fuzzyMatch(value, item.description || '')
    );

    let currentItems: SearchItem[] = [];
    if (filteredEditors.length > 0) {
      currentItems.push(...filteredEditors);
    }
    if (filteredFiles.length > 0) {
      currentItems.push(...filteredFiles.slice(0, 100));
    }

    if (currentItems.length === 0 && !value) {
      currentItems = [...baseItems].slice(0, 100);
    } else if (currentItems.length === 0) {
      currentItems = [{ label: '$(sync~spin) Searching...', alwaysShow: true, type: 'action' }];
    }

    quickPick.items = currentItems;

    if (!value) {
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
            
            return 0;
          });

          textItems = await searchFileContents(value, sortedFiles, () => currentSearchId !== textSearchId);
        }

        if (currentSearchId === textSearchId && !isDisposed) {
          let finalItems = currentItems.filter(item => 
              item.label !== '$(warning) No results found' && 
              item.label !== '$(sync~spin) Searching...'
          );

          if (symbolItems.length > 0) {
            finalItems.push(...symbolItems);
          }
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

  quickPick.onDidHide(() => {
    isDisposed = true;
    quickPick.dispose();
  });
}

export function deactivate() { }

export async function searchFileContents(query: string, files: vscode.Uri[], isCancelled: () => boolean, maxResults = 50): Promise<SearchItem[]> {
  const results: SearchItem[] = [];
  const queryRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const batchSize = 20;

  const config = vscode.workspace.getConfiguration('doubleShiftSearch');
  const excludeExtensionsList = config.get<string[]>('excludeExtensions') || [
    '.zip', '.tar', '.gz', '.7z', '.rar', '.exe', '.dll', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.mp4', '.mp3'
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
          content = await fs.readFile(uri.fsPath, 'utf8');
        }

        const fileResults: SearchItem[] = [];
        const match = queryRegex.exec(content);

        if (match) {
          const index = match.index;
          const startOfLine = content.lastIndexOf('\n', index) + 1;
          let endOfLine = content.indexOf('\n', index);
          if (endOfLine === -1 || endOfLine - startOfLine > 500) {
            endOfLine = Math.min(content.length, startOfLine + 500);
          }

          const lineText = content.slice(startOfLine, endOfLine).trim();
          const lineNumber = content.slice(0, index).split('\n').length;

          fileResults.push({
            label: `$(text-size) ${path.basename(uri.fsPath)}:${lineNumber}`,
            description: lineText.length > 80 ? lineText.substring(0, 80) + '...' : lineText,
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
