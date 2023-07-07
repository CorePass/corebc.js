/**
 *  [[link-corebcscan]] provides a third-party service for connecting to
 *  various blockchains over a combination of JSON-RPC and custom API
 *  endpoints.
 *
 *  **Supported Networks**
 *
 *  - Core Mainnet (``mainnet``)
 *  - Goerli Testnet (``goerli``)
 *  - Sepolia Testnet (``sepolia``)
 *  - Arbitrum (``arbitrum``)
 *  - Arbitrum Goerli Testnet (``arbitrum-goerli``)
 *  - Optimism (``optimism``)
 *  - Optimism Goerli Testnet (``optimism-goerli``)
 *  - Polygon (``matic``)
 *  - Polygon Mumbai Testnet (``matic-mumbai``)
 *
 *  @_subsection api/providers/thirdparty:corebcscan  [providers-corebcscan]
 */
import { Contract } from "../contract/index.js";
import { AbstractProvider } from "./abstract-provider.js";
import { Network } from "./network.js";
import { NetworkPlugin } from "./plugins-network.js";
import { PerformActionRequest } from "./abstract-provider.js";
import type { Networkish } from "./network.js";
import type { TransactionRequest } from "./provider.js";
export type DebugEventCoreBCscanProvider = {
    action: "sendRequest";
    id: number;
    url: string;
    payload: Record<string, any>;
} | {
    action: "receiveRequest";
    id: number;
    result: any;
} | {
    action: "receiveError";
    id: number;
    error: any;
};
/**
 *  A Network can include an **CoreBCscanPlugin** to provide
 *  a custom base URL.
 *
 *  @_docloc: api/providers/thirdparty:CoreBCscan
 */
export declare class CoreBCscanPlugin extends NetworkPlugin {
    /**
     *  The CoreBCscan API base URL.
     */
    readonly baseUrl: string;
    /**
     *  Creates a new **CoreBCscanProvider** which will use
     *  %%baseUrl%%.
     */
    constructor(baseUrl: string);
    clone(): CoreBCscanPlugin;
}
/**
 *  The **CoreBCcanBaseProvider** is the super-class of
 *  [[CoreBCcanProvider]], which should generally be used instead.
 *
 *  Since the **CoreBCcanProvider** includes additional code for
 *  [[Contract]] access, in //rare cases// that contracts are not
 *  used, this class can reduce code size.
 *
 *  @_docloc: api/providers/thirdparty:CoreBCcan
 */
export declare class CoreBCcanProvider extends AbstractProvider {
    #private;
    /**
     *  The connected network.
     */
    readonly network: Network;
    /**
     *  The API key or null if using the community provided bandwidth.
     */
    readonly apiKey: null | string;
    /**
     *  Creates a new **CoreBCcanBaseProvider**.
     */
    constructor(_network?: Networkish, _apiKey?: string);
    /**
     *  Returns the base URL.
     *
     *  If an [[CoreBCcanPlugin]] is configured on the
     *  [[CoreBCcanBaseProvider_network]], returns the plugin's
     *  baseUrl.
     */
    getBaseUrl(): string;
    /**
     *  Returns the URL for the %%module%% and %%params%%.
     */
    getUrl(module: string, params: Record<string, string>): string;
    /**
     *  Returns the URL for using POST requests.
     */
    getPostUrl(): string;
    /**
     *  Returns the parameters for using POST requests.
     */
    getPostData(module: string, params: Record<string, any>): Record<string, any>;
    detectNetwork(): Promise<Network>;
    /**
     *  Resolves to the result of calling %%module%% with %%params%%.
     *
     *  If %%post%%, the request is made as a POST request.
     */
    fetch(module: string, params: Record<string, any>, post?: boolean): Promise<any>;
    /**
     *  Returns %%transaction%% normalized for the CoreBCscan API.
     */
    _getTransactionPostData(transaction: TransactionRequest): Record<string, string>;
    /**
     *  Throws the normalized CoreBC error.
     */
    _checkError(req: PerformActionRequest, error: Error, transaction: any): never;
    _detectNetwork(): Promise<Network>;
    _perform(req: PerformActionRequest): Promise<any>;
    getNetwork(): Promise<Network>;
    /**
     *  Resolves to the current price of xcb.
     *
     *  This returns ``0`` on any network other than ``mainnet``.
     */
    getXCBPrice(): Promise<number>;
    /**
     *  Resolves to a [Contract]] for %%address%%, using the
     *  CoreBC API to retreive the Contract ABI.
     */
    getContract(_address: string): Promise<null | Contract>;
    isCommunityResource(): boolean;
}
//# sourceMappingURL=provider-xcbscan.d.ts.map