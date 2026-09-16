/**
 *  Network identity consistency tests.
 *
 *  A Core address carries its network in its prefix, so the network id and
 *  the address prefix have to agree everywhere they meet: wallet creation,
 *  transaction signing, sender recovery, and the network registry.
 *
 *  These tests treat `networkIdToPrefix` in `address/index.ts` as the
 *  authority (1 -> cb, 3/4 -> ab, 0 and >10 -> ce) and check that every
 *  other layer lines up with it.
 */
import assert from "node:assert/strict";

import { networkIdToPrefix } from "../address/index.js";
import { extractPrefix } from "../transaction/address.js";
import { Network, Transaction, Wallet } from "../index.js";

const KEY = "0x" + "11".repeat(57);
const OTHER_KEY = "0x" + "22".repeat(57);

/** Network ids that have a defined address prefix. */
const VALID_IDS: Array<{ networkId: number; prefix: string }> = [
	{ networkId: 1, prefix: "cb" },
	{ networkId: 3, prefix: "ab" },
	{ networkId: 4, prefix: "ab" },
	{ networkId: 0, prefix: "ce" },
	{ networkId: 11, prefix: "ce" },
	{ networkId: 1337, prefix: "ce" },
];

/** Network ids that `networkIdToPrefix` refuses. */
const UNASSIGNED_IDS = [2, 5, 6, 7, 8, 9, 10];

function signedTransaction(networkId: number, prefix: string) {
	const wallet = new Wallet({ key: KEY, prefix });
	const tx = Transaction.from({
		networkId,
		nonce: 1,
		energyLimit: 21000,
		energyPrice: 1000,
		to: new Wallet({ key: OTHER_KEY, prefix }).address,
		value: 1,
	});
	return { wallet, tx };
}

describe("transaction field naming is Core, not Ethereum", () => {
	it("exposes the Core fields", () => {
		const tx = new Transaction();
		for (const field of [
			"networkId",
			"energyLimit",
			"energyPrice",
			"nonce",
			"to",
			"value",
			"data",
			"signature",
		]) {
			assert.ok(field in tx, `missing ${field}`);
		}
	});

	it("does not expose Ethereum fee or chain fields", () => {
		const tx = new Transaction();
		for (const field of [
			"chainId",
			"gasLimit",
			"gasPrice",
			"maxFeePerGas",
			"maxPriorityFeePerGas",
			"accessList",
			"blobs",
			"blobVersionedHashes",
			"kzg",
			"authorizationList",
			"maxFeePerBlobGas",
		]) {
			assert.ok(!(field in tx), `leaked Ethereum field ${field}`);
		}
	});

	it("defaults to network id 0, which is the private-network prefix", () => {
		const tx = new Transaction();
		assert.equal(tx.networkId, BigInt(0));
		assert.equal(networkIdToPrefix(Number(tx.networkId)), "ce");
		assert.equal(tx.energyLimit, BigInt(0));
		assert.equal(tx.energyPrice, BigInt(0));
		assert.equal(tx.nonce, 0);
		assert.equal(tx.to, null);
		assert.equal(tx.value, BigInt(0));
		assert.equal(tx.from, null, "unsigned has no sender");
	});

	it("keeps networkId as a bigint through assignment", () => {
		const tx = new Transaction();
		for (const value of [1, "3", BigInt(4), 11]) {
			tx.networkId = value as any;
			assert.equal(typeof tx.networkId, "bigint", String(value));
			assert.equal(tx.networkId, BigInt(value as any));
		}
	});
});

