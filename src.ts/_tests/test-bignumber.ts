/**
 *  BigNumber tests.
 *
 *  `BigNumber` is the older BN.js-backed number type. It is still load-bearing:
 *  `transaction/transaction.ts` uses it to decode every numeric field of a raw
 *  transaction, so its parsing and overflow behaviour is part of the
 *  transaction wire contract.
 *
 *  Most of the library has moved to native `bigint` (see `utils/maths.ts`), so
 *  the two number types are compared here where their handling differs.
 */
import assert from "node:assert/strict";

import {
	BigNumber,
	isBigNumberish,
	_base16To36,
	_base36To16,
} from "../bigNumber/bigNumber.js";

function hasCode(code: string) {
	return (err: any) => err.code === code;
}

describe("BigNumber construction", () => {
	it("parses decimal strings", () => {
		assert.equal(BigNumber.from("42").toString(), "42");
		assert.equal(BigNumber.from("-42").toString(), "-42");
		assert.equal(BigNumber.from("0").toString(), "0");
	});

	it("parses hex strings in either case", () => {
		for (const value of ["0x2a", "0x2A", "0X2a", "0X2A"]) {
			assert.equal(BigNumber.from(value).toString(), "42", value);
		}
		assert.equal(BigNumber.from("-0X2A").toString(), "-42");
		assert.equal(BigNumber.from("0xDEADBEEF").toString(), "3735928559");
	});

	it("parses safe integers", () => {
		assert.equal(BigNumber.from(42).toString(), "42");
		assert.equal(BigNumber.from(-42).toString(), "-42");
		assert.equal(BigNumber.from(0).toString(), "0");
	});

	it("parses bigints", () => {
		assert.equal(BigNumber.from(42n).toString(), "42");
		assert.equal(BigNumber.from(-42n).toString(), "-42");
		assert.equal(
			BigNumber.from(2n ** 200n).toString(),
			(2n ** 200n).toString(),
		);
	});

	it("parses byte arrays big-endian", () => {
		assert.equal(BigNumber.from(new Uint8Array([1, 2])).toString(), "258");
		assert.equal(BigNumber.from([1, 2]).toString(), "258");
		assert.equal(BigNumber.from(new Uint8Array([0, 0, 255])).toString(), "255");
	});

	it("returns the same instance when given a BigNumber", () => {
		const value = BigNumber.from(5);
		assert.equal(BigNumber.from(value), value);
	});

	it("revives its own JSON form", () => {
		const json = JSON.parse(JSON.stringify(BigNumber.from(255)));
		assert.deepEqual(json, { type: "BigNumber", hex: "0xff" });
		assert.equal(BigNumber.from(json).toString(), "255");
	});

	it("revives the legacy _hex form", () => {
		assert.equal(BigNumber.from({ _hex: "0xff" }).toString(), "255");
	});

	it("rejects malformed strings", () => {
		for (const value of [
			"",
			"abc",
			"4.2",
			"1e3",
			" 42",
			"42 ",
			"0x2g",
			"--5",
		]) {
			assert.throws(
				() => BigNumber.from(value),
				hasCode("INVALID_ARGUMENT"),
				`accepted ${JSON.stringify(value)}`,
			);
		}
	});

	it("rejects values that are not number-like at all", () => {
		for (const value of [null, undefined, true, false, {}, "0x", () => {}]) {
			assert.throws(
				() => BigNumber.from(value),
				hasCode("INVALID_ARGUMENT"),
				`accepted ${String(value)}`,
			);
		}
	});

	it("rejects a fractional number as underflow", () => {
		assert.throws(
			() => BigNumber.from(4.2),
			(err: any) => {
				assert.equal(err.code, "NUMERIC_FAULT");
				assert.equal(err.fault, "underflow");
				return true;
			},
		);
	});

	it("rejects a number beyond its safe range as overflow", () => {
		assert.throws(
			() => BigNumber.from(2 ** 53),
			(err: any) => {
				assert.equal(err.code, "NUMERIC_FAULT");
				assert.equal(err.fault, "overflow");
				return true;
			},
		);
	});

	it("cannot be constructed directly", () => {
		assert.throws(
			() => new (BigNumber as any)({}, "0x01"),
			hasCode("UNSUPPORTED_OPERATION"),
		);
	});

	it("is frozen once built", () => {
		const value = BigNumber.from(1);
		assert.throws(() => {
			(value as any)._hex = "0x99";
		}, TypeError);
	});
});

