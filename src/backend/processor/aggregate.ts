import { Event, EventEmitter, ExtensionContext, window } from "vscode";
import { parseDiagnostics } from "../parser";
import { AggregateData, AggregateEntry, AnalysisPathKind, CheckerMetadata } from "../types";
import { ExtensionApi } from "../api";

export class AggregateDataApi {
    constructor(ctx: ExtensionContext) {
        ctx.subscriptions.push(this._aggregateUpdated = new EventEmitter());
        ExtensionApi.metadata.metadataUpdated(this.metadataUpdated, this, ctx.subscriptions);

        this.init();
    }

    protected init() {

    }

    private _aggregateData?: AggregateData;
    public get aggregateData(): AggregateData | undefined {
        return this._aggregateData;
    }

    private _aggregateUpdated: EventEmitter<AggregateData | undefined>;
    public get aggregateUpdated(): Event<AggregateData | undefined> {
        return this._aggregateUpdated.event;
    }

    async reloadAggregateData() {
        if (ExtensionApi.metadata.metadata === undefined) {
            this._aggregateData = undefined;
            this._aggregateUpdated.fire(this._aggregateData);
            return;
        }

        const metadata = ExtensionApi.metadata.sourceFiles;

        const entries = [];

        let errorFlag = false;

        for (const [sourceFile, plistFiles] of ExtensionApi.metadata.sourceFiles.entries()) {
            for (const plistFile of plistFiles) {
                try {
                    const diagnosticFile = await parseDiagnostics(plistFile);

                    for (const [idx, diagnostic] of diagnosticFile.diagnostics.entries()) {
                        const aggregateEntry: AggregateEntry = {
                            description: diagnostic.description,
                            location: {
                                ...diagnostic.location,
                                file: diagnosticFile.files[diagnostic.location.file],
                                // eslint-disable-next-line @typescript-eslint/naming-convention
                                source_file: sourceFile,
                                // eslint-disable-next-line @typescript-eslint/naming-convention
                                source_idx: idx
                            },
                            category: diagnostic.category,
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            analyzer_name: '', // TODO: Read out
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            path_length: diagnostic.path.filter(elem => elem.kind === AnalysisPathKind.Event).length
                        };

                        entries.push(aggregateEntry);
                    }
                } catch (err) {
                    console.error(err);
                    errorFlag = true;
                }
            }
        }

        if (errorFlag) {
            window.showErrorMessage('Failed to read CodeChecker aggregate data\nCheck console for details');
        }

        const localMeta = ExtensionApi.metadata.metadata;
        const analyzers = Object.keys(localMeta.analyzers)
            .filter(key => localMeta.analyzers.hasOwnProperty(key));

        this._aggregateData = {
            name: localMeta.name,
            timestamps: {
                begin: new Date(localMeta.timestamps.begin * 1000),
                end: new Date(localMeta.timestamps.end * 1000)
            },
            entries,
            analyzers,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            action_num: localMeta.action_num,
            skipped: localMeta.skipped,
        };

        this._aggregateUpdated.fire(this._aggregateData);
    }

    metadataUpdated(event: CheckerMetadata | undefined) {
        this.reloadAggregateData()
            .catch((err) => {
                console.error(err);
                window.showErrorMessage('Unexpected error when reloading aggregate data \nCheck console for more details');
            });
    }
}