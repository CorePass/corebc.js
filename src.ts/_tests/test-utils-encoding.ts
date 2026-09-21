/**
 *  Tests for the encoding layer and the library constants.
 *
 *  Four codecs are covered here, plus everything exported from
 *  `constants/`:
 *
 *    - UTF-8 (`utils/utf8.ts`), including the recoverable error API
 *    - RLP (`utils/rlp-encode.ts` / `utils/rlp-decode.ts`)
 *    - Base58 (`utils/base58.ts`)
 *    - Base64 (`utils/base64.ts`)
 *
 *  Every expected value in this file was measured against the
 *  implementation rather than copied from a specification, so the suite
 *  documents what the library actually does. Where the measured
 *  behaviour is wrong, a `PINS BUG` test records today's behaviour and a
 *  companion `it.skip` states what it should be instead.
 */
import assert from "node:assert/strict";

import {
	CoreSymbol,
	MaxInt256,
	MaxUint256,
	MessagePrefix,
	MinInt256,
	N,
	OrePerXCB,
	ZeroAddress,
	ZeroAddressDevin,
	ZeroAddressPrivate,
	getZeroAddress,
	ZeroHash,
	concat,
	dataLength,
	decodeBase58,
	decodeBase58Bytes,
	toBigInt,
	decodeBase64,
	decodeRlp,
	encodeBase58,
	encodeBase64,
	encodeRlp,
	getAddress,
	hexlify,
	isAddress,
	isHexString,
	keccak256,
	sha256,
	toBeHex,
	toUtf8Bytes,
	toUtf8CodePoints,
	toUtf8String,
	Utf8ErrorFuncs,
} from "../index.js";

// These four are exported from constants/index.ts but deliberately not
// re-exported from the package entry point, so they come from the module.
import { NegativeOne, One, Two, Zero } from "../constants/index.js";
import { normalizeBase64 } from "../utils/base64-helper.js";

import type { Utf8ErrorReason } from "../index.js";

/** Hex of the UTF-8 encoding of a string, for compact assertions. */
function utf8Hex(str: string): string {
	return hexlify(toUtf8Bytes(str));
}

/** A hex string of `count` repetitions of the byte 0x61 ("a"). */
function aBytes(count: number): string {
	return "0x" + "61".repeat(count);
}

/** Records every call the FSM makes into a Utf8ErrorFunc. */
function recordingErrorFunc(skip: number = 0) {
	const calls: Array<{
		reason: Utf8ErrorReason;
		offset: number;
		badCodepoint?: number;
	}> = [];
	const func = (
		reason: Utf8ErrorReason,
		offset: number,
		bytes: Uint8Array,
		output: Array<number>,
		badCodepoint?: number,
	): number => {
		calls.push({ reason, offset, badCodepoint });
		return skip;
	};
	return { calls, func };
}

describe("UTF-8 encoding: toUtf8Bytes", () => {
	it("encodes the empty string as no bytes", () => {
		assert.equal(utf8Hex(""), "0x");
		assert.equal(toUtf8Bytes("").length, 0);
	});

	it("returns a Uint8Array", () => {
		assert.ok(toUtf8Bytes("abc") instanceof Uint8Array);
	});

	it("encodes ASCII as one byte per character", () => {
		assert.equal(utf8Hex("Hello World"), "0x48656c6c6f20576f726c64");
		assert.equal(toUtf8Bytes("Hello World").length, 11);
	});

	it("encodes NUL as a single zero byte", () => {
		assert.equal(utf8Hex("\u0000"), "0x00");
	});

	it("encodes the one-byte boundary U+007F as one byte", () => {
		assert.equal(utf8Hex("\u007f"), "0x7f");
	});

	it("encodes the two-byte boundaries U+0080 and U+07FF", () => {
		assert.equal(utf8Hex("\u0080"), "0xc280");
		assert.equal(utf8Hex("\u07ff"), "0xdfbf");
	});

	it("encodes the three-byte boundaries U+0800 and U+FFFF", () => {
		assert.equal(utf8Hex("\u0800"), "0xe0a080");
		assert.equal(utf8Hex("\uffff"), "0xefbfbf");
	});

	it("encodes a two-byte codepoint", () => {
		assert.equal(utf8Hex("\u00e9"), "0xc3a9");
	});

	it("encodes a three-byte codepoint", () => {
		assert.equal(utf8Hex("\u20ac"), "0xe282ac");
	});

	it("encodes a surrogate pair as four bytes", () => {
		assert.equal(utf8Hex("\ud83d\ude00"), "0xf09f9880");
	});

	it("encodes the highest codepoint U+10FFFF as four bytes", () => {
		assert.equal(utf8Hex("\udbff\udfff"), "0xf48fbfbf");
	});

	it("encodes a mixed-width string", () => {
		assert.equal(
			utf8Hex("a\u00e9\u20ac\ud83d\ude00"),
			"0x61c3a9e282acf09f9880",
		);
	});

	it("rejects non-string input", () => {
		for (const value of [1, null, undefined, {}, [], true, new Uint8Array(2)]) {
			assert.throws(
				() => toUtf8Bytes(value as any),
				/invalid string value/,
				String(value),
			);
		}
	});
});

describe("UTF-8 decoding: toUtf8String", () => {
	it("decodes no bytes as the empty string", () => {
		assert.equal(toUtf8String("0x"), "");
	});

	it("decodes ASCII", () => {
		assert.equal(toUtf8String("0x48656c6c6f20576f726c64"), "Hello World");
	});

	it("decodes a NUL byte to a one-character string", () => {
		assert.equal(toUtf8String("0x00"), "\u0000");
		assert.equal(toUtf8String("0x00").length, 1);
	});

	it("decodes the shortest legal two-byte sequence", () => {
		assert.equal(toUtf8String("0xc280").codePointAt(0), 0x80);
	});

	it("decodes the shortest legal three-byte sequence", () => {
		assert.equal(toUtf8String("0xe0a080").codePointAt(0), 0x800);
	});

	it("decodes the shortest legal four-byte sequence", () => {
		assert.equal(toUtf8String("0xf0908080").codePointAt(0), 0x10000);
	});

	it("decodes the largest legal four-byte sequence", () => {
		assert.equal(toUtf8String("0xf48fbfbf").codePointAt(0), 0x10ffff);
	});

	it("accepts a Uint8Array as well as a hex string", () => {
		assert.equal(toUtf8String(new Uint8Array([0x41, 0x42])), "AB");
	});

	it("rejects input that is not byte-like", () => {
		for (const value of ["hello", "0x123", 5, null, {}]) {
			assert.throws(
				() => toUtf8String(value as any),
				/invalid BytesLike value/,
				String(value),
			);
		}
	});

	it("round-trips every codepoint width", () => {
		for (const str of [
			"",
			"a",
			"Hello World",
			"\u0000",
			"\u007f",
			"\u0080",
			"\u07ff",
			"\u0800",
			"\uffff",
			"\u00e9",
			"\u20ac",
			"\ud83d\ude00",
			"\udbff\udfff",
			"mixed a\u00e9\u20ac\ud83d\ude00 end",
		]) {
			assert.equal(toUtf8String(toUtf8Bytes(str)), str, JSON.stringify(str));
		}
	});
});

