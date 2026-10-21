/**
 *  ICAN address tests.
 *
 *  Core addresses are 22 bytes rendered as 44 hex characters:
 *
 *      0x | cb | 75 | 2fc23fb7d806a0ed2276d53c991b8eb52d4cac41
 *           ^    ^    ^
 *           |    |    40 hex chars (20 bytes) of key/contract material
 *           |    2 decimal check digits (ISO 13616 style, mod 97)
 *           network prefix, which is also valid hex (cb/ab/ce)
 *
 *  The check digits are computed over the body *and* the prefix, so an
 *  address cannot be moved between networks by rewriting its prefix. That
 *  binding is what most of these tests exercise.
 */
import assert from "node:assert/strict";

import {
	getAddress,
	getIcapAddress,
	calculateCheckSum,
	isNetworkPrefix,
	networkIdToPrefix,
	networkPrefixes,
	prefixToNetworkId,
	getContractAddress,
} from "../address/index.js";
import {
	computeAddress,
	publicToAddress,
	extractPrefix,
} from "../transaction/address.js";
import {
	getCreate2Address,
	getCreateAddress,
	hexlify,
	isAddress,
	HDNodeWallet,
	Mnemonic,
	SigningKey,
	Wallet,
} from "../index.js";

/** Every prefix the library will produce, with a network id that yields it. */
const PREFIXES: Array<{ prefix: string; networkId: number; label: string }> = [
	{ prefix: "cb", networkId: 1, label: "mainnet" },
	{ prefix: "ab", networkId: 3, label: "testnet" },
	{ prefix: "ce", networkId: 0, label: "private" },
];

/** Deterministic 57-byte Ed448 private keys. Test material only. */
function testKey(seed: number): string {
	const bytes = new Uint8Array(57);
	for (let i = 0; i < 57; i++) {
		bytes[i] = (seed * 7 + i * 13 + 1) % 256;
	}
	return hexlify(bytes);
}

const KEY = "0x" + "11".repeat(57);
const ADDRESSES = Object.fromEntries(
	PREFIXES.map(({ prefix }) => [
		prefix,
		new Wallet({ key: KEY, prefix }).address,
	]),
) as Record<string, string>;

describe("ICAN address format", () => {
	it("accepts a canonical address and is idempotent", () => {
		const address = ADDRESSES.cb;
		assert.equal(getAddress(address), address);
		assert.equal(getAddress(getAddress(address)), address);
	});

	it("accepts an address without the 0x prefix and adds it", () => {
		const address = ADDRESSES.cb;
		assert.equal(getAddress(address.substring(2)), address);
	});

	it("is 44 hex characters split into prefix, check digits and body", () => {
		for (const { prefix } of PREFIXES) {
			const address = ADDRESSES[prefix];
			assert.equal(address.length, 46, `${prefix}: 0x + 44 chars`);
			assert.match(address, /^0x[0-9a-f]{44}$/);
			assert.equal(address.substring(2, 4), prefix);
			assert.match(address.substring(4, 6), /^[0-9]{2}$/);
			assert.equal(address.substring(6).length, 40);
		}
	});

	it("rejects every incorrect length", () => {
		const address = ADDRESSES.cb;
		const bad = [
			"0x",
			"",
			address.substring(0, address.length - 1),
			address + "0",
			"0x" + "1".repeat(40), // an Ethereum-sized address
			"0x" + "1".repeat(43),
			"0x" + "1".repeat(45),
			"0x" + "0".repeat(64),
		];
		for (const value of bad) {
			assert.throws(() => getAddress(value), /invalid address/, value);
		}
	});

	it("rejects non-hex characters", () => {
		for (const value of [
			"0x" + "z".repeat(44),
			"0x" + "g" + "1".repeat(43),
			"0xcb75 fc23fb7d806a0ed2276d53c991b8eb52d4cac41",
			"cb75-fc23fb7d806a0ed2276d53c991b8eb52d4cac4",
		]) {
			assert.throws(() => getAddress(value), /invalid address/, value);
		}
	});

	it("rejects non-string values", () => {
		for (const value of [
			123,
			0,
			null,
			undefined,
			{},
			[],
			true,
			new Uint8Array(22),
			BigInt(1),
		]) {
			assert.throws(() => getAddress(value as any), /invalid address/);
		}
	});

	it("reports validity through isAddress without throwing", () => {
		for (const { prefix } of PREFIXES) {
			assert.equal(isAddress(ADDRESSES[prefix]), true, prefix);
		}
		for (const value of ["0x", "not an address", null, 5, {}]) {
			assert.equal(isAddress(value as any), false, String(value));
		}
	});

	it("accepts the raw all-zero address and precompiles without a checksum", () => {
		for (const last of "0123456789") {
			const address = "0x" + "0".repeat(43) + last;
			assert.equal(getAddress(address), address);
			assert.equal(isAddress(address), true);
		}
		assert.throws(() => getAddress("0x" + "0".repeat(42) + "10"), /checksum/);
	});
});

