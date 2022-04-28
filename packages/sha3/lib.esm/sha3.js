"use strict";
// @ts-ignore
import _ripemd160 from 'bcrypto/lib/ripemd160-browser';
// @ts-ignore
import sha3 from 'bcrypto/lib/sha3-browser';
import { arrayify, hexlify } from "@ethersproject/bytes";
import { SupportedAlgorithm } from "./types";
import { Logger } from "@ethersproject/logger";
import { version } from "./_version";
const logger = new Logger(version);
export function ripemd160(data) {
    const d = Buffer.from(arrayify(data));
    const h = _ripemd160.digest(d);
    return hexlify(h);
}
export function sha256(data) {
    const d = Buffer.from(arrayify(data));
    const h = sha3.digest(d, 256);
    return hexlify(h);
}
export function sha512(data) {
    const d = Buffer.from(arrayify(data));
    const h = sha3.digest(d, 512);
    return hexlify(h);
}
export function computeHmac(algorithm, key, data) {
    const d = Buffer.from(arrayify(data));
    const k = Buffer.from(arrayify(key));
    if (algorithm === SupportedAlgorithm.sha256) {
        return hexlify(sha3.mac(d, k, 256));
    }
    else if (algorithm === SupportedAlgorithm.sha512) {
        return hexlify(sha3.mac(d, k, 512));
    }
    logger.throwError("unsupported algorithm - " + algorithm, Logger.errors.UNSUPPORTED_OPERATION, {
        operation: "computeHmac",
        algorithm: algorithm
    });
    return "";
}
//# sourceMappingURL=sha3.js.map