describe("UTF-8 code points: toUtf8CodePoints", () => {
	it("returns one entry per ASCII character", () => {
		assert.deepEqual(toUtf8CodePoints("abc"), [97, 98, 99]);
	});

	it("returns an empty array for the empty string", () => {
		assert.deepEqual(toUtf8CodePoints(""), []);
	});

	it("collapses a surrogate pair into a single code point", () => {
		assert.deepEqual(toUtf8CodePoints("\ud83d\ude00"), [0x1f600]);
	});

	it("returns the maximum code point for the highest surrogate pair", () => {
		assert.deepEqual(toUtf8CodePoints("\udbff\udfff"), [0x10ffff]);
	});

	it("counts code points rather than UTF-16 units", () => {
		// Four UTF-16 units, two code points.
		const str = "\ud83d\ude00\ud83d\ude00";
		assert.equal(str.length, 4);
		assert.equal(toUtf8CodePoints(str).length, 2);
	});

	it("agrees with the string iterator", () => {
		const str = "a\u00e9\u20ac\ud83d\ude00\u0000";
		assert.deepEqual(
			toUtf8CodePoints(str),
			[...str].map((c) => c.codePointAt(0)),
		);
	});

	it("rejects non-string input", () => {
		assert.throws(() => toUtf8CodePoints(1 as any), /invalid string value/);
	});
});

describe("UTF-8 normalization forms", () => {
	it("does not normalize when no form is given", () => {
		// "e" + combining acute stays decomposed.
		assert.equal(utf8Hex("e\u0301"), "0x65cc81");
	});

	it("composes with NFC", () => {
		assert.equal(hexlify(toUtf8Bytes("e\u0301", "NFC")), "0xc3a9");
	});

	it("decomposes with NFD", () => {
		assert.equal(hexlify(toUtf8Bytes("\u00e9", "NFD")), "0x65cc81");
	});

	it("expands compatibility characters with NFKC", () => {
		// U+FB03 LATIN SMALL LIGATURE FFI becomes "ffi".
		assert.equal(hexlify(toUtf8Bytes("\ufb03", "NFKC")), "0x666669");
	});

	it("expands and decomposes with NFKD", () => {
		assert.equal(
			hexlify(toUtf8Bytes("\ufb03\u00e9", "NFKD")),
			"0x66666965cc81",
		);
	});

	it("supports all four forms on a mixed string", () => {
		const str = "\ufb03\u00e9";
		assert.equal(hexlify(toUtf8Bytes(str, "NFC")), "0xefac83c3a9");
		assert.equal(hexlify(toUtf8Bytes(str, "NFD")), "0xefac8365cc81");
		assert.equal(hexlify(toUtf8Bytes(str, "NFKC")), "0x666669c3a9");
		assert.equal(hexlify(toUtf8Bytes(str, "NFKD")), "0x66666965cc81");
	});

	it("makes NFC and NFD agree after re-normalizing", () => {
		const composed = toUtf8Bytes("\u00e9", "NFC");
		const decomposed = toUtf8Bytes("e\u0301", "NFC");
		assert.equal(hexlify(composed), hexlify(decomposed));
	});

	it("normalizes code points as well as bytes", () => {
		assert.deepEqual(toUtf8CodePoints("\ufb03", "NFKC"), [102, 102, 105]);
		assert.deepEqual(toUtf8CodePoints("\u00e9", "NFD"), [101, 769]);
	});

	it("rejects an unknown normalization form", () => {
		assert.throws(
			() => toUtf8Bytes("a", "NFX" as any),
			/platform missing String.prototype.normalize/,
		);
	});

	it("is case sensitive about form names", () => {
		for (const form of ["nfc", "nfkc", "", " NFC"]) {
			assert.throws(
				() => toUtf8Bytes("a", form as any),
				/platform missing String.prototype.normalize/,
				JSON.stringify(form),
			);
		}
	});
});

describe("UTF-8 error handling: the error strategy", () => {
	it("is the default strategy when no handler is given", () => {
		assert.throws(() => toUtf8String("0x80"), /UNEXPECTED_CONTINUE/);
		assert.throws(
			() => toUtf8String("0x80", Utf8ErrorFuncs.error),
			/UNEXPECTED_CONTINUE/,
		);
	});

	it("reports UNEXPECTED_CONTINUE for a stray continuation byte", () => {
		assert.throws(
			() => toUtf8String("0x80"),
			/invalid codepoint at offset 0; UNEXPECTED_CONTINUE/,
		);
	});

	it("reports BAD_PREFIX for a byte that cannot start a sequence", () => {
		for (const value of ["0xf8", "0xff", "0xfe", "0xfc"]) {
			assert.throws(
				() => toUtf8String(value),
				/invalid codepoint at offset 0; BAD_PREFIX/,
				value,
			);
		}
	});

	it("reports OVERRUN when the sequence is cut off by the end of input", () => {
		assert.throws(
			() => toUtf8String("0xe282"),
			/invalid codepoint at offset 0; OVERRUN/,
		);
	});

	it("reports the offset of the truncated sequence, not of the input", () => {
		assert.throws(
			() => toUtf8String("0x41e282"),
			/invalid codepoint at offset 1; OVERRUN/,
		);
	});

	it("reports MISSING_CONTINUE when a continuation byte is not a continuation", () => {
		assert.throws(
			() => toUtf8String("0xe28041"),
			/invalid codepoint at offset 2; MISSING_CONTINUE/,
		);
	});

	it("reports OUT_OF_RANGE above U+10FFFF", () => {
		for (const value of ["0xf4908080", "0xf7bfbfbf"]) {
			assert.throws(
				() => toUtf8String(value),
				/invalid codepoint at offset 0; OUT_OF_RANGE/,
				value,
			);
		}
	});

	it("reports UTF16_SURROGATE for an encoded surrogate half", () => {
		assert.throws(
			() => toUtf8String("0xeda080"),
			/invalid codepoint at offset 0; UTF16_SURROGATE/,
		);
	});

	it("reports OVERLONG for a non-minimal two-byte sequence", () => {
		assert.throws(
			() => toUtf8String("0xc080"),
			/invalid codepoint at offset 0; OVERLONG/,
		);
		assert.throws(
			() => toUtf8String("0xc0af"),
			/invalid codepoint at offset 0; OVERLONG/,
		);
	});

	it("reports OVERLONG for non-minimal three- and four-byte sequences", () => {
		for (const value of ["0xe08080", "0xe09fbf", "0xf0808080", "0xf08fbfbf"]) {
			assert.throws(
				() => toUtf8String(value),
				/invalid codepoint at offset 0; OVERLONG/,
				value,
			);
		}
	});

	it("raises INVALID_ARGUMENT naming the bytes argument", () => {
		assert.throws(() => toUtf8String("0x80"), {
			code: "INVALID_ARGUMENT",
			argument: "bytes",
		});
	});
});