describe("ICAN checksum", () => {
	it("produces two decimal check digits in the range 02-98", () => {
		// 98 - (n mod 97) can only land in [2, 98], and is rendered as two
		// decimal digits, so no check digit ever contains a-f.
		const seen = new Set<string>();
		for (let i = 0; i < 200; i++) {
			const address = new Wallet({ key: testKey(i), prefix: "cb" }).address;
			const check = address.substring(4, 6);
			assert.match(check, /^[0-9]{2}$/, address);
			const value = parseInt(check, 10);
			assert.ok(value >= 2 && value <= 98, `${check} out of range`);
			seen.add(check);
		}
		// Sanity: the check digits actually vary rather than being constant.
		assert.ok(seen.size > 50, `only ${seen.size} distinct check digits`);
	});

	it("detects essentially all single-character corruption of the body", () => {
		// A mod-97 checksum has a residual collision rate of about 1/97, so a
		// small number of single-character edits are expected to slip through.
		// This pins the rate rather than claiming perfection.
		let caught = 0;
		let total = 0;
		for (let seed = 0; seed < 20; seed++) {
			const address = new Wallet({ key: testKey(seed), prefix: "cb" }).address;
			for (let i = 6; i < address.length; i++) {
				for (const replacement of "0123456789abcdef") {
					if (address[i] === replacement) {
						continue;
					}
					const corrupted =
						address.substring(0, i) + replacement + address.substring(i + 1);
					total++;
					if (!isAddress(corrupted)) {
						caught++;
					}
				}
			}
		}
		assert.equal(total, 20 * 40 * 15);
		const rate = caught / total;
		assert.ok(
			rate > 0.98,
			`detection rate ${(rate * 100).toFixed(2)}% too low`,
		);
	});

	it("detects corruption of the check digits themselves", () => {
		const address = ADDRESSES.cb;
		for (let i = 4; i < 6; i++) {
			for (const replacement of "0123456789") {
				if (address[i] === replacement) {
					continue;
				}
				const corrupted =
					address.substring(0, i) + replacement + address.substring(i + 1);
				assert.throws(() => getAddress(corrupted), /checksum/, corrupted);
			}
		}
	});

	it("computes check digits over the body and the prefix together", () => {
		const body = ADDRESSES.cb.substring(6);
		for (const { prefix } of PREFIXES) {
			assert.equal(
				calculateCheckSum(body, prefix),
				ADDRESSES[prefix].substring(4, 6),
				prefix,
			);
		}
	});

	it("is stable and independent of input case or 0x prefixes", () => {
		const body = ADDRESSES.cb.substring(6);
		const expected = calculateCheckSum(body, "cb");
		assert.equal(calculateCheckSum("0x" + body, "cb"), expected);
		assert.equal(calculateCheckSum(body.toUpperCase(), "cb"), expected);
		assert.equal(calculateCheckSum(body, "0xcb"), expected);
	});
});

