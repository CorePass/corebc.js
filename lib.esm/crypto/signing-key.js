/**
 *  Add details about signing here.
 *
 *  @_subsection: api/crypto:Signing  [about-signing]
 */
import { dataLength, getBytesCopy, hexlify, assertArgument, } from "../utils/index.js";
import { arrayify, hexConcat } from "../utils/data.js";
import { Logger } from "../logger/logger.js";
import { ed448 } from "./crypto.js";
import { Buffer } from "buffer";
const logger = new Logger("signing-key/0.0.1");
/**
 *  A **SigningKey** provides high-level access to the elliptic curve
 *  cryptography (ECC) operations and key management.
 */
export class SigningKey {
    #privateKey;
    /**
     *  Creates a new **SigningKey** for %%privateKey%%.
     */
    constructor(privateKey) {
        const normalized = typeof privateKey === "string" && !privateKey.startsWith("0x")
            ? "0x" + privateKey
            : privateKey;
        assertArgument(dataLength(normalized) === 57, "invalid private key", "privateKey", "[REDACTED]");
        this.#privateKey = hexlify(normalized);
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
        const key = getBytesCopy(this.#privateKey);
        assertArgument(dataLength(digest) === 32, "invalid digest length", "digest", digest);
        const keyBuffer = new Uint8Array(arrayify(key));
        if (keyBuffer.length !== 57) {
            logger.throwArgumentError("invalid private key", "key", "[REDACTED]");
        }
        const digestBuffer = new Uint8Array(arrayify(digest));
        if (digestBuffer.length !== 32) {
            logger.throwArgumentError("bad digest length", "digest", digest);
        }
        if (keyBuffer[56] > 127) {
            const prefix = keyBuffer.slice(0, 57);
            prefix[0] &= 0xfc;
            prefix[55] |= 0x80;
            prefix[56] = 0;
            const scalar = prefix.slice(0, 56);
            const bufferDigest = Buffer.from(digestBuffer);
            const bufferPrfx = Buffer.from(prefix);
            const bufferScalar = Buffer.from(scalar);
            const sig = ed448.signWithScalar(bufferDigest, bufferScalar, bufferPrfx);
            const hexlified = hexlify(sig);
            return hexConcat([hexlified, this.publicKey]);
        }
        const sig = ed448.sign(Buffer.from(digestBuffer), Buffer.from(keyBuffer));
        const hexlified = hexlify(sig);
        return hexConcat([hexlified, this.publicKey]);
    }
    /** Derives an Ed448 shared secret from a 57-byte public key. Hash it before use as a symmetric key. */
    computeSharedSecret(other) {
        const pub = Buffer.from(getBytesCopy(other));
        assertArgument(pub.length === 57 && ed448.publicKeyVerify(pub), "invalid public key", "other", other);
        const key = Buffer.from(getBytesCopy(this.#privateKey));
        if (key[56] > 127) {
            const scalar = key.subarray(0, 56);
            scalar[0] &= 0xfc;
            scalar[55] |= 0x80;
            return hexlify(ed448.deriveWithScalar(pub, scalar));
        }
        return hexlify(ed448.derive(pub, key));
    }
    /** Computes an Ed448 public key from a 57-byte private key. The compression flag is ignored. */
    static computePublicKey(key, compressed) {
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
        assertArgument(dataLength(digest) === 32, "invalid digest length", "digest", digest);
        const digestBuffer = Buffer.from(arrayify(digest));
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
    /** Adds two encoded Ed448 public points. The compression flag is ignored. */
    static addPoints(p0, p1, compressed) {
        const points = [p0, p1].map((point) => {
            const bytes = Buffer.from(getBytesCopy(point));
            assertArgument(bytes.length === 57 && ed448.publicKeyVerify(bytes), "invalid public key", "point", point);
            return bytes;
        });
        return hexlify(ed448.publicKeyCombine(points));
    }
}
//# sourceMappingURL=signing-key.js.map