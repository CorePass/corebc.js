import type { AddressLike } from "../address/index.js";
import { Contract } from "../contract/index.js";
import type { BlockTag, ContractRunner } from "../providers/index.js";

export const customUnitAbi = Object.freeze([
	"function supportsUnit(string unit) view returns (bool)",
	"function supportedUnits() view returns (string[])",
	"function preferredUnit() view returns (string)",
	"function balanceOf(address account) view returns (uint256)",
	"function balanceOfUnit(address account, string unit) view returns (uint256)",
]);
export class CustomUnitDiscovery {
	readonly supportedUnits: readonly string[];
	constructor(
		units: readonly string[],
		readonly preferredUnit: string,
	) {
		this.supportedUnits = Object.freeze([...units]);
	}
	get isValid(): boolean {
		return (
			this.supports("units") &&
			this.preferredUnit !== "" &&
			this.supports(this.preferredUnit)
		);
	}
	supports(unit: string): boolean {
		return this.supportedUnits.includes(unit);
	}
}
/** Exact balances and multiplier ratio. A zero denominator has no multiplier. */
export class CustomUnitBalance {
	constructor(
		readonly canonicalAmount: bigint,
		readonly unitAmount: bigint,
		readonly unit: string,
	) {}
	get multiplierNumerator(): bigint {
		return this.unitAmount;
	}
	get multiplierDenominator(): bigint {
		return this.canonicalAmount;
	}
}
/** Core custom-unit contract convention used by Tone and Core API. */
export class CustomUnitToken {
	readonly contract: Contract;
	constructor(address: string, runner: ContractRunner) {
		this.contract = new Contract(address, customUnitAbi, runner);
	}
	async supportsUnit(unit: string, blockTag?: BlockTag): Promise<boolean> {
		return (
			unit.trim() !== "" &&
			(await this.contract.supportsUnit(unit.trim(), { blockTag }))
		);
	}
	async supportedUnits(blockTag?: BlockTag): Promise<readonly string[]> {
		return Object.freeze(
			Array.from<string>(await this.contract.supportedUnits({ blockTag })),
		);
	}
	async preferredUnit(blockTag?: BlockTag): Promise<string> {
		return (await this.contract.preferredUnit({ blockTag })).trim();
	}
	async discover(blockTag?: BlockTag): Promise<CustomUnitDiscovery | null> {
		if (!(await this.supportsUnit("units", blockTag))) return null;
		const discovery = new CustomUnitDiscovery(
			await this.supportedUnits(blockTag),
			await this.preferredUnit(blockTag),
		);
		return discovery.isValid ? discovery : null;
	}
	canonicalBalance(account: AddressLike, blockTag?: BlockTag): Promise<bigint> {
		return this.contract.balanceOf(account, { blockTag });
	}
	balanceOfUnit(
		account: AddressLike,
		unit: string,
		blockTag?: BlockTag,
	): Promise<bigint> {
		if (!unit.trim()) throw new TypeError("unit must not be empty");
		return this.contract.balanceOfUnit(account, unit.trim(), { blockTag });
	}
	async balance(
		account: AddressLike,
		unit?: string,
		blockTag?: BlockTag,
	): Promise<CustomUnitBalance> {
		const resolved = unit?.trim() || (await this.preferredUnit(blockTag));
		const [canonical, calculated] = await Promise.all([
			this.canonicalBalance(account, blockTag),
			this.balanceOfUnit(account, resolved, blockTag),
		]);
		return new CustomUnitBalance(canonical, calculated, resolved);
	}
}
