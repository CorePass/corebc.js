/**
 *  Byte/hex and numeric utility layer.
 *
 *  Covers the three modules that everything else in the library is built
 *  on top of:
 *
 *    - utils/data.ts        binary <-> hex conversion, slicing, padding
 *    - utils/maths.ts       BigNumberish coercion, twos-complement, quantities
 *    - utils/fixednumber.ts fixed-point decimal arithmetic
 *
 *  Every expectation here was measured against the built library rather
 *  than carried over from ethers, because this fork keeps a second, older
 *  set of helpers (arrayify / hexConcat / hexDataSlice / hexDataLength /
 *  stripZeros) alongside the v6-style ones, and the two sets do not always
 *  agree. Where they disagree in a way that is clearly a defect, the
 *  current behaviour is pinned by a `PINS BUG:` test and the intended
 *  behaviour is written as a skipped test next to it.
 */
import assert from "node:assert/strict";

import {
	arrayify,
	concat,
	dataLength,
	dataSlice,
	FixedNumber,
	fromTwos,
	getBigInt,
	getBytes,
	getBytesCopy,
	getNumber,
	getUint,
	hexConcat,
	hexlify,
	isBytesLike,
	isHexString,
	mask,
	stripZerosLeft,
	toBeArray,
	toBeHex,
	toBigInt,
	toNumber,
	toQuantity,
	toTwos,
	zeroPadBytes,
	zeroPadValue,
} from "../index.js";

// These four are only reachable from the module itself; the package entry
// re-exports arrayify and hexConcat but not the rest of the legacy set.
import {
	hexDataLength,
	hexDataSlice,
	isBytes,
	stripZeros,
} from "../utils/data.js";

/** A five byte sample with distinct, non-symmetric bytes. */
const DATA = "0x0123456789";

describe("data: getBytes and getBytesCopy", () => {
	it("decodes an even-length hex string", () => {
		assert.deepEqual(getBytes("0x1234"), new Uint8Array([0x12, 0x34]));
		assert.deepEqual(getBytes(DATA), new Uint8Array([1, 35, 69, 103, 137]));
	});

	it("decodes the empty hex string to an empty array", () => {
		assert.deepEqual(getBytes("0x"), new Uint8Array([]));
		assert.equal(getBytes("0x").length, 0);
	});

	it("accepts upper-case hex digits", () => {
		assert.deepEqual(getBytes("0xAB"), new Uint8Array([0xab]));
		assert.deepEqual(getBytes("0xaB"), getBytes("0xAb"));
	});

	it("returns the very same Uint8Array it was given", () => {
		const bytes = new Uint8Array([1, 2, 3]);
		assert.equal(getBytes(bytes), bytes);
	});

	it("getBytesCopy returns an equal but independent array", () => {
		const bytes = new Uint8Array([1, 2, 3]);
		const copy = getBytesCopy(bytes);
		assert.notEqual(copy, bytes);
		assert.deepEqual(copy, bytes);
		copy[0] = 99;
		assert.equal(bytes[0], 1, "original must not be affected");
	});

	it("getBytesCopy also copies when decoding a hex string", () => {
		assert.deepEqual(getBytesCopy("0x1234"), new Uint8Array([0x12, 0x34]));
	});

	it("rejects an odd-length hex string", () => {
		assert.throws(() => getBytes("0x123"), /invalid BytesLike value/);
		assert.throws(() => getBytes("0x1"), /invalid BytesLike value/);
	});

	it("rejects a hex string without the 0x prefix", () => {
		assert.throws(() => getBytes("1234"), /invalid BytesLike value/);
		assert.throws(() => getBytes(""), /invalid BytesLike value/);
	});

	it("rejects non-hex characters", () => {
		assert.throws(() => getBytes("0xzz"), /invalid BytesLike value/);
		assert.throws(() => getBytes("0x12 34"), /invalid BytesLike value/);
	});

	it("rejects plain number arrays, numbers and nullish values", () => {
		for (const value of [[1, 2], 1234, null, undefined, {}, true]) {
			assert.throws(
				() => getBytes(value as any),
				/invalid BytesLike value/,
				String(value),
			);
		}
	});

	it("reports the caller-supplied argument name in the error", () => {
		assert.throws(
			() => getBytes("nope", "signature"),
			(err: any) => {
				assert.equal(err.code, "INVALID_ARGUMENT");
				assert.equal(err.argument, "signature");
				assert.equal(err.value, "nope");
				return true;
			},
		);
	});

	it("PINS BUG: getBytes accepts an upper-case 0X prefix that every other helper rejects", () => {
		// src.ts/utils/data.ts:85 matches /^0x[0-9a-f]*$/i, and the trailing
		// `i` makes the `0x` itself case-insensitive. isHexString
		// (src.ts/utils/data.ts:132) has no `i` flag, so the guard functions
		// disagree with the decoder: isBytesLike says "no", getBytes says
		// "yes". Any caller that guards with isBytesLike before calling
		// getBytes silently loses data that getBytes would have decoded.
		assert.deepEqual(getBytes("0XAB"), new Uint8Array([0xab]));
		assert.equal(isBytesLike("0XAB"), false);
		assert.equal(isHexString("0XAB"), false);
		assert.throws(() => hexlify("0XAB"), /invalid hexlify value/);
		// ...and dataLength happily measures it, because it falls through to
		// getBytes when isHexString fails.
		assert.equal(dataLength("0XAB"), 1);
	});

	it.skip("getBytes should treat the 0x prefix the same way isHexString does", () => {
		assert.throws(() => getBytes("0XAB"), /invalid BytesLike value/);
	});
});

describe("data: isHexString, isBytesLike and isBytes", () => {
	it("accepts any 0x-prefixed hex string when no length is given", () => {
		for (const value of ["0x", "0x0", "0x1234", "0xABCDEF", "0xaBcD"]) {
			assert.equal(isHexString(value), true, value);
		}
	});

	it("rejects strings that are not 0x-prefixed hex", () => {
		for (const value of ["", "1234", "0xZZ", "0x 12", "x1234", "0X1234"]) {
			assert.equal(isHexString(value), false, JSON.stringify(value));
		}
	});

	it("rejects non-strings outright", () => {
		for (const value of [null, undefined, 123, 0, {}, [], true, 1n]) {
			assert.equal(isHexString(value), false, String(value));
		}
		assert.equal(isHexString(new Uint8Array([1])), false);
	});

	it("checks an exact byte length when given a number", () => {
		assert.equal(isHexString("0x1234", 2), true);
		assert.equal(isHexString("0x1234", 1), false);
		assert.equal(isHexString("0x1234", 3), false);
		assert.equal(isHexString("0x1234", 0), false);
		assert.equal(isHexString("0x", 0), true);
	});

	it("checks only evenness when given true", () => {
		assert.equal(isHexString("0x", true), true);
		assert.equal(isHexString("0x1234", true), true);
		assert.equal(isHexString("0x123", true), false);
	});

	it("ignores a length of false", () => {
		assert.equal(isHexString("0x123", false), true);
		assert.equal(isHexString("0x1234", false), true);
	});

	it("isBytesLike accepts even-length hex and Uint8Array only", () => {
		assert.equal(isBytesLike("0x"), true);
		assert.equal(isBytesLike("0x1234"), true);
		assert.equal(isBytesLike(new Uint8Array([1])), true);
		assert.equal(isBytesLike(new Uint8Array([])), true);
	});

	it("isBytesLike rejects odd-length hex, bare hex and number arrays", () => {
		for (const value of [
			"0x123",
			"1234",
			"0xZZ",
			[1, 2],
			null,
			undefined,
			123,
		]) {
			assert.equal(isBytesLike(value), false, String(value));
		}
	});

	it("isBytes accepts Uint8Array and array-likes of byte values", () => {
		assert.equal(isBytes(new Uint8Array([1, 2])), true);
		assert.equal(isBytes(new Uint8Array([])), true);
		assert.equal(isBytes([]), true);
		assert.equal(isBytes([0, 1, 255]), true);
		assert.equal(isBytes({ length: 2, 0: 1, 1: 2 }), true);
	});

	it("isBytes rejects out-of-range, fractional and non-array values", () => {
		for (const value of [[256], [-1], [1.5], "0x1234", 123, null, undefined]) {
			assert.equal(isBytes(value), false, JSON.stringify(value));
		}
	});

	it("isBytes and isBytesLike deliberately disagree on plain arrays", () => {
		// isBytes is the old ethers-v5 style predicate and accepts ArrayLike;
		// isBytesLike is the v6 one and only accepts hex strings and
		// Uint8Array. Both are exported, so the difference is observable.
		assert.equal(isBytes([1, 2]), true);
		assert.equal(isBytesLike([1, 2]), false);
	});
});

