import { Trie, TrieMap } from 'mnemonist';
import { Disposable, Event, EventEmitter, ExtensionContext, TextEditor, Uri, window, workspace } from 'vscode';
import { DiagnosticParser, MetadataParser } from '../parser';
import { CheckerMetadata, DiagnosticEntry, DiagnosticFile } from '../types';

/**
 * API interface that provides Diagnostics data.  
 * Access the active instance via ExtensionApi.
 */
export class DiagnosticsApi {
    private _metadata?: CheckerMetadata;
    /** 
     * Content based on the metadata file only.
     * Key: Source code file, value: .plist analysis file
     */
    private _metadataSourceFiles: TrieMap<string, string> = new TrieMap();

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
        return this._stickyFile;
    }
    public set stickyFile(value: Uri | undefined) {
        this._stickyFile = value;

        if (this._stickyFile?.path !== window.activeTextEditor?.document.uri.path) {
            this._ignoreNextActiveEditorChange = true;
        }

        this.reloadDiagnostics();
    }

    private _activeReprPath?: DiagnosticEntry;
    public get activeReprPath(): DiagnosticEntry | undefined {
        return this._activeReprPath;
    }
    
    public setActiveReprPath(filename: Uri, idx: number) {
        const diags = this.getFileDiagnostics(filename);
        if ((diags ?? [])[idx] !== undefined) {
            this._activeReprPath = diags[idx];
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

        this.init(ctx);
    }

    init(ctx: ExtensionContext): void {
        this.reloadMetadata()
            .catch((err) => {
                console.log(err);
                window.showErrorMessage('Unexpected error when reloading metadata \nCheck console for more details');
            })
            .then(_ => {
                this.onDocumentsChanged(window.visibleTextEditors);
            });
    }

    async reloadMetadata(): Promise<void> {
        let metadataPath = workspace.getConfiguration('codechecker.runner').get<string>('outputFolder');
        if (!metadataPath) {
            window.showWarningMessage('Metadata folder has invalid path - please change `CodeChecker > Runner > Output folder path` in the settings');
            return;
        }

        if (!workspace.workspaceFolders) {
            window.showInformationMessage('CodeChecker is disabled - open a workspace to get started');
            // TODO: Disable
            return;
        }

        const workspaceFolder = workspace.workspaceFolders[0].uri.path;

        metadataPath = metadataPath
            .replace(/\${workspaceRoot}/g, workspaceFolder)
            .replace(/\${workspaceFolder}/g, workspaceFolder)
            .replace(/\${cwd}/g, process.cwd())
            .replace(/\${env\.([^}]+)}/g, (sub: string, envName: string) => process.env[envName] ?? '');

        let metadata;

        try {
            // TODO: Support multiple tools
            metadata = await MetadataParser.parse(metadataPath! + '/metadata.json');
        } catch (err) {
            // Silently ignore File not found errors
            if (err.code !== 'ENOENT') {
                console.error(err);
                window.showErrorMessage('Failed to read CodeChecker metadata\nCheck console for more details');
                // Not returning, because the cache needs to be cleared
            }
        }

        this._metadata = metadata?.tools[0];

        if (this._metadata) {
            // reverse keys/values, so the source file becomes the key
            const reverseSourceFiles = Object.entries(this._metadata.result_source_files)
                .map(([analysisFile, sourceFile]) => [sourceFile, analysisFile]);
    
            this._metadataSourceFiles = TrieMap.from(Object.fromEntries(reverseSourceFiles));
        } else {
            this._metadataSourceFiles = new TrieMap();
        }

        await this.reloadDiagnostics();
    }

    // TODO: Add support for cancellation tokens
    async reloadDiagnostics(forceReload?: boolean): Promise<void> {
        // TODO: Allow loading all diagnostics at once
        let plistFilesToLoad = this._openedFiles.map(file => this._metadataSourceFiles.get(file));

        if (this._stickyFile !== undefined) {
            plistFilesToLoad.push(this._metadataSourceFiles.get(this._stickyFile.path));
        }

        // Remove extra undefined/null values
        plistFilesToLoad = plistFilesToLoad.filter(val => val);

        if (forceReload) {
            this._diagnosticEntries = new Map();
        }

        let loadedPlistFiles = new Trie<string>();

        // Load new .plist files
        for (const plistFile of plistFilesToLoad) {
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
        const path = uri.path;
        
        return this._diagnosticSourceFiles.has(path);
    }

    /* Returns all opened diagnostics that run through the current file.
     * Diagnostics that aren't in currently opened files are ignored.
     */
    getFileDiagnostics(uri: Uri): DiagnosticEntry[] {
        const path = uri.path;

        const diagnosticFiles = this._diagnosticSourceFiles.get(path) ?? [];

        return diagnosticFiles
            .flatMap(file => this._diagnosticEntries.get(file)?.diagnostics ?? []);
    }

    listAllDiagnostics(): any[] /* TODO */ {
        return [];
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
        this._openedFiles = uris.map(uri => uri.path);

        this.reloadDiagnostics()
            .catch((err) => {
                console.error(err);
                window.showErrorMessage('Unexpected error when reloading diagnostics \nCheck console for more details');
            });
    }

    onDirectoryUpdated() {
        // TODO: implement
    }
}