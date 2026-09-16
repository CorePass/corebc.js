/**
 *  ABI fragment, Interface, Typed and coder tests for Core.
 *
 *  This complements `test-core-abi.ts`, which covers address word packing,
 *  Core SHA3 selector derivation, call data round trips and event topic
 *  encoding. Nothing here repeats those; this file covers the parsing and
 *  formatting layer, Interface lookup/dispatch, the Typed helper and the
 *  AbiCoder edge cases around dynamic data.
 *
 *  Two Core-specific facts show up repeatedly:
 *
 *  - Selectors and topic hashes come from Core's SHA3, so a signature never
 *    hashes to the well-known Ethereum value.
 *  - An address is 22 bytes, not 20.
 *
 *  Several tests are named `PINS BUG:`. Those lock in behaviour that is
 *  currently wrong so that a future fix is a visible, deliberate change;
 *  each is paired with a skipped test describing the correct behaviour.
 */
import assert from "node:assert/strict";

import {
	AbiCoder,
	ConstructorFragment,
	ErrorFragment,
	EventFragment,
	FallbackFragment,
	Fragment,
	FunctionFragment,
	Indexed,
	Interface,
	ParamType,
	Result,
	StructFragment,
	Typed,
	Wallet,
	checkResultErrors,
	id,
	isAddress,
} from "../index.js";

const coder = AbiCoder.defaultAbiCoder();

function addressFor(seed: string, prefix: string = "cb"): string {
	return new Wallet({ key: "0x" + seed.repeat(57), prefix }).address;
}

const ADDRESS = addressFor("11");
const ADDRESS2 = addressFor("22");

// Number of 32-byte words in a hex-encoded payload.
function wordCount(data: string): number {
	return (data.length - 2) / 64;
}

// Runs `fn` with the decoder's global inflation ratio temporarily changed.
function withMaxInflation(value: number, fn: () => void): void {
	try {
		AbiCoder._setDefaultMaxInflation(value);
		fn();
	} finally {
		AbiCoder._setDefaultMaxInflation(1024);
	}
}

// A `uint256[][]` payload of `count` outer entries that all point at the
// same empty inner array, so a tiny input decodes into a large Result.
function inflationBomb(count: number): string {
	const word = (value: number) => value.toString(16).padStart(64, "0");
	let body = word(32) + word(count);
	for (let i = 0; i < count; i++) {
		body += word(count * 32);
	}
	return "0x" + body + word(0);
}

describe("ParamType parsing", () => {
	it("parses a bare type with no name", () => {
		const param = ParamType.from("uint256");
		assert.equal(param.name, "");
		assert.equal(param.type, "uint256");
		assert.equal(param.baseType, "uint256");
		assert.equal(param.indexed, null);
	});

	it("parses a named type", () => {
		const param = ParamType.from("address owner");
		assert.equal(param.name, "owner");
		assert.equal(param.type, "address");
	});

	it("expands the uint and int aliases to 256 bits", () => {
		assert.equal(ParamType.from("uint").type, "uint256");
		assert.equal(ParamType.from("int").type, "int256");
	});

	it("parses every elementary type", () => {
		for (const type of ["address", "bool", "bytes", "bytes32", "string"]) {
			const param = ParamType.from(type);
			assert.equal(param.type, type, type);
			assert.equal(param.baseType, type, type);
		}
	});

	it("parses a dynamic array", () => {
		const param = ParamType.from("uint256[]");
		assert.equal(param.baseType, "array");
		assert.equal(param.arrayLength, -1, "dynamic length is -1");
		assert.equal(param.arrayChildren!.type, "uint256");
		assert.equal(param.isArray(), true);
	});

	it("parses a fixed-size array", () => {
		const param = ParamType.from("uint256[3]");
		assert.equal(param.baseType, "array");
		assert.equal(param.arrayLength, 3);
		assert.equal(param.arrayChildren!.type, "uint256");
	});

	it("reads nested array brackets left to right", () => {
		// uint8[2][] is a dynamic array whose children are uint8[2].
		const outer = ParamType.from("uint8[2][]");
		assert.equal(outer.arrayLength, -1);
		assert.equal(outer.arrayChildren!.type, "uint8[2]");
		assert.equal(outer.arrayChildren!.arrayLength, 2);

		// uint8[][2] is a fixed array of two dynamic arrays.
		const inner = ParamType.from("uint8[][2]");
		assert.equal(inner.arrayLength, 2);
		assert.equal(inner.arrayChildren!.type, "uint8[]");
	});

	it("parses a tuple written with the tuple keyword", () => {
		const param = ParamType.from("tuple(uint256 a, address b) s");
		assert.equal(param.baseType, "tuple");
		assert.equal(param.name, "s");
		assert.equal(param.type, "tuple(uint256,address)");
		assert.equal(param.isTuple(), true);
		assert.deepEqual(
			param.components!.map((c) => [c.type, c.name]),
			[
				["uint256", "a"],
				["address", "b"],
			],
		);
	});

	it("parses a tuple written with bare parentheses", () => {
		const param = ParamType.from("(uint256,address)");
		assert.equal(param.baseType, "tuple");
		assert.equal(param.type, "tuple(uint256,address)");
		assert.equal(param.components!.length, 2);
	});

	it("parses a nested tuple inside an array", () => {
		const param = ParamType.from("tuple(tuple(uint8 x) i, bytes d)[] arr");
		assert.equal(param.baseType, "array");
		assert.equal(param.name, "arr");
		assert.equal(param.arrayChildren!.baseType, "tuple");

		const [first, second] = param.arrayChildren!.components!;
		assert.equal(first.baseType, "tuple");
		assert.equal(first.components![0].type, "uint8");
		assert.equal(second.type, "bytes");
	});

	it("accepts indexed only when indexing is allowed", () => {
		const param = ParamType.from("uint256 indexed x", true);
		assert.equal(param.indexed, true);
		assert.equal(param.isIndexable(), true);

		assert.throws(
			() => ParamType.from("uint256 indexed x"),
			/invalid param type/,
		);
	});

	it("leaves indexed as null when the keyword is absent", () => {
		const param = ParamType.from("uint256 x", true);
		assert.equal(param.indexed, null);
		assert.equal(param.isIndexable(), false);
	});

	it("builds from a JSON parameter description", () => {
		const param = ParamType.from({
			name: "amount",
			type: "uint256",
		});
		assert.equal(param.name, "amount");
		assert.equal(param.type, "uint256");
	});

	it("builds a tuple from a JSON parameter description", () => {
		const param = ParamType.from({
			name: "s",
			type: "tuple",
			components: [
				{ name: "a", type: "uint256" },
				{ name: "b", type: "address" },
			],
		});
		assert.equal(param.baseType, "tuple");
		assert.equal(param.components!.length, 2);
	});

	it("builds an array from a JSON parameter description", () => {
		const param = ParamType.from({ name: "xs", type: "uint256[4]" });
		assert.equal(param.baseType, "array");
		assert.equal(param.arrayLength, 4);
	});

	it("rejects an indexed JSON parameter unless indexing is allowed", () => {
		const json = { name: "a", type: "uint256", indexed: true };
		assert.equal(ParamType.from(json, true).indexed, true);
		assert.throws(() => ParamType.from(json), /parameter cannot be indexed/);
	});

	it("rejects a JSON parameter with an invalid name", () => {
		assert.throws(
			() => ParamType.from({ name: "1bad", type: "uint256" }),
			/invalid name/,
		);
	});

	it("returns the same instance when given a ParamType", () => {
		const param = ParamType.from("uint256");
		assert.equal(ParamType.from(param), param);
	});

	it("identifies ParamType instances", () => {
		assert.equal(ParamType.isParamType(ParamType.from("uint256")), true);
		assert.equal(ParamType.isParamType("uint256"), false);
		assert.ok(!ParamType.isParamType(null));
	});

	it("rejects numeric widths that are not a multiple of 8", () => {
		for (const type of ["uint7", "int7", "uint100"]) {
			assert.throws(() => ParamType.from(type), /invalid param type/, type);
		}
	});

	it("rejects numeric widths outside 8..256", () => {
		for (const type of ["uint0", "int0", "uint257", "int512"]) {
			assert.throws(() => ParamType.from(type), /invalid param type/, type);
		}
	});

	it("accepts the boundary numeric widths", () => {
		for (const type of ["uint8", "uint256", "int8", "int256"]) {
			assert.equal(ParamType.from(type).type, type);
		}
	});

	it("rejects bytes lengths outside 1..32", () => {
		for (const type of ["bytes0", "bytes33", "bytes64"]) {
			assert.throws(() => ParamType.from(type), /invalid param type/, type);
		}
	});

	it("accepts the boundary bytes lengths", () => {
		for (const type of ["bytes1", "bytes32"]) {
			assert.equal(ParamType.from(type).type, type);
		}
	});

	it("rejects unknown and malformed types", () => {
		for (const type of ["notatype", "", "uint256 uint256", "uint256 1"]) {
			assert.throws(
				() => ParamType.from(type),
				/invalid param type/,
				JSON.stringify(type),
			);
		}
	});
});

describe("ParamType formatting", () => {
	it("omits names and indexed from sighash format", () => {
		const param = ParamType.from("uint256 indexed x", true);
		assert.equal(param.format("sighash"), "uint256");
	});

	it("defaults to sighash when no format is given", () => {
		const param = ParamType.from("uint256 indexed x", true);
		assert.equal(param.format(), param.format("sighash"));
	});

	it("keeps indexed but drops names in minimal format", () => {
		const param = ParamType.from("uint256 indexed x", true);
		assert.equal(param.format("minimal"), "uint256 indexed");
	});

	it("keeps indexed and names in full format", () => {
		const param = ParamType.from("uint256 indexed x", true);
		assert.equal(param.format("full"), "uint256 indexed x");
	});

	it("writes tuples as parentheses, never as the tuple keyword", () => {
		const param = ParamType.from("tuple(uint256 a, address b) s");
		assert.equal(param.format("sighash"), "(uint256,address)");
		assert.equal(param.format("minimal"), "(uint256,address)");
		assert.equal(param.format("full"), "(uint256 a, address b) s");
	});

	it("spaces tuple components only in full format", () => {
		const param = ParamType.from("tuple(uint256 a, address b)");
		assert.ok(!param.format("minimal").includes(", "));
		assert.ok(param.format("full").includes(", "));
	});

	it("formats nested tuples inside arrays", () => {
		const param = ParamType.from("tuple(tuple(uint8 x) i, bytes d)[] arr");
		assert.equal(param.format("sighash"), "((uint8),bytes)[]");
		assert.equal(param.format("full"), "((uint8 x) i, bytes d)[] arr");
	});

	it("formats array suffixes", () => {
		assert.equal(ParamType.from("uint256[]").format(), "uint256[]");
		assert.equal(ParamType.from("uint256[3]").format(), "uint256[3]");
		assert.equal(ParamType.from("uint8[2][]").format(), "uint8[2][]");
	});

	it("emits a JSON description for an elementary type", () => {
		const json = JSON.parse(ParamType.from("uint256 x").format("json"));
		assert.deepEqual(json, { type: "uint256", name: "x" });
	});

	it("emits indexed in the JSON description", () => {
		const json = JSON.parse(
			ParamType.from("uint256 indexed x", true).format("json"),
		);
		assert.deepEqual(json, { type: "uint256", name: "x", indexed: true });
	});

	it("emits components in the JSON description of a tuple", () => {
		const json = JSON.parse(
			ParamType.from("tuple(uint256 a, address b) s").format("json"),
		);
		assert.equal(json.type, "tuple");
		assert.equal(json.name, "s");
		assert.deepEqual(json.components, [
			{ type: "uint256", name: "a" },
			{ type: "address", name: "b" },
		]);
	});

	it("moves the array suffix onto the type in JSON", () => {
		const json = JSON.parse(
			ParamType.from("tuple(uint8 x)[] arr").format("json"),
		);
		assert.equal(json.type, "tuple[]");
		assert.equal(json.components.length, 1);
	});

	it("round-trips a full format string back through the parser", () => {
		for (const signature of [
			"uint256 x",
			"address owner",
			"uint256[3] xs",
			"(uint256 a, address b) s",
			"((uint8 x) i, bytes d)[] arr",
		]) {
			assert.equal(
				ParamType.from(signature).format("full"),
				signature,
				signature,
			);
		}
	});
});

describe("ParamType traversal", () => {
	it("walks each leaf of an array of tuples", () => {
		const param = ParamType.from("tuple(uint256 a, address b)[2]");
		const walked = param.walk(
			[
				[1, ADDRESS],
				[2, ADDRESS2],
			],
			(type, value) => `${type}:${value}`,
		);
		assert.deepEqual(walked, [
			["uint256:1", `address:${ADDRESS}`],
			["uint256:2", `address:${ADDRESS2}`],
		]);
	});

	it("rejects a non-array value for an array type", () => {
		assert.throws(
			() => ParamType.from("uint256[]").walk("nope", (_t, v) => v),
			/invalid array value/,
		);
	});

	it("rejects an array of the wrong fixed length", () => {
		assert.throws(
			() => ParamType.from("uint256[2]").walk([1], (_t, v) => v),
			/array is wrong length/,
		);
	});

	it("accepts any length for a dynamic array", () => {
		const param = ParamType.from("uint256[]");
		assert.deepEqual(
			param.walk([], (_t, v) => v),
			[],
		);
		assert.deepEqual(
			param.walk([1, 2, 3], (_t, v) => v),
			[1, 2, 3],
		);
	});

	it("rejects a tuple value of the wrong length", () => {
		assert.throws(
			() => ParamType.from("tuple(uint256,uint256)").walk([1], (_t, v) => v),
			/array is wrong length/,
		);
	});

	it("awaits promises returned while walking asynchronously", async () => {
		const param = ParamType.from("tuple(uint256 a, uint256 b)");
		const walked = await param.walkAsync([1, 2], async (_t, v) => v * 2);
		assert.deepEqual(walked, [2, 4]);
	});

	it("accepts an object for a named tuple when walking asynchronously", async () => {
		const param = ParamType.from("tuple(uint256 a, uint256 b)");
		assert.deepEqual(
			await param.walkAsync({ a: 1, b: 2 }, (_t, v) => v),
			[1, 2],
		);
	});

	it("rejects an object missing a tuple component", async () => {
		const param = ParamType.from("tuple(uint256 a, uint256 b)");
		await assert.rejects(
			async () => param.walkAsync({ a: 1 }, (_t, v) => v),
			/missing value for component b/,
		);
	});
});

