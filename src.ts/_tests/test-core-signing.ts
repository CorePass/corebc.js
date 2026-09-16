/**
 *  Signing and recovery tests.
 *
 *  Core signs with Ed448 Goldilocks rather than secp256k1. A signature is
 *  171 bytes: the 114-byte Ed448 signature followed by the 57-byte public
 *  key, which is what makes sender recovery possible without a v parity
 *  byte. Recovery therefore actually verifies, so a bad signature raises
 *  instead of returning a junk address.
 *
 *  The recovered address's network prefix is supplied by the caller, so
 *  these tests also cover what happens when it disagrees with the signer.
 */
import assert from "node:assert/strict";

import {
	MessagePrefix,
	SigningKey,
	TypedDataEncoder,
	Wallet,
	hashMessage,
	sha256,
	verifyMessage,
	verifyTypedData,
} from "../index.js";
import { recoverAddress } from "../transaction/address.js";

const KEY = "0x" + "11".repeat(57);
const PREFIXES = ["cb", "ab", "ce"];

/** Ed448: 57-byte private key, 57-byte public key, 114-byte signature. */
const ED448_PRIVATE_BYTES = 57;
const ED448_PUBLIC_BYTES = 57;
const SIGNATURE_BYTES = 171;

function byteLength(hex: string): number {
	return (hex.length - 2) / 2;
}

describe("Ed448 key and signature shapes", () => {
	it("uses 57-byte private and public keys", () => {
		const key = new SigningKey(KEY);
		assert.equal(byteLength(key.privateKey), ED448_PRIVATE_BYTES);
		assert.equal(byteLength(key.publicKey), ED448_PUBLIC_BYTES);
	});

	it("produces 171-byte signatures carrying the public key", () => {
		const key = new SigningKey(KEY);
		const signature = String(key.sign(sha256("0x1234")));
		assert.equal(byteLength(signature), SIGNATURE_BYTES);
		// The trailing 57 bytes are the signer's public key, which is how
		// recovery works without a parity byte.
		assert.equal(
			"0x" + signature.slice(-ED448_PUBLIC_BYTES * 2),
			key.publicKey,
		);
	});

	it("signs deterministically", () => {
		const key = new SigningKey(KEY);
		const digest = sha256("0x1234");
		assert.equal(String(key.sign(digest)), String(key.sign(digest)));
	});

	it("rejects private keys that are not 57 bytes", () => {
		for (const bad of ["0x" + "11".repeat(32), "0x" + "11".repeat(56), "0x"]) {
			assert.throws(() => new SigningKey(bad));
		}
	});
});

describe("message signing", () => {
	it("prefixes messages with the Core signing prefix", () => {
		assert.equal(MessagePrefix, "\u0019Core Signed Message:\n");
		assert.ok(!MessagePrefix.includes("Ethereum"), "must not say Ethereum");
	});

	it("hashes strings and equivalent bytes identically", () => {
		assert.equal(
			hashMessage("hello"),
			hashMessage(new TextEncoder().encode("hello")),
		);
	});

	it("signs deterministically and verifies back to the signer", async () => {
		const wallet = new Wallet({ key: KEY, prefix: "cb" });
		const signature = await wallet.signMessage("hello");
		assert.equal(byteLength(signature), SIGNATURE_BYTES);
		assert.equal(signature, await wallet.signMessage("hello"), "deterministic");
		assert.equal(verifyMessage("hello", signature, "cb"), wallet.address);
	});

	it("signs strings and equivalent bytes identically", async () => {
		const wallet = new Wallet({ key: KEY, prefix: "cb" });
		assert.equal(
			await wallet.signMessage(new TextEncoder().encode("hello")),
			await wallet.signMessage("hello"),
		);
	});

	it("produces a different signature for a different message", async () => {
		const wallet = new Wallet({ key: KEY, prefix: "cb" });
		assert.notEqual(
			await wallet.signMessage("hello"),
			await wallet.signMessage("hello!"),
		);
	});

	it("signs the same message identically regardless of wallet prefix", async () => {
		// The prefix is a rendering concern for the address, not an input to
		// the signature.
		const signatures = await Promise.all(
			PREFIXES.map((prefix) =>
				new Wallet({ key: KEY, prefix }).signMessage("hello"),
			),
		);
		assert.equal(new Set(signatures).size, 1);
	});
});

