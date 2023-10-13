"use strict";
/**
 *  Add details about signing here.
 *
 *  @_subsection: api/crypto:Signing  [about-signing]
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SigningKey = void 0;
const tslib_1 = require("tslib");
const secp256k1 = tslib_1.__importStar(require("@noble/secp256k1"));
const index_js_1 = require("../utils/index.js");
const data_js_1 = require("../utils/data.js");
const logger_js_1 = require("../logger/logger.js");
const crypto_js_1 = require("./crypto.js");
const buffer_1 = require("buffer");
const logger = new logger_js_1.Logger("signing-key/0.0.1");
//const N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
// Make noble-secp256k1 sync
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
        let tmp = privateKey;
        if (typeof tmp === "string" && tmp.startsWith("0x")) {
            tmp = tmp.replace("0x", "");
        }
        (0, index_js_1.assertArgument)((0, index_js_1.dataLength)("0x" + tmp) === 57, "invalid private key", "privateKey", "[REDACTED]");
        this.#privateKey = (0, index_js_1.hexlify)("0x" + tmp);
    }
    /**
     *  The private key.
     */
    get privateKey() {
        return this.#privateKey;
    }
    /**
     *  The uncompressed public key.
     *
     * This will always begin with the prefix ``0x04`` and be 132
     * characters long (the ``0x`` prefix and 130 hexadecimal nibbles).
     */
    get publicKey() {
        return SigningKey.computePublicKey(this.#privateKey);
    }
    /**
     *  The compressed public key.
     *
     *  This will always begin with either the prefix ``0x02`` or ``0x03``
     *  and be 68 characters long (the ``0x`` prefix and 33 hexadecimal
     *  nibbles)
     */
    get compressedPublicKey() {
        return SigningKey.computePublicKey(this.#privateKey, true);
    }
    /**
     *  Return the signature of the signed %%digest%%.
     */
    sign(digest) {
        const key = (0, index_js_1.getBytesCopy)(this.#privateKey);
        (0, index_js_1.assertArgument)((0, index_js_1.dataLength)(digest) === 32, "invalid digest length", "digest", digest);
        const keyBuffer = new Uint8Array((0, data_js_1.arrayify)(key));
        if (keyBuffer.length !== 57) {
            logger.throwArgumentError("invalid private key", "key", "[REDACTED]");
        }
        const digestBuffer = new Uint8Array((0, data_js_1.arrayify)(digest));
        if (digestBuffer.length !== 32) {
            logger.throwArgumentError("bad digest length", "digest", digest);
        }
        if (keyBuffer[56] > 127) {
            const prefix = keyBuffer.slice(0, 57);
            prefix[0] &= 0xfc;
            prefix[55] |= 0x80;
            prefix[56] = 0;
            const scalar = prefix.slice(0, 56);
            const bufferDigest = buffer_1.Buffer.from(digestBuffer);
            const bufferPrfx = buffer_1.Buffer.from(prefix);
            const bufferScalar = buffer_1.Buffer.from(scalar);
            const sig = crypto_js_1.ed448.signWithScalar(bufferDigest, bufferScalar, bufferPrfx);
            const hexlified = (0, index_js_1.hexlify)(sig);
            return (0, data_js_1.hexConcat)([hexlified, this.publicKey]);
        }
        const sig = crypto_js_1.ed448.sign(buffer_1.Buffer.from(digestBuffer), buffer_1.Buffer.from(keyBuffer));
        const hexlified = (0, index_js_1.hexlify)(sig);
        return (0, data_js_1.hexConcat)([hexlified, this.publicKey]);
    }
    /**
     *  Returns the [[link-wiki-ecdh]] shared secret between this
     *  private key and the %%other%% key.
     *
     *  The %%other%% key may be any type of key, a raw public key,
     *  a compressed/uncompressed pubic key or aprivate key.
     *
     *  Best practice is usually to use a cryptographic hash on the
     *  returned value before using it as a symetric secret.
     *
     *  @example:
     *    sign1 = new SigningKey(id("some-secret-1"))
     *    sign2 = new SigningKey(id("some-secret-2"))
     *
     *    // Notice that privA.computeSharedSecret(pubB)...
     *    sign1.computeSharedSecret(sign2.publicKey)
     *    //_result:
     *
     *    // ...is equal to privB.computeSharedSecret(pubA).
     *    sign2.computeSharedSecret(sign1.publicKey)
     *    //_result:
     */
    computeSharedSecret(other) {
        const pubKey = SigningKey.computePublicKey(other);
        return (0, index_js_1.hexlify)(secp256k1.getSharedSecret((0, index_js_1.getBytesCopy)(this.#privateKey), (0, index_js_1.getBytes)(pubKey)));
    }
    /**
     *  Compute the public key for %%key%%, optionally %%compressed%%.
     *
     *  The %%key%% may be any type of key, a raw public key, a
     *  compressed/uncompressed public key or private key.
     *
     *  @example:
     *    sign = new SigningKey(id("some-secret"));
     *
     *    // Compute the uncompressed public key for a private key
     *    SigningKey.computePublicKey(sign.privateKey)
     *    //_result:
     *
     *    // Compute the compressed public key for a private key
     *    SigningKey.computePublicKey(sign.privateKey, true)
     *    //_result:
     *
     *    // Compute the uncompressed public key
     *    SigningKey.computePublicKey(sign.publicKey, false);
     *    //_result:
     *
     *    // Compute the Compressed a public key
     *    SigningKey.computePublicKey(sign.publicKey, true);
     *    //_result:
     */
    static computePublicKey(key, compressed) {
        const bytes = buffer_1.Buffer.from((0, data_js_1.arrayify)(key));
        if (bytes.length !== 57) {
            logger.throwArgumentError("invalid private key", "key", "[REDACTED]");
        }
        if (bytes[56] > 127) {
            const scalar = bytes.slice(0, 56);
            scalar[0] &= 0xfc;
            scalar[55] |= 0x80;
            const pub = crypto_js_1.ed448.publicKeyFromScalar(scalar);
            return (0, index_js_1.hexlify)(pub);
        }
        const pub = crypto_js_1.ed448.publicKeyCreate(bytes);
        return (0, index_js_1.hexlify)(pub);
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
        (0, index_js_1.assertArgument)((0, index_js_1.dataLength)(digest) === 32, "invalid digest length", "digest", digest);
        const digestBuffer = buffer_1.Buffer.from((0, data_js_1.arrayify)(digest));
        const sigBuffer = buffer_1.Buffer.from((0, data_js_1.arrayify)(signature));
        if (sigBuffer.length !== 171) {
            logger.throwArgumentError("invalid signature", "signature", signature);
        }
        const sig = sigBuffer.slice(0, 114);
        const pub = sigBuffer.slice(114);
        if (crypto_js_1.ed448.verify(digestBuffer, sig, pub)) {
            return (0, index_js_1.hexlify)(pub);
        }
        logger.throwArgumentError("invalid signature", "signature", signature);
        return "";
    }
    /**
     *  Returns the point resulting from adding the ellipic curve points
     *  %%p0%% and %%p1%%.
     *
     *  This is not a common function most developers should require, but
     *  can be useful for certain privacy-specific techniques.
     *
     *  For example, it is used by [[HDNodeWallet]] to compute child
     *  addresses from parent public keys and chain codes.
     */
    static addPoints(p0, p1, compressed) {
        const pub0 = secp256k1.ProjectivePoint.fromHex(SigningKey.computePublicKey(p0).substring(2));
        const pub1 = secp256k1.ProjectivePoint.fromHex(SigningKey.computePublicKey(p1).substring(2));
        return "0x" + pub0.add(pub1).toHex(!!compressed);
    }
}
exports.SigningKey = SigningKey;
//# sourceMappingURL=signing-key.js.map