describe("network id to address prefix", () => {
	it("maps each known network id to its prefix", () => {
		assert.equal(networkIdToPrefix(1), "cb", "mainnet");
		assert.equal(networkIdToPrefix(3), "ab", "testnet");
		assert.equal(networkIdToPrefix(4), "ab", "testnet variant");
		assert.equal(networkIdToPrefix(0), "ce", "private");
		for (const id of [11, 12, 100, 1337, 65535]) {
			assert.equal(networkIdToPrefix(id), "ce", `private id ${id}`);
		}
	});

	it("rejects the reserved and unassigned ids", () => {
		// 2 and 5..10 sit between the assigned ranges and have no prefix.
		for (const id of [2, 5, 6, 7, 8, 9, 10]) {
			assert.throws(() => networkIdToPrefix(id), /bad networkId/, `id ${id}`);
		}
	});

	it("rejects negative ids, NaN and fractional ids below the private range", () => {
		for (const id of [-1, -100, 1.5, 3.0001, 9.5, NaN, -Infinity]) {
			assert.throws(() => networkIdToPrefix(id), /bad networkId/, `id ${id}`);
		}
	});

	it("requires a non-negative integer", () => {
		for (const id of [10.5, 11.5, 0.5, Infinity, -Infinity, NaN]) {
			assert.throws(() => networkIdToPrefix(id), /bad networkId/, `id ${id}`);
		}
		// Large but genuinely integral ids remain private networks.
		assert.equal(networkIdToPrefix(Number.MAX_SAFE_INTEGER), "ce");
	});

	it("maps a prefix back to its canonical network id", () => {
		assert.equal(prefixToNetworkId("cb"), 1);
		assert.equal(prefixToNetworkId("ab"), 3);
		assert.equal(prefixToNetworkId("ce"), 0);
	});

	it("tolerates case and a 0x on the way back", () => {
		for (const prefix of ["CB", "0xcb", "0xCB", "cb"]) {
			assert.equal(prefixToNetworkId(prefix), 1, prefix);
		}
	});

	it("rejects a prefix that belongs to no network", () => {
		for (const prefix of ["ff", "00", "", "cbcb", "zz", "c"]) {
			assert.throws(
				() => prefixToNetworkId(prefix),
				/bad address prefix/,
				JSON.stringify(prefix),
			);
		}
	});

	it("round-trips prefix -> id -> prefix for every network", () => {
		for (const prefix of networkPrefixes) {
			assert.equal(networkIdToPrefix(prefixToNetworkId(prefix)), prefix);
		}
	});

	it("recognizes exactly the three network prefixes", () => {
		assert.deepEqual([...networkPrefixes], ["cb", "ab", "ce"]);
		for (const prefix of networkPrefixes) {
			assert.equal(isNetworkPrefix(prefix), true, prefix);
		}
		for (const prefix of ["ff", "00", "CB", "", "cbcb", "zz"]) {
			assert.equal(isNetworkPrefix(prefix), false, JSON.stringify(prefix));
		}
	});

	it("only ever produces lowercase two-character hex prefixes", () => {
		// The prefix doubles as the first byte of the address, so it has to be
		// valid hex as well as a readable network tag.
		const ids = [0, 1, 3, 4, 11, 500];
		for (const id of ids) {
			const prefix = networkIdToPrefix(id);
			assert.match(prefix, /^[0-9a-f]{2}$/, `id ${id} -> ${prefix}`);
			assert.equal(prefix, prefix.toLowerCase());
		}
		assert.deepEqual(
			new Set(ids.map(networkIdToPrefix)),
			new Set(["cb", "ab", "ce"]),
		);
	});
});

describe("address prefix consistency across producers", () => {
	it("honours the requested prefix in every address producer", () => {
		const key = new SigningKey(KEY);
		for (const { prefix } of PREFIXES) {
			const expected = ADDRESSES[prefix];

			assert.equal(
				new Wallet({ key: KEY, prefix }).address,
				expected,
				"Wallet",
			);
			assert.equal(computeAddress(KEY, prefix), expected, "computeAddress");
			assert.equal(
				computeAddress(key, prefix),
				expected,
				"computeAddress(SigningKey)",
			);
			assert.equal(
				publicToAddress(key.publicKey, prefix),
				expected,
				"publicToAddress",
			);
		}
	});

	it("derives HD wallets on the requested network prefix", () => {
		const phrase = Mnemonic.fromEntropy("0x" + "0f".repeat(16)).phrase;
		for (const { prefix } of PREFIXES) {
			const hd = HDNodeWallet.fromPhrase({ phrase, prefix });
			assert.equal(hd.address.substring(2, 4), prefix, prefix);
			assert.equal(getAddress(hd.address), hd.address, "canonical");
			// The prefix has to survive derivation, not just creation.
			for (const index of [0, 1, 7]) {
				const child = hd.deriveChild(index);
				assert.equal(child.address.substring(2, 4), prefix, `child ${index}`);
				assert.equal(getAddress(child.address), child.address);
			}
		}
	});

	it("round-trips the prefix through extractPrefix", () => {
		for (const { prefix } of PREFIXES) {
			assert.equal(extractPrefix(ADDRESSES[prefix]), prefix);
		}
	});

	it("keeps the same key body across networks, changing only prefix and checksum", () => {
		// One key is one identity; the network tag decides how it is rendered.
		const bodies = new Set(
			PREFIXES.map(({ prefix }) => ADDRESSES[prefix].substring(6)),
		);
		assert.equal(bodies.size, 1, "body must not depend on the prefix");

		const checks = new Set(
			PREFIXES.map(({ prefix }) => ADDRESSES[prefix].substring(4, 6)),
		);
		assert.equal(checks.size, PREFIXES.length, "check digits must differ");
	});

	it("agrees with the prefix implied by the network id", () => {
		for (const { prefix, networkId } of PREFIXES) {
			const address = computeAddress(KEY, networkIdToPrefix(networkId));
			assert.equal(address, ADDRESSES[prefix], `networkId ${networkId}`);
			assert.equal(extractPrefix(address), networkIdToPrefix(networkId));
		}
	});
});

