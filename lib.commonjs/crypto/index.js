'use strict';

var hmac = require('./hmac.js');
var ripemd160 = require('./ripemd160.js');
var pbkdf2 = require('./pbkdf2.js');
var random = require('./random.js');
var scrypt = require('./scrypt.js');
var sha3 = require('./sha3.js');
require('bcrypto/lib/ed448.js');
var ed448goldilock = require('./ed448goldilock.js');
require('crypto');
var keccak = require('./keccak.js');
var signingKey = require('./signing-key.js');
var signature = require('./signature.js');

/**
 *  A fundamental building block of Core is the underlying
 *  cryptographic primitives.
 *
 *  @_section: api/crypto:Cryptographic Functions   [about-crypto]
 */
function lock() {
    hmac.computeHmac.lock();
    pbkdf2.pbkdf2.lock();
    random.randomBytes.lock();
    ripemd160.ripemd160.lock();
    scrypt.scrypt.lock();
    scrypt.scryptSync.lock();
    sha3.sha256.lock();
    sha3.sha512.lock();
    random.randomBytes.lock();
}

exports.computeHmac = hmac.computeHmac;
exports.ripemd160 = ripemd160.ripemd160;
exports.pbkdf2 = pbkdf2.pbkdf2;
exports.randomBytes = random.randomBytes;
exports.scrypt = scrypt.scrypt;
exports.scryptSync = scrypt.scryptSync;
exports.sha256 = sha3.sha256;
exports.sha512 = sha3.sha512;
exports.Ed448Goldilock = ed448goldilock.Ed448Goldilock;
exports.keccak256 = keccak.keccak256;
exports.SigningKey = signingKey.SigningKey;
exports.Signature = signature.Signature;
exports.lock = lock;
//# sourceMappingURL=index.js.map
