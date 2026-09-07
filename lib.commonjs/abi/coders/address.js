'use strict';

var index = require('../../address/index.js');
var maths = require('../../utils/maths.js');
var typed = require('../typed.js');
var abstractCoder = require('./abstract-coder.js');

/**
 *  @_ignore
 */
class AddressCoder extends abstractCoder.Coder {
    constructor(localName) {
        super("address", "address", localName, false);
    }
    defaultValue() {
        return "0x0000000000000000000000000000000000000000";
    }
    encode(writer, _value) {
        let value = typed.Typed.dereference(_value, "string");
        try {
            value = index.getAddress(value);
        }
        catch (error) {
            return this._throwError(error.message, _value);
        }
        return writer.writeValue(value);
    }
    decode(reader) {
        return index.getAddress(maths.toBeHex(reader.readValue(), 22));
    }
}

exports.AddressCoder = AddressCoder;
//# sourceMappingURL=address.js.map
