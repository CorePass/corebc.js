/**
 *  Core denomination tests.
 *
 *  Core's native coin is divisible to 18 decimal places, and the atomic
 *  unit is the //ore//. The named units step in thousands rather than the
 *  Ethereum ladder, and Ethereum's names must not be accepted:
 *
 *      ore     10^0    atomic
 *      fecore  10^3
 *      picore  10^6
 *      nacore  10^9
 *      mcore   10^12
 *      micore  10^15
 *      core    10^18   one XCB
 */
import assert from "node:assert/strict";

import {
	CoreSymbol,
	OrePerXCB,
	formatUnits,
	formatXCB,
	parseUnits,
	parseXCB,
} from "../index.js";

/** unit name -> decimal places */
const LADDER: Array<[string, number]> = [
	["ore", 0],
	["fecore", 3],
	["picore", 6],
	["nacore", 9],
	["mcore", 12],
	["micore", 15],
	["core", 18],
];

/** Names from Ethereum that must not resolve. */
const ETHEREUM_UNITS = [
	"wei",
	"kwei",
	"mwei",
	"gwei",
	"szabo",
	"finney",
	"ether",
	"eth",
];

describe("Core denomination ladder", () => {
	it("steps in thousands from ore up to core", () => {
		for (const [unit, decimals] of LADDER) {
			assert.equal(
				parseUnits("1", unit),
				BigInt(10) ** BigInt(decimals),
				`1 ${unit}`,
			);
		}
	});

	it("formats one core as a whole unit at every scale", () => {
		const oneCore = BigInt(10) ** BigInt(18);
		const expected: Record<string, string> = {
			ore: "1000000000000000000",
			fecore: "1000000000000000.0",
			picore: "1000000000000.0",
			nacore: "1000000000.0",
			mcore: "1000000.0",
			micore: "1000.0",
			core: "1.0",
		};
		for (const [unit] of LADDER) {
			assert.equal(formatUnits(oneCore, unit), expected[unit], unit);
		}
	});

	it("treats ore as the atomic unit with no fractional part", () => {
		assert.equal(parseUnits("1", "ore"), BigInt(1));
		// Sub-ore precision is truncated rather than rounded or rejected.
		assert.equal(parseUnits("1.9", "ore"), BigInt(1));
		assert.equal(formatUnits(BigInt(1), "ore"), "1");
	});

	it("relates core to ore through OrePerXCB", () => {
		assert.equal(OrePerXCB, BigInt("1000000000000000000"));
		assert.equal(parseUnits("1", "core"), OrePerXCB);
		assert.equal(parseXCB("1"), OrePerXCB);
	});

	it("exposes the Core currency symbol", () => {
		assert.equal(CoreSymbol, "\u039e");
		assert.equal(CoreSymbol.length, 1);
	});
});

describe("Core denominations reject Ethereum names", () => {
	it("refuses Ethereum unit names in formatUnits", () => {
		for (const unit of ETHEREUM_UNITS) {
			assert.throws(() => formatUnits(BigInt(1), unit), /invalid unit/, unit);
		}
	});

	it("refuses Ethereum unit names in parseUnits", () => {
		for (const unit of ETHEREUM_UNITS) {
			assert.throws(() => parseUnits("1", unit), /invalid unit/, unit);
		}
	});

	it("refuses unknown and mis-cased unit names", () => {
		for (const unit of ["", "Core", "ORE", "xcb", "cores", "nacores"]) {
			assert.throws(() => parseUnits("1", unit), /invalid unit/, unit);
		}
	});
});

describe("unit conversion by explicit decimals", () => {
	it("accepts a decimal count in place of a unit name", () => {
		assert.equal(parseUnits("1.5", 6), BigInt(1500000));
		assert.equal(parseUnits("1.5", 0), BigInt(1));
		assert.equal(formatUnits(BigInt(1500000), 6), "1.5");
	});

	it("defaults to 18 decimals when no unit is given", () => {
		assert.equal(parseUnits("1"), OrePerXCB);
		assert.equal(formatUnits(OrePerXCB), "1.0");
	});

	it("agrees with the named units", () => {
		for (const [unit, decimals] of LADDER) {
			assert.equal(parseUnits("2.5", unit), parseUnits("2.5", decimals), unit);
			const value = BigInt(10) ** BigInt(18);
			assert.equal(
				formatUnits(value, unit),
				formatUnits(value, decimals),
				unit,
			);
		}
	});
});

