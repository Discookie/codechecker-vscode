import * as assert from 'assert';
import { parseMetadata } from '../../../../backend/parser/metadata';
import { parseDiagnostics } from '../../../../backend/parser/diagnostics';
import { glob } from 'glob';
import { promisify } from 'util';
import { AnalysisPathEvent, AnalysisPathKind } from '../../../../backend/types';
import { workspace } from 'vscode';

suite('Unit: Metadata parser', () => {
    test('parses generated metadata', async () => {
        const workspaceFolder = (workspace.workspaceFolders ?? [])[0]?.uri.fsPath;
        assert.ok(workspaceFolder !== undefined, 'Please run the tests inside the test-data workspace');
        
        const file = await parseMetadata(workspaceFolder + '/codechecker/metadata.json');
        assert.strictEqual(file.version, 2, 'Unsupported CodeChecker metadata version');
        
        const tool = file.tools[0];
        assert.ok(tool !== undefined);
        assert.strictEqual(tool.name, 'codechecker');

        assert.ok(tool.result_source_files !== undefined);
        assert.ok(tool.analyzers !== undefined);
        assert.ok(tool.timestamps !== undefined);
    });

    test('returns FileNotFound on invalid path', async () => {
        const workspaceFolder = (workspace.workspaceFolders ?? [])[0]?.uri.fsPath;
        assert.ok(workspaceFolder !== undefined, 'Please run the tests inside the test-data workspace');

        let invalidFileFlag = false;

        try {
            await parseMetadata(workspaceFolder + '/does-not-exist.json');
            invalidFileFlag = true;
        } catch (err) {
            assert.strictEqual(err.code, 'FileNotFound');
        }

        try {
            await parseMetadata(workspaceFolder + '/invalid-folder/does-not-exist.json');
            invalidFileFlag = true;
        } catch (err) {
            assert.strictEqual(err.code, 'FileNotFound');
        }

        if (invalidFileFlag) {
            assert.fail('reads invalid file');
        }
    });
});

suite('Unit: Diagnostic parser', () => {
    test('parses generated diagnostic', async () => {
        const asyncGlob = promisify(glob);
        const workspaceFolder = (workspace.workspaceFolders ?? [])[0]?.uri.fsPath;
        assert.ok(workspaceFolder !== undefined, 'Please run the tests inside the test-data workspace');
        
        const generatedFiles = await asyncGlob(workspaceFolder + '/codechecker/*.plist');

        for (const plistFile of generatedFiles) {
            const parsedFile = await parseDiagnostics(plistFile);

            assert.ok(parsedFile.files !== undefined);
            assert.ok(parsedFile.diagnostics !== undefined);
            assert.ok(parsedFile.diagnostics.length > 0, 'Analysis should contain diagnostics');

            const fileCount = parsedFile.files.length;

            for (const diagnostic of parsedFile.diagnostics) {
                assert.strictEqual(diagnostic.files, parsedFile.files, 'Files array should be reused');

                assert.ok(diagnostic.location.file < fileCount, 'diagnostic in invalid file');
                assert.ok(diagnostic.path.every(pathEntry => {
                    switch (pathEntry.kind) {
                        case AnalysisPathKind.Control: return true;
                        case AnalysisPathKind.Event: return true;
                        default: return false;
                    }
                }), 'diagnostic path contains unknown nodes');
                
                const pathNodes = diagnostic.path.filter(entry => entry.kind === AnalysisPathKind.Event) as AnalysisPathEvent[];

                // Assumed inside Editor.diagnosticRenderer
                assert.ok(pathNodes.length > 0, 'Assumes that the last element of the path is the error');
                assert.strictEqual(pathNodes[pathNodes.length - 1].message, diagnostic.description, 'Assumes that the last element of the path is the error');
            }
        }
    });

    test('returns FileNotFound on invalid path', async () => {
        const workspaceFolder = (workspace.workspaceFolders ?? [])[0]?.uri.fsPath;
        assert.ok(workspaceFolder !== undefined, 'Please run the tests inside the test-data workspace');

        let invalidFileFlag = false;

        try {
            await parseDiagnostics(workspaceFolder + '/does-not-exist.plist');
            invalidFileFlag = true;
        } catch (err) {
            assert.strictEqual(err.code, 'FileNotFound');
        }

        try {
            await parseDiagnostics(workspaceFolder + '/invalid-folder/does-not-exist.plist');
            invalidFileFlag = true;
        } catch (err) {
            assert.strictEqual(err.code, 'FileNotFound');
        }

        if (invalidFileFlag) {
            assert.fail('reads invalid file');
        }
    });
});