describe("UTF-8 error handling: the ignore strategy", () => {
	const ignore = (value: string) => toUtf8String(value, Utf8ErrorFuncs.ignore);

	it("drops a stray continuation byte", () => {
		assert.equal(ignore("0x80"), "");
	});

	it("drops a whole run of stray continuation bytes at once", () => {
		assert.equal(ignore("0x808080"), "");
	});

	it("drops a bad prefix together with its continuation bytes", () => {
		assert.equal(ignore("0xff808041"), "A");
	});

	it("drops a truncated sequence and stops at the end of input", () => {
		assert.equal(ignore("0x41e282"), "A");
	});

	it("drops a sequence with a bad continuation byte but keeps that byte", () => {
		// The offending byte 0x41 is re-read as the start of a new codepoint.
		assert.equal(ignore("0xe28041"), "A");
	});

	it("drops out-of-range and surrogate code points", () => {
		assert.equal(ignore("0xf7bfbfbf"), "");
		assert.equal(ignore("0xeda080"), "");
	});

	it("leaves valid input untouched", () => {
		assert.equal(ignore("0x48656c6c6f"), "Hello");
	});

	it("PINS BUG: the ignore strategy drops overlong code points instead of accepting them", () => {
		// src.ts/utils/utf8.ts:166-168 documents ignore as "silently drops any
		// illegal UTF-8 sequence and accepts non-canonical (overlong)
		// codepoints", and the replace strategy implements exactly that by
		// pushing badCodepoint (src.ts/utils/utf8.ts:142-151). ignoreFunc has
		// no OVERLONG branch at all (src.ts/utils/utf8.ts:105-132), so it
		// returns 0 without appending anything and the code point is lost.
		assert.equal(ignore("0xc0af"), "", "overlong '/' is dropped, not kept");
		assert.equal(ignore("0xc080"), "");
		assert.equal(ignore("0xe09fbf"), "");

		// replace, which shares ignoreFunc for every other reason, keeps it.
		assert.equal(toUtf8String("0xc0af", Utf8ErrorFuncs.replace), "/");
	});

	it.skip("the ignore strategy should accept overlong code points as documented", () => {
		assert.equal(ignore("0xc0af"), "/");
		assert.equal(ignore("0xc080"), "\u0000");
		assert.equal(ignore("0xe09fbf").codePointAt(0), 0x7ff);
	});
});

describe("UTF-8 error handling: the replace strategy", () => {
	const replace = (value: string) =>
		toUtf8String(value, Utf8ErrorFuncs.replace);
	const REPLACEMENT = "\ufffd";

	it("substitutes the replacement character for a stray continuation", () => {
		assert.equal(replace("0x80"), REPLACEMENT);
	});

	it("emits one replacement character for a whole continuation run", () => {
		assert.equal(replace("0x808080"), REPLACEMENT);
	});

	it("substitutes for a bad prefix and keeps following valid data", () => {
		assert.equal(replace("0xff808041"), REPLACEMENT + "A");
	});

	it("substitutes for a truncated sequence", () => {
		assert.equal(replace("0x41e282"), "A" + REPLACEMENT);
	});

	it("substitutes for a bad continuation byte and keeps that byte", () => {
		assert.equal(replace("0xe28041"), REPLACEMENT + "A");
	});

	it("substitutes for out-of-range code points", () => {
		assert.equal(replace("0xf7bfbfbf"), REPLACEMENT);
	});

	it("substitutes for encoded surrogate halves", () => {
		assert.equal(replace("0xeda080"), REPLACEMENT);
	});

	it("accepts an overlong sequence at its decoded value rather than replacing it", () => {
		// Documented: overlong forms are "valid" code points, just
		// non-canonical, so replace keeps the value.
		assert.equal(replace("0xc0af"), "/");
		assert.equal(replace("0xc080"), "\u0000");
		assert.equal(replace("0xe09fbf").codePointAt(0), 0x7ff);
	});

	it("leaves valid input untouched", () => {
		assert.equal(replace("0x48656c6c6f"), "Hello");
	});
});

describe("UTF-8 error handling: custom Utf8ErrorFunc", () => {
	it("exposes exactly the three built-in strategies, frozen", () => {
		assert.deepEqual(Object.keys(Utf8ErrorFuncs).sort(), [
			"error",
			"ignore",
			"replace",
		]);
		assert.ok(Object.isFrozen(Utf8ErrorFuncs));
	});

	it("passes the reason and offset of a surrogate fault", () => {
		const { calls, func } = recordingErrorFunc();
		assert.equal(toUtf8String("0xeda080", func), "");
		assert.deepEqual(calls, [
			{ reason: "UTF16_SURROGATE", offset: 0, badCodepoint: 0xd800 },
		]);
	});

	it("passes the decoded value as badCodepoint for OVERLONG", () => {
		const { calls, func } = recordingErrorFunc();
		toUtf8String("0xc0af", func);
		assert.deepEqual(calls, [
			{ reason: "OVERLONG", offset: 0, badCodepoint: 0x2f },
		]);
	});

	it("passes the computed value as badCodepoint for OUT_OF_RANGE", () => {
		const { calls, func } = recordingErrorFunc();
		toUtf8String("0xf7bfbfbf", func);
		assert.deepEqual(calls, [
			{ reason: "OUT_OF_RANGE", offset: 0, badCodepoint: 0x1fffff },
		]);
	});

	it("omits badCodepoint for structural faults", () => {
		for (const [value, reason] of [
			["0x80", "UNEXPECTED_CONTINUE"],
			["0xff", "BAD_PREFIX"],
			["0xe282", "OVERRUN"],
			["0xe28041", "MISSING_CONTINUE"],
		] as Array<[string, Utf8ErrorReason]>) {
			const { calls, func } = recordingErrorFunc();
			toUtf8String(value, func);
			assert.equal(calls[0].reason, reason, value);
			assert.equal(calls[0].badCodepoint, undefined, value);
		}
	});

	it("lets the handler append its own code points to the output", () => {
		const result = toUtf8String("0x41ff42", (reason, offset, bytes, output) => {
			output.push(0x3f);
			return 0;
		});
		assert.equal(result, "A?B");
	});

	it("honours the number of bytes the handler asks to skip", () => {
		// Skipping the two bytes after the bad prefix hides them entirely.
		assert.equal(
			toUtf8String("0xff414243", () => 2),
			"C",
		);
		assert.equal(
			toUtf8String("0xff414243", () => 0),
			"ABC",
		);
	});

	it("calls the handler once per fault", () => {
		const { calls, func } = recordingErrorFunc();
		toUtf8String("0x80ff80", func);
		assert.deepEqual(
			calls.map((c) => c.reason),
			["UNEXPECTED_CONTINUE", "BAD_PREFIX", "UNEXPECTED_CONTINUE"],
		);
	});

	it("is not consulted for valid input", () => {
		const { calls, func } = recordingErrorFunc();
		assert.equal(
			toUtf8String("0x61c3a9e282acf09f9880", func),
			"a\u00e9\u20ac\ud83d\ude00",
		);
		assert.deepEqual(calls, []);
	});
});

describe("UTF-8 surrogate handling", () => {
	it("rejects a lone high surrogate", () => {
		assert.throws(() => toUtf8Bytes("\ud800"), /invalid surrogate pair/);
	});

	it("rejects a high surrogate followed by a non-surrogate", () => {
		assert.throws(() => toUtf8Bytes("\ud800a"), /invalid surrogate pair/);
		assert.throws(() => toUtf8Bytes("\ud83da"), /invalid surrogate pair/);
	});

	it("rejects a high surrogate followed by another high surrogate", () => {
		assert.throws(() => toUtf8Bytes("\ud800\ud800"), /invalid surrogate pair/);
	});

	it("accepts every well-formed surrogate pair boundary", () => {
		assert.equal(utf8Hex("\ud800\udc00"), "0xf0908080");
		assert.equal(utf8Hex("\udbff\udfff"), "0xf48fbfbf");
	});

	it("refuses to decode an encoded surrogate half", () => {
		// CESU-8 / WTF-8 style encodings of surrogates are not valid UTF-8.
		for (const value of ["0xeda080", "0xedb080", "0xedbfbf"]) {
			assert.throws(() => toUtf8String(value), /UTF16_SURROGATE/, value);
		}
	});

	it("PINS BUG: toUtf8Bytes silently encodes a lone LOW surrogate as invalid UTF-8", () => {
		// src.ts/utils/utf8.ts:313 tests only `(c & 0xfc00) == 0xd800`, which
		// matches high surrogates (U+D800-U+DBFF). A lone low surrogate
		// (U+DC00-U+DFFF) therefore falls through to the generic three-byte
		// branch at src.ts/utils/utf8.ts:330 and is encoded CESU-8 style. The
		// result is not valid UTF-8, and the library's own decoder rejects it,
		// so toUtf8Bytes can produce bytes that toUtf8String cannot read.
		assert.equal(utf8Hex("\udc00"), "0xedb080");
		assert.equal(utf8Hex("\udfff"), "0xedbfbf");
		assert.throws(() => toUtf8String(toUtf8Bytes("\udc00")), /UTF16_SURROGATE/);
	});

	it.skip("toUtf8Bytes should reject a lone low surrogate", () => {
		assert.throws(() => toUtf8Bytes("\udc00"), /invalid surrogate pair/);
		assert.throws(() => toUtf8Bytes("\udfff"), /invalid surrogate pair/);
		assert.throws(() => toUtf8Bytes("a\udc00b"), /invalid surrogate pair/);
	});
});

