import { MessagePrefix } from "../constants/index.js";
import { recoverAddress } from "../transaction/index.js";
import { concat, toUtf8Bytes } from "../utils/index.js";
import { sha256 } from "../crypto/index.js";
/**
 *  Computes the [[link-eip-191]] personal-sign message digest to sign.
 *
 *
 *  If %%message%% is a string, it is converted to its UTF-8 bytes
 *  first. To compute the digest of a [[DataHexString]], it must be converted
 *  to [bytes](getBytes).
 *
 *  @example:
 *    hashMessage("Hello World")
 *    //_result:
 *
 *    // Hashes the SIX (6) string characters, i.e.
 *    // [ "0", "x", "4", "2", "4", "3" ]
 *    hashMessage("0x4243")
 *    //_result:
 *
 *    // Hashes the TWO (2) bytes [ 0x42, 0x43 ]...
 *    hashMessage(getBytes("0x4243"))
 *    //_result:
 *
 *    // ...which is equal to using data
 *    hashMessage(new Uint8Array([ 0x42, 0x43 ]))
 *    //_result:
 *
 */
export function hashMessage(message) {
    if (typeof (message) === "string") {
        message = toUtf8Bytes(message);
    }
    return sha256(concat([
        toUtf8Bytes(MessagePrefix),
        toUtf8Bytes(String(message.length)),
        message
    ]));
}
/**
 *  Return the address of the private key that produced
 *  the signature %%sig%% during signing for %%message%%.
 */
export function verifyMessage(message, sig, prefix) {
    const digest = hashMessage(message);
    return recoverAddress(digest, sig, prefix);
}
//# sourceMappingURL=message.js.map