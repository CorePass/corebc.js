import { getAddress } from "../address/index.js";
import {  sha256, SigningKey } from "../crypto/index.js";

import type { SignatureLike } from "../crypto/index.js";
import type { BytesLike } from "../utils/index.js";
import { arrayify, hexDataSlice } from "../utils/data.js";
import { calculateCheckSum } from "../address/index.js";

/**
 *  Returns the address for the %%key%%.
 *
 *  The key may be any standard form of public key or a private key.
 */

export function removeHexPrefix(val: string): string {
    return val.substring(0, 2) === "0x" ? val.substring(2) : val;
}


 export function publicToAddress(key: BytesLike | string, prefix: string): string {
    const val = hexDataSlice(sha256(key), 12)
    const checksum = calculateCheckSum(val, prefix);
    return "0x" + prefix + checksum + removeHexPrefix(val);
};


export function computeAddress(key: string | SigningKey,prefix:string): string {
    let pubkey: string;
    if (typeof(key) === "string") {
        pubkey = SigningKey.computePublicKey(key, false);
    } else {
        pubkey = key.publicKey;
    }
    return  publicToAddress(pubkey, prefix) // getAddress(sha256("0x" + pubkey.substring(4)).substring(26));
}

/**
 *  Returns the recovered address for the private key that was
 *  used to sign %%digest%% that resulted in %%signature%%.
 */
export function recoverAddress(digest: BytesLike, signature: SignatureLike,prefix: string): string {
    // return computeAddress(SigningKey.recoverPublicKey(digest, signature));
    const publicKey = SigningKey.recoverPublicKey(arrayify(digest), signature);
    return publicToAddress(publicKey, prefix);
}
export function extractPrefix(address: string): string {
    address = getAddress(address);
    return address.substring(2, 4);
}