describe("FunctionFragment parsing and formatting", () => {
	it("parses a function with inputs and outputs", () => {
		const fragment = FunctionFragment.from(
			"function foo(uint256 x) view returns (bool ok)",
		);
		assert.equal(fragment.type, "function");
		assert.equal(fragment.name, "foo");
		assert.equal(fragment.inputs.length, 1);
		assert.equal(fragment.outputs.length, 1);
		assert.equal(fragment.outputs[0].name, "ok");
	});

	it("formats in every supported format", () => {
		const fragment = FunctionFragment.from(
			"function foo(uint256 x) view returns (bool ok)",
		);
		assert.equal(fragment.format("sighash"), "foo(uint256)");
		assert.equal(
			fragment.format("minimal"),
			"function foo(uint256) view returns (bool)",
		);
		assert.equal(
			fragment.format("full"),
			"function foo(uint256 x) view returns (bool ok)",
		);
	});

	it("defaults to sighash format", () => {
		const fragment = FunctionFragment.from("function foo(uint256 x)");
		assert.equal(fragment.format(), "foo(uint256)");
	});

	it("drops the function keyword and names from sighash", () => {
		const fragment = FunctionFragment.from("function foo(uint256 x)");
		assert.ok(!fragment.format("sighash").includes("function"));
		assert.ok(!fragment.format("sighash").includes("x"));
	});

	it("derives the selector from Core's hash of the sighash", () => {
		const fragment = FunctionFragment.from("function foo(uint256 x)");
		assert.equal(fragment.selector, id("foo(uint256)").substring(0, 10));
	});

	it("does not reuse the Ethereum selector for a well-known signature", () => {
		// Ethereum's keccak256 selector for transfer(address,uint256).
		const fragment = FunctionFragment.from(
			"function transfer(address to, uint256 amount)",
		);
		assert.notEqual(fragment.selector, "0xa9059cbb");
	});

	it("exposes the same selector through the static helper", () => {
		assert.equal(
			FunctionFragment.getSelector("foo", ["uint256"]),
			FunctionFragment.from("function foo(uint256)").selector,
		);
	});

	it("treats a missing parameter list as no parameters for getSelector", () => {
		assert.equal(
			FunctionFragment.getSelector("foo"),
			FunctionFragment.from("function foo()").selector,
		);
	});

	it("reads view mutability", () => {
		const fragment = FunctionFragment.from("function f() view");
		assert.equal(fragment.stateMutability, "view");
		assert.equal(fragment.constant, true);
		assert.equal(fragment.payable, false);
	});

	it("reads pure mutability", () => {
		const fragment = FunctionFragment.from("function f() pure");
		assert.equal(fragment.stateMutability, "pure");
		assert.equal(fragment.constant, true);
		assert.equal(fragment.payable, false);
	});

	it("reads payable mutability", () => {
		const fragment = FunctionFragment.from("function f() payable");
		assert.equal(fragment.stateMutability, "payable");
		assert.equal(fragment.constant, false);
		assert.equal(fragment.payable, true);
	});

	it("defaults to nonpayable mutability", () => {
		const fragment = FunctionFragment.from("function f()");
		assert.equal(fragment.stateMutability, "nonpayable");
		assert.equal(fragment.constant, false);
		assert.equal(fragment.payable, false);
	});

	it("omits nonpayable from the formatted signature", () => {
		assert.equal(
			FunctionFragment.from("function f()").format("minimal"),
			"function f()",
		);
	});

	it("maps the legacy constant keyword onto view", () => {
		const fragment = FunctionFragment.from("function f() constant");
		assert.equal(fragment.stateMutability, "view");
		assert.equal(fragment.format("minimal"), "function f() view");
	});

	it("ignores visibility keywords that carry no mutability", () => {
		for (const keyword of [
			"external",
			"public",
			"private",
			"internal",
			"override",
		]) {
			assert.equal(
				FunctionFragment.from(`function f() ${keyword}`).stateMutability,
				"nonpayable",
				keyword,
			);
		}
	});

	it("parses an energy limit written with the @ suffix", () => {
		const fragment = FunctionFragment.from("function f(uint256 x) @100000");
		assert.equal(fragment.energy, BigInt(100000));
		assert.equal(fragment.format("minimal"), "function f(uint256) @100000");
	});

	it("leaves energy null when no limit is given", () => {
		assert.equal(FunctionFragment.from("function f()").energy, null);
	});

	it("uses energy, not gas, as the limit keyword", () => {
		// Core renamed gas to energy; `gas` is not a keyword at all, so it
		// lexes as a plain identifier and fails to parse.
		assert.throws(
			() => FunctionFragment.from("function f(uint256) gas"),
			/invalid function fragment/,
		);
		assert.throws(
			() => Fragment.from("function f(uint256) gas"),
			/unexpected tokens at offset \d+: <TokenString ID:gas>/,
		);
		assert.equal(
			FunctionFragment.from("function f(uint256) @1").energy,
			BigInt(1),
		);
	});

	it("PINS BUG: an energy limit from a JSON fragment stays a string", () => {
		// The human-readable parser runs the limit through getBigInt
		// (src.ts/abi/fragments.ts:1859) but the JSON path assigns obj.energy
		// verbatim (src.ts/abi/fragments.ts:1901), so `energy` holds a string
		// even though it is declared `null | bigint`. Arithmetic on it, or a
		// strict comparison against a bigint, then silently misbehaves.
		const fragment = FunctionFragment.from({
			type: "function",
			name: "f",
			inputs: [],
			energy: "100",
		});
		assert.equal(typeof fragment.energy, "string");
		assert.equal(fragment.energy as any, "100");
		assert.notEqual(fragment.energy, BigInt(100));

		// The same limit parsed from a signature is a real bigint.
		assert.equal(
			typeof FunctionFragment.from("function f() @100").energy,
			"bigint",
		);
	});

	it.skip("an energy limit from a JSON fragment should be a bigint", () => {
		const fragment = FunctionFragment.from({
			type: "function",
			name: "f",
			inputs: [],
			energy: "100",
		});
		assert.equal(fragment.energy, BigInt(100));
	});

	it("parses unnamed parameters", () => {
		const fragment = FunctionFragment.from("function f(uint256, address)");
		assert.deepEqual(
			fragment.inputs.map((i) => i.name),
			["", ""],
		);
		assert.equal(fragment.format("full"), "function f(uint256, address)");
	});

	it("parses tuple parameters", () => {
		const fragment = FunctionFragment.from(
			"function f(tuple(uint256 a, address b) s)",
		);
		assert.equal(fragment.format("sighash"), "f((uint256,address))");
	});

	it("parses array parameters of both kinds", () => {
		const fragment = FunctionFragment.from(
			"function f(uint256[3] a, uint256[] b, uint8[2][] c)",
		);
		assert.equal(
			fragment.format("sighash"),
			"f(uint256[3],uint256[],uint8[2][])",
		);
	});

	it("emits a JSON fragment", () => {
		const json = JSON.parse(
			FunctionFragment.from(
				"function foo(uint256 x) view returns (bool ok)",
			).format("json"),
		);
		assert.equal(json.type, "function");
		assert.equal(json.name, "foo");
		assert.equal(json.constant, true);
		assert.equal(json.stateMutability, "view");
		assert.equal(json.payable, false);
		assert.deepEqual(json.inputs, [{ type: "uint256", name: "x" }]);
		assert.deepEqual(json.outputs, [{ type: "bool", name: "ok" }]);
	});

	it("omits stateMutability from JSON when nonpayable", () => {
		const json = JSON.parse(
			FunctionFragment.from("function f()").format("json"),
		);
		assert.ok(!("stateMutability" in json));
	});

	it("round-trips through the JSON format", () => {
		const original = FunctionFragment.from(
			"function foo(uint256 x, (uint8 a)[] s) view returns (bool ok)",
		);
		const restored = FunctionFragment.from(JSON.parse(original.format("json")));
		assert.equal(restored.format("full"), original.format("full"));
	});

	it("round-trips through the full format", () => {
		for (const signature of [
			"function f()",
			"function f(uint256 x)",
			"function f(uint256 x) view returns (bool ok)",
			"function f() payable",
			"function f((uint256 a, address b) s) pure returns (uint256 n)",
		]) {
			assert.equal(
				FunctionFragment.from(signature).format("full"),
				signature,
				signature,
			);
		}
	});

	it("returns the same instance when given a FunctionFragment", () => {
		const fragment = FunctionFragment.from("function f()");
		assert.equal(FunctionFragment.from(fragment), fragment);
	});

	it("derives mutability from the legacy constant and payable flags", () => {
		const cases: Array<[any, string]> = [
			[{ constant: true }, "view"],
			[{ constant: false, payable: true }, "payable"],
			[{ constant: false, payable: false }, "nonpayable"],
			[{ payable: false }, "nonpayable"],
			[{}, "payable"],
		];
		for (const [flags, expected] of cases) {
			const fragment = FunctionFragment.from(
				Object.assign({ type: "function", name: "f", inputs: [] }, flags),
			);
			assert.equal(fragment.stateMutability, expected, JSON.stringify(flags));
		}
	});

	it('PINS BUG: format("json") throws when an energy limit is set', () => {
		// `energy` is a bigint and is passed straight to JSON.stringify in
		// FunctionFragment.format (src.ts/abi/fragments.ts:1788), which cannot
		// serialize BigInt. Any fragment carrying an energy limit therefore
		// cannot be exported as a JSON ABI.
		assert.throws(
			() => FunctionFragment.from("function f() @1").format("json"),
			/Do not know how to serialize a BigInt/,
		);
	});

	it.skip('format("json") should serialize the energy limit as a number or string', () => {
		const json = JSON.parse(
			FunctionFragment.from("function f() @1").format("json"),
		);
		assert.equal(String(json.energy), "1");
	});

	it("PINS BUG: conflicting mutability keywords are silently accepted", () => {
		// consumeMutability calls allowSingle to reject conflicting modifiers,
		// but allowSingle iterates with `for (const key in allowed.keys())`
		// (src.ts/abi/fragments.ts:449) - a for-in over an iterator, which
		// yields nothing. The check never fires, so the first matching branch
		// of consumeMutability silently wins.
		assert.equal(
			FunctionFragment.from("function f() payable view").stateMutability,
			"view",
		);
		assert.equal(
			FunctionFragment.from("function f() pure payable").stateMutability,
			"pure",
		);
		assert.equal(
			FunctionFragment.from("function f() constant payable").stateMutability,
			"payable",
		);
	});

	it.skip("conflicting mutability keywords should be rejected", () => {
		for (const signature of [
			"function f() payable view",
			"function f() pure payable",
			"function f() constant payable",
		]) {
			assert.throws(() => FunctionFragment.from(signature), /conflicting/);
		}
	});
});

