import { Command, ExtensionContext, TreeDataProvider, TreeItem, TreeView, window } from 'vscode';

export class OverviewView implements TreeDataProvider<string> {
    protected tree?: TreeView<string>;
    protected itemsList: string[];
    protected items: {[id: string]: () => string};

    constructor() {
        // TODO: Export this into a better descriptor object
        this.items = {
            'bugs': () => 'Number of bugs: 10',
            'warnings': () => 'Number of warnings: 50',
            'lastRun': () => 'Last run on: 2021. 05. 03. 11:23',
            'separator': () => '---',
        };

        this.itemsList = [
            'bugs',
            'warnings',
            'lastRun',
            'separator',
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
        let labelFunc = this.items[item];
        let node = new TreeItem(labelFunc());
        
        return node;
    }
}