describe("RLP encoding: encodeRlp", () => {
	it("encodes the empty byte string as 0x80", () => {
		assert.equal(encodeRlp("0x"), "0x80");
	});

	it("encodes the empty list as 0xc0", () => {
		assert.equal(encodeRlp([]), "0xc0");
	});

	it("encodes a single byte below 0x80 as itself", () => {
		assert.equal(encodeRlp("0x00"), "0x00");
		assert.equal(encodeRlp("0x01"), "0x01");
		assert.equal(encodeRlp("0x7f"), "0x7f");
	});

	it("prefixes a single byte of 0x80 or above", () => {
		assert.equal(encodeRlp("0x80"), "0x8180");
		assert.equal(encodeRlp("0xff"), "0x81ff");
	});

	it("encodes a short string with a 0x80-based prefix", () => {
		// "dog"
		assert.equal(encodeRlp("0x646f67"), "0x83646f67");
	});

	it("encodes a 55-byte string with the largest single-byte prefix", () => {
		const encoded = encodeRlp(aBytes(55));
		assert.equal(encoded.substring(0, 4), "0xb7");
		assert.equal(dataLength(encoded), 56);
	});

	it("switches to a length-of-length prefix at 56 bytes", () => {
		const encoded = encodeRlp(aBytes(56));
		assert.equal(encoded.substring(0, 6), "0xb838");
		assert.equal(dataLength(encoded), 58);
	});

	it("uses two length bytes for a 1024-byte string", () => {
		const encoded = encodeRlp(aBytes(1024));
		assert.equal(encoded.substring(0, 8), "0xb90400");
		assert.equal(dataLength(encoded), 1027);
	});

	it("uses three length bytes for a 65536-byte string", () => {
		const encoded = encodeRlp(aBytes(65536));
		assert.equal(encoded.substring(0, 10), "0xba010000");
		assert.equal(dataLength(encoded), 65540);
	});

	it("encodes the classic lorem ipsum vector", () => {
		const lorem = "Lorem ipsum dolor sit amet, consectetur adipisicing elit";
		assert.equal(
			encodeRlp(hexlify(toUtf8Bytes(lorem))),
			"0xb8384c6f72656d20697073756d20646f6c6f722073697420616d65742c20636f6e7365637465747572206164697069736963696e6720656c6974",
		);
	});

	it("encodes a list of two short strings", () => {
		// [ "cat", "dog" ]
		assert.equal(encodeRlp(["0x636174", "0x646f67"]), "0xc88363617483646f67");
	});

	it("encodes the set-theoretic representation of three", () => {
		assert.equal(encodeRlp([[], [[]], [[], [[]]]]), "0xc7c0c1c0c3c0c1c0");
	});

	it("encodes a 54-byte list payload with a single-byte prefix", () => {
		// One leaf of 53 bytes encodes to 54 bytes of list payload.
		const encoded = encodeRlp([aBytes(53)]);
		assert.equal(encoded.substring(0, 4), "0xf6");
		assert.equal(dataLength(encoded), 55);
	});

	it("uses the largest single-byte list prefix for a 55-byte payload", () => {
		const encoded = encodeRlp([aBytes(54)]);
		assert.equal(encoded.substring(0, 4), "0xf7");
		assert.equal(dataLength(encoded), 56);
	});

	it("switches to a length-of-length list prefix at 56 bytes of payload", () => {
		const encoded = encodeRlp([aBytes(55)]);
		assert.equal(encoded.substring(0, 6), "0xf838");
		assert.equal(dataLength(encoded), 58);
	});

	it("uses two length bytes for a long list", () => {
		assert.equal(encodeRlp([aBytes(300)]).substring(0, 8), "0xf9012f");
	});

	it("accepts a Uint8Array as a leaf", () => {
		assert.equal(encodeRlp(new Uint8Array([1, 2, 3])), "0x83010203");
	});

	it("accepts Uint8Array leaves inside nested lists", () => {
		assert.equal(
			encodeRlp([new Uint8Array([1]), [new Uint8Array([2])]]),
			"0xc301c102",
		);
	});

	it("encodes deeply nested lists", () => {
		assert.equal(encodeRlp([[[[[["0x01"]]]]]]), "0xc6c5c4c3c2c101");
	});

	it("always produces a lower-case 0x-prefixed hex string", () => {
		const encoded = encodeRlp(["0xABCDEF", "0x"]);
		assert.match(encoded, /^0x[0-9a-f]*$/);
		assert.equal(encoded, "0xc583abcdef80");
	});

	it("rejects leaves that are not byte-like", () => {
		for (const value of [1, null, undefined, "dog", "0x123", true, {}]) {
			assert.throws(
				() => encodeRlp(value as any),
				/invalid BytesLike value/,
				String(value),
			);
		}
	});

	it("rejects bad leaves nested inside lists", () => {
		assert.throws(() => encodeRlp([1] as any), /invalid BytesLike value/);
		assert.throws(
			() => encodeRlp([["0x01", ["dog"]]] as any),
			/invalid BytesLike value/,
		);
	});
});

describe("RLP decoding: decodeRlp", () => {
	it("decodes 0x80 as the empty byte string", () => {
		assert.equal(decodeRlp("0x80"), "0x");
	});

	it("decodes 0xc0 as the empty list", () => {
		assert.deepEqual(decodeRlp("0xc0"), []);
	});

	it("decodes a bare single byte", () => {
		assert.equal(decodeRlp("0x00"), "0x00");
		assert.equal(decodeRlp("0x7f"), "0x7f");
	});

	it("decodes a prefixed single byte", () => {
		assert.equal(decodeRlp("0x8180"), "0x80");
		assert.equal(decodeRlp("0x81ff"), "0xff");
	});

	it("decodes a short string", () => {
		assert.equal(decodeRlp("0x83646f67"), "0x646f67");
	});

	it("decodes a long string", () => {
		assert.equal(
			decodeRlp(
				"0xb8384c6f72656d20697073756d20646f6c6f722073697420616d65742c20636f6e7365637465747572206164697069736963696e6720656c6974",
			),
			hexlify(
				toUtf8Bytes("Lorem ipsum dolor sit amet, consectetur adipisicing elit"),
			),
		);
	});

	it("decodes a list of short strings", () => {
		assert.deepEqual(decodeRlp("0xc88363617483646f67"), [
			"0x636174",
			"0x646f67",
		]);
	});

	it("decodes nested empty lists", () => {
		assert.deepEqual(decodeRlp("0xc1c0"), [[]]);
		assert.deepEqual(decodeRlp("0xc7c0c1c0c3c0c1c0"), [[], [[]], [[], [[]]]]);
	});

	it("returns lower-case hex leaves", () => {
		assert.equal(decodeRlp("0x83abcdef"), "0xabcdef");
	});

	it("accepts a Uint8Array as input", () => {
		assert.deepEqual(decodeRlp(new Uint8Array([0xc2, 0x81, 0x80])), ["0x80"]);
	});

	it("decodes a long list", () => {
		const decoded = decodeRlp(encodeRlp([aBytes(300)])) as Array<string>;
		assert.equal(decoded.length, 1);
		assert.equal(decoded[0], aBytes(300));
	});
});

