import { Command, Event, EventEmitter, ExtensionContext, TreeDataProvider, TreeItem, TreeView, window } from 'vscode';
import { ExtensionApi } from '../../backend/api';
import { AggregateData } from '../../backend/types';
import { CommandItem } from './items';

export class OverviewView implements TreeDataProvider<string> {
    protected tree?: TreeView<string>;

    protected regularItemsList = [
        'bugs',
        'lastRun',
        'buildLength',
        'analyzers',
        'separator',
        'rebuildFile',
        'toggleErrors'
    ];
    protected notFoundItemsList = [
        'notfound',
        'notfound2'
    ];
    protected itemsList: string[];

    protected items: {[id: string]: (() => string) | CommandItem};

    constructor(ctx: ExtensionContext) {
        ctx.subscriptions.push(this._onDidChangeTreeData = new EventEmitter());
        ExtensionApi.aggregate.aggregateUpdated(this.updateStats, this, ctx.subscriptions);

        this.items = {};
        this.itemsList = [];

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
                    return 'Build length: ' + 
                        (hours > 0 ? (hours + ':') : '') +
                        minutes + ':' + seconds + ' s';
                } else {
                    return 'Build length: ' + 
                        seconds + '.' + ms + ' s';
                }
            },
            'analyzers': () => 'Used analyzers: ' + ExtensionApi.aggregate.aggregateData!.analyzers.join(', '),
            'separator': () => '---',
            'rebuildFile': new CommandItem('Rebuild current file', {
                title: 'rebuildCurrentFile', 
                command: 'codechecker-vscode.build.rebuildCurrentFile'
            }),
            'toggleErrors': new CommandItem('Toggle displaying errors in code', {
                title: 'toggleErrors', 
                command: 'codechecker-vscode.diagnostics.toggleErrors'
            }),
        };
        
        this.itemsList = ['loading'];

        this.tree = window.createTreeView(
            'codechecker.views.overview',
            {
                treeDataProvider: this
            }
        );
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
        let node = displayedItem instanceof CommandItem
            ? displayedItem.getTreeItem()
            : new TreeItem(displayedItem());
        
        return node;
    }
}