import { Command, TreeItem } from "vscode";

export class CommandItem {
    constructor(protected label: string, protected command: Command) {}

    getTreeItem(): TreeItem | Promise<TreeItem> {
        let node = new TreeItem(this.label);
        node.command = this.command;
        node.description = this.command.tooltip;
        
        return node;
    }
}