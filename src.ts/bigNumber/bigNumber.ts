"use strict";

/**
 *  BigNumber
 *
 *  An immutable signed integer, stored as a hex string. Arithmetic runs on
 *  native bigint; up to 1.1.x it ran on BN.js, and the results, including
 *  BN.js's handling of out-of-range two's complement and its errors, are
 *  kept the same.
 *
 */

import { Logger } from "../logger/logger.js";
import {
	Bytes,
	Hexable,
	isBytes,
	hexlify,
	isHexString,
} from "../utils/data.js";

const logger = new Logger("bigNumber/0.0.1");

const _constructorGuard = {};

const MAX_SAFE = 0x1fffffffffffff;
const MAX_NUMBER = BigInt(2) ** BigInt(53);
const ZERO = BigInt(0);
const ONE = BigInt(1);

export type BigNumberish = BigNumber | Bytes | bigint | string | number;

export function isBigNumberish(value: any): value is BigNumberish {
	return (
		value != null &&
		(BigNumber.isBigNumber(value) ||
			(typeof value === "number" && value % 1 === 0) ||
			(typeof value === "string" && !!value.match(/^-?[0-9]+$/)) ||
			isHexString(value) ||
			typeof value === "bigint" ||
			isBytes(value))
	);
}

// Only warn about passing 10 into radix once
let _warnedToStringRadix = false;

export class BigNumber implements Hexable {
	readonly _hex: string;
	readonly _isBigNumber: boolean;

	constructor(constructorGuard: any, hex: string) {
		logger.checkNew(new.target, BigNumber);

		if (constructorGuard !== _constructorGuard) {
			logger.throwError(
				"cannot call constructor directly; use BigNumber.from",
				Logger.errors.UNSUPPORTED_OPERATION,
				{
					operation: "new (BigNumber)",
				},
			);
		}

		this._hex = hex;
		this._isBigNumber = true;

		Object.freeze(this);
	}

	fromTwos(value: number): BigNumber {
		const bit = value - 1;
		assertBits(bit);
		const v = toBI(this);
		if (((v < 0 ? -v : v) >> BigInt(bit)) & ONE) {
			assertBits(value);
			const m = ~(v < 0 ? -v : v) & mask(value);
			return toBigNumber(v < 0 ? m - ONE : -(m + ONE));
		}
		return this;
	}

	toTwos(value: number): BigNumber {
		const v = toBI(this);
		if (v < 0) {
			assertBits(value);
			return toBigNumber((~-v & mask(value)) + ONE);
		}
		return this;
	}

	abs(): BigNumber {
		if (this._hex[0] === "-") {
			return BigNumber.from(this._hex.substring(1));
		}
		return this;
	}

	add(other: BigNumberish): BigNumber {
		return toBigNumber(toBI(this) + toBI(other));
	}

	sub(other: BigNumberish): BigNumber {
		return toBigNumber(toBI(this) - toBI(other));
	}

	div(other: BigNumberish): BigNumber {
		const o = BigNumber.from(other);
		if (o.isZero()) {
			throwFault("division by zero", "div");
		}
		return toBigNumber(toBI(this) / o.toBigInt());
	}

	mul(other: BigNumberish): BigNumber {
		return toBigNumber(toBI(this) * toBI(other));
	}

	mod(other: BigNumberish): BigNumber {
		const value = toBI(other);
		if (value < 0) {
			throwFault("cannot modulo negative values", "mod");
		}
		// BN.js's error, kept for callers that match on it.
		if (value === ZERO) throw new Error("Assertion failed");
		const r = toBI(this) % value;
		return toBigNumber(r < 0 ? r + value : r);
	}

	pow(other: BigNumberish): BigNumber {
		const value = toBI(other);
		if (value < 0) {
			throwFault("cannot raise to negative values", "pow");
		}
		return toBigNumber(toBI(this) ** value);
	}

	and(other: BigNumberish): BigNumber {
		const value = toBI(other);
		if (this.isNegative() || value < 0) {
			throwFault("cannot 'and' negative values", "and");
		}
		return toBigNumber(toBI(this) & value);
	}

	or(other: BigNumberish): BigNumber {
		const value = toBI(other);
		if (this.isNegative() || value < 0) {
			throwFault("cannot 'or' negative values", "or");
		}
		return toBigNumber(toBI(this) | value);
	}