describe("BigNumber hex normalization", () => {
	it("pads to an even number of digits", () => {
		assert.equal(BigNumber.from("0xf").toHexString(), "0x0f");
		assert.equal(BigNumber.from(15).toHexString(), "0x0f");
	});

	it("trims leading zero bytes", () => {
		assert.equal(BigNumber.from("0x0000000000ff").toHexString(), "0xff");
		assert.equal(BigNumber.from("0x000f").toHexString(), "0x0f");
	});

	it("normalizes every spelling of zero to 0x00", () => {
		for (const value of ["0x0", "0x00", "-0x0", "-0x00", 0, -0, "0", "-0"]) {
			assert.equal(
				BigNumber.from(value).toHexString(),
				"0x00",
				`0x00 expected for ${String(value)}`,
			);
		}
	});

	it("lower-cases the digits", () => {
		assert.equal(BigNumber.from("0xDEADBEEF").toHexString(), "0xdeadbeef");
		assert.equal(BigNumber.from("0X2A").toHexString(), "0x2a");
	});

	it("keeps the sign outside the 0x prefix", () => {
		assert.equal(BigNumber.from(-255).toHexString(), "-0xff");
		assert.equal(BigNumber.from("-0x000f").toHexString(), "-0x0f");
	});
});

describe("BigNumber arithmetic", () => {
	const hundred = BigNumber.from(100);
	const seven = BigNumber.from(7);

	it("adds, subtracts and multiplies", () => {
		assert.equal(hundred.add(seven).toString(), "107");
		assert.equal(hundred.sub(seven).toString(), "93");
		assert.equal(hundred.mul(seven).toString(), "700");
	});

	it("divides towards zero", () => {
		assert.equal(hundred.div(seven).toString(), "14");
		assert.equal(BigNumber.from(-100).div(7).toString(), "-14");
	});

	it("rejects division by zero", () => {
		assert.throws(
			() => hundred.div(0),
			(err: any) => {
				assert.equal(err.code, "NUMERIC_FAULT");
				assert.equal(err.fault, "division by zero");
				return true;
			},
		);
	});

	it("takes a non-negative modulus", () => {
		assert.equal(hundred.mod(seven).toString(), "2");
		assert.equal(BigNumber.from(-100).mod(7).toString(), "5");
	});

	it("rejects a negative modulus", () => {
		assert.throws(() => hundred.mod(-1), hasCode("NUMERIC_FAULT"));
	});

	it("raises to a power", () => {
		assert.equal(seven.pow(3).toString(), "343");
		assert.equal(seven.pow(0).toString(), "1");
	});

	it("rejects a negative exponent", () => {
		assert.throws(() => seven.pow(-1), hasCode("NUMERIC_FAULT"));
	});

	it("takes an absolute value", () => {
		assert.equal(BigNumber.from(-5).abs().toString(), "5");
		assert.equal(BigNumber.from(5).abs().toString(), "5");
		assert.equal(BigNumber.from(0).abs().toString(), "0");
	});

	it("crosses into negative territory on subtraction", () => {
		assert.equal(seven.sub(hundred).toString(), "-93");
	});

	it("carries arbitrary precision", () => {
		const big = BigNumber.from("0x" + "ff".repeat(32));
		assert.equal(big.toString(), ((1n << 256n) - 1n).toString());
		assert.equal(big.add(1).toString(), (1n << 256n).toString());
	});
});