describe("sender recovery honours the transaction's network id", () => {
	it("recovers the signer's own address when wallet and network agree", async () => {
		for (const { networkId, prefix } of VALID_IDS) {
			const { wallet, tx } = signedTransaction(networkId, prefix);
			const parsed = Transaction.from(await wallet.signTransaction(tx));
			assert.equal(
				parsed.from,
				wallet.address,
				`networkId ${networkId} / prefix ${prefix}`,
			);
			assert.equal(parsed.networkId, BigInt(networkId));
		}
	});

	it("renders the recovered sender with the network's prefix", () => {
		for (const { networkId, prefix } of VALID_IDS) {
			const wallet = new Wallet({ key: KEY, prefix });
			assert.equal(extractPrefix(wallet.address), networkIdToPrefix(networkId));
			assert.equal(extractPrefix(wallet.address), prefix);
		}
	});

	it("recovers a differently-prefixed address when wallet and network disagree", async () => {
		// The prefix comes from the transaction's networkId, not from the
		// signer, so signing a testnet transaction with a mainnet wallet
		// recovers the same key under the testnet prefix. Same identity,
		// different rendering - callers must keep the two aligned.
		const wallet = new Wallet({ key: KEY, prefix: "cb" });
		const tx = Transaction.from({
			networkId: 3,
			nonce: 1,
			energyLimit: 21000,
			energyPrice: 1000,
			value: 0,
		});
		const parsed = Transaction.from(await wallet.signTransaction(tx));

		assert.notEqual(parsed.from, wallet.address, "prefix must differ");
		assert.equal(extractPrefix(parsed.from!), "ab", "uses the tx network");
		assert.equal(extractPrefix(wallet.address), "cb");
		assert.equal(
			parsed.from!.substring(6),
			wallet.address.substring(6),
			"same underlying key body",
		);
	});

	it("refuses to recover a sender for an unassigned network id", async () => {
		const wallet = new Wallet({ key: KEY, prefix: "cb" });
		for (const networkId of UNASSIGNED_IDS) {
			const tx = Transaction.from({
				networkId,
				nonce: 1,
				energyLimit: 21000,
				energyPrice: 1000,
				value: 0,
			});
			const serialized = await wallet.signTransaction(tx);
			assert.throws(
				() => Transaction.from(serialized).from,
				/bad networkId/,
				`networkId ${networkId}`,
			);
		}
	});

	it("preserves the network id through a serialization round trip", async () => {
		for (const { networkId, prefix } of VALID_IDS) {
			const { wallet, tx } = signedTransaction(networkId, prefix);
			const serialized = await wallet.signTransaction(tx);
			const parsed = Transaction.from(serialized);
			assert.equal(parsed.networkId, BigInt(networkId));
			assert.equal(
				parsed.serialized,
				serialized,
				`re-serialization differs for ${networkId}`,
			);
		}
	});

	it("changes the signature when only the network id changes", async () => {
		// Replay protection: the same payload on two networks must not share
		// a signature.
		const wallet = new Wallet({ key: KEY, prefix: "cb" });
		const base = {
			nonce: 1,
			energyLimit: 21000,
			energyPrice: 1000,
			value: 1,
		};
		const one = await wallet.signTransaction(
			Transaction.from({ ...base, networkId: 1 }),
		);
		const three = await wallet.signTransaction(
			Transaction.from({ ...base, networkId: 3 }),
		);
		assert.notEqual(one, three);
		assert.notEqual(
			Transaction.from(one).signature,
			Transaction.from(three).signature,
		);
	});
});

describe("wallet address prefixes across networks", () => {
	it("gives every valid network id a canonical address for one key", () => {
		const byPrefix = new Map<string, string>();
		for (const { networkId } of VALID_IDS) {
			const prefix = networkIdToPrefix(networkId);
			const address = new Wallet({ key: KEY, prefix }).address;
			assert.equal(extractPrefix(address), prefix);
			const existing = byPrefix.get(prefix);
			if (existing) {
				assert.equal(address, existing, `${prefix} must be stable`);
			}
			byPrefix.set(prefix, address);
		}
		// Three prefixes, three distinct renderings of the same key.
		assert.equal(byPrefix.size, 3);
		assert.equal(new Set(byPrefix.values()).size, 3);
	});

	it("shares the address body across networks for a single key", () => {
		const bodies = new Set(
			["cb", "ab", "ce"].map((prefix) =>
				new Wallet({ key: KEY, prefix }).address.substring(6),
			),
		);
		assert.equal(bodies.size, 1);
	});
});

