import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { fuzzyMatch, searchFileContents } from '../../extension';

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

suite('Configuration Edge Cases', () => {
  test('Default configuration values are correct', () => {
    const config = vscode.workspace.getConfiguration('doubleShiftSearch');
    assert.strictEqual(config.get<boolean>('useSelectionAsQuery'), false);

    const excludeExtensions = config.get<string[]>('excludeExtensions');
    assert.ok(excludeExtensions?.includes('.zip'));
    assert.ok(excludeExtensions?.includes('.exe'));
    assert.ok(excludeExtensions?.includes('.png'));
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
