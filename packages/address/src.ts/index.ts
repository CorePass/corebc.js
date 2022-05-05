"use strict";

import { sha256 } from "@ethersproject/sha3";
import { arrayify, BytesLike, concat, hexDataLength, hexDataSlice, stripZeros } from "@ethersproject/bytes";
import { BigNumber, BigNumberish, _base16To36, _base36To16 } from "@ethersproject/bignumber";
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
]

function removeHexPrefix(val: string): string {
    return val.substring(0, 2) === "0x" ? val.substring(2) : val;
}

function getChecksumAddress(val: string, prefix: string): string {
    const mods = (removeHexPrefix(val) + removeHexPrefix(prefix) + "00")
        .replace(/[aA]/g, "10")
        .replace(/[bB]/g, "11")
        .replace(/[cC]/g, "12")
        .replace(/[dD]/g, "13")
        .replace(/[eE]/g, "14")
        .replace(/[fF]/g, "15");
    
    let checksum = BigNumber.from(98).sub(BigNumber.from(mods).mod(97)).toString();
    if (checksum.length == 1) {
        checksum = "0" + checksum
    }
    return checksum
}

export function getAddress(address: string): string {
    if (typeof(address) !== "string") {
        logger.throwArgumentError("invalid address", "address", address);
    }
    if (!address.match(/^(0x)?[0-9a-fA-F]{44}$/)) {
        logger.throwArgumentError("invalid address", "address", address);
    }

    const raw = removeHexPrefix(address);
    if (precompiledAddresses.includes(raw)) {
        return "0x" + raw
    }

    const prefix = raw.substring(0,2)
    const val = raw.substring(4)
    const checksum = getChecksumAddress(val, prefix);
    if (checksum !== raw.substring(2, 4)) {
        logger.throwArgumentError("bad address checksum", "address", address);
    }
    return "0x" + prefix + checksum + val;
}

export function isAddress(address: string): boolean {
    try {
        getAddress(address);
        return true;
    } catch (error) { }
    return false;
}

export function extractPrefix(address: string): string {
    address = getAddress(address);
    return address.substring(2, 4);
}

export function networkIdToPrefix(networkId: number): string {
    if (networkId == 1) {
        return "cb";
    } else if (networkId == 3 || networkId == 4) {
        return "ab";
    } else if (networkId > 10 || networkId == 0) {
        return "ce";
    } else {
        logger.throwArgumentError("bad networkId", "networkId", networkId);
        return "";
    }
}

export function publicToAddress(key: BytesLike | string, prefix: string): string {
    const val = hexDataSlice(sha256(key), 12)
    const checksum = getChecksumAddress(val, prefix);
    return "0x" + prefix + checksum + removeHexPrefix(val);
};

export function getContractAddress(transaction: { from: string, nonce: BigNumberish }) {
    let from: string = null;
    try {
        from = getAddress(transaction.from);
    } catch (error) {
        logger.throwArgumentError("missing from address", "transaction", transaction);
    }

    const nonce = stripZeros(arrayify(BigNumber.from(transaction.nonce).toHexString()));
    const val = hexDataSlice(sha256(encode([ from, nonce ])), 12);
    const prefix = from.substring(2, 4)
    const checksum = getChecksumAddress(val, prefix)
    return "0x" + prefix + checksum + removeHexPrefix(val);
}

export function getCreate2Address(from: string, salt: BytesLike, initCodeHash: BytesLike): string {
    if (hexDataLength(salt) !== 32) {
        logger.throwArgumentError("salt must be 32 bytes", "salt", salt);
    }
    if (hexDataLength(initCodeHash) !== 32) {
        logger.throwArgumentError("initCodeHash must be 32 bytes", "initCodeHash", initCodeHash);
    }

    const val = hexDataSlice(sha256(concat([ "0xff", getAddress(from), salt, initCodeHash ])), 12);
    const prefix = from.substring(2, 4)
    const checksum = getChecksumAddress(val, prefix)
    return "0x" + prefix + checksum + removeHexPrefix(val);
}
