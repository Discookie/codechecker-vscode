import { Disposable, Event } from 'vscode';

export function asyncWaitForEvent<T>(event: Event<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let disposable: Disposable;

        const callback = (param: T) => {
            disposable.dispose();
            resolve(param);
        };
        
        disposable = event(callback);
    });
};

export function timeout(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}