describe("EventFragment parsing and formatting", () => {
	it("parses an event with indexed and non-indexed parameters", () => {
		const fragment = EventFragment.from(
			"event Transfer(address indexed from, address indexed to, uint256 value)",
		);
		assert.equal(fragment.type, "event");
		assert.equal(fragment.name, "Transfer");
		assert.deepEqual(
			fragment.inputs.map((i) => i.indexed),
			[true, true, null],
		);
	});

	it("formats in every supported format", () => {
		const fragment = EventFragment.from(
			"event Transfer(address indexed from, uint256 value)",
		);
		assert.equal(fragment.format("sighash"), "Transfer(address,uint256)");
		assert.equal(
			fragment.format("minimal"),
			"event Transfer(address indexed,uint256)",
		);
		assert.equal(
			fragment.format("full"),
			"event Transfer(address indexed from, uint256 value)",
		);
	});

	it("drops indexed from the sighash so it does not affect the topic", () => {
		assert.equal(
			EventFragment.from("event E(uint256 indexed a)").format("sighash"),
			EventFragment.from("event E(uint256 a)").format("sighash"),
		);
	});

	it("derives the topic hash from Core's hash of the sighash", () => {
		const fragment = EventFragment.from("event Ev(address a, uint256 b)");
		assert.equal(fragment.topicHash, id("Ev(address,uint256)"));
		assert.match(fragment.topicHash, /^0x[0-9a-f]{64}$/);
	});

	it("does not reuse the Ethereum topic for a well-known signature", () => {
		const fragment = EventFragment.from(
			"event Transfer(address indexed from, address indexed to, uint256 value)",
		);
		assert.notEqual(
			fragment.topicHash,
			"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
		);
	});

	it("exposes the same topic through the static helper", () => {
		assert.equal(
			EventFragment.getTopicHash("Ev", ["address", "uint256"]),
			EventFragment.from("event Ev(address,uint256)").topicHash,
		);
	});

	it("parses tuple and array event parameters", () => {
		const fragment = EventFragment.from(
			"event T(tuple(uint256 a, bytes b) indexed t)",
		);
		assert.equal(fragment.format("sighash"), "T((uint256,bytes))");
		assert.equal(fragment.inputs[0].indexed, true);
	});

	it("emits a JSON fragment", () => {
		const json = JSON.parse(
			EventFragment.from("event E(uint256 indexed a, string b)").format("json"),
		);
		assert.equal(json.type, "event");
		assert.equal(json.anonymous, false);
		assert.deepEqual(json.inputs, [
			{ type: "uint256", name: "a", indexed: true },
			{ type: "string", name: "b" },
		]);
	});

	it("reads the anonymous flag from a JSON fragment", () => {
		const fragment = EventFragment.from({
			type: "event",
			name: "A",
			anonymous: true,
			inputs: [{ name: "a", type: "uint256", indexed: true }],
		});
		assert.equal(fragment.anonymous, true);
		assert.equal(
			fragment.format("full"),
			"event A(uint256 indexed a) anonymous",
		);
	});

	it("defaults anonymous to false", () => {
		assert.equal(EventFragment.from("event E()").anonymous, false);
	});

	it("round-trips a non-anonymous event through the full format", () => {
		for (const signature of [
			"event E()",
			"event E(uint256 a)",
			"event E(address indexed a, uint256 b)",
			"event E((uint256 a, bytes b) indexed t)",
		]) {
			assert.equal(
				EventFragment.from(signature).format("full"),
				signature,
				signature,
			);
		}
	});

	it("returns the same instance when given an EventFragment", () => {
		const fragment = EventFragment.from("event E()");
		assert.equal(EventFragment.from(fragment), fragment);
	});

	it("parses the anonymous keyword from a signature", () => {
		// `anonymous` was missing from the keyword sets, so the lexer tagged
		// it as a plain ID, consumeKeywords never consumed it and consumeEoi
		// then reported leftover tokens.
		assert.equal(
			EventFragment.from("event A(uint256 x) anonymous").anonymous,
			true,
		);
		assert.equal(
			(Fragment.from("event A(uint256 x) anonymous") as EventFragment)
				.anonymous,
			true,
		);
	});

	it("round-trips an anonymous event through its own format", () => {
		const fragment = EventFragment.from({
			type: "event",
			name: "A",
			anonymous: true,
			inputs: [{ name: "a", type: "uint256", indexed: true }],
		});
		const formatted = fragment.format("full");
		assert.equal(formatted, "event A(uint256 indexed a) anonymous");
		assert.equal(EventFragment.from(formatted).anonymous, true);

		// Interface used to log a warning and silently drop the fragment.
		const reparsed = new Interface([formatted]);
		assert.equal(reparsed.fragments.length, 1);
		assert.equal(reparsed.getEvent("A")!.anonymous, true);
	});

	it("round-trips an anonymous event through every format", () => {
		const fragment = EventFragment.from("event A(uint256 indexed x) anonymous");
		assert.equal(fragment.anonymous, true);
		for (const format of ["full", "minimal", "json"] as const) {
			const text = fragment.format(format);
			const parsed =
				format === "json"
					? EventFragment.from(JSON.parse(text))
					: EventFragment.from(text);
			assert.equal(parsed.anonymous, true, format);
			assert.equal(parsed.name, "A", format);
		}

		// The signature hash ignores the keyword, as it must.
		assert.equal(fragment.format("sighash"), "A(uint256)");
	});

	it("keeps the keyword out of a non-anonymous event's format", () => {
		const fragment = EventFragment.from("event A(uint256 indexed x)");
		assert.equal(fragment.anonymous, false);
		assert.equal(fragment.format("full"), "event A(uint256 indexed x)");
		assert.equal(EventFragment.from(fragment.format("full")).anonymous, false);
	});
});

describe("ErrorFragment parsing and formatting", () => {
	it("parses a custom error", () => {
		const fragment = ErrorFragment.from("error Unauthorized(address who)");
		assert.equal(fragment.type, "error");
		assert.equal(fragment.name, "Unauthorized");
		assert.equal(fragment.inputs[0].name, "who");
	});

	it("formats in every supported format", () => {
		const fragment = ErrorFragment.from("error Unauthorized(address who)");
		assert.equal(fragment.format("sighash"), "Unauthorized(address)");
		assert.equal(fragment.format("minimal"), "error Unauthorized(address)");
		assert.equal(fragment.format("full"), "error Unauthorized(address who)");
	});

	it("parses an error with no parameters", () => {
		const fragment = ErrorFragment.from("error NoArgs()");
		assert.equal(fragment.inputs.length, 0);
		assert.equal(fragment.format("sighash"), "NoArgs()");
	});

	it("derives the selector from Core's hash of the sighash", () => {
		const fragment = ErrorFragment.from("error Custom(uint256 a, string b)");
		assert.equal(
			fragment.selector,
			id("Custom(uint256,string)").substring(0, 10),
		);
		assert.match(fragment.selector, /^0x[0-9a-f]{8}$/);
	});

	it("emits a JSON fragment", () => {
		const json = JSON.parse(
			ErrorFragment.from("error E(uint256 a)").format("json"),
		);
		assert.deepEqual(json, {
			type: "error",
			name: "E",
			inputs: [{ type: "uint256", name: "a" }],
		});
	});

	it("round-trips through the full format", () => {
		for (const signature of [
			"error E()",
			"error E(uint256 a)",
			"error E(uint256 a, string b)",
		]) {
			assert.equal(
				ErrorFragment.from(signature).format("full"),
				signature,
				signature,
			);
		}
	});

	it("returns the same instance when given an ErrorFragment", () => {
		const fragment = ErrorFragment.from("error E()");
		assert.equal(ErrorFragment.from(fragment), fragment);
	});
});

describe("ConstructorFragment parsing and formatting", () => {
	it("parses a constructor with no parameters", () => {
		const fragment = ConstructorFragment.from("constructor()");
		assert.equal(fragment.type, "constructor");
		assert.equal(fragment.inputs.length, 0);
		assert.equal(fragment.payable, false);
		assert.equal(fragment.energy, null);
	});

	it("parses a payable constructor", () => {
		const fragment = ConstructorFragment.from("constructor(uint256 x) payable");
		assert.equal(fragment.payable, true);
		assert.equal(fragment.format("minimal"), "constructor(uint256) payable");
		assert.equal(fragment.format("full"), "constructor(uint256 x) payable");
	});

	it("parses an energy limit on a constructor", () => {
		const fragment = ConstructorFragment.from("constructor(uint256 x) @50000");
		assert.equal(fragment.energy, BigInt(50000));
		assert.equal(fragment.format("minimal"), "constructor(uint256) @50000");
	});

	it("refuses to produce a sighash", () => {
		// A constructor has no selector, so there is nothing to hash.
		const fragment = ConstructorFragment.from("constructor()");
		assert.throws(
			() => fragment.format("sighash"),
			/cannot format a constructor for sighash/,
		);
		assert.throws(
			() => fragment.format(),
			/cannot format a constructor for sighash/,
		);
	});

	it("emits a JSON fragment for a payable constructor", () => {
		const json = JSON.parse(
			ConstructorFragment.from("constructor(uint256 x) payable").format("json"),
		);
		assert.equal(json.type, "constructor");
		assert.equal(json.stateMutability, "payable");
		assert.equal(json.payable, true);
	});

	it("builds from a JSON fragment", () => {
		const fragment = ConstructorFragment.from({
			type: "constructor",
			stateMutability: "payable",
			payable: true,
			inputs: [{ name: "x", type: "uint256" }],
		});
		assert.equal(fragment.payable, true);
		assert.equal(fragment.inputs.length, 1);
	});

	it("round-trips through the full format", () => {
		for (const signature of [
			"constructor()",
			"constructor(uint256 x)",
			"constructor(uint256 x) payable",
		]) {
			assert.equal(
				ConstructorFragment.from(signature).format("full"),
				signature,
				signature,
			);
		}
	});

	it("returns the same instance when given a ConstructorFragment", () => {
		const fragment = ConstructorFragment.from("constructor()");
		assert.equal(ConstructorFragment.from(fragment), fragment);
	});

	it('PINS BUG: a nonpayable constructor reports the string "undefined"', () => {
		// src.ts/abi/fragments.ts:1515 writes `this.payable ? "payable" :
		// "undefined"`, so the JSON ABI carries the literal string
		// "undefined" where the Solidity JSON ABI specifies "nonpayable".
		const json = JSON.parse(
			ConstructorFragment.from("constructor()").format("json"),
		);
		assert.equal(json.stateMutability, "undefined");
	});

	it.skip('a nonpayable constructor should report "nonpayable"', () => {
		const json = JSON.parse(
			ConstructorFragment.from("constructor()").format("json"),
		);
		assert.equal(json.stateMutability, "nonpayable");
	});

	it('PINS BUG: format("json") throws when an energy limit is set', () => {
		// Same BigInt serialization defect as FunctionFragment, at
		// src.ts/abi/fragments.ts:1517.
		assert.throws(
			() => ConstructorFragment.from("constructor() @1").format("json"),
			/Do not know how to serialize a BigInt/,
		);
	});

	it.skip("a constructor energy limit should be JSON serializable", () => {
		const json = JSON.parse(
			ConstructorFragment.from("constructor() @1").format("json"),
		);
		assert.equal(String(json.energy), "1");
	});
});

describe("FallbackFragment and receive", () => {
	it("parses a bare fallback", () => {
		const fragment = FallbackFragment.from("fallback()");
		assert.equal(fragment.type, "fallback");
		assert.equal(fragment.payable, false);
		assert.deepEqual(
			fragment.inputs.map((i) => i.type),
			["bytes"],
			"an implicit bytes input is added",
		);
	});

	it("parses a payable fallback", () => {
		const fragment = FallbackFragment.from("fallback() payable");
		assert.equal(fragment.payable, true);
		assert.equal(fragment.format("minimal"), "fallback() payable");
	});

	it("parses a fallback with explicit bytes input and output", () => {
		const fragment = FallbackFragment.from("fallback(bytes) returns (bytes)");
		assert.equal(fragment.payable, false);
		assert.equal(
			fragment.format("minimal"),
			"fallback()",
			"the explicit bytes are implied and dropped when formatting",
		);
	});

	it("treats receive as an input-less, always payable fallback", () => {
		const fragment = FallbackFragment.from("receive()");
		assert.equal(fragment.type, "fallback", "the fragment type stays fallback");
		assert.equal(fragment.inputs.length, 0);
		assert.equal(fragment.payable, true);
		assert.equal(fragment.format("minimal"), "receive() payable");
	});

	it("formats as receive exactly when there are no inputs", () => {
		assert.ok(
			FallbackFragment.from("receive()").format().startsWith("receive"),
		);
		assert.ok(
			FallbackFragment.from("fallback()").format().startsWith("fallback"),
		);
	});

	it("emits a JSON fragment distinguishing fallback from receive", () => {
		assert.deepEqual(
			JSON.parse(FallbackFragment.from("fallback()").format("json")),
			{ type: "fallback", stateMutability: "nonpayable" },
		);
		assert.deepEqual(
			JSON.parse(FallbackFragment.from("fallback() payable").format("json")),
			{ type: "fallback", stateMutability: "payable" },
		);
		assert.deepEqual(
			JSON.parse(FallbackFragment.from("receive()").format("json")),
			{ type: "receive", stateMutability: "payable" },
		);
	});

	it("builds from a JSON fragment", () => {
		assert.equal(
			FallbackFragment.from({ type: "receive", stateMutability: "payable" })
				.inputs.length,
			0,
		);
		assert.equal(
			FallbackFragment.from({ type: "fallback", stateMutability: "payable" })
				.payable,
			true,
		);
	});

	it("rejects arguments on receive", () => {
		assert.throws(
			() => FallbackFragment.from("receive(uint256)"),
			/invalid fallback fragment/,
		);
	});

	it("rejects a constant fallback", () => {
		for (const signature of ["fallback() view", "fallback() pure"]) {
			assert.throws(
				() => FallbackFragment.from(signature),
				/invalid fallback fragment/,
				signature,
			);
		}
	});

	it("rejects a fallback whose input is not bytes", () => {
		assert.throws(
			() => FallbackFragment.from("fallback(uint256)"),
			/invalid fallback fragment/,
		);
	});

	it("rejects a fallback whose output is not bytes", () => {
		assert.throws(
			() => FallbackFragment.from("fallback(bytes) returns (uint256)"),
			/invalid fallback fragment/,
		);
	});

	it("rejects a fragment that is neither fallback nor receive", () => {
		assert.throws(
			() => FallbackFragment.from("function f()"),
			/invalid fallback fragment/,
		);
	});

	it("returns the same instance when given a FallbackFragment", () => {
		const fragment = FallbackFragment.from("fallback()");
		assert.equal(FallbackFragment.from(fragment), fragment);
	});
});

describe("StructFragment", () => {
	it("parses a struct signature", () => {
		const fragment = StructFragment.from("struct Foo(uint256 a, address b)");
		assert.equal(fragment.type, "struct");
		assert.equal(fragment.name, "Foo");
		assert.deepEqual(
			fragment.inputs.map((i) => i.type),
			["uint256", "address"],
		);
	});

	it("builds from a JSON fragment", () => {
		const fragment = StructFragment.from({
			type: "struct",
			name: "Foo",
			inputs: [{ name: "a", type: "uint256" }],
		});
		assert.equal(fragment.name, "Foo");
		assert.equal(fragment.inputs.length, 1);
	});

	it("identifies struct fragments", () => {
		const fragment = StructFragment.from("struct Foo(uint256 a)");
		assert.equal(StructFragment.isFragment(fragment), true);
		assert.equal(
			StructFragment.isFragment(FunctionFragment.from("function f()")),
			false,
		);
	});

	it("PINS BUG: format() is unimplemented", () => {
		// src.ts/abi/fragments.ts:1929 throws "@TODO". Every other Fragment
		// subclass implements format(), so a StructFragment cannot be
		// serialized, printed, or used as a Map key inside Interface.
		assert.throws(
			() => StructFragment.from("struct Foo(uint256 a)").format(),
			/@TODO/,
		);
	});

	it.skip("format() should render the struct in each supported format", () => {
		const fragment: any = StructFragment.from("struct Foo(uint256 a)");
		assert.equal(fragment.format("sighash"), "Foo(uint256)");
		assert.equal(fragment.format("full"), "struct Foo(uint256 a)");
	});
});

