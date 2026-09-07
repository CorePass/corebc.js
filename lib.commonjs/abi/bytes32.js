'use strict';

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

/**
 *  About bytes32 strings...
 *
 *  @_docloc: api/utils:Bytes32 Strings
 */
/**
 *  Encodes %%text%% as a Bytes32 string.
 */
function encodeBytes32String(text) {
    // Get the bytes
    const bytes = utf8.toUtf8Bytes(text);
    // Check we have room for null-termination
    if (bytes.length > 31) {
        throw new Error("bytes32 string must be less than 32 bytes");
    }
    // Zero-pad (implicitly null-terminates)
    return data.zeroPadBytes(bytes, 32);
}
/**
 *  Encodes the Bytes32-encoded %%bytes%% into a string.
 */
function decodeBytes32String(_bytes) {
    const data$1 = data.getBytes(_bytes, "bytes");
    // Must be 32 bytes with a null-termination
    if (data$1.length !== 32) {
        throw new Error("invalid bytes32 - not 32 bytes long");
    }
    if (data$1[31] !== 0) {
        throw new Error("invalid bytes32 string - no null terminator");
    }
    // Find the null termination
    let length = 31;
    while (data$1[length - 1] === 0) {
        length--;
    }
    // Determine the string value
    return utf8.toUtf8String(data$1.slice(0, length));
}

exports.decodeBytes32String = decodeBytes32String;
exports.encodeBytes32String = encodeBytes32String;
//# sourceMappingURL=bytes32.js.map
