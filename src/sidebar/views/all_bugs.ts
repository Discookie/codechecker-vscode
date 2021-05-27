import { TrieMap } from "mnemonist";
import { Command, ConfigurationChangeEvent, Event, EventEmitter, ExtensionContext, TreeDataProvider, TreeItem, TreeItemCollapsibleState, TreeView, window, workspace } from "vscode";
import { ExtensionApi } from "../../backend/api";
import { AggregateEntry } from "../../backend/types";

export interface AllBugsMetadata {
    identifier?: string,
    bugIndex?: number,
    description?: string,
    command?: Command,
}

// Keep in sync with package.json
export enum SortType {
    filename = 'filename',
    reprPath = 'reprPath',
    analyzer = 'analyzer',
}

export class AllBugsView implements TreeDataProvider<AllBugsMetadata> {
    protected currentSort = SortType.filename;
    protected keyFunctions = {
        filename: (entry: AggregateEntry) => entry.location.file,
        reprPath: (entry: AggregateEntry) => entry.path_length.toString(),
        analyzer: (entry: AggregateEntry) => entry.analyzer_name,
    };

    protected sortedBugList = new TrieMap<string, [number, AggregateEntry][]>();

    protected tree?: TreeView<AllBugsMetadata>;

    constructor(ctx: ExtensionContext) {
        ctx.subscriptions.push(this._onDidChangeTreeData = new EventEmitter());
        ExtensionApi.aggregate.aggregateUpdated(this.onAggregateUpdated, this, ctx.subscriptions);
        workspace.onDidChangeConfiguration(this.onConfigChanged, this, ctx.subscriptions);
        
        ctx.subscriptions.push(this.tree = window.createTreeView(
            'codechecker.views.allBugs',
            {
                treeDataProvider: this
            }
        ));

        this.init();
    }

    protected init() {
        this.currentSort = workspace.getConfiguration('codechecker.sidebar').get<string>('defaultSort') as SortType;
    }

    private _onDidChangeTreeData: EventEmitter<void>;
    public get onDidChangeTreeData(): Event<void> {
        return this._onDidChangeTreeData.event;
    }

    onConfigChanged(event: ConfigurationChangeEvent) {
        if (event.affectsConfiguration('codechecker.sidebar')) {
            this.currentSort = workspace.getConfiguration('codechecker.sidebar').get<string>('defaultSort') as SortType;
        }
        this.refreshBugList();
    }

    // Any update to the bugs will trigger this as well.
    onAggregateUpdated() {
        this.refreshBugList();
    }

    refreshBugList() {
        const bugList = ExtensionApi.aggregate.aggregateData?.entries;
        this.sortedBugList = new TrieMap<string, [number, AggregateEntry][]>();

        if (bugList === undefined) {
            this._onDidChangeTreeData.fire();
            return;
        }

        const keyFunction = this.keyFunctions[this.currentSort];

        for (const entry of bugList.entries()) {
            const [idx, bug] = entry;
            const key = keyFunction(bug);

            const values = this.sortedBugList.get(key) ?? [];
            values.push(entry);
            this.sortedBugList.set(key, values);
        }

        this._onDidChangeTreeData.fire();
    }

    getChildren(element?: AllBugsMetadata): AllBugsMetadata[] | undefined {
        const makeArray = <T>(length: number, func: (idx: number) => T): T[] => {
            return Array.from(Array(length), (_, idx) => func(idx));
        };

        const bugList = ExtensionApi.aggregate.aggregateData?.entries;

        // Special case: No bugs in current file
        if ((bugList?.length ?? 0) === 0) {
            if (element === undefined) {
                return [{
                    description: 'No bugs found in project'
                }];
            }

            return [];
        }

        // First level, file list
        if (element?.identifier === undefined) {
            const commands: AllBugsMetadata[] = [
                { description: bugList!.length + ' bugs found in project' },
                { description: 'Currently sorted by ' + this.currentSort },
                { description: '---' }
            ];

            const items = [...this.sortedBugList.keys()].sort().map((idx: string) => { 
                return {
                    identifier: idx
                };
            });

            return commands.concat(items);
        }

        // Commands have no children
        if (element.description !== undefined || element.command !== undefined) {
            return [];
        }

        // Second level, list of bugs in file
        if (element.bugIndex === undefined) {
            const bugs = this.sortedBugList.get(element.identifier) ?? [];

            const commands: AllBugsMetadata[] = [
                { ...element, description: bugs.length + ' bugs in category'},
                { ...element, description: '---' }
            ];

            const limit = 100;

            if (bugs.length > limit) {
                commands.splice(1, 0, {...element, description: 'Showing the first 100'});
            }

            const items: AllBugsMetadata[]  = makeArray(
                Math.min(bugs.length, limit),
                (idx) => {
                    return {
                        ...element,
                        bugIndex: idx,
                        description: bugs[idx][1].description,
                        command: {
                            title: 'jumpToBug',
                            command: 'codechecker.editor.jumpToBug',
                            arguments: [bugs[idx][1].location.source_file, bugs[idx][0], true, true]
                        }
                    };
                }
            );

            return commands.concat(items);
        }

        // Third level, children of bugs
        return [];
    }

    getTreeItem(element: AllBugsMetadata): TreeItem | Thenable<TreeItem> {

        // Command nodes - also handles second level bug nodes
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
        if (element.identifier === undefined) {
            console.error('Tried to add invalid node to CurrentFileBugs tree:', element);
            return new TreeItem('Internal error - invalid node');
        }

        // First level, file list
        const workspaceFolder = workspace.workspaceFolders![0].uri.fsPath;
        
        const item = new TreeItem(element.identifier.replace(workspaceFolder, '.'));
        item.collapsibleState = TreeItemCollapsibleState.Collapsed;

        return item;
    }
}