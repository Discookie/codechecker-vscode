import { commands, ExtensionContext, Range, Uri, window } from "vscode";
import { ExtensionApi } from "../backend/api";
import { AnalysisPathEvent, AnalysisPathKind, DiagnosticEntry } from "../backend/types";
import { SidebarContainer } from "../sidebar";

export class NavigationHandler {
    constructor(ctx: ExtensionContext) {
        ctx.subscriptions.push(commands.registerCommand('codechecker.editor.toggleSteps', this.toggleSteps, this));
        ctx.subscriptions.push(commands.registerCommand('codechecker.editor.jumpToBug', this.jumpToBug, this));
        ctx.subscriptions.push(commands.registerCommand('codechecker.editor.jumpToStep', this.jumpToStep, this));
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

        if (keepCurrentFile) {
            ExtensionApi.diagnostics.stickyFile = file;
        }

        const diagnostic: DiagnosticEntry | undefined = ExtensionApi.diagnostics.getFileDiagnostics(file)[bugIndex];
        const location = diagnostic?.location;
        file = location !== undefined ? Uri.file(diagnostic.files[location.file]) : file;

        window.showTextDocument(file, {
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

        if (keepCurrentFile) {
            ExtensionApi.diagnostics.stickyFile = file;
        }

        const diagnostic: DiagnosticEntry | undefined = ExtensionApi.diagnostics.getFileDiagnostics(file)[bugIndex];
        const diagnosticLocation = diagnostic?.location;
        const step = diagnostic?.path.filter(elem => elem.kind === AnalysisPathKind.Event)[stepIndex] as AnalysisPathEvent;
        const stepLocation = step?.location ?? diagnosticLocation;
        file = stepLocation !== undefined ? Uri.file(diagnostic.files[stepLocation.file])
            : diagnosticLocation !== undefined ? Uri.file(diagnostic.files[diagnosticLocation.file])
            : file;

        window.showTextDocument(file, {
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
}