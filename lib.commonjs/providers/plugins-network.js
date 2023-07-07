"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeeDataNetworkPlugin = exports.EnergyCostPlugin = exports.NetworkPlugin = void 0;
const properties_js_1 = require("../utils/properties.js");
const index_js_1 = require("../utils/index.js");
class NetworkPlugin {
    name;
    constructor(name) {
        (0, properties_js_1.defineProperties)(this, { name });
    }
    clone() {
        return new NetworkPlugin(this.name);
    }
}
exports.NetworkPlugin = NetworkPlugin;
class EnergyCostPlugin extends NetworkPlugin {
    effectiveBlock;
    txBase;
    txCreate;
    txDataZero;
    txDataNonzero;
    txAccessListStorageKey;
    txAccessListAddress;
    constructor(effectiveBlock, costs) {
        if (effectiveBlock == null) {
            effectiveBlock = 0;
        }
        super(`org.corebc.network.plugins.EnergyCost#${(effectiveBlock || 0)}`);
        const props = { effectiveBlock };
        function set(name, nullish) {
            let value = (costs || {})[name];
            if (value == null) {
                value = nullish;
            }
            (0, index_js_1.assertArgument)(typeof (value) === "number", `invalud value for ${name}`, "costs", costs);
            props[name] = value;
        }
        set("txBase", 21000);
        set("txCreate", 32000);
        set("txDataZero", 4);
        set("txDataNonzero", 16);
        set("txAccessListStorageKey", 1900);
        set("txAccessListAddress", 2400);
        (0, properties_js_1.defineProperties)(this, props);
    }
    clone() {
        return new EnergyCostPlugin(this.effectiveBlock, this);
    }
}
exports.EnergyCostPlugin = EnergyCostPlugin;
class FeeDataNetworkPlugin extends NetworkPlugin {
    #feeDataFunc;
    get feeDataFunc() {
        return this.#feeDataFunc;
    }
    constructor(feeDataFunc) {
        super("org.corebc.plugins.network.FeeData");
        this.#feeDataFunc = feeDataFunc;
    }
    async getFeeData(provider) {
        return await this.#feeDataFunc(provider);
    }
    clone() {
        return new FeeDataNetworkPlugin(this.#feeDataFunc);
    }
}
exports.FeeDataNetworkPlugin = FeeDataNetworkPlugin;
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
//# sourceMappingURL=plugins-network.js.map