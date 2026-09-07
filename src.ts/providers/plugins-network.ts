import { defineProperties } from "../utils/properties.js";

import { assertArgument } from "../utils/index.js";

import type { FeeData, Provider } from "./provider.js";
export class NetworkPlugin {
	readonly name!: string;

	constructor(name: string) {
		defineProperties<NetworkPlugin>(this, { name });
	}

	clone(): NetworkPlugin {
		return new NetworkPlugin(this.name);
	}

	//    validate(network: Network): NetworkPlugin {
	//        return this;
	//    }
}

// Networks can use this plugin to override calculations for the
// intrinsic energy cost of a transaction for networks that differ
// from the latest hardfork on Core mainnet.
export type EnergyCostParameters = {
	txBase?: number;
	txCreate?: number;
	txDataZero?: number;
	txDataNonzero?: number;
	txAccessListStorageKey?: number;
	txAccessListAddress?: number;
};

export class EnergyCostPlugin
	extends NetworkPlugin
	implements EnergyCostParameters
{
	readonly effectiveBlock!: number;

	readonly txBase!: number;
	readonly txCreate!: number;
	readonly txDataZero!: number;
	readonly txDataNonzero!: number;
	readonly txAccessListStorageKey!: number;
	readonly txAccessListAddress!: number;

	constructor(effectiveBlock?: number, costs?: EnergyCostParameters) {
		if (effectiveBlock == null) {
			effectiveBlock = 0;
		}
		super(`org.corebc.network.plugins.EnergyCost#${effectiveBlock || 0}`);

		const props: Record<string, number> = { effectiveBlock };
		function set(name: keyof EnergyCostParameters, nullish: number): void {
			let value = (costs || {})[name];
			if (value == null) {
				value = nullish;
			}
			assertArgument(
				typeof value === "number",
				`invalud value for ${name}`,
				"costs",
				costs,
			);
			props[name] = value;
		}

		set("txBase", 21000);
		set("txCreate", 32000);
		set("txDataZero", 4);
		set("txDataNonzero", 16);
		set("txAccessListStorageKey", 1900);
		set("txAccessListAddress", 2400);

		defineProperties<EnergyCostPlugin>(this, props);
	}

	clone(): EnergyCostPlugin {
		return new EnergyCostPlugin(this.effectiveBlock, this);
	}
}

export class FeeDataNetworkPlugin extends NetworkPlugin {
	readonly #feeDataFunc: (provider: Provider) => Promise<FeeData>;

	get feeDataFunc(): (provider: Provider) => Promise<FeeData> {
		return this.#feeDataFunc;
	}

	constructor(feeDataFunc: (provider: Provider) => Promise<FeeData>) {
		super("org.corebc.plugins.network.FeeData");
		this.#feeDataFunc = feeDataFunc;
	}

	async getFeeData(provider: Provider): Promise<FeeData> {
		return await this.#feeDataFunc(provider);
	}

	clone(): FeeDataNetworkPlugin {
		return new FeeDataNetworkPlugin(this.#feeDataFunc);
	}
}

/*
export class CustomBlockNetworkPlugin extends NetworkPlugin {
    readonly #blockFunc: (provider: Provider, block: BlockParams<string>) => Block<string>;
    readonly #blockWithTxsFunc: (provider: Provider, block: BlockParams<TransactionResponseParams>) => Block<TransactionResponse>;

    async getBlock(provider: Provider, block: BlockParams<string>): Promise<Block<string>> {
        return await this.#blockFunc(provider, block);
    }

    async getBlockions(provider: Provider, block: BlockParams<TransactionResponseParams>): Promise<Block<TransactionResponse>> {
        return await this.#blockWithTxsFunc(provider, block);
    }

    clone(): CustomBlockNetworkPlugin {
        return new CustomBlockNetworkPlugin(this.#blockFunc, this.#blockWithTxsFunc);
    }
}
*/
