/**
 *  The [Base58 Encoding](link-base58) scheme allows a **numeric** value
 *  to be encoded as a compact string using a radix of 58 using only
 *  alpha-numeric characters. Confusingly similar characters are omitted
 *  (i.e. ``"l0O"``).
 *
 *  Note that Base58 encodes a **numeric** value, not arbitrary bytes,
 *  since any zero-bytes on the left would get removed. To mitigate this
 *  issue most schemes that use Base58 choose specific high-order values
 *  to ensure non-zero prefixes.
 *
 *  @_subsection: api/utils:Base58 Encoding [about-base58]
 */

import { getBytes } from "./data.js";
import { assertArgument } from "./errors.js";
import { toBigInt } from "./maths.js";

import type { BytesLike } from "./index.js";

const Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
let Lookup: null | Record<string, bigint> = null;

function getAlpha(letter: string): bigint {
	if (Lookup == null) {
		Lookup = {};
		for (let i = 0; i < Alphabet.length; i++) {
			Lookup[Alphabet[i]] = BigInt(i);
		}
	}
	const result = Lookup[letter];
	assertArgument(result != null, `invalid base58 value`, "letter", letter);
	return result;
}

const BN_0 = BigInt(0);
const BN_58 = BigInt(58);

/**
 *  Encode %%value%% as a Base58-encoded string.
 */
export function encodeBase58(_value: BytesLike): string {
	const bytes = getBytes(_value);

	let value = toBigInt(bytes);
	let result = "";
	while (value) {
		result = Alphabet[Number(value % BN_58)] + result;
		value /= BN_58;
	}

	// Account for leading padding zeros
	for (let i = 0; i < bytes.length; i++) {
		if (bytes[i]) {
			break;
		}
		result = Alphabet[0] + result;
	}

	return result;
}

/**
 *  Decode the Base58-encoded %%value%% as a numeric value.
 *
 *  Leading zero bytes cannot survive a numeric decode. Use
 *  [[decodeBase58Bytes]] to recover the bytes [[encodeBase58]] was given.
 */
export function decodeBase58(value: string): bigint {
	assertArgument(
		typeof value === "string",
		"invalid base58 value",
		"value",
		value,
	);

	let result = BN_0;
	for (let i = 0; i < value.length; i++) {
		result *= BN_58;
		result += getAlpha(value[i]);
	}
	return result;
}

/**
 *  Decode the Base58-encoded %%value%% as bytes.
 *
 *  Unlike [[decodeBase58]] this restores the leading zero bytes that
 *  [[encodeBase58]] wrote as leading ``"1"`` characters, so it round-trips
 *  arbitrary data.
 */
export function decodeBase58Bytes(value: string): Uint8Array {
	assertArgument(
		typeof value === "string",
		"invalid base58 value",
		"value",
		value,
	);

	// Every leading "1" stands for one zero byte and carries no magnitude.
	let zeros = 0;
	while (zeros < value.length && value[zeros] === Alphabet[0]) {
		zeros++;
	}

	const magnitude = decodeBase58(value.substring(zeros));
	const body = magnitude === BN_0 ? "" : magnitude.toString(16);
	const padded = body.length % 2 ? "0" + body : body;

	return getBytes("0x" + "00".repeat(zeros) + padded);
}
