'use strict';

var _version = require('../_version.js');
var properties = require('./properties.js');

/**
 *  About Errors.
 *
 *  @_section: api/utils/errors:Errors  [about-errors]
 */
function stringify(value) {
    if (value == null) {
        return "null";
    }
    if (Array.isArray(value)) {
        return "[ " + value.map(stringify).join(", ") + " ]";
    }
    if (value instanceof Uint8Array) {
        const HEX = "0123456789abcdef";
        let result = "0x";
        for (let i = 0; i < value.length; i++) {
            result += HEX[value[i] >> 4];
            result += HEX[value[i] & 0xf];
        }
        return result;
    }
    if (typeof value === "object" && typeof value.toJSON === "function") {
        return stringify(value.toJSON());
    }
    switch (typeof value) {
        case "boolean":
        case "symbol":
            return value.toString();
        case "bigint":
            return BigInt(value).toString();
        case "number":
            return value.toString();
        case "string":
            return JSON.stringify(value);
        case "object": {
            const keys = Object.keys(value);
            keys.sort();
            return ("{ " +
                keys.map((k) => `${stringify(k)}: ${stringify(value[k])}`).join(", ") +
                " }");
        }
    }
    return `[ COULD NOT SERIALIZE ]`;
}
/**
 *  Returns true if the %%error%% matches an error thrown by corebc
 *  that matches the error %%code%%.
 *
 *  In TypeScript envornoments, this can be used to check that %%error%%
 *  matches an corebcError type, which means the expected properties will
 *  be set.
 *
 *  @See [ErrorCodes](api:ErrorCode)
 *  @example
 *    try {
 *      // code....
 *    } catch (e) {
 *      if (isError(e, "CALL_EXCEPTION")) {
 *          // The Type Guard has validated this object
 *          console.log(e.data);
 *      }
 *    }
 */
function isError(error, code) {
    return error && error.code === code;
}
/**
 *  Returns true if %%error%% is a [[CallExceptionError].
 */
function isCallException(error) {
    return isError(error, "CALL_EXCEPTION");
}
/**
 *  Returns a new Error configured to the format corebc emits errors, with
 *  the %%message%%, [[api:ErrorCode]] %%code%% and additioanl properties
 *  for the corresponding corebcError.
 *
 *  Each error in corebc includes the version of corebc, a
 *  machine-readable [[ErrorCode]], and depneding on %%code%%, additional
 *  required properties. The error message will also include the %%meeage%%,
 *  corebc version, %%code%% and all aditional properties, serialized.
 */
function makeError(message, code, info) {
    {
        const details = [];
        if (info) {
            if ("message" in info || "code" in info || "name" in info) {
                throw new Error(`value will overwrite populated values: ${stringify(info)}`);
            }
            for (const key in info) {
                const value = info[key];
                //                try {
                details.push(key + "=" + stringify(value));
                //                } catch (error: any) {
                //                console.log("MMM", error.message);
                //                    details.push(key + "=[could not serialize object]");
                //                }
            }
        }
        details.push(`code=${code}`);
        details.push(`version=${_version.version}`);
        if (details.length) {
            message += " (" + details.join(", ") + ")";
        }
    }
    let error;
    switch (code) {
        case "INVALID_ARGUMENT":
            error = new TypeError(message);
            break;
        case "NUMERIC_FAULT":
        case "BUFFER_OVERRUN":
            error = new RangeError(message);
            break;
        default:
            error = new Error(message);
    }
    properties.defineProperties(error, { code });
    if (info) {
        Object.assign(error, info);
    }
    return error;
}
/**
 *  Throws an corebcError with %%message%%, %%code%% and additional error
 *  %%info%% when %%check%% is falsish..
 *
 *  @see [[api:makeError]]
 */
function assert(check, message, code, info) {
    if (!check) {
        throw makeError(message, code, info);
    }
}
/**
 *  A simple helper to simply ensuring provided arguments match expected
 *  constraints, throwing if not.
 *
 *  In TypeScript environments, the %%check%% has been asserted true, so
 *  any further code does not need additional compile-time checks.
 */
function assertArgument(check, message, name, value) {
    assert(check, message, "INVALID_ARGUMENT", { argument: name, value: value });
}
function assertArgumentCount(count, expectedCount, message) {
    if (message == null) {
        message = "";
    }
    if (message) {
        message = ": " + message;
    }
    assert(count >= expectedCount, "missing arguemnt" + message, "MISSING_ARGUMENT", {
        count: count,
        expectedCount: expectedCount,
    });
    assert(count <= expectedCount, "too many arguemnts" + message, "UNEXPECTED_ARGUMENT", {
        count: count,
        expectedCount: expectedCount,
    });
}
const _normalizeForms = ["NFD", "NFC", "NFKD", "NFKC"].reduce((accum, form) => {
    try {
        // General test for normalize
        /* c8 ignore start */
        if ("test".normalize(form) !== "test") {
            throw new Error("bad");
        }
        /* c8 ignore stop */
        if (form === "NFD") {
            const check = String.fromCharCode(0xe9).normalize("NFD");
            const expected = String.fromCharCode(0x65, 0x0301);
            /* c8 ignore start */
            if (check !== expected) {
                throw new Error("broken");
            }
            /* c8 ignore stop */
        }
        accum.push(form);
    }
    catch (error) { }
    return accum;
}, []);
/**
 *  Throws if the normalization %%form%% is not supported.
 */
function assertNormalize(form) {
    assert(_normalizeForms.indexOf(form) >= 0, "platform missing String.prototype.normalize", "UNSUPPORTED_OPERATION", {
        operation: "String.prototype.normalize",
        info: { form },
    });
}
/**
 *  Many classes use file-scoped values to guard the constructor,
 *  making it effectively private. This facilitates that pattern
 *  by ensuring the %%givenGaurd%% matches the file-scoped %%guard%%,
 *  throwing if not, indicating the %%className%% if provided.
 */
function assertPrivate(givenGuard, guard, className) {
    if (className == null) {
        className = "";
    }
    if (givenGuard !== guard) {
        let method = className, operation = "new";
        if (className) {
            method += ".";
            operation += " " + className;
        }
        assert(false, `private constructor; use ${method}from* methods`, "UNSUPPORTED_OPERATION", {
            operation,
        });
    }
}

exports.assert = assert;
exports.assertArgument = assertArgument;
exports.assertArgumentCount = assertArgumentCount;
exports.assertNormalize = assertNormalize;
exports.assertPrivate = assertPrivate;
exports.isCallException = isCallException;
exports.isError = isError;
exports.makeError = makeError;
//# sourceMappingURL=errors.js.map