describe("data: hexlify", () => {
	it("encodes a Uint8Array as lower-case hex", () => {
		assert.equal(hexlify(new Uint8Array([1, 2])), "0x0102");
		assert.equal(hexlify(new Uint8Array([0, 255])), "0x00ff");
		assert.equal(hexlify(new Uint8Array([])), "0x");
	});

	it("encodes a plain array of byte values", () => {
		assert.equal(hexlify([1, 2]), "0x0102");
		assert.equal(hexlify([]), "0x");
	});

	it("normalizes an existing hex string to lower case", () => {
		assert.equal(hexlify("0x1234"), "0x1234");
		assert.equal(hexlify("0xABCD"), "0xabcd");
	});

	it("encodes safe non-negative numbers with an even number of digits", () => {
		assert.equal(hexlify(0), "0x00");
		assert.equal(hexlify(1), "0x01");
		assert.equal(hexlify(255), "0xff");
		assert.equal(hexlify(256), "0x0100");
		assert.equal(hexlify(4095), "0x0fff");
	});

	it("encodes bigints with an even number of digits", () => {
		assert.equal(hexlify(0n), "0x00");
		assert.equal(hexlify(1n), "0x01");
		assert.equal(hexlify(255n), "0xff");
		assert.equal(hexlify(256n), "0x0100");
	});

	it("uses a Hexable object's own toHexString", () => {
		assert.equal(hexlify({ toHexString: () => "0xdead" }), "0xdead");
	});

	it("rejects an odd-length hex string unless told how to pad", () => {
		assert.throws(() => hexlify("0x123"), /hex data is odd-length/);
		assert.equal(hexlify("0x123", { hexPad: "left" }), "0x0123");
		assert.equal(hexlify("0x123", { hexPad: "right" }), "0x1230");
	});

	it("only accepts a bare hex string with allowMissingPrefix", () => {
		assert.throws(() => hexlify("1234"), /invalid hexlify value/);
		assert.equal(hexlify("1234", { allowMissingPrefix: true }), "0x1234");
	});

	it("rejects negative, fractional and unsafe numbers", () => {
		assert.throws(() => hexlify(-1), /out-of-safe-range/);
		assert.throws(() => hexlify(1.5), /non-integer/);
		assert.throws(() => hexlify(Math.pow(2, 53)), /out-of-safe-range/);
	});

	it("rejects values that are not byte-like at all", () => {
		for (const value of [{}, true, "0xZZ", "1,2"]) {
			assert.throws(
				() => hexlify(value as any),
				/invalid hexlify value/,
				String(value),
			);
		}
	});

	it("decodes this fork's comma-separated byte-list strings", () => {
		// Not an ethers feature: a "0x"-prefixed string containing commas is
		// read as a list of decimal byte values rather than as hex.
		assert.equal(hexlify("0x01,02"), "0x0102");
		assert.equal(hexlify("0x1,2,3"), "0x010203");
		assert.equal(hexlify("0x255,0"), "0xff00");
	});

	it("PINS BUG: hexlify of a negative bigint produces a non-hex string", () => {
		// src.ts/utils/data.ts:195-201 calls value.toString(16) on the bigint
		// and only fixes up the parity of the digits, so the "-" sign is
		// carried straight into what is supposed to be a DataHexString. The
		// result fails isHexString and cannot be fed back into getBytes, so
		// it corrupts any caller that concatenates it.
		assert.equal(hexlify(-1n), "0x-1");
		assert.equal(hexlify(-256n), "0x-100");
		assert.equal(hexlify(-4095n), "0x-fff");
		assert.equal(isHexString(hexlify(-1n)), false);
		assert.throws(() => getBytes(hexlify(-1n)), /invalid BytesLike value/);
		// hexlify is not even idempotent on its own output, so the value
		// cannot be passed on to anything that re-encodes it.
		assert.throws(() => hexlify(hexlify(-1n)), /invalid hexlify value/);
		assert.throws(
			() => concat(["0x12", hexlify(-1n)]),
			/invalid hexlify value/,
		);
	});

	it.skip("hexlify should reject a negative bigint", () => {
		assert.throws(() => hexlify(-1n), /invalid hexlify value/);
	});

	it("PINS BUG: hexlify throws a bare TypeError on null instead of a coded error", () => {
		// isHexable (src.ts/utils/data.ts:40) dereferences value.toHexString
		// with no null guard, so nullish input escapes before the
		// throwArgumentError at the end of hexlify. Callers that switch on
		// err.code see undefined rather than INVALID_ARGUMENT.
		for (const value of [null, undefined]) {
			assert.throws(
				() => hexlify(value as any),
				(err: any) => {
					assert.equal(err.code, undefined, "no error code is attached");
					assert.match(err.message, /Cannot read properties of/);
					assert.ok(err instanceof TypeError);
					return true;
				},
			);
		}
	});

	it.skip("hexlify should raise INVALID_ARGUMENT for nullish input", () => {
		assert.throws(
			() => hexlify(null as any),
			(err: any) => {
				assert.equal(err.code, "INVALID_ARGUMENT");
				return true;
			},
		);
	});

	it("agrees with maths on where the safe range ends", () => {
		// checkSafeUint53 excluded 0x1fffffffffffff while maths.ts treated the
		// same constant as an inclusive bound, so the largest safe integer was
		// simultaneously safe and unsafe.
		assert.equal(getNumber(Number.MAX_SAFE_INTEGER), 9007199254740991);
		assert.equal(hexlify(Number.MAX_SAFE_INTEGER), "0x1fffffffffffff");
		assert.equal(hexlify(Number.MAX_SAFE_INTEGER - 1), "0x1ffffffffffffe");
	});

	it("still rejects anything past the safe range", () => {
		for (const value of [
			Number.MAX_SAFE_INTEGER + 1,
			2 ** 54,
			Number.MAX_VALUE,
		]) {
			assert.throws(() => hexlify(value), /out-of-safe-range/, String(value));
		}
	});
});

describe("data: concat and hexConcat", () => {
	it("concatenates hex strings", () => {
		assert.equal(concat(["0x12", "0x34"]), "0x1234");
		assert.equal(concat(["0x", "0x12", "0x"]), "0x12");
	});

	it("concatenates Uint8Arrays and mixed inputs", () => {
		assert.equal(
			concat([new Uint8Array([1]), new Uint8Array([2, 3])]),
			"0x010203",
		);
		assert.equal(concat([new Uint8Array([1]), "0xff"]), "0x01ff");
	});

	it("returns 0x for an empty list and for all-empty pieces", () => {
		assert.equal(concat([]), "0x");
		assert.equal(concat(["0x", "0x"]), "0x");
	});

	it("lower-cases the pieces it splices together", () => {
		assert.equal(concat(["0xAB", "0xCD"]), "0xabcd");
	});

	it("rejects an odd-length piece", () => {
		assert.throws(() => concat(["0x1", "0x2"]), /hex data is odd-length/);
	});

	it("accepts plain byte arrays as pieces", () => {
		assert.equal(concat([[1, 2] as any]), "0x0102");
	});

	it("produces a result whose length is the sum of the parts", () => {
		const parts = ["0x0102", "0x", "0xffeedd", "0x00"];
		assert.equal(
			dataLength(concat(parts)),
			parts.reduce((sum, p) => sum + dataLength(p), 0),
		);
	});

	it("hexConcat agrees with concat", () => {
		for (const parts of [
			[] as Array<string>,
			["0x12", "0x34"],
			["0x", "0xaabb"],
		]) {
			assert.equal(hexConcat(parts), concat(parts), JSON.stringify(parts));
		}
		assert.equal(hexConcat([new Uint8Array([1, 2])]), "0x0102");
	});
});

describe("data: dataLength and hexDataLength", () => {
	it("measures hex strings in bytes", () => {
		assert.equal(dataLength("0x"), 0);
		assert.equal(dataLength("0x1234"), 2);
		assert.equal(dataLength(DATA), 5);
	});

	it("measures Uint8Arrays", () => {
		assert.equal(dataLength(new Uint8Array([])), 0);
		assert.equal(dataLength(new Uint8Array(32)), 32);
	});

	it("throws on anything that is not valid byte data", () => {
		for (const value of ["0x123", "1234", null, [1, 2], 123]) {
			assert.throws(
				() => dataLength(value as any),
				/invalid BytesLike value/,
				String(value),
			);
		}
	});

	it("hexDataLength agrees with dataLength for valid data", () => {
		for (const value of ["0x", "0x1234", DATA]) {
			assert.equal(hexDataLength(value), dataLength(value), value);
		}
		assert.equal(hexDataLength(new Uint8Array([1, 2, 3])), 3);
	});

	it("hexDataLength returns null instead of throwing for bad hex", () => {
		assert.equal(hexDataLength("0x123"), null);
		assert.equal(hexDataLength("1234"), null);
		assert.equal(hexDataLength("0xzz"), null);
	});

	it("PINS BUG: hexDataLength measures values that are not byte data at all", () => {
		// src.ts/utils/data.ts:269-271 hexlifies any non-string input before
		// measuring it, so a plain number is first encoded as hex and then
		// reported as a byte length. null takes the same path and blows up
		// inside isHexable instead of returning null like every other
		// rejection in this function does.
		assert.equal(hexDataLength(123 as any), 1, "123 -> 0x7b -> 1 byte");
		assert.equal(hexDataLength(65536 as any), 3);
		assert.equal(hexDataLength([1, 2] as any), 2);
		assert.throws(
			() => hexDataLength(null as any),
			/Cannot read properties of null/,
		);
	});

	it.skip("hexDataLength should return null for non-BytesLike input", () => {
		assert.equal(hexDataLength(123 as any), null);
		assert.equal(hexDataLength(null as any), null);
	});
});

describe("data: dataSlice and hexDataSlice", () => {
	it("returns the whole value when no bounds are given", () => {
		assert.equal(dataSlice(DATA), DATA);
		assert.equal(dataSlice("0x"), "0x");
	});

	it("slices from a start offset", () => {
		assert.equal(dataSlice(DATA, 0), DATA);
		assert.equal(dataSlice(DATA, 1), "0x23456789");
		assert.equal(dataSlice(DATA, 4), "0x89");
		assert.equal(dataSlice(DATA, 5), "0x");
	});

	it("slices between a start and an end offset", () => {
		assert.equal(dataSlice(DATA, 1, 3), "0x2345");
		assert.equal(dataSlice(DATA, 0, 1), "0x01");
		assert.equal(dataSlice(DATA, 0, 5), DATA);
	});

	it("returns 0x for an empty or inverted range", () => {
		assert.equal(dataSlice(DATA, 0, 0), "0x");
		assert.equal(dataSlice(DATA, 3, 1), "0x");
		assert.equal(dataSlice(DATA, 10), "0x");
	});

	it("slices Uint8Array input", () => {
		assert.equal(dataSlice(new Uint8Array([1, 2, 3]), 1), "0x0203");
	});

	it("throws a BUFFER_OVERRUN when the end offset is past the data", () => {
		assert.throws(
			() => dataSlice(DATA, 0, 6),
			(err: any) => {
				assert.equal(err.code, "BUFFER_OVERRUN");
				assert.match(err.message, /cannot slice beyond data bounds/);
				assert.equal(err.length, 5);
				assert.equal(err.offset, 6);
				return true;
			},
		);
	});

	it("does not bounds-check the start offset", () => {
		// Only `end` is validated; a start past the end just yields "0x".
		assert.equal(dataSlice(DATA, 99), "0x");
	});

	it("treats offsets the way Array#slice does", () => {
		// The offsets are handed straight to Uint8Array#slice, so negative
		// offsets count back from the end and fractional ones are truncated.
		assert.equal(dataSlice(DATA, -1), "0x89");
		assert.equal(dataSlice(DATA, -2), "0x6789");
		assert.equal(dataSlice(DATA, 0, -1), "0x01234567");
		assert.equal(dataSlice(DATA, 1.5), "0x23456789");
	});

	it("rejects data that is not valid byte data", () => {
		assert.throws(() => dataSlice("0x123", 0), /invalid BytesLike value/);
	});

	it("hexDataSlice agrees with dataSlice inside the bounds", () => {
		for (const [start, end] of [
			[0, undefined],
			[1, undefined],
			[1, 3],
			[0, 5],
		] as Array<[number, number | undefined]>) {
			assert.equal(
				hexDataSlice(DATA, start, end),
				dataSlice(DATA, start, end),
				`${start}..${end}`,
			);
		}
	});

	it("hexDataSlice clamps rather than throwing when out of bounds", () => {
		// Unlike dataSlice, this one works on the string and so silently
		// clamps; it is the older, laxer helper.
		assert.equal(hexDataSlice(DATA, 0, 99), DATA);
		assert.equal(hexDataSlice(DATA, 99), "0x");
	});

	it("hexDataSlice rejects invalid hex data", () => {
		assert.throws(() => hexDataSlice("0x123", 0), /invalid hexData/);
		assert.throws(() => hexDataSlice("zz", 0), /invalid hexData/);
	});

	it("hexDataSlice accepts Uint8Array input", () => {
		assert.equal(hexDataSlice(new Uint8Array([1, 2, 3]), 1), "0x0203");
	});
});

