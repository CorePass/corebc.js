/**
 *  Add details about signing here.
 *
 *  @_subsection: api/crypto:Signing  [about-signing]
 */
import * as secp256k1 from "@noble/secp256k1";
import { dataLength, getBytes, getBytesCopy, hexlify, assertArgument } from "../utils/index.js";
import { arrayify, hexConcat } from "../utils/data.js";
import { Logger } from "../logger/logger.js";
import { ed448 } from "./crypto.js";
import { Buffer } from 'buffer';
const logger = new Logger('signing-key/0.0.1');
//const N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
// Make noble-secp256k1 sync
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
        assertArgument(dataLength('0x' + privateKey) === 57, "invalid private key", "privateKey", "[REDACTED]");
        this.#privateKey = hexlify('0x' + privateKey);
    }
    /**
     *  The private key.
     */
    get privateKey() { return this.#privateKey; }
    /**
     *  The uncompressed public key.
     *
     * This will always begin with the prefix ``0x04`` and be 132
     * characters long (the ``0x`` prefix and 130 hexadecimal nibbles).
     */
    get publicKey() { return SigningKey.computePublicKey(this.#privateKey); }
    /**
     *  The compressed public key.
     *
     *  This will always begin with either the prefix ``0x02`` or ``0x03``
     *  and be 68 characters long (the ``0x`` prefix and 33 hexadecimal
     *  nibbles)
     */
    get compressedPublicKey() { return SigningKey.computePublicKey(this.#privateKey, true); }
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
            const sig = ed448.signWithScalar(digestBuffer, scalar, prefix);
            const hexlified = hexlify(sig);
            return hexConcat([hexlified, this.publicKey]);
        }
        const sig = ed448.sign(Buffer.from(digestBuffer), Buffer.from(keyBuffer));
        const hexlified = hexlify(sig);
        return hexConcat([hexlified, this.publicKey]);
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
        return hexlify(secp256k1.getSharedSecret(getBytesCopy(this.#privateKey), getBytes(pubKey)));
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
        const pub0 = secp256k1.Point.fromHex(SigningKey.computePublicKey(p0).substring(2));
        const pub1 = secp256k1.Point.fromHex(SigningKey.computePublicKey(p1).substring(2));
        return "0x" + pub0.add(pub1).toHex(!!compressed);
    }
}
//# sourceMappingURL=signing-key.js.map