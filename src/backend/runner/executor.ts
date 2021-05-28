import { CancellationToken, Event, EventEmitter, ExtensionContext, ProviderResult, ShellExecution, Task, TaskDefinition, TaskProvider, tasks, TaskScope, Uri, window, workspace } from 'vscode';

export enum AnalyzeType {
    analyzeProject = 'analyzeProject',
    analyzeFile = 'analyzeFile'
}

export class ExecutorApi implements TaskProvider<Task> {
    static codeCheckerType = 'codeChecker';
    constructor(ctx: ExtensionContext) {
        ctx.subscriptions.push(this._onBuildFinished = new EventEmitter());
        ctx.subscriptions.push(tasks.registerTaskProvider(ExecutorApi.codeCheckerType, this));
        tasks.onDidEndTask(this.taskFinished, this, ctx.subscriptions);
    }

    private _onBuildFinished: EventEmitter<void>;
    public get onBuildFinished(): Event<void> {
        return this._onBuildFinished.event;
    }

    taskFinished() {
        this._onBuildFinished.fire();
    }

    provideTasks(token: CancellationToken): ProviderResult<Task[]> {
        if ((workspace.workspaceFolders?.length ?? 0) === 0) {
            return [];
        }
        console.log(JSON.stringify({type: ExecutorApi.codeCheckerType, analyzeType: AnalyzeType.analyzeProject}));
        const tasks = [
            this.resolveTask(new Task(
                {type: ExecutorApi.codeCheckerType, analyzeType: AnalyzeType.analyzeProject as string},
                workspace.workspaceFolders![0],
                'Analyze project',
                'codeChecker'
            ), token)!,
            this.resolveTask(new Task(
                {type: ExecutorApi.codeCheckerType, analyzeType: AnalyzeType.analyzeFile as string},
                workspace.workspaceFolders![0],
                'Analyze current file',
                'codeChecker'
            ), token)!,
        ].filter(x => x !== undefined); // filter out undefined values - ! is needed for typechecking in the array

        console.log(tasks);

        return tasks;
    }

    resolveTask(_task: Task, token: CancellationToken): Task | undefined {
        const analyzeType: AnalyzeType = _task.definition.analyzeType;
        console.log('Resolve happened', _task.definition);
        if (analyzeType !== undefined) {
            let codeCheckerPath = workspace.getConfiguration('codechecker.runner').get<string>('executablePath');
            let codeCheckerOutput = workspace.getConfiguration('codechecker.runner').get<string>('outputFolder');
            let codeCheckerArguments = workspace.getConfiguration('codechecker.runner').get<string>('executableArguments') ?? '';

            if (codeCheckerPath === undefined || codeCheckerOutput ===  undefined) {
                return undefined;
            }

            const workspaceFolder = workspace.workspaceFolders![0].uri.fsPath;

            const replaceVariables = (path: string) => {
                return path
                    .replace(/\${workspaceRoot}/g, workspaceFolder)
                    .replace(/\${workspaceFolder}/g, workspaceFolder)
                    .replace(/\${cwd}/g, process.cwd())
                    .replace(/\${env\.([^}]+)}/g, (sub: string, envName: string) => process.env[envName] ?? '');
            };

            codeCheckerPath = replaceVariables(codeCheckerPath);
            codeCheckerOutput = replaceVariables(codeCheckerOutput);
            codeCheckerArguments = replaceVariables(codeCheckerArguments);

            const codeCheckerCompileCmd = Uri.joinPath(Uri.file(codeCheckerOutput), './compile_cmd.json').fsPath;

            let executor: ShellExecution | undefined;

            switch (analyzeType) {
                case AnalyzeType.analyzeProject: {
                    const analyzeEntireProject = `"${codeCheckerPath}" analyze "${codeCheckerCompileCmd}" -o "${codeCheckerOutput}" ${codeCheckerArguments}`;
                    executor = new ShellExecution(analyzeEntireProject);
                    break;
                }
                case AnalyzeType.analyzeFile: {
                    const targetFile = window.activeTextEditor?.document.uri.fsPath;

                    if (targetFile === undefined) {
                        if (codeCheckerPath === undefined || codeCheckerOutput ===  undefined) {
                            return undefined;
                        }
                    }

                    const analyzeSingleFile = `"${codeCheckerPath}" analyze "${codeCheckerCompileCmd}" -o "${codeCheckerOutput}" --file "${targetFile}" ${codeCheckerArguments}`;
                    executor = new ShellExecution(analyzeSingleFile);
                    break;
                }
            }

            return new Task(
                _task.definition,
                _task.scope ?? workspace.workspaceFolders![0],
                _task.name,
                _task.source,
                executor
            );
        }

        return undefined;
    }
}