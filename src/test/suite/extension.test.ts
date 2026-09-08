import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { fuzzyMatch, fuzzyScore, searchFileContents, getStagedFileUris, getDeprioritizedFolderSet, isInDeprioritizedFolder } from '../../extension';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Command is registered', async () => {
    const ext = vscode.extensions.getExtension('tristanbudd.double-shift-search');
    await ext?.activate();

    const commands = await vscode.commands.getCommands(true);
    const hasCommand = commands.includes('doubleShiftSearch.search');
    assert.strictEqual(hasCommand, true);
  });
});

suite('Fuzzy Match Edge Cases', () => {
  test('Empty pattern matches everything', () => {
    assert.strictEqual(fuzzyMatch('', 'any text'), true);
    assert.strictEqual(fuzzyMatch('   ', 'any text'), true);
  });

  test('Case insensitivity', () => {
    assert.strictEqual(fuzzyMatch('FOO', 'foo bar'), true);
    assert.strictEqual(fuzzyMatch('foo', 'FOO BAR'), true);
  });

  test('Multi-term matching', () => {
    assert.strictEqual(fuzzyMatch('foo bar', 'this is a foo and a bar'), true);
    assert.strictEqual(fuzzyMatch('bar foo', 'this is a foo and a bar'), true);
    assert.strictEqual(fuzzyMatch('foo baz', 'this is a foo and a bar'), false);
  });

  test('Partial term matching', () => {
    assert.strictEqual(fuzzyMatch('exten', 'extension.ts'), true);
    assert.strictEqual(fuzzyMatch('pack js', 'package.json'), true);
  });
});

suite('Acronym / Hump Fuzzy Matching', () => {
  test('Acronym matches consume hump-boundary characters in order', () => {
    assert.strictEqual(fuzzyMatch('gua', 'getUserAccount.ts'), true);
    assert.strictEqual(fuzzyMatch('GUA', 'getUserAccount.ts'), true); // Case-insensitive
    assert.notStrictEqual(fuzzyScore('gua', 'getUserAccount.ts'), null);
  });

  test('Acronym match fails when characters are not on hump boundaries in order', () => {
    // 'e', 't', 'a' exist in the text but not as hump-boundary characters in this order.
    assert.strictEqual(fuzzyMatch('eta', 'getUserAccount.ts'), false);
    assert.strictEqual(fuzzyScore('eta', 'getUserAccount.ts'), null);
  });

  test('Acronym match fails when pattern exceeds available hump characters', () => {
    assert.strictEqual(fuzzyMatch('guax', 'getUserAccount.ts'), false);
  });

  test('Exact substring match always outranks acronym match', () => {
    const substringScore = fuzzyScore('user', 'getUserAccount.ts');
    const acronymScore = fuzzyScore('gua', 'getUserAccount.ts');
    assert.ok(substringScore !== null && acronymScore !== null);
    assert.ok((substringScore as number) > (acronymScore as number));
  });

  test('Shorter text wins the tiebreak on equal hump-match strength', () => {
    // Both "getUserAccount.ts" and "globalUtilAdapter.ts" spell "gua" via their first
    // three humps, so the tier/compactness bonuses tie; the shorter text wins the tiebreak.
    const a = fuzzyScore('gua', 'getUserAccount.ts');
    const b = fuzzyScore('gua', 'globalUtilAdapter.ts');
    assert.ok(a !== null && b !== null);
    assert.ok((a as number) > (b as number));
  });

  test('fuzzyScore of an empty/whitespace pattern is 0, not null', () => {
    assert.strictEqual(fuzzyScore('', 'anything'), 0);
    assert.strictEqual(fuzzyScore('   ', 'anything'), 0);
  });
});

suite('Configuration Edge Cases', () => {
  test('Default configuration values are correct', () => {
    const config = vscode.workspace.getConfiguration('doubleShiftSearch');
    assert.strictEqual(config.get<boolean>('useSelectionAsQuery'), false);

    const excludeExtensions = config.get<string[]>('excludeExtensions');
    assert.ok(excludeExtensions?.includes('.zip'));
    assert.ok(excludeExtensions?.includes('.exe'));
    assert.ok(excludeExtensions?.includes('.png'));

    const deprioritizedFolders = config.get<string[]>('deprioritizedFolders');
    assert.ok(deprioritizedFolders?.includes('vendor'));
    assert.ok(deprioritizedFolders?.includes('Pods'));
    assert.ok(deprioritizedFolders?.includes('site-packages'));
  });
});

suite('Staged File Priority Edge Cases', () => {
  test('getStagedFileUris resolves to a Set even without a git repository', async () => {
    const staged = await getStagedFileUris();
    assert.ok(staged instanceof Set);
  });
});

suite('Deprioritized Folder Edge Cases', () => {
  test('getDeprioritizedFolderSet reads the configured defaults', () => {
    const folders = getDeprioritizedFolderSet();
    assert.ok(folders.has('vendor'));
    assert.ok(folders.has('pods')); // Comparisons are case-insensitive
  });

  test('isInDeprioritizedFolder matches any path segment', () => {
    const folders = new Set(['vendor', 'node_modules']);
    assert.strictEqual(isInDeprioritizedFolder('/repo/vendor/lib/pkg.go', folders), true);
    assert.strictEqual(isInDeprioritizedFolder('C:\\repo\\node_modules\\pkg\\index.js', folders), true);
    assert.strictEqual(isInDeprioritizedFolder('/repo/src/pkg.go', folders), false);
  });

  test('isInDeprioritizedFolder is case-insensitive and handles an empty set', () => {
    const folders = new Set(['pods']);
    assert.strictEqual(isInDeprioritizedFolder('/repo/Pods/Alamofire/file.swift', folders), true);
    assert.strictEqual(isInDeprioritizedFolder('/repo/src/file.swift', new Set()), false);
  });
});

suite('File Search Edge Cases', () => {
  test('searchFileContents correctly finds text in files', async () => {
    // Test runs in `out/test/suite/`
    const pkgJsonUri = vscode.Uri.file(path.join(__dirname, '../../../package.json'));

    // Find text that exists
    const results = await searchFileContents('double-shift-search', [pkgJsonUri], () => false);
    assert.ok(results.length > 0, 'Should find at least one match for the extension name');
    assert.strictEqual(results[0].type, 'text');
  });

  test('searchFileContents respects cancellation token', async () => {
    const pkgJsonUri = vscode.Uri.file(path.join(__dirname, '../../../package.json'));

    // Cancel immediately
    let calledCancel = false;
    const cancelledResults = await searchFileContents('double', [pkgJsonUri], () => {
      calledCancel = true;
      return true; // Simulate cancelled
    });

    assert.strictEqual(cancelledResults.length, 0, 'Should return empty array when cancelled');
    assert.strictEqual(calledCancel, true, 'Cancellation check should be called');
  });

  test('searchFileContents respects maxResults limit', async () => {
    const pkgJsonUri = vscode.Uri.file(path.join(__dirname, '../../../package.json'));

    // Find a common character like "e" with a max limit of 2
    const results = await searchFileContents('e', [pkgJsonUri], () => false, 2);
    assert.ok(results.length <= 2, 'Should not return more results than maxResults');
  });
});