describe("RLP round trips", () => {
	const CASES: Array<any> = [
		"0x",
		"0x00",
		"0x01",
		"0x7f",
		"0x80",
		"0xff",
		"0x646f67",
		aBytes(1),
		aBytes(54),
		aBytes(55),
		aBytes(56),
		aBytes(57),
		aBytes(1024),
		[],
		[[]],
		[[], [[]], [[], [[]]]],
		["0x636174", "0x646f67"],
		[aBytes(53)],
		[aBytes(54)],
		[aBytes(300)],
		[[[[[["0x01"]]]]]],
		["0x", [], ["0x00", ["0x", "0xff"]]],
	];

	for (const value of CASES) {
		const label = Array.isArray(value)
			? JSON.stringify(value).substring(0, 40)
			: `${(value as string).substring(0, 12)} (${dataLength(value as string)} bytes)`;
		it(`round-trips ${label}`, () => {
			assert.deepEqual(decodeRlp(encodeRlp(value)), value);
		});
	}

	it("round-trips a structure spanning every length class", () => {
		const value = [
			"0x",
			"0x01",
			aBytes(55),
			aBytes(56),
			[aBytes(300), ["0x00"]],
		];
		assert.deepEqual(decodeRlp(encodeRlp(value)), value);
	});

	it("round-trips pseudo-random nested structures", () => {
		// Deterministic pseudo-random data so a failure is reproducible.
		let seed = 42;
		const next = () => {
			seed = (seed * 1103515245 + 12345) & 0x7fffffff;
			return seed;
		};
		const randomHex = (length: number) => {
			let result = "0x";
			for (let i = 0; i < length; i++) {
				result += (next() % 256).toString(16).padStart(2, "0");
			}
			return result;
		};
		for (let i = 0; i < 100; i++) {
			const value = [
				randomHex(i % 70),
				[randomHex(3), [randomHex(i % 5)]],
				randomHex(60),
			];
			assert.deepEqual(decodeRlp(encodeRlp(value)), value, `iteration ${i}`);
		}
	});

	it("normalizes a Uint8Array leaf to a hex string on the way back", () => {
		assert.deepEqual(decodeRlp(encodeRlp([new Uint8Array([1, 2])])), [
			"0x0102",
		]);
	});
});

describe("RLP malformed input rejection", () => {
	it("rejects empty input", () => {
		assert.throws(() => decodeRlp("0x"), /data too short/);
		assert.throws(() => decodeRlp("0x"), { code: "BUFFER_OVERRUN" });
	});

	it("rejects trailing junk after a complete payload", () => {
		assert.throws(
			() => decodeRlp("0x8180ff"),
			/unexpected junk after rlp payload/,
		);
		assert.throws(
			() => decodeRlp("0xc0c0"),
			/unexpected junk after rlp payload/,
		);
		assert.throws(
			() => decodeRlp("0x0000"),
			/unexpected junk after rlp payload/,
		);
	});

	it("rejects a truncated short string", () => {
		assert.throws(() => decodeRlp("0x83646f"), /data short segment too short/);
		assert.throws(() => decodeRlp("0x81"), /data short segment too short/);
	});

	it("rejects a truncated long string", () => {
		for (const value of ["0xb8", "0xb838", "0xb90400"]) {
			assert.throws(
				() => decodeRlp(value),
				/data short segment too short/,
				value,
			);
		}
	});

	it("rejects a truncated list", () => {
		assert.throws(
			() => decodeRlp("0xc883646f67"),
			/data short segment too short/,
		);
		assert.throws(() => decodeRlp("0xf8"), /data short segment too short/);
	});

	it("rejects a child that runs past its parent's declared length", () => {
		assert.throws(() => decodeRlp("0xc18180"), /child data too short/);
	});

	it("raises BUFFER_OVERRUN for every truncation", () => {
		for (const value of ["0x", "0x81", "0xb8", "0xc883646f67", "0xc18180"]) {
			assert.throws(() => decodeRlp(value), { code: "BUFFER_OVERRUN" }, value);
		}
	});

	it("rejects input that is not byte-like", () => {
		for (const value of ["hello", "0x8", 5, null, {}, undefined]) {
			assert.throws(
				() => decodeRlp(value as any),
				/invalid BytesLike value/,
				String(value),
			);
		}
	});

	it("rejects every truncation of a valid encoding", () => {
		const encoded = encodeRlp([aBytes(60), ["0x01", "0x"]]);
		for (let i = 4; i < encoded.length - 2; i += 2) {
			assert.throws(() => decodeRlp(encoded.substring(0, i)), `prefix ${i}`);
		}
	});

	it("PINS: accepts non-minimal length encodings", () => {
		// RLP is canonical: a single byte below 0x80 must be written bare and
		// a length must use the shortest form that can express it. This
		// decoder accepts the alternatives too, which is encoding
		// malleability - a hash over the raw bytes differs while the decoded
		// structure is identical. Rejecting them would refuse input that
		// callers can already decode today.
		assert.equal(decodeRlp("0x8101"), "0x01");
		assert.equal(encodeRlp(decodeRlp("0x8101")), "0x01");
		assert.notEqual(encodeRlp(decodeRlp("0x8101")), "0x8101");

		assert.equal(decodeRlp("0xb80161"), "0x61");
		assert.deepEqual(decodeRlp("0xf800"), []);
	});

	it("accepts the canonical spelling of the same values", () => {
		assert.equal(decodeRlp("0x01"), "0x01");
		assert.equal(decodeRlp("0x7f"), "0x7f");
		assert.equal(decodeRlp("0x8180"), "0x80");
		assert.equal(decodeRlp("0x61"), "0x61");
		assert.deepEqual(decodeRlp("0xc0"), []);
	});

	it("round-trips everything encodeRlp produces", () => {
		// The encoder is canonical, so the stricter decoder must still take
		// all of its output.
		const cases: Array<any> = [
			"0x",
			"0x00",
			"0x01",
			"0x7f",
			"0x80",
			"0xff",
			"0x1234",
			"0x" + "61".repeat(55),
			"0x" + "61".repeat(56),
			"0x" + "61".repeat(1024),
			[],
			[[]],
			["0x01", "0x02"],
			[["0x01"], ["0x02", []]],
			new Array(60).fill("0x01"),
		];
		for (const value of cases) {
			const encoded = encodeRlp(value);
			assert.deepEqual(decodeRlp(encoded), value, encoded.substring(0, 20));
		}
	});
});

