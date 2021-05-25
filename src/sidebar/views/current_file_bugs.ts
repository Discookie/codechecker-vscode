import { Command, Event, EventEmitter, ExtensionContext, TextEditor, TreeDataProvider, TreeItem, TreeItemCollapsibleState, TreeView, Uri, window } from "vscode";
import { ExtensionApi } from "../../backend/api";
import { AnalysisPathEvent, AnalysisPathKind, DiagnosticEntry } from "../../backend/types";

export interface CurrentFileMetadata {
    bugIndex?: number;
    reprStep?: number;
    description?: string;
    command?: Command;
}

export class CurrentFileView implements TreeDataProvider<CurrentFileMetadata> {
    protected currentFile?: Uri;
    protected currentBugList?: DiagnosticEntry[];
    
    protected tree?: TreeView<CurrentFileMetadata>;

    constructor(ctx: ExtensionContext) {
        ctx.subscriptions.push(this._onDidChangeTreeData = new EventEmitter());
        ExtensionApi.diagnostics.diagnosticsUpdated(this.onDiagnosticsUpdated, this, ctx.subscriptions);

        this.init();
    }

    protected init() {
        this.currentFile = window.activeTextEditor?.document.uri;
        
        this.tree = window.createTreeView(
            'codechecker.views.currentFile',
            {
                treeDataProvider: this
            }
        );
    }

    private _onDidChangeTreeData: EventEmitter<void>;
    public get onDidChangeTreeData(): Event<void> {
        return this._onDidChangeTreeData.event;
    }

    // An editor change always triggers this change as well.
    onDiagnosticsUpdated() {
        this.currentFile = ExtensionApi.diagnostics.stickyFile ?? this.currentFile;
        this.refreshBugList();
    }

    refreshBugList() {
        // Clear tree on file close
        if (this.currentFile === undefined) {
            this.currentBugList = [];
            
            this._onDidChangeTreeData.fire();
            return;
        }

        this.currentBugList = ExtensionApi.diagnostics.getFileDiagnostics(this.currentFile);

        this._onDidChangeTreeData.fire();
    }

    getChildren(element?: CurrentFileMetadata): CurrentFileMetadata[] | undefined {
        const makeArray = <T>(length: number, func: (idx: number) => T): T[] => {
            return Array.from(Array(length), (_, idx) => func(idx));
        };

        // Special case: No bugs in current file
        if ((this.currentBugList?.length ?? 0) === 0) {
            if (element === undefined) {
                return [{
                    description: 'No bugs found in file'
                }];
            }

            return [];
        }

        // First level, bug list
        if (element?.bugIndex === undefined) {
            const commands: CurrentFileMetadata[] = [
                { description: this.currentBugList!.length + ' bugs found in file' },
                { description: '---' }
            ];

            const items = makeArray(this.currentBugList!.length, (idx): CurrentFileMetadata => { 
                return {
                    bugIndex: idx
                };
            });

            return commands.concat(items);
        }

        // Commands have no children
        if (element.description !== undefined || element.command !== undefined) {
            return [];
        }

        // Second level, reproduction steps
        if (element.reprStep === undefined) {
            const reprStepsText = this.currentBugList![element.bugIndex] !== ExtensionApi.diagnostics.activeReprPath
                ? 'Show reproduction steps'
                : 'Hide reproduction steps';

            const commands: CurrentFileMetadata[] = [
                { ...element, description: 'Jump to bug', command: { title: 'jumpToBug', command: 'codechecker.editor.jumpToBug', arguments: [this.currentFile, element.bugIndex, true] } },
                { ...element, description: reprStepsText, command: { title: 'toggleSteps', command: 'codechecker.editor.toggleSteps', arguments: [this.currentFile, element.bugIndex] } },
                { ...element, description: '---' }
            ];

            const items = makeArray(
                this.currentBugList![element.bugIndex].path
                    .filter(pathElem => pathElem.kind === AnalysisPathKind.Event).length,
                (idx) => {
                    return {
                        ...element,
                        reprStep: idx
                    };
                }
            );

            return commands.concat(items);
        }

        // Third level, children of reproduction steps
        return [];
    }

    getTreeItem(element: CurrentFileMetadata): TreeItem | Thenable<TreeItem> {

        // Command nodes
        if (element.command !== undefined) {
            const item = new TreeItem(element.description ?? element.command.title);
            item.command = element.command;
            return item;
        }

        // Description nodes, also handles special case with no bugs
        if (element.description !== undefined) {
            return new TreeItem(element.description);
        }

        // Invalid nodes, detect early
        if (element.bugIndex === undefined) {
            console.error('Tried to add invalid node to CurrentFileBugs tree:', element);
            return new TreeItem('Internal error - invalid node');
        }

        // First level, bug list
        if (element.reprStep === undefined) {
            const currentBug = this.currentBugList![element.bugIndex];

            const item = new TreeItem(currentBug.description);
            item.collapsibleState = TreeItemCollapsibleState.Collapsed;

            return item;
        }

        // Second level, repr steps
        const currentBug = this.currentBugList![element.bugIndex];
        const currentStep = currentBug.path
            .filter(pathElem => pathElem.kind === AnalysisPathKind.Event)[element.reprStep!] as AnalysisPathEvent;

        const item = new TreeItem(currentStep.message);
        item.tooltip = currentStep.extended_message;
        item.command = {
            title: 'jumpToStep',
            command: 'codechecker.editor.jumpToStep',
            arguments: [this.currentFile, element.bugIndex, element.reprStep, true]
        };

        return item;
    }
}