'use strict';

var buffer = require('buffer');
var _ripemd160 = require('bcrypto/lib/ripemd160-browser');
var sha3$1 = require('bcrypto/lib/sha3-browser.js');
var logger$1 = require('../logger/logger.js');
var data = require('../utils/data.js');
var sha3 = require('./sha3.js');

const logger = new logger$1.Logger("corebc-crypto/browser-sha3/0.0.1");
function ripemd160(data$1) {
    const d = buffer.Buffer.from(data.arrayify(data$1));
    const h = _ripemd160.digest(d);
    return data.hexlify(h);
}
function sha256(data$1) {
    const d = buffer.Buffer.from(data.arrayify(data$1));
    const h = sha3$1.digest(d, 256);
    return data.hexlify(h);
}
function sha512(data$1) {
    const d = buffer.Buffer.from(data.arrayify(data$1));
    const h = sha3$1.digest(d, 512);
    return data.hexlify(h);
}
function computeHmac(algorithm, key, data$1) {
    const d = buffer.Buffer.from(data.arrayify(data$1));
    const k = buffer.Buffer.from(data.arrayify(key));
    if (algorithm === sha3.SupportedAlgorithm.sha256) {
        return data.hexlify(sha3$1.mac(d, k, 256));
    }
    else if (algorithm === sha3.SupportedAlgorithm.sha512) {
        return data.hexlify(sha3$1.mac(d, k, 512));
    }
    logger.throwError("unsupported algorithm - " + algorithm, logger$1.Logger.errors.UNSUPPORTED_OPERATION, {
        operation: "computeHmac",
        algorithm: algorithm,
    });
    return "";
}

exports.computeHmac = computeHmac;
exports.ripemd160 = ripemd160;
exports.sha256 = sha256;
exports.sha512 = sha512;
//# sourceMappingURL=browser-sha3.js.map
