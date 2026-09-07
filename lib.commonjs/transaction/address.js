'use strict';

var index = require('../address/index.js');
require('../crypto/hmac.js');
require('../crypto/ripemd160.js');
require('../crypto/pbkdf2.js');
require('../crypto/random.js');
require('../crypto/scrypt.js');
var sha3 = require('../crypto/sha3.js');
require('bcrypto/lib/ed448.js');
require('buffer');
require('bcrypto/lib/pbkdf2.js');
require('bcrypto/lib/sha3-512.js');
require('crypto');
require('../crypto/keccak.js');
var signingKey = require('../crypto/signing-key.js');
require('../crypto/signature.js');
var data = require('../utils/data.js');

/**
 *  Returns the address for the %%key%%.
 *
 *  The key may be any standard form of public key or a private key.
 */
function removeHexPrefix(val) {
    return val.substring(0, 2) === "0x" ? val.substring(2) : val;
}
function publicToAddress(key, prefix) {
    const val = data.hexDataSlice(sha3.sha256(key), 12);
    const checksum = index.calculateCheckSum(val, prefix);
    return "0x" + prefix + checksum + removeHexPrefix(val);
}
function computeAddress(key, prefix) {
    let pubkey;
    if (typeof key === "string") {
        pubkey = signingKey.SigningKey.computePublicKey(key, false);
    }
    else {
        pubkey = key.publicKey;
    }
    return publicToAddress(pubkey, prefix); // getAddress(sha256("0x" + pubkey.substring(4)).substring(26));
}
/**
 *  Returns the recovered address for the private key that was
 *  used to sign %%digest%% that resulted in %%signature%%.
 */
function recoverAddress(digest, signature, prefix) {
    // return computeAddress(SigningKey.recoverPublicKey(digest, signature));
    const publicKey = signingKey.SigningKey.recoverPublicKey(data.arrayify(digest), signature);
    return publicToAddress(publicKey, prefix);
}
function extractPrefix(address) {
    address = index.getAddress(address);
    return address.substring(2, 4);
}

exports.computeAddress = computeAddress;
exports.extractPrefix = extractPrefix;
exports.publicToAddress = publicToAddress;
exports.recoverAddress = recoverAddress;
exports.removeHexPrefix = removeHexPrefix;
//# sourceMappingURL=address.js.map
