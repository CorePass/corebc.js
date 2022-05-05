"use strict";

import ed448 from './ed448';

import { arrayify, BytesLike, hexConcat, hexlify } from "@ethersproject/bytes";
import { defineReadOnly } from "@ethersproject/properties";

import { Logger } from "@ethersproject/logger";
import { version } from "./_version";
const logger = new Logger(version);

export class SigningKey {
    readonly privateKey: string;
    readonly publicKey: string;

    readonly _isSigningKey: boolean;

    constructor(privateKey: BytesLike) {
        defineReadOnly(this, "privateKey", hexlify(privateKey));

        defineReadOnly(this, "publicKey", computePublicKey(privateKey));

        defineReadOnly(this, "_isSigningKey", true);
    }

    signDigest(digest: BytesLike): string {
        const pub = computePublicKey(this.privateKey);
        const sig = sign(this.privateKey, digest);
        return hexConcat([sig, pub]);
    }

    static isSigningKey(value: any): value is SigningKey {
        return !!(value && value._isSigningKey);
    }
}

function sign(key: BytesLike, digest: BytesLike): string {
    const keyBuffer = Buffer.from(arrayify(key));
    if (keyBuffer.length !== 57) {
        logger.throwArgumentError("invalid private key", "key", "[REDACTED]");
    }

    const digestBuffer = Buffer.from(arrayify(digest));
    if (digestBuffer.length !== 32) {
        logger.throwArgumentError("bad digest length", "digest", digest);
    }

    if (keyBuffer[56] > 127) {
        const prefix = keyBuffer.slice(0, 57);
        prefix[0] &= 0xfc;
        prefix[55] |= 0x80;
        prefix[56] = 0;
        const scalar = prefix.slice(0, 56);
        const sig = ed448.signWithScalar(digestBuffer, scalar, prefix);
        return hexlify(sig);
    }

    const sig = ed448.sign(digestBuffer, keyBuffer);
    return hexlify(sig);
}

export function recoverPublicKey(digest: BytesLike, signature: string): string {
    const digestBuffer = Buffer.from(arrayify(digest));
    if (digestBuffer.length !== 32) {
        logger.throwArgumentError("bad digest length", "digest", digest);
    }

    const sigBuffer = Buffer.from(arrayify(signature));
    if (sigBuffer.length !== 171) {
        logger.throwArgumentError("invalid signature", "signature", signature);
    }

    const sig = sigBuffer.slice(0, 114);
    const pub = sigBuffer.slice(114);
    if (ed448.verify(digestBuffer, sig, pub)) {
        return hexlify(pub);
    }
    logger.throwArgumentError("invalid signature", "signature", signature);
    return "";
}

export function computePublicKey(key: BytesLike): string {
    const bytes = Buffer.from(arrayify(key));
    if (bytes.length !== 57) {
        logger.throwArgumentError("invalid private key", "key", "[REDACTED]");
    }

    if (bytes[56] > 127) {
        const scalar = bytes.slice(0, 56);
        scalar[0] &= 0xfc;
        scalar[55] |= 0x80;
        const pub = ed448.publicKeyFromScalar(scalar);
        return hexlify(pub);
    }

    const pub = ed448.publicKeyCreate(bytes);
    return hexlify(pub);
}
