'use strict';

require('../../utils/base58.js');
require('../../logger/logger.js');
require('../../utils/errors.js');
var properties = require('../../utils/properties.js');
require('http');
require('https');
require('zlib');
require('../../utils/fixednumber.js');
var maths = require('../../utils/maths.js');
var typed = require('../typed.js');
var abstractCoder = require('./abstract-coder.js');

const BN_0 = BigInt(0);
const BN_1 = BigInt(1);
const BN_MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
/**
 *  @_ignore
 */
class NumberCoder extends abstractCoder.Coder {
    size;
    signed;
    constructor(size, signed, localName) {
        const name = (signed ? "int" : "uint") + size * 8;
        super(name, name, localName, false);
        properties.defineProperties(this, { size, signed }, { size: "number", signed: "boolean" });
    }
    defaultValue() {
        return 0;
    }
    encode(writer, _value) {
        let value = maths.getBigInt(typed.Typed.dereference(_value, this.type));
        // Check bounds are safe for encoding
        let maxUintValue = maths.mask(BN_MAX_UINT256, abstractCoder.WordSize * 8);
        if (this.signed) {
            let bounds = maths.mask(maxUintValue, this.size * 8 - 1);
            if (value > bounds || value < -(bounds + BN_1)) {
                this._throwError("value out-of-bounds", _value);
            }
            value = maths.toTwos(value, 8 * abstractCoder.WordSize);
        }
        else if (value < BN_0 || value > maths.mask(maxUintValue, this.size * 8)) {
            this._throwError("value out-of-bounds", _value);
        }
        return writer.writeValue(value);
    }
    decode(reader) {
        let value = maths.mask(reader.readValue(), this.size * 8);
        if (this.signed) {
            value = maths.fromTwos(value, this.size * 8);
        }
        return value;
    }
}

exports.NumberCoder = NumberCoder;
//# sourceMappingURL=number.js.map
