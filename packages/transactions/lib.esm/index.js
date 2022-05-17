"use strict";
import { getAddress, networkIdToPrefix, publicToAddress } from "@corepass/corebc-address";
import { BigNumber } from "@corepass/corebc-bignumber";
import { arrayify, hexlify, stripZeros } from "@corepass/corebc-bytes";
import { Zero } from "@corepass/corebc-constants";
import { checkProperties } from "@corepass/corebc-properties";
import * as RLP from "@corepass/corebc-rlp";
import { sha256 } from "@corepass/corebc-sha3";
import { computePublicKey, recoverPublicKey } from "@corepass/corebc-signing-key";
import { Logger } from "@corepass/corebc-logger";
import { version } from "./_version";
const logger = new Logger(version);
///////////////////////////////
function handleAddress(value) {
    if (value === "0x") {
        return null;
    }
    return getAddress(value);
}
function handleNumber(value) {
    if (value === "0x") {
        return Zero;
    }
    return BigNumber.from(value);
}
const unsignedTransactionFields = [
    { name: "nonce", maxLength: 32, numeric: true },
    { name: "energyPrice", maxLength: 32, numeric: true },
    { name: "energyLimit", maxLength: 32, numeric: true },
    { name: "to", length: 22 },
    { name: "value", maxLength: 32, numeric: true },
    { name: "data" },
    { name: "networkId", maxLength: 32, numeric: true },
];
const transactionFields = [
    { name: "nonce", maxLength: 32, numeric: true },
    { name: "energyPrice", maxLength: 32, numeric: true },
    { name: "energyLimit", maxLength: 32, numeric: true },
    { name: "networkId", maxLength: 32, numeric: true },
    { name: "to", length: 22 },
    { name: "value", maxLength: 32, numeric: true },
    { name: "data" },
];
const allowedTransactionKeys = {
    networkId: true, data: true, energyLimit: true, energyPrice: true, nonce: true, to: true, value: true
};
export function computeAddress(key, prefix) {
    const publicKey = computePublicKey(key);
    return publicToAddress(publicKey, prefix);
}
export function recoverAddress(digest, signature, prefix) {
    const publicKey = recoverPublicKey(arrayify(digest), signature);
    return publicToAddress(publicKey, prefix);
}
export function serialize(transaction, signature) {
    checkProperties(transaction, allowedTransactionKeys);
    const raw = [];
    (!!signature ? transactionFields : unsignedTransactionFields).forEach(function (fieldInfo) {
        let value = transaction[fieldInfo.name] || ([]);
        const options = {};
        if (fieldInfo.numeric) {
            options.hexPad = "left";
        }
        value = arrayify(hexlify(value, options));
        // Fixed-width field
        if (fieldInfo.length && value.length !== fieldInfo.length && value.length > 0) {
            logger.throwArgumentError("invalid length for " + fieldInfo.name, ("transaction:" + fieldInfo.name), value);
        }
        // Variable-width (with a maximum)
        if (fieldInfo.maxLength) {
            value = stripZeros(value);
            if (value.length > fieldInfo.maxLength) {
                logger.throwArgumentError("invalid length for " + fieldInfo.name, ("transaction:" + fieldInfo.name), value);
            }
        }
        raw.push(hexlify(value));
    });
    if (!!signature) {
        raw.push(hexlify(signature));
    }
    return RLP.encode(raw);
}
export function parse(rawTransaction) {
    const transaction = RLP.decode(rawTransaction);
    if (transaction.length !== 7 && transaction.length !== 8) {
        logger.throwArgumentError("invalid raw transaction", "rawTransaction", rawTransaction);
    }
    const isSigned = transaction.length === 8;
    const tx = {
        nonce: handleNumber(transaction[0]).toNumber(),
        energyPrice: handleNumber(transaction[1]),
        energyLimit: handleNumber(transaction[2]),
        networkId: handleNumber(transaction[isSigned ? 3 : 6]).toNumber(),
        to: handleAddress(transaction[isSigned ? 4 : 3]),
        value: handleNumber(transaction[isSigned ? 5 : 4]),
        data: transaction[isSigned ? 6 : 5],
    };
    if (transaction.length === 8) {
        const prefix = networkIdToPrefix(tx.networkId);
        const digest = sha256(serialize(tx));
        tx.hash = sha256(serialize(tx, transaction[7]));
        tx.from = recoverAddress(digest, transaction[7], prefix);
        tx.signature = transaction[7];
    }
    return tx;
}
//# sourceMappingURL=index.js.map