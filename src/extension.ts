import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('doubleShiftSearch.search', () => {
    // Resolve dynamic target command from user configuration
    const config = vscode.workspace.getConfiguration('doubleShiftSearch');
    const targetCommand = config.get<string>('targetCommand') || 'workbench.action.quickOpen';
    
    vscode.commands.executeCommand(targetCommand);
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