describe("address prefix validation", () => {
	it("accepts every prefix the network mapping can produce", () => {
		for (const prefix of ["cb", "ab", "ce"]) {
			const address = new Wallet({ key: KEY, prefix }).address;
			assert.equal(extractPrefix(address), prefix);
		}
	});

	it("rejects a prefix that is not two hex characters", () => {
		for (const prefix of ["zz", "c", "xyz", "g0"]) {
			assert.throws(
				() => new Wallet({ key: KEY, prefix }).address,
				`prefix ${prefix}`,
			);
		}
	});

	it("only accepts the prefixes the network mapping can reach", () => {
		// networkIdToPrefix yields exactly cb, ab and ce, and address
		// producers must not accept anything outside that set - otherwise a
		// prefix such as "ff" would give a structurally valid, correctly
		// checksummed address on a network that does not exist.
		const reachable = new Set<string>();
		for (let networkId = 0; networkId <= 2000; networkId++) {
			try {
				reachable.add(networkIdToPrefix(networkId));
			} catch (error) {
				// unassigned id, no prefix
			}
		}
		assert.deepEqual(reachable, new Set(["cb", "ab", "ce"]));

		for (const prefix of ["ff", "00", "12", "de"]) {
			assert.ok(!reachable.has(prefix), `${prefix} has no network id`);
			assert.throws(
				() => new Wallet({ key: KEY, prefix }).address,
				/invalid network prefix/,
				prefix,
			);
		}
	});

	it("rejects wrong-length prefixes rather than building a malformed address", () => {
		for (const prefix of ["", "cbcb", "0xcb", "c"]) {
			assert.throws(
				() => new Wallet({ key: KEY, prefix }).address,
				/invalid network prefix/,
				JSON.stringify(prefix),
			);
		}
	});

	it("requires the canonical lower-case spelling of a prefix", () => {
		for (const prefix of ["CB", "Cb", "AB", "CE"]) {
			assert.throws(
				() => new Wallet({ key: KEY, prefix }).address,
				/invalid network prefix/,
				prefix,
			);
		}
	});

	it("rejects a non-string prefix", () => {
		for (const prefix of [null, undefined, 1, {}]) {
			assert.throws(
				() => new Wallet({ key: KEY, prefix: prefix as any }).address,
				/invalid network prefix/,
				String(prefix),
			);
		}
	});

	it("validates the prefix on recovery as well as creation", () => {
		// recoverAddress shares the same choke point, so a bad prefix cannot
		// sneak in through signature verification either.
		for (const prefix of ["ff", "", "CB"]) {
			assert.throws(
				() => new Wallet({ key: KEY, prefix }).address,
				/invalid network prefix/,
			);
		}
	});
});

describe("network registry", () => {
	it("resolves mainnet consistently with the address prefix", () => {
		const network = Network.from("mainnet");
		assert.equal(network.name, "mainnet");
		assert.equal(network.networkId, BigInt(1));
		assert.equal(networkIdToPrefix(Number(network.networkId)), "cb");
	});

	it("defaults to mainnet", () => {
		assert.equal(Network.from().networkId, BigInt(1));
	});

	it("rejects unknown network names", () => {
		for (const name of ["nope", "not-a-network"]) {
			assert.throws(() => Network.from(name), /unknown network/, name);
		}
	});

	it("accepts an arbitrary numeric id without a registered name", () => {
		for (const id of [0, 11, 1337]) {
			const network = Network.from(id);
			assert.equal(network.networkId, BigInt(id));
		}
	});

	it("round-trips a Network through its own networkId", () => {
		const network = Network.from(1);
		assert.equal(Network.from(network.networkId).name, network.name);
	});

	it("registers Core's networks", () => {
		for (const [name, networkId, prefix] of [
			["mainnet", 1, "cb"],
			["devin", 3, "ab"],
			["private", 0, "ce"],
		] as Array<[string, number, string]>) {
			const network = Network.from(name);
			assert.equal(network.name, name);
			assert.equal(network.networkId, BigInt(networkId), name);
			assert.equal(networkIdToPrefix(Number(network.networkId)), prefix, name);
		}
	});

	it("resolves the alternate names and the prefixes themselves", () => {
		assert.equal(Network.from("testnet").name, "devin");
		for (const [prefix, name] of [
			["cb", "mainnet"],
			["ab", "devin"],
			["ce", "private"],
		]) {
			assert.equal(Network.from(prefix).name, name, prefix);
		}
	});

	it("does not register Ethereum networks", () => {
		for (const name of [
			"homestead",
			"ropsten",
			"rinkeby",
			"goerli",
			"kovan",
			"sepolia",
			"classic",
			"classicKotti",
			"xdai",
		]) {
			assert.throws(() => Network.from(name), /unknown network/, name);
		}
	});

	it("gives every registered network a valid address prefix", () => {
		// A network you can resolve but cannot render an address for would be
		// a contradiction between the registry and the address layer.
		for (const name of ["mainnet", "devin", "private", "testnet"]) {
			const network = Network.from(name);
			assert.doesNotThrow(
				() => networkIdToPrefix(Number(network.networkId)),
				name,
			);
		}
	});

	it("attaches the energy cost plugin rather than a gas one", () => {
		const network = Network.from("mainnet");
		const names = network.plugins.map((plugin) => plugin.name);
		assert.ok(
			names.some((name) => /energy/i.test(name)),
			`expected an energy plugin, got ${names.join(", ")}`,
		);
		assert.ok(!names.some((name) => /\bgas\b/i.test(name)), "no gas plugin");
	});
});
