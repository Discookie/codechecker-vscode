import { Command, commands, TreeDataProvider, TreeItem, TreeView, window } from 'vscode';
import { CommandItem } from './items';

export class QuickMenuView implements TreeDataProvider<string> {
    protected tree?: TreeView<string>;
    protected itemsList: string[];
    protected items: {[id: string]: CommandItem};

    constructor() {
        this.items = {
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
            'rebuildFile',
            'toggleErrors',
        ];

        this.init();
    }

    protected init() {
        this.tree = window.createTreeView(
            'codechecker.views.quickMenu',
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
        return this.items[item].getTreeItem();
    }
}