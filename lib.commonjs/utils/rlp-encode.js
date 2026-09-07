'use strict';

var data = require('./data.js');

function arrayifyInteger(value) {
    const result = [];
    while (value) {
        result.unshift(value & 0xff);
        value >>= 8;
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
    const data$1 = Array.prototype.slice.call(data.getBytes(object, "object"));
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
const nibbles = "0123456789abcdef";
/**
 *  Encodes %%object%% as an RLP-encoded [[DataHexString]].
 */
function encodeRlp(object) {
    let result = "0x";
    for (const v of _encode(object)) {
        result += nibbles[v >> 4];
        result += nibbles[v & 0xf];
    }
    return result;
}

exports.encodeRlp = encodeRlp;
//# sourceMappingURL=rlp-encode.js.map
