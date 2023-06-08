/**
 *  @_ignore
 */
import { getAddress, getCreateAddress } from "../address/index.js";
import { accessListify } from "../transaction/index.js";
import {
    getBigInt, getNumber, hexlify, isHexString, zeroPadValue,
    assert, assertArgument
} from "../utils/index.js";

import type {
    BlockParams, LogParams,
    TransactionReceiptParams, TransactionResponseParams,
} from "./formatting.js";


const BN_0 = BigInt(0);

export type FormatFunc = (value: any) => any;

export function allowNull(format: FormatFunc, nullValue?: any): FormatFunc {
    return (function(value: any) {
        if (value == null) { return nullValue; }
        return format(value);
    });
}

export function arrayOf(format: FormatFunc): FormatFunc {
    return ((array: any) => {
        if (!Array.isArray(array)) { throw new Error("not an array"); }
        return array.map((i) => format(i));
    });
}

// Requires an object which matches a fleet of other formatters
// Any FormatFunc may return `undefined` to have the value omitted
// from the result object. Calls preserve `this`.
export function object(format: Record<string, FormatFunc>, altNames?: Record<string, Array<string>>): FormatFunc {
    return ((value: any) => {
        const result: any = { };
        for (const key in format) {
            let srcKey = key;
            if (altNames && key in altNames && !(srcKey in value)) {
                for (const altKey of altNames[key]) {
                    if (altKey in value) {
                        srcKey = altKey;
                        break;
                    }
                }
            }

            try {
                const nv = format[key](value[srcKey]);
                if (nv !== undefined) { result[key] = nv; }
            } catch (error) {
                const message = (error instanceof Error) ? error.message: "not-an-error";
                assert(false, `invalid value for value.${ key } (${ message })`, "BAD_DATA", { value })
            }
        }
        return result;
    });
}

export function formatBoolean(value: any): boolean {
    switch (value) {
        case true: case "true":
            return true;
        case false: case "false":
            return false;
    }
    assertArgument(false, `invalid boolean; ${ JSON.stringify(value) }`, "value", value);
}

export function formatData(value: string): string {
    assertArgument(isHexString(value, true), "invalid data", "value", value);
    return value;
}

export function formatHash(value: any): string {
    assertArgument(isHexString(value, 32), "invalid hash", "value", value);
    return value;
}

export function formatUint256(value: any): string {
    if (!isHexString(value)) {
        throw new Error("invalid uint256");
    }
    return zeroPadValue(value, 32);
}

const _formatLog = object({
    address: getAddress,
    blockHash: formatHash,
    blockNumber: getNumber,
    data: formatData,
    index: getNumber,
    removed: allowNull(formatBoolean, false),
    topics: arrayOf(formatHash),
    transactionHash: formatHash,
    transactionIndex: getNumber,
}, {
    index: [ "logIndex" ]
});

export function formatLog(value: any): LogParams {
    return _formatLog(value);
}

const _formatBlock = object({
    hash: allowNull(formatHash),
    parentHash: formatHash,
    number: getNumber,

    timestamp: getNumber,
    nonce: allowNull(formatData),
    difficulty: getBigInt,

    energyLimit: getBigInt,
    energyUsed: getBigInt,

    miner: allowNull(getAddress),
    extraData: formatData,

    baseFeePerEnergy: allowNull(getBigInt)
});

export function formatBlock(value: any): BlockParams {
    const result = _formatBlock(value);
    result.transactions = value.transactions.map((tx: string | TransactionResponseParams) => {
        if (typeof(tx) === "string") { return tx; }
        return formatTransactionResponse(tx);
    });
    return result;
}

const _formatReceiptLog = object({
    transactionIndex: getNumber,
    blockNumber: getNumber,
    transactionHash: formatHash,
    address: getAddress,
    topics: arrayOf(formatHash),
    data: formatData,
    index: getNumber,
    blockHash: formatHash,
}, {
    index: [ "logIndex" ]
});

export function formatReceiptLog(value: any): LogParams {
    return _formatReceiptLog(value);
}

const _formatTransactionReceipt = object({
    to: allowNull(getAddress, null),
    from: allowNull(getAddress, null),
    contractAddress: allowNull(getAddress, null),
    // should be allowNull(hash), but broken-EIP-658 support is handled in receipt
    index: getNumber,
    root: allowNull(hexlify),
    energyUsed: getBigInt,
    logsBloom: allowNull(formatData),
    blockHash: formatHash,
    hash: formatHash,
    logs: arrayOf(formatReceiptLog),
    blockNumber: getNumber,
    //confirmations: allowNull(getNumber, null),
    cumulativeEnergyUsed: getBigInt,
    effectiveEnergyPrice: allowNull(getBigInt),
    status: allowNull(getNumber),
    type: allowNull(getNumber, 0)
}, {
    effectiveEnergyPrice: [ "energyPrice" ],
    hash: [ "transactionHash" ],
    index: [ "transactionIndex" ],
});

export function formatTransactionReceipt(value: any): TransactionReceiptParams {
    return _formatTransactionReceipt(value);
}

export function formatTransactionResponse(value: any): TransactionResponseParams {

    // Some clients (TestRPC) do strange things like return 0x0 for the
    // 0 address; correct this to be a real address
    if (value.to && !getAddress(value.to) && getBigInt(value.to) === BN_0) {
        value.to = "0x0000000000000000000000000000000000000000";
    }

    const result = object({
        hash: formatHash,

        type: (value: any) => {
            if (value === "0x" || value == null) { return 0; }
            return getNumber(value);
        },
        accessList: allowNull(accessListify, null),

        blockHash: allowNull(formatHash, null),
        blockNumber: allowNull(getNumber, null),
        transactionIndex: allowNull(getNumber, null),

        //confirmations: allowNull(getNumber, null),

        from: getAddress,

        maxFeePerEnergy: allowNull(getBigInt),

        energyLimit: getBigInt,
        to: allowNull(getAddress, null),
        value: getBigInt,
        nonce: getNumber,
        data: formatData,

        creates: allowNull(getAddress, null),

        networkId: allowNull(getBigInt, null)
    }, {
        data: [ "input" ],
        energyLimit: [ "energy" ]
    })(value);

    // If to and creates are empty, populate the creates from the value
    if (result.to == null && result.creates == null) {
        result.creates = getCreateAddress(result);
    }


    // Compute the signature
    if (value.signature) {
        result.signature = value.signature;
    } else {
        result.signature = value;
    }

    // Some backends omit networkId on legacy transactions, but we can compute it
    if (result.networkId == null) {
        const networkId = result.signature.legacynetworkId;
        if (networkId != null) { result.networkId = networkId; }
    }


    // @TODO: check networkId
    /*
    if (value.networkId != null) {
        let networkId = value.networkId;

        if (isHexString(networkId)) {
            networkId = BigNumber.from(networkId).toNumber();
        }

        result.networkId = networkId;

    } else {
        let networkId = value.networkId;

        // geth-etc returns networkId
        if (networkId == null && result.v == null) {
            networkId = value.networkId;
        }

        if (isHexString(networkId)) {
            networkId = BigNumber.from(networkId).toNumber();
        }

        if (typeof(networkId) !== "number" && result.v != null) {
            networkId = (result.v - 35) / 2;
            if (networkId < 0) { networkId = 0; }
            networkId = parseInt(networkId);
        }

        if (typeof(networkId) !== "number") { networkId = 0; }

        result.networkId = networkId;
    }
    */

    // 0x0000... should actually be null
    if (result.blockHash && getBigInt(result.blockHash) === BN_0) {
        result.blockHash = null;
    }

    return result;
}