describe("Base58 encoding: encodeBase58", () => {
	it("encodes the empty input as the empty string", () => {
		assert.equal(encodeBase58("0x"), "");
	});

	it("encodes a small value", () => {
		assert.equal(encodeBase58("0x1234"), "2PM");
	});

	it("uses the Bitcoin alphabet, which omits 0, O, I and l", () => {
		let seen = "";
		for (let i = 0; i < 256; i++) {
			seen += encodeBase58(hexlify(new Uint8Array([i])));
		}
		assert.doesNotMatch(seen, /[0OIl]/);
		assert.match(seen, /^[1-9A-HJ-NP-Za-km-z]+$/);
	});

	it("encodes each leading zero byte as a single '1'", () => {
		assert.equal(encodeBase58("0x00"), "1");
		assert.equal(encodeBase58("0x000000"), "111");
		assert.equal(
			encodeBase58("0x0000000000000000000000000000000000000000"),
			"1".repeat(20),
		);
	});

	it("keeps leading '1's in front of the encoded value", () => {
		assert.equal(encodeBase58("0x0001"), "12");
		assert.equal(encodeBase58("0x000001"), "112");
	});

	it("does not add a '1' for an interior or trailing zero byte", () => {
		assert.equal(encodeBase58("0x0100"), "5R");
		assert.equal(encodeBase58("0x010000"), "LUw");
		assert.equal(encodeBase58("0x00ff"), "15Q");
	});

	it("encodes single-byte extremes", () => {
		assert.equal(encodeBase58("0x01"), "2");
		assert.equal(encodeBase58("0x61"), "2g");
		assert.equal(encodeBase58("0xff"), "5Q");
		assert.equal(encodeBase58("0xffff"), "LUv");
	});

	it("encodes the classic 'bbb' and 'ccc' vectors", () => {
		assert.equal(encodeBase58("0x626262"), "a3gV");
		assert.equal(encodeBase58("0x636363"), "aPEr");
	});

	it("encodes a UTF-8 payload", () => {
		assert.equal(
			encodeBase58(toUtf8Bytes("Hello World!")),
			"2NEpo7TZRRrLZSi2U",
		);
	});

	it("encodes a version-prefixed 20-byte payload the way Bitcoin does", () => {
		assert.equal(
			encodeBase58("0x0065a16059864a2fdbc7c99a4723a8395bc6f188eb"),
			"12R82ZZG6NVmpnP8KwRJGt8tRdCU2",
		);
	});

	it("accepts a Uint8Array", () => {
		assert.equal(encodeBase58(new Uint8Array([0, 0, 1, 2, 3])), "11Ldp");
	});

	it("grows monotonically in length with the value", () => {
		let previous = 0;
		for (const size of [1, 2, 4, 8, 16, 32]) {
			const encoded = encodeBase58("0x" + "ff".repeat(size));
			assert.ok(encoded.length > previous, `size ${size}`);
			previous = encoded.length;
		}
	});

	it("rejects input that is not byte-like", () => {
		for (const value of ["hello", "1234", "0x123", 123, null, {}]) {
			assert.throws(
				() => encodeBase58(value as any),
				/invalid BytesLike value/,
				String(value),
			);
		}
	});
});

describe("Base58 decoding: decodeBase58", () => {
	it("returns a bigint, not bytes", () => {
		assert.equal(typeof decodeBase58("2PM"), "bigint");
	});

	it("decodes a small value", () => {
		assert.equal(decodeBase58("2PM"), BigInt(0x1234));
		assert.equal(decodeBase58("2VfUX"), BigInt(0x01020304));
	});

	it("treats the empty string as zero", () => {
		assert.equal(decodeBase58(""), BigInt(0));
	});

	it("treats a run of '1's as zero", () => {
		assert.equal(decodeBase58("1"), BigInt(0));
		assert.equal(decodeBase58("111"), BigInt(0));
	});

	it("gives each alphabet character its positional value", () => {
		assert.equal(decodeBase58("2"), BigInt(1));
		assert.equal(decodeBase58("z"), BigInt(57));
		assert.equal(decodeBase58("21"), BigInt(58));
		assert.equal(decodeBase58("22"), BigInt(59));
	});

	it("rejects the four characters excluded from the alphabet", () => {
		for (const value of ["0", "O", "I", "l"]) {
			assert.throws(
				() => decodeBase58(value),
				/invalid base58 value/,
				JSON.stringify(value),
			);
		}
	});

	it("rejects other invalid characters", () => {
		for (const value of ["+", "/", "=", " ", "-", "_", "\u00e9", "\u20ac"]) {
			assert.throws(
				() => decodeBase58(value),
				/invalid base58 value/,
				JSON.stringify(value),
			);
		}
	});

	it("rejects a bad character anywhere in the string", () => {
		for (const value of ["0abc", "ab0c", "abc0", "a b"]) {
			assert.throws(() => decodeBase58(value), /invalid base58 value/, value);
		}
	});

	it("names the offending letter in the error", () => {
		assert.throws(() => decodeBase58("ab0c"), {
			code: "INVALID_ARGUMENT",
			argument: "letter",
			value: "0",
		});
	});

	it("recovers the numeric value of every encoding", () => {
		for (const value of [
			"0x01",
			"0x1234",
			"0xff",
			"0xffff",
			"0x626262",
			"0x" + "ab".repeat(32),
		]) {
			assert.equal(toBeHex(decodeBase58(encodeBase58(value))), value, value);
		}
	});

	it("PINS BUG: base58 does not round-trip leading zero bytes", () => {
		// encodeBase58 deliberately emits one "1" per leading zero byte
		// (src.ts/utils/base58.ts:52-58), which is the Bitcoin convention and
		// makes the encoding byte-oriented. decodeBase58 however returns a
		// bigint built by multiply-and-add (src.ts/utils/base58.ts:66-73), so
		// those leading zeros are unrecoverable. The pair is therefore not
		// inverse: two different inputs encode to different strings that
		// decode to the same value.
		assert.equal(encodeBase58("0x0001"), "12");
		assert.equal(encodeBase58("0x01"), "2");
		assert.equal(decodeBase58("12"), BigInt(1));
		assert.equal(decodeBase58("2"), BigInt(1));
		assert.equal(
			decodeBase58(encodeBase58("0x0001")),
			decodeBase58(encodeBase58("0x01")),
		);

		// The all-zero input encodes to something non-empty but decodes to 0.
		assert.equal(encodeBase58("0x000000"), "111");
		assert.equal(decodeBase58("111"), BigInt(0));
	});

	it("decodeBase58Bytes preserves leading zero bytes", () => {
		assert.equal(hexlify(decodeBase58Bytes("12")), "0x0001");
		assert.equal(hexlify(decodeBase58Bytes("111")), "0x000000");
		assert.equal(hexlify(decodeBase58Bytes("2")), "0x01");
		assert.equal(hexlify(decodeBase58Bytes("")), "0x");
	});

	it("decodeBase58Bytes round-trips arbitrary bytes", () => {
		const cases = [
			"0x",
			"0x00",
			"0x01",
			"0x0001",
			"0x000000",
			"0x1234",
			"0x00ff",
			"0x0000000000000000000000000000000000000000",
			"0x0065a16059864a2fdbc7c99a4723a8395bc6f188eb",
			"0x" + "ff".repeat(32),
		];
		for (const value of cases) {
			assert.equal(
				hexlify(decodeBase58Bytes(encodeBase58(value))),
				value,
				value,
			);
		}
	});

	it("decodeBase58Bytes agrees with decodeBase58 on the magnitude", () => {
		for (const value of ["2PM", "2VfUX", "12", "111", "z"]) {
			assert.equal(
				toBigInt(decodeBase58Bytes(value)),
				decodeBase58(value),
				value,
			);
		}
	});

	it("PINS: decodeBase58 does not validate that its input is a string", () => {
		// `value.length` is undefined for a number, so the loop body never
		// runs and the function returns zero rather than raising
		// INVALID_ARGUMENT. decodeBase58Bytes does validate; this entry point
		// is left as it was so existing callers see no new exception.
		assert.equal(decodeBase58(123 as any), BigInt(0));
		assert.equal(decodeBase58(true as any), BigInt(0));
		assert.equal(decodeBase58({} as any), BigInt(0));

		// null and undefined leak a raw TypeError rather than a library error.
		assert.throws(() => decodeBase58(null as any), TypeError);
		assert.throws(() => decodeBase58(undefined as any), TypeError);
	});

	it("decodeBase58Bytes does reject non-string input", () => {
		for (const value of [123, true, {}, null, undefined, new Uint8Array(2)]) {
			assert.throws(() => decodeBase58Bytes(value as any), {
				code: "INVALID_ARGUMENT",
			});
		}
	});
});

