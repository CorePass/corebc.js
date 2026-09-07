import { getAddress } from "../address/index.js";
import { sha256, Signature, SigningKey } from "../crypto/index.js";
import {
	getBytes,
	getBigInt,
	getNumber,
	hexlify,
	assert,
	assertArgument,
} from "../utils/index.js";

import { recoverAddress } from "./address.js";

import type { BigNumberish, BytesLike } from "../utils/index.js";
import type { SignatureLike } from "../crypto/index.js";
import { checkProperties } from "../utils/properties.js";
import { arrayify, DataOptions, stripZeros } from "../utils/data.js";
import { Logger } from "../logger/logger.js";
import * as RLP from "../crypto/rlp.js";
import { BigNumber } from "../bigNumber/bigNumber.js";
import { networkIdToPrefix } from "../address/index.js";

const logger = new Logger("transaction/0.0.1");

const BN_0 = BigInt(0);
export interface TransactionLike<A = string> {
	/**
	 *  The recipient address or ``null`` for an ``init`` transaction.
	 */
	to?: null | A;

	/**
	 *  The sender.
	 */
	from?: null | A;

	/**
	 *  The nonce.
	 */
	nonce?: null | number;

	/**
	 *  The maximum amount of energy that can be used.
	 */
	energyLimit?: null | BigNumberish;

	/**
	 *  The energy price for legacy and berlin transactions.
	 */
	energyPrice?: null | BigNumberish;

	/**
	 *  The data.
	 */
	data?: null | string;

	/**
	 *  The value (in ore) to send.
	 */
	value?: null | BigNumberish;

	/**
	 *  The chain ID the transaction is valid on.
	 */
	networkId?: null | BigNumberish;

	/**
	 *  The transaction hash.
	 */
	hash?: null | string;

	/**
	 *  The signature provided by the sender.
	 */
	signature?: null | SignatureLike;
}

function handleAddress(value: string): null | string {
	if (value === "0x") {
		return null;
	}
	return getAddress(value);
}