describe("cross-network address safety", () => {
	it("rejects an address whose prefix was rewritten to another network", () => {
		// Retagging a mainnet address as testnet must not validate, otherwise
		// funds could be sent to the wrong network's address.
		for (const { prefix } of PREFIXES) {
			const original = ADDRESSES[prefix];
			for (const other of PREFIXES) {
				if (other.prefix === prefix) {
					continue;
				}
				const retagged = "0x" + other.prefix + original.substring(4);
				assert.throws(
					() => getAddress(retagged),
					/checksum/,
					`${prefix} -> ${other.prefix}`,
				);
			}
		}
	});

	it("produces a different address per network for the same key", () => {
		const addresses = PREFIXES.map(({ prefix }) => ADDRESSES[prefix]);
		assert.equal(new Set(addresses).size, addresses.length);
	});

	it("accepts a retagged address once its check digits are recomputed", () => {
		// The inverse of the test above: retagging is legitimate as long as the
		// checksum is recomputed, which is what the producers do.
		const body = ADDRESSES.cb.substring(6);
		for (const { prefix } of PREFIXES) {
			const rebuilt = "0x" + prefix + calculateCheckSum(body, prefix) + body;
			assert.equal(getAddress(rebuilt), ADDRESSES[prefix], prefix);
		}
	});
});

describe("contract addresses", () => {
	it("computes a CREATE address that depends on sender and nonce", () => {
		const from = ADDRESSES.cb;
		const seen = new Set<string>();
		for (const nonce of [0, 1, 2, 5, 255, 256, 65536]) {
			const address = getContractAddress({ from, nonce });
			assert.equal(getAddress(address), address, `nonce ${nonce} canonical`);
			assert.notEqual(address, from, "must not be the deployer");
			seen.add(address);
		}
		assert.equal(seen.size, 7, "each nonce yields a distinct address");
	});

	it("inherits the deployer's network prefix for CREATE", () => {
		for (const { prefix } of PREFIXES) {
			const address = getContractAddress({ from: ADDRESSES[prefix], nonce: 1 });
			assert.equal(extractPrefix(address), prefix, prefix);
		}
	});

	it("inherits the deployer's network prefix for CREATE2", () => {
		const salt = "0x" + "22".repeat(32);
		const initCodeHash = "0x" + "33".repeat(32);
		for (const { prefix } of PREFIXES) {
			const address = getCreate2Address(ADDRESSES[prefix], salt, initCodeHash);
			assert.equal(extractPrefix(address), prefix, prefix);
			assert.equal(getAddress(address), address, "canonical");
		}
	});

	it("varies the CREATE2 address by salt and init code hash", () => {
		const from = ADDRESSES.cb;
		const salt = "0x" + "22".repeat(32);
		const initCodeHash = "0x" + "33".repeat(32);
		const base = getCreate2Address(from, salt, initCodeHash);
		assert.notEqual(
			base,
			getCreate2Address(from, "0x" + "23".repeat(32), initCodeHash),
			"salt must matter",
		);
		assert.notEqual(
			base,
			getCreate2Address(from, salt, "0x" + "34".repeat(32)),
			"init code hash must matter",
		);
	});

	it("requires 32-byte salt and init code hash for CREATE2", () => {
		const from = ADDRESSES.cb;
		const ok = "0x" + "22".repeat(32);
		assert.throws(
			() => getCreate2Address(from, "0x2222", ok),
			/salt must be 32 bytes/,
		);
		assert.throws(
			() => getCreate2Address(from, ok, "0x3333"),
			/initCodeHash must be 32 bytes/,
		);
	});

	it("agrees between getCreateAddress and getContractAddress", () => {
		const from = ADDRESSES.cb;
		for (const nonce of [0, 1, 5, 256, 65536]) {
			assert.equal(
				getCreateAddress({ from, nonce }),
				getContractAddress({ from, nonce }),
				`nonce ${nonce}`,
			);
		}
	});

	it("makes getCreateAddress depend on the nonce and not equal the deployer", () => {
		const from = ADDRESSES.cb;
		assert.notEqual(getCreateAddress({ from, nonce: 5 }), from);
		assert.notEqual(
			getCreateAddress({ from, nonce: 1 }),
			getCreateAddress({ from, nonce: 99 }),
		);
		for (const { prefix } of PREFIXES) {
			assert.equal(
				extractPrefix(getCreateAddress({ from: ADDRESSES[prefix], nonce: 1 })),
				prefix,
			);
		}
	});

	it("does not write to stdout", () => {
		const written: Array<string> = [];
		const original = console.log;
		console.log = (...args: Array<any>) => written.push(args.join(" "));
		try {
			getCreate2Address(
				ADDRESSES.cb,
				"0x" + "22".repeat(32),
				"0x" + "33".repeat(32),
			);
		} finally {
			console.log = original;
		}
		assert.deepEqual(written, []);
	});
});

