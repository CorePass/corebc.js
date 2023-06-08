/**
 *  About networks
 *
 *  @_subsection: api/providers:Networks  [networks]
 */
import { getBigInt, assertArgument } from "../utils/index.js";

import { EnergyCostPlugin } from "./plugins-network.js";

import type { BigNumberish } from "../utils/index.js";
import type { TransactionLike } from "../transaction/index.js";

import type { NetworkPlugin } from "./plugins-network.js";


/**
 *  A Networkish can be used to allude to a Network, by specifing:
 *  - a [[Network]] object
 *  - a well-known (or registered) network name
 *  - a well-known (or registered) chain ID
 *  - an object with sufficient details to describe a network
 */
export type Networkish = Network | number | bigint | string | {
    name?: string,
    networkId?: number,
    //layerOneConnection?: Provider,
    ensAddress?: string,
    ensNetwork?: number
};




/* * * *
// Networks which operation against an L2 can use this plugin to
// specify how to access L1, for the purpose of resolving ENS,
// for example.
export class LayerOneConnectionPlugin extends NetworkPlugin {
    readonly provider!: Provider;
*/


// Networks or clients with a higher need for security (such as clients
// that may automatically make CCIP requests without user interaction)
// can use this plugin to anonymize requests or intercept CCIP requests
// to notify and/or receive authorization from the user
/* * * *

*/

const Networks: Map<string | bigint, () => Network> = new Map();

export class Network {
    #name: string;
    #networkId: bigint;

    #plugins: Map<string, NetworkPlugin>;

    constructor(name: string, networkId: BigNumberish) {
        this.#name = name;
        this.#networkId = getBigInt(networkId);
        this.#plugins = new Map();
    }

    toJSON(): any {
        return { name: this.name, networkId: String(this.networkId) };
    }

