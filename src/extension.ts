// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ExtensionApi } from './backend/api';
import { Editor } from './editor/editor';
import { SidebarContainer } from './sidebar';

export function activate(context: vscode.ExtensionContext) {
	// Backend must be initialized before the frontend
	ExtensionApi.init(context);
	Editor.init(context);
	SidebarContainer.init(context);

	console.log('Congratulations, your extension "codechecker-vscode" is now active!');

	let disposable = vscode.commands.registerCommand('codechecker-vscode.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from CodeChecker for VSCode!');
	});

	context.subscriptions.push(disposable);
}


// export function activate(ctx: vscode.ExtensionContext) {
	// SidebarContainer.init(ctx);
	// 
	// vscode.window.showInformationMessage('Activate run!');
// }

// this method is called when your extension is deactivated
export function deactivate() {}
