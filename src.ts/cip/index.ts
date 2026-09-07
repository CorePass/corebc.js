import { Contract } from "../contract/index.js";
import type {
	Overrides,
	ContractTransactionResponse,
} from "../contract/index.js";
import type { BlockTag, ContractRunner } from "../providers/index.js";
import { IpfsGateway } from "../ipfs/index.js";

/** On-chain interface defined by CIP-150. */
export const cip150Abi = Object.freeze([
	"function getMetadataValue(string key) view returns (string value)",
	"function hasMetadataKey(string key) view returns (bool exists)",
	"function isMetadataSealed(string key) view returns (bool sealed)",
	"function listMetadataKeys() view returns (string[] keys)",
	"function getMetadataByIndex(uint256 index) view returns (string key, string value)",
	"function metadataCount() view returns (uint256 total)",
	"function setMetadataValue(string key, string value)",
	"function sealMetadataKey(string key)",
]);
export interface Cip150MetadataEntry {
	readonly key: string;
	readonly value: string;
	readonly sealed?: boolean;
}
export const cip151TokenExpirationKey = "tokenExpiration";
export const cip151TradingStopKey = "tradingStop";
export const cip152LabKey = "lab";

/** Lifecycle timestamps in exact Unix seconds; absent values impose no limit. */
export class Cip151Lifecycle {
	readonly tokenExpiration: bigint | null;
	readonly tradingStop: bigint | null;
	constructor(metadata: Readonly<Record<string, string>> = {}) {
		const parse = (key: string): bigint | null => {
			const value = metadata[key];
			if (value == null || value === "") return null;
			if (!/^\d+$/.test(value))
				throw new TypeError(`${key} must be a non-negative Unix timestamp`);
			return BigInt(value);
		};
		this.tokenExpiration = parse(cip151TokenExpirationKey);
		this.tradingStop = parse(cip151TradingStopKey);
	}
	isExpiredAt(seconds: bigint): boolean {
		return this.tokenExpiration !== null && seconds >= this.tokenExpiration;
	}
	isTradingStoppedAt(seconds: bigint): boolean {
		return this.tradingStop !== null && seconds >= this.tradingStop;
	}
}
export interface Cip152LabMeasurement {
	readonly value: string | number;
	readonly unit?: string;
}
/** Validates certificate structure, not the authenticity of its issuer. */
export class Cip152LabCertificate {
	readonly measurements: Readonly<Record<string, Cip152LabMeasurement>>;
	constructor(json: unknown) {
		if (json === null || typeof json !== "object" || Array.isArray(json))
			throw new TypeError("CIP-152 lab.json must be an object");
		const measurements: Record<string, Cip152LabMeasurement> =
			Object.create(null);
		for (const [key, property] of Object.entries(json)) {
			if (
				!property ||
				typeof property !== "object" ||
				Array.isArray(property) ||
				!Object.hasOwn(property, "value")
			)
				throw new TypeError(`CIP-152 property ${key} must contain a value`);
			const { value, unit } = property;
			if (!(
				typeof value === "string" ||
				(typeof value === "number" && Number.isFinite(value))
			))
				throw new TypeError(`CIP-152 property ${key} has an invalid value`);
			if (unit != null && typeof unit !== "string")
				throw new TypeError(`CIP-152 property ${key} has an invalid unit`);
			measurements[key] = Object.freeze(
				unit == null ? { value } : { value, unit },
			);
		}
		this.measurements = Object.freeze(measurements);
	}
}
/** Typed metadata reader and writer. Writes require a signer as runner. */
export class Cip150MetadataContract {
	readonly contract: Contract;
	constructor(address: string, runner: ContractRunner) {
		this.contract = new Contract(address, cip150Abi, runner);
	}
	getValue(key: string, blockTag?: BlockTag): Promise<string> {
		return this.contract.getMetadataValue(key, { blockTag });
	}
	hasKey(key: string, blockTag?: BlockTag): Promise<boolean> {
		return this.contract.hasMetadataKey(key, { blockTag });
	}
	isSealed(key: string, blockTag?: BlockTag): Promise<boolean> {
		return this.contract.isMetadataSealed(key, { blockTag });
	}
	async listKeys(blockTag?: BlockTag): Promise<readonly string[]> {
		return Object.freeze(
			Array.from<string>(await this.contract.listMetadataKeys({ blockTag })),
		);
	}
	async getByIndex(
		index: bigint,
		blockTag?: BlockTag,
	): Promise<Cip150MetadataEntry> {
		const [key, value] = await this.contract.getMetadataByIndex(index, {
			blockTag,
		});
		return Object.freeze({ key, value });
	}
	count(blockTag?: BlockTag): Promise<bigint> {
		return this.contract.metadataCount({ blockTag });
	}
	async readAll(
		blockTag?: BlockTag,
		includeSealedState = true,
	): Promise<readonly Cip150MetadataEntry[]> {
		const entries = [];
		for (const key of await this.listKeys(blockTag)) {
			const value = await this.getValue(key, blockTag);
			entries.push(
				Object.freeze(
					includeSealedState
						? { key, value, sealed: await this.isSealed(key, blockTag) }
						: { key, value },
				),
			);
		}
		return Object.freeze(entries);
	}
	setValue(
		key: string,
		value: string,
		overrides: Overrides = {},
	): Promise<ContractTransactionResponse> {
		return this.contract.setMetadataValue(key, value, overrides);
	}
	sealKey(
		key: string,
		overrides: Overrides = {},
	): Promise<ContractTransactionResponse> {
		return this.contract.sealMetadataKey(key, overrides);
	}
	async readLifecycle(blockTag?: BlockTag): Promise<Cip151Lifecycle> {
		const metadata: Record<string, string> = {};
		for (const key of [cip151TokenExpirationKey, cip151TradingStopKey]) {
			if (await this.hasKey(key, blockTag))
				metadata[key] = await this.getValue(key, blockTag);
		}
		return new Cip151Lifecycle(metadata);
	}
	async readLabCertificate(
		gateway: IpfsGateway,
		blockTag?: BlockTag,
	): Promise<Cip152LabCertificate | null> {
		if (!(await this.hasKey(cip152LabKey, blockTag))) return null;
		const reference = await this.getValue(cip152LabKey, blockTag);
		if (!gateway.resolve(reference).pathname.endsWith("/lab.json"))
			throw new TypeError("CIP-152 reference must point to lab.json");
		return new Cip152LabCertificate(await gateway.readJson(reference));
	}
}
export {
	CustomUnitToken,
	CustomUnitBalance,
	CustomUnitDiscovery,
	customUnitAbi,
} from "./custom-units.js";