	xor(other: BigNumberish): BigNumber {
		const value = toBI(other);
		if (this.isNegative() || value < 0) {
			throwFault("cannot 'xor' negative values", "xor");
		}
		return toBigNumber(toBI(this) ^ value);
	}

	mask(value: number): BigNumber {
		if (this.isNegative() || value < 0) {
			throwFault("cannot mask negative values", "mask");
		}
		assertBits(value);
		const v = toBI(this);
		return v >> BigInt(value) === ZERO ? this : toBigNumber(v & mask(value));
	}

	shl(value: number): BigNumber {
		if (this.isNegative() || value < 0) {
			throwFault("cannot shift negative values", "shl");
		}
		assertBits(value);
		return toBigNumber(toBI(this) << BigInt(value));
	}

	shr(value: number): BigNumber {
		if (this.isNegative() || value < 0) {
			throwFault("cannot shift negative values", "shr");
		}
		assertBits(value);
		return toBigNumber(toBI(this) >> BigInt(value));
	}

	eq(other: BigNumberish): boolean {
		return toBI(this) === toBI(other);
	}

	lt(other: BigNumberish): boolean {
		return toBI(this) < toBI(other);
	}

	lte(other: BigNumberish): boolean {
		return toBI(this) <= toBI(other);
	}

	gt(other: BigNumberish): boolean {
		return toBI(this) > toBI(other);
	}

	gte(other: BigNumberish): boolean {
		return toBI(this) >= toBI(other);
	}

	isNegative(): boolean {
		return this._hex[0] === "-";
	}

	isZero(): boolean {
		return this._hex === "0x00";
	}

	toNumber(): number {
		const value = toBI(this);
		if (value >= MAX_NUMBER || value <= -MAX_NUMBER) {
			throwFault("overflow", "toNumber", this.toString());
		}
		return Number(value);
	}

	toBigInt(): bigint {
		return toBI(this);
	}

	toString(): string {
		// Lots of people expect this, which we do not support, so check (See: #889)
		if (arguments.length > 0) {
			if (arguments[0] === 10) {
				if (!_warnedToStringRadix) {
					_warnedToStringRadix = true;
					logger.warn(
						"BigNumber.toString does not accept any parameters; base-10 is assumed",
					);
				}
			} else if (arguments[0] === 16) {
				logger.throwError(
					"BigNumber.toString does not accept any parameters; use bigNumber.toHexString()",
					Logger.errors.UNEXPECTED_ARGUMENT,
					{},
				);
			} else {
				logger.throwError(
					"BigNumber.toString does not accept parameters",
					Logger.errors.UNEXPECTED_ARGUMENT,
					{},
				);
			}
		}
		return toBI(this).toString(10);
	}

	toHexString(): string {
		return this._hex;
	}

	toJSON(key?: string): any {
		return { type: "BigNumber", hex: this.toHexString() };
	}

	static from(value: any): BigNumber {
		if (value instanceof BigNumber) {
			return value;
		}

		if (typeof value === "string") {
			if (value.match(/^-?0x[0-9a-f]+$/i)) {
				return new BigNumber(_constructorGuard, toHex(value));
			}

			if (value.match(/^-?[0-9]+$/)) {
				return new BigNumber(_constructorGuard, toHex(BigInt(value)));
			}

			return logger.throwArgumentError(
				"invalid BigNumber string",
				"value",
				value,
			);
		}

		if (typeof value === "number") {
			if (value % 1) {
				throwFault("underflow", "BigNumber.from", value);
			}

			// Inclusive bounds: MAX_SAFE is Number.MAX_SAFE_INTEGER itself,
			// which is exactly representable and which hexlify and getNumber
			// both accept. Excluding it here refused the boundary value.
			if (value > MAX_SAFE || value < -MAX_SAFE) {
				throwFault("overflow", "BigNumber.from", value);
			}

			return BigNumber.from(String(value));
		}

		const anyValue = <any>value;

		if (typeof anyValue === "bigint") {
			return BigNumber.from(anyValue.toString());
		}

		if (isBytes(anyValue)) {
			return BigNumber.from(hexlify(anyValue));
		}

		if (anyValue) {
			// Hexable interface (takes priority)
			if (anyValue.toHexString) {
				const hex = anyValue.toHexString();
				if (typeof hex === "string") {
					return BigNumber.from(hex);
				}
			} else {
				// For now, handle legacy JSON-ified values (goes away in v6)
				let hex = anyValue._hex;

				// New-form JSON
				if (hex == null && anyValue.type === "BigNumber") {
					hex = anyValue.hex;
				}

				if (typeof hex === "string") {
					if (
						isHexString(hex) ||
						(hex[0] === "-" && isHexString(hex.substring(1)))
					) {
						return BigNumber.from(hex);
					}
				}
			}
		}

		return logger.throwArgumentError("invalid BigNumber value", "value", value);
	}

