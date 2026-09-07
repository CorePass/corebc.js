'use strict';

require('../../utils/base58.js');
var data = require('../../utils/data.js');
require('../../utils/errors.js');
require('../../logger/logger.js');
require('http');
require('https');
require('zlib');
require('../../utils/fixednumber.js');
require('../../utils/maths.js');
var abstractCoder = require('./abstract-coder.js');

/**
 *  @_ignore
 */
class DynamicBytesCoder extends abstractCoder.Coder {
    constructor(type, localName) {
        super(type, type, localName, true);
    }
    defaultValue() {
        return "0x";
    }
    encode(writer, value) {
        value = data.getBytesCopy(value);
        let length = writer.writeValue(value.length);
        length += writer.writeBytes(value);
        return length;
    }
    decode(reader) {
        return reader.readBytes(reader.readIndex(), true);
    }
}
/**
 *  @_ignore
 */
class BytesCoder extends DynamicBytesCoder {
    constructor(localName) {
        super("bytes", localName);
    }
    decode(reader) {
        return data.hexlify(super.decode(reader));
    }
}

exports.BytesCoder = BytesCoder;
exports.DynamicBytesCoder = DynamicBytesCoder;
//# sourceMappingURL=bytes.js.map