describe("data: stripZerosLeft and stripZeros", () => {
	it("removes leading zero bytes", () => {
		assert.equal(stripZerosLeft("0x000012"), "0x12");
		assert.equal(stripZerosLeft("0x0102"), "0x0102");
		assert.equal(stripZerosLeft("0x010000"), "0x010000", "trailing zeros stay");
	});

	it("reduces all-zero data to 0x", () => {
		assert.equal(stripZerosLeft("0x00"), "0x");
		assert.equal(stripZerosLeft("0x0000"), "0x");
		assert.equal(stripZerosLeft("0x"), "0x");
	});

	it("strips whole bytes, not nibbles", () => {
		// 0x0012 has a zero nibble in its second byte which must survive.
		assert.equal(stripZerosLeft("0x000012"), "0x12");
		assert.equal(stripZerosLeft("0x0012"), "0x12");
		assert.equal(stripZerosLeft("0x0f"), "0x0f");
	});

	it("accepts Uint8Array input", () => {
		assert.equal(stripZerosLeft(new Uint8Array([0, 0, 1])), "0x01");
	});

	it("rejects odd-length hex", () => {
		assert.throws(() => stripZerosLeft("0x0"), /hex data is odd-length/);
	});

	it("stripZeros returns bytes rather than a hex string", () => {
		assert.deepEqual(stripZeros("0x000012"), new Uint8Array([0x12]));
		assert.deepEqual(stripZeros("0x0102"), new Uint8Array([1, 2]));
		assert.deepEqual(
			stripZeros(new Uint8Array([0, 0, 1])),
			new Uint8Array([1]),
		);
	});

	it("stripZeros reduces all-zero data to an empty array", () => {
		for (const value of ["0x", "0x00", "0x0000"]) {
			assert.deepEqual(stripZeros(value), new Uint8Array([]), value);
		}
	});

	it("stripZeros and stripZerosLeft agree", () => {
		for (const value of ["0x000012", "0x0102", "0x", "0x0000", "0x010000"]) {
			assert.equal(hexlify(stripZeros(value)), stripZerosLeft(value), value);
		}
	});

	it("stripZeros goes through arrayify and so accepts a plain number", () => {
		assert.deepEqual(stripZeros(3 as any), new Uint8Array([3]));
	});
});

describe("data: zeroPadValue and zeroPadBytes", () => {
	it("pads on the left for values", () => {
		assert.equal(zeroPadValue("0x1234", 4), "0x00001234");
		assert.equal(zeroPadValue("0x", 3), "0x000000");
		assert.equal(zeroPadValue(new Uint8Array([1, 2]), 4), "0x00000102");
	});

	it("pads on the right for byte strings", () => {
		assert.equal(zeroPadBytes("0x1234", 4), "0x12340000");
		assert.equal(zeroPadBytes("0x", 2), "0x0000");
	});

	it("is a no-op when the data already fills the width", () => {
		assert.equal(zeroPadValue("0x1234", 2), "0x1234");
		assert.equal(zeroPadBytes("0x1234", 2), "0x1234");
		assert.equal(zeroPadValue("0x", 0), "0x");
		assert.equal(zeroPadBytes("0x", 0), "0x");
	});

	it("pads to the common 32 byte word size", () => {
		const padded = zeroPadValue("0x1234", 32);
		assert.equal(dataLength(padded), 32);
		assert.equal(padded.slice(-4), "1234");
		assert.equal(dataLength(zeroPadBytes("0x1234", 32)), 32);
		assert.equal(zeroPadBytes("0x1234", 32).slice(2, 6), "1234");
	});

	it("throws BUFFER_OVERRUN when the data is longer than the width", () => {
		for (const pad of [zeroPadValue, zeroPadBytes]) {
			assert.throws(
				() => pad("0x1234", 1),
				(err: any) => {
					assert.equal(err.code, "BUFFER_OVERRUN");
					assert.match(err.message, /padding exceeds data length/);
					return true;
				},
			);
		}
		assert.throws(() => zeroPadValue("0x01", 0), /padding exceeds data length/);
		assert.throws(
			() => zeroPadValue("0x01", -1),
			/padding exceeds data length/,
		);
	});

	it("rejects invalid byte data", () => {
		assert.throws(() => zeroPadValue("0x123", 4), /invalid BytesLike value/);
		assert.throws(() => zeroPadBytes("nope", 4), /invalid BytesLike value/);
	});

	it("left and right padding differ except for all-zero data", () => {
		assert.notEqual(zeroPadValue("0x12", 4), zeroPadBytes("0x12", 4));
		assert.equal(zeroPadValue("0x00", 4), zeroPadBytes("0x00", 4));
	});

	it("round-trips through stripZerosLeft for left padding", () => {
		for (const value of ["0x12", "0x1234", "0xff00"]) {
			assert.equal(stripZerosLeft(zeroPadValue(value, 32)), value, value);
		}
	});
});

describe("data: arrayify (fork legacy helper)", () => {
	it("decodes hex strings like getBytes", () => {
		assert.deepEqual(arrayify("0x1234"), new Uint8Array([0x12, 0x34]));
		assert.deepEqual(arrayify("0x"), new Uint8Array([]));
	});

	it("always returns a fresh array, unlike getBytes", () => {
		const bytes = new Uint8Array([1, 2]);
		assert.notEqual(arrayify(bytes), bytes);
		assert.equal(getBytes(bytes), bytes);
		assert.deepEqual(arrayify(bytes), bytes);
	});

	it("encodes safe non-negative numbers big-endian", () => {
		assert.deepEqual(arrayify(0), new Uint8Array([0]));
		assert.deepEqual(arrayify(1), new Uint8Array([1]));
		assert.deepEqual(arrayify(256), new Uint8Array([1, 0]));
		assert.deepEqual(arrayify(65535), new Uint8Array([255, 255]));
	});

	it("accepts plain byte arrays and Hexable objects", () => {
		assert.deepEqual(arrayify([1, 2]), new Uint8Array([1, 2]));
		assert.deepEqual(
			arrayify({ toHexString: () => "0xdead" }),
			new Uint8Array([0xde, 0xad]),
		);
	});

	it("honours allowMissingPrefix", () => {
		assert.deepEqual(
			arrayify("1234", { allowMissingPrefix: true }),
			new Uint8Array([0x12, 0x34]),
		);
		assert.throws(() => arrayify("1234"), /invalid arrayify value/);
	});

	it("rejects odd-length hex without padding instructions", () => {
		assert.throws(() => arrayify("0x123"), /hex data is odd-length/);
	});

	it("pads on the right correctly", () => {
		assert.deepEqual(
			arrayify("0x123", { hexPad: "right" }),
			new Uint8Array([0x12, 0x30]),
		);
	});

	it("rejects negative, fractional and unsafe numbers, and bigints", () => {
		assert.throws(() => arrayify(-1), /out-of-safe-range/);
		assert.throws(() => arrayify(1.5), /non-integer/);
		assert.throws(() => arrayify(Math.pow(2, 53)), /out-of-safe-range/);
		assert.throws(() => arrayify(1n as any), /invalid arrayify value/);
	});

	it("PINS BUG: arrayify with hexPad 'left' corrupts the data it pads", () => {
		// src.ts/utils/data.ts:430 has already stripped the "0x" into `hex`,
		// but line 433 pads with `"0x0" + hex.substring(2)`. That re-inserts a
		// literal "0x" into the digit stream *and* drops the first two real
		// digits. The pairs are then parsed with parseInt, where the bogus
		// "0x" pair becomes NaN and is coerced to 0 by Uint8Array.
		//
		// hexlify's equivalent branch (data.ts:218) is written correctly, so
		// the two helpers disagree on identical input.
		assert.deepEqual(
			arrayify("0x123", { hexPad: "left" }),
			new Uint8Array([0, 3]),
		);
		assert.equal(hexlify("0x123", { hexPad: "left" }), "0x0123");
		assert.deepEqual(
			arrayify("0xabcde", { hexPad: "left" }),
			new Uint8Array([0, 0x0c, 0xde]),
		);
		assert.deepEqual(
			arrayify("0x1", { hexPad: "left" }),
			new Uint8Array([0, 0]),
		);
	});

	it.skip("arrayify with hexPad 'left' should zero-pad the leading nibble", () => {
		assert.deepEqual(
			arrayify("0x123", { hexPad: "left" }),
			new Uint8Array([0x01, 0x23]),
		);
		assert.deepEqual(
			arrayify("0x1", { hexPad: "left" }),
			new Uint8Array([0x01]),
		);
	});

	it("PINS BUG: arrayify throws a bare TypeError on null", () => {
		// Same missing null guard in isHexable as hexlify; no error code.
		assert.throws(
			() => arrayify(null as any),
			(err: any) => {
				assert.equal(err.code, undefined);
				assert.ok(err instanceof TypeError);
				return true;
			},
		);
	});

	it.skip("arrayify should raise INVALID_ARGUMENT for nullish input", () => {
		assert.throws(
			() => arrayify(null as any),
			(err: any) => {
				assert.equal(err.code, "INVALID_ARGUMENT");
				return true;
			},
		);
	});
});