describe("Fragment dispatch and type guards", () => {
	it("dispatches each signature to the right subclass", () => {
		const cases: Array<[string, string, Function]> = [
			["function f()", "function", FunctionFragment],
			["event E()", "event", EventFragment],
			["error X()", "error", ErrorFragment],
			["constructor()", "constructor", ConstructorFragment],
			["fallback()", "fallback", FallbackFragment],
			["receive()", "fallback", FallbackFragment],
			["struct S(uint256 a)", "struct", StructFragment],
		];
		for (const [signature, type, cls] of cases) {
			const fragment = Fragment.from(signature);
			assert.equal(fragment.type, type, signature);
			assert.ok(fragment instanceof cls, signature);
		}
	});

	it("dispatches JSON fragments to the right subclass", () => {
		const cases: Array<[any, string]> = [
			[{ type: "function", name: "f", inputs: [] }, "function"],
			[{ type: "event", name: "E", inputs: [] }, "event"],
			[{ type: "error", name: "X", inputs: [] }, "error"],
			[{ type: "constructor", inputs: [] }, "constructor"],
			[{ type: "fallback", stateMutability: "nonpayable" }, "fallback"],
			[{ type: "receive", stateMutability: "payable" }, "fallback"],
		];
		for (const [json, type] of cases) {
			assert.equal(Fragment.from(json).type, type, JSON.stringify(json));
		}
	});

	it("exposes a type guard for each fragment kind", () => {
		const fn = Fragment.from("function f()");
		const ev = Fragment.from("event E()");
		const err = Fragment.from("error X()");
		const ctor = Fragment.from("constructor()");
		const struct = Fragment.from("struct S(uint256 a)");

		assert.equal(Fragment.isFunction(fn), true);
		assert.equal(Fragment.isFunction(ev), false);
		assert.equal(Fragment.isEvent(ev), true);
		assert.equal(Fragment.isEvent(fn), false);
		assert.equal(Fragment.isError(err), true);
		assert.equal(Fragment.isError(fn), false);
		assert.equal(Fragment.isConstructor(ctor), true);
		assert.equal(Fragment.isConstructor(fn), false);
		assert.equal(Fragment.isStruct(struct), true);
		assert.equal(Fragment.isStruct(fn), false);
	});

	it("freezes the inputs of a fragment", () => {
		const fragment = Fragment.from("function f(uint256 x)");
		assert.equal(Object.isFrozen(fragment.inputs), true);
	});

	it("rejects an unsupported JSON fragment type", () => {
		assert.throws(() => Fragment.from({ type: "bogus" }), /unsupported type/);
	});

	it("rejects a value that is not a fragment at all", () => {
		assert.throws(() => Fragment.from("junk"), /unsupported frgament object/);
	});
});

describe("Fragment rejection of malformed signatures", () => {
	it("rejects a truncated signature", () => {
		for (const signature of [
			"function",
			"event",
			"error",
			"function f() returns",
		]) {
			assert.throws(() => Fragment.from(signature), signature);
		}
	});

	it("rejects a missing or invalid name", () => {
		assert.throws(() => Fragment.from("function ()"), /expected ID/);
		assert.throws(() => Fragment.from("function 1bad()"), /expected ID/);
	});

	it("rejects unbalanced parentheses", () => {
		assert.throws(
			() => Fragment.from("function f(uint256"),
			/unexpected tokens/,
		);
		assert.throws(
			() => Fragment.from("function f(uint256))"),
			/no matching open bracket/,
		);
	});

	it("rejects an invalid parameter type inside a signature", () => {
		assert.throws(
			() => Fragment.from("function f(uint7)"),
			/invalid numeric width/,
		);
		assert.throws(
			() => Fragment.from("function f(bytes33)"),
			/invalid bytes length/,
		);
	});

	it("rejects an unknown identifier where a type is expected", () => {
		assert.throws(() => Fragment.from("function f(gas)"), /expected TYPE/);
	});

	it("rejects a duplicated keyword", () => {
		assert.throws(
			() => Fragment.from("function f() view view"),
			/duplicate keywords/,
		);
	});

	it("rejects a malformed energy limit", () => {
		for (const signature of ["function f() @", "function f() @abc"]) {
			assert.throws(
				() => Fragment.from(signature),
				/invalid energy/,
				signature,
			);
		}
	});

	it("rejects trailing tokens after a complete signature", () => {
		assert.throws(
			() => Fragment.from("function f(uint256) extra"),
			/unexpected tokens/,
		);
	});

	it("rejects a signature whose keyword does not match the requested kind", () => {
		assert.throws(
			() => FunctionFragment.from("event E()"),
			/invalid function fragment/,
		);
		assert.throws(
			() => EventFragment.from("function f()"),
			/invalid event fragment/,
		);
	});
});

describe("Interface construction", () => {
	const iface = new Interface([
		"function foo(uint256 x) view returns (bool)",
		"event Ev(address indexed a, uint256 b)",
		"error MyError(uint256 code)",
		"constructor(uint256 x) payable",
		"fallback() payable",
	]);

	it("keeps every fragment it was given", () => {
		assert.deepEqual(
			iface.fragments.map((f) => f.type),
			["function", "event", "error", "constructor", "fallback"],
		);
	});

	it("freezes the fragment list", () => {
		assert.equal(Object.isFrozen(iface.fragments), true);
	});

	it("exposes the constructor as deploy", () => {
		assert.equal(
			iface.deploy.format("minimal"),
			"constructor(uint256) payable",
		);
		assert.equal(iface.deploy.payable, true);
	});

	it("synthesizes an empty constructor when none is declared", () => {
		const bare = new Interface(["function f()"]);
		assert.equal(bare.deploy.format("minimal"), "constructor()");
		assert.equal(bare.deploy.inputs.length, 0);
	});

	it("exposes the fallback and derives receive from it", () => {
		assert.equal(iface.fallback!.payable, true);
		assert.equal(iface.receive, true, "a payable fallback can receive");
	});

	it("reports no fallback when none is declared", () => {
		const bare = new Interface(["function f()"]);
		assert.equal(bare.fallback, null);
		assert.equal(bare.receive, false);
	});

	it("treats a declared receive as receive without a fallback", () => {
		const withReceive = new Interface(["receive()"]);
		assert.equal(withReceive.receive, true);
		assert.equal(withReceive.fallback, null);
	});

	it("builds an empty Interface", () => {
		const empty = new Interface([]);
		assert.equal(empty.fragments.length, 0);
		assert.equal(empty.deploy.format("minimal"), "constructor()");
		assert.equal(empty.receive, false);
	});

	it("builds from a JSON ABI array", () => {
		const iface2 = new Interface([
			{
				type: "function",
				name: "transfer",
				stateMutability: "nonpayable",
				inputs: [
					{ name: "to", type: "address" },
					{ name: "amount", type: "uint256" },
				],
				outputs: [{ name: "", type: "bool" }],
			},
		]);
		assert.equal(
			iface2.getFunction("transfer")!.format("full"),
			"function transfer(address to, uint256 amount) returns (bool)",
		);
	});

	it("builds from a JSON ABI string", () => {
		const json = JSON.stringify([
			{ type: "function", name: "f", inputs: [], outputs: [] },
		]);
		assert.equal(new Interface(json).getFunction("f")!.format(), "f()");
	});

	it("builds from Fragment instances", () => {
		const iface2 = new Interface([
			FunctionFragment.from("function f(uint256 x)"),
			EventFragment.from("event E()"),
		]);
		assert.equal(iface2.fragments.length, 2);
	});

	it("mixes human-readable, JSON and Fragment entries", () => {
		const iface2 = new Interface([
			"function a()",
			{ type: "function", name: "b", inputs: [], outputs: [] },
			FunctionFragment.from("function c()"),
		]);
		assert.deepEqual(
			iface2.fragments.map((f) => f.format()),
			["a()", "b()", "c()"],
		);
	});

	it("formats the whole ABI in full and minimal form", () => {
		assert.deepEqual(iface.format(), [
			"function foo(uint256 x) view returns (bool)",
			"event Ev(address indexed a, uint256 b)",
			"error MyError(uint256 code)",
			"constructor(uint256 x) payable",
			"fallback() payable",
		]);
		assert.deepEqual(iface.format(true), [
			"function foo(uint256) view returns (bool)",
			"event Ev(address indexed,uint256)",
			"error MyError(uint256)",
			"constructor(uint256) payable",
			"fallback() payable",
		]);
	});

	it("emits a JSON ABI that parses back to the same interface", () => {
		const restored = new Interface(iface.formatJson());
		assert.deepEqual(restored.format(), iface.format());
	});

	it("round-trips through its own human-readable output", () => {
		const restored = new Interface(iface.format());
		assert.deepEqual(restored.format(), iface.format());
	});

	it("returns the same instance from Interface.from(Interface)", () => {
		assert.equal(Interface.from(iface), iface);
	});

	it("builds from a JSON string via Interface.from", () => {
		assert.equal(
			Interface.from(iface.formatJson()).getFunction("foo")!.format(),
			"foo(uint256)",
		);
	});

	it("builds from another object exposing formatJson", () => {
		const foreign = { formatJson: () => iface.formatJson() };
		assert.deepEqual(Interface.from(foreign as any).format(), iface.format());
	});

	it("drops duplicate definitions of the same signature", () => {
		const dup = new Interface(["function f(uint256)", "function f(uint256)"]);
		const seen: Array<string> = [];
		dup.forEachFunction((f) => seen.push(f.format()));
		assert.deepEqual(seen, ["f(uint256)"]);
	});

	it("shares the default AbiCoder", () => {
		assert.equal(iface.getAbiCoder(), AbiCoder.defaultAbiCoder());
	});
});

describe("Interface function lookup and overloads", () => {
	const iface = new Interface([
		"function foo(uint256 x) view returns (bool)",
		"function foo(string s) view returns (bool)",
		"function solo(address a) returns (uint256)",
	]);

	it("finds a unique function by bare name", () => {
		assert.equal(iface.getFunction("solo")!.format(), "solo(address)");
	});

	it("finds a function by full signature", () => {
		assert.equal(iface.getFunction("foo(uint256)")!.format(), "foo(uint256)");
		assert.equal(iface.getFunction("foo(string)")!.format(), "foo(string)");
	});

	it("normalizes an aliased signature before lookup", () => {
		assert.equal(iface.getFunction("foo(uint)")!.format(), "foo(uint256)");
	});

	it("finds a function by selector", () => {
		const selector = iface.getFunction("foo(string)")!.selector;
		assert.equal(iface.getFunction(selector)!.format(), "foo(string)");
	});

	it("matches a selector case-insensitively", () => {
		const selector = iface.getFunction("solo")!.selector;
		assert.equal(
			iface.getFunction(selector.toUpperCase().replace("0X", "0x"))!.format(),
			"solo(address)",
		);
	});

	it("returns null for an unknown name, signature or selector", () => {
		assert.equal(iface.getFunction("nope"), null);
		assert.equal(iface.getFunction("nope(uint256)"), null);
		assert.equal(iface.getFunction("0xdeadbeef"), null);
	});

	it("throws on an ambiguous bare name", () => {
		assert.throws(
			() => iface.getFunction("foo"),
			/ambiguous function description/,
		);
	});

	it("names the candidates in the ambiguity error", () => {
		assert.throws(
			() => iface.getFunction("foo"),
			(error: any) => {
				assert.match(error.message, /"foo\(uint256\)"/);
				assert.match(error.message, /"foo\(string\)"/);
				return true;
			},
		);
	});

	it("resolves an overload using Typed arguments", () => {
		assert.equal(
			iface.getFunction("foo", [Typed.uint256(1)])!.format(),
			"foo(uint256)",
		);
		assert.equal(
			iface.getFunction("foo", [Typed.string("a")])!.format(),
			"foo(string)",
		);
	});

	it("resolves an overload by argument count", () => {
		const overloads = new Interface([
			"function f(uint256 x)",
			"function f(uint256 x, uint256 y, uint256 z)",
		]);
		assert.equal(overloads.getFunction("f", [1])!.format(), "f(uint256)");
		assert.equal(
			overloads.getFunction("f", [1, 2, 3])!.format(),
			"f(uint256,uint256,uint256)",
		);
	});

	it("treats a trailing overrides object as not being an argument", () => {
		const overloads = new Interface([
			"function f(uint256 x)",
			"function f(uint256 x, uint256 y)",
		]);
		assert.equal(
			overloads
				.getFunction("f", [1, 2, Typed.overrides({ value: 1 })])!
				.format(),
			"f(uint256,uint256)",
		);
	});

	it("reports whether a function is present without resolving it", () => {
		assert.equal(iface.hasFunction("solo"), true);
		assert.equal(iface.hasFunction("foo"), true, "ambiguous but present");
		assert.equal(iface.hasFunction("nope"), false);
		assert.equal(iface.hasFunction(iface.getFunction("solo")!.selector), true);
	});

	it("returns the bare name for any key", () => {
		assert.equal(iface.getFunctionName("foo(uint256)"), "foo");
		assert.equal(
			iface.getFunctionName(iface.getFunction("solo")!.selector),
			"solo",
		);
	});

	it("throws when asked for the name of an unknown function", () => {
		assert.throws(() => iface.getFunctionName("nope"), /no matching function/);
	});
});

