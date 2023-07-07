"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCreate2Address = exports.getCreateAddress = void 0;
const index_js_1 = require("../utils/index.js");
const index_js_2 = require("./index.js");
const index_js_3 = require("../index.js");
const data_js_1 = require("../utils/data.js");
const logger_js_1 = require("../logger/logger.js");
const address_js_1 = require("../transaction/address.js");
const index_js_4 = require("./index.js");
const logger = new logger_js_1.Logger('contract-address/0.0.1');
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
    const from = (0, index_js_2.getAddress)(tx.from);
    const nonce = (0, index_js_1.getBigInt)(tx.nonce, "tx.nonce");
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
    return (0, index_js_2.getAddress)(from);
}
exports.getCreateAddress = getCreateAddress;
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
    if ((0, data_js_1.hexDataLength)(salt) !== 32) {
        logger.throwArgumentError("salt must be 32 bytes", "salt", salt);
    }
    if ((0, data_js_1.hexDataLength)(initCodeHash) !== 32) {
        logger.throwArgumentError("initCodeHash must be 32 bytes", "initCodeHash", initCodeHash);
    }
    const val = (0, data_js_1.hexDataSlice)((0, index_js_3.sha256)((0, index_js_1.concat)(["0xff", (0, index_js_2.getAddress)(from), salt, initCodeHash])), 12);
    console.log({ 'contract-address/74=>should be string': val });
    const prefix = from.substring(2, 4);
    const checksum = (0, index_js_4.calculateCheckSum)(val, prefix);
    return "0x" + prefix + checksum + (0, address_js_1.removeHexPrefix)(val);
}
exports.getCreate2Address = getCreate2Address;
//# sourceMappingURL=contract-address.js.map