describe("maths: getBigInt", () => {
	it("passes bigints through unchanged", () => {
		assert.equal(getBigInt(1n), 1n);
		assert.equal(getBigInt(-5n), -5n);
		assert.equal(getBigInt(0n), 0n);
	});

	it("converts safe integers", () => {
		assert.equal(getBigInt(0), 0n);
		assert.equal(getBigInt(42), 42n);
		assert.equal(getBigInt(-42), -42n);
		assert.equal(getBigInt(Number.MAX_SAFE_INTEGER), 9007199254740991n);
		assert.equal(getBigInt(-Number.MAX_SAFE_INTEGER), -9007199254740991n);
	});

	it("parses decimal and 0x-prefixed strings", () => {
		assert.equal(getBigInt("0"), 0n);
		assert.equal(getBigInt("123"), 123n);
		assert.equal(getBigInt("-123"), -123n);
		assert.equal(getBigInt("0x10"), 16n);
		assert.equal(getBigInt("-0x10"), -16n);
	});

	it("also accepts the binary and octal prefixes BigInt understands", () => {
		assert.equal(getBigInt("0b101"), 5n);
		assert.equal(getBigInt("0o17"), 15n);
		assert.equal(getBigInt(" 12 "), 12n, "surrounding whitespace is trimmed");
	});

	it("rejects numbers outside the 53-bit safe range", () => {
		assert.throws(() => getBigInt(Math.pow(2, 53)), /overflow/);
		assert.throws(() => getBigInt(-Math.pow(2, 53)), /overflow/);
		assert.throws(() => getBigInt(Infinity), /value=Infinity/);
	});

	it("rejects unparseable strings", () => {
		assert.throws(
			() => getBigInt(""),
			/invalid BigNumberish string: empty string/,
		);
		assert.throws(() => getBigInt("abc"), /invalid BigNumberish string/);
		assert.throws(() => getBigInt("1.5"), /invalid BigNumberish string/);
		assert.throws(() => getBigInt("1e3"), /invalid BigNumberish string/);
		assert.throws(() => getBigInt("--5"), /invalid BigNumberish string/);
	});

	it("rejects values of the wrong type", () => {
		for (const value of [null, undefined, true, {}, []]) {
			assert.throws(
				() => getBigInt(value as any),
				/invalid BigNumberish value/,
				String(value),
			);
		}
	});

	it("reports the caller-supplied argument name", () => {
		assert.throws(
			() => getBigInt("x", "nonce"),
			(err: any) => {
				assert.equal(err.argument, "nonce");
				assert.equal(err.code, "INVALID_ARGUMENT");
				return true;
			},
		);
	});

	it("PINS BUG: a fractional number is reported as 'underflow'", () => {
		// src.ts/utils/maths.ts:104-109 uses the message "underflow" for the
		// Number.isInteger check. 1.5 is neither an underflow nor out of
		// range; the fault is that it is not an integer, and the message
		// sends anyone reading the error looking in the wrong place. The
		// identical wording is used by getNumber (maths.ts:186-191).
		assert.throws(() => getBigInt(1.5), /underflow/);
		assert.throws(() => getNumber(1.5), /underflow/);
		assert.throws(() => getBigInt(NaN), /underflow/);
	});

	it.skip("a fractional number should report a non-integer fault", () => {
		assert.throws(() => getBigInt(1.5), /non-integer/);
	});
});

describe("maths: getNumber", () => {
	it("passes safe numbers through", () => {
		assert.equal(getNumber(0), 0);
		assert.equal(getNumber(42), 42);
		assert.equal(getNumber(-42), -42);
	});

	it("narrows bigints that fit", () => {
		assert.equal(getNumber(42n), 42);
		assert.equal(getNumber(-42n), -42);
		assert.equal(getNumber(9007199254740991n), Number.MAX_SAFE_INTEGER);
	});

	it("parses strings", () => {
		assert.equal(getNumber("0"), 0);
		assert.equal(getNumber("123"), 123);
		assert.equal(getNumber("-123"), -123);
		assert.equal(getNumber("0x10"), 16);
	});

	it("rejects bigints and numbers beyond the safe range", () => {
		assert.throws(() => getNumber(9007199254740992n), /overflow/);
		assert.throws(() => getNumber(Math.pow(2, 53)), /overflow/);
		assert.throws(() => getNumber(-Math.pow(2, 53)), /overflow/);
	});

	it("rejects fractional input, including fractional strings", () => {
		assert.throws(() => getNumber(1.5), /underflow/);
		assert.throws(() => getNumber("1.5"), /invalid numeric string/);
	});

	it("rejects unparseable strings and wrong types", () => {
		assert.throws(() => getNumber(""), /invalid numeric string: empty string/);
		assert.throws(() => getNumber("abc"), /invalid numeric string/);
		for (const value of [null, undefined, true, {}]) {
			assert.throws(
				() => getNumber(value as any),
				/invalid numeric value/,
				String(value),
			);
		}
	});

	it("reports the caller-supplied argument name", () => {
		assert.throws(
			() => getNumber("x", "width"),
			(err: any) => {
				assert.equal(err.argument, "width");
				return true;
			},
		);
	});
});

describe("maths: getUint", () => {
	it("accepts zero and positive values in every accepted form", () => {
		assert.equal(getUint(0), 0n);
		assert.equal(getUint(1), 1n);
		assert.equal(getUint("0"), 0n);
		assert.equal(getUint("0x10"), 16n);
		assert.equal(getUint(1n), 1n);
	});

	it("rejects negative values with a NUMERIC_FAULT", () => {
		for (const value of [-1, "-1", -1n]) {
			assert.throws(
				() => getUint(value),
				(err: any) => {
					assert.equal(err.code, "NUMERIC_FAULT");
					assert.equal(err.operation, "getUint");
					assert.match(err.message, /unsigned value cannot be negative/);
					return true;
				},
			);
		}
	});

	it("still rejects what getBigInt rejects", () => {
		assert.throws(() => getUint(null as any), /invalid BigNumberish value/);
		assert.throws(() => getUint(1.5), /underflow/);
	});
});

describe("maths: toBigInt and toNumber", () => {
	it("reads a Uint8Array as big-endian", () => {
		assert.equal(toBigInt(new Uint8Array([1])), 1n);
		assert.equal(toBigInt(new Uint8Array([0, 1])), 1n);
		assert.equal(toBigInt(new Uint8Array([1, 0])), 256n);
		assert.equal(toBigInt(new Uint8Array([255, 255])), 65535n);
	});

	it("reads an empty Uint8Array as zero", () => {
		assert.equal(toBigInt(new Uint8Array([])), 0n);
	});

	it("falls back to getBigInt for everything else", () => {
		assert.equal(toBigInt("0x10"), 16n);
		assert.equal(toBigInt(5), 5n);
		assert.equal(toBigInt(-5), -5n, "unlike getUint, negatives are allowed");
		assert.throws(() => toBigInt("abc"), /invalid BigNumberish string/);
		assert.throws(() => toBigInt(null as any), /invalid BigNumberish value/);
	});

	it("does not treat a plain array as bytes", () => {
		assert.throws(() => toBigInt([1, 2] as any), /invalid BigNumberish value/);
	});

	it("toNumber narrows the result of toBigInt", () => {
		assert.equal(toNumber(new Uint8Array([1, 0])), 256);
		assert.equal(toNumber(new Uint8Array([])), 0);
		assert.equal(toNumber("0x10"), 16);
		assert.equal(toNumber(-5), -5);
	});

	it("toNumber throws when the bytes do not fit in a number", () => {
		assert.throws(() => toNumber(new Uint8Array(8).fill(255)), /overflow/);
	});

	it("round-trips bytes through toBigInt and toBeArray", () => {
		for (const hex of ["0x01", "0xff", "0x0100", "0xdeadbeef"]) {
			const bytes = getBytes(hex);
			assert.equal(hexlify(toBeArray(toBigInt(bytes), bytes.length)), hex, hex);
		}
	});
});

describe("maths: toBeHex", () => {
	it("encodes with an even number of digits when no width is given", () => {
		assert.equal(toBeHex(0), "0x00");
		assert.equal(toBeHex(1), "0x01");
		assert.equal(toBeHex(255), "0xff");
		assert.equal(toBeHex(256), "0x0100");
		assert.equal(toBeHex(4095), "0x0fff");
	});

	it("left-pads to the requested width", () => {
		assert.equal(toBeHex(1, 1), "0x01");
		assert.equal(toBeHex(1, 2), "0x0001");
		assert.equal(
			toBeHex(1, 32),
			"0x0000000000000000000000000000000000000000000000000000000000000001",
		);
		assert.equal(dataLength(toBeHex(1, 32)), 32);
	});

	it("returns 0x for the zero value at zero width", () => {
		assert.equal(toBeHex(0, 0), "0x");
		assert.deepEqual(getBytes(toBeHex(0, 0)), new Uint8Array([]));
	});

	it("accepts every BigNumberish form", () => {
		assert.equal(toBeHex("0x10"), "0x10");
		assert.equal(toBeHex("16"), "0x10");
		assert.equal(toBeHex(1n, 2), "0x0001");
	});

	it("throws when the value does not fit the width", () => {
		assert.throws(
			() => toBeHex(256, 1),
			(err: any) => {
				assert.equal(err.code, "NUMERIC_FAULT");
				assert.equal(err.operation, "toBeHex");
				assert.match(err.message, /value exceeds width \(1 bytes\)/);
				return true;
			},
		);
		assert.throws(() => toBeHex(1, 0), /value exceeds width \(0 bytes\)/);
	});

	it("rejects negative values", () => {
		assert.throws(() => toBeHex(-1), /unsigned value cannot be negative/);
	});

	it("rejects a fractional width", () => {
		assert.throws(
			() => toBeHex(1, 1.5),
			(err: any) => {
				assert.equal(err.argument, "width");
				return true;
			},
		);
	});

	it("always produces a valid DataHexString", () => {
		for (const value of [0, 1, 255, 256, 65535, 1n << 100n]) {
			assert.equal(isHexString(toBeHex(value), true), true, String(value));
		}
	});
});

