import { keccak256 } from "../crypto/keccak.js";
import { sha256 } from "../crypto/sha3.js";
import { toUtf8Bytes } from "../utils/index.js";
/**
 *  A simple hashing function which operates on UTF-8 strings to
 *  compute an 32-byte identifier.
 *
 *
 *  @example:
 *    id("hello world")
 *    //_result:
 */
export function id(value, useKeccak) {
    if (useKeccak) {
        return keccak256(toUtf8Bytes(value));
    }
    return sha256(toUtf8Bytes(value));
}
//# sourceMappingURL=id.js.map