describe("Base64 encoding: encodeBase64", () => {
	it("encodes the empty input as the empty string", () => {
		assert.equal(encodeBase64("0x"), "");
	});

	it("encodes two bytes with one pad character", () => {
		assert.equal(encodeBase64("0x1234"), "EjQ=");
	});

	it("pads according to the input length modulo three", () => {
		assert.equal(encodeBase64("0x61"), "YQ==");
		assert.equal(encodeBase64("0x6162"), "YWI=");
		assert.equal(encodeBase64("0x616263"), "YWJj");
		assert.equal(encodeBase64("0x61626364"), "YWJjZA==");
	});

	it("encodes a zero byte", () => {
		assert.equal(encodeBase64("0x00"), "AA==");
		assert.equal(encodeBase64("0x000000"), "AAAA");
	});

	it("uses the standard alphabet with + and /", () => {
		assert.equal(encodeBase64("0xfbff"), "+/8=");
		assert.equal(encodeBase64("0xff"), "/w==");
	});

	it("encodes a UTF-8 payload", () => {
		assert.equal(
			encodeBase64(toUtf8Bytes("Hello World!!")),
			"SGVsbG8gV29ybGQhIQ==",
		);
	});

	it("accepts a Uint8Array", () => {
		assert.equal(encodeBase64(new Uint8Array([0x12, 0x34])), "EjQ=");
	});

	it("requires data, not a plain string", () => {
		// The documented trap: pass toUtf8Bytes(...) for text.
		assert.throws(
			() => encodeBase64("Hello World!!"),
			/invalid BytesLike value/,
		);
	});

	it("rejects input that is not byte-like", () => {
		for (const value of ["0x123", 123, null, {}, undefined]) {
			assert.throws(
				() => encodeBase64(value as any),
				/invalid BytesLike value/,
				String(value),
			);
		}
	});

	it("produces only alphabet and padding characters", () => {
		for (let size = 0; size < 20; size++) {
			const encoded = encodeBase64("0x" + "a7".repeat(size));
			assert.match(encoded, /^[A-Za-z0-9+/]*={0,2}$/, `size ${size}`);
			assert.equal(encoded.length % 4, 0, `size ${size} padding`);
		}
	});
});

describe("Base64 decoding: decodeBase64", () => {
	it("returns a Uint8Array", () => {
		assert.ok(decodeBase64("EjQ=") instanceof Uint8Array);
	});

	it("decodes the empty string to no bytes", () => {
		assert.equal(hexlify(decodeBase64("")), "0x");
	});

	it("decodes a padded value", () => {
		assert.equal(hexlify(decodeBase64("EjQ=")), "0x1234");
	});

	it("decodes to the original UTF-8 text", () => {
		assert.equal(
			toUtf8String(decodeBase64("SGVsbG8gV29ybGQhIQ==")),
			"Hello World!!",
		);
	});

	it("decodes the standard alphabet extremes", () => {
		assert.equal(hexlify(decodeBase64("/w==")), "0xff");
		assert.equal(hexlify(decodeBase64("+/8=")), "0xfbff");
		assert.equal(hexlify(decodeBase64("AAAA")), "0x000000");
	});

	it("round-trips every length up to 64 bytes", () => {
		for (let size = 0; size <= 64; size++) {
			const value = "0x" + "5a".repeat(size);
			assert.equal(
				hexlify(decodeBase64(encodeBase64(value))),
				value,
				`size ${size}`,
			);
		}
	});

	it("round-trips data containing every byte value", () => {
		const bytes = new Uint8Array(256);
		for (let i = 0; i < 256; i++) {
			bytes[i] = i;
		}
		assert.equal(hexlify(decodeBase64(encodeBase64(bytes))), hexlify(bytes));
	});

	it("rejects non-string input", () => {
		assert.throws(() => decodeBase64(123 as any), TypeError);
	});

	it("PINS: drops invalid characters rather than failing", () => {
		// Buffer.from is lenient and drops anything outside the alphabet, so
		// malformed input decodes to a shorter result with no indication that
		// anything was wrong. Kept because callers depend on it.
		assert.equal(hexlify(decodeBase64("!!!!")), "0x");
		assert.equal(hexlify(decodeBase64("Ej Q=")), "0x1234");
		assert.equal(hexlify(decodeBase64("Ej#Q=")), "0x1234");
		assert.equal(hexlify(decodeBase64("EjQ")), "0x1234", "missing padding");
	});

	it("decodeBase64 accepts well-formed input, padded or not", () => {
		assert.equal(hexlify(decodeBase64("EjQ=")), "0x1234");
		assert.equal(hexlify(decodeBase64("EjQ")), "0x1234");
		assert.equal(hexlify(decodeBase64("")), "0x");
		assert.equal(hexlify(decodeBase64("+/8=")), "0xfbff");
		assert.equal(
			toUtf8String(decodeBase64("SGVsbG8gV29ybGQhIQ==")),
			"Hello World!!",
		);
	});

	it("PINS: treats URL-safe base64 as if it were standard", () => {
		// "-" and "_" are aliases of "+" and "/" to Buffer.from, so both
		// alphabets decode to the same bytes. The browser build normalizes to
		// match rather than rejecting, as atob alone would.
		assert.equal(hexlify(decodeBase64("-_8=")), "0xfbff");
		assert.equal(hexlify(decodeBase64("+/8=")), "0xfbff");
		assert.equal(hexlify(decodeBase64("-_8=")), hexlify(decodeBase64("+/8=")));
	});

	it("decodeBase64 behaves identically in the node and browser builds", () => {
		// Both builds normalize through normalizeBase64 before touching their
		// platform primitive. Buffer.from drops characters outside the
		// alphabet and aliases the URL-safe one; atob rejects both, so the
		// browser build needs the same normalization to accept the same set.
		const cases = [
			"",
			"EjQ=",
			"EjQ",
			"+/8=",
			"-_8=",
			"Ej Q=",
			"Ej#Q=",
			"!!!!",
			"A",
			"\tEjQ=",
			"SGVsbG8gV29ybGQhIQ==",
		];
		for (const value of cases) {
			// What the browser build would compute, given the same input.
			const browser = hexlify(
				Uint8Array.from(atob(normalizeBase64(value)), (c) => c.charCodeAt(0)),
			);
			assert.equal(hexlify(decodeBase64(value)), browser, value);
		}
	});

	it("decodeBase64 keeps accepting the lenient input Buffer always took", () => {
		// Rejecting these would break callers that relied on Buffer.from's
		// leniency, so they decode rather than throw.
		assert.equal(hexlify(decodeBase64("-_8=")), "0xfbff");
		assert.equal(hexlify(decodeBase64("+/8=")), "0xfbff");
		assert.equal(hexlify(decodeBase64("Ej Q=")), "0x1234");
		assert.equal(hexlify(decodeBase64("Ej#Q=")), "0x1234");
		assert.equal(hexlify(decodeBase64("!!!!")), "0x");
		assert.equal(hexlify(decodeBase64("EjQ")), "0x1234");
	});
});

