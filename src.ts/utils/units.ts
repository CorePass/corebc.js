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
 *  where each individual unit is called a //wei//.
 *
 *  @_subsection api/utils:Unit Conversion  [about-units]
 */
import { assertArgument } from "./errors.js";
import { FixedNumber } from "./fixednumber.js";
import { getNumber } from "./maths.js";

import type { BigNumberish, Numeric } from "../utils/index.js";


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

  "core"

];

/**
 *  Converts %%value%% into a //decimal string//, assuming %%unit%% decimal
 *  places. The %%unit%% may be the number of decimal places or the name of
 *  a unit
 *
 */
export function formatUnits(value: BigNumberish, unit?: string | Numeric): string {
    let decimals = 18;
    if (typeof(unit) === "string") {
        const index = names.indexOf(unit);
        assertArgument(index >= 0, "invalid unit", "unit", unit);
        decimals = 3 * index;
    } else if (unit != null) {
        decimals = getNumber(unit, "unit");
    }

    return FixedNumber.fromValue(value, decimals, { decimals }).toString();
}

/**
 *  Converts the //decimal string// %%value%% to a BigInt, assuming
 *  %%unit%% decimal places. The %%unit%% may the number of decimal places
 *  or the name of a unit (e.g. ``"gwei"`` for 9 decimal places).
 */
export function parseUnits(value: string, unit?: string | Numeric): bigint {
    assertArgument(typeof(value) === "string", "value must be a string", "value", value);

    let decimals = 18;
    if (typeof(unit) === "string") {
        const index = names.indexOf(unit);
        assertArgument(index >= 0, "invalid unit", "unit", unit);
        decimals = 3 * index;
    } else if (unit != null) {
        decimals = getNumber(unit, "unit");
    }

    return FixedNumber.fromString(value, { decimals }).value;
}

/**
 *  Converts %%value%% into a //decimal string// using 18 decimal places.
 */
export function formatXCB(ore: BigNumberish): string {
    return formatUnits(ore, 18);
}

/**
 *  Converts the //decimal string// %%xcb%% to a BigInt, using 18
 *  decimal places.
 */
export function parseXCB(xcb: string): bigint {
    return parseUnits(xcb, 18);
}
