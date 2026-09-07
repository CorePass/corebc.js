'use strict';

require('../utils/base58.js');
require('../logger/logger.js');
var errors = require('../utils/errors.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');
var providerAnkr = require('./provider-ankr.js');
var providerAlchemy = require('./provider-alchemy.js');
var providerCloudflare = require('./provider-cloudflare.js');
var providerInfura = require('./provider-infura.js');
var providerQuicknode = require('./provider-quicknode.js');
var providerFallback = require('./provider-fallback.js');
var providerJsonrpc = require('./provider-jsonrpc.js');
var providerWebsocket = require('./provider-websocket.js');

function isWebSocketLike(value) {
    return (value &&
        typeof value.send === "function" &&
        typeof value.close === "function");
}
function getDefaultProvider(network, options) {
    if (options == null) {
        options = {};
    }
    if (typeof network === "string" && network.match(/^https?:/)) {
        return new providerJsonrpc.JsonRpcProvider(network);
    }
    if ((typeof network === "string" && network.match(/^wss?:/)) ||
        isWebSocketLike(network)) {
        return new providerWebsocket.WebSocketProvider(network);
    }
    const providers = [];
    if (options.alchemy !== "-") {
        try {
            providers.push(new providerAlchemy.AlchemyProvider(network, options.alchemy));
        }
        catch (error) {
            console.log(error);
        }
    }
    if (options.ankr !== "-" && options.ankr != null) {
        try {
            providers.push(new providerAnkr.AnkrProvider(network, options.ankr));
        }
        catch (error) {
            console.log(error);
        }
    }
    if (options.cloudflare !== "-") {
        try {
            providers.push(new providerCloudflare.CloudflareProvider(network));
        }
        catch (error) {
            console.log(error);
        }
    }
    if (options.infura !== "-") {
        try {
            let projectId = options.infura;
            let projectSecret = undefined;
            if (typeof projectId === "object") {
                projectSecret = projectId.projectSecret;
                projectId = projectId.projectId;
            }
            providers.push(new providerInfura.InfuraProvider(network, projectId, projectSecret));
        }
        catch (error) {
            console.log(error);
        }
    }
    /*
    if (options.pocket !== "-") {
        try {
            let appId = options.pocket;
            let secretKey: undefined | string = undefined;
            let loadBalancer: undefined | boolean = undefined;
            if (typeof(appId) === "object") {
                loadBalancer = !!appId.loadBalancer;
                secretKey = appId.secretKey;
                appId = appId.appId;
            }
            providers.push(new PocketProvider(network, appId, secretKey, loadBalancer));
        } catch (error) { console.log(error); }
    }
*/
    if (options.quicknode !== "-") {
        try {
            let token = options.quicknode;
            providers.push(new providerQuicknode.QuickNodeProvider(network, token));
        }
        catch (error) {
            console.log(error);
        }
    }
    errors.assert(providers.length, "unsupported default network", "UNSUPPORTED_OPERATION", {
        operation: "getDefaultProvider",
    });
    if (providers.length === 1) {
        return providers[0];
    }
    return new providerFallback.FallbackProvider(providers);
}

exports.getDefaultProvider = getDefaultProvider;
//# sourceMappingURL=default-provider.js.map
