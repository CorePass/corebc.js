declare const _randomBytes: (length: number) => Uint8Array;
/**
 *  Return %%length%% bytes of cryptographically secure random data.
 *
 *  @example:
 *    randomBytes(8)
 *    //_result:
 */
export declare function randomBytes(length: number): Uint8Array;
export declare namespace randomBytes {
    export { _randomBytes as _ };
    export var lock: () => void;
    export var register: (func: (length: number) => Uint8Array) => void;
}
export {};
//# sourceMappingURL=random.d.ts.map