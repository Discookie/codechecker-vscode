/* eslint-disable @typescript-eslint/naming-convention */

export interface AggregateLocation {
    readonly file: string;
    readonly line: number;
    readonly col: number;
}

export interface AggregateEntry {
    readonly description: string;
    readonly location: AggregateLocation;

    readonly category: string;
    readonly analyzer_name: string;
    readonly path_length: number;
}

export interface AggregateData {
    readonly name: string;
    readonly timestamps: {begin: Date, end: Date};

    readonly entries: AggregateEntry[];
    readonly analyzers: string[];

    readonly action_num: number;
    readonly skipped: number;
}