    /**
     *  The network common name.
     *
     *  This is the canonical name, as networks migh have multiple
     *  names.
     */
    get name(): string { return this.#name; }
    set name(value: string) { this.#name =  value; }

    /**
     *  The network chain ID.
     */
    get networkId(): bigint { return this.#networkId; }
    set networkId(value: BigNumberish) { this.#networkId = getBigInt(value, "networkId"); }

    /**
     *  Returns true if %%other%% matches this network. Any chain ID
     *  must match, and if no chain ID is present, the name must match.
     *
     *  This method does not currently check for additional properties,
     *  such as ENS address or plug-in compatibility.
     */
    matches(other: Networkish): boolean {
        if (other == null) { return false; }

        if (typeof(other) === "string") {
            try {
                return (this.networkId === getBigInt(other));
            } catch (error) { }
            return (this.name === other);
        }

        if (typeof(other) === "number" || typeof(other) === "bigint") {
            try {
                return (this.networkId === getBigInt(other));
            } catch (error) { }
            return false;
        }

        if (typeof(other) === "object") {
            if (other.networkId != null) {
                try {
                    return (this.networkId === getBigInt(other.networkId));
                } catch (error) { }
                return false;
            }
            if (other.name != null) {
                return (this.name === other.name);
            }
            return false;
        }

        return false;
    }

    /**
     *  Returns the list of plugins currently attached to this Network.
     */
    get plugins(): Array<NetworkPlugin> {
        return Array.from(this.#plugins.values());
    }

    /**
     *  Attach a new %%plugin%% to this Network. The network name
     *  must be unique, excluding any fragment.
     */
    attachPlugin(plugin: NetworkPlugin): this {
        if (this.#plugins.get(plugin.name)) {
            throw new Error(`cannot replace existing plugin: ${ plugin.name } `);
        }
        this.#plugins.set(plugin.name, plugin.clone());
        return this;
    }

    /**
     *  Return the plugin, if any, matching %%name%% exactly. Plugins
     *  with fragments will not be returned unless %%name%% includes
     *  a fragment.
     */
    getPlugin<T extends NetworkPlugin = NetworkPlugin>(name: string): null | T {
        return <T>(this.#plugins.get(name)) || null;
    }

    /**
     *  Gets a list of all plugins that match %%name%%, with otr without
     *  a fragment.
     */
    getPlugins<T extends NetworkPlugin = NetworkPlugin>(basename: string): Array<T> {
        return <Array<T>>(this.plugins.filter((p) => (p.name.split("#")[0] === basename)));
    }

    /**
     *  Create a copy of this Network.
     */
    clone(): Network {
        const clone = new Network(this.name, this.networkId);
        this.plugins.forEach((plugin) => {
            clone.attachPlugin(plugin.clone());
        });
        return clone;
    }

    /**
     *  Compute the intrinsic energy required for a transaction.
     *
     *  A EnergyCostPlugin can be attached to override the default
     *  values.
     */
    computeIntrinsicEnergy(tx: TransactionLike): number {
        const costs = this.getPlugin<EnergyCostPlugin>("org.corebc.plugins.network.EnergyCost") || (new EnergyCostPlugin());

        let energy = costs.txBase;
        if (tx.to == null) { energy += costs.txCreate; }
        if (tx.data) {
            for (let i = 2; i < tx.data.length; i += 2) {
                if (tx.data.substring(i, i + 2) === "00") {
                    energy += costs.txDataZero;
                } else {
                    energy += costs.txDataNonzero;
                }
            }
        }


        return energy;
    }

    /**
     *  Returns a new Network for the %%network%% name or networkId.
     */
    static from(network?: Networkish): Network {
        injectCommonNetworks();

        // Default network
        if (network == null) { return Network.from("mainnet"); }

        // Canonical name or chain ID
        if (typeof(network) === "number") { network = BigInt(network); }
        if (typeof(network) === "string" || typeof(network) === "bigint") {
            const networkFunc = Networks.get(network);
            if (networkFunc) { return networkFunc(); }
            if (typeof(network) === "bigint") {
                return new Network("unknown", network);
            }

            assertArgument(false, "unknown network", "network", network);
        }

        // Clonable with network-like abilities
        if (typeof((<Network>network).clone) === "function") {
            const clone = (<Network>network).clone();
            //if (typeof(network.name) !== "string" || typeof(network.networkId) !== "number") {
            //}
            return clone;
        }

        // Networkish
        if (typeof(network) === "object") {
            assertArgument(typeof(network.name) === "string" && typeof(network.networkId) === "number",
                "invalid network object name or networkId", "network", network);

            const custom = new Network(<string>(network.name), <number>(network.networkId));

            //if ((<any>network).layerOneConnection) {
            //    custom.attachPlugin(new LayerOneConnectionPlugin((<any>network).layerOneConnection));
            //}

            return custom;
        }

        assertArgument(false, "invalid network", "network", network);
    }

    /**
     *  Register %%nameOrnetworkId%% with a function which returns
     *  an instance of a Network representing that chain.
     */
    static register(nameOrnetworkId: string | number | bigint, networkFunc: () => Network): void {
        if (typeof(nameOrnetworkId) === "number") { nameOrnetworkId = BigInt(nameOrnetworkId); }
        const existing = Networks.get(nameOrnetworkId);
        if (existing) {
            assertArgument(false, `conflicting network for ${ JSON.stringify(existing.name) }`, "nameOrnetworkId", nameOrnetworkId);
        }
        Networks.set(nameOrnetworkId, networkFunc);
    }
}


type Options = {
    ensNetwork?: number;
    priorityFee?: number
    altNames?: Array<string>;
};

// See: https://chainlist.org
let injected = false;
function injectCommonNetworks(): void {
    if (injected) { return; }
    injected = true;

    /// Register popular Core networks
    function registerEth(name: string, networkId: number, options: Options): void {
        const func = function() {
            const network = new Network(name, networkId);
            network.attachPlugin(new EnergyCostPlugin());
            return network;
        };

        // Register the network by name and chain ID
        Network.register(name, func);
        Network.register(networkId, func);

        if (options.altNames) {
            options.altNames.forEach((name) => {
                Network.register(name, func);
            });
        }
    }

    registerEth("mainnet", 1, { ensNetwork: 1, altNames: [ "homestead" ] });
    registerEth("ropsten", 3, { ensNetwork: 3 });
    registerEth("rinkeby", 4, { ensNetwork: 4 });
    registerEth("goerli", 5, { ensNetwork: 5 });
    registerEth("kovan", 42, { ensNetwork: 42 });
    registerEth("sepolia", 11155111, { });

    registerEth("classic", 61, { });
    registerEth("classicKotti", 6, { });

    registerEth("xdai", 100, { ensNetwork: 1 });
}
