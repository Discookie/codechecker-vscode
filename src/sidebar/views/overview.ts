import { Command, ExtensionContext, TreeDataProvider, TreeItem, TreeView, window } from 'vscode';
import { CommandItem } from './items';

export class OverviewView implements TreeDataProvider<string> {
    protected tree?: TreeView<string>;
    protected itemsList: string[];
    protected items: {[id: string]: (() => string) | CommandItem};

    constructor() {
        // TODO: Export this into a better descriptor object
        this.items = {
            'bugs': () => 'Number of bugs: 10',
            'warnings': () => 'Number of warnings: 50',
            'lastRun': () => 'Last run on: 2021. 05. 03. 11:23',
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

        this.itemsList = [
            'bugs',
            'warnings',
            'lastRun',
            'separator',
            'rebuildFile',
            'toggleErrors',
        ];

        this.init();
    }

    protected init() {
        this.tree = window.createTreeView(
            'codechecker.views.overview',
            {
                treeDataProvider: this
            }
        );
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