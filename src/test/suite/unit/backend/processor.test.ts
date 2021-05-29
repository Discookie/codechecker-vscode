import * as assert from 'assert';
import { commands, extensions, Uri, window, workspace, WorkspaceConfiguration } from 'vscode';
import { asyncWaitForEvent, timeout } from '../utils/async';
import { before, after } from 'mocha';
import { ActivateType } from '../../../../extension';
import { AggregateDataApi, DiagnosticsApi, MetadataApi } from '../../../../backend/processor';
import { AnalysisPathEvent, AnalysisPathKind } from '../../../../backend/types';

suite('Unit: Metadata API', () => {
    let extensionType: ActivateType;
    let metadataApi: MetadataApi;

    let config: WorkspaceConfiguration;
    let oldConfig: string;

    before('activates extension', async () => {
        extensionType = await extensions.getExtension('discookie.codechecker')!.activate();
        metadataApi = extensionType.extensionApi.metadata;
        
        config = workspace.getConfiguration('codechecker.runner');
        oldConfig = config.get('outputFolder')!;

        // reset config to known default
        await config.update('outputFolder', '${workspaceFolder}/codechecker');
        await timeout(1000);
    });

    test('reloads metadata correctly', async () => {
        // Times out if the event is never called
        const eventPromise = asyncWaitForEvent(metadataApi.metadataUpdated);
        metadataApi.reloadMetadata();
        const event = await eventPromise;

        assert.ok(event !== undefined, 'metadata not found');
        assert.strictEqual(event, metadataApi.metadata);
    });

    test('updates on settings change', async () => {

        const workspaceFolder = (workspace.workspaceFolders ?? [])[0]?.uri.fsPath;
        assert.ok(workspaceFolder !== undefined, 'Please run the tests inside the test-data workspace');

        let eventPromise = asyncWaitForEvent(metadataApi.metadataUpdated);
        await config.update('outputFolder', workspaceFolder + '/codechecker');
        let event = await eventPromise;

        assert.ok(event !== undefined, 'metadata not found');
        assert.strictEqual(event, metadataApi.metadata);

        eventPromise = asyncWaitForEvent(metadataApi.metadataUpdated);
        await config.update('outputFolder', '${workspaceFolder}/codechecker');
        event = await eventPromise;

        assert.ok(event !== undefined, 'variables not found');
        assert.strictEqual(event, metadataApi.metadata, 'variable not updated correctly');

        eventPromise = asyncWaitForEvent(metadataApi.metadataUpdated);
        await config.update('outputFolder', '${workspaceFolder}/invalid-folder');
        event = await eventPromise;

        assert.ok(event === undefined, 'found metadata in nonexistent folder');
        assert.strictEqual(event, metadataApi.metadata, 'variables not cleared');
        assert.ok([...metadataApi.sourceFiles.entries()].length === 0, 'variable not cleared');
    }).timeout(5000);

    after('cleanup config', async () => {
        await config.update('outputFolder', oldConfig);
    });
});

