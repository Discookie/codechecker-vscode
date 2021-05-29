import { Command, Event, EventEmitter, ExtensionContext, TreeDataProvider, TreeItem, TreeView, window } from 'vscode';
import { ExtensionApi } from '../../backend/api';
import { AnalyzeType, ExecutorApi } from '../../backend/runner';
import { AggregateData } from '../../backend/types';

export class OverviewItem {
    constructor(protected label: string, protected command: Command) {}

    getTreeItem(): TreeItem | Promise<TreeItem> {
        let node = new TreeItem(this.label);
        node.command = this.command;
        node.description = this.command.tooltip;
        
        return node;
    }
}

export class OverviewView implements TreeDataProvider<string> {
    protected tree?: TreeView<string>;

    protected regularItemsList = [
        'bugs',
        'lastRun',
        'buildLength',
        'analyzers',
        'separator',
        'reloadMetadata',
        'rebuildFile',
        'rebuildProject',
    ];
    protected notFoundItemsList = [
        'notfound',
        'notfound2'
    ];
    protected itemsList: string[];

    protected items: {[id: string]: (() => string) | OverviewItem};

    constructor(ctx: ExtensionContext) {
        ctx.subscriptions.push(this._onDidChangeTreeData = new EventEmitter());
        ExtensionApi.aggregate.aggregateUpdated(this.updateStats, this, ctx.subscriptions);

        this.items = {
            'loading': () => 'Loading overview, please wait...'
        };
        this.itemsList = ['loading'];

        ctx.subscriptions.push(this.tree = window.createTreeView(
            'codechecker.views.overview',
            {
                treeDataProvider: this
            }
        ));

        this.init();
    }

    protected init() {
        // TODO: Export this into a better descriptor object
        this.items = {
            'loading': () => 'Loading overview, please wait...',
            'notfound': () => 'CodeChecker run not found.',
            'notfound2': () => 'Run CodeChecker, or set the output folder to get started',
            'bugs': () => 'Number of bugs: ' + ExtensionApi.aggregate.aggregateData!.entries.length,
            'lastRun': () => 'Last run on: ' + ExtensionApi.aggregate.aggregateData!.timestamps.begin.toLocaleString(),
            'buildLength': () => {
                const interval = (ExtensionApi.aggregate.aggregateData!.timestamps.end.valueOf() - ExtensionApi.aggregate.aggregateData!.timestamps.begin.valueOf()) / 1000;

                const hours = Math.floor(interval/3600) % 60;
                const minutes = Math.floor(interval/60) % 60;
                const seconds = Math.floor(interval) % 60;
                const ms = Math.floor(interval * 1000) % 1000;

                if (hours > 0 || minutes > 0) {
                    return 'Last run\'s length: ' + 
                        (hours > 0 ? (hours + ':' + minutes.toPrecision(2)) : minutes) + ':' +
                        seconds.toPrecision(2) + ' s';
                } else {
                    return 'Last run\'s length: ' + 
                        seconds + '.' + ms + ' s';
                }
            },
            'analyzers': () => 'Used analyzers: ' + ExtensionApi.aggregate.aggregateData!.analyzers.join(', '),
            'separator': () => '---',
            'reloadMetadata': new OverviewItem('Reload CodeChecker metadata', {
                title: 'reloadMetadata', 
                command: 'codechecker.processor.reloadMetadata',
                arguments: []
            }),
            'rebuildFile': new OverviewItem('Re-analyze current file', {
                title: 'rebuildCurrentFile', 
                command: 'workbench.action.tasks.runTask',
                arguments: [{type: ExecutorApi.codeCheckerType, analyzeType: AnalyzeType.analyzeFile}]
            }),
            'rebuildProject': new OverviewItem('Re-analyze entire project', {
                title: 'rebuildCurrentFile', 
                command: 'workbench.action.tasks.runTask',
                arguments: [{type: ExecutorApi.codeCheckerType, analyzeType: AnalyzeType.analyzeProject}]
            }),
        };
    }

    updateStats(event?: AggregateData) {
        if (ExtensionApi.aggregate.aggregateData !== undefined) {
            this.itemsList = this.regularItemsList;
        } else {
            this.itemsList = this.notFoundItemsList;
        }
        
        this._onDidChangeTreeData.fire();
    }

    private _onDidChangeTreeData: EventEmitter<void>;
    public get onDidChangeTreeData(): Event<void> {
        return this._onDidChangeTreeData.event;
    }

    getChildren(element?: string): string[] {
        if (element !== undefined) {
            return [];
        }

        return this.itemsList;
    }

    getTreeItem(item: string): TreeItem | Promise<TreeItem> {
        let displayedItem = this.items[item];
        let node = displayedItem instanceof OverviewItem
            ? displayedItem.getTreeItem()
            : new TreeItem(displayedItem());
        
        return node;
    }
}