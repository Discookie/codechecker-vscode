import { commands, ExtensionContext, Position, Range, Uri, window } from "vscode";
import { ExtensionApi } from "../backend/api";
import { AnalysisPathEvent, AnalysisPathKind, DiagnosticEntry } from "../backend/types";
import { SidebarContainer } from "../sidebar";

export class NavigationHandler {
    constructor(ctx: ExtensionContext) {
        ctx.subscriptions.push(commands.registerCommand('codechecker.editor.toggleSteps', this.toggleSteps, this));
        ctx.subscriptions.push(commands.registerCommand('codechecker.editor.jumpToBug', this.jumpToBug, this));
        ctx.subscriptions.push(commands.registerCommand('codechecker.editor.jumpToStep', this.jumpToStep, this));
        ctx.subscriptions.push(commands.registerCommand('codechecker.editor.nextStep', this.nextStep, this));
        ctx.subscriptions.push(commands.registerCommand('codechecker.editor.previousStep', this.previousStep, this));
    }

    toggleSteps(file: Uri | string, bugIndex: number, targetState?: boolean): void {
        if (typeof file === 'string') {
            file = Uri.file(file);
        }

        const diagnostic: DiagnosticEntry | undefined = ExtensionApi.diagnostics.getFileDiagnostics(file)[bugIndex];

        targetState = targetState ?? ((diagnostic ?? []) !== ExtensionApi.diagnostics.activeReprPath);

        if (targetState) {
            ExtensionApi.diagnostics.setActiveReprPath(file, bugIndex);
        } else {
            ExtensionApi.diagnostics.clearActiveReprPath();
        }
    }

    jumpToBug(file: Uri | string, bugIndex: number, keepCurrentFile: boolean): void {
        if (typeof file === 'string') {
            file = Uri.file(file);
        }


        const diagnostic: DiagnosticEntry | undefined = ExtensionApi.diagnostics.getFileDiagnostics(file)[bugIndex];
        const location = diagnostic?.location;
        const targetFile = location !== undefined ? Uri.file(diagnostic.files[location.file]) : file;
        
        if (keepCurrentFile && file.fsPath !== targetFile.fsPath) {
            ExtensionApi.diagnostics.stickyFile = file;
        }

        window.showTextDocument(targetFile, {
            selection: location !== undefined ? new Range(
                location.line - 1,
                location.col - 1,
                location.line - 1,
                location.col - 1
            ) : undefined
        });

        if (diagnostic === undefined) {
            window.showWarningMessage('Unable to find specified bug, opened its file instead');
        }
    }

    jumpToStep(file: Uri | string, bugIndex: number, stepIndex: number, keepCurrentFile: boolean): void {
        if (typeof file === 'string') {
            file = Uri.file(file);
        }

        const diagnostic: DiagnosticEntry | undefined = ExtensionApi.diagnostics.getFileDiagnostics(file)[bugIndex];
        const diagnosticLocation = diagnostic?.location;
        const step = diagnostic?.path.filter(elem => elem.kind === AnalysisPathKind.Event)[stepIndex] as AnalysisPathEvent;
        const stepLocation = step?.location ?? diagnosticLocation;
        const targetFile = stepLocation !== undefined ? Uri.file(diagnostic.files[stepLocation.file])
            : diagnosticLocation !== undefined ? Uri.file(diagnostic.files[diagnosticLocation.file])
            : file;
            
        
        if (keepCurrentFile && file.fsPath !== targetFile.fsPath) {
            ExtensionApi.diagnostics.stickyFile = file;
        }

        window.showTextDocument(targetFile, {
            selection: stepLocation !== undefined ? new Range(
                stepLocation.line - 1,
                stepLocation.col - 1,
                stepLocation.line - 1,
                stepLocation.col - 1
            ) : undefined
        });

        if (diagnostic === undefined) {
            window.showWarningMessage('Unable to find specified bug, opened its file instead');
        } else if (step === undefined) {
            window.showWarningMessage('Unable to find specified reproduction step, opened its bug instead');
        }
    }

    getStepIndexUnderCursor(which: 'first' | 'last'): number | undefined {
        if (window.activeTextEditor === undefined || ExtensionApi.diagnostics.activeReprPath === undefined) {
            return undefined;
        }

        const cursor = window.activeTextEditor.selection.anchor;
        
        const entry = ExtensionApi.diagnostics.activeReprPath;
        const reprPath = entry.path
            .filter(e => e.kind === AnalysisPathKind.Event) as AnalysisPathEvent[];

        let lastIdx = undefined;
        
        for (const [idx, path] of reprPath.entries()) {
            // Check location first
            if (window.activeTextEditor.document.uri.fsPath !== entry.files[path.location.file]) {
                continue;
            }

            if (cursor.isEqual(new Position(path.location.line-1, path.location.col-1))) {
                if (which === 'first') {
                    return idx;
                } else {
                    lastIdx = idx;
                    continue;
                }
            }

            // Check inside the ranges
            if (path.ranges === undefined) {
                continue;
            }

            for (const [start, end] of path.ranges) {
                const range = new Range(
                    start.line-1,
                    start.col-1,
                    end.line-1,
                    end.col,
                );

                if (range.contains(cursor)) {
                    if (which === 'first') {
                        return idx;
                    } else {
                        lastIdx = idx;
                        continue;
                    }
                }
            }
        }

        return lastIdx;
    }

    nextStep() {
        const stepIdx = this.getStepIndexUnderCursor('last');

        if (stepIdx === undefined || ExtensionApi.diagnostics.activeReprPath === undefined) {
            return;
        }
        
        const entry = ExtensionApi.diagnostics.activeReprPath;
        const reprPath = entry.path
            .filter(e => e.kind === AnalysisPathKind.Event) as AnalysisPathEvent[];

        if (stepIdx < reprPath.length - 1) {
            const stepLocation = reprPath[stepIdx + 1].location;

            window.showTextDocument(Uri.file(entry.files[stepLocation.file]), {
                selection: new Range(
                    stepLocation.line - 1,
                    stepLocation.col - 1,
                    stepLocation.line - 1,
                    stepLocation.col - 1
                )
            });
        }
    }

    previousStep() {
        const stepIdx = this.getStepIndexUnderCursor('first');

        if (stepIdx === undefined || ExtensionApi.diagnostics.activeReprPath === undefined) {
            return;
        }
        
        const entry = ExtensionApi.diagnostics.activeReprPath;
        const reprPath = entry.path
            .filter(e => e.kind === AnalysisPathKind.Event) as AnalysisPathEvent[];

        if (stepIdx > 0) {
            const stepLocation = reprPath[stepIdx - 1].location;

            window.showTextDocument(Uri.file(entry.files[stepLocation.file]), {
                selection: new Range(
                    stepLocation.line - 1,
                    stepLocation.col - 1,
                    stepLocation.line - 1,
                    stepLocation.col - 1
                )
            });
        }
    }
}