describe("BigNumber bitwise operations", () => {
	it("performs and, or and xor", () => {
		assert.equal(BigNumber.from(0xf0).and(0x3c).toString(), "48");
		assert.equal(BigNumber.from(0xf0).or(0x0f).toString(), "255");
		assert.equal(BigNumber.from(0xff).xor(0x0f).toString(), "240");
	});

	it("masks to a bit width", () => {
		assert.equal(BigNumber.from(0xff).mask(4).toString(), "15");
		assert.equal(BigNumber.from(0xff).mask(0).toString(), "0");
	});

	it("shifts left and right", () => {
		assert.equal(BigNumber.from(1).shl(8).toString(), "256");
		assert.equal(BigNumber.from(256).shr(8).toString(), "1");
		assert.equal(BigNumber.from(1).shr(8).toString(), "0");
	});

	it("refuses every bitwise operation on a negative operand", () => {
		// Two's-complement width is undefined for an arbitrary-precision
		// value, so these fault rather than guessing a width.
		const negative = BigNumber.from(-1);
		const positive = BigNumber.from(1);

		assert.throws(() => negative.and(1), hasCode("NUMERIC_FAULT"));
		assert.throws(() => positive.and(-1), hasCode("NUMERIC_FAULT"));
		assert.throws(() => negative.or(1), hasCode("NUMERIC_FAULT"));
		assert.throws(() => positive.or(-1), hasCode("NUMERIC_FAULT"));
		assert.throws(() => negative.xor(1), hasCode("NUMERIC_FAULT"));
		assert.throws(() => positive.xor(-1), hasCode("NUMERIC_FAULT"));
		assert.throws(() => negative.mask(4), hasCode("NUMERIC_FAULT"));
		assert.throws(() => positive.mask(-1), hasCode("NUMERIC_FAULT"));
		assert.throws(() => negative.shl(1), hasCode("NUMERIC_FAULT"));
		assert.throws(() => positive.shl(-1), hasCode("NUMERIC_FAULT"));
		assert.throws(() => negative.shr(1), hasCode("NUMERIC_FAULT"));
		assert.throws(() => positive.shr(-1), hasCode("NUMERIC_FAULT"));
	});
});

describe("BigNumber two's complement", () => {
	it("converts a negative value to its unsigned representation", () => {
		assert.equal(BigNumber.from(-1).toTwos(8).toString(), "255");
		assert.equal(BigNumber.from(-128).toTwos(8).toString(), "128");
		assert.equal(
			BigNumber.from(-1).toTwos(256).toString(),
			((1n << 256n) - 1n).toString(),
		);
	});

	it("interprets an unsigned value as signed", () => {
		assert.equal(BigNumber.from(255).fromTwos(8).toString(), "-1");
		assert.equal(BigNumber.from(127).fromTwos(8).toString(), "127");
	});

	it("round-trips across the width", () => {
		for (const value of [-128, -1, 0, 1, 127]) {
			assert.equal(
				BigNumber.from(value).toTwos(8).fromTwos(8).toString(),
				String(value),
			);
		}
	});
});

describe("BigNumber comparison", () => {
	it("compares equal, less and greater", () => {
		const hundred = BigNumber.from(100);
		assert.equal(hundred.eq(100), true);
		assert.equal(hundred.eq(7), false);
		assert.equal(hundred.lt(101), true);
		assert.equal(hundred.lte(100), true);
		assert.equal(hundred.gt(7), true);
		assert.equal(hundred.gte(100), true);
	});

	it("compares across negatives", () => {
		assert.equal(BigNumber.from(-1).lt(0), true);
		assert.equal(BigNumber.from(-1).gt(-2), true);
		assert.equal(BigNumber.from(-1).eq("-0x01"), true);
	});

	it("identifies zero and negative values", () => {
		assert.equal(BigNumber.from(0).isZero(), true);
		assert.equal(BigNumber.from(1).isZero(), false);
		assert.equal(BigNumber.from(-1).isNegative(), true);
		assert.equal(BigNumber.from(0).isNegative(), false);
		assert.equal(BigNumber.from(1).isNegative(), false);
	});
});

describe("BigNumber conversions", () => {
	it("converts to a number", () => {
		assert.equal(BigNumber.from(100).toNumber(), 100);
		assert.equal(BigNumber.from(-100).toNumber(), -100);
	});

	it("faults rather than losing precision on toNumber", () => {
		assert.throws(
			() => BigNumber.from("0x" + "ff".repeat(32)).toNumber(),
			hasCode("NUMERIC_FAULT"),
		);
	});

	it("converts to a bigint", () => {
		assert.equal(BigNumber.from(100).toBigInt(), 100n);
		assert.equal(BigNumber.from(-5).toBigInt(), -5n);
		assert.equal(
			BigNumber.from("0x" + "ff".repeat(32)).toBigInt(),
			(1n << 256n) - 1n,
		);
	});

	it("renders base 10 from toString", () => {
		assert.equal(BigNumber.from("0xff").toString(), "255");
	});

	it("rejects a radix argument to toString", () => {
		// Base 10 is tolerated with a warning since it is a no-op; any other
		// radix is an error, because callers expect it to work like Number.
		// The signature takes no arguments, so these callers have to be typed
		// loosely to reach the runtime check at all.
		const toString = (value: BigNumber, radix: number) =>
			(value.toString as (radix: number) => string).call(value, radix);

		assert.equal(toString(BigNumber.from(255), 10), "255");
		assert.throws(
			() => toString(BigNumber.from(255), 16),
			hasCode("UNEXPECTED_ARGUMENT"),
		);
		assert.throws(
			() => toString(BigNumber.from(255), 2),
			hasCode("UNEXPECTED_ARGUMENT"),
		);
	});

	it("serializes to a tagged JSON object", () => {
		assert.deepEqual(BigNumber.from(100).toJSON(), {
			type: "BigNumber",
			hex: "0x64",
		});
	});
});