	static isBigNumber(value: any): value is BigNumber {
		return !!(value && value._isBigNumber);
	}
}

// Normalize the hex string
function toHex(value: string | bigint): string {
	if (typeof value !== "string") {
		return toHex(value.toString(16));
	}

	// If negative, prepend the negative sign to the normalized positive value
	if (value[0] === "-") {
		// Strip off the negative sign
		value = value.substring(1);

		// Cannot have multiple negative signs (e.g. "--0x04")
		if (value[0] === "-") {
			logger.throwArgumentError("invalid hex", "value", value);
		}

		// Call toHex on the positive component
		value = toHex(value);

		// Do not allow "-0x00"
		if (value === "0x00") {
			return value;
		}

		// Negate the value
		return "-" + value;
	}

	// Add a "0x" prefix if missing
	if (value.substring(0, 2).toLowerCase() !== "0x") {
		value = "0x" + value;
	}

	// Normalize the prefix and the digits to lower case.
	value = "0x" + value.substring(2).toLowerCase();

	// Normalize zero
	if (value === "0x") {
		return "0x00";
	}

	// Make the string even length
	if (value.length % 2) {
		value = "0x0" + value.substring(2);
	}

	// Trim to smallest even-length string
	while (value.length > 4 && value.substring(0, 4) === "0x00") {
		value = "0x" + value.substring(4);
	}

	return value;
}
function toBigNumber(value: bigint): BigNumber {
	return new BigNumber(_constructorGuard, toHex(value));
}

function toBI(value: BigNumberish): bigint {
	const hex = BigNumber.from(value).toHexString();
	return hex[0] === "-" ? -BigInt(hex.substring(1)) : BigInt(hex);
}

function mask(bits: number): bigint {
	return (ONE << BigInt(bits)) - ONE;
}

/** Bit counts BN.js accepted: non-negative integers; it threw on the rest. */
function assertBits(bits: number): void {
	if (typeof bits !== "number" || !Number.isInteger(bits) || bits < 0) {
		throw new Error("Assertion failed");
	}
}

function throwFault(fault: string, operation: string, value?: any): never {
	const params: any = { fault: fault, operation: operation };
	if (value != null) {
		params.value = value;
	}

	return logger.throwError(fault, Logger.errors.NUMERIC_FAULT, params);
}

/**
 *  Parses %%value%% in %%base%% (16 or 36) the way BN.js did: whitespace is
 *  ignored, a leading "-" negates, and base 36 also reads ":" to "@" as the
 *  digits 10 to 16.
 */
function parseBase(value: string, base: 16 | 36): bigint {
	const digits = value.replace(/\s+/g, "");
	const negative = digits[0] === "-";
	const big = BigInt(base);
	let result = ZERO;
	for (let i = negative ? 1 : 0; i < digits.length; i++) {
		const c = digits.charCodeAt(i);
		let d: number;
		if (base === 16) {
			d =
				c >= 48 && c <= 57
					? c - 48
					: c >= 65 && c <= 70
						? c - 55
						: c >= 97 && c <= 102
							? c - 87
							: -1;
			if (d < 0) throw new Error("Invalid character in " + digits);
		} else {
			const x = c - 48;
			d = x >= 49 ? x - 39 : x >= 17 ? x - 7 : x;
			if (x < 0 || d >= base) throw new Error("Invalid character");
		}
		result = result * big + BigInt(d);
	}
	return negative ? -result : result;
}

// value should have no prefix
export function _base36To16(value: string): string {
	return parseBase(value, 36).toString(16);
}

// value should have no prefix
export function _base16To36(value: string): string {
	return parseBase(value, 16).toString(36);
}
