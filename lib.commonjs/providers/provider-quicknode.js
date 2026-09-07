'use strict';

require('../utils/base58.js');
require('../logger/logger.js');
var errors = require('../utils/errors.js');
var properties = require('../utils/properties.js');
var fetch = require('../utils/fetch.js');
require('../utils/fixednumber.js');
require('../utils/maths.js');
var community = require('./community.js');
var network = require('./network.js');
var providerJsonrpc = require('./provider-jsonrpc.js');

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
const defaultToken = "919b412a057b5e9c9b6dce193c5a60242d6efadb";
function getHost(name) {
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
    errors.assertArgument(false, "unsupported network", "network", name);
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
class QuickNodeProvider extends providerJsonrpc.JsonRpcProvider {
    /**
     *  The API token.
     */
    token;
    /**
     *  Creates a new **QuickNodeProvider**.
     */
    constructor(_network, token) {
        if (_network == null) {
            _network = "mainnet";
        }
        const network$1 = network.Network.from(_network);
        if (token == null) {
            token = defaultToken;
        }
        const request = QuickNodeProvider.getRequest(network$1, token);
        super(request, network$1, { staticNetwork: network$1 });
        properties.defineProperties(this, { token });
    }
    _getProvider(networkId) {
        try {
            return new QuickNodeProvider(networkId, this.token);
        }
        catch (error) { }
        return super._getProvider(networkId);
    }
    isCommunityResource() {
        return this.token === defaultToken;
    }
    /**
     *  Returns a new request prepared for %%network%% and the
     *  %%token%%.
     */
    static getRequest(network, token) {
        if (token == null) {
            token = defaultToken;
        }
        const request = new fetch.FetchRequest(`https:/\/${getHost(network.name)}/${token}`);
        request.allowGzip = true;
        //if (projectSecret) { request.setCredentials("", projectSecret); }
        if (token === defaultToken) {
            request.retryFunc = async (request, response, attempt) => {
                community.showThrottleMessage("QuickNodeProvider");
                return true;
            };
        }
        return request;
    }
}

exports.QuickNodeProvider = QuickNodeProvider;
//# sourceMappingURL=provider-quicknode.js.map
