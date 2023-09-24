"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPrefix = exports.recoverAddress = exports.computeAddress = exports.publicToAddress = exports.removeHexPrefix = void 0;
const index_js_1 = require("../address/index.js");
const index_js_2 = require("../crypto/index.js");
const data_js_1 = require("../utils/data.js");
const index_js_3 = require("../address/index.js");
/**
 *  Returns the address for the %%key%%.
 *
 *  The key may be any standard form of public key or a private key.
 */
function removeHexPrefix(val) {
    return val.substring(0, 2) === "0x" ? val.substring(2) : val;
}
exports.removeHexPrefix = removeHexPrefix;
function publicToAddress(key, prefix) {
    const val = (0, data_js_1.hexDataSlice)((0, index_js_2.sha256)(key), 12);
    const checksum = (0, index_js_3.calculateCheckSum)(val, prefix);
    return "0x" + prefix + checksum + removeHexPrefix(val);
}
exports.publicToAddress = publicToAddress;
function computeAddress(key, prefix) {
    let pubkey;
    if (typeof key === "string") {
        pubkey = index_js_2.SigningKey.computePublicKey(key, false);
    }
    else {
        pubkey = key.publicKey;
    }
    return publicToAddress(pubkey, prefix); // getAddress(sha256("0x" + pubkey.substring(4)).substring(26));
}
exports.computeAddress = computeAddress;
/**
 *  Returns the recovered address for the private key that was
 *  used to sign %%digest%% that resulted in %%signature%%.
 */
function recoverAddress(digest, signature, prefix) {
    // return computeAddress(SigningKey.recoverPublicKey(digest, signature));
    const publicKey = index_js_2.SigningKey.recoverPublicKey((0, data_js_1.arrayify)(digest), signature);
    return publicToAddress(publicKey, prefix);
}
exports.recoverAddress = recoverAddress;
function extractPrefix(address) {
    address = (0, index_js_1.getAddress)(address);
    return address.substring(2, 4);
}
exports.extractPrefix = extractPrefix;
//# sourceMappingURL=address.js.map