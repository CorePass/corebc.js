'use strict';

require('../utils/base58.js');
var data = require('../utils/data.js');
require('../utils/errors.js');
var logger$1 = require('../logger/logger.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
var maths = require('../utils/maths.js');
var index = require('./index.js');
var sha3 = require('../crypto/sha3.js');
var address = require('../transaction/address.js');

const logger = new logger$1.Logger("contract-address/0.0.1");
/**
 *  Returns the address that would result from a ``CREATE`` for %%tx%%.
 *
 *  This can be used to compute the address a contract will be
 *  deployed to by an EOA when sending a deployment transaction (i.e.
 *  when the ``to`` address is ``null``).
 *
 *  This can also be used to compute the address a contract will be
 *  deployed to by a contract, by using the contract's address as the
 *  ``to`` and the contract's nonce.
 *
 *  @example
 *    from = "0x8ba1f109551bD432803012645Ac136ddd64DBA72";
 *    nonce = 5;
 *
 *    getCreateAddress({ from, nonce });
 *    //_result:
 */
function getCreateAddress(tx) {
    const from = index.getAddress(tx.from);
    const nonce = maths.getBigInt(tx.nonce, "tx.nonce");
    let nonceHex = nonce.toString(16);
    if (nonceHex === "0") {
        nonceHex = "0x";
    }
    else if (nonceHex.length % 2) {
        nonceHex = "0x0" + nonceHex;
    }
    else {
        nonceHex = "0x" + nonceHex;
    }
    return index.getAddress(from);
}
/**
 *  Returns the address that would result from a ``CREATE2`` operation
 *  with the given %%from%%, %%salt%% and %%initCodeHash%%.

 *  For a quick overview and example of ``CREATE2``, see [[link-ricmoo-wisps]].
 *
 *  @example
 *    // The address of the contract
 *    from = "0x8ba1f109551bD432803012645Ac136ddd64DBA72"
 *
 *    // The salt
 *    salt = id("HelloWorld")
 *
 *    getCreate2Address(from, salt, initCodeHash)
 *    //_result:
 */
function getCreate2Address(from, salt, initCodeHash) {
    if (data.hexDataLength(salt) !== 32) {
        logger.throwArgumentError("salt must be 32 bytes", "salt", salt);
    }
    if (data.hexDataLength(initCodeHash) !== 32) {
        logger.throwArgumentError("initCodeHash must be 32 bytes", "initCodeHash", initCodeHash);
    }
    const val = data.hexDataSlice(sha3.sha256(data.concat(["0xff", index.getAddress(from), salt, initCodeHash])), 12);
    console.log({ "contract-address/74=>should be string": val });
    const prefix = from.substring(2, 4);
    const checksum = index.calculateCheckSum(val, prefix);
    return "0x" + prefix + checksum + address.removeHexPrefix(val);
}

exports.getCreate2Address = getCreate2Address;
exports.getCreateAddress = getCreateAddress;
//# sourceMappingURL=contract-address.js.map
