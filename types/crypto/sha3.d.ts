import { BytesLike } from "../utils/data.js";
declare const _sha256: (data: Uint8Array) => string;
declare const _sha512: (data: Uint8Array) => string;
/**
 *  Compute the cryptographic SHA3-256 hash of %%data%%.
 *
 *  @_docloc: api/crypto:Hash Functions
 *  @returns DataHexstring
 *
 *  @example:
 *    sha256("0x")
 *    //_result:
 *
 *    sha256("0x1337")
 *    //_result:
 *
 *    sha256(new Uint8Array([ 0x13, 0x37 ]))
 *    //_result:
 *
 */
export declare enum SupportedAlgorithm {
    sha256 = "sha256",
    sha512 = "sha512"
}
export declare function ripemd160(data: BytesLike): string;
export declare function sha256(data: BytesLike): string;
export declare namespace sha256 {
    export { _sha256 as _ };
    export var lock: () => void;
    export var register: (func: (data: Uint8Array) => BytesLike) => void;
}
export declare function legacySha256(data: BytesLike): string;
export declare function computeHmac(algorithm: SupportedAlgorithm, key: BytesLike, data: BytesLike): string;
/**
 *  Compute the cryptographic SHA3-512 hash of %%data%%.
 *
 *  @_docloc: api/crypto:Hash Functions
 *  @returns DataHexstring
 *
 *  @example:
 *    sha512("0x")
 *    //_result:
 *
 *    sha512("0x1337")
 *    //_result:
 *
 *    sha512(new Uint8Array([ 0x13, 0x37 ]))
 *    //_result:
 */
export declare function sha512(data: BytesLike): string;
export declare namespace sha512 {
    export { _sha512 as _ };
    export var lock: () => void;
    export var register: (func: (data: Uint8Array) => BytesLike) => void;
}
export {};
//# sourceMappingURL=sha3.d.ts.map