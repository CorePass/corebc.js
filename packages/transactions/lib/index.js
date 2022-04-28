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
var address_1 = require("@ethersproject/address");
var bignumber_1 = require("@ethersproject/bignumber");
var bytes_1 = require("@ethersproject/bytes");
var constants_1 = require("@ethersproject/constants");
var properties_1 = require("@ethersproject/properties");
var RLP = __importStar(require("@ethersproject/rlp"));
var sha3_1 = require("@ethersproject/sha3");
var signing_key_1 = require("@ethersproject/signing-key");
var logger_1 = require("@ethersproject/logger");
var _version_1 = require("./_version");
var logger = new logger_1.Logger(_version_1.version);
///////////////////////////////
function handleAddress(value) {
    if (value === "0x") {
        return null;
    }
    return (0, address_1.getAddress)(value);
}
function handleNumber(value) {
    if (value === "0x") {
        return constants_1.Zero;
    }
    return bignumber_1.BigNumber.from(value);
}
var transactionFields = [
    { name: "nonce", maxLength: 32, numeric: true },
    { name: "energyPrice", maxLength: 32, numeric: true },
    { name: "energyLimit", maxLength: 32, numeric: true },
    { name: "networkId", maxLength: 32, numeric: true },
    { name: "to", length: 20 },
    { name: "value", maxLength: 32, numeric: true },
    { name: "data" },
];
var allowedTransactionKeys = {
    networkId: true, data: true, energyLimit: true, energyPrice: true, nonce: true, to: true, value: true
};
function computeAddress(key, prefix) {
    var publicKey = (0, signing_key_1.computePublicKey)(key);
    return (0, address_1.publicToAddress)(publicKey, prefix);
}
exports.computeAddress = computeAddress;
function recoverAddress(digest, signature, prefix) {
    var publicKey = (0, signing_key_1.recoverPublicKey)((0, bytes_1.arrayify)(digest), signature);
    return (0, address_1.publicToAddress)(publicKey, prefix);
}
exports.recoverAddress = recoverAddress;
function serialize(transaction, signature) {
    (0, properties_1.checkProperties)(transaction, allowedTransactionKeys);
    var raw = [];
    transactionFields.forEach(function (fieldInfo) {
        var value = transaction[fieldInfo.name] || ([]);
        var options = {};
        if (fieldInfo.numeric) {
            options.hexPad = "left";
        }
        value = (0, bytes_1.arrayify)((0, bytes_1.hexlify)(value, options));
        // Fixed-width field
        if (fieldInfo.length && value.length !== fieldInfo.length && value.length > 0) {
            logger.throwArgumentError("invalid length for " + fieldInfo.name, ("transaction:" + fieldInfo.name), value);
        }
        // Variable-width (with a maximum)
        if (fieldInfo.maxLength) {
            value = (0, bytes_1.stripZeros)(value);
            if (value.length > fieldInfo.maxLength) {
                logger.throwArgumentError("invalid length for " + fieldInfo.name, ("transaction:" + fieldInfo.name), value);
            }
        }
        raw.push((0, bytes_1.hexlify)(value));
    });
    if (!!signature) {
        raw.push((0, bytes_1.hexlify)(signature));
    }
    return RLP.encode(raw);
}
exports.serialize = serialize;
function parse(rawTransaction) {
    var transaction = RLP.decode(rawTransaction);
    if (transaction.length !== 7 && transaction.length !== 8) {
        logger.throwArgumentError("invalid raw transaction", "rawTransaction", rawTransaction);
    }
    var tx = {
        nonce: handleNumber(transaction[0]).toNumber(),
        energyPrice: handleNumber(transaction[1]),
        energyLimit: handleNumber(transaction[2]),
        networkId: handleNumber(transaction[4]).toNumber(),
        to: handleAddress(transaction[5]),
        value: handleNumber(transaction[6]),
        data: transaction[7],
    };
    tx.hash = (0, sha3_1.sha256)(RLP.encode(transaction.slice(0, 8)));
    if (transaction.length === 8) {
        tx.signature = transaction[9];
        var prefix = (0, address_1.networkIdToPrefix)(tx.networkId);
        tx.from = recoverAddress(tx.hash, tx.signature, prefix);
    }
    return tx;
}
exports.parse = parse;
//# sourceMappingURL=index.js.map