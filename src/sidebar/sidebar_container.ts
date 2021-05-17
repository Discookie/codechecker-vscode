import { ExtensionContext } from 'vscode';
import { OverviewView, QuickMenuView } from './views';

export class SidebarContainer {
    static init(ctx: ExtensionContext): void {
        this._overviewView = new OverviewView();
        this._quickMenuView = new QuickMenuView();
    }

    protected static _overviewView: OverviewView;
    public static get overviewView(): OverviewView {
        return this._overviewView;
    }

    protected static _quickMenuView: QuickMenuView;
    public static get quickMenuView(): QuickMenuView {
        return this._quickMenuView;
    }
}