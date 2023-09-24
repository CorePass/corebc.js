/**
 *  A fundamental building block of Core is the underlying
 *  cryptographic primitives.
 *
 *  @_section: api/crypto:Cryptographic Functions   [about-crypto]
 */
import { computeHmac } from "./hmac.js";
import { ripemd160 } from "./ripemd160.js";
import { pbkdf2 } from "./pbkdf2.js";
import { randomBytes } from "./random.js";
import { scrypt, scryptSync } from "./scrypt.js";
import { sha256, sha512 } from "./sha3.js";
import { Ed448Goldilock } from "./crypto.js";
import { keccak256 } from "./keccak.js";
export { computeHmac, randomBytes, ripemd160, sha256, sha512, pbkdf2, scrypt, scryptSync, keccak256, Ed448Goldilock, };
export { SigningKey } from "./signing-key.js";
export { Signature } from "./signature.js";
declare function lock(): void;
export { lock };
export type { ProgressCallback } from "./scrypt.js";
export type { SignatureLike } from "./signature.js";
//# sourceMappingURL=index.d.ts.map