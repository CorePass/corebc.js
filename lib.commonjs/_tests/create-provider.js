'use strict';

require('buffer');
require('../address/index.js');
require('../crypto/hmac.js');
require('../crypto/ripemd160.js');
require('../crypto/pbkdf2.js');
require('../crypto/random.js');
require('../crypto/scrypt.js');
require('../crypto/sha3.js');
require('bcrypto/lib/ed448.js');
require('bcrypto/lib/pbkdf2.js');
require('bcrypto/lib/sha3-512.js');
require('crypto');
require('../crypto/keccak.js');
require('../utils/base58.js');
require('../logger/logger.js');
var errors = require('../utils/errors.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');
require('../crypto/signature.js');
require('../abi/abi-coder.js');
require('../abi/fragments.js');
require('../constants/numbers.js');
require('../transaction/transaction.js');
require('../hash/typed-data.js');
require('../contract/contract.js');
require('../providers/provider.js');
require('../providers/format.js');
var providerAlchemy = require('../providers/provider-alchemy.js');
var providerInfura = require('../providers/provider-infura.js');
var providerQuicknode = require('../providers/provider-quicknode.js');
var providerFallback = require('../providers/provider-fallback.js');
require('ws');
var providerPocket = require('../providers/provider-pocket.js');
require('net');
require('utf8');
require('../wallet/json-keystore.js');
require('../wallet/json-crowdsale.js');
require('../bigNumber/bigNumber.js');
require('../wordlists/wordlists.js');

const ethNetworks = ["default", "mainnet", "goerli"];
//const maticNetworks = [ "matic", "maticmum" ];
const ProviderCreators = [
    {
        name: "AlchemyProvider",
        networks: ethNetworks,
        create: function (network) {
            return new providerAlchemy.AlchemyProvider(network, "YrPw6SWb20vJDRFkhWq8aKnTQ8JRNRHM");
        },
    },
    {
        name: "InfuraProvider",
        networks: ethNetworks,
        create: function (network) {
            return new providerInfura.InfuraProvider(network, "49a0efa3aaee4fd99797bfa94d8ce2f1");
        },
    },
    {
        name: "InfuraWebsocketProvider",
        networks: ethNetworks,
        create: function (network) {
            return providerInfura.InfuraProvider.getWebSocketProvider(network, "49a0efa3aaee4fd99797bfa94d8ce2f1");
        },
    },
    {
        name: "PocketProvider",
        networks: ethNetworks,
        create: function (network) {
            return new providerPocket.PocketProvider(network);
        },
    },
    {
        name: "QuickNodeProvider",
        networks: ethNetworks,
        create: function (network) {
            return new providerQuicknode.QuickNodeProvider(network);
        },
    },
    {
        name: "FallbackProvider",
        networks: ethNetworks,
        create: function (network) {
            const providers = [];
            for (const providerName of [
                "AlchemyProvider",
                "AnkrProvider",
                "InfuraProvider",
            ]) {
                const provider = getProvider(providerName, network);
                if (provider) {
                    providers.push(provider);
                }
            }
            if (providers.length === 0) {
                throw new Error("UNSUPPORTED NETWORK");
            }
            return new providerFallback.FallbackProvider(providers);
        },
    },
];
let setup = false;
const cleanup = [];
function setupProviders() {
    after(function () {
        for (const func of cleanup) {
            func();
        }
    });
    setup = true;
}
const providerNames = Object.freeze(ProviderCreators.map((c) => c.name));
function getCreator(provider) {
    const creators = ProviderCreators.filter((c) => c.name === provider);
    if (creators.length === 1) {
        return creators[0];
    }
    return null;
}
function getProviderNetworks(provider) {
    const creator = getCreator(provider);
    if (creator) {
        return creator.networks;
    }
    return [];
}
function getProvider(provider, network) {
    if (setup == false) {
        throw new Error("MUST CALL setupProviders in root context");
    }
    const creator = getCreator(provider);
    try {
        if (creator) {
            const provider = creator.create(network);
            if (provider) {
                cleanup.push(() => {
                    provider.destroy();
                });
            }
            return provider;
        }
    }
    catch (error) {
        if (!errors.isError(error, "INVALID_ARGUMENT")) {
            throw error;
        }
    }
    return null;
}
function checkProvider(provider, network) {
    const creator = getCreator(provider);
    return creator != null;
}
function connect(network) {
    const provider = getProvider("InfuraProvider", network);
    if (provider == null) {
        throw new Error(`could not connect to ${network}`);
    }
    return provider;
}

exports.checkProvider = checkProvider;
exports.connect = connect;
exports.getProvider = getProvider;
exports.getProviderNetworks = getProviderNetworks;
exports.providerNames = providerNames;
exports.setupProviders = setupProviders;
//# sourceMappingURL=create-provider.js.map