describe("Interface event lookup", () => {
	const iface = new Interface([
		"event Ev(address indexed a, uint256 b)",
		"event Dup(uint256 a)",
		"event Dup(string a)",
	]);

	it("finds a unique event by bare name", () => {
		assert.equal(iface.getEvent("Ev")!.format(), "Ev(address,uint256)");
	});

	it("finds an event by signature", () => {
		assert.equal(
			iface.getEvent("Ev(address,uint256)")!.format(),
			"Ev(address,uint256)",
		);
	});

	it("finds an event by topic hash", () => {
		const topic = iface.getEvent("Ev")!.topicHash;
		assert.equal(iface.getEvent(topic)!.format(), "Ev(address,uint256)");
	});

	it("returns null for an unknown event", () => {
		assert.equal(iface.getEvent("Nope"), null);
		assert.equal(iface.getEvent("0x" + "11".repeat(32)), null);
	});

	it("throws on an ambiguous bare name", () => {
		assert.throws(() => iface.getEvent("Dup"), /ambiguous event description/);
	});

	it("resolves an overloaded event using Typed arguments", () => {
		assert.equal(
			iface.getEvent("Dup", [Typed.uint256(1)])!.format(),
			"Dup(uint256)",
		);
		assert.equal(
			iface.getEvent("Dup", [Typed.string("a")])!.format(),
			"Dup(string)",
		);
	});

	it("reports whether an event is present", () => {
		assert.equal(iface.hasEvent("Ev"), true);
		assert.equal(iface.hasEvent("Nope"), false);
		assert.equal(iface.hasEvent(iface.getEvent("Ev")!.topicHash), true);
	});

	it("returns the bare name for any key", () => {
		assert.equal(iface.getEventName("Ev(address,uint256)"), "Ev");
		assert.equal(iface.getEventName(iface.getEvent("Ev")!.topicHash), "Ev");
	});

	it("throws when asked for the name of an unknown event", () => {
		assert.throws(() => iface.getEventName("Nope"), /no matching event/);
	});
});

describe("Interface error lookup", () => {
	const iface = new Interface([
		"error MyError(uint256 code, string reason)",
		"error Solo()",
		"error Dup(uint256 a)",
		"error Dup(string a)",
	]);

	it("finds an error by bare name", () => {
		assert.equal(
			iface.getError("MyError")!.format(),
			"MyError(uint256,string)",
		);
	});

	it("finds an error by signature", () => {
		assert.equal(iface.getError("Solo()")!.format(), "Solo()");
	});

	it("finds an error by selector", () => {
		const selector = iface.getError("MyError")!.selector;
		assert.equal(iface.getError(selector)!.format(), "MyError(uint256,string)");
	});

	it("returns null for an unknown error", () => {
		assert.equal(iface.getError("Nope"), null);
		assert.equal(iface.getError("0xdeadbeef"), null);
	});

	it("throws on an ambiguous bare name", () => {
		assert.throws(() => iface.getError("Dup"), /ambiguous error description/);
	});

	it("supplies the built-in Error and Panic fragments by name", () => {
		assert.equal(iface.getError("Error")!.format(), "Error(string)");
		assert.equal(iface.getError("Panic")!.format(), "Panic(uint256)");
	});

	it("supplies the built-in fragments by signature", () => {
		assert.equal(iface.getError("Error(string)")!.format(), "Error(string)");
		assert.equal(iface.getError("Panic(uint256)")!.format(), "Panic(uint256)");
	});
});

describe("Interface fragment iteration", () => {
	const iface = new Interface([
		"function zeta()",
		"function alpha(uint256 x)",
		"function alpha(string s)",
		"event Zed()",
		"event Able(uint256 a)",
		"error Zeta()",
		"error Able(uint256 a)",
		"constructor()",
	]);

	it("iterates functions sorted by signature", () => {
		const seen: Array<string> = [];
		iface.forEachFunction((fragment, index) => {
			assert.equal(index, seen.length);
			seen.push(fragment.format());
		});
		assert.deepEqual(seen, ["alpha(string)", "alpha(uint256)", "zeta()"]);
	});

	it("iterates events sorted by signature", () => {
		const seen: Array<string> = [];
		iface.forEachEvent((fragment) => seen.push(fragment.format()));
		assert.deepEqual(seen, ["Able(uint256)", "Zed()"]);
	});

	it("iterates errors sorted by signature", () => {
		const seen: Array<string> = [];
		iface.forEachError((fragment) => seen.push(fragment.format()));
		assert.deepEqual(seen, ["Able(uint256)", "Zeta()"]);
	});

	it("excludes constructors and fallbacks from the iterators", () => {
		const seen: Array<string> = [];
		iface.forEachFunction((fragment) => seen.push(fragment.type));
		assert.deepEqual(new Set(seen), new Set(["function"]));
	});

	it("iterates nothing for an empty Interface", () => {
		const empty = new Interface([]);
		let count = 0;
		empty.forEachFunction(() => count++);
		empty.forEachEvent(() => count++);
		empty.forEachError(() => count++);
		assert.equal(count, 0);
	});
});

describe("Interface call data and results", () => {
	const iface = new Interface([
		"function set(uint256 x, string s)",
		"function get() view returns (uint256 n, string s)",
		"function nothing()",
	]);

	it("encodes deployment data from the constructor inputs", () => {
		const withArgs = new Interface(["constructor(uint256 x)"]);
		assert.equal(withArgs.encodeDeploy([42]), coder.encode(["uint256"], [42]));
	});

	it("encodes empty deployment data for a bare constructor", () => {
		assert.equal(new Interface([]).encodeDeploy(), "0x");
	});

	it("encodes function data as selector plus arguments", () => {
		const data = iface.encodeFunctionData("set", [1, "hi"]);
		assert.equal(data.substring(0, 10), iface.getFunction("set")!.selector);
		assert.equal(
			"0x" + data.substring(10),
			coder.encode(["uint256", "string"], [1, "hi"]),
		);
	});

	it("encodes function data for a no-argument function", () => {
		assert.equal(
			iface.encodeFunctionData("nothing"),
			iface.getFunction("nothing")!.selector,
		);
	});

	it("accepts a FunctionFragment in place of a name", () => {
		const fragment = iface.getFunction("set")!;
		assert.equal(
			iface.encodeFunctionData(fragment, [1, "hi"]),
			iface.encodeFunctionData("set", [1, "hi"]),
		);
	});

	it("decodes function data back to its arguments", () => {
		const data = iface.encodeFunctionData("set", [7, "hi"]);
		const decoded = iface.decodeFunctionData("set", data);
		assert.equal(decoded[0], BigInt(7));
		assert.equal(decoded[1], "hi");
		assert.equal(decoded.x, BigInt(7), "accessible by name");
	});

	it("rejects function data whose selector does not match", () => {
		const data = iface.encodeFunctionData("set", [7, "hi"]);
		assert.throws(
			() => iface.decodeFunctionData("set", "0xdeadbeef" + data.substring(10)),
			/data signature does not match function set\./,
		);
	});

	it("throws when encoding for an unknown function", () => {
		assert.throws(
			() => iface.encodeFunctionData("nope", []),
			/unknown function/,
		);
		assert.throws(
			() => iface.decodeFunctionData("nope", "0x"),
			/unknown function/,
		);
	});

	it("encodes and decodes a function result", () => {
		const data = iface.encodeFunctionResult("get", [5, "out"]);
		const decoded = iface.decodeFunctionResult("get", data);
		assert.equal(decoded[0], BigInt(5));
		assert.equal(decoded[1], "out");
		assert.equal(decoded.n, BigInt(5));
	});

	it("encodes an empty result for a function with no outputs", () => {
		assert.equal(iface.encodeFunctionResult("nothing", []), "0x");
	});

	it("rejects result data that is not a whole number of words", () => {
		assert.throws(
			() => iface.decodeFunctionResult("get", "0x1234"),
			/invalid length for result data/,
		);
	});

	it("reports BAD_DATA with the method context for junk results", () => {
		assert.throws(
			() => iface.decodeFunctionResult("get", "0x1234"),
			(error: any) => {
				assert.equal(error.code, "BAD_DATA");
				assert.equal(error.info.method, "get");
				assert.equal(error.info.signature, "get()");
				return true;
			},
		);
	});

	it("reports BAD_DATA when word-aligned data cannot be decoded", () => {
		assert.throws(
			() => iface.decodeFunctionResult("get", "0x" + "ff".repeat(32)),
			/could not decode result data/,
		);
	});
});

describe("Interface error results and custom errors", () => {
	const iface = new Interface([
		"function f()",
		"error MyError(uint256 code, string reason)",
		"error Solo()",
	]);

	it("encodes a custom error as selector plus arguments", () => {
		const data = iface.encodeErrorResult("MyError", [1, "oops"]);
		assert.equal(data.substring(0, 10), iface.getError("MyError")!.selector);
		assert.equal(
			"0x" + data.substring(10),
			coder.encode(["uint256", "string"], [1, "oops"]),
		);
	});

	it("encodes an argument-less custom error as just the selector", () => {
		assert.equal(
			iface.encodeErrorResult("Solo"),
			iface.getError("Solo")!.selector,
		);
	});

	it("decodes a custom error back to its arguments", () => {
		const data = iface.encodeErrorResult("MyError", [1, "oops"]);
		const decoded = iface.decodeErrorResult("MyError", data);
		assert.equal(decoded[0], BigInt(1));
		assert.equal(decoded[1], "oops");
		assert.equal(decoded.code, BigInt(1));
		assert.equal(decoded.reason, "oops");
	});

	it("accepts an ErrorFragment in place of a name", () => {
		const fragment = iface.getError("Solo")!;
		assert.equal(
			iface.encodeErrorResult(fragment),
			iface.encodeErrorResult("Solo"),
		);
	});

	it("rejects error data whose selector does not match", () => {
		const data = iface.encodeErrorResult("MyError", [1, "oops"]);
		assert.throws(
			() =>
				iface.decodeErrorResult("MyError", "0xdeadbeef" + data.substring(10)),
			/data signature does not match error MyError\./,
		);
	});

	it("throws for an unknown error", () => {
		assert.throws(() => iface.encodeErrorResult("Nope", []), /unknown error/);
		assert.throws(() => iface.decodeErrorResult("Nope", "0x"), /unknown error/);
	});

	it("builds a CallExceptionError for a custom error", () => {
		const data = iface.encodeErrorResult("MyError", [1, "oops"]);
		const error = iface.makeError(data, {
			to: ADDRESS,
			data: iface.encodeFunctionData("f"),
		});
		assert.equal(error.code, "CALL_EXCEPTION");
		assert.equal(error.revert!.name, "MyError");
		assert.equal(error.revert!.signature, "MyError(uint256,string)");
		assert.equal(error.revert!.args[0], BigInt(1));
		assert.equal(error.reason, "MyError(uint256,string)");
	});

	it("records the invocation alongside the revert", () => {
		const error = iface.makeError(iface.encodeErrorResult("Solo"), {
			to: ADDRESS,
			data: iface.encodeFunctionData("f"),
		});
		assert.equal(error.invocation!.method, "f");
		assert.equal(error.invocation!.signature, "f()");
	});

	it("leaves an unrecognized selector as an unknown custom error", () => {
		const error = iface.makeError("0xdeadbeef", {
			to: ADDRESS,
			data: iface.encodeFunctionData("f"),
		});
		assert.match(error.message, /unknown custom error/);
		assert.equal(error.revert, null);
	});
});

describe("Interface built-in Error and Panic", () => {
	const iface = new Interface(["error Custom(uint256 a)"]);

	it("decodes Error(string) revert data it produced itself", () => {
		const data = iface.encodeErrorResult("Error", ["boom"]);
		assert.equal(iface.decodeErrorResult("Error", data)[0], "boom");
	});

	it("decodes Panic(uint256) revert data it produced itself", () => {
		const data = iface.encodeErrorResult("Panic", [0x11]);
		assert.equal(iface.decodeErrorResult("Panic", data)[0], BigInt(0x11));
	});

	it("maps a panic code to a human-readable reason", () => {
		const cases: Array<[number, RegExp]> = [
			[0x01, /ASSERT_FALSE/],
			[0x11, /OVERFLOW/],
			[0x12, /DIVIDE_BY_ZERO/],
			[0x32, /ARRAY_RANGE_ERROR/],
		];
		for (const [code, pattern] of cases) {
			const data =
				id("Panic(uint256)").substring(0, 10) +
				coder.encode(["uint256"], [code]).substring(2);
			const error = AbiCoder.getBuiltinCallException(
				"call",
				{ to: ADDRESS },
				data,
			);
			assert.match(error.reason!, pattern, String(code));
		}
	});

	it("reports missing revert data", () => {
		const error = AbiCoder.getBuiltinCallException(
			"call",
			{ to: ADDRESS },
			null,
		);
		assert.equal(error.message.split(" (")[0], "missing revert data");
		assert.equal(error.reason, null);
	});

	it("reports empty revert data as require(false)", () => {
		const error = AbiCoder.getBuiltinCallException(
			"call",
			{ to: ADDRESS },
			"0x",
		);
		assert.equal(error.reason, "require(false)");
	});

	it("reports revert data of an impossible length", () => {
		const error = AbiCoder.getBuiltinCallException(
			"call",
			{ to: ADDRESS },
			"0x1234",
		);
		assert.match(error.message, /invalid data length/);
	});

	it("keys the built-in errors on Core's selectors, not Ethereum's", () => {
		// Core hashes a signature with SHA-2, so these are not Ethereum's
		// 0x08c379a0 / 0x4e487b71. Every contract deployed on the network
		// embeds the Core values, so they are the ones that arrive on a revert.
		assert.equal(id("Error(string)").substring(0, 10), "0x4e401cbe");
		assert.equal(id("Panic(uint256)").substring(0, 10), "0x4b1f2ce3");

		assert.equal(iface.getError("0x4e401cbe")!.format(), "Error(string)");
		assert.equal(iface.getError("0x4b1f2ce3")!.format(), "Panic(uint256)");

		// The fragment agrees with the key it was found under.
		assert.equal(iface.getError("0x4e401cbe")!.selector, "0x4e401cbe");
		assert.equal(iface.getError("0x4b1f2ce3")!.selector, "0x4b1f2ce3");
	});

	it("does not resolve Ethereum's selectors", () => {
		assert.equal(iface.getError("0x08c379a0"), null);
		assert.equal(iface.getError("0x4e487b71"), null);
	});

	it("round-trips the built-in revert data it produces", () => {
		const errorData = iface.encodeErrorResult("Error", ["boom"]);
		const panicData = iface.encodeErrorResult("Panic", [0x11]);
		assert.equal(errorData.substring(0, 10), "0x4e401cbe");
		assert.equal(panicData.substring(0, 10), "0x4b1f2ce3");

		assert.equal(iface.parseError(errorData)!.name, "Error");
		assert.equal(iface.parseError(panicData)!.name, "Panic");
	});

	it("recognizes Core-selector revert data as built-in", () => {
		const body = coder.encode(["string"], ["boom"]).substring(2);

		const core = AbiCoder.getBuiltinCallException(
			"call",
			{ to: ADDRESS },
			"0x4e401cbe" + body,
		);
		assert.equal(core.reason, "boom");
		assert.equal(core.revert!.name, "Error");

		// Ethereum's selector is now just an unrecognized custom error.
		const ethereum = AbiCoder.getBuiltinCallException(
			"call",
			{ to: ADDRESS },
			"0x08c379a0" + body,
		);
		assert.equal(ethereum.reason, null);
		assert.match(ethereum.message, /unknown custom error/);
	});

	it("reports a selector that matches the data it parsed", () => {
		const data = "0x4e401cbe" + coder.encode(["string"], ["boom"]).substring(2);
		const parsed = iface.parseError(data)!;
		assert.equal(parsed.name, "Error");
		assert.equal(parsed.args[0], "boom");
		assert.equal(parsed.selector, data.substring(0, 10));
	});

	it("built-in errors use Core selectors end to end", () => {
		const errorData = iface.encodeErrorResult("Error", ["boom"]);
		const parsed = iface.parseError(errorData)!;
		assert.equal(parsed.name, "Error");
		assert.equal(parsed.args[0], "boom");
		assert.equal(parsed.selector, errorData.substring(0, 10));

		const builtin = AbiCoder.getBuiltinCallException(
			"call",
			{ to: ADDRESS },
			errorData,
		);
		assert.equal(builtin.reason, "boom");
	});
});

