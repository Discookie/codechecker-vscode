import { Diagnostic, DiagnosticCollection, DiagnosticRelatedInformation, DiagnosticSeverity, ExtensionContext, languages, Location, Position, Range, TextDocument, TextDocumentChangeEvent, Uri, workspace } from 'vscode';
import { getVSCodeDownloadUrl } from 'vscode-test/out/util';
import { AnalysisPathEvent, AnalysisPathKind, DiagnosticEntry } from '../backend/types';
import { ExtensionApi as api } from '../backend/api';

// TODO: implement api

export class DiagnosticRenderer {
    private _diagnosticCollection: DiagnosticCollection;
    private _openedFiles: Uri[] = [];

    constructor(ctx: ExtensionContext) {
        ctx.subscriptions.push(this._diagnosticCollection = languages.createDiagnosticCollection('codechecker'));

        workspace.onDidOpenTextDocument(this.onDocumentOpened, this, ctx.subscriptions);
        workspace.onDidChangeTextDocument(this.onDocumentChanged, this, ctx.subscriptions);
        workspace.onDidCloseTextDocument(this.onDocumentClosed, this, ctx.subscriptions);
        api.diagnostics.diagnosticsUpdated(this.onDiagnosticUpdated, this, ctx.subscriptions);
    }

    onDiagnosticUpdated() {
        this.updateAllDiagnostics();
    }

    onDocumentOpened(event: TextDocument) {
        api.diagnostics.onFileOpened(event.uri);
        this._openedFiles.push(event.uri);
    }

    onDocumentClosed(event: TextDocument) {
        this._openedFiles = this._openedFiles.filter(uri => uri.toString() !== event.uri.toString());
        api.diagnostics.onFileClosed(event.uri);
    }

    onDocumentChanged(event: TextDocumentChangeEvent) {
        this.updateDiagnostics(event.document.uri);
    }

    // TODO: Implement CancellableToken
    updateAllDiagnostics(): void {
        for (const uri of this._openedFiles) {
            this.updateDiagnostics(uri);
        }
    }

    // TODO: Implement CancellableToken
    updateDiagnostics(uri: Uri): void {
        if (!api.diagnostics.dataExistsForFile(uri)) {
            return;
        }

        // TODO: Implement
        let showReprPath = false;

        let diagnosticData: DiagnosticEntry[] = api.diagnostics.getFileDiagnostics(uri);

        let diagnosticMap: Map<string, Diagnostic[]> = new Map();

        for (let entry of diagnosticData) {
            let sourceDiag = entry.path.find(elem => 
                elem.kind === AnalysisPathKind.Event &&
                (elem as AnalysisPathEvent).message === entry.description
            ) as AnalysisPathEvent;

            // Render source diagnostic
            {
                let affectedFile = Uri.file(entry.files[sourceDiag.location.file]);

                // TODO: Assuming there's always at least one range
                if ((sourceDiag.ranges?.length ?? 0) === 0) {
                    continue;
                }

                
                let ranges = (sourceDiag.ranges ?? [])
                .map(range => new Range(
                    range[0].line-1,
                    range[0].col-1,
                    range[1].line-1,
                    range[1].col,
                    ));
                    
                // TODO: Find solution for multiple ranges with same error
                // Currently, when there's 2 or more ranges, they all contain a link to the location contained in the entry
                let relatedInformation: DiagnosticRelatedInformation[] = [];
                if (ranges.length > 1) {
                    relatedInformation.push(new DiagnosticRelatedInformation(
                        new Location(affectedFile, new Position(entry.location.line-1, entry.location.col)),
                        'originated from here'
                    ));
                }

                let diagnostics = diagnosticMap.get(affectedFile.toString()) ?? [];

                for (const diagRange of sourceDiag.ranges ?? []) {
                    let range = new Range(
                        diagRange[0].line-1,
                        diagRange[0].col-1,
                        diagRange[1].line-1,
                        diagRange[1].col,
                    );

                    let renderedDiag: Diagnostic = {
                        message: sourceDiag.message,
                        range,
                        relatedInformation,
                        severity: DiagnosticSeverity.Error,
                        source: 'CodeChecker',
                    };

                    diagnostics.push(renderedDiag);
                }
                
                diagnosticMap.set(affectedFile.toString(), diagnostics);
            }

            if (showReprPath) {
                // TODO: Render repr. path as information nodes, with proper links
            }
        }

        // Render all new diagnostics
        for (const [file, diagnostics] of diagnosticMap) {
            const uri = Uri.parse(file);
            this._diagnosticCollection.set(uri, diagnostics);
        }
    }
}