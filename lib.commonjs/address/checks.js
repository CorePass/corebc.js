'use strict';

require('../utils/base58.js');
require('../logger/logger.js');
var errors = require('../utils/errors.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');
var index = require('./index.js');

/**
 *  Returns true if %%value%% is an object which implements the
 *  [[Addressable]] interface.
 *
 *  @example:
 *    // Wallets and AbstractSigner sub-classes
 *    isAddressable(Wallet.createRandom())
 *    //_result:
 *
 *    // Contracts
 *    contract = new Contract("dai.tokens.corebc.eth", [ ], provider)
 *    isAddressable(contract)
 *    //_result:
 */
function isAddressable(value) {
    return value && typeof value.getAddress === "function";
}
/**
 *  Returns true if %%value%% is a valid address.
 *
 *  @example:
 *    // Valid address
 *    isAddress("0x8ba1f109551bD432803012645Ac136ddd64DBA72")
 *    //_result:
 *
 *    // Valid ICAP address
 *    isAddress("XE65GB6LDNXYOFTX0NSV3FUWKOWIXAMJK36")
 *    //_result:
 *
 *    // Invalid checksum
 *    isAddress("0x8Ba1f109551bD432803012645Ac136ddd64DBa72")
 *    //_result:
 *
 *    // Invalid ICAP checksum
 *    isAddress("0x8Ba1f109551bD432803012645Ac136ddd64DBA72")
 *    //_result:
 *
 *    // Not an address (an ENS name requires a provided and an
 *    // asynchronous API to access)
 *    isAddress("ricmoo.eth")
 *    //_result:
 */
function isAddress(value) {
    try {
        index.getAddress(value);
        return true;
    }
    catch (error) { }
    return false;
}
async function checkAddress(target, promise) {
    const result = await promise;
    if (result == null ||
        result === "0x0000000000000000000000000000000000000000") {
        errors.assert(typeof target !== "string", "unconfigured name", "UNCONFIGURED_NAME", { value: target });
        errors.assertArgument(false, "invalid AddressLike value; did not resolve to a value address", "target", target);
    }
    return index.getAddress(result);
}
/**
 *  Resolves to an address for the %%target%%, which may be any
 *  supported address type, an [[Addressable]] or a Promise which
 *  resolves to an address.
 *
 *  If an ENS name is provided, but that name has not been correctly
 *  configured a [[UnconfiguredNameError]] is thrown.
 *
 *  @example:
 *    addr = "0x6B175474E89094C44Da98b954EedeAC495271d0F"
 *
 *    // Addresses are return synchronously
 *    resolveAddress(addr, provider)
 *    //_result:
 *
 *    // Address promises are resolved asynchronously
 *    resolveAddress(Promise.resolve(addr))
 *    //_result:
 *
 *
 *    // Addressable objects are resolved asynchronously
 *    contract = new Contract(addr, [ ])
 *    resolveAddress(contract, provider)
 *    //_result:
 *
 *    // Unconfigured ENS names reject
 *    resolveAddress("nothing-here.ricmoo.eth", provider)
 *    //_error:
 *
 *    // ENS names require a NameResolver object passed in
 *    // (notice the provider was omitted)
 *    resolveAddress("nothing-here.ricmoo.eth")
 *    //_error:
 */
function resolveAddress(target) {
    if (typeof target === "string") {
        return index.getAddress(target);
        // assert(resolver != null, "ENS resolution requires a provider",
        //     "UNSUPPORTED_OPERATION", { operation: "resolveName" });
        // return checkAddress(target, resolver.resolveName(target));
    }
    else if (isAddressable(target)) {
        return checkAddress(target, target.getAddress());
    }
    else if (target && typeof target.then === "function") {
        return checkAddress(target, target);
    }
    errors.assertArgument(false, "unsupported addressable value", "target", target);
}

exports.isAddress = isAddress;
exports.isAddressable = isAddressable;
exports.resolveAddress = resolveAddress;
//# sourceMappingURL=checks.js.map