describe("BigNumber type guards", () => {
	it("recognizes its own instances", () => {
		assert.equal(BigNumber.isBigNumber(BigNumber.from(1)), true);
		assert.equal(BigNumber.isBigNumber(5), false);
		assert.equal(BigNumber.isBigNumber("5"), false);
		assert.equal(BigNumber.isBigNumber(null), false);
		assert.equal(BigNumber.isBigNumber(undefined), false);
	});

	it("accepts number-like inputs in isBigNumberish", () => {
		assert.equal(isBigNumberish(1), true);
		assert.equal(isBigNumberish("1"), true);
		assert.equal(isBigNumberish("-1"), true);
		assert.equal(isBigNumberish("0x1"), true);
		assert.equal(isBigNumberish(1n), true);
		assert.equal(isBigNumberish(new Uint8Array([1])), true);
		assert.equal(isBigNumberish(BigNumber.from(1)), true);
	});

	it("rejects non-number-like inputs in isBigNumberish", () => {
		assert.equal(isBigNumberish(1.5), false);
		assert.equal(isBigNumberish("1.5"), false);
		assert.equal(isBigNumberish("abc"), false);
		assert.equal(isBigNumberish(null), false);
		assert.equal(isBigNumberish(undefined), false);
		assert.equal(isBigNumberish({}), false);
		assert.equal(isBigNumberish(true), false);
	});

	it("PINS BUG: isBigNumberish accepts empty byte input that from() rejects", () => {
		// An empty byte array hexlifies to "0x", which `from` refuses because
		// it has no digits. The guard therefore promises a conversion that
		// then throws. `transaction/transaction.ts` works around this with its
		// own `value === "0x"` check when decoding RLP, where an empty item
		// means zero.
		assert.equal(isBigNumberish([]), true);
		assert.equal(isBigNumberish(new Uint8Array([])), true);
		assert.throws(() => BigNumber.from([]), hasCode("INVALID_ARGUMENT"));
		assert.throws(
			() => BigNumber.from(new Uint8Array([])),
			hasCode("INVALID_ARGUMENT"),
		);
	});

	it.skip("treats empty byte input as zero, matching RLP", () => {
		assert.equal(BigNumber.from([]).toString(), "0");
		assert.equal(BigNumber.from(new Uint8Array([])).toString(), "0");
		assert.equal(BigNumber.from("0x").toString(), "0");
	});

	it("accepts the largest safe integer", () => {
		// The range check compared with >= against 0x1fffffffffffff, which is
		// Number.MAX_SAFE_INTEGER itself, so the boundary value was refused
		// even though it is exactly representable and hexlify accepts it.
		assert.equal(0x1fffffffffffff, Number.MAX_SAFE_INTEGER);
		assert.equal(
			BigNumber.from(Number.MAX_SAFE_INTEGER).toString(),
			"9007199254740991",
		);
		assert.equal(
			BigNumber.from(-Number.MAX_SAFE_INTEGER).toString(),
			"-9007199254740991",
		);
		assert.equal(
			BigNumber.from(Number.MAX_SAFE_INTEGER - 1).toString(),
			"9007199254740990",
		);
	});

	it("still rejects anything past the safe range", () => {
		for (const value of [
			Number.MAX_SAFE_INTEGER + 1,
			-(Number.MAX_SAFE_INTEGER + 1),
			2 ** 54,
		]) {
			assert.throws(
				() => BigNumber.from(value),
				hasCode("NUMERIC_FAULT"),
				String(value),
			);
		}
	});
});

describe("BigNumber base-36 helpers", () => {
	it("converts base 36 to base 16", () => {
		assert.equal(_base36To16("zz"), "50f");
		assert.equal(_base36To16("0"), "0");
	});

	it("converts base 16 to base 36", () => {
		assert.equal(_base16To36("ff"), "73");
		assert.equal(_base16To36("0"), "0");
	});

	it("round-trips", () => {
		assert.equal(_base36To16(_base16To36("deadbeef")), "deadbeef");
	});
});