describe("maths: toBeArray", () => {
	it("encodes big-endian with no leading zeros by default", () => {
		assert.deepEqual(toBeArray(1), new Uint8Array([1]));
		assert.deepEqual(toBeArray(255), new Uint8Array([255]));
		assert.deepEqual(toBeArray(256), new Uint8Array([1, 0]));
	});

	it("encodes zero as an empty array when no width is given", () => {
		assert.deepEqual(toBeArray(0), new Uint8Array([]));
		assert.equal(toBeArray(0).length, 0);
	});

	it("left-pads to the requested width", () => {
		assert.deepEqual(toBeArray(255, 4), new Uint8Array([0, 0, 0, 255]));
		assert.deepEqual(toBeArray(0, 4), new Uint8Array([0, 0, 0, 0]));
		assert.deepEqual(toBeArray(0, 0), new Uint8Array([]));
	});

	it("accepts strings and bigints", () => {
		assert.deepEqual(toBeArray("0x0102"), new Uint8Array([1, 2]));
		assert.deepEqual(toBeArray(258n), new Uint8Array([1, 2]));
	});

	it("throws when the value does not fit the width", () => {
		assert.throws(
			() => toBeArray(65536, 2),
			(err: any) => {
				assert.equal(err.code, "NUMERIC_FAULT");
				assert.equal(err.operation, "toBeArray");
				return true;
			},
		);
		assert.throws(() => toBeArray(1, 0), /value exceeds width \(0 bytes\)/);
	});

	it("rejects negative values", () => {
		assert.throws(() => toBeArray(-1), /unsigned value cannot be negative/);
	});

	it("agrees with toBeHex except for the zero-width encoding of zero", () => {
		for (const value of [1, 255, 256, 65535]) {
			assert.equal(hexlify(toBeArray(value)), toBeHex(value), String(value));
			assert.equal(
				hexlify(toBeArray(value, 8)),
				toBeHex(value, 8),
				String(value),
			);
		}
		// toBeArray drops zero entirely; toBeHex keeps a byte of it.
		assert.equal(hexlify(toBeArray(0)), "0x");
		assert.equal(toBeHex(0), "0x00");
	});

	it("PINS BUG: a negative width escapes as a bare RangeError", () => {
		// src.ts/utils/maths.ts:273-276 passes the width straight to the
		// Uint8Array constructor on the zero fast-path, so the engine throws
		// instead of the library's own NUMERIC_FAULT. The non-zero path does
		// raise a coded error for the same input.
		assert.throws(
			() => toBeArray(0, -1),
			(err: any) => {
				assert.equal(err.code, undefined, "no error code is attached");
				assert.match(err.message, /Invalid typed array length/);
				assert.ok(err instanceof RangeError);
				return true;
			},
		);
		assert.throws(
			() => toBeArray(1, -1),
			(err: any) => {
				assert.equal(err.code, "NUMERIC_FAULT");
				return true;
			},
		);
	});

	it.skip("a negative width should always raise NUMERIC_FAULT", () => {
		assert.throws(
			() => toBeArray(0, -1),
			(err: any) => {
				assert.equal(err.code, "NUMERIC_FAULT");
				return true;
			},
		);
	});
});

describe("maths: toQuantity", () => {
	it("drops leading zeros from byte data", () => {
		assert.equal(toQuantity("0x0012"), "0x12");
		assert.equal(toQuantity("0x000000"), "0x0");
		assert.equal(toQuantity(new Uint8Array([0, 0, 1])), "0x1");
	});

	it("encodes zero as the literal 0x0", () => {
		assert.equal(toQuantity(0), "0x0");
		assert.equal(toQuantity("0x00"), "0x0");
		assert.equal(toQuantity("0x"), "0x0");
		assert.equal(toQuantity(new Uint8Array([])), "0x0");
	});

	it("encodes numbers without padding", () => {
		assert.equal(toQuantity(1), "0x1");
		assert.equal(toQuantity(255), "0xff");
		assert.equal(toQuantity(256), "0x100");
		assert.equal(toQuantity(1n), "0x1");
	});

	it("never emits a leading zero digit except for 0x0 itself", () => {
		for (const value of [0, 1, 15, 16, 255, 256, 4095, 65536]) {
			const q = toQuantity(value);
			assert.match(q, /^0x([1-9a-f][0-9a-f]*|0)$/, `${value} -> ${q}`);
		}
	});

	it("treats a bytes-like string as data rather than as a number", () => {
		// "0x0a" is valid byte data, so it is read as bytes; "10" is not, so
		// it goes through toBeArray as a decimal number.
		assert.equal(toQuantity("0x0a"), "0xa");
		assert.equal(toQuantity("10"), "0xa");
	});

	it("rejects negatives and non-numeric values", () => {
		assert.throws(() => toQuantity(-1), /unsigned value cannot be negative/);
		assert.throws(() => toQuantity(true as any), /invalid BigNumberish value/);
	});

	it("round-trips back through getBigInt", () => {
		for (const value of [0n, 1n, 255n, 256n, 1n << 64n]) {
			assert.equal(getBigInt(toQuantity(value)), value, String(value));
		}
	});
});

describe("maths: toTwos and fromTwos", () => {
	it("encodes positive values unchanged", () => {
		assert.equal(toTwos(0, 8), 0n);
		assert.equal(toTwos(1, 8), 1n);
		assert.equal(toTwos(127, 8), 127n);
	});

	it("encodes negative values with the sign bit set", () => {
		assert.equal(toTwos(-1, 8), 255n);
		assert.equal(toTwos(-128, 8), 128n);
		assert.equal(toTwos(-5, 16), 65531n);
	});

	it("rejects values outside the signed range", () => {
		assert.throws(
			() => toTwos(128, 8),
			(err: any) => {
				assert.equal(err.code, "NUMERIC_FAULT");
				assert.equal(err.operation, "toTwos");
				assert.match(err.message, /too high/);
				return true;
			},
		);
		assert.throws(() => toTwos(-129, 8), /too low/);
	});

	it("decodes the sign bit back to a negative value", () => {
		assert.equal(fromTwos(255, 8), -1n);
		assert.equal(fromTwos(128, 8), -128n);
		assert.equal(fromTwos(127, 8), 127n);
		assert.equal(fromTwos(0, 8), 0n);
		assert.equal(fromTwos(65531, 16), -5n);
	});

	it("rejects an encoded value wider than the field", () => {
		assert.throws(
			() => fromTwos(256, 8),
			(err: any) => {
				assert.equal(err.operation, "fromTwos");
				assert.match(err.message, /overflow/);
				return true;
			},
		);
	});

	it("rejects a negative encoded value", () => {
		assert.throws(() => fromTwos(-1, 8), /unsigned value cannot be negative/);
	});

	it("round-trips every value in an 8 bit field", () => {
		for (let i = -128; i <= 127; i++) {
			assert.equal(fromTwos(toTwos(i, 8), 8), BigInt(i), String(i));
		}
	});

	it("round-trips the extremes of a 256 bit field", () => {
		const limit = 1n << 255n;
		for (const value of [0n, 1n, -1n, limit - 1n, -limit]) {
			assert.equal(fromTwos(toTwos(value, 256), 256), value, String(value));
		}
	});
});

describe("maths: mask", () => {
	it("keeps only the low bits", () => {
		assert.equal(mask(255, 4), 15n);
		assert.equal(mask(255, 8), 255n);
		assert.equal(mask(256, 8), 0n);
		assert.equal(mask("0xffff", 12), 4095n);
	});

	it("masks everything away at zero bits", () => {
		assert.equal(mask(0, 0), 0n);
		assert.equal(mask(255, 0), 0n);
	});

	it("is a no-op when the field is wider than the value", () => {
		assert.equal(mask(255, 16), 255n);
		assert.equal(mask(1n << 200n, 256), 1n << 200n);
	});

	it("rejects negative values", () => {
		assert.throws(() => mask(-1, 8), /unsigned value cannot be negative/);
	});

	it("is idempotent", () => {
		for (const value of [0, 1, 255, 65535, 1234567]) {
			assert.equal(mask(mask(value, 12), 12), mask(value, 12), String(value));
		}
	});
});

describe("FixedNumber: fromString", () => {
	it("parses whole numbers and decimals in the default fixed128x18 field", () => {
		assert.equal(FixedNumber.fromString("1").toString(), "1.0");
		assert.equal(FixedNumber.fromString("1.0").toString(), "1.0");
		assert.equal(FixedNumber.fromString("1.5").toString(), "1.5");
		assert.equal(FixedNumber.fromString("0").toString(), "0.0");
		assert.equal(FixedNumber.fromString("1").format, "fixed128x18");
	});

	it("parses negative values", () => {
		assert.equal(FixedNumber.fromString("-1.5").toString(), "-1.5");
		assert.equal(FixedNumber.fromString("-1.5").value, -1500000000000000000n);
		assert.equal(FixedNumber.fromString("-0").toString(), "0.0");
	});

	it("accepts a missing whole or decimal part", () => {
		assert.equal(FixedNumber.fromString(".5").toString(), "0.5");
		assert.equal(FixedNumber.fromString("5.").toString(), "5.0");
	});

	it("scales the value by 10^decimals", () => {
		assert.equal(FixedNumber.fromString("1").value, 1000000000000000000n);
		assert.equal(FixedNumber.fromString("1", "fixed128x2").value, 100n);
		assert.equal(FixedNumber.fromString("1.5", "fixed128x2").value, 150n);
		assert.equal(FixedNumber.fromString("1", "fixed128x0").value, 1n);
	});

	it("keeps the smallest representable decimal", () => {
		const f = FixedNumber.fromString("0.000000000000000001");
		assert.equal(f.value, 1n);
		assert.equal(f.toString(), "0.000000000000000001");
	});

	it("allows trailing zeros beyond the format's precision", () => {
		assert.equal(
			FixedNumber.fromString("1.200", "fixed128x2").toString(),
			"1.2",
		);
	});

	it("throws a NUMERIC_FAULT underflow on excess precision", () => {
		assert.throws(
			() => FixedNumber.fromString("1.234", "fixed128x2"),
			(err: any) => {
				assert.equal(err.code, "NUMERIC_FAULT");
				assert.equal(err.fault, "underflow");
				assert.equal(err.operation, "fromString");
				assert.match(err.message, /too many decimals for format/);
				return true;
			},
		);
		assert.throws(
			() => FixedNumber.fromString("0.0000000000000000001"),
			/too many decimals for format/,
		);
	});

	it("rejects strings that are not plain decimal numbers", () => {
		for (const value of [
			"",
			".",
			"-",
			"abc",
			"1.2.3",
			"1e3",
			"+1",
			"0x10",
			" 1",
		]) {
			assert.throws(
				() => FixedNumber.fromString(value),
				/invalid FixedNumber string value/,
				JSON.stringify(value),
			);
		}
	});

	it("throws on overflow of a signed field", () => {
		assert.equal(FixedNumber.fromString("127", "fixed8x0").toString(), "127");
		assert.equal(FixedNumber.fromString("-128", "fixed8x0").toString(), "-128");
		assert.throws(() => FixedNumber.fromString("128", "fixed8x0"), /overflow/);
		assert.throws(() => FixedNumber.fromString("-129", "fixed8x0"), /overflow/);
	});

	it("throws on overflow of an unsigned field, including any negative", () => {
		assert.equal(FixedNumber.fromString("255", "ufixed8x0").toString(), "255");
		assert.throws(() => FixedNumber.fromString("256", "ufixed8x0"), /overflow/);
		assert.throws(() => FixedNumber.fromString("-1", "ufixed8x0"), /overflow/);
		assert.throws(() => FixedNumber.fromString("-1.5", "ufixed"), /overflow/);
	});
});

