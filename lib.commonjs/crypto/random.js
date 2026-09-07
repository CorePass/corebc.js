'use strict';

require('bcrypto/lib/ed448.js');
require('buffer');
require('bcrypto/lib/pbkdf2.js');
require('bcrypto/lib/sha3-512.js');
var crypto = require('crypto');

/**
 *  A **Cryptographically Secure Random Value** is one that has been
 *  generated with additional care take to prevent side-channels
 *  from allowing others to detect it and prevent others from through
 *  coincidence generate the same values.
 *
 *  @_subsection: api/crypto:Random Values  [about-crypto-random]
 */
let locked = false;
const _randomBytes = function (length) {
    return new Uint8Array(crypto.randomBytes(length));
};
let __randomBytes = _randomBytes;
/**
 *  Return %%length%% bytes of cryptographically secure random data.
 *
 *  @example:
 *    randomBytes(8)
 *    //_result:
 */
function randomBytes(length) {
    return __randomBytes(length);
}
randomBytes._ = _randomBytes;
randomBytes.lock = function () {
    locked = true;
};
randomBytes.register = function (func) {
    if (locked) {
        throw new Error("randomBytes is locked");
    }
    __randomBytes = func;
};
Object.freeze(randomBytes);

exports.randomBytes = randomBytes;
//# sourceMappingURL=random.js.map
