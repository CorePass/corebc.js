'use strict';

var keccak = require('../crypto/keccak.js');
var sha3 = require('../crypto/sha3.js');
require('../utils/base58.js');
require('../logger/logger.js');
require('../utils/errors.js');
var utf8 = require('../utils/utf8.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');

/**
 *  A simple hashing function which operates on UTF-8 strings to
 *  compute an 32-byte identifier.
 *
 *
 *  @example:
 *    id("hello world")
 *    //_result:
 */
function id(value, useKeccak) {
    if (useKeccak) {
        return keccak.keccak256(utf8.toUtf8Bytes(value));
    }
    return sha3.sha256(utf8.toUtf8Bytes(value));
}

exports.id = id;
//# sourceMappingURL=id.js.map
