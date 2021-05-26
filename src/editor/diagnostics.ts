import { Diagnostic, DiagnosticCollection, DiagnosticRelatedInformation, DiagnosticSeverity, ExtensionContext, languages, Location, Position, Range, TextDocument, TextDocumentChangeEvent, TextEditor, Uri, window, workspace } from 'vscode';
import { AnalysisLocation, AnalysisPathEvent, AnalysisPathKind, AnalysisRange, DiagnosticEntry } from '../backend/types';
import { ExtensionApi as api, ExtensionApi } from '../backend/api';

// TODO: implement api

export class DiagnosticRenderer {
    private _diagnosticCollection: DiagnosticCollection;
    private _lastUpdatedFiles: Uri[] = [];
    private _openedFiles: Uri[] = [];

    constructor(ctx: ExtensionContext) {
        ctx.subscriptions.push(this._diagnosticCollection = languages.createDiagnosticCollection('codechecker'));

        api.diagnostics.diagnosticsUpdated(this.onDiagnosticUpdated, this, ctx.subscriptions);
    }

    onDiagnosticUpdated() {
        this._openedFiles = window.visibleTextEditors.map(editor => editor.document.uri);

        if (api.diagnostics.stickyFile) {
            this._openedFiles.push(api.diagnostics.stickyFile);
        }

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
            const affectedFile = Uri.file(entry.files[renderedDiag.location.file]);

            // When there's no ranges, render the location
            const ranges: Range[] = (renderedDiag.ranges ?? [[renderedDiag.location, renderedDiag.location]])
                .map(([start, end]) => new Range(
                    start.line-1,
                    start.col-1,
                    end.line-1,
                    end.col,
                ));
                
            // TODO: Find solution for multiple ranges with same error
            // Currently, when there's 2 or more ranges, they all contain a link to the location contained in the entry
            if (ranges.length > 1) {
                relatedInformation.push(makeRelatedInformation(entry, entry.location, 'originated from here'));
            }

            const diagnostics = diagnosticMap.get(affectedFile.toString()) ?? [];

            for (const range of ranges) {
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

        const renderErrorsInFile = (diagnosticData: DiagnosticEntry[]) => {
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
            if (!diagnosticMap.has(uri.toString())) {
                diagnosticMap.set(uri.toString(), []);
            }
        }
        
        const fileErrors = api.diagnostics.getMultipleFileDiagnostics(
            this._openedFiles.filter(uri => api.diagnostics.dataExistsForFile(uri))
        );
        renderErrorsInFile(fileErrors);

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