suite('Unit: Diagnostic API', () => {
    let extensionType: ActivateType;
    let diagnosticsApi: DiagnosticsApi;
    let workspaceFolder: string;
    let activeFile: Uri;

    before('activates extension', async () => {
        extensionType = await extensions.getExtension('discookie.codechecker')!.activate();
        diagnosticsApi = extensionType.extensionApi.diagnostics;
        
        workspaceFolder = (workspace.workspaceFolders ?? [])[0]?.uri.fsPath;
        activeFile = Uri.file(workspaceFolder + '/file.cpp');
        assert.ok(workspaceFolder !== undefined, 'Please run the tests inside the test-data workspace');

        await commands.executeCommand('workbench.action.closeAllEditors');
        await window.showTextDocument(activeFile);
        await timeout(500);
    });

    test('reloads diagnostics', async () => {
        const eventPromise = asyncWaitForEvent(diagnosticsApi.diagnosticsUpdated);
        diagnosticsApi.reloadDiagnostics();
        await eventPromise;

        assert.ok(diagnosticsApi.getFileDiagnostics(activeFile), 'diagnostics not found after reload');
    });

    test('active repr path', async () => {
        diagnosticsApi.stickyFile = undefined;
        assert.ok(diagnosticsApi.stickyFile === undefined);
        
        let eventPromise = asyncWaitForEvent(diagnosticsApi.diagnosticsUpdated);
        diagnosticsApi.setActiveReprPath(activeFile, 0);
        await eventPromise;

        assert.ok(diagnosticsApi.stickyFile!.fsPath === activeFile.fsPath, 'sticky file not updated');

        const comparedToReprPath = diagnosticsApi.getFileDiagnostics(activeFile);
        assert.strictEqual(diagnosticsApi.activeReprPath, comparedToReprPath[0], 'repr path cannot be compared by reference');
        
        await diagnosticsApi.reloadDiagnostics();
        assert.ok(diagnosticsApi.stickyFile === undefined, 'sticky file not cleared via repr path');
        assert.ok(diagnosticsApi.activeReprPath === undefined, 'repr path not cleared');
    }).timeout(5000);

    test('updates on workspace change', async () => {
        let eventPromise = asyncWaitForEvent(diagnosticsApi.diagnosticsUpdated);
        await diagnosticsApi.reloadDiagnostics();
        await eventPromise;

        eventPromise = asyncWaitForEvent(diagnosticsApi.diagnosticsUpdated);
        await extensionType.extensionApi.metadata.reloadMetadata();
        await eventPromise;

        eventPromise = asyncWaitForEvent(diagnosticsApi.diagnosticsUpdated);
        await commands.executeCommand('workbench.action.closeAllEditors');
        await eventPromise;

        eventPromise = asyncWaitForEvent(diagnosticsApi.diagnosticsUpdated);
        await window.showTextDocument(activeFile);
        await eventPromise;
    });
});

suite('Unit: Aggregate API', () => {
    let extensionType: ActivateType;
    let aggregateApi: AggregateDataApi;
    let diagnosticApi: DiagnosticsApi;
    let workspaceFolder: string;
    let activeFile: Uri;

    before('activates extension', async () => {
        extensionType = await extensions.getExtension('discookie.codechecker')!.activate();
        aggregateApi = extensionType.extensionApi.aggregate;
        diagnosticApi = extensionType.extensionApi.diagnostics;
        
        workspaceFolder = (workspace.workspaceFolders ?? [])[0]?.uri.fsPath;
        activeFile = Uri.file(workspaceFolder + '/file.cpp');
        assert.ok(workspaceFolder !== undefined, 'Please run the tests inside the test-data workspace');

        await commands.executeCommand('workbench.action.closeAllEditors');
        await window.showTextDocument(activeFile);
        await timeout(500);
    });

    test('diagnostic data can be found', async () => {
        assert.ok(aggregateApi.aggregateData !== null, 'Please run the tests inside the test-data workspace');
        for (const aggregateEntry of aggregateApi.aggregateData!.entries) {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const {file, source_file, source_idx} = aggregateEntry.location;
            const diagnosticEntry = diagnosticApi.getFileDiagnostics(Uri.file(source_file))[source_idx];
            assert.strictEqual(aggregateEntry.description, diagnosticEntry?.description, 'error cannot be found from aggregate data: ' + source_file + ', ' + source_idx);

            const diagnosticPath = diagnosticEntry?.path.filter(x => x.kind === AnalysisPathKind.Event) as AnalysisPathEvent[];
            assert.strictEqual(aggregateEntry.path_length, diagnosticPath?.length, 'diagnostic path length is wrong');
        }
    });

    test('reloads data correctly', async () => {
        let eventPromise = asyncWaitForEvent(aggregateApi.aggregateUpdated);
        aggregateApi.reloadAggregateData();
        await eventPromise;
        
        eventPromise = asyncWaitForEvent(aggregateApi.aggregateUpdated);
        extensionType.extensionApi.metadata.reloadMetadata();
        await eventPromise;
    });
});