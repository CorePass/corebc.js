'use strict';

require('../utils/base58.js');
var data = require('../utils/data.js');
var errors = require('../utils/errors.js');
var logger$1 = require('../logger/logger.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');
var ed448 = require('./ed448.js');
var buffer = require('buffer');
require('bcrypto/lib/pbkdf2.js');
require('bcrypto/lib/sha3-512.js');
require('crypto');

/**
 *  Add details about signing here.
 *
 *  @_subsection: api/crypto:Signing  [about-signing]
 */
const logger = new logger$1.Logger("signing-key/0.0.1");
/**
 *  A **SigningKey** provides high-level access to the elliptic curve
 *  cryptography (ECC) operations and key management.
 */
class SigningKey {
    #privateKey;
    /**
     *  Creates a new **SigningKey** for %%privateKey%%.
     */
    constructor(privateKey) {
        const normalized = typeof privateKey === "string" && !privateKey.startsWith("0x")
            ? "0x" + privateKey
            : privateKey;
        errors.assertArgument(data.dataLength(normalized) === 57, "invalid private key", "privateKey", "[REDACTED]");
        this.#privateKey = data.hexlify(normalized);
    }
    /**
     *  The private key.
     */
    get privateKey() {
        return this.#privateKey;
    }
    /** The 57-byte Ed448 public key encoded as hex. */
    get publicKey() {
        return SigningKey.computePublicKey(this.#privateKey);
    }
    /** Compatibility alias: Ed448 has one 57-byte public-key encoding. */
    get compressedPublicKey() {
        return SigningKey.computePublicKey(this.#privateKey, true);
    }
    /**
     *  Return the signature of the signed %%digest%%.
     */
    sign(digest) {
        const key = data.getBytesCopy(this.#privateKey);
        errors.assertArgument(data.dataLength(digest) === 32, "invalid digest length", "digest", digest);
        const keyBuffer = new Uint8Array(data.arrayify(key));
        if (keyBuffer.length !== 57) {
            logger.throwArgumentError("invalid private key", "key", "[REDACTED]");
        }
        const digestBuffer = new Uint8Array(data.arrayify(digest));
        if (digestBuffer.length !== 32) {
            logger.throwArgumentError("bad digest length", "digest", digest);
        }
        if (keyBuffer[56] > 127) {
            const prefix = keyBuffer.slice(0, 57);
            prefix[0] &= 0xfc;
            prefix[55] |= 0x80;
            prefix[56] = 0;
            const scalar = prefix.slice(0, 56);
            const bufferDigest = buffer.Buffer.from(digestBuffer);
            const bufferPrfx = buffer.Buffer.from(prefix);
            const bufferScalar = buffer.Buffer.from(scalar);
            const sig = ed448.default.signWithScalar(bufferDigest, bufferScalar, bufferPrfx);
            const hexlified = data.hexlify(sig);
            return data.hexConcat([hexlified, this.publicKey]);
        }
        const sig = ed448.default.sign(buffer.Buffer.from(digestBuffer), buffer.Buffer.from(keyBuffer));
        const hexlified = data.hexlify(sig);
        return data.hexConcat([hexlified, this.publicKey]);
    }
    /** Derives an Ed448 shared secret from a 57-byte public key. Hash it before use as a symmetric key. */
    computeSharedSecret(other) {
        const pub = buffer.Buffer.from(data.getBytesCopy(other));
        errors.assertArgument(pub.length === 57 && ed448.default.publicKeyVerify(pub), "invalid public key", "other", other);
        const key = buffer.Buffer.from(data.getBytesCopy(this.#privateKey));
        if (key[56] > 127) {
            const scalar = key.subarray(0, 56);
            scalar[0] &= 0xfc;
            scalar[55] |= 0x80;
            return data.hexlify(ed448.default.deriveWithScalar(pub, scalar));
        }
        return data.hexlify(ed448.default.derive(pub, key));
    }
    /** Computes an Ed448 public key from a 57-byte private key. The compression flag is ignored. */
    static computePublicKey(key, compressed) {
        const bytes = buffer.Buffer.from(data.arrayify(key));
        if (bytes.length !== 57) {
            logger.throwArgumentError("invalid private key", "key", "[REDACTED]");
        }
        if (bytes[56] > 127) {
            const scalar = bytes.slice(0, 56);
            scalar[0] &= 0xfc;
            scalar[55] |= 0x80;
            const pub = ed448.default.publicKeyFromScalar(scalar);
            return data.hexlify(pub);
        }
        const pub = ed448.default.publicKeyCreate(bytes);
        return data.hexlify(pub);
    }
    /**
     *  Returns the public key for the private key which produced the
     *  %%signature%% for the given %%digest%%.
     *
     *  @example:
     *    key = new SigningKey(id("some-secret"))
     *    digest = id("hello world")
     *    sig = key.sign(digest)
     *
     *    // Notice the signer public key...
     *    key.publicKey
     *    //_result:
     *
     *    // ...is equal to the recovered public key
     *    SigningKey.recoverPublicKey(digest, sig)
     *    //_result:
     *
     */
    static recoverPublicKey(digest, signature) {
        errors.assertArgument(data.dataLength(digest) === 32, "invalid digest length", "digest", digest);
        const digestBuffer = buffer.Buffer.from(data.arrayify(digest));
        const sigBuffer = buffer.Buffer.from(data.arrayify(signature));
        if (sigBuffer.length !== 171) {
            logger.throwArgumentError("invalid signature", "signature", signature);
        }
        const sig = sigBuffer.slice(0, 114);
        const pub = sigBuffer.slice(114);
        if (ed448.default.verify(digestBuffer, sig, pub)) {
            return data.hexlify(pub);
        }
        logger.throwArgumentError("invalid signature", "signature", signature);
        return "";
    }
    /** Adds two encoded Ed448 public points. The compression flag is ignored. */
    static addPoints(p0, p1, compressed) {
        const points = [p0, p1].map((point) => {
            const bytes = buffer.Buffer.from(data.getBytesCopy(point));
            errors.assertArgument(bytes.length === 57 && ed448.default.publicKeyVerify(bytes), "invalid public key", "point", point);
            return bytes;
        });
        return data.hexlify(ed448.default.publicKeyCombine(points));
    }
}

exports.SigningKey = SigningKey;
//# sourceMappingURL=signing-key.js.map
