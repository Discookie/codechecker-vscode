import { ExtensionContext } from 'vscode';
import { CurrentFileView, OverviewView } from './views';

export class SidebarContainer {
    static init(ctx: ExtensionContext): void {
        this._overviewView = new OverviewView();
        this._currentFileView = new CurrentFileView(ctx);
    }

    protected static _overviewView: OverviewView;
    public static get overviewView(): OverviewView {
        return this._overviewView;
    }

    protected static _currentFileView: CurrentFileView;
    public static get currentFileView(): CurrentFileView {
        return this._currentFileView;
    }
}