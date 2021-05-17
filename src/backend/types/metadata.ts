/* eslint-disable @typescript-eslint/naming-convention */

export interface AnalyzerMetadataStats {
    readonly version: string;

    readonly failed: number;
    readonly failed_sources: string[];
    readonly successful: number;
    readonly successful_sources: string[];
}

export interface AnalyzerMetadata {
    readonly checkers: {[checkerEnabled: string]: boolean};
    readonly analyzer_statistics: AnalyzerMetadataStats;
}

export interface CheckerMetadata {
    readonly name: string;
    readonly timestamp: {begin: number, end: number};
    
    readonly command: string;
    readonly version: string;
    
    readonly working_directory: string;
    readonly output_path: string;
    
    readonly result_source_files: {[analysisPath: string]: string};
    readonly analyzers: {[analyzerName: string]: AnalyzerMetadata};
    
    readonly action_num: number;
    readonly skipped: number;
}

export interface MetadataFile {
    readonly version: 2;
    readonly tools: CheckerMetadata[];
}