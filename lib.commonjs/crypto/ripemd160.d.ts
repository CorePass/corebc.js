import type { BytesLike } from "../utils/index.js";
declare const _ripemd160: (data: Uint8Array) => Uint8Array;
/**
 *  Compute the cryptographic RIPEMD-160 hash of %%data%%.
 *
 *  @_docloc: api/crypto:Hash Functions
 *  @returns DataHexstring
 *
 *  @example:
 *    ripemd160("0x")
 *    //_result:
 *
 *    ripemd160("0x1337")
 *    //_result:
 *
 *    ripemd160(new Uint8Array([ 0x13, 0x37 ]))
 *    //_result:
 *
 */
export declare function ripemd160(_data: BytesLike): string;
export declare namespace ripemd160 {
    export { _ripemd160 as _ };
    export var lock: () => void;
    export var register: (func: (data: Uint8Array) => BytesLike) => void;
}
export {};
//# sourceMappingURL=ripemd160.d.ts.map