"use strict";

import { getAddress, networkIdToPrefix, publicToAddress } from "@ethersproject/address";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { arrayify, BytesLike, DataOptions, hexlify, stripZeros } from "@ethersproject/bytes";
import { Zero } from "@ethersproject/constants";
import { checkProperties } from "@ethersproject/properties";
import * as RLP from "@ethersproject/rlp";
import { sha256 } from "@ethersproject/sha3";
import { computePublicKey, recoverPublicKey } from "@ethersproject/signing-key";

import { Logger } from "@ethersproject/logger";
import { version } from "./_version";
const logger = new Logger(version);

///////////////////////////////
// Exported Types

export type UnsignedTransaction = {
    to?: string;
    nonce?: number;
    networkId?: number;

    energyLimit?: BigNumberish;
    energyPrice?: BigNumberish;

    data?: BytesLike;
    value?: BigNumberish;
}

export interface Transaction {
    hash?: string;

    to?: string;
    from?: string;
    nonce: number;
    networkId: number;

    energyLimit: BigNumber;
    energyPrice?: BigNumber;

    data: string;
    value: BigNumber;

    signature?: string;
}

///////////////////////////////

function handleAddress(value: string): string {
    if (value === "0x") { return null; }
    return getAddress(value);
}

function handleNumber(value: string): BigNumber {
    if (value === "0x") { return Zero; }
    return BigNumber.from(value);
}

const transactionFields = [
    { name: "nonce",    maxLength: 32, numeric: true },
    { name: "energyPrice", maxLength: 32, numeric: true },
    { name: "energyLimit", maxLength: 32, numeric: true },
    { name: "networkId", maxLength: 32, numeric: true },
    { name: "to", length: 22 },
    { name: "value", maxLength: 32, numeric: true },
    { name: "data" },
];

const allowedTransactionKeys: { [ key: string ]: boolean } = {
    networkId: true, data: true, energyLimit: true, energyPrice:true, nonce: true, to: true, value: true
}

export function computeAddress(key: BytesLike | string, prefix: string): string {
    const publicKey = computePublicKey(key);
    return publicToAddress(publicKey, prefix);
}

export function recoverAddress(digest: BytesLike, signature: string, prefix: string): string {
    const publicKey = recoverPublicKey(arrayify(digest), signature);
    return publicToAddress(publicKey, prefix);
}

export function serialize(transaction: UnsignedTransaction, signature?: string): string {
    checkProperties(transaction, allowedTransactionKeys);

    const raw: Array<string | Uint8Array> = [];

    transactionFields.forEach(function(fieldInfo) {
        let value = (<any>transaction)[fieldInfo.name] || ([]);
        const options: DataOptions = { };
        if (fieldInfo.numeric) { options.hexPad = "left"; }
        value = arrayify(hexlify(value, options));

        // Fixed-width field
        if (fieldInfo.length && value.length !== fieldInfo.length && value.length > 0) {
            logger.throwArgumentError("invalid length for " + fieldInfo.name, ("transaction:" + fieldInfo.name), value);
        }

        // Variable-width (with a maximum)
        if (fieldInfo.maxLength) {
            value = stripZeros(value);
            if (value.length > fieldInfo.maxLength) {
                logger.throwArgumentError("invalid length for " + fieldInfo.name, ("transaction:" + fieldInfo.name), value );
            }
        }

        raw.push(hexlify(value));
    });

    if (!!signature) {
        raw.push(hexlify(signature));
    }

    return RLP.encode(raw);
}

export function parse(rawTransaction: BytesLike): Transaction {
    const transaction = RLP.decode(rawTransaction);

    if (transaction.length !== 7 && transaction.length !== 8) {
        logger.throwArgumentError("invalid raw transaction", "rawTransaction", rawTransaction);
    }

    const tx: Transaction = {
        nonce:    handleNumber(transaction[0]).toNumber(),
        energyPrice: handleNumber(transaction[1]),
        energyLimit: handleNumber(transaction[2]),
        networkId: handleNumber(transaction[3]).toNumber(),
        to:       handleAddress(transaction[4]),
        value:    handleNumber(transaction[5]),
        data:     transaction[6],
    };
    tx.hash = sha256(RLP.encode(transaction.slice(0, 7)));

    if (transaction.length === 8) {
        tx.signature = transaction[7];
        const prefix = networkIdToPrefix(tx.networkId)
        tx.from = recoverAddress(tx.hash, tx.signature, prefix);
    }

    return tx;

}