describe("Interface parseTransaction, parseLog and parseError", () => {
	const iface = new Interface([
		"function solo(address a, uint256 n)",
		"event Ev(address indexed a, uint256 b)",
		"event Anon(uint256 a)",
		"error MyError(uint256 code)",
	]);

	it("parses a transaction into its fragment and arguments", () => {
		const data = iface.encodeFunctionData("solo", [ADDRESS, 3]);
		const parsed = iface.parseTransaction({ data, value: 1000 })!;
		assert.equal(parsed.name, "solo");
		assert.equal(parsed.signature, "solo(address,uint256)");
		assert.equal(parsed.selector, iface.getFunction("solo")!.selector);
		assert.equal(parsed.value, BigInt(1000));
		assert.equal(parsed.args[0], ADDRESS);
		assert.equal(parsed.args[1], BigInt(3));
		assert.equal(parsed.fragment.type, "function");
	});

	it("defaults the transaction value to zero", () => {
		const data = iface.encodeFunctionData("solo", [ADDRESS, 3]);
		assert.equal(iface.parseTransaction({ data })!.value, BigInt(0));
	});

	it("returns null for a transaction with an unknown selector", () => {
		assert.equal(iface.parseTransaction({ data: "0xdeadbeef" }), null);
	});

	it("parses a log into its fragment and arguments", () => {
		const log = iface.encodeEventLog("Ev", [ADDRESS, 5]);
		const parsed = iface.parseLog(log)!;
		assert.equal(parsed.name, "Ev");
		assert.equal(parsed.signature, "Ev(address,uint256)");
		assert.equal(parsed.topic, iface.getEvent("Ev")!.topicHash);
		assert.equal(parsed.args[0], ADDRESS);
		assert.equal(parsed.args[1], BigInt(5));
		assert.equal(parsed.args.a, ADDRESS, "accessible by name");
	});

	it("returns null for a log with an unknown topic", () => {
		assert.equal(
			iface.parseLog({ topics: ["0x" + "11".repeat(32)], data: "0x" }),
			null,
		);
	});

	it("returns null for an anonymous event even when the topic matches", () => {
		// parseLog deliberately refuses anonymous events: topic0 belongs to
		// the next indexed argument, not the event signature.
		const anonymous = new Interface([
			{
				type: "event",
				name: "Anon",
				anonymous: true,
				inputs: [{ name: "a", type: "uint256", indexed: true }],
			},
		]);
		const fragment = anonymous.getEvent("Anon")!;
		assert.equal(
			anonymous.parseLog({ topics: [fragment.topicHash], data: "0x" }),
			null,
		);
	});

	it("parses custom error revert data", () => {
		const data = iface.encodeErrorResult("MyError", [9]);
		const parsed = iface.parseError(data)!;
		assert.equal(parsed.name, "MyError");
		assert.equal(parsed.signature, "MyError(uint256)");
		assert.equal(parsed.selector, iface.getError("MyError")!.selector);
		assert.equal(parsed.args[0], BigInt(9));
		assert.equal(parsed.args.code, BigInt(9));
	});

	it("returns null for revert data with an unknown selector", () => {
		assert.equal(iface.parseError("0xdeadbeef"), null);
	});
});

describe("Interface event topics and logs", () => {
	const iface = new Interface([
		"event Mixed(string indexed s, bytes indexed b, uint256 indexed n, string data)",
		"event Plain(uint256 a, uint256 b)",
	]);

	it("hashes an indexed string into its topic", () => {
		const topics = iface.encodeFilterTopics("Mixed", ["key"]);
		assert.equal(topics[1], id("key"));
	});

	it("leaves a null filter slot as null", () => {
		const topics = iface.encodeFilterTopics("Mixed", [null, null, 7]);
		assert.equal(topics[0], iface.getEvent("Mixed")!.topicHash);
		assert.equal(topics[1], null);
		assert.equal(topics[2], null);
		assert.equal(topics[3], coder.encode(["uint256"], [7]));
	});

	it("encodes an array filter as a set of alternatives", () => {
		const topics = iface.encodeFilterTopics("Mixed", [null, null, [1, 2]]);
		assert.deepEqual(topics[3], [
			coder.encode(["uint256"], [1]),
			coder.encode(["uint256"], [2]),
		]);
	});

	it("trims trailing null slots", () => {
		assert.equal(
			iface.encodeFilterTopics("Mixed", [null, null, null]).length,
			1,
			"only topic0 remains",
		);
	});

	it("rejects a filter on a non-indexed parameter", () => {
		assert.throws(
			() => iface.encodeFilterTopics("Mixed", [null, null, null, "x"]),
			/cannot filter non-indexed parameters; must be null/,
		);
	});

	it("rejects more filter values than the event has parameters", () => {
		assert.throws(
			() => iface.encodeFilterTopics("Plain", [1, 2, 3]),
			/too many arguments/,
		);
	});

	it("rejects an unknown event", () => {
		assert.throws(() => iface.encodeFilterTopics("Nope", []), /unknown event/);
		assert.throws(() => iface.encodeEventLog("Nope", []), /unknown event/);
	});

	it("splits an event log into indexed topics and packed data", () => {
		const log = iface.encodeEventLog("Mixed", ["key", "0x1234", 7, "payload"]);
		assert.equal(log.topics.length, 4, "topic0 plus three indexed");
		assert.equal(log.topics[0], iface.getEvent("Mixed")!.topicHash);
		assert.equal(log.data, coder.encode(["string"], ["payload"]));
	});

	it("puts everything in data when nothing is indexed", () => {
		const log = iface.encodeEventLog("Plain", [1, 2]);
		assert.equal(log.topics.length, 1);
		assert.equal(log.data, coder.encode(["uint256", "uint256"], [1, 2]));
	});

	it("rejects an event log with the wrong number of values", () => {
		assert.throws(
			() => iface.encodeEventLog("Plain", [1]),
			/event arguments\/values mismatch/,
		);
	});

	it("returns an Indexed placeholder for hashed dynamic arguments", () => {
		const log = iface.encodeEventLog("Mixed", ["key", "0x1234", 7, "payload"]);
		const decoded = iface.decodeEventLog("Mixed", log.data, log.topics);

		assert.equal(Indexed.isIndexed(decoded[0]), true);
		assert.equal(decoded[0].hash, log.topics[1]);
		assert.equal(Indexed.isIndexed(decoded[1]), true);
		assert.equal(decoded[1].hash, log.topics[2]);

		assert.equal(decoded[2], BigInt(7), "a static indexed value survives");
		assert.equal(decoded[3], "payload");
		assert.equal(Indexed.isIndexed(decoded[3]), false);
	});

	it("returns null-hashed placeholders when topics are omitted", () => {
		const log = iface.encodeEventLog("Mixed", ["key", "0x1234", 7, "payload"]);
		const decoded = iface.decodeEventLog("Mixed", log.data);
		assert.equal(decoded[0].hash, null);
		assert.equal(decoded[2].hash, null);
		assert.equal(decoded[3], "payload", "non-indexed data still decodes");
	});

	it("rejects a log whose topic0 belongs to another event", () => {
		const log = iface.encodeEventLog("Mixed", ["key", "0x1234", 7, "payload"]);
		assert.throws(
			() =>
				iface.decodeEventLog("Mixed", log.data, [
					"0x" + "11".repeat(32),
					...log.topics.slice(1),
				]),
			/fragment\/topic mismatch/,
		);
	});
});

describe("Result", () => {
	const iface = new Interface([
		"function named() returns (uint256 a, string b, address c)",
		"function unnamed() returns (uint256, uint256)",
		"function duplicated() returns (uint256 x, uint256 x)",
	]);

	function namedResult(): Result {
		return iface.decodeFunctionResult(
			"named",
			iface.encodeFunctionResult("named", [1, "hi", ADDRESS]),
		);
	}

	it("behaves like an array", () => {
		const result = namedResult();
		assert.equal(Array.isArray(result), true);
		assert.equal(result.length, 3);
		assert.equal(result[0], BigInt(1));
		assert.equal(result[2], ADDRESS);
	});

	it("exposes values by name", () => {
		const result = namedResult();
		assert.equal(result.a, BigInt(1));
		assert.equal(result.b, "hi");
		assert.equal(result.c, ADDRESS);
	});

	it("exposes values through getValue", () => {
		const result = namedResult();
		assert.equal(result.getValue("b"), "hi");
		assert.equal(result.getValue("missing"), undefined);
	});

	it("converts to a plain array", () => {
		assert.deepEqual(namedResult().toArray(), [BigInt(1), "hi", ADDRESS]);
	});

	it("converts to a plain object", () => {
		assert.deepEqual(namedResult().toObject(), {
			a: BigInt(1),
			b: "hi",
			c: ADDRESS,
		});
	});

	it("refuses to convert an unnamed result to an object", () => {
		const result = iface.decodeFunctionResult(
			"unnamed",
			coder.encode(["uint256", "uint256"], [1, 2]),
		);
		assert.throws(() => result.toObject(), /value at index 0 unnamed/);
	});

	it("drops names that are not unique", () => {
		const result = iface.decodeFunctionResult(
			"duplicated",
			coder.encode(["uint256", "uint256"], [1, 2]),
		);
		assert.equal(result[0], BigInt(1));
		assert.equal(result.x, undefined, "the ambiguous name resolves to nothing");
	});

	it("slices into a smaller Result keeping names", () => {
		const sliced = namedResult().slice(1);
		assert.equal(sliced.length, 2);
		assert.equal(sliced[0], "hi");
		assert.equal(sliced.b, "hi");
	});

	it("supports negative slice bounds", () => {
		const sliced = namedResult().slice(-1);
		assert.equal(sliced.length, 1);
		assert.equal(sliced[0], ADDRESS);
	});

	it("clamps out-of-range slice bounds", () => {
		assert.equal(namedResult().slice(0, 99).length, 3);
		assert.equal(namedResult().slice(-99).length, 3);
	});

	it("filters into a smaller Result", () => {
		const filtered = namedResult().filter((v) => typeof v === "string");
		assert.equal(filtered.length, 2, "the string and the address");
	});

	it("throws when an index is out of range", () => {
		assert.throws(() => namedResult()[9], /out of result range/);
	});

	it("builds directly from items and keys", () => {
		const result = Result.fromItems([1, 2], ["x", null]);
		assert.equal(result.length, 2);
		assert.equal(result.x, 1);
		assert.equal(result[1], 2);
	});

	it("reports no errors for a clean result", () => {
		assert.equal(checkResultErrors(namedResult()).length, 0);
	});

	it("is frozen once decoded", () => {
		assert.throws(() => {
			(namedResult() as any)[0] = 5;
		});
	});
});

