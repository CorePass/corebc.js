'use strict';

require('bcrypto/lib/ed448.js');
require('buffer');
require('bcrypto/lib/pbkdf2.js');
require('bcrypto/lib/sha3-512.js');
var crypto = require('crypto');
require('../utils/base58.js');
var data = require('../utils/data.js');
require('../utils/errors.js');
require('../logger/logger.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');

/**
 *  An **HMAC** enables verification that a given key was used
 *  to authenticate a payload.
 *
 *  See: [[link-wiki-hmac]]
 *
 *  @_subsection: api/crypto:HMAC  [about-hmac]
 */
let locked = false;
const _computeHmac = function (algorithm, key, data) {
    return crypto.createHmac(algorithm, key).update(data).digest();
};
let __computeHmac = _computeHmac;
/**
 *  Return the HMAC for %%data%% using the %%key%% key with the underlying
 *  %%algo%% used for compression.
 *
 *  @example:
 *    key = id("some-secret")
 *
 *    // Compute the HMAC
 *    computeHmac("sha256", key, "0x1337")
 *    //_result:
 *
 *    // To compute the HMAC of UTF-8 data, the data must be
 *    // converted to UTF-8 bytes
 *    computeHmac("sha256", key, toUtf8Bytes("Hello World"))
 *    //_result:
 *
 */
function computeHmac(algorithm, _key, _data) {
    const key = data.getBytes(_key, "key");
    const data$1 = data.getBytes(_data, "data");
    return data.hexlify(__computeHmac(algorithm, key, data$1));
}
computeHmac._ = _computeHmac;
computeHmac.lock = function () {
    locked = true;
};
computeHmac.register = function (func) {
    if (locked) {
        throw new Error("computeHmac is locked");
    }
    __computeHmac = func;
};
Object.freeze(computeHmac);

exports.computeHmac = computeHmac;
//# sourceMappingURL=hmac.js.map
