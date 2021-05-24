import { ExtensionContext } from 'vscode';
import { DiagnosticsApi } from './diagnostics';

export class ExtensionApi {
    static init(ctx: ExtensionContext): void {
        this._diagnostics = new DiagnosticsApi(ctx);
    }

    private static _diagnostics: DiagnosticsApi;
    public static get diagnostics() {
        return this._diagnostics;
    }
}