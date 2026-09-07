'use strict';

require('../utils/base58.js');
require('../logger/logger.js');
require('../utils/errors.js');
var properties = require('../utils/properties.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');

const PluginIdFallbackProvider = "org.corebc.plugins.provider.QualifiedPlugin";
class CheckQualifiedPlugin {
    constructor() {
        properties.defineProperties(this, {
            name: PluginIdFallbackProvider,
        });
    }
    connect(provider) {
        return this;
    }
    // Retruns true if this value should be considered qualified for
    // inclusion in the quorum.
    isQualified(action, result) {
        return true;
    }
}
class PossiblyPrunedTransactionPlugin extends CheckQualifiedPlugin {
    isQualified(action, result) {
        if (action.method === "getTransaction" ||
            action.method === "getTransactionReceipt") {
            if (result == null) {
                return false;
            }
        }
        return super.isQualified(action, result);
    }
}

exports.CheckQualifiedPlugin = CheckQualifiedPlugin;
exports.PluginIdFallbackProvider = PluginIdFallbackProvider;
exports.PossiblyPrunedTransactionPlugin = PossiblyPrunedTransactionPlugin;
//# sourceMappingURL=plugin-fallback.js.map
