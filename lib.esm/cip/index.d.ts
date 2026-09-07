import { Contract } from "../contract/index.js";
import type { Overrides, ContractTransactionResponse } from "../contract/index.js";
import type { BlockTag, ContractRunner } from "../providers/index.js";
import { IpfsGateway } from "../ipfs/index.js";
/** On-chain interface defined by CIP-150. */
export declare const cip150Abi: readonly string[];
export interface Cip150MetadataEntry {
    readonly key: string;
    readonly value: string;
    readonly sealed?: boolean;
}
export declare const cip151TokenExpirationKey = "tokenExpiration";
export declare const cip151TradingStopKey = "tradingStop";
export declare const cip152LabKey = "lab";
/** Lifecycle timestamps in exact Unix seconds; absent values impose no limit. */
export declare class Cip151Lifecycle {
    readonly tokenExpiration: bigint | null;
    readonly tradingStop: bigint | null;
    constructor(metadata?: Readonly<Record<string, string>>);
    isExpiredAt(seconds: bigint): boolean;
    isTradingStoppedAt(seconds: bigint): boolean;
}
export interface Cip152LabMeasurement {
    readonly value: string | number;
    readonly unit?: string;
}
/** Validates certificate structure, not the authenticity of its issuer. */
export declare class Cip152LabCertificate {
    readonly measurements: Readonly<Record<string, Cip152LabMeasurement>>;
    constructor(json: unknown);
}
/** Typed metadata reader and writer. Writes require a signer as runner. */
export declare class Cip150MetadataContract {
    readonly contract: Contract;
    constructor(address: string, runner: ContractRunner);
    getValue(key: string, blockTag?: BlockTag): Promise<string>;
    hasKey(key: string, blockTag?: BlockTag): Promise<boolean>;
    isSealed(key: string, blockTag?: BlockTag): Promise<boolean>;
    listKeys(blockTag?: BlockTag): Promise<readonly string[]>;
    getByIndex(index: bigint, blockTag?: BlockTag): Promise<Cip150MetadataEntry>;
    count(blockTag?: BlockTag): Promise<bigint>;
    readAll(blockTag?: BlockTag, includeSealedState?: boolean): Promise<readonly Cip150MetadataEntry[]>;
    setValue(key: string, value: string, overrides?: Overrides): Promise<ContractTransactionResponse>;
    sealKey(key: string, overrides?: Overrides): Promise<ContractTransactionResponse>;
    readLifecycle(blockTag?: BlockTag): Promise<Cip151Lifecycle>;
    readLabCertificate(gateway: IpfsGateway, blockTag?: BlockTag): Promise<Cip152LabCertificate | null>;
}
export { CustomUnitToken, CustomUnitBalance, CustomUnitDiscovery, customUnitAbi, } from "./custom-units.js";
//# sourceMappingURL=index.d.ts.map