describe("FixedNumber: format handling", () => {
	it("defaults to signed 128 bits with 18 decimals", () => {
		for (const format of [undefined, null as any, {}]) {
			const f = FixedNumber.fromString("1", format);
			assert.equal(f.format, "fixed128x18");
			assert.equal(f.signed, true);
			assert.equal(f.width, 128);
			assert.equal(f.decimals, 18);
		}
	});

	it("understands the 'fixed' and 'ufixed' aliases", () => {
		assert.equal(FixedNumber.fromString("1", "fixed").format, "fixed128x18");
		assert.equal(FixedNumber.fromString("1", "ufixed").format, "ufixed128x18");
		assert.equal(FixedNumber.fromString("1", "ufixed").signed, false);
	});

	it("parses widthxdecimals format strings", () => {
		const f = FixedNumber.fromString("1", "ufixed64x4");
		assert.equal(f.signed, false);
		assert.equal(f.width, 64);
		assert.equal(f.decimals, 4);
		assert.equal(f.format, "ufixed64x4");
	});

	it("treats a bare number as a decimal count", () => {
		assert.equal(FixedNumber.fromString("1", 2).format, "fixed128x2");
		assert.equal(FixedNumber.fromString("1", 0).format, "fixed128x0");
		assert.equal(FixedNumber.fromString("0", 80).format, "fixed128x80");
	});

	it("accepts a partial format object and fills in the defaults", () => {
		assert.equal(
			FixedNumber.fromString("1", { decimals: 3 }).format,
			"fixed128x3",
		);
		assert.equal(
			FixedNumber.fromString("1", { width: 64 }).format,
			"fixed64x18",
		);
		assert.equal(
			FixedNumber.fromString("1", { signed: false }).format,
			"ufixed128x18",
		);
	});

	it("rejects unparseable format strings", () => {
		for (const format of ["bogus", "Fixed128x18", "fixed128", "fixed_128x18"]) {
			assert.throws(
				() => FixedNumber.fromString("1", format),
				/invalid fixed format/,
				format,
			);
		}
	});

	it("rejects a width that is not byte aligned", () => {
		assert.throws(
			() => FixedNumber.fromString("1", "fixed129x18"),
			/invalid FixedNumber width \(not byte aligned\)/,
		);
		assert.throws(
			() => FixedNumber.fromString("1", { width: 12 }),
			/invalid FixedNumber width \(not byte aligned\)/,
		);
	});

	it("rejects more than 80 decimals", () => {
		assert.throws(
			() => FixedNumber.fromString("1", "fixed128x81"),
			/invalid FixedNumber decimals \(too large\)/,
		);
		assert.equal(FixedNumber.fromString("0", "fixed8x80").format, "fixed8x80");
	});

	it("rejects format object fields of the wrong type", () => {
		assert.throws(
			() => FixedNumber.fromString("1", { width: "64" } as any),
			/invalid fixed format \(width not number\)/,
		);
		assert.throws(
			() => FixedNumber.fromString("1", { signed: "no" } as any),
			/invalid fixed format \(signed not boolean\)/,
		);
		assert.throws(
			() => FixedNumber.fromString("1", { decimals: "2" } as any),
			/invalid fixed format \(decimals not number\)/,
		);
	});

	it("rejects a numeric format that is not a valid decimal count", () => {
		// The number path renders "fixed128x<n>" and re-parses it, so the
		// regex catches these.
		assert.throws(
			() => FixedNumber.fromString("0", -1),
			/invalid fixed format/,
		);
		assert.throws(
			() => FixedNumber.fromString("0", 1.5),
			/invalid fixed format/,
		);
	});

	it("PINS BUG: an object format accepts fractional and negative decimals", () => {
		// src.ts/utils/fixednumber.ts:186-191 only checks `decimals <= 80`.
		// The string and number paths are validated by the
		// /^(u?)fixed([0-9]+)x([0-9]+)$/ regex at fixednumber.ts:154, but the
		// object path at fixednumber.ts:160-178 bypasses it entirely, so
		// nonsense fields survive into the format name and into getTens.
		// The resulting toString output is not a number the class can parse
		// back with the same meaning.
		const fractional = FixedNumber.fromString("1", { decimals: 1.5 });
		assert.equal(fractional.format, "fixed128x1.5");
		assert.equal(fractional.decimals, 1.5);
		assert.equal(fractional.toString(), ".1");

		const negative = FixedNumber.fromString("1", { decimals: -1 });
		assert.equal(negative.format, "fixed128x-1");
		assert.equal(negative.toString(), "1.");

		// ...and the string form of the very same format is rejected.
		assert.throws(
			() => FixedNumber.fromString("1", "fixed128x1.5"),
			/invalid fixed format/,
		);
	});

	it.skip("an object format should require non-negative integer decimals", () => {
		assert.throws(
			() => FixedNumber.fromString("1", { decimals: 1.5 }),
			/invalid FixedNumber decimals/,
		);
		assert.throws(
			() => FixedNumber.fromString("1", { decimals: -1 }),
			/invalid FixedNumber decimals/,
		);
	});

	it("PINS BUG: a width of 0 or a negative width passes the alignment check", () => {
		// `-8 % 8 === 0` and `0 % 8 === 0`, so fixednumber.ts:180-185 lets
		// both through. The failure surfaces much later as a confusing
		// "overflow" on a value that is perfectly in range - even zero.
		assert.throws(
			() => FixedNumber.fromString("0", { width: 0 }),
			(err: any) => {
				assert.equal(err.code, "NUMERIC_FAULT");
				assert.match(err.message, /overflow/);
				return true;
			},
		);
		assert.throws(() => FixedNumber.fromString("1", { width: -8 }), /overflow/);
	});

	it.skip("a width of 0 or less should be rejected as an invalid format", () => {
		assert.throws(
			() => FixedNumber.fromString("0", { width: 0 }),
			/invalid FixedNumber width/,
		);
		assert.throws(
			() => FixedNumber.fromString("1", { width: -8 }),
			/invalid FixedNumber width/,
		);
	});

	it("keeps the constructor private", () => {
		assert.throws(
			() =>
				new (FixedNumber as any)({}, 1n, {
					signed: true,
					width: 128,
					decimals: 18,
					name: "fixed128x18",
				}),
			/private constructor/,
		);
	});
});

describe("FixedNumber: fromValue", () => {
	it("treats the value as already scaled by the given decimals", () => {
		assert.equal(FixedNumber.fromValue(42, 2).toString(), "0.42");
		assert.equal(FixedNumber.fromValue(-42, 2).toString(), "-0.42");
		assert.equal(
			FixedNumber.fromValue(1000000000000000000n, 18).toString(),
			"1.0",
		);
	});

	it("defaults to zero decimals", () => {
		assert.equal(FixedNumber.fromValue(42).toString(), "42.0");
		assert.equal(FixedNumber.fromValue(42, 0).toString(), "42.0");
	});

	it("rescales into the target format", () => {
		const f = FixedNumber.fromValue(42, 2, "fixed128x2");
		assert.equal(f.toString(), "0.42");
		assert.equal(f.value, 42n);
		assert.equal(
			FixedNumber.fromValue(4200000, 5, "fixed128x2").toString(),
			"42.0",
		);
	});

	it("throws underflow when rescaling would lose precision", () => {
		assert.throws(
			() => FixedNumber.fromValue(42, 5, "fixed128x2"),
			(err: any) => {
				assert.equal(err.code, "NUMERIC_FAULT");
				assert.equal(err.fault, "underflow");
				assert.equal(err.operation, "fromValue");
				assert.match(err.message, /value loses precision for format/);
				return true;
			},
		);
	});

	it("accepts every BigNumberish value form", () => {
		assert.equal(FixedNumber.fromValue("0x10", 1).toString(), "1.6");
		assert.equal(FixedNumber.fromValue("16", 1).toString(), "1.6");
		assert.equal(FixedNumber.fromValue(16n, 1).toString(), "1.6");
	});

	it("throws on overflow of the target format", () => {
		assert.equal(FixedNumber.fromValue(1, 0, "ufixed8x0").toString(), "1");
		assert.throws(() => FixedNumber.fromValue(256, 0, "ufixed8x0"), /overflow/);
		assert.throws(() => FixedNumber.fromValue(-1, 0, "ufixed8x0"), /overflow/);
	});

	it("rejects fractional values and decimals", () => {
		assert.throws(() => FixedNumber.fromValue(1.5), /underflow/);
		assert.throws(() => FixedNumber.fromValue(42, 1.5), /underflow/);
		assert.throws(
			() => FixedNumber.fromValue(null as any),
			/invalid BigNumberish value/,
		);
	});

	it("agrees with fromString for the same magnitude", () => {
		for (const [value, decimals, text] of [
			[150, 2, "1.5"],
			[-150, 2, "-1.5"],
			[1, 18, "0.000000000000000001"],
			[0, 2, "0.0"],
		] as Array<[number, number, string]>) {
			assert.equal(
				FixedNumber.fromValue(value, decimals).toString(),
				FixedNumber.fromString(text).toString(),
				text,
			);
		}
	});
});

