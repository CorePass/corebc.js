'use strict';

require('../utils/base58.js');
require('../logger/logger.js');
var errors = require('../utils/errors.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');
var network = require('./network.js');
var providerJsonrpc = require('./provider-jsonrpc.js');

/**
 *  About Cloudflare
 *
 *  @_subsection: api/providers/thirdparty:Cloudflare  [providers-cloudflare]
 */
/**
 *  About Cloudflare...
 */
class CloudflareProvider extends providerJsonrpc.JsonRpcProvider {
    constructor(_network) {
        if (_network == null) {
            _network = "mainnet";
        }
        const network$1 = network.Network.from(_network);
        errors.assertArgument(network$1.name === "mainnet", "unsupported network", "network", _network);
        super("https://cloudflare-eth.com/", network$1, { staticNetwork: network$1 });
    }
}

exports.CloudflareProvider = CloudflareProvider;
//# sourceMappingURL=provider-cloudflare.js.map
