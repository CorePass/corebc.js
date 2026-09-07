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
require('../utils/base58.js');
var data = require('../utils/data.js');
var errors = require('../utils/errors.js');
require('../logger/logger.js');
var utf8 = require('../utils/utf8.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
var maths = require('../utils/maths.js');
require('../crypto/signature.js');

const regexBytes = new RegExp("^bytes([0-9]+)$");
const regexNumber = new RegExp("^(u?int)([0-9]*)$");
const regexArray = new RegExp("^(.*)\\[([0-9]*)\\]$");
function _pack(type, value, isArray) {
    switch (type) {
        case "address":
            if (isArray) {
                return data.getBytes(data.zeroPadValue(value, 32));
            }
            return data.getBytes(index.getAddress(value));
        case "string":
            return utf8.toUtf8Bytes(value);
        case "bytes":
            return data.getBytes(value);
        case "bool":
            value = !!value ? "0x01" : "0x00";
            if (isArray) {
                return data.getBytes(data.zeroPadValue(value, 32));
            }
            return data.getBytes(value);
    }
    let match = type.match(regexNumber);
    if (match) {
        let signed = match[1] === "int";
        let size = parseInt(match[2] || "256");
        errors.assertArgument((!match[2] || match[2] === String(size)) &&
            size % 8 === 0 &&
            size !== 0 &&
            size <= 256, "invalid number type", "type", type);
        if (isArray) {
            size = 256;
        }
        if (signed) {
            value = maths.toTwos(value, size);
        }
        return data.getBytes(data.zeroPadValue(maths.toBeArray(value), size / 8));
    }
    match = type.match(regexBytes);
    if (match) {
        const size = parseInt(match[1]);
        errors.assertArgument(String(size) === match[1] && size !== 0 && size <= 32, "invalid bytes type", "type", type);
        errors.assertArgument(data.dataLength(value) === size, `invalid value for ${type}`, "value", value);
        if (isArray) {
            return data.getBytes(data.zeroPadBytes(value, 32));
        }
        return value;
    }
    match = type.match(regexArray);
    if (match && Array.isArray(value)) {
        const baseType = match[1];
        const count = parseInt(match[2] || String(value.length));
        errors.assertArgument(count === value.length, `invalid array length for ${type}`, "value", value);
        const result = [];
        value.forEach(function (value) {
            result.push(_pack(baseType, value, true));
        });
        return data.getBytes(data.concat(result));
    }
    errors.assertArgument(false, "invalid type", "type", type);
}
// @TODO: Array Enum
/**
 *   Computes the [[link-solc-packed]] representation of %%values%%
 *   respectively to their %%types%%.
 *
 *   @example:
 *       addr = "0x8ba1f109551bd432803012645ac136ddd64dba72"
 *       solidityPacked([ "address", "uint" ], [ addr, 45 ]);
 *       //_result:
 */
function solidityPacked(types, values) {
    errors.assertArgument(types.length === values.length, "wrong number of values; expected ${ types.length }", "values", values);
    const tight = [];
    types.forEach(function (type, index) {
        tight.push(_pack(type, values[index]));
    });
    return data.hexlify(data.concat(tight));
}
/**
 *   Computes the [[link-solc-packed]] [[sha256]] hash of %%values%%
 *   respectively to their %%types%%.
 *
 *   @example:
 *       addr = "0x8ba1f109551bd432803012645ac136ddd64dba72"
 *       solidityPackedSha256([ "address", "uint" ], [ addr, 45 ]);
 *       //_result:
 */
function solidityPackedSha256(types, values) {
    return sha3.sha256(solidityPacked(types, values));
}

exports.solidityPacked = solidityPacked;
exports.solidityPackedSha256 = solidityPackedSha256;
//# sourceMappingURL=solidity.js.map
