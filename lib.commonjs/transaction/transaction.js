"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
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
exports.Transaction = void 0;
const index_js_1 = require("../address/index.js");
const index_js_2 = require("../crypto/index.js");
const index_js_3 = require("../utils/index.js");
const address_js_1 = require("./address.js");
const properties_js_1 = require("../utils/properties.js");
const data_js_1 = require("../utils/data.js");
const logger_js_1 = require("../logger/logger.js");
const RLP = __importStar(require("../crypto/rlp.js"));
const bigNumber_js_1 = require("../bigNumber/bigNumber.js");
const index_js_4 = require("../address/index.js");
const numbers_js_1 = require("../constants/numbers.js");
const logger = new logger_js_1.Logger('transaction/0.0.1');
const BN_0 = BigInt(0);
function handleAddress(value) {
    if (value === "0x") {
        return null;
    }
    return (0, index_js_1.getAddress)(value);
}
function parse(data) {
    const handleNumber = (value) => {
        // @ts-ignore
        if (value === "0x") {
            return numbers_js_1.Zero;
        }
        return bigNumber_js_1.BigNumber.from(value);
    };
    const transaction = RLP.decode(data);
    if (transaction.length !== 7 && transaction.length !== 8) {
        logger.throwArgumentError("invalid raw transaction", "data", data);
    }
    const isSigned = transaction.length === 8;
    const tx = {
        nonce: Number(handleNumber(transaction[0])),
        energyPrice: handleNumber(transaction[1]).toBigInt(),
        energyLimit: handleNumber(transaction[2]).toBigInt(),
        networkId: handleNumber(transaction[isSigned ? 3 : 6]).toBigInt(),
        to: handleAddress(transaction[isSigned ? 4 : 3]),
        value: handleNumber(transaction[isSigned ? 5 : 4]).toBigInt(),
        data: transaction[isSigned ? 6 : 5],
    };
    if (transaction.length === 8) {
        const prefix = (0, index_js_4.networkIdToPrefix)(Number(tx.networkId));
        const digest = (0, index_js_2.sha256)(serialize(tx));
        tx.hash = (0, index_js_2.sha256)(serialize(tx, transaction[7]));
        tx.from = (0, address_js_1.recoverAddress)(digest, transaction[7], prefix);
        tx.signature = transaction[7];
    }
    return tx;
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
function serialize(transaction, signature) {
    (0, properties_js_1.checkProperties)(transaction, allowedTransactionKeys);
    const raw = [];
    (!!signature ? transactionFields : unsignedTransactionFields).forEach(function ({ numeric, maxLength, name, length }) {
        let value = transaction[name] || ([]);
        const options = {};
        if (numeric) {
            options.hexPad = "left";
        }
        const tmpHexlified = (0, index_js_3.hexlify)(value, options);
        value = (0, data_js_1.arrayify)(tmpHexlified);
        // Fixed-width field
        if (length && value.length !== length && value.length > 0) {
            logger.throwArgumentError("invalid length for " + name, ("transaction:" + name), value);
        }
        // Variable-width (with a maximum)
        if (maxLength) {
            value = (0, data_js_1.stripZeros)(value);
            if (value.length > maxLength) {
                logger.throwArgumentError("invalid length for " + name, ("transaction:" + name), value);
            }
        }
        const hexlified = (0, index_js_3.hexlify)(value);
        raw.push(hexlified);
    });
    if (!!signature) {
        raw.push((0, index_js_3.hexlify)(signature));
    }
    const finalValue = RLP.encode(raw);
    return finalValue;
}
/**
 *  A **Transaction** describes an operation to be executed on
 *  Core by an Externally Owned Account (EOA). It includes
 *  who (the [[to]] address), what (the [[data]]) and how much (the
 *  [[value]] in corebc) the operation should entail.
 *
 *  @example:
 *    tx = new Transaction()
 *    //_result:
 *
 *    tx.data = "0x1234";
 *    //_result:
 */
class Transaction {
    #to;
    #data;
    #nonce;
    #energyLimit;
    #energyPrice;
    #value;
    #networkId;
    #sig;
    /**
     *  The ``to`` address for the transaction or ``null`` if the
     *  transaction is an ``init`` transaction.
     */
    get to() { return this.#to; }
    set to(value) {
        this.#to = (value == null) ? null : (0, index_js_1.getAddress)(value);
    }
    /**
     *  The transaction nonce.
     */
    get nonce() { return this.#nonce; }
    set nonce(value) { this.#nonce = (0, index_js_3.getNumber)(value, "value"); }
    /**
     *  The energy limit.
     */
    get energyLimit() { return this.#energyLimit; }
    set energyLimit(value) { this.#energyLimit = (0, index_js_3.getBigInt)(value); }
    /**
     *  The energy price.
     *
     *  On legacy networks this defines the fee that will be paid. On
     *  EIP-1559 networks, this should be ``null``.
     */
    get energyPrice() {
        const value = this.#energyPrice;
        if (value == null) {
            return BN_0;
        }
        return value;
    }
    set energyPrice(value) {
        this.#energyPrice = (value == null) ? null : (0, index_js_3.getBigInt)(value, "energyPrice");
    }
    /**
     *  The transaction data. For ``init`` transactions this is the
     *  deployment code.
     */
    get data() { return this.#data; }
    set data(value) { this.#data = (0, index_js_3.hexlify)(value); }
    /**
     *  The amount of xcb (in ore) to send in this transactions.
     */
    get value() { return this.#value; }
    set value(value) {
        this.#value = (0, index_js_3.getBigInt)(value, "value");
    }
    /**
     *  The chain ID this transaction is valid on.
     */
    get networkId() { return this.#networkId; }
    set networkId(value) { this.#networkId = (0, index_js_3.getBigInt)(value); }
    /**
     *  If signed, the signature for this transaction.
     */
    get signature() { return this.#sig || null; }
    set signature(value) {
        this.#sig = (value == null) ? null : value;
    }
    /**
     *  Creates a new Transaction with default values.
     */
    constructor() {
        this.#to = null;
        this.#nonce = 0;
        this.#energyLimit = BigInt(0);
        this.#energyPrice = null;
        this.#data = "0x";
        this.#value = BigInt(0);
        this.#networkId = BigInt(0);
        this.#sig = null;
    }
    /**
     *  The transaction hash, if signed. Otherwise, ``null``.
     */
    get hash() {
        if (this.signature == null) {
            return null;
        }
        return (0, index_js_2.sha256)(this.serialized);
    }
    /**
     *  The pre-image hash of this transaction.
     *
     *  This is the digest that a [[Signer]] must sign to authorize
     *  this transaction.
     */
    get unsignedHash() {
        return (0, index_js_2.sha256)(this.unsignedSerialized);
    }
    /**
     *  The sending address, if signed. Otherwise, ``null``.
     */
    get from() {
        if (this.signature == null) {
            return null;
        }
        const prefix = (0, index_js_4.networkIdToPrefix)(Number(this.#networkId));
        return (0, address_js_1.recoverAddress)(this.unsignedHash, this.signature, prefix);
    }
    /**
     *  The public key of the sender, if signed. Otherwise, ``null``.
     */
    get fromPublicKey() {
        if (this.signature == null) {
            return null;
        }
        return index_js_2.SigningKey.recoverPublicKey(this.unsignedHash, this.signature);
    }
    /**
     *  Returns true if signed.
     *
     *  This provides a Type Guard that properties requiring a signed
     *  transaction are non-null.
     */
    isSigned() {
        //isSigned(): this is SignedTransaction {
        return this.signature != null;
    }
    /**
     *  The serialized transaction.
     *
     *  This throws if the transaction is unsigned. For the pre-image,
     *  use [[unsignedSerialized]].
     */
    get serialized() {
        (0, index_js_3.assert)(this.signature != null, "cannot serialize unsigned transaction; maybe you meant .unsignedSerialized", "UNSUPPORTED_OPERATION", { operation: ".serialized" });
        return serialize(this, this.signature);
    }
    /**
     *  The transaction pre-image.
     *
     *  The hash of this is the digest which needs to be signed to
     *  authorize this transaction.
     */
    get unsignedSerialized() {
        return serialize(this);
    }
    /**
     *  Create a copy of this transaciton.
     */
    clone() {
        return Transaction.from(this);
    }
    /**
     *  Return a JSON-friendly object.
     */
    toJSON() {
        const s = (v) => {
            if (v == null) {
                return null;
            }
            return v.toString();
        };
        return {
            to: this.to,
            data: this.data,
            nonce: this.nonce,
            energyLimit: s(this.energyLimit),
            energyPrice: s(this.energyPrice),
            value: s(this.value),
            networkId: s(this.networkId),
            sig: this.signature ? this.signature : null,
        };
    }
    /**
     *  Create a **Transaction** from a serialized transaction or a
     *  Transaction-like object.
     */
    static from(tx) {
        if (tx == null) {
            return new Transaction();
        }
        if (typeof (tx) === "string") {
            const payload = (0, index_js_3.getBytes)(tx);
            return Transaction.from(parse(payload));
        }
        const result = new Transaction();
        if (tx.to != null) {
            result.to = tx.to;
        }
        if (tx.nonce != null) {
            result.nonce = tx.nonce;
        }
        if (tx.energyLimit != null) {
            result.energyLimit = tx.energyLimit;
        }
        if (tx.energyPrice != null) {
            result.energyPrice = tx.energyPrice;
        }
        if (tx.data != null) {
            result.data = tx.data;
        }
        if (tx.value != null) {
            result.value = tx.value;
        }
        if (tx.networkId != null) {
            result.networkId = tx.networkId;
        }
        if (tx.signature != null) {
            result.signature = tx.signature;
        }
        if (tx.hash != null) {
            (0, index_js_3.assertArgument)(result.isSigned(), "unsigned transaction cannot define hash", "tx", tx);
            (0, index_js_3.assertArgument)(result.hash === tx.hash, "hash mismatch", "tx", tx);
        }
        if (tx.from != null) {
            (0, index_js_3.assertArgument)(result.isSigned(), "unsigned transaction cannot define from", "tx", tx);
            (0, index_js_3.assertArgument)(result.from.toLowerCase() === (tx.from || "").toLowerCase(), "from mismatch", "tx", tx);
        }
        return result;
    }
}
exports.Transaction = Transaction;
//# sourceMappingURL=transaction.js.map