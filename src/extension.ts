import * as vscode from 'vscode';
import { ExtensionApi } from './backend/api';
import { AggregateDataApi, DiagnosticsApi, MetadataApi } from './backend/processor';
import { ExecutorApi } from './backend/runner';
import { DiagnosticRenderer, NavigationHandler } from './editor';
import { Editor } from './editor/editor';
import { SidebarContainer } from './sidebar';
import { CurrentFileView, OverviewView } from './sidebar/views';
import { AllBugsView } from './sidebar/views/all_bugs';

/**
 *  Since the tests do not have access to static objects, return all possible APIs for testing
 */
export interface ActivateType {
	readonly extensionApi: {
		readonly executor: ExecutorApi,
		readonly metadata: MetadataApi,
		readonly aggregate: AggregateDataApi,
		readonly diagnostics: DiagnosticsApi
	},
	readonly editor: {
		readonly diagnosticRenderer: DiagnosticRenderer,
		readonly navigationHandler: NavigationHandler
	},
	readonly sidebar: {
		readonly overviewView: OverviewView,
		readonly currentFileView: CurrentFileView,
		readonly allBugsView: AllBugsView
	}
};

/**
 *  Since the tests do not have access to static objects, return all possible APIs for testing
 */
export function activate(context: vscode.ExtensionContext): ActivateType {
	// Backend must be initialized before the frontend
	ExtensionApi.init(context);
	Editor.init(context);
	SidebarContainer.init(context);

	console.log('"codechecker-vscode" activated');

	return {
		extensionApi: {
			executor: ExtensionApi.executor,
			metadata: ExtensionApi.metadata,
			aggregate: ExtensionApi.aggregate,
			diagnostics: ExtensionApi.diagnostics
		},
		editor: {
			diagnosticRenderer: Editor.diagnosticRenderer,
			navigationHandler: Editor.navigationHandler
		},
		sidebar: {
			overviewView: SidebarContainer.overviewView,
			currentFileView: SidebarContainer.currentFileView,
			allBugsView: SidebarContainer.allBugsView
		}
	};
}

export function deactivate() {}
