'use strict';

require('../constants/numbers.js');
var strings = require('../constants/strings.js');
require('../address/index.js');
require('../utils/base58.js');
var data = require('../utils/data.js');
require('../utils/errors.js');
require('../logger/logger.js');
var utf8 = require('../utils/utf8.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');
var address = require('../transaction/address.js');
require('../transaction/transaction.js');
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
require('../crypto/signature.js');

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
function hashMessage(message) {
    if (typeof message === "string") {
        message = utf8.toUtf8Bytes(message);
    }
    return sha3.sha256(data.concat([
        utf8.toUtf8Bytes(strings.MessagePrefix),
        utf8.toUtf8Bytes(String(message.length)),
        message,
    ]));
}
/**
 *  Return the address of the private key that produced
 *  the signature %%sig%% during signing for %%message%%.
 */
function verifyMessage(message, sig, prefix) {
    const digest = hashMessage(message);
    return address.recoverAddress(digest, sig, prefix);
}

exports.hashMessage = hashMessage;
exports.verifyMessage = verifyMessage;
//# sourceMappingURL=message.js.map
