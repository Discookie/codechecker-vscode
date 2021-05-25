import { ExtensionContext } from 'vscode';
import { AggregateDataApi } from './aggregate';
import { DiagnosticsApi } from './diagnostics';
import { MetadataApi } from './metadata';

export class ExtensionApi {
    static init(ctx: ExtensionContext): void {
        this._metadata = new MetadataApi(ctx);
        this._aggregate = new AggregateDataApi(ctx);
        this._diagnostics = new DiagnosticsApi(ctx);
    }

    private static _metadata: MetadataApi;
    public static get metadata() {
        return this._metadata;
    }

    private static _aggregate: AggregateDataApi;
    public static get aggregate() {
        return this._aggregate;
    }

    private static _diagnostics: DiagnosticsApi;
    public static get diagnostics() {
        return this._diagnostics;
    }
}