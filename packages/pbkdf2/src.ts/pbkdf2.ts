"use strict";

import { pbkdf2Sync as _pbkdf2 } from "crypto";

import { arrayify, BytesLike, hexlify } from "@corepass/corebc-bytes";

import { Logger } from "@corepass/corebc-logger";
import { version } from "./_version";
const logger = new Logger(version);

function bufferify(value: BytesLike): Buffer {
    return Buffer.from(arrayify(value));
}

export function pbkdf2(password: BytesLike, salt: BytesLike, iterations: number, keylen: number, hashAlgorithm: string): string {
    let hash: string;
    if (hashAlgorithm === "sha256") {
        hash = "sha3-256";
    } else if (hashAlgorithm === "sha512") {
        hash = "sha3-512";
    } else {
        logger.throwError("unsupported algorithm - " + hashAlgorithm, Logger.errors.UNSUPPORTED_OPERATION, {
            operation: "pbkdf2",
            algorithm: hashAlgorithm
        });
    }
    return hexlify(_pbkdf2(bufferify(password), bufferify(salt), iterations, keylen, hash));
}