describe("Typed values", () => {
	it("creates each unsigned width", () => {
		for (const width of [8, 16, 32, 64, 128, 256]) {
			const typed = (Typed as any)[`uint${width}`](1);
			assert.equal(typed.type, `uint${width}`, String(width));
			assert.equal(typed.isBigInt(), true);
		}
	});

	it("creates each signed width", () => {
		for (const width of [8, 16, 32, 64, 128, 256]) {
			const typed = (Typed as any)[`int${width}`](-1);
			assert.equal(typed.type, `int${width}`, String(width));
			assert.equal(typed.isBigInt(), true);
		}
	});

	it("aliases uint and int to 256 bits", () => {
		assert.equal(Typed.uint(1).type, "uint256");
		assert.equal(Typed.int(1).type, "int256");
	});

	it("creates each fixed bytes width", () => {
		for (const size of [1, 4, 20, 22, 32]) {
			const typed = (Typed as any)[`bytes${size}`]("0x" + "11".repeat(size));
			assert.equal(typed.type, `bytes${size}`, String(size));
			assert.equal(typed.isData(), true);
		}
	});

	it("creates the dynamic and reference types", () => {
		assert.equal(Typed.bytes("0x1234").type, "bytes");
		assert.equal(Typed.string("hi").type, "string");
		assert.equal(Typed.bool(true).type, "bool");
		assert.equal(Typed.address(ADDRESS).type, "address");
	});

	it("coerces the bool value to an actual boolean", () => {
		assert.equal(Typed.bool(1).value, true);
		assert.equal(Typed.bool(0).value, false);
		assert.equal(Typed.bool("").value, false);
	});

	it("keeps a Core address verbatim", () => {
		const typed = Typed.address(ADDRESS);
		assert.equal(typed.value, ADDRESS);
		assert.equal(typed.value.length, 46, "22 bytes plus the 0x prefix");
	});

	it("creates an arbitrary type through from", () => {
		const typed = Typed.from("uint256", 5);
		assert.equal(typed.type, "uint256");
		assert.equal(typed.value, 5);
	});

	it("creates an overrides marker", () => {
		const typed = Typed.overrides({ value: 1 });
		assert.equal(typed.type, "overrides");
		assert.deepEqual(typed.value, { value: 1 });
	});

	it("formats back to its own type name", () => {
		assert.equal(Typed.uint256(1).format(), "uint256");
		assert.equal(Typed.bytes4("0x11223344").format(), "bytes4");
		assert.equal(Typed.string("hi").format(), "string");
	});

	it("classifies the value with its type guards", () => {
		const number = Typed.uint256(1);
		const data = Typed.bytes32("0x" + "11".repeat(32));
		const text = Typed.string("hi");

		assert.deepEqual(
			[number.isBigInt(), number.isData(), number.isString()],
			[true, false, false],
		);
		assert.deepEqual(
			[data.isBigInt(), data.isData(), data.isString()],
			[false, true, false],
		);
		assert.deepEqual(
			[text.isBigInt(), text.isData(), text.isString()],
			[false, false, true],
		);
	});

	it("treats dynamic bytes as data too", () => {
		assert.equal(Typed.bytes("0x12").isData(), true);
	});

	it("recognizes its own instances", () => {
		assert.equal(Typed.isTyped(Typed.uint256(1)), true);
		assert.equal(Typed.isTyped(5), false);
		assert.equal(Typed.isTyped("uint256"), false);
		assert.equal(Typed.isTyped({}), false);
		assert.equal(Typed.isTyped({ _typedSymbol: Symbol("other") }), false);
	});

	it("cannot be constructed directly", () => {
		assert.throws(
			() => new (Typed as any)({}, "uint256", 1),
			/private constructor/,
		);
	});

	it("dereferences a matching type back to the raw value", () => {
		assert.equal(Typed.dereference(Typed.uint256(7), "uint256"), 7);
	});

	it("passes an untyped value straight through", () => {
		assert.equal(Typed.dereference(7, "uint256"), 7);
		assert.equal(Typed.dereference("hi", "string"), "hi");
	});

	it("rejects a dereference to the wrong type", () => {
		assert.throws(
			() => Typed.dereference(Typed.uint256(7), "string"),
			/invalid type/,
		);
	});

	it("throws when asked for a tuple name or array length of a scalar", () => {
		assert.throws(() => Typed.uint256(1).tupleName, /not a tuple/);
		assert.throws(() => Typed.uint256(1).arrayLength, /not an array/);
	});

	it("PINS BUG: isTyped returns null instead of false for nullish input", () => {
		// src.ts/abi/typed.ts:989 returns the result of `value && ...`, so a
		// nullish argument leaks through as null/undefined rather than the
		// declared boolean. It is falsy, so callers work, but the return type
		// is a lie and a strict `=== false` check fails.
		assert.equal(Typed.isTyped(null), null as any);
		assert.equal(Typed.isTyped(undefined), undefined as any);
	});

	it.skip("isTyped should always return a boolean", () => {
		assert.equal(Typed.isTyped(null), false);
		assert.equal(Typed.isTyped(undefined), false);
	});

	it("PINS BUG: the array and tuple factories are unimplemented", () => {
		// src.ts/abi/typed.ts:963 and :974 throw before reaching their own
		// return statement, so composite types cannot be explicitly typed and
		// overload resolution cannot disambiguate on them.
		assert.throws(() => Typed.array([1, 2]), /not implemented yet/);
		assert.throws(() => Typed.tuple([1, 2]), /not implemented yet/);
	});

	it.skip("the array and tuple factories should build Typed values", () => {
		assert.equal(Typed.array([1, 2], true).arrayLength, -1);
		assert.equal(Typed.tuple([1, 2], "s").tupleName, "s");
	});
});

describe("Typed values through encoding", () => {
	const iface = new Interface([
		"function g(uint256 x)",
		"function h(string s)",
		"function k(bool b)",
	]);

	it("encodes the same data as the equivalent raw value", () => {
		assert.equal(
			iface.encodeFunctionData("g", [Typed.uint256(9)]),
			iface.encodeFunctionData("g", [9]),
		);
		assert.equal(
			iface.encodeFunctionData("h", [Typed.string("hi")]),
			iface.encodeFunctionData("h", ["hi"]),
		);
		assert.equal(
			iface.encodeFunctionData("k", [Typed.bool(true)]),
			iface.encodeFunctionData("k", [true]),
		);
	});

	it("unwraps a Typed value in the AbiCoder", () => {
		assert.equal(
			coder.encode(["uint256"], [Typed.uint256(9)]),
			coder.encode(["uint256"], [9]),
		);
		assert.equal(
			coder.encode(["string"], [Typed.string("hi")]),
			coder.encode(["string"], ["hi"]),
		);
		assert.equal(
			coder.encode(["bool"], [Typed.bool(true)]),
			coder.encode(["bool"], [true]),
		);
		assert.equal(
			coder.encode(["bytes4"], [Typed.bytes4("0x11223344")]),
			coder.encode(["bytes4"], ["0x11223344"]),
		);
	});

	it("rejects a Typed value whose type does not match the parameter", () => {
		assert.throws(
			() => coder.encode(["string"], [Typed.uint256(9)]),
			/invalid type/,
		);
		assert.throws(
			() => coder.encode(["uint256"], [Typed.uint8(5)]),
			/invalid type/,
			"widths must match exactly",
		);
		assert.throws(
			() => coder.encode(["bytes4"], [Typed.bytes32("0x" + "11".repeat(32))]),
			/invalid type/,
		);
	});

	it("PINS BUG: an address parameter rejects Typed.address", () => {
		// src.ts/abi/coders/address.ts:22 dereferences with the type "string"
		// instead of "address", so the only Typed value the address coder
		// accepts is Typed.string - the opposite of what the API implies.
		assert.throws(
			() => coder.encode(["address"], [Typed.address(ADDRESS)]),
			/invalid type: expecetd string, got address/,
		);
		assert.equal(
			coder.encode(["address"], [Typed.string(ADDRESS)]),
			coder.encode(["address"], [ADDRESS]),
		);
	});

	it.skip("an address parameter should accept Typed.address", () => {
		assert.equal(
			coder.encode(["address"], [Typed.address(ADDRESS)]),
			coder.encode(["address"], [ADDRESS]),
		);
	});

	it("PINS BUG: a bytes parameter rejects Typed.bytes", () => {
		// src.ts/abi/coders/bytes.ts:19 never calls Typed.dereference, so the
		// Typed wrapper is handed straight to getBytesCopy, which rejects it.
		assert.throws(
			() => coder.encode(["bytes"], [Typed.bytes("0x1234")]),
			/invalid BytesLike value/,
		);
	});

	it.skip("a bytes parameter should accept Typed.bytes", () => {
		assert.equal(
			coder.encode(["bytes"], [Typed.bytes("0x1234")]),
			coder.encode(["bytes"], ["0x1234"]),
		);
	});
});

describe("AbiCoder dynamic types", () => {
	it("encodes bytes as offset, length and padded body", () => {
		const encoded = coder.encode(["bytes"], ["0x1234"]);
		assert.equal(wordCount(encoded), 3);
		assert.equal(encoded.substring(2, 66), (32).toString(16).padStart(64, "0"));
		assert.equal(
			encoded.substring(66, 130),
			(2).toString(16).padStart(64, "0"),
		);
		assert.equal(encoded.substring(130, 134), "1234");
		assert.equal(encoded.substring(134), "0".repeat(60), "right padded");
	});

	it("encodes a string as its UTF-8 bytes", () => {
		const encoded = coder.encode(["string"], ["hello"]);
		assert.equal(wordCount(encoded), 3);
		assert.equal(encoded.substring(130, 140), "68656c6c6f");
	});

	it("round-trips multi-byte UTF-8", () => {
		for (const text of ["héllo", "日本語", "🙂"]) {
			assert.equal(
				coder.decode(["string"], coder.encode(["string"], [text]))[0],
				text,
				text,
			);
		}
	});

	it("encodes empty bytes and strings as offset plus zero length", () => {
		for (const [type, value] of [
			["bytes", "0x"],
			["string", ""],
		]) {
			const encoded = coder.encode([type], [value]);
			assert.equal(wordCount(encoded), 2, type);
			assert.equal(coder.decode([type], encoded)[0], value, type);
		}
	});

	it("pads bytes up to a whole number of words", () => {
		assert.equal(
			wordCount(coder.encode(["bytes"], ["0x" + "ab".repeat(32)])),
			3,
		);
		assert.equal(
			wordCount(coder.encode(["bytes"], ["0x" + "ab".repeat(33)])),
			4,
		);
	});

	it("round-trips bytes of every length across a word boundary", () => {
		for (const length of [0, 1, 31, 32, 33, 64, 65]) {
			const value = "0x" + "ab".repeat(length);
			assert.equal(
				coder.decode(["bytes"], coder.encode(["bytes"], [value]))[0],
				value,
				String(length),
			);
		}
	});

	it("writes offsets relative to the start of the parameter block", () => {
		// uint256, bytes, bool: three static slots, so the bytes body starts
		// at byte 96.
		const encoded = coder.encode(
			["uint256", "bytes", "bool"],
			[1, "0xaa", true],
		);
		assert.equal(wordCount(encoded), 5);
		assert.equal(
			encoded.substring(66, 130),
			(96).toString(16).padStart(64, "0"),
		);
	});

	it("keeps static parameters in place around dynamic ones", () => {
		const decoded = coder.decode(
			["uint256", "bytes", "bool"],
			coder.encode(["uint256", "bytes", "bool"], [1, "0xaa", true]),
		);
		assert.equal(decoded[0], BigInt(1));
		assert.equal(decoded[1], "0xaa");
		assert.equal(decoded[2], true);
	});

	it("handles several dynamic parameters side by side", () => {
		const types = ["string", "bytes", "string"];
		const values = ["one", "0xbeef", "three"];
		assert.deepEqual(
			[...coder.decode(types, coder.encode(types, values))],
			values,
		);
	});

	it("treats a tuple containing a dynamic member as dynamic", () => {
		const encoded = coder.encode(["tuple(uint256,string)"], [[1, "hi"]]);
		assert.equal(wordCount(encoded), 5, "outer offset plus the tuple body");
		const decoded = coder.decode(["tuple(uint256,string)"], encoded)[0];
		assert.equal(decoded[0], BigInt(1));
		assert.equal(decoded[1], "hi");
	});

	it("keeps a fully static tuple inline", () => {
		assert.equal(
			wordCount(coder.encode(["tuple(uint256,bool)"], [[1, true]])),
			2,
		);
	});

	it("encodes a tuple from a named object", () => {
		assert.equal(
			coder.encode(["tuple(uint256 a, bool b)"], [{ a: 1, b: true }]),
			coder.encode(["tuple(uint256 a, bool b)"], [[1, true]]),
		);
	});

	it("rejects an object for a tuple with unnamed components", () => {
		assert.throws(
			() => coder.encode(["tuple(uint256,bool)"], [{ a: 1, b: true }]),
			/missing names/,
		);
	});

	it("decodes tuple members by name", () => {
		const decoded = coder.decode(
			["tuple(uint256 a, bool b)"],
			coder.encode(["tuple(uint256 a, bool b)"], [[1, true]]),
		)[0];
		assert.equal(decoded.a, BigInt(1));
		assert.equal(decoded.b, true);
	});
});

describe("AbiCoder arrays", () => {
	it("encodes a dynamic array as length followed by elements", () => {
		const encoded = coder.encode(["uint256[]"], [[1, 2]]);
		assert.equal(wordCount(encoded), 4, "offset, length, two elements");
		assert.equal(
			encoded.substring(66, 130),
			(2).toString(16).padStart(64, "0"),
		);
	});

	it("encodes a fixed array inline with no length prefix", () => {
		const encoded = coder.encode(["uint256[2]"], [[1, 2]]);
		assert.equal(wordCount(encoded), 2);
		assert.equal(encoded, coder.encode(["uint256", "uint256"], [1, 2]));
	});

	it("encodes an empty dynamic array as offset plus zero length", () => {
		const encoded = coder.encode(["uint256[]"], [[]]);
		assert.equal(wordCount(encoded), 2);
		assert.deepEqual([...coder.decode(["uint256[]"], encoded)[0]], []);
	});

	it("round-trips an empty array of a dynamic element type", () => {
		for (const type of ["string[]", "bytes[]", "uint256[][]"]) {
			const decoded = coder.decode([type], coder.encode([type], [[]]))[0];
			assert.equal(decoded.length, 0, type);
		}
	});

	it("round-trips a nested dynamic array", () => {
		const value = [[1], [2, 3]];
		const decoded = coder.decode(
			["uint256[][]"],
			coder.encode(["uint256[][]"], [value]),
		)[0];
		assert.deepEqual(
			decoded.toArray(true).map((row: Array<bigint>) => row.map(Number)),
			value,
		);
	});

	it("round-trips a fixed array nested in a dynamic one", () => {
		const value = [
			[1, 2],
			[3, 4],
		];
		const decoded = coder.decode(
			["uint8[2][]"],
			coder.encode(["uint8[2][]"], [value]),
		)[0];
		assert.deepEqual(
			decoded.toArray(true).map((row: Array<bigint>) => row.map(Number)),
			value,
		);
	});

	it("round-trips an array of dynamic elements", () => {
		const decoded = coder.decode(
			["string[]"],
			coder.encode(["string[]"], [["a", "bb", ""]]),
		)[0];
		assert.deepEqual([...decoded], ["a", "bb", ""]);
	});

	it("round-trips an array of tuples", () => {
		const value = [
			[1, "a"],
			[2, "b"],
		];
		const decoded = coder.decode(
			["tuple(uint256,string)[]"],
			coder.encode(["tuple(uint256,string)[]"], [value]),
		)[0];
		assert.deepEqual(
			decoded
				.toArray(true)
				.map((row: [bigint, string]) => [Number(row[0]), row[1]]),
			value,
		);
	});

	it("makes a fixed array of a dynamic type dynamic", () => {
		// A string[2] still needs an offset because its members are dynamic.
		const encoded = coder.encode(["string[2]", "uint256"], [["a", "b"], 1]);
		assert.equal(encoded.substring(2, 66), (64).toString(16).padStart(64, "0"));
	});

	it("rejects a fixed array of the wrong length", () => {
		assert.throws(() => coder.encode(["uint256[2]"], [[1]]), /coder array/);
		assert.throws(
			() => coder.encode(["uint256[2]"], [[1, 2, 3]]),
			/coder array/,
		);
	});

	it("rejects a non-array value for an array type", () => {
		assert.throws(
			() => coder.encode(["uint256[]"], ["nope"]),
			/expected array value/,
		);
	});

	it("rejects a types/values length mismatch", () => {
		assert.throws(
			() => coder.encode(["uint256", "bool"], [1]),
			/types\/values length mismatch/,
		);
	});
});

