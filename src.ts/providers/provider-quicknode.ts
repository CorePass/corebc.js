/**
 *  [[link-quicknode]] provides a third-party service for connecting to
 *  various blockchains over JSON-RPC.
 *
 *  **Supported Networks**
 *
 *  - Core Mainnet (``mainnet``)
 *  - Goerli Testnet (``goerli``)
 *  - Arbitrum (``arbitrum``)
 *  - Arbitrum Goerli Testnet (``arbitrum-goerli``)
 *  - Optimism (``optimism``)
 *  - Optimism Goerli Testnet (``optimism-goerli``)
 *  - Polygon (``matic``)
 *  - Polygon Mumbai Testnet (``matic-mumbai``)
 *
 *  @_subsection: api/providers/thirdparty:QuickNode  [providers-quicknode]
 */

import {
	defineProperties,
	FetchRequest,
	assertArgument,
} from "../utils/index.js";

import { showThrottleMessage } from "./community.js";
import { Network } from "./network.js";
import { JsonRpcProvider } from "./provider-jsonrpc.js";

import type { AbstractProvider } from "./abstract-provider.js";
import type { CommunityResourcable } from "./community.js";
import type { Networkish } from "./network.js";

const defaultToken = "919b412a057b5e9c9b6dce193c5a60242d6efadb";

function getHost(name: string): string {
	switch (name) {
		case "mainnet":
			return "corebc.quiknode.pro";

		case "arbitrum":
			return "corebc.arbitrum-mainnet.quiknode.pro";
		case "arbitrum-goerli":
			return "corebc.arbitrum-goerli.quiknode.pro";
		case "matic":
			return "corebc.matic.quiknode.pro";
		case "matic-mumbai":
			return "corebc.matic-testnet.quiknode.pro";
		case "optimism":
			return "corebc.optimism.quiknode.pro";
		case "optimism-goerli":
			return "corebc.optimism-goerli.quiknode.pro";
	}

	assertArgument(false, "unsupported network", "network", name);
}

/**
 *  The **QuickNodeProvider** connects to the [[link-quicknode]]
 *  JSON-RPC end-points.
 *
 *  By default, a highly-throttled API token is used, which is
 *  appropriate for quick prototypes and simple scripts. To
 *  gain access to an increased rate-limit, it is highly
 *  recommended to [sign up here](link-quicknode).
 */
export class QuickNodeProvider
	extends JsonRpcProvider
	implements CommunityResourcable
{
	/**
	 *  The API token.
	 */
	readonly token!: string;

	/**
	 *  Creates a new **QuickNodeProvider**.
	 */
	constructor(_network?: Networkish, token?: null | string) {
		if (_network == null) {
			_network = "mainnet";
		}
		const network = Network.from(_network);
		if (token == null) {
			token = defaultToken;
		}

		const request = QuickNodeProvider.getRequest(network, token);
		super(request, network, { staticNetwork: network });

		defineProperties<QuickNodeProvider>(this, { token });
	}

	_getProvider(networkId: number): AbstractProvider {
		try {
			return new QuickNodeProvider(networkId, this.token);
		} catch (error) {}
		return super._getProvider(networkId);
	}

	isCommunityResource(): boolean {
		return this.token === defaultToken;
	}

	/**
	 *  Returns a new request prepared for %%network%% and the
	 *  %%token%%.
	 */
	static getRequest(network: Network, token?: null | string): FetchRequest {
		if (token == null) {
			token = defaultToken;
		}

		const request = new FetchRequest(
			`https:/\/${getHost(network.name)}/${token}`,
		);
		request.allowGzip = true;
		//if (projectSecret) { request.setCredentials("", projectSecret); }

		if (token === defaultToken) {
			request.retryFunc = async (request, response, attempt) => {
				showThrottleMessage("QuickNodeProvider");
				return true;
			};
		}

		return request;
	}
}