describe("message recovery rejects tampering", () => {
	let signature: string;
	const wallet = new Wallet({ key: KEY, prefix: "cb" });

	before(async () => {
		signature = await wallet.signMessage("hello");
	});

	it("raises for a different message", () => {
		// Ed448 recovery verifies, so it cannot return a wrong-but-plausible
		// address the way secp256k1 ecrecover can.
		assert.throws(
			() => verifyMessage("hello!", signature, "cb"),
			/invalid signature/,
		);
		assert.throws(
			() => verifyMessage("", signature, "cb"),
			/invalid signature/,
		);
	});

	it("raises for a corrupted signature", () => {
		const flipFirst =
			"0x" + (signature[2] === "0" ? "1" : "0") + signature.substring(3);
		const flipLast =
			signature.substring(0, signature.length - 1) +
			(signature.slice(-1) === "0" ? "1" : "0");
		for (const bad of [flipFirst, flipLast]) {
			assert.throws(
				() => verifyMessage("hello", bad, "cb"),
				/invalid signature/,
			);
		}
	});

	it("raises for a truncated or empty signature", () => {
		for (const bad of [signature.slice(0, -2), signature.slice(0, 20), "0x"]) {
			assert.throws(
				() => verifyMessage("hello", bad, "cb"),
				/invalid signature/,
			);
		}
	});
});

describe("recovered address prefix", () => {
	it("renders the recovered signer under whichever prefix is requested", async () => {
		// One signature, one key, three valid renderings. Passing the wrong
		// prefix does not fail - it silently yields a different address
		// string, so callers must pass the prefix for their network.
		const wallet = new Wallet({ key: KEY, prefix: "cb" });
		const signature = await wallet.signMessage("hello");

		for (const prefix of PREFIXES) {
			const recovered = verifyMessage("hello", signature, prefix);
			assert.equal(recovered.substring(2, 4), prefix);
			assert.equal(
				recovered.substring(6),
				wallet.address.substring(6),
				"same key body",
			);
			assert.equal(
				recovered,
				new Wallet({ key: KEY, prefix }).address,
				`matches a ${prefix} wallet`,
			);
		}
	});

	it("only equals the signer's address for the signer's own prefix", async () => {
		const wallet = new Wallet({ key: KEY, prefix: "cb" });
		const signature = await wallet.signMessage("hello");
		assert.equal(verifyMessage("hello", signature, "cb"), wallet.address);
		for (const prefix of ["ab", "ce"]) {
			assert.notEqual(
				verifyMessage("hello", signature, prefix),
				wallet.address,
			);
		}
	});

	it("rejects a prefix that is not hex", async () => {
		const wallet = new Wallet({ key: KEY, prefix: "cb" });
		const signature = await wallet.signMessage("hello");
		for (const prefix of ["zz", "c", "xyz"]) {
			assert.throws(() => verifyMessage("hello", signature, prefix), prefix);
		}
	});

	it("recovers consistently through recoverAddress", async () => {
		const wallet = new Wallet({ key: KEY, prefix: "cb" });
		const signature = await wallet.signMessage("hello");
		assert.equal(
			recoverAddress(hashMessage("hello"), signature, "cb"),
			wallet.address,
		);
	});
});

