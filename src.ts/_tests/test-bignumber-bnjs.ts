/**
 *  BigNumber against BN.js.
 *
 *  Up to 1.1.x BigNumber ran on BN.js (now a dev dependency only). Every
 *  method is run here on native bigint and through the BN.js calls it used
 *  to make, over boundary and deterministic random values, and the results
 *  or errors must match.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import BN from "bn.js";

import { BigNumber, _base16To36, _base36To16 } from "../bigNumber/bigNumber.js";

function toBN(value: BigNumber): BN {
	const hex = value.toHexString();
	return hex[0] === "-"
		? new BN("-" + hex.substring(3), 16)
		: new BN(hex.substring(2), 16);
}

function fromBN(value: BN): string {
	return BigNumber.from(value.toString(10)).toHexString();
}

function outcome(fn: () => unknown): string {
	try {
		const value = fn();
		return BigNumber.isBigNumber(value)
			? value.toHexString()
			: JSON.stringify(value);
	} catch (error: any) {
		return `throws ${error.code ?? error.constructor.name}: ${
			error.shortMessage ?? error.message
		}`;
	}
}

let counter = 0;
function randomBytes(length: number): Buffer {
	const out: Buffer[] = [];
	while (Buffer.concat(out).length < length) {
		out.push(
			createHash("sha256").update(`bignumber-bnjs-${counter++}`).digest(),
		);
	}
	return Buffer.concat(out).subarray(0, length);
}

function values(): BigNumber[] {
	const out = new Set<string>();
	const add = (v: bigint) => {
		out.add(v.toString());
		out.add((-v).toString());
	};
	for (const bits of [
		0, 1, 7, 8, 9, 25, 26, 27, 51, 52, 53, 54, 64, 128, 255, 256, 257, 512,
	]) {
		const p = BigInt(2) ** BigInt(bits);
		add(p);
		add(p - BigInt(1));
		add(p + BigInt(1));
	}
	for (let i = 0; i < 40; i++) {
		const length = 1 + (randomBytes(1)[0] % 40);
		add(BigInt("0x" + randomBytes(length).toString("hex")));
	}
	return Array.from(out).map((v) => BigNumber.from(v));
}

const VALUES = values();
const WIDTHS = [
	0, 1, 2, 7, 8, 9, 16, 25, 26, 27, 52, 53, 64, 128, 255, 256, 257, 300,
];

describe("BigNumber matches BN.js", function () {
	this.timeout(60000);

	it("unary operations", () => {
		for (const a of VALUES) {
			const bn = toBN(a);
			assert.equal(
				outcome(() => a.toString()),
				outcome(() => bn.toString(10)),
			);
			assert.equal(
				outcome(() => a.isZero()),
				outcome(() => bn.isZero()),
			);
			assert.equal(BigNumber.from(a.toString()).toHexString(), a.toHexString());
		}
	});

	it("toNumber overflows exactly where BN.js did", () => {
		for (const a of VALUES) {
			let expected: string;
			try {
				expected = JSON.stringify(toBN(a).toNumber());
			} catch {
				expected = "throws NUMERIC_FAULT: overflow";
			}
			assert.equal(
				outcome(() => a.toNumber()).split(" (")[0],
				expected,
				a.toString(),
			);
		}
	});

	it("binary operations", () => {
		for (const a of VALUES) {
			for (const b of VALUES) {
				const x = toBN(a);
				const y = toBN(b);
				const label = `${a.toString()} ? ${b.toString()}`;
				assert.equal(a.add(b).toHexString(), fromBN(x.add(y)), label);
				assert.equal(a.sub(b).toHexString(), fromBN(x.sub(y)), label);
				assert.equal(a.mul(b).toHexString(), fromBN(x.mul(y)), label);
				assert.equal(
					outcome(() => a.eq(b)),
					outcome(() => x.eq(y)),
					label,
				);
				assert.equal(
					outcome(() => a.lt(b)),
					outcome(() => x.lt(y)),
					label,
				);
				assert.equal(
					outcome(() => a.lte(b)),
					outcome(() => x.lte(y)),
					label,
				);
				assert.equal(
					outcome(() => a.gt(b)),
					outcome(() => x.gt(y)),
					label,
				);
				assert.equal(
					outcome(() => a.gte(b)),
					outcome(() => x.gte(y)),
					label,
				);
				if (!b.isZero()) {
					assert.equal(a.div(b).toHexString(), fromBN(x.div(y)), label);
				}
				if (!b.isNegative()) {
					assert.equal(
						outcome(() => a.mod(b)),
						outcome(() => fromBN(x.umod(y))).replace(/^"|"$/g, ""),
						label,
					);
				}
				if (!a.isNegative() && !b.isNegative()) {
					assert.equal(a.and(b).toHexString(), fromBN(x.and(y)), label);
					assert.equal(a.or(b).toHexString(), fromBN(x.or(y)), label);
					assert.equal(a.xor(b).toHexString(), fromBN(x.xor(y)), label);
				}
			}
		}
	});

	it("pow", () => {
		for (const a of VALUES.filter((v) => v.abs().lt(BigInt(2) ** BigInt(70)))) {
			for (const e of [0, 1, 2, 3, 7, 16, 33]) {
				assert.equal(
					a.pow(e).toHexString(),
					fromBN(toBN(a).pow(new BN(e))),
					`${a.toString()} ** ${e}`,
				);
			}
		}
	});

	it("bit operations by width", () => {
		for (const a of VALUES) {
			const x = toBN(a);
			for (const w of WIDTHS) {
				const label = `${a.toString()} width ${w}`;
				const bn = (fn: () => BN) =>
					outcome(() => fromBN(fn())).replace(/^"|"$/g, "");
				assert.equal(
					outcome(() => a.toTwos(w)),
					bn(() => x.toTwos(w)),
					label,
				);
				assert.equal(
					outcome(() => a.fromTwos(w)),
					bn(() => x.fromTwos(w)),
					label,
				);
				if (!a.isNegative()) {
					assert.equal(
						outcome(() => a.mask(w)),
						bn(() => x.maskn(w)),
						label,
					);
					assert.equal(
						outcome(() => a.shl(w)),
						bn(() => x.shln(w)),
						label,
					);
					assert.equal(
						outcome(() => a.shr(w)),
						bn(() => x.shrn(w)),
						label,
					);
				}
			}
		}
	});

	it("keeps BN.js's errors for a zero modulus and bad widths", () => {
		const five = BigNumber.from(5);
		assert.throws(() => five.mod(0), { message: "Assertion failed" });
		assert.throws(() => five.fromTwos(0), { message: "Assertion failed" });
		assert.throws(() => BigNumber.from(-5).toTwos(-1), {
			message: "Assertion failed",
		});
		assert.equal(five.toTwos(-1).toString(), "5");
	});

	it("handles unusual bit counts", () => {
		const one = BigNumber.from(1);
		const ff = BigNumber.from(255);
		const failed = { message: "Assertion failed" };
		const w = (value: any) => value as number;

		// As BN.js: a string width passes fromTwos's bit test and fails elsewhere.
		assert.equal(one.fromTwos(w("8")).toString(), "1");
		assert.throws(() => ff.fromTwos(w("8")), failed);
		assert.throws(() => ff.mask(w("8")), failed);
		assert.throws(() => BigNumber.from(-1).toTwos(w("8")), failed);

		// As BN.js: NaN fails everywhere it is used.
		assert.equal(ff.toTwos(NaN).toString(), "255");
		for (const op of ["fromTwos", "mask", "shl", "shr"] as const) {
			assert.throws(() => ff[op](NaN), failed, op);
		}

		// BN.js returned wrong values for these; they now fail.
		for (const width of [1.5, Infinity]) {
			assert.throws(() => ff.fromTwos(width), failed);
			assert.throws(() => ff.mask(width), failed);
			assert.throws(() => BigNumber.from(-5).toTwos(width), failed);
		}

		// Widths above any stored value.
		assert.equal(ff.mask(2 ** 31).toString(), "255");
		assert.equal(ff.shr(2 ** 31).toString(), "0");
		assert.equal(ff.fromTwos(2 ** 31).toString(), "255");
		assert.throws(() => ff.shl(2 ** 31), RangeError);
	});

	it("base 16 and base 36 conversion", () => {
		const inputs = [
			"",
			"0",
			"00ff",
			"-ff",
			"-0",
			"a b",
			"\t1\n",
			"Z",
			"zz",
			"ZZ",
			":;<=>?@",
			"[",
			"`",
			"{",
			"0x10",
			"g",
			"G",
			"deadbeef",
			"DEADBEEF",
			"xe0000000000000000000000000000000000",
		];
		for (let i = 0; i < 30; i++) {
			inputs.push(randomBytes(1 + (i % 25)).toString("hex"));
			inputs.push(
				BigInt("0x" + randomBytes(1 + (i % 25)).toString("hex")).toString(36),
			);
		}
		for (const input of inputs) {
			assert.equal(
				outcome(() => _base36To16(input)),
				outcome(() => new BN(input, 36).toString(16)),
				`base36 ${JSON.stringify(input)}`,
			);
			assert.equal(
				outcome(() => _base16To36(input)),
				outcome(() => new BN(input, 16).toString(36)),
				`base16 ${JSON.stringify(input)}`,
			);
		}
	});
});
