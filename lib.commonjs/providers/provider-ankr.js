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
 *  [[link-ankr]] provides a third-party service for connecting to
 *  various blockchains over JSON-RPC.
 *
 *  **Supported Networks**
 *
 *  - Core Mainnet (``mainnet``)
 *  - Goerli Testnet (``goerli``)
 *  - Polygon (``matic``)
 *  - Arbitrum (``arbitrum``)
 *
 *  @_subsection: api/providers/thirdparty:Ankr  [providers-ankr]
 */
const defaultApiKey = "9f7d929b018cdffb338517efa06f58359e86ff1ffd350bc889738523659e7972";
function getHost(name) {
    switch (name) {
        case "mainnet":
            return "rpc.ankr.com/eth";
        case "goerli":
            return "rpc.ankr.com/xcb_goerli";
        case "matic":
            return "rpc.ankr.com/polygon";
        case "arbitrum":
            return "rpc.ankr.com/arbitrum";
    }
    errors.assertArgument(false, "unsupported network", "network", name);
}
/**
 *  The **AnkrProvider** connects to the [[link-ankr]]
 *  JSON-RPC end-points.
 *
 *  By default, a highly-throttled API key is used, which is
 *  appropriate for quick prototypes and simple scripts. To
 *  gain access to an increased rate-limit, it is highly
 *  recommended to [sign up here](link-ankr-signup).
 */
class AnkrProvider extends providerJsonrpc.JsonRpcProvider {
    /**
     *  The API key for the Ankr connection.
     */
    apiKey;
    /**
     *  Create a new **AnkrProvider**.
     *
     *  By default connecting to ``mainnet`` with a highly throttled
     *  API key.
     */
    constructor(_network, apiKey) {
        if (_network == null) {
            _network = "mainnet";
        }
        const network$1 = network.Network.from(_network);
        if (apiKey == null) {
            apiKey = defaultApiKey;
        }
        // Ankr does not support filterId, so we force polling
        const options = { polling: true, staticNetwork: network$1 };
        const request = AnkrProvider.getRequest(network$1, apiKey);
        super(request, network$1, options);
        properties.defineProperties(this, { apiKey });
    }
    _getProvider(networkId) {
        try {
            return new AnkrProvider(networkId, this.apiKey);
        }
        catch (error) { }
        return super._getProvider(networkId);
    }
    /**
     *  Returns a prepared request for connecting to %%network%% with
     *  %%apiKey%%.
     */
    static getRequest(network, apiKey) {
        if (apiKey == null) {
            apiKey = defaultApiKey;
        }
        const request = new fetch.FetchRequest(`https:/\/${getHost(network.name)}/${apiKey}`);
        request.allowGzip = true;
        if (apiKey === defaultApiKey) {
            request.retryFunc = async (request, response, attempt) => {
                community.showThrottleMessage("AnkrProvider");
                return true;
            };
        }
        return request;
    }
    getRpcError(payload, error) {
        if (payload.method === "xcb_sendRawTransaction") {
            if (error &&
                error.error &&
                error.error.message === "INTERNAL_ERROR: could not replace existing tx") {
                error.error.message = "replacement transaction underpriced";
            }
        }
        return super.getRpcError(payload, error);
    }
    isCommunityResource() {
        return this.apiKey === defaultApiKey;
    }
}

exports.AnkrProvider = AnkrProvider;
//# sourceMappingURL=provider-ankr.js.map
