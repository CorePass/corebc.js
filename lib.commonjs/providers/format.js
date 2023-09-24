"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTransactionResponse = exports.formatTransactionReceipt = exports.formatReceiptLog = exports.formatBlock = exports.formatLog = exports.formatUint256 = exports.formatHash = exports.formatData = exports.formatBoolean = exports.object = exports.arrayOf = exports.allowNull = void 0;
/**
 *  @_ignore
 */
const index_js_1 = require("../address/index.js");
const index_js_2 = require("../transaction/index.js");
const index_js_3 = require("../utils/index.js");
const BN_0 = BigInt(0);
function allowNull(format, nullValue) {
    return function (value) {
        if (value == null) {
            return nullValue;
        }
        return format(value);
    };
}
exports.allowNull = allowNull;
function arrayOf(format) {
    return (array) => {
        if (!Array.isArray(array)) {
            throw new Error("not an array");
        }
        return array.map((i) => format(i));
    };
}
exports.arrayOf = arrayOf;
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
                (0, index_js_3.assert)(false, `invalid value for value.${key} (${message})`, "BAD_DATA", { value });
            }
        }
        return result;
    };
}
exports.object = object;
function formatBoolean(value) {
    switch (value) {
        case true:
        case "true":
            return true;
        case false:
        case "false":
            return false;
    }
    (0, index_js_3.assertArgument)(false, `invalid boolean; ${JSON.stringify(value)}`, "value", value);
}
exports.formatBoolean = formatBoolean;
function formatData(value) {
    (0, index_js_3.assertArgument)((0, index_js_3.isHexString)(value, true), "invalid data", "value", value);
    return value;
}
exports.formatData = formatData;
function formatHash(value) {
    (0, index_js_3.assertArgument)((0, index_js_3.isHexString)(value, 32), "invalid hash", "value", value);
    return value;
}
exports.formatHash = formatHash;
function formatUint256(value) {
    if (!(0, index_js_3.isHexString)(value)) {
        throw new Error("invalid uint256");
    }
    return (0, index_js_3.zeroPadValue)(value, 32);
}
exports.formatUint256 = formatUint256;
const _formatLog = object({
    address: index_js_1.getAddress,
    blockHash: formatHash,
    blockNumber: index_js_3.getNumber,
    data: formatData,
    index: index_js_3.getNumber,
    removed: allowNull(formatBoolean, false),
    topics: arrayOf(formatHash),
    transactionHash: formatHash,
    transactionIndex: index_js_3.getNumber,
}, {
    index: ["logIndex"],
});
function formatLog(value) {
    return _formatLog(value);
}
exports.formatLog = formatLog;
const _formatBlock = object({
    hash: allowNull(formatHash),
    parentHash: formatHash,
    number: index_js_3.getNumber,
    timestamp: index_js_3.getNumber,
    nonce: allowNull(formatData),
    difficulty: index_js_3.getBigInt,
    energyLimit: index_js_3.getBigInt,
    energyUsed: index_js_3.getBigInt,
    miner: allowNull(index_js_1.getAddress),
    extraData: formatData,
    baseFeePerEnergy: allowNull(index_js_3.getBigInt),
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
exports.formatBlock = formatBlock;
const _formatReceiptLog = object({
    transactionIndex: index_js_3.getNumber,
    blockNumber: index_js_3.getNumber,
    transactionHash: formatHash,
    address: index_js_1.getAddress,
    topics: arrayOf(formatHash),
    data: formatData,
    index: index_js_3.getNumber,
    blockHash: formatHash,
}, {
    index: ["logIndex"],
});
function formatReceiptLog(value) {
    return _formatReceiptLog(value);
}
exports.formatReceiptLog = formatReceiptLog;
const _formatTransactionReceipt = object({
    to: allowNull(index_js_1.getAddress, null),
    from: allowNull(index_js_1.getAddress, null),
    contractAddress: allowNull(index_js_1.getAddress, null),
    // should be allowNull(hash), but broken-EIP-658 support is handled in receipt
    index: index_js_3.getNumber,
    root: allowNull(index_js_3.hexlify),
    energyUsed: index_js_3.getBigInt,
    logsBloom: allowNull(formatData),
    blockHash: formatHash,
    hash: formatHash,
    logs: arrayOf(formatReceiptLog),
    blockNumber: index_js_3.getNumber,
    //confirmations: allowNull(getNumber, null),
    cumulativeEnergyUsed: index_js_3.getBigInt,
    effectiveEnergyPrice: allowNull(index_js_3.getBigInt),
    status: allowNull(index_js_3.getNumber),
    type: allowNull(index_js_3.getNumber, 0),
}, {
    effectiveEnergyPrice: ["energyPrice"],
    hash: ["transactionHash"],
    index: ["transactionIndex"],
});
function formatTransactionReceipt(value) {
    return _formatTransactionReceipt(value);
}
exports.formatTransactionReceipt = formatTransactionReceipt;
function formatTransactionResponse(value) {
    // Some clients (TestRPC) do strange things like return 0x0 for the
    // 0 address; correct this to be a real address
    if (value.to && !(0, index_js_1.getAddress)(value.to) && (0, index_js_3.getBigInt)(value.to) === BN_0) {
        value.to = "0x0000000000000000000000000000000000000000";
    }
    const result = object({
        hash: formatHash,
        type: (value) => {
            if (value === "0x" || value == null) {
                return 0;
            }
            return (0, index_js_3.getNumber)(value);
        },
        accessList: allowNull(index_js_2.accessListify, null),
        blockHash: allowNull(formatHash, null),
        blockNumber: allowNull(index_js_3.getNumber, null),
        transactionIndex: allowNull(index_js_3.getNumber, null),
        //confirmations: allowNull(getNumber, null),
        from: index_js_1.getAddress,
        maxFeePerEnergy: allowNull(index_js_3.getBigInt),
        energyLimit: index_js_3.getBigInt,
        to: allowNull(index_js_1.getAddress, null),
        value: index_js_3.getBigInt,
        nonce: index_js_3.getNumber,
        data: formatData,
        creates: allowNull(index_js_1.getAddress, null),
        networkId: allowNull(index_js_3.getBigInt, null),
    }, {
        data: ["input"],
        energyLimit: ["energy"],
    })(value);
    // If to and creates are empty, populate the creates from the value
    if (result.to == null && result.creates == null) {
        result.creates = (0, index_js_1.getCreateAddress)(result);
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
    if (result.blockHash && (0, index_js_3.getBigInt)(result.blockHash) === BN_0) {
        result.blockHash = null;
    }
    return result;
}
exports.formatTransactionResponse = formatTransactionResponse;
//# sourceMappingURL=format.js.map