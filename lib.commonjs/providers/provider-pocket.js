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
 *  [[link-pocket]] provides a third-party service for connecting to
 *  various blockchains over JSON-RPC.
 *
 *  **Supported Networks**
 *
 *  - Core Mainnet (``mainnet``)
 *  - Goerli Testnet (``goerli``)
 *  - Polygon (``matic``)
 *  - Arbitrum (``arbitrum``)
 *
 *  @_subsection: api/providers/thirdparty:Pocket  [providers-pocket]
 */
const defaultApplicationId = "62e1ad51b37b8e00394bda3b";
function getHost(name) {
    switch (name) {
        case "mainnet":
            return "eth-mainnet.gateway.pokt.network";
        case "goerli":
            return "eth-goerli.gateway.pokt.network";
        case "matic":
            return "poly-mainnet.gateway.pokt.network";
        case "matic-mumbai":
            return "polygon-mumbai-rpc.gateway.pokt.network";
    }
    errors.assertArgument(false, "unsupported network", "network", name);
}
/**
 *  The **PocketProvider** connects to the [[link-pocket]]
 *  JSON-RPC end-points.
 *
 *  By default, a highly-throttled API key is used, which is
 *  appropriate for quick prototypes and simple scripts. To
 *  gain access to an increased rate-limit, it is highly
 *  recommended to [sign up here](link-pocket-signup).
 */
class PocketProvider extends providerJsonrpc.JsonRpcProvider {
    /**
     *  The Application ID for the Pocket connection.
     */
    applicationId;
    /**
     *  The Application Secret for making authenticated requests
     *  to the Pocket connection.
     */
    applicationSecret;
    /**
     *  Create a new **PocketProvider**.
     *
     *  By default connecting to ``mainnet`` with a highly throttled
     *  API key.
     */
    constructor(_network, applicationId, applicationSecret) {
        if (_network == null) {
            _network = "mainnet";
        }
        const network$1 = network.Network.from(_network);
        if (applicationId == null) {
            applicationId = defaultApplicationId;
        }
        if (applicationSecret == null) {
            applicationSecret = null;
        }
        const options = { staticNetwork: network$1 };
        const request = PocketProvider.getRequest(network$1, applicationId, applicationSecret);
        super(request, network$1, options);
        properties.defineProperties(this, {
            applicationId,
            applicationSecret,
        });
    }
    _getProvider(networkId) {
        try {
            return new PocketProvider(networkId, this.applicationId, this.applicationSecret);
        }
        catch (error) { }
        return super._getProvider(networkId);
    }
    /**
     *  Returns a prepared request for connecting to %%network%% with
     *  %%applicationId%%.
     */
    static getRequest(network, applicationId, applicationSecret) {
        if (applicationId == null) {
            applicationId = defaultApplicationId;
        }
        const request = new fetch.FetchRequest(`https:/\/${getHost(network.name)}/v1/lb/${applicationId}`);
        request.allowGzip = true;
        if (applicationSecret) {
            request.setCredentials("", applicationSecret);
        }
        if (applicationId === defaultApplicationId) {
            request.retryFunc = async (request, response, attempt) => {
                community.showThrottleMessage("PocketProvider");
                return true;
            };
        }
        return request;
    }
    isCommunityResource() {
        return this.applicationId === defaultApplicationId;
    }
}

exports.PocketProvider = PocketProvider;
//# sourceMappingURL=provider-pocket.js.map