describe("FixedNumber: fromBytes", () => {
	it("reads big-endian bytes as the scaled value", () => {
		assert.equal(FixedNumber.fromBytes("0x01", "fixed8x0").toString(), "1");
		assert.equal(FixedNumber.fromBytes("0x7f", "fixed8x0").toString(), "127");
		assert.equal(
			FixedNumber.fromBytes(new Uint8Array([1, 0]), "fixed16x0").toString(),
			"256",
		);
	});

	it("interprets the high bit as a sign in a signed format", () => {
		assert.equal(FixedNumber.fromBytes("0xff", "fixed8x0").toString(), "-1");
		assert.equal(FixedNumber.fromBytes("0x80", "fixed8x0").toString(), "-128");
	});

	it("keeps the high bit as magnitude in an unsigned format", () => {
		assert.equal(FixedNumber.fromBytes("0xff", "ufixed8x0").toString(), "255");
		assert.equal(FixedNumber.fromBytes("0x80", "ufixed8x0").toString(), "128");
	});

	it("applies the format's decimals to the integer it read", () => {
		assert.equal(FixedNumber.fromBytes("0x64", "fixed8x2").toString(), "1.0");
		assert.equal(FixedNumber.fromBytes("0x0102").value, 258n);
	});

	it("reads empty data as zero", () => {
		assert.equal(FixedNumber.fromBytes("0x", "fixed8x0").toString(), "0");
	});

	it("throws when the data is wider than the format", () => {
		assert.throws(
			() => FixedNumber.fromBytes("0xffff", "fixed8x0"),
			(err: any) => {
				assert.equal(err.code, "NUMERIC_FAULT");
				assert.equal(err.operation, "fromTwos");
				return true;
			},
		);
	});

	it("rejects data that is not byte-like", () => {
		assert.throws(
			() => FixedNumber.fromBytes("0x123"),
			/invalid BytesLike value/,
		);
		assert.throws(
			() => FixedNumber.fromBytes(null as any),
			/invalid BytesLike value/,
		);
	});

	it("round-trips an 8 bit signed field through toTwos", () => {
		for (let i = -128; i <= 127; i++) {
			const hex = toBeHex(toTwos(i, 8), 1);
			assert.equal(
				FixedNumber.fromBytes(hex, "fixed8x0").toString(),
				String(i),
				hex,
			);
		}
	});
});

describe("FixedNumber: arithmetic", () => {
	const a = FixedNumber.fromString("1.5");
	const b = FixedNumber.fromString("2.25");

	it("adds", () => {
		assert.equal(a.add(b).toString(), "3.75");
		assert.equal(a.add(a).toString(), "3.0");
		assert.equal(a.add(FixedNumber.fromString("0")).toString(), "1.5");
	});

	it("subtracts", () => {
		assert.equal(a.sub(b).toString(), "-0.75");
		assert.equal(b.sub(a).toString(), "0.75");
		assert.equal(a.sub(a).toString(), "0.0");
	});

	it("multiplies", () => {
		assert.equal(a.mul(b).toString(), "3.375");
		assert.equal(a.mul(FixedNumber.fromString("0")).toString(), "0.0");
		assert.equal(a.mul(FixedNumber.fromString("-2")).toString(), "-3.0");
	});

	it("divides", () => {
		assert.equal(b.div(a).toString(), "1.5");
		assert.equal(a.div(b).toString(), "0.666666666666666666");
		assert.equal(
			FixedNumber.fromString("1").div(FixedNumber.fromString("3")).toString(),
			"0.333333333333333333",
		);
	});

	it("truncates rather than rounds when dividing", () => {
		// 1/3 at 18 decimals is ...333, and 2/3 is ...666 rather than ...667.
		assert.equal(
			FixedNumber.fromString("2").div(FixedNumber.fromString("3")).toString(),
			"0.666666666666666666",
		);
	});

	it("throws a divide-by-zero fault", () => {
		for (const method of ["div", "divUnsafe", "divSignal"] as const) {
			assert.throws(
				() => a[method](FixedNumber.fromString("0")),
				(err: any) => {
					assert.equal(err.code, "NUMERIC_FAULT");
					assert.equal(err.fault, "divide-by-zero");
					return true;
				},
				method,
			);
		}
	});

	it("checks for division by zero before checking the format", () => {
		assert.throws(
			() => a.div(FixedNumber.fromString("0", "fixed128x2")),
			/division by zero/,
		);
	});

	it("refuses to mix formats", () => {
		const other = FixedNumber.fromString("1", "fixed128x2");
		for (const method of ["add", "sub", "mul", "div"] as const) {
			assert.throws(
				() => a[method](other),
				/incompatible format; use fixedNumber.toFormat/,
				method,
			);
		}
	});

	it("mulSignal succeeds when no precision is lost", () => {
		assert.equal(a.mulSignal(b).toString(), "3.375");
	});

	it("mulSignal throws when precision would be lost", () => {
		const c = FixedNumber.fromString("0.03", "fixed128x2");
		assert.throws(
			() => c.mulSignal(c),
			(err: any) => {
				assert.equal(err.fault, "underflow");
				assert.equal(err.operation, "mulSignal");
				assert.match(err.message, /precision lost during signalling mul/);
				return true;
			},
		);
		// The non-signalling variants silently underflow to zero.
		assert.equal(c.mul(c).toString(), "0.0");
		assert.equal(c.mulUnsafe(c).toString(), "0.0");
	});

	it("divSignal succeeds when the division is exact", () => {
		assert.equal(
			FixedNumber.fromString("1")
				.divSignal(FixedNumber.fromString("2"))
				.toString(),
			"0.5",
		);
	});

	it("divSignal throws when precision would be lost", () => {
		assert.throws(
			() => FixedNumber.fromString("1").divSignal(FixedNumber.fromString("3")),
			(err: any) => {
				assert.equal(err.fault, "underflow");
				assert.equal(err.operation, "divSignal");
				assert.match(err.message, /precision lost during signalling div/);
				return true;
			},
		);
	});

	it("keeps the format of the left operand", () => {
		const c = FixedNumber.fromString("1.5", "fixed64x2");
		const d = FixedNumber.fromString("2.5", "fixed64x2");
		for (const result of [c.add(d), c.sub(d), c.mul(d), c.div(d)]) {
			assert.equal(result.format, "fixed64x2");
		}
	});

	it("does not mutate its operands", () => {
		const c = FixedNumber.fromString("1.5");
		const d = FixedNumber.fromString("2.5");
		c.add(d);
		c.sub(d);
		c.mul(d);
		c.div(d);
		assert.equal(c.toString(), "1.5");
		assert.equal(d.toString(), "2.5");
	});
});

describe("FixedNumber: overflow and the unsafe variants", () => {
	const max = FixedNumber.fromString("127", "fixed8x0");
	const min = FixedNumber.fromString("-128", "fixed8x0");
	const one = FixedNumber.fromString("1", "fixed8x0");

	it("throws on signed overflow", () => {
		assert.throws(
			() => max.add(one),
			(err: any) => {
				assert.equal(err.code, "NUMERIC_FAULT");
				assert.equal(err.fault, "overflow");
				assert.equal(err.operation, "add");
				return true;
			},
		);
		assert.throws(
			() => min.sub(one),
			(err: any) => {
				assert.equal(err.operation, "sub");
				return true;
			},
		);
	});

	it("wraps instead of throwing in the unsafe variants", () => {
		assert.equal(max.addUnsafe(one).toString(), "-128");
		assert.equal(min.subUnsafe(one).toString(), "127");
	});

	it("throws on unsigned overflow and underflow", () => {
		const umax = FixedNumber.fromString("255", "ufixed8x0");
		const uzero = FixedNumber.fromString("0", "ufixed8x0");
		const uone = FixedNumber.fromString("1", "ufixed8x0");
		assert.throws(() => umax.add(uone), /overflow/);
		assert.throws(() => uzero.sub(uone), /overflow/);
		assert.equal(umax.addUnsafe(uone).toString(), "0");
		assert.equal(uzero.subUnsafe(uone).toString(), "255");
	});

	it("throws on multiplication overflow and wraps unsafely", () => {
		const hundred = FixedNumber.fromString("100", "fixed8x0");
		const two = FixedNumber.fromString("2", "fixed8x0");
		assert.throws(
			() => hundred.mul(two),
			(err: any) => {
				assert.equal(err.operation, "mul");
				return true;
			},
		);
		assert.equal(hundred.mulUnsafe(two).toString(), "-56");
	});

	it("stays inside the field after an unsafe wrap", () => {
		const wrapped = max.addUnsafe(one);
		assert.equal(wrapped.format, "fixed8x0");
		assert.ok(wrapped.value >= -128n && wrapped.value <= 127n);
	});
});

describe("FixedNumber: comparison", () => {
	const a = FixedNumber.fromString("1.5");
	const b = FixedNumber.fromString("2.25");

	it("orders with cmp", () => {
		assert.equal(a.cmp(b), -1);
		assert.equal(b.cmp(a), 1);
		assert.equal(a.cmp(a), 0);
	});

	it("exposes the usual comparison helpers", () => {
		assert.equal(a.lt(b), true);
		assert.equal(a.lte(b), true);
		assert.equal(a.gt(b), false);
		assert.equal(a.gte(b), false);
		assert.equal(a.eq(b), false);
		assert.equal(a.eq(FixedNumber.fromString("1.5")), true);
		assert.equal(a.lte(a), true);
		assert.equal(a.gte(a), true);
	});

	it("compares across formats by rescaling to the finer one", () => {
		// Unlike arithmetic, comparison does not require matching formats.
		const coarse = FixedNumber.fromString("1.5", "fixed128x2");
		assert.equal(a.cmp(coarse), 0);
		assert.equal(a.eq(coarse), true);
		assert.equal(coarse.eq(a), true);
		assert.equal(
			FixedNumber.fromString("1.51", "fixed128x2").cmp(a),
			1,
			"finer value is larger",
		);
		assert.equal(a.cmp(FixedNumber.fromString("1.51", "fixed128x2")), -1);
	});

	it("compares across widths and signedness", () => {
		assert.equal(
			FixedNumber.fromString("1", "fixed8x0").eq(
				FixedNumber.fromString("1", "fixed128x0"),
			),
			true,
		);
		assert.equal(a.eq(FixedNumber.fromString("1.5", "ufixed128x18")), true);
	});

	it("orders negative values correctly", () => {
		const neg = FixedNumber.fromString("-1.5");
		assert.equal(neg.cmp(a), -1);
		assert.equal(neg.lt(FixedNumber.fromString("0")), true);
		assert.equal(neg.cmp(FixedNumber.fromString("-2")), 1);
	});

	it("reports zero and sign", () => {
		assert.equal(FixedNumber.fromString("0").isZero(), true);
		assert.equal(FixedNumber.fromString("0.0").isZero(), true);
		assert.equal(a.isZero(), false);
		assert.equal(FixedNumber.fromString("-1").isNegative(), true);
		assert.equal(FixedNumber.fromString("0").isNegative(), false);
		assert.equal(a.isNegative(), false);
	});

	it("is a consistent total order over a sample", () => {
		const values = ["-2", "-1.5", "-0.5", "0", "0.5", "1.5", "2"].map((v) =>
			FixedNumber.fromString(v),
		);
		for (let i = 0; i < values.length; i++) {
			for (let j = 0; j < values.length; j++) {
				const expected = i < j ? -1 : i > j ? 1 : 0;
				assert.equal(
					values[i].cmp(values[j]),
					expected,
					`${values[i]} vs ${values[j]}`,
				);
			}
		}
	});
});

