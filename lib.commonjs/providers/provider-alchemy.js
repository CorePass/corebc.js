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
 *  About Alchemy
 *
 *  @_subsection: api/providers/thirdparty:Alchemy  [providers-alchemy]
 */
const defaultApiKey = "_gg7wSSi0KMBsdKnGVfHDueq6xMB9EkC";
function getHost(name) {
    switch (name) {
        case "mainnet":
            return "eth-mainnet.alchemyapi.io";
        case "goerli":
            return "eth-goerli.g.alchemy.com";
        case "sepolia":
            return "eth-sepolia.g.alchemy.com";
        case "arbitrum":
            return "arb-mainnet.g.alchemy.com";
        case "arbitrum-goerli":
            return "arb-goerli.g.alchemy.com";
        case "matic":
            return "polygon-mainnet.g.alchemy.com";
        case "matic-mumbai":
            return "polygon-mumbai.g.alchemy.com";
        case "optimism":
            return "opt-mainnet.g.alchemy.com";
        case "optimism-goerli":
            return "opt-goerli.g.alchemy.com";
    }
    errors.assertArgument(false, "unsupported network", "network", name);
}
/**
 *  The **AlchemyProvider** connects to the [[link-alchemy]]
 *  JSON-RPC end-points.
 *
 *  By default, a highly-throttled API key is used, which is
 *  appropriate for quick prototypes and simple scripts. To
 *  gain access to an increased rate-limit, it is highly
 *  recommended to [sign up here](link-alchemy-signup).
 *
 *  @_docloc: api/providers/thirdparty
 */
class AlchemyProvider extends providerJsonrpc.JsonRpcProvider {
    apiKey;
    constructor(_network, apiKey) {
        if (_network == null) {
            _network = "mainnet";
        }
        const network$1 = network.Network.from(_network);
        if (apiKey == null) {
            apiKey = defaultApiKey;
        }
        const request = AlchemyProvider.getRequest(network$1, apiKey);
        super(request, network$1, { staticNetwork: network$1 });
        properties.defineProperties(this, { apiKey });
    }
    _getProvider(networkId) {
        try {
            return new AlchemyProvider(networkId, this.apiKey);
        }
        catch (error) { }
        return super._getProvider(networkId);
    }
    async _perform(req) {
        // https://docs.alchemy.com/reference/trace-transaction
        if (req.method === "getTransactionResult") {
            const { trace, tx } = await properties.resolveProperties({
                trace: this.send("trace_transaction", [req.hash]),
                tx: this.getTransaction(req.hash),
            });
            if (trace == null || tx == null) {
                return null;
            }
            let data;
            let error = false;
            try {
                data = trace[0].result.output;
                error = trace[0].error === "Reverted";
            }
            catch (error) { }
            if (data) {
                errors.assert(!error, "an error occurred during transaction executions", "CALL_EXCEPTION", {
                    action: "getTransactionResult",
                    data,
                    reason: null,
                    transaction: tx,
                    invocation: null,
                    revert: null, // @TODO
                });
                return data;
            }
            errors.assert(false, "could not parse trace result", "BAD_DATA", {
                value: trace,
            });
        }
        return await super._perform(req);
    }
    isCommunityResource() {
        return this.apiKey === defaultApiKey;
    }
    static getRequest(network, apiKey) {
        if (apiKey == null) {
            apiKey = defaultApiKey;
        }
        const request = new fetch.FetchRequest(`https:/\/${getHost(network.name)}/v2/${apiKey}`);
        request.allowGzip = true;
        if (apiKey === defaultApiKey) {
            request.retryFunc = async (request, response, attempt) => {
                community.showThrottleMessage("alchemy");
                return true;
            };
        }
        return request;
    }
}

exports.AlchemyProvider = AlchemyProvider;
//# sourceMappingURL=provider-alchemy.js.map