describe("ICAP / IBAN encoding", () => {
	it("encodes an address as an XE IBAN-style string", () => {
		const icap = getIcapAddress(ADDRESSES.cb);
		assert.equal(icap.substring(0, 2), "XE");
		assert.match(icap, /^XE[0-9]{2}[0-9A-Z]+$/);
		assert.equal(icap, getIcapAddress(ADDRESSES.cb), "deterministic");
	});

	it("gives a different ICAP string per network", () => {
		const icaps = PREFIXES.map(({ prefix }) =>
			getIcapAddress(ADDRESSES[prefix]),
		);
		assert.equal(new Set(icaps).size, icaps.length);
	});

	it("rejects input that is not a valid address", () => {
		assert.throws(() => getIcapAddress("0x1234"), /invalid address/);
	});

	it("getAddress round-trips ICAP addresses", () => {
		// getAddress documents ICAP input as supported; its length and charset
		// check used to reject the XE form outright.
		assert.equal(getAddress(getIcapAddress(ADDRESSES.cb)), ADDRESSES.cb);
	});

	it("round-trips an ICAP address on every network", () => {
		for (const { prefix } of PREFIXES) {
			const address = ADDRESSES[prefix];
			assert.equal(getAddress(getIcapAddress(address)), address, prefix);
		}
	});

	it("round-trips addresses whose numeric value is extreme", () => {
		// The body is the address read as a base-36 number, so leading zero
		// bytes and a full-width value are the interesting cases.
		for (const { prefix } of PREFIXES) {
			for (const body of [
				"00".repeat(20),
				"ff".repeat(20),
				"00" + "ff".repeat(19),
				"0065a16059864a2fdbc7c99a4723a8395bc6f188",
			]) {
				const address = getAddress(
					"0x" + prefix + calculateCheckSum(body, prefix) + body,
				);
				assert.equal(
					getAddress(getIcapAddress(address)),
					address,
					`${prefix}/${body.substring(0, 6)}`,
				);
			}
		}
	});

	it("rejects an ICAP address whose check digits were tampered with", () => {
		const icap = getIcapAddress(ADDRESSES.cb);
		const digits = icap.substring(2, 4);
		const tampered = "XE" + (digits === "00" ? "01" : "00") + icap.substring(4);
		assert.throws(() => getAddress(tampered), /bad icap checksum/);
	});

	it("rejects an ICAP address whose body was tampered with", () => {
		const icap = getIcapAddress(ADDRESSES.cb);
		const last = icap.substring(icap.length - 1);
		const tampered =
			icap.substring(0, icap.length - 1) + (last === "A" ? "B" : "A");
		assert.throws(() => getAddress(tampered), /icap|address/);
	});
});

describe("address case handling", () => {
	it("normalizes any input case to the canonical lower-case form", () => {
		// Core encodes its checksum in the check digits, not in
		// capitalization, so case carries no information and one address has
		// exactly one canonical spelling.
		const address = ADDRESSES.cb;
		for (const spelling of [
			address,
			"0x" + address.substring(2).toUpperCase(),
			"0x" + address.substring(2, 6) + address.substring(6).toUpperCase(),
			address.substring(2).toUpperCase(),
		]) {
			assert.equal(getAddress(spelling), address, spelling);
		}
	});

	it("validates an upper-case address rather than rejecting it", () => {
		const upper = "0x" + ADDRESSES.cb.substring(2).toUpperCase();
		assert.equal(isAddress(upper), true);
	});

	it("still rejects a bad checksum regardless of case", () => {
		const retagged = "ab" + ADDRESSES.cb.substring(4);
		assert.throws(() => getAddress("0x" + retagged), /checksum/);
		assert.throws(() => getAddress("0x" + retagged.toUpperCase()), /checksum/);
	});
});
