import type { AddressLike } from "../address/index.js";
import { Contract } from "../contract/index.js";
import type { BlockTag, ContractRunner } from "../providers/index.js";
export declare const customUnitAbi: readonly string[];
export declare class CustomUnitDiscovery {
    readonly preferredUnit: string;
    readonly supportedUnits: readonly string[];
    constructor(units: readonly string[], preferredUnit: string);
    get isValid(): boolean;
    supports(unit: string): boolean;
}
/** Exact balances and multiplier ratio. A zero denominator has no multiplier. */
export declare class CustomUnitBalance {
    readonly canonicalAmount: bigint;
    readonly unitAmount: bigint;
    readonly unit: string;
    constructor(canonicalAmount: bigint, unitAmount: bigint, unit: string);
    get multiplierNumerator(): bigint;
    get multiplierDenominator(): bigint;
}
/** Core custom-unit contract convention used by Tone and Core API. */
export declare class CustomUnitToken {
    readonly contract: Contract;
    constructor(address: string, runner: ContractRunner);
    supportsUnit(unit: string, blockTag?: BlockTag): Promise<boolean>;
    supportedUnits(blockTag?: BlockTag): Promise<readonly string[]>;
    preferredUnit(blockTag?: BlockTag): Promise<string>;
    discover(blockTag?: BlockTag): Promise<CustomUnitDiscovery | null>;
    canonicalBalance(account: AddressLike, blockTag?: BlockTag): Promise<bigint>;
    balanceOfUnit(account: AddressLike, unit: string, blockTag?: BlockTag): Promise<bigint>;
    balance(account: AddressLike, unit?: string, blockTag?: BlockTag): Promise<CustomUnitBalance>;
}
//# sourceMappingURL=custom-units.d.ts.map