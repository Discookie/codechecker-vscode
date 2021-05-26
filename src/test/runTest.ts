import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

import { runTests } from 'vscode-test';

async function main() {
    try {
        const extensionDevelopmentPath = resolve(__dirname, '../../');
        const extensionTestsPath = resolve(__dirname, './suite/index');

        const testWorkspace = resolve(__dirname, './test-data');
        
        // Run CodeChecker on the test workspace first
        const result = spawnSync(
            'CodeChecker check -b "c++ -std:c++17 file.cpp -o file" -o ./codechecker',
            { cwd: testWorkspace }
        );

        if (result.error !== undefined) {
            if (!existsSync(resolve(testWorkspace, './codechecker'))) {
                console.log('CodeChecker not found, please run CodeChecker manually', resolve(testWorkspace, './codechecker'));
                throw result.error;
            }

            console.log('CodeChecker not found, testing on existing data');
        } else {
            console.log('CodeChecker ran successfully on initial folder');
        }

        // After that's done, run the tests
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [testWorkspace]
        });
    } catch (err) {
        console.error('Failed to run tests');
        process.exit(1);
    }
}

main();
