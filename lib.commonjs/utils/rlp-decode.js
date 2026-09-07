'use strict';

var data = require('./data.js');
var errors = require('./errors.js');

function hexlifyByte(value) {
    let result = value.toString(16);
    while (result.length < 2) {
        result = "0" + result;
    }
    return "0x" + result;
}
function unarrayifyInteger(data, offset, length) {
    let result = 0;
    for (let i = 0; i < length; i++) {
        result = result * 256 + data[offset + i];
    }
    return result;
}
function _decodeChildren(data, offset, childOffset, length) {
    const result = [];
    while (childOffset < offset + 1 + length) {
        const decoded = _decode(data, childOffset);
        result.push(decoded.result);
        childOffset += decoded.consumed;
        errors.assert(childOffset <= offset + 1 + length, "child data too short", "BUFFER_OVERRUN", {
            buffer: data,
            length,
            offset,
        });
    }
    return { consumed: 1 + length, result: result };
}
// returns { consumed: number, result: Object }
function _decode(data$1, offset) {
    errors.assert(data$1.length !== 0, "data too short", "BUFFER_OVERRUN", {
        buffer: data$1,
        length: 0,
        offset: 1,
    });
    const checkOffset = (offset) => {
        errors.assert(offset <= data$1.length, "data short segment too short", "BUFFER_OVERRUN", {
            buffer: data$1,
            length: data$1.length,
            offset,
        });
    };
    // Array with extra length prefix
    if (data$1[offset] >= 0xf8) {
        const lengthLength = data$1[offset] - 0xf7;
        checkOffset(offset + 1 + lengthLength);
        const length = unarrayifyInteger(data$1, offset + 1, lengthLength);
        checkOffset(offset + 1 + lengthLength + length);
        return _decodeChildren(data$1, offset, offset + 1 + lengthLength, lengthLength + length);
    }
    else if (data$1[offset] >= 0xc0) {
        const length = data$1[offset] - 0xc0;
        checkOffset(offset + 1 + length);
        return _decodeChildren(data$1, offset, offset + 1, length);
    }
    else if (data$1[offset] >= 0xb8) {
        const lengthLength = data$1[offset] - 0xb7;
        checkOffset(offset + 1 + lengthLength);
        const length = unarrayifyInteger(data$1, offset + 1, lengthLength);
        checkOffset(offset + 1 + lengthLength + length);
        const result = data.hexlify(data$1.slice(offset + 1 + lengthLength, offset + 1 + lengthLength + length));
        return { consumed: 1 + lengthLength + length, result: result };
    }
    else if (data$1[offset] >= 0x80) {
        const length = data$1[offset] - 0x80;
        checkOffset(offset + 1 + length);
        const result = data.hexlify(data$1.slice(offset + 1, offset + 1 + length));
        return { consumed: 1 + length, result: result };
    }
    return { consumed: 1, result: hexlifyByte(data$1[offset]) };
}
/**
 *  Decodes %%data%% into the structured data it represents.
 */
function decodeRlp(_data) {
    const data$1 = data.getBytes(_data, "data");
    const decoded = _decode(data$1, 0);
    errors.assertArgument(decoded.consumed === data$1.length, "unexpected junk after rlp payload", "data", _data);
    return decoded.result;
}

exports.decodeRlp = decodeRlp;
//# sourceMappingURL=rlp-decode.js.map
