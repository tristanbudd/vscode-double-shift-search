import * as assert from 'assert';
import * as vscode from 'vscode';

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
