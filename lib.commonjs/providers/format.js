'use strict';

var index = require('../address/index.js');
var contractAddress = require('../address/contract-address.js');
var accesslist = require('../transaction/accesslist.js');
require('../crypto/hmac.js');
require('../crypto/ripemd160.js');
require('../crypto/pbkdf2.js');
require('../crypto/random.js');
require('../crypto/scrypt.js');
require('../crypto/sha3.js');
require('bcrypto/lib/ed448.js');
require('buffer');
require('bcrypto/lib/pbkdf2.js');
require('bcrypto/lib/sha3-512.js');
require('crypto');
require('../crypto/keccak.js');
require('../utils/base58.js');
var data = require('../utils/data.js');
var errors = require('../utils/errors.js');
require('../logger/logger.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
var maths = require('../utils/maths.js');
require('../crypto/signature.js');
require('../transaction/transaction.js');

/**
 *  @_ignore
 */
const BN_0 = BigInt(0);
function allowNull(format, nullValue) {
    return function (value) {
        if (value == null) {
            return nullValue;
        }
        return format(value);
    };
}
function arrayOf(format) {
    return (array) => {
        if (!Array.isArray(array)) {
            throw new Error("not an array");
        }
        return array.map((i) => format(i));
    };
}
// Requires an object which matches a fleet of other formatters
// Any FormatFunc may return `undefined` to have the value omitted
// from the result object. Calls preserve `this`.
function object(format, altNames) {
    return (value) => {
        const result = {};
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
                if (nv !== undefined) {
                    result[key] = nv;
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "not-an-error";
                errors.assert(false, `invalid value for value.${key} (${message})`, "BAD_DATA", { value });
            }
        }
        return result;
    };
}
function formatBoolean(value) {
    switch (value) {
        case true:
        case "true":
            return true;
        case false:
        case "false":
            return false;
    }
    errors.assertArgument(false, `invalid boolean; ${JSON.stringify(value)}`, "value", value);
}
function formatData(value) {
    errors.assertArgument(data.isHexString(value, true), "invalid data", "value", value);
    return value;
}
function formatHash(value) {
    errors.assertArgument(data.isHexString(value, 32), "invalid hash", "value", value);
    return value;
}
function formatUint256(value) {
    if (!data.isHexString(value)) {
        throw new Error("invalid uint256");
    }
    return data.zeroPadValue(value, 32);
}
const _formatLog = object({
    address: index.getAddress,
    blockHash: formatHash,
    blockNumber: maths.getNumber,
    data: formatData,
    index: maths.getNumber,
    removed: allowNull(formatBoolean, false),
    topics: arrayOf(formatHash),
    transactionHash: formatHash,
    transactionIndex: maths.getNumber,
}, {
    index: ["logIndex"],
});
function formatLog(value) {
    return _formatLog(value);
}
const _formatBlock = object({
    hash: allowNull(formatHash),
    parentHash: formatHash,
    number: maths.getNumber,
    timestamp: maths.getNumber,
    nonce: allowNull(formatData),
    difficulty: maths.getBigInt,
    energyLimit: maths.getBigInt,
    energyUsed: maths.getBigInt,
    miner: allowNull(index.getAddress),
    extraData: formatData,
    baseFeePerEnergy: allowNull(maths.getBigInt),
});
function formatBlock(value) {
    const result = _formatBlock(value);
    result.transactions = value.transactions.map((tx) => {
        if (typeof tx === "string") {
            return tx;
        }
        return formatTransactionResponse(tx);
    });
    return result;
}
const _formatReceiptLog = object({
    transactionIndex: maths.getNumber,
    blockNumber: maths.getNumber,
    transactionHash: formatHash,
    address: index.getAddress,
    topics: arrayOf(formatHash),
    data: formatData,
    index: maths.getNumber,
    blockHash: formatHash,
}, {
    index: ["logIndex"],
});
function formatReceiptLog(value) {
    return _formatReceiptLog(value);
}
const _formatTransactionReceipt = object({
    to: allowNull(index.getAddress, null),
    from: allowNull(index.getAddress, null),
    contractAddress: allowNull(index.getAddress, null),
    // should be allowNull(hash), but broken-EIP-658 support is handled in receipt
    index: maths.getNumber,
    root: allowNull(data.hexlify),
    energyUsed: maths.getBigInt,
    logsBloom: allowNull(formatData),
    blockHash: formatHash,
    hash: formatHash,
    logs: arrayOf(formatReceiptLog),
    blockNumber: maths.getNumber,
    //confirmations: allowNull(getNumber, null),
    cumulativeEnergyUsed: maths.getBigInt,
    effectiveEnergyPrice: allowNull(maths.getBigInt),
    status: allowNull(maths.getNumber),
    type: allowNull(maths.getNumber, 0),
}, {
    effectiveEnergyPrice: ["energyPrice"],
    hash: ["transactionHash"],
    index: ["transactionIndex"],
});
function formatTransactionReceipt(value) {
    return _formatTransactionReceipt(value);
}
function formatTransactionResponse(value) {
    // Some clients (TestRPC) do strange things like return 0x0 for the
    // 0 address; correct this to be a real address
    if (value.to && !index.getAddress(value.to) && maths.getBigInt(value.to) === BN_0) {
        value.to = "0x0000000000000000000000000000000000000000";
    }
    const result = object({
        hash: formatHash,
        type: (value) => {
            if (value === "0x" || value == null) {
                return 0;
            }
            return maths.getNumber(value);
        },
        accessList: allowNull(accesslist.accessListify, null),
        blockHash: allowNull(formatHash, null),
        blockNumber: allowNull(maths.getNumber, null),
        transactionIndex: allowNull(maths.getNumber, null),
        //confirmations: allowNull(getNumber, null),
        from: index.getAddress,
        maxFeePerEnergy: allowNull(maths.getBigInt),
        energyLimit: maths.getBigInt,
        to: allowNull(index.getAddress, null),
        value: maths.getBigInt,
        nonce: maths.getNumber,
        data: formatData,
        creates: allowNull(index.getAddress, null),
        networkId: allowNull(maths.getBigInt, null),
    }, {
        data: ["input"],
        energyLimit: ["energy"],
    })(value);
    // If to and creates are empty, populate the creates from the value
    if (result.to == null && result.creates == null) {
        result.creates = contractAddress.getCreateAddress(result);
    }
    // Compute the signature
    if (value.signature) {
        result.signature = value.signature;
    }
    else {
        result.signature = value;
    }
    // Some backends omit networkId on legacy transactions, but we can compute it
    if (result.networkId == null) {
        const networkId = result.signature.legacynetworkId;
        if (networkId != null) {
            result.networkId = networkId;
        }
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
    if (result.blockHash && maths.getBigInt(result.blockHash) === BN_0) {
        result.blockHash = null;
    }
    return result;
}

exports.allowNull = allowNull;
exports.arrayOf = arrayOf;
exports.formatBlock = formatBlock;
exports.formatBoolean = formatBoolean;
exports.formatData = formatData;
exports.formatHash = formatHash;
exports.formatLog = formatLog;
exports.formatReceiptLog = formatReceiptLog;
exports.formatTransactionReceipt = formatTransactionReceipt;
exports.formatTransactionResponse = formatTransactionResponse;
exports.formatUint256 = formatUint256;
exports.object = object;
//# sourceMappingURL=format.js.map