describe("FixedNumber: rounding", () => {
	it("round() rounds a positive value half-up to a whole number", () => {
		assert.equal(FixedNumber.fromString("1.4").round().toString(), "1.0");
		assert.equal(FixedNumber.fromString("1.5").round().toString(), "2.0");
		assert.equal(FixedNumber.fromString("1.6").round().toString(), "2.0");
		assert.equal(FixedNumber.fromString("2.5").round().toString(), "3.0");
		assert.equal(FixedNumber.fromString("0.5").round().toString(), "1.0");
		assert.equal(FixedNumber.fromString("0.4").round().toString(), "0.0");
	});

	it("round(n) rounds a positive value at n decimal places", () => {
		assert.equal(FixedNumber.fromString("1.44").round(1).toString(), "1.4");
		assert.equal(FixedNumber.fromString("1.45").round(1).toString(), "1.5");
		assert.equal(FixedNumber.fromString("1.2345").round(2).toString(), "1.23");
		assert.equal(FixedNumber.fromString("1.2355").round(3).toString(), "1.236");
		assert.equal(FixedNumber.fromString("0.05").round(1).toString(), "0.1");
	});

	it("round(n) leaves an already-representable positive value alone", () => {
		for (const value of ["1.5", "1.4", "2.5", "0.5"]) {
			assert.equal(
				FixedNumber.fromString(value).round(1).toString(),
				value,
				value,
			);
		}
	});

	it("round() returns this when there is nothing to round", () => {
		const f = FixedNumber.fromString("1.5");
		assert.equal(f.round(18), f, "same precision");
		assert.equal(f.round(20), f, "more precision than the format has");
		const whole = FixedNumber.fromString("5", "fixed128x0");
		assert.equal(whole.round(0), whole);
		assert.equal(whole.round(), whole);
	});

	it("round() can round away whole digits with a negative count", () => {
		assert.equal(FixedNumber.fromString("1.5").round(-1).toString(), "0.0");
		assert.equal(FixedNumber.fromString("14").round(-1).toString(), "10.0");
		assert.equal(FixedNumber.fromString("15").round(-1).toString(), "20.0");
	});

	it("round() throws when rounding overflows the format", () => {
		assert.throws(
			() => FixedNumber.fromString("12.7", "fixed8x1").round(0),
			(err: any) => {
				assert.equal(err.code, "NUMERIC_FAULT");
				assert.equal(err.operation, "round");
				return true;
			},
		);
	});

	it("floor() and ceiling() leave whole values alone", () => {
		for (const value of ["2.0", "-2.0", "0.0"]) {
			const f = FixedNumber.fromString(value);
			assert.equal(f.floor().toString(), value, `floor ${value}`);
			assert.equal(f.ceiling().toString(), value, `ceiling ${value}`);
		}
	});

	it("floor() rounds a positive value down", () => {
		assert.equal(FixedNumber.fromString("1.5").floor().toString(), "1.0");
		assert.equal(FixedNumber.fromString("1.9").floor().toString(), "1.0");
		assert.equal(FixedNumber.fromString("0.5").floor().toString(), "0.0");
	});

	it("floor() and ceiling() return a new instance with a zero decimal part", () => {
		const f = FixedNumber.fromString("1.5");
		assert.notEqual(f.floor(), f);
		assert.notEqual(f.ceiling(), f);
		assert.equal(f.floor().value % 1000000000000000000n, 0n);
		assert.equal(f.ceiling().value % 1000000000000000000n, 0n);
		assert.equal(f.toString(), "1.5", "original is untouched");
	});

	it("ceiling() rounds up to the next whole number", () => {
		// The +1-ulp bump used to be computed into `val` and then thrown away
		// on the next line, leaving ceiling() as plain truncation.
		assert.equal(FixedNumber.fromString("1.5").ceiling().toString(), "2.0");
		assert.equal(FixedNumber.fromString("0.5").ceiling().toString(), "1.0");
		assert.equal(FixedNumber.fromString("1.0001").ceiling().toString(), "2.0");
		assert.equal(FixedNumber.fromString("-1.5").ceiling().toString(), "-1.0");
	});

	it("floor() and ceiling() differ on a fractional value", () => {
		for (const value of ["1.5", "-1.5", "0.5", "-0.5", "1.0001"]) {
			const f = FixedNumber.fromString(value);
			assert.notEqual(f.ceiling().toString(), f.floor().toString(), value);
		}
	});

	it("floor() rounds down for negative values", () => {
		assert.equal(FixedNumber.fromString("-1.5").floor().toString(), "-2.0");
		assert.equal(FixedNumber.fromString("-1.9").floor().toString(), "-2.0");
		assert.equal(FixedNumber.fromString("-0.5").floor().toString(), "-1.0");
	});

	it("round() rounds negative values to the nearest whole number", () => {
		// The half-ulp bump is positive regardless of sign, so the quotient
		// has to be floored rather than truncated toward zero.
		assert.equal(FixedNumber.fromString("-1.4").round().toString(), "-1.0");
		assert.equal(FixedNumber.fromString("-1.6").round().toString(), "-2.0");
		assert.equal(FixedNumber.fromString("-0.6").round().toString(), "-1.0");
	});

	it("round() breaks negative ties upward, as documented", () => {
		assert.equal(FixedNumber.fromString("-1.5").round().toString(), "-1.0");
		assert.equal(FixedNumber.fromString("-0.5").round().toString(), "0.0");
		assert.equal(FixedNumber.fromString("-2.5").round().toString(), "-2.0");
	});

	it("round(n) is a no-op on an already-representable value", () => {
		for (const value of ["-1.4", "-1.5", "1.4", "1.5", "0.0"]) {
			assert.equal(
				FixedNumber.fromString(value).round(1).toString(),
				value,
				value,
			);
		}
		assert.equal(FixedNumber.fromString("-1.45").round(2).toString(), "-1.45");
	});

	it("round(n) rounds a negative value at n decimal places", () => {
		assert.equal(FixedNumber.fromString("-1.44").round(1).toString(), "-1.4");
		assert.equal(FixedNumber.fromString("-1.46").round(1).toString(), "-1.5");
		assert.equal(
			FixedNumber.fromString("-1.2345").round(2).toString(),
			"-1.23",
		);
	});
});

describe("FixedNumber: toString, toUnsafeFloat and toFormat", () => {
	it("always shows a decimal point unless the format has no decimals", () => {
		assert.equal(FixedNumber.fromString("1").toString(), "1.0");
		assert.equal(FixedNumber.fromString("0").toString(), "0.0");
		assert.equal(FixedNumber.fromString("5", "fixed8x0").toString(), "5");
		assert.equal(FixedNumber.fromString("-5", "fixed8x0").toString(), "-5");
	});

	it("trims trailing zeros but keeps one digit on each side", () => {
		assert.equal(FixedNumber.fromString("1.500").toString(), "1.5");
		assert.equal(FixedNumber.fromString("0.50").toString(), "0.5");
		assert.equal(FixedNumber.fromString("-0.5").toString(), "-0.5");
		assert.equal(FixedNumber.fromString("10.0").toString(), "10.0");
	});

	it("exposes the same text through the _value property", () => {
		const f = FixedNumber.fromString("1.5");
		assert.equal(f._value, "1.5");
		assert.equal(f._value, f.toString());
	});

	it("round-trips through fromString", () => {
		for (const value of [
			"1.5",
			"-1.5",
			"0.0",
			"1234.5678",
			"0.000000000000000001",
		]) {
			const f = FixedNumber.fromString(value);
			assert.equal(
				FixedNumber.fromString(f.toString()).toString(),
				f.toString(),
				value,
			);
		}
	});

	it("toUnsafeFloat approximates the value", () => {
		assert.equal(FixedNumber.fromString("1.5").toUnsafeFloat(), 1.5);
		assert.equal(FixedNumber.fromString("-1.5").toUnsafeFloat(), -1.5);
		assert.equal(FixedNumber.fromString("0").toUnsafeFloat(), 0);
		assert.equal(
			FixedNumber.fromString("1")
				.div(FixedNumber.fromString("3"))
				.toUnsafeFloat(),
			0.3333333333333333,
		);
	});

	it("exposes the raw scaled value and the field description", () => {
		const f = FixedNumber.fromString("1.5", "ufixed64x4");
		assert.equal(f.value, 15000n);
		assert.equal(f.format, "ufixed64x4");
		assert.equal(f.signed, false);
		assert.equal(f.width, 64);
		assert.equal(f.decimals, 4);
	});

	it("toFormat re-parses the value into another field", () => {
		const f = FixedNumber.fromString("1.5");
		const coarse = f.toFormat("fixed128x2");
		assert.equal(coarse.format, "fixed128x2");
		assert.equal(coarse.value, 150n);
		assert.equal(coarse.toString(), "1.5");
	});

	it("toFormat makes mixed-format arithmetic possible", () => {
		const a = FixedNumber.fromString("1.5");
		const b = FixedNumber.fromString("2.5", "fixed128x2");
		assert.throws(() => a.add(b), /incompatible format/);
		assert.equal(a.toFormat(b.format).add(b).toString(), "4.0");
	});

	it("toFormat throws when the value does not fit the new field", () => {
		assert.throws(
			() => FixedNumber.fromString("1.5").toFormat("fixed128x0"),
			/too many decimals for format/,
		);
		assert.throws(
			() => FixedNumber.fromString("-1.5").toFormat("ufixed128x18"),
			/overflow/,
		);
		assert.throws(
			() => FixedNumber.fromString("1000").toFormat("fixed8x0"),
			/overflow/,
		);
	});
});