describe("XCB helpers", () => {
	it("formats and parses at 18 decimals", () => {
		assert.equal(formatXCB(OrePerXCB), "1.0");
		assert.equal(parseXCB("1.0"), OrePerXCB);
		assert.equal(formatXCB(parseXCB("1")), formatUnits(parseUnits("1"), 18));
	});

	it("round-trips decimal strings exactly", () => {
		for (const value of [
			"0.0",
			"1.0",
			"123456789.123456789",
			"0.000000000000000001",
			"-5.5",
			"-0.000000000000000001",
		]) {
			assert.equal(formatXCB(parseXCB(value)), value, value);
		}
	});

	it("handles the smallest and largest representable amounts", () => {
		assert.equal(parseXCB("0.000000000000000001"), BigInt(1), "one ore");
		assert.equal(formatXCB(BigInt(1)), "0.000000000000000001");
		assert.equal(formatXCB(BigInt(0)), "0.0");
	});
});

describe("unit conversion input handling", () => {
	it("accepts negative amounts", () => {
		assert.equal(parseUnits("-1.5", "core"), BigInt("-1500000000000000000"));
		assert.equal(formatUnits(BigInt("-1500000000000000000"), "core"), "-1.5");
	});

	it("accepts scientific notation", () => {
		assert.equal(parseUnits("1e3", "core"), BigInt(10) ** BigInt(21));
		assert.equal(parseUnits("1e-18", "core"), BigInt(1));
	});

	it("truncates precision beyond the unit's decimals", () => {
		// 19 decimal places against an 18 decimal unit: the extra digit is
		// dropped rather than rounding or throwing.
		assert.equal(
			parseUnits("1." + "1".repeat(19), "core"),
			BigInt("1111111111111111111"),
		);
		assert.equal(parseUnits("1.9999", 2), BigInt(199));
	});

	it("requires the parse input to be a string", () => {
		for (const value of [1.5, 1, BigInt(1), null, undefined, {}]) {
			assert.throws(
				() => parseUnits(value as any, "core"),
				/value must be a string/,
				String(value),
			);
		}
	});

	it("rejects strings that are not numbers", () => {
		for (const value of [
			"",
			"abc",
			"--1",
			"0x10",
			"1,5",
			"1 2",
			" 1.5",
			"1.5 ",
			"+1.5",
			"1e",
			"e5",
			"Infinity",
			"NaN",
		]) {
			assert.throws(() => parseUnits(value, "core"), /FixedNumber/, value);
		}
	});

	it("rejects input with more than one decimal point", () => {
		// Rebuilding from the first two dot-separated parts would quietly
		// turn "1.2.3" into "1.2", so a malformed amount must be refused
		// rather than parsed into a plausible-looking wrong value.
		for (const value of ["1.2.3", "1.2.3.4", "1..5", ".1.2"]) {
			assert.throws(() => parseUnits(value, "core"), /FixedNumber/, value);
			assert.throws(() => parseUnits(value, 18), /FixedNumber/, value);
			assert.throws(() => parseXCB(value), /FixedNumber/, value);
			assert.throws(() => parseUnits(value), /FixedNumber/, value);
		}
	});

	it("still truncates legitimate excess precision", () => {
		// Rejecting malformed input must not break the truncation of a single
		// over-long fraction.
		assert.equal(
			parseUnits("1." + "1".repeat(19), "core"),
			BigInt("1111111111111111111"),
		);
		assert.equal(parseUnits("1.9", "ore"), BigInt(1));
		assert.equal(parseUnits("1.9999", 2), BigInt(199));
	});

	it("accepts the full range of BigNumberish for formatting", () => {
		assert.equal(formatUnits("1000000000000000000", "core"), "1.0");
		assert.equal(formatUnits(BigInt(10) ** BigInt(18), "core"), "1.0");
		assert.equal(formatUnits(1000000, "picore"), "1.0");
	});

	it("formats very large amounts without loss", () => {
		const huge = BigInt(2) ** BigInt(255);
		const formatted = formatUnits(huge, "core");
		assert.equal(parseUnits(formatted, "core"), huge);
	});
});
