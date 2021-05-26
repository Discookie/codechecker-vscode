import { ExtensionContext } from 'vscode';
import { CurrentFileView, OverviewView } from './views';
import { AllBugsView } from './views/all_bugs';

export class SidebarContainer {
    static init(ctx: ExtensionContext): void {
        this._overviewView = new OverviewView(ctx);
        this._currentFileView = new CurrentFileView(ctx);
        this._allBugsView = new AllBugsView(ctx);
    }

    protected static _overviewView: OverviewView;
    public static get overviewView(): OverviewView {
        return this._overviewView;
    }

    protected static _currentFileView: CurrentFileView;
    public static get currentFileView(): CurrentFileView {
        return this._currentFileView;
    }

    protected static _allBugsView: AllBugsView;
    public static get allBugsView(): AllBugsView {
        return this._allBugsView;
    }
}