describe("typed data uses networkId, not chainId", () => {
	const types = {
		Msg: [
			{ name: "text", type: "string" },
			{ name: "amount", type: "uint256" },
		],
	};
	const value = { text: "hi", amount: 1 };

	it("accepts networkId in the domain", () => {
		const hash = TypedDataEncoder.hashDomain({
			name: "T",
			version: "1",
			networkId: 1,
		});
		assert.match(hash, /^0x[0-9a-f]{64}$/);
	});

	it("produces a different domain hash per networkId", () => {
		const hashes = [1, 3, 11].map((networkId) =>
			TypedDataEncoder.hashDomain({ name: "T", networkId }),
		);
		assert.equal(new Set(hashes).size, 3);
	});

	it("rejects a negative networkId", () => {
		assert.throws(
			() => TypedDataEncoder.hashDomain({ name: "T", networkId: -1 }),
			/out-of-bounds for uint256|invalid chain ID/,
		);
	});

	it("hashes Core addresses in the domain and the values", () => {
		// The encoder itself handles 22-byte Core addresses correctly.
		const address = new Wallet({ key: KEY, prefix: "cb" }).address;
		const addressTypes = {
			Msg: [
				{ name: "to", type: "address" },
				{ name: "amount", type: "uint256" },
			],
		};
		const hash = TypedDataEncoder.hash(
			{ name: "T", networkId: 1, verifyingContract: address },
			addressTypes,
			{ to: address, amount: 1 },
		);
		assert.match(hash, /^0x[0-9a-f]{64}$/);
	});

	it("signs and verifies address-free typed data", async () => {
		const wallet = new Wallet({ key: KEY, prefix: "cb" });
		const domain = { name: "T", version: "1", networkId: 1 };
		const signature = await wallet.signTypedData(domain, types, value);
		assert.equal(
			verifyTypedData(domain, types, value, signature, "cb"),
			wallet.address,
		);
	});

	it("binds the signature to the domain's networkId", async () => {
		const wallet = new Wallet({ key: KEY, prefix: "cb" });
		const one = { name: "T", networkId: 1 };
		const three = { name: "T", networkId: 3 };
		const signature = await wallet.signTypedData(one, types, value);

		assert.notEqual(
			signature,
			await wallet.signTypedData(three, types, value),
			"networkId must change the signature",
		);
		// Replay onto another network must not verify.
		assert.throws(
			() => verifyTypedData(three, types, value, signature, "cb"),
			/invalid signature/,
		);
	});

	it("signs typed data containing Core addresses without a provider", async () => {
		// A 22-byte ICAN address must not be mistaken for a name needing
		// resolution just because it is longer than an Ethereum address.
		const wallet = new Wallet({ key: KEY, prefix: "cb" });
		const address = wallet.address;
		const addressTypes = {
			Msg: [
				{ name: "to", type: "address" },
				{ name: "amount", type: "uint256" },
			],
		};
		const domain = { name: "T", networkId: 1, verifyingContract: address };
		const data = { to: address, amount: 1 };

		const signature = await wallet.signTypedData(domain, addressTypes, data);
		assert.equal(
			verifyTypedData(domain, addressTypes, data, signature, "cb"),
			address,
		);
	});

	it("signs typed data with addresses on every network prefix", async () => {
		const addressTypes = { Msg: [{ name: "to", type: "address" }] };
		for (const prefix of PREFIXES) {
			const wallet = new Wallet({ key: KEY, prefix });
			const domain = {
				name: "T",
				networkId: 1,
				verifyingContract: wallet.address,
			};
			const data = { to: wallet.address };
			const signature = await wallet.signTypedData(domain, addressTypes, data);
			assert.equal(
				verifyTypedData(domain, addressTypes, data, signature, prefix),
				wallet.address,
				prefix,
			);
		}
	});

	it("still requires a provider for an actual name", async () => {
		const wallet = new Wallet({ key: KEY, prefix: "cb" });
		await assert.rejects(
			() =>
				wallet.signTypedData(
					{ name: "T", networkId: 1 },
					{ Msg: [{ name: "to", type: "address" }] },
					{ to: "somebody.core" },
				),
			/cannot resolve ENS names without a provider/,
		);
	});
});
