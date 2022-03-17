"use strict";
import { arrayify, concat, hexDataLength, hexDataSlice, stripZeros } from "@ethersproject/bytes";
import { BigNumber } from "@ethersproject/bignumber";
import { keccak256 } from "@ethersproject/keccak256";
import { encode } from "@ethersproject/rlp";
import { Logger } from "@ethersproject/logger";
import { version } from "./_version";
const logger = new Logger(version);
const precompiledAddresses = [
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
function getChecksumAddress(val, prefix) {
    const mods = (val + prefix + "00")
        .replace(/[aA]/g, "10")
        .replace(/[bB]/g, "11")
        .replace(/[cC]/g, "12")
        .replace(/[dD]/g, "13")
        .replace(/[eE]/g, "14")
        .replace(/[fF]/g, "15");
    let checksum = BigNumber.from(98).sub(BigNumber.from(mods).mod(97)).toString();
    if (checksum.length == 1) {
        checksum = "0" + checksum;
    }
    return checksum;
}
export function getAddress(address) {
    if (typeof (address) !== "string") {
        logger.throwArgumentError("invalid address", "address", address);
    }
    if (!address.match(/^(0x)?[0-9a-fA-F]{44}$/)) {
        logger.throwArgumentError("invalid address", "address", address);
    }
    const raw = address.substring(0, 2) === "0x" ? address.substring(2) : address;
    if (precompiledAddresses.includes(raw)) {
        return "0x" + raw;
    }
    const prefix = raw.substring(0, 2);
    const val = raw.substring(4);
    const checksum = getChecksumAddress(val, prefix);
    if (checksum !== raw.substring(2, 4)) {
        logger.throwArgumentError("bad address checksum", "address", address);
    }
    return "0x" + prefix + checksum + val;
}
export function isAddress(address) {
    try {
        getAddress(address);
        return true;
    }
    catch (error) { }
    return false;
}
export function getContractAddress(transaction) {
    let from = null;
    try {
        from = getAddress(transaction.from);
    }
    catch (error) {
        logger.throwArgumentError("missing from address", "transaction", transaction);
    }
    const nonce = stripZeros(arrayify(BigNumber.from(transaction.nonce).toHexString()));
    const val = hexDataSlice(keccak256(encode([from, nonce])), 12);
    const prefix = from.substring(2, 4);
    const checksum = getChecksumAddress(val, prefix);
    return "0x" + prefix + checksum + val;
}
export function getCreate2Address(from, salt, initCodeHash) {
    if (hexDataLength(salt) !== 32) {
        logger.throwArgumentError("salt must be 32 bytes", "salt", salt);
    }
    if (hexDataLength(initCodeHash) !== 32) {
        logger.throwArgumentError("initCodeHash must be 32 bytes", "initCodeHash", initCodeHash);
    }
    const val = hexDataSlice(keccak256(concat(["0xff", getAddress(from), salt, initCodeHash])), 12);
    const prefix = from.substring(2, 4);
    const checksum = getChecksumAddress(val, prefix);
    return "0x" + prefix + checksum + val;
}
//# sourceMappingURL=index.js.map