describe("Constants: numeric values", () => {
	it("exports N as a bigint", () => {
		assert.equal(typeof N, "bigint");
	});

	it("sets OrePerXCB to 10^18", () => {
		assert.equal(OrePerXCB, BigInt("1000000000000000000"));
		assert.equal(OrePerXCB, BigInt(10) ** BigInt(18));
		assert.equal(typeof OrePerXCB, "bigint");
	});

	it("sets MaxUint256 to 2^256 - 1", () => {
		assert.equal(MaxUint256, BigInt(2) ** BigInt(256) - BigInt(1));
		assert.equal(
			MaxUint256,
			BigInt(
				"115792089237316195423570985008687907853269984665640564039457584007913129639935",
			),
		);
		assert.equal(toBeHex(MaxUint256), "0x" + "ff".repeat(32));
	});

	it("sets MaxInt256 to 2^255 - 1", () => {
		assert.equal(MaxInt256, BigInt(2) ** BigInt(255) - BigInt(1));
		assert.equal(toBeHex(MaxInt256), "0x7f" + "ff".repeat(31));
	});

	it("sets MinInt256 to -2^255", () => {
		assert.equal(MinInt256, -(BigInt(2) ** BigInt(255)));
		assert.equal(
			MinInt256,
			BigInt(
				"-57896044618658097711785492504343953926634992332820282019728792003956564819968",
			),
		);
	});

	it("keeps the int256 bounds consistent with each other", () => {
		assert.equal(MinInt256, -MaxInt256 - BigInt(1));
		assert.equal(MaxInt256 - MinInt256, MaxUint256);
	});

	it("exports the small bigint helpers with their obvious values", () => {
		assert.equal(NegativeOne, BigInt(-1));
		assert.equal(Zero, BigInt(0));
		assert.equal(One, BigInt(1));
		assert.equal(Two, BigInt(2));
		for (const value of [NegativeOne, Zero, One, Two]) {
			assert.equal(typeof value, "bigint");
		}
	});

	it("sets N to the Ed448-Goldilocks group order, the curve Core signs with", () => {
		assert.equal(
			N,
			BigInt(2) ** BigInt(446) -
				BigInt(
					"13818066809895115352007386748515426880336692474882178609894547503885",
				),
		);
	});

	it("does not carry Ethereum's secp256k1 order", () => {
		assert.notEqual(
			N,
			BigInt(
				"0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141",
			),
		);
	});
});

describe("Constants: hashes and addresses", () => {
	it("sets ZeroHash to 32 zero bytes", () => {
		assert.equal(ZeroHash, "0x" + "00".repeat(32));
		assert.equal(dataLength(ZeroHash), 32);
		assert.ok(isHexString(ZeroHash, 32));
	});

	it("matches the hash of nothing being non-zero, so ZeroHash is a sentinel", () => {
		assert.notEqual(keccak256("0x"), ZeroHash);
		assert.notEqual(sha256("0x"), ZeroHash);
	});

	it("sets ZeroAddress to zero key material", () => {
		// The prefix and check digits are part of the address, so only the
		// trailing 20 bytes are zero.
		assert.equal(ZeroAddress.substring(6), "0".repeat(40));
	});

	it("gives ZeroAddress the Core 22-byte address shape", () => {
		assert.equal(dataLength(ZeroAddress), 22);
		assert.equal(ZeroAddress.length, 46);
		assert.match(ZeroAddress, /^0x[0-9a-f]{44}$/);
	});

	it("makes ZeroAddress pass the library's own validators", () => {
		assert.equal(isAddress(ZeroAddress), true);
		assert.equal(getAddress(ZeroAddress), ZeroAddress);
	});

	it("puts ZeroAddress on the main network", () => {
		assert.equal(ZeroAddress.substring(2, 4), "cb");
		assert.equal(ZeroAddress, getZeroAddress("cb"));
	});

	it("gives every network its own zero address", () => {
		// The checksum covers the prefix, so these cannot share a body.
		assert.equal(getZeroAddress("ab"), ZeroAddressDevin);
		assert.equal(getZeroAddress("ce"), ZeroAddressPrivate);
		for (const address of [ZeroAddress, ZeroAddressDevin, ZeroAddressPrivate]) {
			assert.equal(isAddress(address), true, address);
			assert.equal(dataLength(address), 22, address);
		}
		assert.equal(
			new Set([ZeroAddress, ZeroAddressDevin, ZeroAddressPrivate]).size,
			3,
		);
	});

	it("rejects a prefix that is not a network", () => {
		for (const prefix of ["", "cb ", "CB", "ff", "cbcb"]) {
			assert.throws(() => getZeroAddress(prefix), JSON.stringify(prefix));
		}
	});
});

describe("Constants: Core branding and strings", () => {
	it("sets CoreSymbol to the Greek capital letter Xi", () => {
		assert.equal(CoreSymbol, "\u039e");
		assert.equal(CoreSymbol.codePointAt(0), 0x39e);
		assert.equal(CoreSymbol.length, 1);
	});

	it("keeps CoreSymbol in NFKC normalized form", () => {
		assert.equal(CoreSymbol, CoreSymbol.normalize("NFKC"));
		assert.equal(CoreSymbol, CoreSymbol.normalize("NFC"));
		// The mathematical italic small xi normalizes onto the same character.
		assert.equal("\ud835\udf63".normalize("NFKC"), CoreSymbol);
	});

	it("round-trips CoreSymbol through UTF-8", () => {
		assert.equal(utf8Hex(CoreSymbol), "0xce9e");
		assert.equal(toUtf8String(toUtf8Bytes(CoreSymbol)), CoreSymbol);
	});

	it("brands MessagePrefix for Core rather than Ethereum", () => {
		assert.equal(MessagePrefix, "\x19Core Signed Message:\n");
		assert.ok(MessagePrefix.includes("Core"));
		assert.doesNotMatch(MessagePrefix, /Ethereum/i);
	});

	it("keeps the EIP-191 shape of MessagePrefix", () => {
		// 0x19 sentinel, human readable tag, trailing newline.
		assert.equal(MessagePrefix.charCodeAt(0), 0x19);
		assert.equal(MessagePrefix[MessagePrefix.length - 1], "\n");
		assert.equal(MessagePrefix.length, 22);
		assert.equal(
			utf8Hex(MessagePrefix),
			"0x19436f7265205369676e6564204d6573736167653a0a",
		);
	});

	it("uses MessagePrefix in the personal-sign digest", () => {
		const message = "Hello World";
		const bytes = toUtf8Bytes(message);
		const expected = sha256(
			concat([
				toUtf8Bytes(MessagePrefix),
				toUtf8Bytes(String(bytes.length)),
				bytes,
			]),
		);
		assert.equal(
			expected,
			"0xaa1f0c682af61f7d7893f3f610c72c2847c76d00b841237e99bb5c44c2b2cd5b",
		);
	});

	it("names no Ethereum unit in any exported constant name or string value", () => {
		// Core uses energy/ore/core where Ethereum uses gas/wei/ether.
		for (const [name, value] of Object.entries({
			CoreSymbol,
			MessagePrefix,
			ZeroAddress,
			ZeroHash,
		})) {
			assert.doesNotMatch(value, /ether|wei|gwei|gas/i, name);
		}
		assert.ok("OrePerXCB".includes("Ore"), "the unit constant names ore");
	});
});
