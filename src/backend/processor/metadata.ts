import { TrieMap } from "mnemonist";
import { commands, ConfigurationChangeEvent, Event, EventEmitter, ExtensionContext, tasks, window, workspace } from "vscode";
import { ExtensionApi } from "../api";
import { parseMetadata } from "../parser";
import { CheckerMetadata } from "../types";

export class MetadataApi {
    private _metadata?: CheckerMetadata;
    public get metadata(): CheckerMetadata | undefined {
        return this._metadata;
    }
    
    private _metadataSourceFiles: TrieMap<string, string[]> = new TrieMap();
    /** 
     * Content based on the metadata file only.
     * Key: Source code file, value: .plist analysis files
     */
    public get sourceFiles(): TrieMap<string, string[]> {
        return this._metadataSourceFiles;
    }
    
    private _enabled = true;
    public get enabled(): boolean {
        return this._enabled;
    }
    public set enabled(value: boolean) {
        this._enabled = value;
        this.reloadMetadata();
    }

    constructor(ctx: ExtensionContext) {
        ctx.subscriptions.push(this._metadataUpdated = new EventEmitter());
        ctx.subscriptions.push(commands.registerCommand('codechecker.processor.reloadMetadata', this.reloadMetadata, this));
        workspace.onDidChangeConfiguration(this.onConfigChanged, this, ctx.subscriptions);
        ExtensionApi.executor.onBuildFinished(this.reloadMetadata, this, ctx.subscriptions);

        this.init();
    }

    protected init() {
        this.reloadMetadata()
            .catch((err) => {
                console.log(err);
                window.showErrorMessage('Unexpected error when reloading metadata \nCheck console for more details');
            });
    }

    private _metadataUpdated: EventEmitter<CheckerMetadata | undefined>;
    public get metadataUpdated(): Event<CheckerMetadata | undefined> {
        return this._metadataUpdated.event;
    }
    
    async reloadMetadata(): Promise<void> {
        let metadataPath = workspace.getConfiguration('codechecker.runner').get<string>('outputFolder');
        if (this.enabled && !metadataPath) {
            window.showWarningMessage('Metadata folder has invalid path - please change `CodeChecker > Runner > Output folder path` in the settings');

            this._enabled = false;
        }

        if (this.enabled && (workspace.workspaceFolders?.length ?? 0) === 0) {
            window.showInformationMessage('CodeChecker is disabled - open a workspace to get started');

            this._enabled = false;
        }

        if (!this._enabled) {
            this._metadata = undefined;
            this._metadataSourceFiles = new TrieMap();
            this._metadataUpdated.fire(this._metadata);
            return;
        }

        const workspaceFolder = workspace.workspaceFolders![0].uri.fsPath;

        metadataPath = metadataPath!
            .replace(/\${workspaceRoot}/g, workspaceFolder)
            .replace(/\${workspaceFolder}/g, workspaceFolder)
            .replace(/\${cwd}/g, process.cwd())
            .replace(/\${env\.([^}]+)}/g, (sub: string, envName: string) => process.env[envName] ?? '');

        let metadata;

        try {
            // TODO: Support multiple tools
            metadata = await parseMetadata(metadataPath! + '/metadata.json');
        } catch (err) {
            // Silently ignore File not found errors
            if (err.code !== 'FileNotFound') {
                console.error(err);
                window.showErrorMessage('Failed to read CodeChecker metadata\nCheck console for more details');
                // Not returning, because the cache needs to be cleared
            }
        }

        this._metadata = metadata?.tools[0];

        this._metadataSourceFiles = new TrieMap();

        if (this._metadata) {
            // reverse keys/values, so the source file becomes the key
            for (const [analysisFile, sourceFile] of Object.entries(this._metadata.result_source_files)) {
                const entries = this._metadataSourceFiles.get(sourceFile) ?? [];
                entries.push(analysisFile);
                this._metadataSourceFiles.set(sourceFile, entries);
            }
        }

        this._metadataUpdated.fire(this._metadata);
    }

    onConfigChanged(event: ConfigurationChangeEvent) {
        if (event.affectsConfiguration('codechecker.runner')) {
            this._enabled = true;
            this.reloadMetadata()
                .catch((err) => {
                    console.log(err);
                    window.showErrorMessage('Unexpected error when reloading metadata \nCheck console for more details');
                });
        }
    }
}