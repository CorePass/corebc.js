/**
 *  Add details about signing here.
 *
 *  @_subsection: api/crypto:Signing  [about-signing]
 */
import type { BytesLike } from "../utils/index.js";
import type { SignatureLike } from "./index.js";
/**
 *  A **SigningKey** provides high-level access to the elliptic curve
 *  cryptography (ECC) operations and key management.
 */
export declare class SigningKey {
    #private;
    /**
     *  Creates a new **SigningKey** for %%privateKey%%.
     */
    constructor(privateKey: BytesLike);
    /**
     *  The private key.
     */
    get privateKey(): string;
    /** The 57-byte Ed448 public key encoded as hex. */
    get publicKey(): string;
    /** Compatibility alias: Ed448 has one 57-byte public-key encoding. */
    get compressedPublicKey(): string;
    /**
     *  Return the signature of the signed %%digest%%.
     */
    sign(digest: BytesLike): string;
    /** Derives an Ed448 shared secret from a 57-byte public key. Hash it before use as a symmetric key. */
    computeSharedSecret(other: BytesLike): string;
    /** Computes an Ed448 public key from a 57-byte private key. The compression flag is ignored. */
    static computePublicKey(key: BytesLike, compressed?: boolean): string;
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
    static recoverPublicKey(digest: BytesLike, signature: SignatureLike): string;
    /** Adds two encoded Ed448 public points. The compression flag is ignored. */
    static addPoints(p0: BytesLike, p1: BytesLike, compressed?: boolean): string;
}
//# sourceMappingURL=signing-key.d.ts.map