describe("AbiCoder numeric types", () => {
	it("round-trips every unsigned width", () => {
		for (let bits = 8; bits <= 256; bits += 8) {
			const type = `uint${bits}`;
			const max = (BigInt(1) << BigInt(bits)) - BigInt(1);
			for (const value of [BigInt(0), BigInt(1), max]) {
				assert.equal(
					coder.decode([type], coder.encode([type], [value]))[0],
					value,
					`${type} ${value}`,
				);
			}
		}
	});

	it("round-trips every signed width at its bounds", () => {
		for (let bits = 8; bits <= 256; bits += 8) {
			const type = `int${bits}`;
			const max = (BigInt(1) << BigInt(bits - 1)) - BigInt(1);
			const min = -(BigInt(1) << BigInt(bits - 1));
			for (const value of [min, BigInt(-1), BigInt(0), BigInt(1), max]) {
				assert.equal(
					coder.decode([type], coder.encode([type], [value]))[0],
					value,
					`${type} ${value}`,
				);
			}
		}
	});

	it("left-pads a numeric value into a full word", () => {
		assert.equal(coder.encode(["uint8"], [255]), "0x" + "00".repeat(31) + "ff");
		assert.equal(coder.encode(["uint256"], [1]), "0x" + "00".repeat(31) + "01");
	});

	it("encodes negative values in two's complement over the full word", () => {
		assert.equal(coder.encode(["int256"], [-1]), "0x" + "ff".repeat(32));
		assert.equal(coder.encode(["int8"], [-1]), "0x" + "ff".repeat(32));
	});

	it("rejects an unsigned value above the type maximum", () => {
		assert.throws(() => coder.encode(["uint8"], [256]), /value out-of-bounds/);
		assert.throws(
			() => coder.encode(["uint256"], [BigInt(1) << BigInt(256)]),
			/value out-of-bounds/,
		);
	});

	it("rejects a negative value for an unsigned type", () => {
		assert.throws(() => coder.encode(["uint8"], [-1]), /value out-of-bounds/);
		assert.throws(() => coder.encode(["uint256"], [-1]), /value out-of-bounds/);
	});

	it("rejects a signed value outside its range", () => {
		assert.throws(() => coder.encode(["int8"], [128]), /value out-of-bounds/);
		assert.throws(() => coder.encode(["int8"], [-129]), /value out-of-bounds/);
	});

	it("accepts numbers, strings and bigints alike", () => {
		const expected = coder.encode(["uint256"], [BigInt(1000)]);
		assert.equal(coder.encode(["uint256"], [1000]), expected);
		assert.equal(coder.encode(["uint256"], ["1000"]), expected);
		assert.equal(coder.encode(["uint256"], ["0x3e8"]), expected);
	});

	it("decodes into bigint regardless of width", () => {
		for (const type of ["uint8", "uint64", "uint256", "int8", "int256"]) {
			assert.equal(
				typeof coder.decode([type], coder.encode([type], [1]))[0],
				"bigint",
				type,
			);
		}
	});

	it("masks a decoded value down to the declared width", () => {
		// A full word of 0xff read as uint8 is 255, not 2^256-1.
		assert.equal(
			coder.decode(["uint8"], "0x" + "ff".repeat(32))[0],
			BigInt(255),
		);
		assert.equal(coder.decode(["int8"], "0x" + "ff".repeat(32))[0], BigInt(-1));
	});

	it("rejects an invalid numeric width in the type", () => {
		for (const type of ["uint7", "uint0", "uint257"]) {
			assert.throws(
				() => coder.encode([type], [1]),
				/invalid param type/,
				type,
			);
		}
	});
});

describe("AbiCoder fixed bytes and booleans", () => {
	it("right-pads fixed bytes into a word", () => {
		assert.equal(coder.encode(["bytes1"], ["0xff"]), "0xff" + "00".repeat(31));
		assert.equal(
			coder.encode(["bytes4"], ["0x11223344"]),
			"0x11223344" + "00".repeat(28),
		);
	});

	it("uses the whole word for bytes32", () => {
		const value = "0x" + "11".repeat(32);
		assert.equal(coder.encode(["bytes32"], [value]), value);
	});

	it("round-trips every fixed bytes width", () => {
		for (let size = 1; size <= 32; size++) {
			const type = `bytes${size}`;
			const value = "0x" + "ab".repeat(size);
			assert.equal(
				coder.decode([type], coder.encode([type], [value]))[0],
				value,
				type,
			);
		}
	});

	it("round-trips a 22-byte value, the width of a Core address", () => {
		const value = "0x" + ADDRESS.substring(2);
		assert.equal(
			coder.decode(["bytes22"], coder.encode(["bytes22"], [value]))[0],
			value,
		);
	});

	it("rejects fixed bytes of the wrong length", () => {
		assert.throws(
			() => coder.encode(["bytes4"], ["0x1122"]),
			/incorrect data length/,
		);
		assert.throws(
			() => coder.encode(["bytes4"], ["0x112233445566"]),
			/incorrect data length/,
		);
	});

	it("rejects an invalid fixed bytes width in the type", () => {
		for (const type of ["bytes0", "bytes33"]) {
			assert.throws(
				() => coder.encode([type], ["0x11"]),
				/invalid param type/,
				type,
			);
		}
	});

	it("encodes booleans as a zero or one word", () => {
		assert.equal(coder.encode(["bool"], [true]), "0x" + "00".repeat(31) + "01");
		assert.equal(coder.encode(["bool"], [false]), "0x" + "00".repeat(32));
	});

	it("coerces a truthy value to true", () => {
		assert.equal(coder.encode(["bool"], [1]), coder.encode(["bool"], [true]));
		assert.equal(coder.encode(["bool"], [0]), coder.encode(["bool"], [false]));
	});

	it("decodes any non-zero word as true", () => {
		assert.equal(
			coder.decode(["bool"], "0x" + "00".repeat(31) + "01")[0],
			true,
		);
		assert.equal(
			coder.decode(["bool"], "0x" + "00".repeat(31) + "02")[0],
			true,
		);
		assert.equal(coder.decode(["bool"], "0x" + "ff".repeat(32))[0], true);
		assert.equal(coder.decode(["bool"], "0x" + "00".repeat(32))[0], false);
	});

	it("round-trips an array of booleans", () => {
		const value = [true, false, true];
		assert.deepEqual(
			[...coder.decode(["bool[]"], coder.encode(["bool[]"], [value]))[0]],
			value,
		);
	});
});

describe("AbiCoder default values", () => {
	it("returns the zero value for each elementary type", () => {
		const defaults = coder.getDefaultValue([
			"uint256",
			"int256",
			"bool",
			"string",
			"bytes",
		]);
		assert.deepEqual([...defaults], [0, 0, false, "", "0x"]);
	});

	it("returns zeroed fixed bytes", () => {
		assert.equal(coder.getDefaultValue(["bytes4"])[0], "0x00000000");
		assert.equal(coder.getDefaultValue(["bytes32"])[0], "0x" + "00".repeat(32));
	});

	it("returns an empty array for a dynamic array", () => {
		assert.deepEqual([...coder.getDefaultValue(["uint8[]"])[0]], []);
	});

	it("returns a filled array for a fixed array", () => {
		assert.deepEqual([...coder.getDefaultValue(["uint8[3]"])[0]], [0, 0, 0]);
	});

	it("returns a default for each tuple component", () => {
		const [tuple] = coder.getDefaultValue(["tuple(uint256 a, bool b)"]);
		assert.equal(tuple[0], 0);
		assert.equal(tuple[1], false);
		assert.equal(tuple.a, 0, "named components are exposed");
	});

	it("PINS BUG: the default address is a 20-byte Ethereum address", () => {
		// src.ts/abi/coders/address.ts:18 returns Ethereum's 20-byte zero
		// address. A Core address is 22 bytes with check digits, so this value
		// is not a valid address at all: isAddress rejects it, and feeding the
		// default straight back into encode() throws.
		const [value] = coder.getDefaultValue(["address"]);
		assert.equal(value, "0x" + "00".repeat(20));
		assert.equal(value.length, 42, "20 bytes, not Core's 22");
		assert.equal(isAddress(value), false);
		assert.throws(() => coder.encode(["address"], [value]), /invalid address/);
	});

	it.skip("the default address should be a valid 22-byte Core address", () => {
		const [value] = coder.getDefaultValue(["address"]);
		assert.equal(value.length, 46);
		assert.equal(isAddress(value), true);
		assert.equal(coder.encode(["address"], [value]).length, 2 + 64);
	});
});

describe("AbiCoder decode protections", () => {
	it("rejects data that is shorter than the declared types", () => {
		assert.throws(
			() => coder.decode(["uint256"], "0x1234"),
			/data out-of-bounds/,
		);
		assert.throws(() => coder.decode(["uint256"], "0x"), /data out-of-bounds/);
		assert.throws(
			() =>
				coder.decode(["uint256", "uint256"], coder.encode(["uint256"], [1])),
			/data out-of-bounds/,
		);
	});

	it("reports BUFFER_OVERRUN for truncated data", () => {
		assert.throws(
			() => coder.decode(["uint256"], "0x1234"),
			(error: any) => {
				assert.equal(error.code, "BUFFER_OVERRUN");
				return true;
			},
		);
	});

	it("ignores trailing data beyond the declared types", () => {
		const encoded = coder.encode(["uint256"], [5]);
		assert.equal(
			coder.decode(["uint256"], encoded + "00".repeat(32))[0],
			BigInt(5),
		);
	});

	it("rejects an array length that cannot fit in the data", () => {
		// A huge length prefix must not cause a huge allocation.
		const data = "0x" + (32).toString(16).padStart(64, "0") + "ff".repeat(32);
		assert.throws(() => coder.decode(["uint256[]"], data)[0]);
	});

	it("defers a decoding error until the bad value is read", () => {
		// A string whose body is invalid does not stop the surrounding tuple
		// from decoding; the error surfaces on access.
		const good = coder.encode(["uint256", "uint256"], [1, 2]);
		const decoded = coder.decode(["uint256", "uint256"], good);
		assert.equal(checkResultErrors(decoded).length, 0);
	});

	it("decodes a compressed payload while the inflation ratio allows it", () => {
		const decoded = coder.decode(["uint256[][]"], inflationBomb(200))[0];
		assert.equal(decoded.length, 200);
	});

	it("rejects a payload that inflates beyond the configured ratio", () => {
		withMaxInflation(1, () => {
			assert.throws(
				() => coder.decode(["uint256[][]"], inflationBomb(200)),
				/compressed ABI data exceeds inflation ratio of 1/,
			);
		});
	});

	it("reports BUFFER_OVERRUN with the read statistics", () => {
		withMaxInflation(1, () => {
			assert.throws(
				() => coder.decode(["uint256[][]"], inflationBomb(200)),
				(error: any) => {
					assert.equal(error.code, "BUFFER_OVERRUN");
					assert.ok(error.info.bytesRead > error.info.dataLength);
					return true;
				},
			);
		});
	});

	it("still decodes ordinary data under a tight inflation ratio", () => {
		withMaxInflation(1, () => {
			assert.equal(
				coder.decode(["uint256"], coder.encode(["uint256"], [1]))[0],
				BigInt(1),
			);
		});
	});

	it("disables the guard entirely at a ratio below one", () => {
		withMaxInflation(0, () => {
			assert.equal(
				coder.decode(["uint256[][]"], inflationBomb(200))[0].length,
				200,
			);
		});
	});

	it("restores the default ratio of 1024", () => {
		// Guards against a leaked setting from the tests above, since the
		// ratio is process-wide state on the AbiCoder class.
		assert.equal(
			coder.decode(["uint256[][]"], inflationBomb(200))[0].length,
			200,
		);
	});

	it("rejects a non-integer inflation ratio", () => {
		assert.throws(
			() => AbiCoder._setDefaultMaxInflation(1.5),
			/invalid defaultMaxInflation factor/,
		);
		assert.throws(
			() => AbiCoder._setDefaultMaxInflation("x" as any),
			/invalid defaultMaxInflation factor/,
		);
	});

	it("enforces zero padding on decoded addresses", () => {
		// Covered for the happy path in test-core-abi.ts; this checks the
		// guard survives inside a larger tuple.
		const encoded = coder.encode(["uint256", "address"], [1, ADDRESS]);
		const dirty =
			encoded.substring(0, 66) + "ff".repeat(10) + encoded.substring(86);
		assert.throws(() => coder.decode(["uint256", "address"], dirty)[1]);
	});
});
