'use strict';

var errors = require('./errors.js');
var fixednumber = require('./fixednumber.js');
var maths = require('./maths.js');

/**
 *  Most interactions with Core requires integer values, which use
 *  the smallest magnitude unit.
 *
 *  For example, imagine dealing with dollars and cents. Since dollars
 *  are divisible, non-integer values are possible, such as ``$10.77``.
 *  By using the smallest indivisible unit (i.e. cents), the value can
 *  be kept as the integer ``1077``.
 *
 *  When receiving decimal input from the user (as a decimal string),
 *  the value should be converted to an integer and when showing a user
 *  a value, the integer value should be converted to a decimal string.
 *
 *  This creates a clear distinction, between values to be used by code
 *  (integers) and values used for display logic to users (decimals).
 *
 *  The native unit in Core, //Core// is divisible to 18 decimal places,
 *  where each individual unit is called a //ore//.
 *
 *  @_subsection api/utils:Unit Conversion  [about-units]
 */
const names = [
    ///Ore, the smallest and atomic amount of Core
    "ore",
    ///fecore, 1000 ore
    "fecore",
    ///Picore, one million ore
    "picore",
    ///Nacore, one billion ore. Typically a reasonable unit to measure energy prices.
    "nacore",
    ///Μcore, 10^12 ore or 1 μCore
    "mcore",
    ///micore, 10^15 ore or 1 mcore
    "micore",
    "core",
];
/**
 *  Converts %%value%% into a //decimal string//, assuming %%unit%% decimal
 *  places. The %%unit%% may be the number of decimal places or the name of
 *  a unit
 *
 */
function formatUnits(value, unit) {
    let decimals = 18;
    if (typeof unit === "string") {
        const index = names.indexOf(unit);
        errors.assertArgument(index >= 0, "invalid unit", "unit", unit);
        decimals = 3 * index;
    }
    else if (unit != null) {
        decimals = maths.getNumber(unit, "unit");
    }
    return fixednumber.FixedNumber.fromValue(value, decimals, { decimals }).toString();
}
/**
 *  Converts the //decimal string// %%value%% to a BigInt, assuming
 *  %%unit%% decimal places. The %%unit%% may the number of decimal places
 *  or the name of a unit.
 */
const scientificToDecimal = (num) => {
    // @ts-ignore
    var nsign = Math.sign(num);
    //remove the sign
    // @ts-ignore
    num = Math.abs(num);
    //if the number is in scientific notation remove it
    // @ts-ignore
    if (/\d+\.?\d*e[\+\-]*\d+/i.test(num)) {
        var zero = "0", 
        // @ts-ignore
        parts = String(num).toLowerCase().split("e"), //split into coeff and exponent
        e = parts.pop(), //store the exponential part
        // @ts-ignore
        l = Math.abs(e), //get the number of zeros
        // @ts-ignore
        sign = e / l, coeff_array = parts[0].split(".");
        if (sign === -1) {
            l = l - coeff_array[0].length;
            if (l < 0) {
                // @ts-ignore
                num =
                    coeff_array[0].slice(0, l) +
                        "." +
                        coeff_array[0].slice(l) +
                        (coeff_array.length === 2 ? coeff_array[1] : "");
            }
            else {
                // @ts-ignore
                num = zero + "." + new Array(l + 1).join(zero) + coeff_array.join("");
            }
        }
        else {
            var dec = coeff_array[1];
            if (dec)
                l = l - dec.length;
            if (l < 0) {
                // @ts-ignore
                num = coeff_array[0] + dec.slice(0, l) + "." + dec.slice(l);
            }
            else {
                // @ts-ignore
                num = coeff_array.join("") + new Array(l + 1).join(zero);
            }
        }
    }
    // @ts-ignore
    return nsign < 0 ? "-" + num : num;
};
const trimDecimals = (n, decimals = 18) => {
    n += "";
    if (n.indexOf(".") === -1)
        return n;
    const arr = n.split(".");
    const fraction = arr[1].substr(0, decimals);
    return arr[0] + "." + fraction;
};
function parseUnits(value, unit) {
    errors.assertArgument(typeof value === "string", "value must be a string", "value", value);
    if (value.includes("e")) {
        value = scientificToDecimal(value).toString();
    }
    let decimals = 18;
    if (typeof unit === "string") {
        const index = names.indexOf(unit);
        errors.assertArgument(index >= 0, "invalid unit", "unit", unit);
        decimals = 3 * index;
        value = trimDecimals(value, decimals);
    }
    else if (unit != null) {
        decimals = maths.getNumber(unit, "unit");
        value = trimDecimals(value, decimals);
    }
    return fixednumber.FixedNumber.fromString(value, { decimals }).value;
}
/**
 *  Converts %%value%% into a //decimal string// using 18 decimal places.
 */
function formatXCB(ore) {
    return formatUnits(ore, 18);
}
/**
 *  Converts the //decimal string// %%xcb%% to a BigInt, using 18
 *  decimal places.
 */
function parseXCB(xcb) {
    return parseUnits(xcb, 18);
}

exports.formatUnits = formatUnits;
exports.formatXCB = formatXCB;
exports.parseUnits = parseUnits;
exports.parseXCB = parseXCB;
exports.scientificToDecimal = scientificToDecimal;
exports.trimDecimals = trimDecimals;
//# sourceMappingURL=units.js.map
