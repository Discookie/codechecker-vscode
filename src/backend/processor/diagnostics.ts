import { Trie, TrieMap } from 'mnemonist';
import { Event, EventEmitter, ExtensionContext, TextEditor, Uri, window } from 'vscode';
import { DiagnosticParser } from '../parser';
import { CheckerMetadata, DiagnosticEntry, DiagnosticFile } from '../types';
import { ExtensionApi as api } from '../api';

/**
 * API interface that provides Diagnostics data.  
 * Access the active instance via ExtensionApi.
 */
export class DiagnosticsApi {
    private _openedFiles: string[] = [];
    private _diagnosticEntries: Map<string, DiagnosticFile> = new Map();
    /** 
     * Content based on the contents of loaded .plist files.
     * Key: Source code file, value: .plist analysis files
     */
    private _diagnosticSourceFiles: TrieMap<string, string[]> = new TrieMap();

    private _stickyFile?: Uri;
    private _ignoreNextActiveEditorChange = false;

    public get stickyFile(): Uri | undefined {
        return this._stickyFile ?? (this._activeReprPath ?? [])[0];
    }
    public set stickyFile(value: Uri | undefined) {
        this._stickyFile = value;
        this._ignoreNextActiveEditorChange = true;

        this.reloadDiagnostics();
    }

    private _activeReprPath?: [Uri, number];
    public get activeReprPath(): DiagnosticEntry | undefined {
        return this._activeReprPath !== undefined 
            ? this.getFileDiagnostics(this._activeReprPath[0])[this._activeReprPath[1]]
            : undefined;
    }
    
    public setActiveReprPath(filename: Uri, idx: number) {
        const diags = this.getFileDiagnostics(filename);
        if ((diags ?? [])[idx] !== undefined) {
            this._activeReprPath = [filename, idx];
            this._diagnosticsUpdated.fire();
        }
    }

    public clearActiveReprPath() {
        if (this._activeReprPath !== undefined) {
            this._activeReprPath = undefined;
            this._diagnosticsUpdated.fire();
        }
    }

    constructor(ctx: ExtensionContext) {
        ctx.subscriptions.push(this._diagnosticsUpdated = new EventEmitter());
        window.onDidChangeActiveTextEditor(this.onActiveEditorChanged, this, ctx.subscriptions);
        window.onDidChangeVisibleTextEditors(this.onDocumentsChanged, this, ctx.subscriptions);
        api.metadata.metadataUpdated(this.onMetadataUpdated, this, ctx.subscriptions);

        this.init();
    }

    init(): void {

    }

    // TODO: Add support for cancellation tokens
    async reloadDiagnostics(forceReload?: boolean): Promise<void> {
        // TODO: Allow loading all diagnostics at once
        let plistFilesToLoad = this._openedFiles.map(file => api.metadata.sourceFiles.get(file));

        if (this.stickyFile !== undefined) {
            plistFilesToLoad.push(api.metadata.sourceFiles.get(this.stickyFile.fsPath));
        }

        // Remove extra undefined/null values
        plistFilesToLoad = plistFilesToLoad.filter(val => val);

        if (forceReload) {
            this._diagnosticEntries = new Map();
        }

        let loadedPlistFiles = new Trie<string>();

        // Load new .plist files
        for (const plistFiles of plistFilesToLoad) {
            for (const plistFile of plistFiles) {
                if (this._diagnosticEntries.has(plistFile)) {
                    loadedPlistFiles.add(plistFile);
                    continue;
                }

                try {
                    const diagnosticEntry = await DiagnosticParser.parse(plistFile);
                    this._diagnosticEntries.set(plistFile, diagnosticEntry);
                    loadedPlistFiles.add(plistFile);
                } catch (err) {
                    console.error(err);
                    window.showErrorMessage('Failed to read CodeChecker metadata\nCheck console for details');
                }
            }
        }

        // Remove files that are no longer referenced
        for (const plistFile of this._diagnosticEntries.keys()) {
            if (!loadedPlistFiles.has(plistFile)) {
                this._diagnosticEntries.delete(plistFile);
            }
        }

        // Finally create the new TrieMap for source files
        const plistFileReferences: {[sourceFile: string]: string[]} = {};
        
        for (let [plistFile, parsedPlist] of this._diagnosticEntries.entries()) {
            for (let sourceFile of parsedPlist.files) {
                if (!plistFileReferences[sourceFile]) {
                    plistFileReferences[sourceFile] = [];
                }
                
                plistFileReferences[sourceFile].push(plistFile);
            }
        }

        this._diagnosticSourceFiles = TrieMap.from(plistFileReferences);

        this._diagnosticsUpdated.fire();
    }

    dataExistsForFile(uri: Uri): boolean {
        const path = uri.fsPath;
        
        return this._diagnosticSourceFiles.has(path);
    }

    /** Returns all opened diagnostics that run through the current file.
     *  Diagnostics that aren't in currently opened files are ignored.
     *  Calling getFileDiagnostics for multiple Uri-s may lead to duplicates.
     */
    getFileDiagnostics(uri: Uri): DiagnosticEntry[] {
        const path = uri.fsPath;

        const diagnosticFiles = this._diagnosticSourceFiles.get(path) ?? [];

        return diagnosticFiles
            .flatMap(file => this._diagnosticEntries.get(file)?.diagnostics ?? []);
    }

    /** Returns a unique list of all diagnostics that run through the current files.
     *  Calling getFileDiagnostics for multiple Uri-s may lead to duplicates.
     */
    getMultipleFileDiagnostics(uris: Uri[]): DiagnosticEntry[] {
        const diagnosticSet = new Set<DiagnosticEntry>();

        for (const uri of uris) {
            const diagnostics = this.getFileDiagnostics(uri);
            for (const diagnostic of diagnostics) {
                diagnosticSet.add(diagnostic);
            }
        }

        return [...diagnosticSet.values()];
    }

    private _diagnosticsUpdated: EventEmitter<void>;
    public get diagnosticsUpdated(): Event<void> {
        return this._diagnosticsUpdated.event;
    }

    onActiveEditorChanged(event?: TextEditor): void {
        if (this._ignoreNextActiveEditorChange) {
            this._ignoreNextActiveEditorChange = false;
            return;
        }

        this.stickyFile = undefined;
    }

    onDocumentsChanged(event: TextEditor[]): void {
        const uris = event.map(editor => editor.document.uri);
        this._openedFiles = uris.map(uri => uri.fsPath);

        this.reloadDiagnostics()
            .catch((err) => {
                console.error(err);
                window.showErrorMessage('Unexpected error when reloading diagnostics \nCheck console for more details');
            });
    }

    onMetadataUpdated(metadata: CheckerMetadata | undefined) {
        this.reloadDiagnostics(true)
            .catch((err) => {
                console.error(err);
                window.showErrorMessage('Unexpected error when reloading diagnostics \nCheck console for more details');
            });
    }

    onDirectoryUpdated() {
        // TODO: implement
    }
}