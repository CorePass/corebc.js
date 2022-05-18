"use strict";

import { createHash, createHmac } from "crypto";

import { arrayify, BytesLike } from "@corepass/corebc-bytes";

import { SupportedAlgorithm } from "./types";

import { Logger } from "@corepass/corebc-logger";
import { version } from "./_version";
const logger = new Logger(version);

export function ripemd160(data: BytesLike): string {
    return "0x" + createHash("ripemd160").update(Buffer.from(arrayify(data))).digest("hex")
}

export function sha256(data: BytesLike): string {
    return "0x" + createHash("sha3-256").update(Buffer.from(arrayify(data))).digest("hex")
}

export function sha512(data: BytesLike): string {
    return "0x" + createHash("sha3-512").update(Buffer.from(arrayify(data))).digest("hex")
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
    return "";
}

