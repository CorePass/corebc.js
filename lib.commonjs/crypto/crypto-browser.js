'use strict';

var legacy_js = require('@noble/hashes/legacy.js');
var hmac_js = require('@noble/hashes/hmac.js');
var pbkdf2_js = require('@noble/hashes/pbkdf2.js');
var sha2_js = require('@noble/hashes/sha2.js');
var sha3_js = require('@noble/hashes/sha3.js');
var browserEd448 = require('./browser-ed448.js');
require('../utils/base58.js');
require('../logger/logger.js');
var errors = require('../utils/errors.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');
var ed448goldilockBrowser = require('./ed448goldilock-browser.js');

/* Browser Crypto Shims */
function getGlobal() {
    if (typeof globalThis !== "undefined")
        return globalThis;
    if (typeof self !== "undefined") {
        return self;
    }
    if (typeof window !== "undefined") {
        return window;
    }
    if (typeof global !== "undefined") {
        return global;
    }
    throw new Error("unable to locate global object");
}
const anyGlobal = getGlobal();
const crypto = anyGlobal.crypto || anyGlobal.msCrypto;
function createHash(algo) {
    switch (algo) {
        case "ripemd160":
            return legacy_js.ripemd160.create();
        case "sha256":
            return sha2_js.sha256.create();
        case "sha512":
            return sha2_js.sha512.create();
        case "sha3-256":
            return sha3_js.sha3_256.create();
        case "sha3-512":
            return sha3_js.sha3_512.create();
    }
    errors.assertArgument(false, "invalid hashing algorithm name", "algorithm", algo);
}
function createHmac(_algo, key) {
    const algo = { sha256: sha2_js.sha256, sha512: sha2_js.sha512, "sha3-256": sha3_js.sha3_256, "sha3-512": sha3_js.sha3_512 }[_algo];
    errors.assertArgument(algo != null, "invalid hmac algorithm", "algorithm", _algo);
    return hmac_js.hmac.create(algo, key);
}
function pbkdf2Sync(password, salt, iterations, keylen, _algo) {
    const algo = { sha256: sha2_js.sha256, sha512: sha2_js.sha512 }[_algo];
    errors.assertArgument(algo != null, "invalid pbkdf2 algorithm", "algorithm", _algo);
    return pbkdf2_js.pbkdf2(algo, password, salt, { c: iterations, dkLen: keylen });
}
function randomBytes(length) {
    errors.assert(crypto != null, "platform does not support secure random numbers", "UNSUPPORTED_OPERATION", {
        operation: "randomBytes",
    });
    errors.assertArgument(Number.isInteger(length) && length > 0 && length <= 1024, "invalid length", "length", length);
    const result = new Uint8Array(length);
    crypto.getRandomValues(result);
    return result;
}

exports.ed448 = browserEd448.default;
exports.Ed448Goldilock = ed448goldilockBrowser.Ed448Goldilock;
exports.createHash = createHash;
exports.createHmac = createHmac;
exports.pbkdf2Sync = pbkdf2Sync;
exports.randomBytes = randomBytes;
//# sourceMappingURL=crypto-browser.js.map
