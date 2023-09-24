import type { BigNumberish, Numeric } from "../utils/index.js";
/**
 *  Converts %%value%% into a //decimal string//, assuming %%unit%% decimal
 *  places. The %%unit%% may be the number of decimal places or the name of
 *  a unit
 *
 */
export declare function formatUnits(value: BigNumberish, unit?: string | Numeric): string;
/**
 *  Converts the //decimal string// %%value%% to a BigInt, assuming
 *  %%unit%% decimal places. The %%unit%% may the number of decimal places
 *  or the name of a unit.
 */
export declare const scientificToDecimal: (num: string | number) => string | number;
export declare const trimDecimals: (n: string, decimals?: number) => string;
export declare function parseUnits(value: string, unit?: string | Numeric): bigint;
/**
 *  Converts %%value%% into a //decimal string// using 18 decimal places.
 */
export declare function formatXCB(ore: BigNumberish): string;
/**
 *  Converts the //decimal string// %%xcb%% to a BigInt, using 18
 *  decimal places.
 */
export declare function parseXCB(xcb: string): bigint;
//# sourceMappingURL=units.d.ts.map