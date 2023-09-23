import { Logger } from "../logger/logger.js";
import { arrayify, BytesLike, getBytes, hexlify } from "../utils/data.js";
import { createHash, createHmac } from "./crypto.js";
import { Buffer } from 'buffer';

const logger=new Logger('sha3/0.0.1')


const _sha256 = function(data: Uint8Array): string {
    let v="0x" + createHash("sha3-256").update(Buffer.from(arrayify(data))).digest("hex")
    return v
}

const _sha512 = function(data: Uint8Array): string {
    let v="0x" + createHash("sha3-512").update(Buffer.from(arrayify(data))).digest("hex")
    return v
}

// @ts-ignore
let __sha256: (data: Uint8Array) => BytesLike = _sha256;
// @ts-ignore
let __sha512: (data: Uint8Array) => BytesLike = _sha512;

let locked256 = false, locked512 = false;


/**
 *  Compute the cryptographic SHA2-256 hash of %%data%%.
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
 export enum SupportedAlgorithm { sha256 = "sha256", sha512 = "sha512" };

 export function ripemd160(data: BytesLike): string {
    let createdHash="0x" + createHash("ripemd160").update(Buffer.from(arrayify(data))).digest("hex")
    const v= "0x" + createdHash
    if(typeof createdHash!=='string'){
        createdHash=hexlify(createdHash)
        return createdHash
    }
    return v
 }

 export function sha256(data: BytesLike): string {
    let createdHash=createHash("sha3-256").update(Buffer.from(arrayify(data))).digest("hex")
    const v= "0x" + createdHash
    if(typeof createdHash!=='string'){
        createdHash=hexlify(createdHash)
        return createdHash
    }
    return v
 }

export function legacySha256(data: BytesLike): string {
    const _data = getBytes(data, "data");
    const hexlified=hexlify(createHash("sha256").update(_data).digest());
    return hexlified
}

export function computeHmac(algorithm: SupportedAlgorithm, key: BytesLike, data: BytesLike): string {
    const d = Buffer.from(arrayify(data));
    const k = Buffer.from(arrayify(key));
    if (algorithm === SupportedAlgorithm.sha256) {
        return "0x" + createHmac("sha3-256", k).update(d).digest("hex");
    } else if (algorithm === SupportedAlgorithm.sha512) {
        return "0x" + createHmac("sha3-512", k).update(d).digest("hex");
    }

    logger.throwError("unsupported algorithm - " + algorithm, Logger.errors.UNSUPPORTED_OPERATION, {
        operation: "computeHmac",
        algorithm: algorithm
    });
    return ""
}

sha256._ = _sha256;
sha256.lock = function(): void { locked256 = true; }
sha256.register = function(func: (data: Uint8Array) => BytesLike): void {
    if (locked256) { throw new Error("sha256 is locked"); }
    __sha256 = func;
}
Object.freeze(sha256);


/**
 *  Compute the cryptographic SHA2-512 hash of %%data%%.
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

export function sha512(data: BytesLike): string {
    let createdHash=createHash("sha3-512").update(Buffer.from(arrayify(data))).digest("hex")
    const v= "0x" + createdHash
    if(typeof createdHash!=='string'){
        createdHash=hexlify(createdHash)
        return createdHash
    }
    return v
}
sha512._ = _sha512;
sha512.lock = function(): void { locked512 = true; }
sha512.register = function(func: (data: Uint8Array) => BytesLike): void {
    if (locked512) { throw new Error("sha512 is locked"); }
    __sha512 = func;
}
Object.freeze(sha256);
