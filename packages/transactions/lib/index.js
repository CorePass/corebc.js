"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parse = exports.serialize = exports.recoverAddress = exports.computeAddress = void 0;
var corebc_address_1 = require("@corepass/corebc-address");
var corebc_bignumber_1 = require("@corepass/corebc-bignumber");
var corebc_bytes_1 = require("@corepass/corebc-bytes");
var corebc_constants_1 = require("@corepass/corebc-constants");
var corebc_properties_1 = require("@corepass/corebc-properties");
var RLP = __importStar(require("@corepass/corebc-rlp"));
var corebc_sha3_1 = require("@corepass/corebc-sha3");
var corebc_signing_key_1 = require("@corepass/corebc-signing-key");
var corebc_logger_1 = require("@corepass/corebc-logger");
var _version_1 = require("./_version");
var logger = new corebc_logger_1.Logger(_version_1.version);
///////////////////////////////
function handleAddress(value) {
    if (value === "0x") {
        return null;
    }
    return (0, corebc_address_1.getAddress)(value);
}
function handleNumber(value) {
    if (value === "0x") {
        return corebc_constants_1.Zero;
    }
    return corebc_bignumber_1.BigNumber.from(value);
}
var unsignedTransactionFields = [
    { name: "nonce", maxLength: 32, numeric: true },
    { name: "energyPrice", maxLength: 32, numeric: true },
    { name: "energyLimit", maxLength: 32, numeric: true },
    { name: "to", length: 22 },
    { name: "value", maxLength: 32, numeric: true },
    { name: "data" },
    { name: "networkId", maxLength: 32, numeric: true },
];
var transactionFields = [
    { name: "nonce", maxLength: 32, numeric: true },
    { name: "energyPrice", maxLength: 32, numeric: true },
    { name: "energyLimit", maxLength: 32, numeric: true },
    { name: "networkId", maxLength: 32, numeric: true },
    { name: "to", length: 22 },
    { name: "value", maxLength: 32, numeric: true },
    { name: "data" },
];
var allowedTransactionKeys = {
    networkId: true, data: true, energyLimit: true, energyPrice: true, nonce: true, to: true, value: true
};
function computeAddress(key, prefix) {
    var publicKey = (0, corebc_signing_key_1.computePublicKey)(key);
    return (0, corebc_address_1.publicToAddress)(publicKey, prefix);
}
exports.computeAddress = computeAddress;
function recoverAddress(digest, signature, prefix) {
    var publicKey = (0, corebc_signing_key_1.recoverPublicKey)((0, corebc_bytes_1.arrayify)(digest), signature);
    return (0, corebc_address_1.publicToAddress)(publicKey, prefix);
}
exports.recoverAddress = recoverAddress;
function serialize(transaction, signature) {
    (0, corebc_properties_1.checkProperties)(transaction, allowedTransactionKeys);
    var raw = [];
    (!!signature ? transactionFields : unsignedTransactionFields).forEach(function (fieldInfo) {
        var value = transaction[fieldInfo.name] || ([]);
        var options = {};
        if (fieldInfo.numeric) {
            options.hexPad = "left";
        }
        value = (0, corebc_bytes_1.arrayify)((0, corebc_bytes_1.hexlify)(value, options));
        // Fixed-width field
        if (fieldInfo.length && value.length !== fieldInfo.length && value.length > 0) {
            logger.throwArgumentError("invalid length for " + fieldInfo.name, ("transaction:" + fieldInfo.name), value);
        }
        // Variable-width (with a maximum)
        if (fieldInfo.maxLength) {
            value = (0, corebc_bytes_1.stripZeros)(value);
            if (value.length > fieldInfo.maxLength) {
                logger.throwArgumentError("invalid length for " + fieldInfo.name, ("transaction:" + fieldInfo.name), value);
            }
        }
        raw.push((0, corebc_bytes_1.hexlify)(value));
    });
    if (!!signature) {
        raw.push((0, corebc_bytes_1.hexlify)(signature));
    }
    return RLP.encode(raw);
}
exports.serialize = serialize;
function parse(rawTransaction) {
    var transaction = RLP.decode(rawTransaction);
    if (transaction.length !== 7 && transaction.length !== 8) {
        logger.throwArgumentError("invalid raw transaction", "rawTransaction", rawTransaction);
    }
    var isSigned = transaction.length === 8;
    var tx = {
        nonce: handleNumber(transaction[0]).toNumber(),
        energyPrice: handleNumber(transaction[1]),
        energyLimit: handleNumber(transaction[2]),
        networkId: handleNumber(transaction[isSigned ? 3 : 6]).toNumber(),
        to: handleAddress(transaction[isSigned ? 4 : 3]),
        value: handleNumber(transaction[isSigned ? 5 : 4]),
        data: transaction[isSigned ? 6 : 5],
    };
    if (transaction.length === 8) {
        var prefix = (0, corebc_address_1.networkIdToPrefix)(tx.networkId);
        var digest = (0, corebc_sha3_1.sha256)(serialize(tx));
        tx.hash = (0, corebc_sha3_1.sha256)(serialize(tx, transaction[7]));
        tx.from = recoverAddress(digest, transaction[7], prefix);
        tx.signature = transaction[7];
    }
    return tx;
}
exports.parse = parse;
//# sourceMappingURL=index.js.map