function parse(data: BytesLike): TransactionLike {
	const handleNumber = (value: string): BigNumber => {
		// @ts-ignore
		if (value === "0x") {
			return BigNumber.from(0);
		}
		return BigNumber.from(value);
	};

	const transaction = RLP.decode(data);

	if (transaction.length !== 7 && transaction.length !== 8) {
		logger.throwArgumentError("invalid raw transaction", "data", data);
	}

	const isSigned = transaction.length === 8;
	const tx: TransactionLike = {
		nonce: Number(handleNumber(transaction[0])),
		energyPrice: handleNumber(transaction[1]).toBigInt(),
		energyLimit: handleNumber(transaction[2]).toBigInt(),
		networkId: handleNumber(transaction[isSigned ? 3 : 6]).toBigInt(),
		to: handleAddress(transaction[isSigned ? 4 : 3]),
		value: handleNumber(transaction[isSigned ? 5 : 4]).toBigInt(),
		data: transaction[isSigned ? 6 : 5],
	};

	if (transaction.length === 8) {
		const prefix = networkIdToPrefix(Number(tx.networkId));
		const digest = sha256(serialize(tx));
		tx.hash = sha256(serialize(tx, transaction[7]));
		tx.from = recoverAddress(digest, transaction[7], prefix);
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

const allowedTransactionKeys: { [key: string]: boolean } = {
	networkId: true,
	data: true,
	energyLimit: true,
	energyPrice: true,
	nonce: true,
	to: true,
	value: true,
};

function serialize(transaction: TransactionLike, signature?: string): string {
	checkProperties(transaction, allowedTransactionKeys);

	const raw: Array<string | Uint8Array> = [];

	(!!signature ? transactionFields : unsignedTransactionFields).forEach(
		function ({ numeric, maxLength, name, length }) {
			let value = (<any>transaction)[name] || [];
			const options: DataOptions = {};
			if (numeric) {
				options.hexPad = "left";
			}
			const tmpHexlified = hexlify(value, options);
			value = arrayify(tmpHexlified);
			// Fixed-width field
			if (length && value.length !== length && value.length > 0) {
				logger.throwArgumentError(
					"invalid length for " + name,
					"transaction:" + name,
					value,
				);
			}

			// Variable-width (with a maximum)
			if (maxLength) {
				value = stripZeros(value);
				if (value.length > maxLength) {
					logger.throwArgumentError(
						"invalid length for " + name,
						"transaction:" + name,
						value,
					);
				}
			}

			const hexlified = hexlify(value);
			raw.push(hexlified);
		},
	);

	if (!!signature) {
		raw.push(hexlify(signature));
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
export class Transaction implements TransactionLike<string> {
	#to: null | string;
	#data: string;
	#nonce: number;
	#energyLimit: bigint;
	#energyPrice: null | bigint;
	#value: bigint;
	#networkId: bigint;
	#sig: null | string;

	/**
	 *  The ``to`` address for the transaction or ``null`` if the
	 *  transaction is an ``init`` transaction.
	 */
	get to(): null | string {
		return this.#to;
	}
	set to(value: null | string) {
		this.#to = value == null ? null : getAddress(value);
	}

	/**
	 *  The transaction nonce.
	 */
	get nonce(): number {
		return this.#nonce;
	}
	set nonce(value: BigNumberish) {
		this.#nonce = getNumber(value, "value");
	}

	/**
	 *  The energy limit.
	 */
	get energyLimit(): bigint {
		return this.#energyLimit;
	}
	set energyLimit(value: BigNumberish) {
		this.#energyLimit = getBigInt(value);
	}

	/**
	 *  The energy price.
	 *
	 *  On legacy networks this defines the fee that will be paid. On
	 *  EIP-1559 networks, this should be ``null``.
	 */
	get energyPrice(): null | bigint {
		const value = this.#energyPrice;
		if (value == null) {
			return BN_0;
		}
		return value;
	}
	set energyPrice(value: null | BigNumberish) {
		this.#energyPrice = value == null ? null : getBigInt(value, "energyPrice");
	}

	/**
	 *  The transaction data. For ``init`` transactions this is the
	 *  deployment code.
	 */
	get data(): string {
		return this.#data;
	}
	set data(value: BytesLike) {
		this.#data = hexlify(value);
	}

	/**
	 *  The amount of xcb (in ore) to send in this transactions.
	 */
	get value(): bigint {
		return this.#value;
	}
	set value(value: BigNumberish) {
		this.#value = getBigInt(value, "value");
	}

	/**
	 *  The chain ID this transaction is valid on.
	 */
	get networkId(): bigint {
		return this.#networkId;
	}
	set networkId(value: BigNumberish) {
		this.#networkId = getBigInt(value);
	}

	/**
	 *  If signed, the signature for this transaction.
	 */
	get signature(): null | string {
		return this.#sig || null;
	}
	set signature(value: null | SignatureLike) {
		this.#sig = value == null ? null : value;
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
	get hash(): null | string {
		if (this.signature == null) {
			return null;
		}
		return sha256(this.serialized);
	}

	/**
	 *  The pre-image hash of this transaction.
	 *
	 *  This is the digest that a [[Signer]] must sign to authorize
	 *  this transaction.
	 */
	get unsignedHash(): string {
		return sha256(this.unsignedSerialized);
	}

	/**
	 *  The sending address, if signed. Otherwise, ``null``.
	 */
	get from(): null | string {
		if (this.signature == null) {
			return null;
		}
		const prefix = networkIdToPrefix(Number(this.#networkId));
		return recoverAddress(this.unsignedHash, this.signature, prefix);
	}

	/**
	 *  The public key of the sender, if signed. Otherwise, ``null``.
	 */
	get fromPublicKey(): null | string {
		if (this.signature == null) {
			return null;
		}
		return SigningKey.recoverPublicKey(this.unsignedHash, this.signature);
	}

	/**
	 *  Returns true if signed.
	 *
	 *  This provides a Type Guard that properties requiring a signed
	 *  transaction are non-null.
	 */
	isSigned(): this is Transaction & {
		type: number;
		typeName: string;
		from: string;
		signature: Signature;
	} {
		//isSigned(): this is SignedTransaction {
		return this.signature != null;
	}

	/**
	 *  The serialized transaction.
	 *
	 *  This throws if the transaction is unsigned. For the pre-image,
	 *  use [[unsignedSerialized]].
	 */
	get serialized(): string {
		assert(
			this.signature != null,
			"cannot serialize unsigned transaction; maybe you meant .unsignedSerialized",
			"UNSUPPORTED_OPERATION",
			{ operation: ".serialized" },
		);
		return serialize(this, this.signature);
	}

	/**
	 *  The transaction pre-image.
	 *
	 *  The hash of this is the digest which needs to be signed to
	 *  authorize this transaction.
	 */
	get unsignedSerialized(): string {
		return serialize(this);
	}

	/**
	 *  Create a copy of this transaciton.
	 */
	clone(): Transaction {
		return Transaction.from(this);
	}

	/**
	 *  Return a JSON-friendly object.
	 */
	toJSON(): any {
		const s = (v: null | bigint) => {
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
	static from(tx?: string | TransactionLike<string>): Transaction {
		if (tx == null) {
			return new Transaction();
		}

		if (typeof tx === "string") {
			const payload = getBytes(tx);
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
			assertArgument(
				result.isSigned(),
				"unsigned transaction cannot define hash",
				"tx",
				tx,
			);
			assertArgument(result.hash === tx.hash, "hash mismatch", "tx", tx);
		}

		if (tx.from != null) {
			assertArgument(
				result.isSigned(),
				"unsigned transaction cannot define from",
				"tx",
				tx,
			);
			assertArgument(
				result.from.toLowerCase() === (tx.from || "").toLowerCase(),
				"from mismatch",
				"tx",
				tx,
			);
		}
		return result;
	}
}
