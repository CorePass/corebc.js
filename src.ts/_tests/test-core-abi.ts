/**
 *  ABI encoding tests for Core.
 *
 *  Two things differ from Ethereum and both are load-bearing:
 *
 *  - An ICAN address is 22 bytes, so it is left-padded with 10 zero bytes
 *    into a 32-byte word rather than Ethereum's 12.
 *  - Selectors and event topics are derived with Core's SHA3 hashing, so
 *    they do not match the well-known Ethereum values for the same
 *    signature.
 */
import assert from "node:assert/strict";

import {
	AbiCoder,
	Interface,
	Wallet,
	getAddress,
	id,
	isAddress,
} from "../index.js";

const KEY = "0x" + "11".repeat(57);
const PREFIXES = ["cb", "ab", "ce"];
const coder = AbiCoder.defaultAbiCoder();

function addressFor(prefix: string): string {
	return new Wallet({ key: KEY, prefix }).address;
}

describe("ABI address encoding", () => {
	it("packs a 22-byte address into one 32-byte word", () => {
		const address = addressFor("cb");
		const encoded = coder.encode(["address"], [address]);

		assert.equal((encoded.length - 2) / 2, 32, "one word");
		// 10 zero bytes of padding, then the 22 address bytes verbatim.
		assert.equal(encoded.substring(2, 22), "0".repeat(20));
		assert.equal(encoded.substring(22), address.substring(2));
	});

	it("round-trips addresses on every network prefix", () => {
		for (const prefix of PREFIXES) {
			const address = addressFor(prefix);
			const encoded = coder.encode(["address"], [address]);
			const [decoded] = coder.decode(["address"], encoded);
			assert.equal(decoded, address, prefix);
			assert.equal(isAddress(decoded), true, prefix);
			assert.equal(getAddress(decoded), decoded, "canonical");
		}
	});

	it("encodes different networks to different words", () => {
		const words = PREFIXES.map((prefix) =>
			coder.encode(["address"], [addressFor(prefix)]),
		);
		assert.equal(new Set(words).size, PREFIXES.length);
	});

	it("rejects Ethereum-sized addresses", () => {
		for (const bad of [
			"0x" + "11".repeat(20),
			"0x8ba1f109551bd432803012645ac136ddd64dba72",
		]) {
			assert.throws(() => coder.encode(["address"], [bad]), /invalid address/);
		}
	});

	it("rejects malformed address input", () => {
		for (const bad of [
			"0x1234",
			"",
			"not-an-address",
			"0x" + "11".repeat(32),
		]) {
			assert.throws(() => coder.encode(["address"], [bad]), /invalid address/);
		}
	});

	it("normalizes address case before encoding", () => {
		const address = addressFor("cb");
		assert.equal(
			coder.encode(["address"], ["0x" + address.substring(2).toUpperCase()]),
			coder.encode(["address"], [address]),
		);
	});

	it("rejects a word whose padding is not zero", () => {
		// Otherwise a 32-byte word could smuggle extra data past the decoder.
		const encoded = coder.encode(["address"], [addressFor("cb")]);
		const dirty = "0x" + "ff".repeat(10) + encoded.substring(22);
		assert.throws(() => coder.decode(["address"], dirty)[0]);
	});

	it("round-trips arrays and tuples of addresses", () => {
		const addresses = PREFIXES.map(addressFor);

		const [decodedArray] = coder.decode(
			["address[]"],
			coder.encode(["address[]"], [addresses]),
		);
		assert.deepEqual([...decodedArray], addresses);

		const [decodedTuple] = coder.decode(
			["tuple(address,uint256)"],
			coder.encode(["tuple(address,uint256)"], [[addresses[0], 5]]),
		);
		assert.equal(decodedTuple[0], addresses[0]);
		assert.equal(decodedTuple[1], BigInt(5));
	});

	it("round-trips a fixed-size address array", () => {
		const addresses = [addressFor("cb"), addressFor("ab")];
		const [decoded] = coder.decode(
			["address[2]"],
			coder.encode(["address[2]"], [addresses]),
		);
		assert.deepEqual([...decoded], addresses);
		assert.throws(() => coder.encode(["address[2]"], [[addresses[0]]]));
	});
});

describe("ABI selectors use Core hashing", () => {
	const iface = new Interface([
		"function transfer(address to, uint256 amount) returns (bool)",
		"function balanceOf(address owner) view returns (uint256)",
		"event Sent(address indexed from, uint256 amount)",
	]);

	it("derives the selector from Core's hash of the signature", () => {
		const selector = iface.getFunction("transfer")!.selector;
		assert.equal(selector, id("transfer(address,uint256)").substring(0, 10));
		assert.match(selector, /^0x[0-9a-f]{8}$/);
	});

	it("does not match the Ethereum selector for the same signature", () => {
		// Ethereum's keccak256-derived transfer selector is 0xa9059cbb. A
		// match here would mean the library reverted to Ethereum hashing.
		assert.notEqual(iface.getFunction("transfer")!.selector, "0xa9059cbb");
		assert.notEqual(iface.getFunction("balanceOf")!.selector, "0x70a08231");
	});

	it("gives distinct selectors to distinct functions", () => {
		const selectors = ["transfer", "balanceOf"].map(
			(name) => iface.getFunction(name)!.selector,
		);
		assert.equal(new Set(selectors).size, 2);
	});

	it("derives event topics from Core's hashing", () => {
		const topic = iface.getEvent("Sent")!.topicHash;
		assert.equal(topic, id("Sent(address,uint256)"));
		assert.match(topic, /^0x[0-9a-f]{64}$/);
	});
});

describe("ABI call data with Core addresses", () => {
	const iface = new Interface([
		"function transfer(address to, uint256 amount) returns (bool)",
		"event Sent(address indexed from, uint256 amount)",
	]);

	it("encodes and decodes call data round trip", () => {
		for (const prefix of PREFIXES) {
			const address = addressFor(prefix);
			const data = iface.encodeFunctionData("transfer", [address, 1]);
			assert.equal(
				data.substring(0, 10),
				iface.getFunction("transfer")!.selector,
			);

			const decoded = iface.decodeFunctionData("transfer", data);
			assert.equal(decoded[0], address, prefix);
			assert.equal(decoded[1], BigInt(1));
		}
	});

	it("encodes call data as selector plus two words", () => {
		const data = iface.encodeFunctionData("transfer", [addressFor("cb"), 1]);
		assert.equal((data.length - 2 - 8) / 2, 64, "two 32-byte words");
	});

	it("indexes an address topic as a padded word", () => {
		const address = addressFor("cb");
		const topics = iface.encodeFilterTopics("Sent", [address]);
		assert.equal(topics[0], iface.getEvent("Sent")!.topicHash);
		assert.equal(topics[1], "0x" + "0".repeat(20) + address.substring(2));
	});

	it("decodes event data back to the address", () => {
		const address = addressFor("cb");
		const decoded = iface.decodeEventLog(
			"Sent",
			coder.encode(["uint256"], [7]),
			iface.encodeFilterTopics("Sent", [address]) as Array<string>,
		);
		assert.equal(decoded[0], address);
		assert.equal(decoded[1], BigInt(7));
	});

	it("rejects call data whose selector does not match", () => {
		const data = iface.encodeFunctionData("transfer", [addressFor("cb"), 1]);
		const wrong = "0xdeadbeef" + data.substring(10);
		assert.throws(() => iface.decodeFunctionData("transfer", wrong));
	});
});
