'use strict';

require('../utils/base58.js');
var data = require('../utils/data.js');
var errors = require('../utils/errors.js');
require('../logger/logger.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');
var abstractCoder = require('./coders/abstract-coder.js');
var address = require('./coders/address.js');
var array = require('./coders/array.js');
var boolean = require('./coders/boolean.js');
var bytes = require('./coders/bytes.js');
var fixedBytes = require('./coders/fixed-bytes.js');
var _null = require('./coders/null.js');
var number = require('./coders/number.js');
var string = require('./coders/string.js');
var tuple = require('./coders/tuple.js');
var fragments = require('./fragments.js');
var index = require('../address/index.js');

/**
 *  When sending values to or receiving values from a [[Contract]], the
 *  data is generally encoded using the [ABI standard](link-solc-abi).
 *
 *  The AbiCoder provides a utility to encode values to ABI data and
 *  decode values from ABI data.
 *
 *  Most of the time, developers should favour the [[Contract]] class,
 *  which further abstracts a lot of the finer details of ABI data.
 *
 *  @_section api/abi/abi-coder:ABI Encoding
 */
// https://docs.soliditylang.org/en/v0.8.17/control-structures.html
const PanicReasons = new Map();
PanicReasons.set(0x00, "GENERIC_PANIC");
PanicReasons.set(0x01, "ASSERT_FALSE");
PanicReasons.set(0x11, "OVERFLOW");
PanicReasons.set(0x12, "DIVIDE_BY_ZERO");
PanicReasons.set(0x21, "ENUM_RANGE_ERROR");
PanicReasons.set(0x22, "BAD_STORAGE_DATA");
PanicReasons.set(0x31, "STACK_UNDERFLOW");
PanicReasons.set(0x32, "ARRAY_RANGE_ERROR");
PanicReasons.set(0x41, "OUT_OF_MEMORY");
PanicReasons.set(0x51, "UNINITIALIZED_FUNCTION_CALL");
const paramTypeBytes = new RegExp(/^bytes([0-9]*)$/);
const paramTypeNumber = new RegExp(/^(u?int)([0-9]*)$/);
let defaultCoder = null;
function getBuiltinCallException(action, tx, data$1, abiCoder) {
    let message = "missing revert data";
    let reason = null;
    const invocation = null;
    let revert = null;
    if (data$1) {
        message = "execution reverted";
        const bytes = data.getBytes(data$1);
        data$1 = data.hexlify(data$1);
        if (bytes.length === 0) {
            message += " (no data present; likely require(false) occurred";
            reason = "require(false)";
        }
        else if (bytes.length % 32 !== 4) {
            message += " (could not decode reason; invalid data length)";
        }
        else if (data.hexlify(bytes.slice(0, 4)) === "0x08c379a0") {
            // Error(string)
            try {
                reason = abiCoder.decode(["string"], bytes.slice(4))[0];
                revert = {
                    signature: "Error(string)",
                    name: "Error",
                    args: [reason],
                };
                message += `: ${JSON.stringify(reason)}`;
            }
            catch (error) {
                message += " (could not decode reason; invalid string data)";
            }
        }
        else if (data.hexlify(bytes.slice(0, 4)) === "0x4e487b71") {
            // Panic(uint256)
            try {
                const code = Number(abiCoder.decode(["uint256"], bytes.slice(4))[0]);
                revert = {
                    signature: "Panic(uint256)",
                    name: "Panic",
                    args: [code],
                };
                reason = `Panic due to ${PanicReasons.get(code) || "UNKNOWN"}(${code})`;
                message += `: ${reason}`;
            }
            catch (error) {
                message += " (could not decode panic code)";
            }
        }
        else {
            message += " (unknown custom error)";
        }
    }
    const transaction = {
        to: tx.to ? index.getAddress(tx.to) : null,
        data: tx.data || "0x",
    };
    if (tx.from) {
        transaction.from = index.getAddress(tx.from);
    }
    return errors.makeError(message, "CALL_EXCEPTION", {
        action,
        data: data$1,
        reason,
        transaction,
        invocation,
        revert,
    });
}
/**
 * About AbiCoder
 */
class AbiCoder {
    #getCoder(param) {
        if (param.isArray()) {
            return new array.ArrayCoder(this.#getCoder(param.arrayChildren), param.arrayLength, param.name);
        }
        if (param.isTuple()) {
            return new tuple.TupleCoder(param.components.map((c) => this.#getCoder(c)), param.name);
        }
        switch (param.baseType) {
            case "address":
                return new address.AddressCoder(param.name);
            case "bool":
                return new boolean.BooleanCoder(param.name);
            case "string":
                return new string.StringCoder(param.name);
            case "bytes":
                return new bytes.BytesCoder(param.name);
            case "":
                return new _null.NullCoder(param.name);
        }
        // u?int[0-9]*
        let match = param.type.match(paramTypeNumber);
        if (match) {
            let size = parseInt(match[2] || "256");
            errors.assertArgument(size !== 0 && size <= 256 && size % 8 === 0, "invalid " + match[1] + " bit length", "param", param);
            return new number.NumberCoder(size / 8, match[1] === "int", param.name);
        }
        // bytes[0-9]+
        match = param.type.match(paramTypeBytes);
        if (match) {
            let size = parseInt(match[1]);
            errors.assertArgument(size !== 0 && size <= 32, "invalid bytes length", "param", param);
            return new fixedBytes.FixedBytesCoder(size, param.name);
        }
        errors.assertArgument(false, "invalid type", "type", param.type);
    }
    /**
     *  Get the default values for the given %%types%%.
     *
     *  For example, a ``uint`` is by default ``0`` and ``bool``
     *  is by default ``false``.
     */
    getDefaultValue(types) {
        const coders = types.map((type) => this.#getCoder(fragments.ParamType.from(type)));
        const coder = new tuple.TupleCoder(coders, "_");
        return coder.defaultValue();
    }
    /**
     *  Encode the %%values%% as the %%types%% into ABI data.
     *
     *  @returns DataHexstring
     */
    encode(types, values) {
        errors.assertArgumentCount(values.length, types.length, "types/values length mismatch");
        const coders = types.map((type) => this.#getCoder(fragments.ParamType.from(type)));
        const coder = new tuple.TupleCoder(coders, "_");
        const writer = new abstractCoder.Writer();
        coder.encode(writer, values);
        return writer.data;
    }
    /**
     *  Decode the ABI %%data%% as the %%types%% into values.
     *
     *  If %%loose%% decoding is enabled, then strict padding is
     *  not enforced. Some older versions of Solidity incorrectly
     *  padded event data emitted from ``external`` functions.
     */
    decode(types, data, loose) {
        const coders = types.map((type) => this.#getCoder(fragments.ParamType.from(type)));
        const coder = new tuple.TupleCoder(coders, "_");
        return coder.decode(new abstractCoder.Reader(data, loose));
    }
    /**
     *  Returns the shared singleton instance of a default [[AbiCoder]].
     *
     *  On the first call, the instance is created internally.
     */
    static defaultAbiCoder() {
        if (defaultCoder == null) {
            defaultCoder = new AbiCoder();
        }
        return defaultCoder;
    }
    /**
     *  Returns an corebc-compatible [[CallExceptionError]] Error for the given
     *  result %%data%% for the [[CallExceptionAction]] %%action%% against
     *  the Transaction %%tx%%.
     */
    static getBuiltinCallException(action, tx, data) {
        return getBuiltinCallException(action, tx, data, AbiCoder.defaultAbiCoder());
    }
}

exports.AbiCoder = AbiCoder;
//# sourceMappingURL=abi-coder.js.map
