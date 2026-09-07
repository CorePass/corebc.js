'use strict';

var logger$1 = require('../logger/logger.js');
var data = require('../utils/data.js');
require('bcrypto/lib/ed448.js');
var buffer = require('buffer');
require('bcrypto/lib/pbkdf2.js');
require('bcrypto/lib/sha3-512.js');
var crypto = require('crypto');

const logger = new logger$1.Logger("sha3/0.0.1");
const _sha256 = (data$1) => data.hexlify(crypto.createHash("sha3-256").update(data$1).digest());
const _sha512 = (data$1) => data.hexlify(crypto.createHash("sha3-512").update(data$1).digest());
let __sha256 = _sha256;
let __sha512 = _sha512;
let locked256 = false, locked512 = false;
/**
 *  Compute the cryptographic SHA3-256 hash of %%data%%.
 *
 *  @_docloc: api/crypto:Hash Functions
 *  @returns DataHexstring
 *
 *  @example:
 *    sha256("0x")
 *    //_result:
 *
 *    sha256("0x1337")
 *    //_result:
 *
 *    sha256(new Uint8Array([ 0x13, 0x37 ]))
 *    //_result:
 *
 */
exports.SupportedAlgorithm = void 0;
(function (SupportedAlgorithm) {
    SupportedAlgorithm["sha256"] = "sha256";
    SupportedAlgorithm["sha512"] = "sha512";
})(exports.SupportedAlgorithm || (exports.SupportedAlgorithm = {}));
function ripemd160(data$1) {
    return data.hexlify(crypto.createHash("ripemd160").update(data.getBytes(data$1)).digest());
}
function sha256(data$1) {
    return data.hexlify(__sha256(data.getBytes(data$1)));
}
function legacySha256(data$1) {
    const _data = data.getBytes(data$1, "data");
    const hexlified = data.hexlify(crypto.createHash("sha256").update(_data).digest());
    return hexlified;
}
function computeHmac(algorithm, key, data$1) {
    const d = buffer.Buffer.from(data.arrayify(data$1));
    const k = buffer.Buffer.from(data.arrayify(key));
    if (algorithm === exports.SupportedAlgorithm.sha256) {
        return data.hexlify(crypto.createHmac("sha3-256", k).update(d).digest());
    }
    else if (algorithm === exports.SupportedAlgorithm.sha512) {
        return data.hexlify(crypto.createHmac("sha3-512", k).update(d).digest());
    }
    logger.throwError("unsupported algorithm - " + algorithm, logger$1.Logger.errors.UNSUPPORTED_OPERATION, {
        operation: "computeHmac",
        algorithm: algorithm,
    });
    return "";
}
sha256._ = _sha256;
sha256.lock = function () {
    locked256 = true;
};
sha256.register = function (func) {
    if (locked256) {
        throw new Error("sha256 is locked");
    }
    __sha256 = func;
};
Object.freeze(sha256);
/**
 *  Compute the cryptographic SHA3-512 hash of %%data%%.
 *
 *  @_docloc: api/crypto:Hash Functions
 *  @returns DataHexstring
 *
 *  @example:
 *    sha512("0x")
 *    //_result:
 *
 *    sha512("0x1337")
 *    //_result:
 *
 *    sha512(new Uint8Array([ 0x13, 0x37 ]))
 *    //_result:
 */
function sha512(data$1) {
    return data.hexlify(__sha512(data.getBytes(data$1)));
}
sha512._ = _sha512;
sha512.lock = function () {
    locked512 = true;
};
sha512.register = function (func) {
    if (locked512) {
        throw new Error("sha512 is locked");
    }
    __sha512 = func;
};
Object.freeze(sha512);

exports.computeHmac = computeHmac;
exports.legacySha256 = legacySha256;
exports.ripemd160 = ripemd160;
exports.sha256 = sha256;
exports.sha512 = sha512;
//# sourceMappingURL=sha3.js.map
