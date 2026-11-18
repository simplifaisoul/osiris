/*!
 * content-type
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */
/**
 * The content type object contains a type string and optional parameters.
 */
export interface ContentType {
    type: string;
    index: number;
    parameters: Record<string, string>;
}
/**
 * Format an object into a `Content-Type` header.
 */
export declare function format(obj: Partial<ContentType>): string;
/**
 * Options for parsing a `Content-Type` header.
 */
export interface ParseOptions {
    /**
     * Exit early on the first semicolon, returning only the type.
     * This is useful for parsing the MIME from `Content-Type` headers.
     *
     * @default false
     */
    parameters?: boolean;
    /**
     * Exits early on a comma, returning the first value and parameters.
     * This is useful for parsing `Accept` headers.
     *
     * @default false
     */
    comma?: boolean;
    /**
     * The index to start parsing from.
     *
     * @default 0
     */
    start?: number;
}
/**
 * Parse a `Content-Type` header.
 */
export declare function parse(header: string, options?: ParseOptions): ContentType;
