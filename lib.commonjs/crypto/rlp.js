'use strict';

var logger$1 = require('../logger/logger.js');
var data = require('../utils/data.js');

const logger = new logger$1.Logger("rlp/0.0.1");
function arrayifyInteger(value) {
    const result = [];
    while (value) {
        // @ts-ignore
        result.unshift(value & 0xff);
        value >>= 8;
    }
    return result;
}
function unarrayifyInteger(data, offset, length) {
    let result = 0;
    for (let i = 0; i < length; i++) {
        result = result * 256 + data[offset + i];
    }
    return result;
}
function _encode(object) {
    if (Array.isArray(object)) {
        let payload = [];
        object.forEach(function (child) {
            payload = payload.concat(_encode(child));
        });
        if (payload.length <= 55) {
            payload.unshift(0xc0 + payload.length);
            return payload;
        }
        const length = arrayifyInteger(payload.length);
        length.unshift(0xf7 + length.length);
        return length.concat(payload);
    }
    if (!data.isBytesLike(object)) {
        logger.throwArgumentError("RLP object must be BytesLike", "object", object);
    }
    const data$1 = Array.prototype.slice.call(data.arrayify(object));
    if (data$1.length === 1 && data$1[0] <= 0x7f) {
        return data$1;
    }
    else if (data$1.length <= 55) {
        data$1.unshift(0x80 + data$1.length);
        return data$1;
    }
    const length = arrayifyInteger(data$1.length);
    length.unshift(0xb7 + length.length);
    return length.concat(data$1);
}
function encode(object) {
    return data.hexlify(_encode(object));
}
function _decodeChildren(data, offset, childOffset, length) {
    const result = [];
    while (childOffset < offset + 1 + length) {
        const decoded = _decode(data, childOffset);
        result.push(decoded.result);
        childOffset += decoded.consumed;
        if (childOffset > offset + 1 + length) {
            logger.throwError("child data too short", logger$1.Logger.errors.BUFFER_OVERRUN, {});
        }
    }
    return { consumed: 1 + length, result: result };
}
// returns { consumed: number, result: Object }
function _decode(data$1, offset) {
    if (data$1.length === 0) {
        logger.throwError("data too short", logger$1.Logger.errors.BUFFER_OVERRUN, {});
    }
    // Array with extra length prefix
    if (data$1[offset] >= 0xf8) {
        const lengthLength = data$1[offset] - 0xf7;
        if (offset + 1 + lengthLength > data$1.length) {
            logger.throwError("data short segment too short", logger$1.Logger.errors.BUFFER_OVERRUN, {});
        }
        const length = unarrayifyInteger(data$1, offset + 1, lengthLength);
        if (offset + 1 + lengthLength + length > data$1.length) {
            logger.throwError("data long segment too short", logger$1.Logger.errors.BUFFER_OVERRUN, {});
        }
        return _decodeChildren(data$1, offset, offset + 1 + lengthLength, lengthLength + length);
    }
    else if (data$1[offset] >= 0xc0) {
        const length = data$1[offset] - 0xc0;
        if (offset + 1 + length > data$1.length) {
            logger.throwError("data array too short", logger$1.Logger.errors.BUFFER_OVERRUN, {});
        }
        return _decodeChildren(data$1, offset, offset + 1, length);
    }
    else if (data$1[offset] >= 0xb8) {
        const lengthLength = data$1[offset] - 0xb7;
        if (offset + 1 + lengthLength > data$1.length) {
            logger.throwError("data array too short", logger$1.Logger.errors.BUFFER_OVERRUN, {});
        }
        const length = unarrayifyInteger(data$1, offset + 1, lengthLength);
        if (offset + 1 + lengthLength + length > data$1.length) {
            logger.throwError("data array too short", logger$1.Logger.errors.BUFFER_OVERRUN, {});
        }
        const result = data.hexlify(data$1.slice(offset + 1 + lengthLength, offset + 1 + lengthLength + length));
        return { consumed: 1 + lengthLength + length, result: result };
    }
    else if (data$1[offset] >= 0x80) {
        const length = data$1[offset] - 0x80;
        if (offset + 1 + length > data$1.length) {
            logger.throwError("data too short", logger$1.Logger.errors.BUFFER_OVERRUN, {});
        }
        const result = data.hexlify(data$1.slice(offset + 1, offset + 1 + length));
        return { consumed: 1 + length, result: result };
    }
    return { consumed: 1, result: data.hexlify(data$1[offset]) };
}
function decode(data$1) {
    const bytes = data.arrayify(data$1);
    const decoded = _decode(bytes, 0);
    if (decoded.consumed !== bytes.length) {
        logger.throwArgumentError("invalid rlp data", "data", data$1);
    }
    return decoded.result;
}

exports.decode = decode;
exports.encode = encode;
//# sourceMappingURL=rlp.js.map
