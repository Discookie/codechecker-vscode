import { Diagnostic, DiagnosticCollection, DiagnosticRelatedInformation, DiagnosticSeverity, ExtensionContext, languages, Location, Position, Range, TextDocument, TextDocumentChangeEvent, TextEditor, Uri, window, workspace } from 'vscode';
import { AnalysisLocation, AnalysisPathEvent, AnalysisPathKind, DiagnosticEntry } from '../backend/types';
import { ExtensionApi as api, ExtensionApi } from '../backend/api';

// TODO: implement api

export class DiagnosticRenderer {
    private _diagnosticCollection: DiagnosticCollection;
    private _lastUpdatedFiles: Uri[] = [];
    private _openedFiles: Uri[] = [];

    constructor(ctx: ExtensionContext) {
        ctx.subscriptions.push(this._diagnosticCollection = languages.createDiagnosticCollection('codechecker'));

        window.onDidChangeVisibleTextEditors(this.onDocumentsChanged, this, ctx.subscriptions);
        workspace.onDidChangeTextDocument(this.onDocumentChanged, this, ctx.subscriptions);
        api.diagnostics.diagnosticsUpdated(this.onDiagnosticUpdated, this, ctx.subscriptions);
    }

    onDiagnosticUpdated() {
        this.updateAllDiagnostics();
    }

    onDocumentsChanged(event: TextEditor[]) {
        const uriList = event.map(editor => editor.document.uri);

        this._openedFiles = uriList;
        
        if (ExtensionApi.diagnostics.stickyFile !== undefined) {
            this._openedFiles.push(ExtensionApi.diagnostics.stickyFile);
        }

        this.updateAllDiagnostics();
    }

    onDocumentChanged(event: TextDocumentChangeEvent) {
        this.updateAllDiagnostics();
    }

    // TODO: Implement CancellableToken
    updateAllDiagnostics(): void {
        const diagnosticMap: Map<string, Diagnostic[]> = new Map();
    
        const makeRelatedInformation = (
            entry: DiagnosticEntry,
            location: AnalysisLocation,
            message: string
        ): DiagnosticRelatedInformation => {
            const file = entry.files[location.file];

            return new DiagnosticRelatedInformation(
                new Location(Uri.file(file), new Position(location.line-1, location.col-1)),
                message
            );
        };

        const renderDiagnosticItem = (
            entry: DiagnosticEntry,
            renderedDiag: AnalysisPathEvent,
            severity: DiagnosticSeverity,
            relatedInformation: DiagnosticRelatedInformation[]
        ): boolean => {
            let affectedFile = Uri.file(entry.files[renderedDiag.location.file]);

            // TODO: Assuming there's always at least one range
            if ((renderedDiag.ranges?.length ?? 0) === 0) {
                return true;
            }

            
            const ranges = (renderedDiag.ranges ?? [])
            .map(range => new Range(
                range[0].line-1,
                range[0].col-1,
                range[1].line-1,
                range[1].col,
                ));
                
            // TODO: Find solution for multiple ranges with same error
            // Currently, when there's 2 or more ranges, they all contain a link to the location contained in the entry
            if (ranges.length > 1) {
                relatedInformation.push(makeRelatedInformation(entry, entry.location, 'originated from here'));
            }

            const diagnostics = diagnosticMap.get(affectedFile.toString()) ?? [];

            for (const diagRange of renderedDiag.ranges ?? []) {
                const range = new Range(
                    diagRange[0].line-1,
                    diagRange[0].col-1,
                    diagRange[1].line-1,
                    diagRange[1].col,
                );

                const finalDiag: Diagnostic = {
                    message: renderedDiag.message,
                    range,
                    relatedInformation,
                    severity,
                    source: 'CodeChecker',
                };

                diagnostics.push(finalDiag);
            }
            
            diagnosticMap.set(affectedFile.toString(), diagnostics);
            return false;
        };

        const renderErrorsInFile = (uri: Uri) => {
            if (!api.diagnostics.dataExistsForFile(uri)) {
                // Mark the file for purging, if there's no other diagnostics
                if (!diagnosticMap.has(uri.toString())) {
                    diagnosticMap.set(uri.toString(), []);
                }
                return;
            }
    
            const diagnosticData: DiagnosticEntry[] = api.diagnostics.getFileDiagnostics(uri);
    
            // Render source diagnostics
            for (let entry of diagnosticData) {
                if (entry === api.diagnostics.activeReprPath) {
                    // render later, with the reproduction path
                    continue;
                }
    
                const errorDiag = entry.path.find(elem =>
                    elem.kind === AnalysisPathKind.Event &&
                    (elem as AnalysisPathEvent).message === entry.description
                ) as AnalysisPathEvent;
    
                renderDiagnosticItem(entry, errorDiag, DiagnosticSeverity.Error, []);
            }
        };

        const renderReproductionPath = (entry: DiagnosticEntry) => {
            const fullPath = entry.path.filter(elem => elem.kind === AnalysisPathKind.Event) as AnalysisPathEvent[];

            if (fullPath.length > 0) {
                const errorDiag = fullPath.pop()!;
                const errorFile = entry.files[errorDiag.location.file];

                // Render corresponding error
                {
                    const relatedInformation: DiagnosticRelatedInformation[] = fullPath.length > 0
                        ? [
                            makeRelatedInformation(entry, fullPath[0].location, 'first reproduction step'),
                            makeRelatedInformation(entry, fullPath[fullPath.length - 2].location, 'last  reproduction step')
                        ]
                        : [];

                    renderDiagnosticItem(entry, errorDiag, DiagnosticSeverity.Error, relatedInformation);
                }

                // Render reproduction path
                for (const [idx, pathItem] of fullPath.entries()) {
                    const relatedInformation: DiagnosticRelatedInformation[] = [];

                    if (idx > 0) {
                        relatedInformation.push(makeRelatedInformation(entry, fullPath[idx - 1].location, 'previous reproduction step'));
                    }
                    if (idx < fullPath.length - 2) {
                        relatedInformation.push(makeRelatedInformation(entry, fullPath[idx + 1].location, 'next reproduction step'));
                    }
                    relatedInformation.push(makeRelatedInformation(entry, errorDiag.location, 'reproduces this bug'));
                    
                    renderDiagnosticItem(entry, pathItem, DiagnosticSeverity.Information, relatedInformation);
                }
            }
        };


        // Update "regular" errors in files
        for (const uri of this._openedFiles) {
            renderErrorsInFile(uri);
        }

        // Render reproduction path, if applicable
        if (api.diagnostics.activeReprPath !== undefined) {
            renderReproductionPath(api.diagnostics.activeReprPath);
        }

        // Freshly pushed files become _lastOpenedFiles
        const updatedFiles = [...diagnosticMap.keys()];

        // Remove "just closed" files
        for (const uri of this._lastUpdatedFiles) {
            if (!diagnosticMap.has(uri.toString())) {
                diagnosticMap.set(uri.toString(), []);
            }
        }

        for (const [file, diagnostics] of diagnosticMap) {
            const uri = Uri.parse(file);
            this._diagnosticCollection.set(uri, diagnostics);
        }

        this._lastUpdatedFiles = updatedFiles.map(entry => Uri.parse(entry));
    }
    
}