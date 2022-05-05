"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCreate2Address = exports.getContractAddress = exports.publicToAddress = exports.networkIdToPrefix = exports.extractPrefix = exports.isAddress = exports.getAddress = void 0;
var sha3_1 = require("@ethersproject/sha3");
var bytes_1 = require("@ethersproject/bytes");
var bignumber_1 = require("@ethersproject/bignumber");
var rlp_1 = require("@ethersproject/rlp");
var logger_1 = require("@ethersproject/logger");
var _version_1 = require("./_version");
var logger = new logger_1.Logger(_version_1.version);
var precompiledAddresses = [
    "0000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000001",
    "0000000000000000000000000000000000000000000000000000000000000002",
    "0000000000000000000000000000000000000000000000000000000000000003",
    "0000000000000000000000000000000000000000000000000000000000000004",
    "0000000000000000000000000000000000000000000000000000000000000005",
    "0000000000000000000000000000000000000000000000000000000000000006",
    "0000000000000000000000000000000000000000000000000000000000000007",
    "0000000000000000000000000000000000000000000000000000000000000008",
    "0000000000000000000000000000000000000000000000000000000000000009",
];
function removeHexPrefix(val) {
    return val.substring(0, 2) === "0x" ? val.substring(2) : val;
}
function getChecksumAddress(val, prefix) {
    var mods = (removeHexPrefix(val) + removeHexPrefix(prefix) + "00")
        .replace(/[aA]/g, "10")
        .replace(/[bB]/g, "11")
        .replace(/[cC]/g, "12")
        .replace(/[dD]/g, "13")
        .replace(/[eE]/g, "14")
        .replace(/[fF]/g, "15");
    var checksum = bignumber_1.BigNumber.from(98).sub(bignumber_1.BigNumber.from(mods).mod(97)).toString();
    if (checksum.length == 1) {
        checksum = "0" + checksum;
    }
    return checksum;
}
function getAddress(address) {
    if (typeof (address) !== "string") {
        logger.throwArgumentError("invalid address", "address", address);
    }
    if (!address.match(/^(0x)?[0-9a-fA-F]{44}$/)) {
        logger.throwArgumentError("invalid address", "address", address);
    }
    var raw = removeHexPrefix(address);
    if (precompiledAddresses.includes(raw)) {
        return "0x" + raw;
    }
    var prefix = raw.substring(0, 2);
    var val = raw.substring(4);
    var checksum = getChecksumAddress(val, prefix);
    if (checksum !== raw.substring(2, 4)) {
        logger.throwArgumentError("bad address checksum", "address", address);
    }
    return "0x" + prefix + checksum + val;
}
exports.getAddress = getAddress;
function isAddress(address) {
    try {
        getAddress(address);
        return true;
    }
    catch (error) { }
    return false;
}
exports.isAddress = isAddress;
function extractPrefix(address) {
    address = getAddress(address);
    return address.substring(2, 4);
}
exports.extractPrefix = extractPrefix;
function networkIdToPrefix(networkId) {
    if (networkId == 1) {
        return "cb";
    }
    else if (networkId == 3 || networkId == 4) {
        return "ab";
    }
    else if (networkId > 10 || networkId == 0) {
        return "ce";
    }
    else {
        logger.throwArgumentError("bad networkId", "networkId", networkId);
        return "";
    }
}
exports.networkIdToPrefix = networkIdToPrefix;
function publicToAddress(key, prefix) {
    var val = (0, bytes_1.hexDataSlice)((0, sha3_1.sha256)(key), 12);
    var checksum = getChecksumAddress(val, prefix);
    return "0x" + prefix + checksum + removeHexPrefix(val);
}
exports.publicToAddress = publicToAddress;
;
function getContractAddress(transaction) {
    var from = null;
    try {
        from = getAddress(transaction.from);
    }
    catch (error) {
        logger.throwArgumentError("missing from address", "transaction", transaction);
    }
    var nonce = (0, bytes_1.stripZeros)((0, bytes_1.arrayify)(bignumber_1.BigNumber.from(transaction.nonce).toHexString()));
    var val = (0, bytes_1.hexDataSlice)((0, sha3_1.sha256)((0, rlp_1.encode)([from, nonce])), 12);
    var prefix = from.substring(2, 4);
    var checksum = getChecksumAddress(val, prefix);
    return "0x" + prefix + checksum + removeHexPrefix(val);
}
exports.getContractAddress = getContractAddress;
function getCreate2Address(from, salt, initCodeHash) {
    if ((0, bytes_1.hexDataLength)(salt) !== 32) {
        logger.throwArgumentError("salt must be 32 bytes", "salt", salt);
    }
    if ((0, bytes_1.hexDataLength)(initCodeHash) !== 32) {
        logger.throwArgumentError("initCodeHash must be 32 bytes", "initCodeHash", initCodeHash);
    }
    var val = (0, bytes_1.hexDataSlice)((0, sha3_1.sha256)((0, bytes_1.concat)(["0xff", getAddress(from), salt, initCodeHash])), 12);
    var prefix = from.substring(2, 4);
    var checksum = getChecksumAddress(val, prefix);
    return "0x" + prefix + checksum + removeHexPrefix(val);
}
exports.getCreate2Address = getCreate2Address;
//# sourceMappingURL=index.js.map