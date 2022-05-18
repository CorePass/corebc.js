"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Formatter = exports.showThrottleMessage = exports.isCommunityResourcable = exports.isCommunityResource = exports.getNetwork = exports.getDefaultProvider = exports.JsonRpcSigner = exports.IpcProvider = exports.WebSocketProvider = exports.Web3Provider = exports.StaticJsonRpcProvider = exports.JsonRpcBatchProvider = exports.JsonRpcProvider = exports.FallbackProvider = exports.UrlJsonRpcProvider = exports.Resolver = exports.BaseProvider = exports.Provider = void 0;
var corebc_abstract_provider_1 = require("@corepass/corebc-abstract-provider");
Object.defineProperty(exports, "Provider", { enumerable: true, get: function () { return corebc_abstract_provider_1.Provider; } });
var corebc_networks_1 = require("@corepass/corebc-networks");
Object.defineProperty(exports, "getNetwork", { enumerable: true, get: function () { return corebc_networks_1.getNetwork; } });
var base_provider_1 = require("./base-provider");
Object.defineProperty(exports, "BaseProvider", { enumerable: true, get: function () { return base_provider_1.BaseProvider; } });
Object.defineProperty(exports, "Resolver", { enumerable: true, get: function () { return base_provider_1.Resolver; } });
var fallback_provider_1 = require("./fallback-provider");
Object.defineProperty(exports, "FallbackProvider", { enumerable: true, get: function () { return fallback_provider_1.FallbackProvider; } });
var ipc_provider_1 = require("./ipc-provider");
Object.defineProperty(exports, "IpcProvider", { enumerable: true, get: function () { return ipc_provider_1.IpcProvider; } });
var json_rpc_provider_1 = require("./json-rpc-provider");
Object.defineProperty(exports, "JsonRpcProvider", { enumerable: true, get: function () { return json_rpc_provider_1.JsonRpcProvider; } });
Object.defineProperty(exports, "JsonRpcSigner", { enumerable: true, get: function () { return json_rpc_provider_1.JsonRpcSigner; } });
var json_rpc_batch_provider_1 = require("./json-rpc-batch-provider");
Object.defineProperty(exports, "JsonRpcBatchProvider", { enumerable: true, get: function () { return json_rpc_batch_provider_1.JsonRpcBatchProvider; } });
var url_json_rpc_provider_1 = require("./url-json-rpc-provider");
Object.defineProperty(exports, "StaticJsonRpcProvider", { enumerable: true, get: function () { return url_json_rpc_provider_1.StaticJsonRpcProvider; } });
Object.defineProperty(exports, "UrlJsonRpcProvider", { enumerable: true, get: function () { return url_json_rpc_provider_1.UrlJsonRpcProvider; } });
var web3_provider_1 = require("./web3-provider");
Object.defineProperty(exports, "Web3Provider", { enumerable: true, get: function () { return web3_provider_1.Web3Provider; } });
var websocket_provider_1 = require("./websocket-provider");
Object.defineProperty(exports, "WebSocketProvider", { enumerable: true, get: function () { return websocket_provider_1.WebSocketProvider; } });
var formatter_1 = require("./formatter");
Object.defineProperty(exports, "Formatter", { enumerable: true, get: function () { return formatter_1.Formatter; } });
Object.defineProperty(exports, "isCommunityResourcable", { enumerable: true, get: function () { return formatter_1.isCommunityResourcable; } });
Object.defineProperty(exports, "isCommunityResource", { enumerable: true, get: function () { return formatter_1.isCommunityResource; } });
Object.defineProperty(exports, "showThrottleMessage", { enumerable: true, get: function () { return formatter_1.showThrottleMessage; } });
var corebc_logger_1 = require("@corepass/corebc-logger");
var _version_1 = require("./_version");
var logger = new corebc_logger_1.Logger(_version_1.version);
////////////////////////
// Helper Functions
function getDefaultProvider(network, options) {
    if (network == null) {
        network = "homestead";
    }
    // If passed a URL, figure out the right type of provider based on the scheme
    if (typeof (network) === "string") {
        // @TODO: Add support for IpcProvider; maybe if it ends in ".ipc"?
        // Handle http and ws (and their secure variants)
        var match = network.match(/^(ws|http)s?:/i);
        if (match) {
            switch (match[1]) {
                case "http":
                    return new json_rpc_provider_1.JsonRpcProvider(network);
                case "ws":
                    return new websocket_provider_1.WebSocketProvider(network);
                default:
                    logger.throwArgumentError("unsupported URL scheme", "network", network);
            }
        }
    }
    var n = (0, corebc_networks_1.getNetwork)(network);
    if (!n || !n._defaultProvider) {
        logger.throwError("unsupported getDefaultProvider network", corebc_logger_1.Logger.errors.NETWORK_ERROR, {
            operation: "getDefaultProvider",
            network: network
        });
    }
    return n._defaultProvider({
        FallbackProvider: fallback_provider_1.FallbackProvider,
        JsonRpcProvider: json_rpc_provider_1.JsonRpcProvider,
        Web3Provider: web3_provider_1.Web3Provider,
        IpcProvider: ipc_provider_1.IpcProvider,
    }, options);
}
exports.getDefaultProvider = getDefaultProvider;
//# sourceMappingURL=index.js.map