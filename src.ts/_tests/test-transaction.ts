/**
 *  Transaction lifecycle tests.
 *
 *  Covers the whole path a transaction takes: building it from an object,
 *  coercing each field, serializing to RLP, hashing, signing, recovering the
 *  sender, and parsing a raw transaction back into an object.
 *
 *  Core's transaction has seven fields and no type byte, so there is exactly
 *  one wire format. Note that the signed and unsigned encodings order the
 *  fields differently: unsigned puts `networkId` last, signed puts it fourth.
 *  Several tests below pin that layout, since a change to it would silently
 *  invalidate every signature the library has ever produced.
 *
 *  Network-id and address-prefix agreement is covered separately in
 *  `test-network-consistency.ts`; this file does not repeat it.
 */
import assert from "node:assert/strict";

import {
	dataLength,
	decodeRlp,
	encodeRlp,
	getBytes,
	hexlify,
	sha256,
	SigningKey,
	Transaction,
	Wallet,
} from "../index.js";

const KEY = "0x" + "11".repeat(57);
const OTHER_KEY = "0x" + "22".repeat(57);
const PREFIX = "cb";

const sender = new Wallet({ key: KEY, prefix: PREFIX });
const recipient = new Wallet({ key: OTHER_KEY, prefix: PREFIX });

/** A fully populated transaction used as the basis for most tests. */
const BASE = {
	to: recipient.address,
	nonce: 7,
	energyLimit: 21000,
	energyPrice: 1000000000,
	value: 1234,
	networkId: 1,
	data: "0xabcdef",
};

/** Ed448 signatures are a fixed width, and carry the public key. */
const SIGNATURE_LENGTH = 171;

function isArgumentError(code: string) {
	return (err: any) => err.code === code;
}

describe("transaction defaults", () => {
	it("starts every field at a zero value", () => {
		const tx = new Transaction();
		assert.equal(tx.to, null);
		assert.equal(tx.nonce, 0);
		assert.equal(tx.energyLimit, 0n);
		assert.equal(tx.energyPrice, 0n);
		assert.equal(tx.data, "0x");
		assert.equal(tx.value, 0n);
		assert.equal(tx.networkId, 0n);
		assert.equal(tx.signature, null);
	});

	it("is unsigned, so the signed-only accessors are null", () => {
		const tx = new Transaction();
		assert.equal(tx.isSigned(), false);
		assert.equal(tx.hash, null);
		assert.equal(tx.from, null);
		assert.equal(tx.fromPublicKey, null);
	});

	it("still has a pre-image, encoded as seven empty RLP items", () => {
		const tx = new Transaction();
		assert.equal(tx.unsignedSerialized, "0xc780808080808080");
		assert.deepEqual(decodeRlp(tx.unsignedSerialized), [
			"0x",
			"0x",
			"0x",
			"0x",
			"0x",
			"0x",
			"0x",
		]);
	});

	it("reports energyPrice as zero rather than null once cleared", () => {
		// The setter stores null but the getter substitutes zero, so callers
		// never observe the null. Serialization treats the two identically.
		const cleared = new Transaction();
		cleared.to = recipient.address;
		cleared.networkId = 1;
		cleared.energyPrice = 5;
		cleared.energyPrice = null;
		assert.equal(cleared.energyPrice, 0n);

		const zero = new Transaction();
		zero.to = recipient.address;
		zero.networkId = 1;
		zero.energyPrice = 0;
		assert.equal(cleared.unsignedSerialized, zero.unsignedSerialized);
	});
});

describe("transaction recipient field", () => {
	it("accepts a canonical address for any network prefix", () => {
		for (const prefix of ["cb", "ab", "ce"]) {
			const address = new Wallet({ key: OTHER_KEY, prefix }).address;
			const tx = new Transaction();
			tx.to = address;
			assert.equal(tx.to, address);
		}
	});

	it("normalizes case and a missing 0x", () => {
		const tx = new Transaction();
		tx.to = recipient.address.slice(2);
		assert.equal(tx.to, recipient.address);

		tx.to = "0x" + recipient.address.slice(2).toUpperCase();
		assert.equal(tx.to, recipient.address);
	});

	it("treats null and undefined as an init transaction", () => {
		const tx = new Transaction();
		tx.to = recipient.address;
		tx.to = null;
		assert.equal(tx.to, null);
		tx.to = undefined as any;
		assert.equal(tx.to, null);
	});

	it("rejects an Ethereum-sized 20-byte address", () => {
		const tx = new Transaction();
		assert.throws(
			() => (tx.to = "0x" + "aa".repeat(20)),
			isArgumentError("INVALID_ARGUMENT"),
		);
	});

	it("rejects any length other than 22 bytes", () => {
		const tx = new Transaction();
		for (const byteLength of [0, 1, 21, 23, 32]) {
			assert.throws(
				() => (tx.to = "0x" + "aa".repeat(byteLength)),
				isArgumentError("INVALID_ARGUMENT"),
				`accepted a ${byteLength}-byte address`,
			);
		}
	});

	it("rejects an address whose checksum does not verify", () => {
		const tx = new Transaction();
		// Replace the two check digits with a value that cannot be correct.
		const corrupted = "0xcb00" + recipient.address.slice(4);
		assert.throws(
			() => (tx.to = corrupted),
			isArgumentError("INVALID_ARGUMENT"),
		);
	});
});

describe("transaction numeric field coercion", () => {
	const numericFields = [
		"nonce",
		"energyLimit",
		"energyPrice",
		"value",
		"networkId",
	] as const;

	it("accepts decimal strings, hex strings, numbers and bigints", () => {
		const tx = new Transaction();
		tx.nonce = "5";
		assert.equal(tx.nonce, 5);
		tx.nonce = "0x10";
		assert.equal(tx.nonce, 16);

		tx.value = "1234";
		assert.equal(tx.value, 1234n);
		tx.value = 1234;
		assert.equal(tx.value, 1234n);
		tx.value = 1234n;
		assert.equal(tx.value, 1234n);
		tx.value = "0x4d2";
		assert.equal(tx.value, 1234n);
	});

	it("rejects a negative value on every numeric field", () => {
		// These are all unsigned quantities on the wire. Accepting a negative
		// here used to defer the failure to serialization, where it surfaced
		// as an unrelated hexlify error.
		for (const field of numericFields) {
			const tx = new Transaction();
			assert.throws(
				() => ((tx as any)[field] = -1),
				isArgumentError("NUMERIC_FAULT"),
				`accepted a negative ${field}`,
			);
		}
	});

	it("rejects a negative value through Transaction.from too", () => {
		for (const field of numericFields) {
			assert.throws(
				() => Transaction.from({ [field]: -1 } as any),
				isArgumentError("NUMERIC_FAULT"),
				`accepted a negative ${field}`,
			);
		}
	});

	it("rejects a non-integer nonce", () => {
		const tx = new Transaction();
		assert.throws(() => (tx.nonce = 1.5), isArgumentError("INVALID_ARGUMENT"));
	});

	it("caps the nonce at the safe integer range", () => {
		const tx = new Transaction();
		tx.nonce = Number.MAX_SAFE_INTEGER;
		assert.equal(tx.nonce, Number.MAX_SAFE_INTEGER);
		assert.throws(
			() => (tx.nonce = 2 ** 53),
			isArgumentError("INVALID_ARGUMENT"),
		);
	});

	it("carries the full 32-byte range on the bigint fields", () => {
		for (const field of ["energyLimit", "energyPrice", "value", "networkId"]) {
			const tx = new Transaction();
			tx.to = recipient.address;
			(tx as any)[field] = (1n << 256n) - 1n;
			assert.equal((tx as any)[field], (1n << 256n) - 1n);
			assert.equal(dataLength(tx.unsignedSerialized), 63);
		}
	});

	it("refuses to serialize a bigint field wider than 32 bytes", () => {
		for (const field of ["energyLimit", "energyPrice", "value", "networkId"]) {
			const tx = new Transaction();
			tx.to = recipient.address;
			(tx as any)[field] = 1n << 256n;
			assert.throws(
				() => tx.unsignedSerialized,
				isArgumentError("INVALID_ARGUMENT"),
				`serialized an oversized ${field}`,
			);
		}
	});
});

describe("transaction data field", () => {
	it("hexlifies a byte array", () => {
		const tx = new Transaction();
		tx.data = new Uint8Array([1, 2, 3]);
		assert.equal(tx.data, "0x010203");
	});

	it("accepts empty data", () => {
		const tx = new Transaction();
		tx.data = "0x";
		assert.equal(tx.data, "0x");
	});

	it("rejects odd-length hex", () => {
		const tx = new Transaction();
		assert.throws(
			() => (tx.data = "0x123"),
			isArgumentError("INVALID_ARGUMENT"),
		);
	});

	it("rejects a non-hex string", () => {
		const tx = new Transaction();
		assert.throws(
			() => (tx.data = "hello"),
			isArgumentError("INVALID_ARGUMENT"),
		);
	});

	it("round-trips a large payload", () => {
		const data = "0x" + "ab".repeat(10000);
		const tx = Transaction.from({ ...BASE, data });
		assert.equal(Transaction.from(tx.unsignedSerialized).data, data);
	});
});

describe("transaction rejects Ethereum field names", () => {
	// A developer porting code written against Ethereum would otherwise get a
	// transaction with networkId 0 and no energy limit, and no indication why.
	const renamed: Array<[string, any, string]> = [
		["chainId", 1, "networkId"],
		["gas", 21000, "energyLimit"],
		["gasLimit", 21000, "energyLimit"],
		["gasPrice", 5, "energyPrice"],
	];

	for (const [field, value, replacement] of renamed) {
		it(`rejects ${field} and names ${replacement} instead`, () => {
			assert.throws(
				() =>
					Transaction.from({ to: recipient.address, [field]: value } as any),
				(err: any) => {
					assert.equal(err.code, "INVALID_ARGUMENT");
					assert.match(err.message, new RegExp(`"${field}"`));
					assert.match(err.message, new RegExp(`"${replacement}"`));
					return true;
				},
			);
		});
	}

	const unsupported: Array<[string, any]> = [
		["maxFeePerGas", 9],
		["maxPriorityFeePerGas", 1],
		["accessList", []],
		["blobs", []],
		["blobVersionedHashes", []],
		["maxFeePerBlobGas", 1],
		["kzg", {}],
		["authorizationList", []],
	];

	for (const [field, value] of unsupported) {
		it(`rejects ${field}, which Core has no equivalent for`, () => {
			assert.throws(
				() =>
					Transaction.from({ to: recipient.address, [field]: value } as any),
				(err: any) => {
					assert.equal(err.code, "INVALID_ARGUMENT");
					assert.match(err.message, new RegExp(`"${field}"`));
					return true;
				},
			);
		});
	}

	it("tolerates an explicitly null Ethereum field", () => {
		// Callers that build a request object with every key present should not
		// trip the guard just for leaving one unset.
		const tx = Transaction.from({
			to: recipient.address,
			chainId: null,
			gasPrice: null,
		} as any);
		assert.equal(tx.to, recipient.address);
	});

	it("rejects an unknown key set directly on the instance", () => {
		const tx = Transaction.from({ to: recipient.address, networkId: 1 });
		(tx as any).gasLimit = 1;
		assert.throws(
			() => tx.unsignedSerialized,
			isArgumentError("INVALID_ARGUMENT"),
		);
	});
});

describe("transaction unsigned serialization", () => {
	it("encodes the seven fields with networkId last", () => {
		const tx = Transaction.from(BASE);
		assert.deepEqual(decodeRlp(tx.unsignedSerialized), [
			"0x07", // nonce
			"0x3b9aca00", // energyPrice
			"0x5208", // energyLimit
			recipient.address, // to
			"0x04d2", // value
			"0xabcdef", // data
			"0x01", // networkId
		]);
	});

	it("matches a pinned encoding", () => {
		const tx = Transaction.from(BASE);
		assert.equal(
			tx.unsignedSerialized,
			"0xe807843b9aca0082520896cb74a9d83026686d8843fccd253dc82e32d28a9a93a88204d283abcdef01",
		);
		assert.equal(
			tx.unsignedHash,
			"0x6fd85bc19fff6db06c1d0243bb765cf90ed2b3e8593a4d8d8e8e2fdba02c1804",
		);
	});

	it("strips leading zeros from the numeric fields", () => {
		const tx = Transaction.from({ ...BASE, value: 1 });
		assert.equal(decodeRlp(tx.unsignedSerialized)[4], "0x01");
	});

	it("leaves the recipient slot empty for an init transaction", () => {
		const tx = Transaction.from({ ...BASE, to: null });
		assert.equal(decodeRlp(tx.unsignedSerialized)[3], "0x");
		assert.equal(Transaction.from(tx.unsignedSerialized).to, null);
	});

	it("refuses to produce a signed serialization while unsigned", () => {
		const tx = Transaction.from(BASE);
		assert.throws(
			() => tx.serialized,
			(err: any) => {
				assert.equal(err.code, "UNSUPPORTED_OPERATION");
				return true;
			},
		);
	});
});

describe("transaction pre-image hash", () => {
	it("is deterministic", () => {
		assert.equal(
			Transaction.from(BASE).unsignedHash,
			Transaction.from(BASE).unsignedHash,
		);
	});

	it("changes when any field changes", () => {
		const variants: Record<string, any> = {
			base: {},
			nonce: { nonce: 8 },
			energyLimit: { energyLimit: 21001 },
			energyPrice: { energyPrice: 1000000001 },
			value: { value: 1235 },
			to: { to: sender.address },
			init: { to: null },
			data: { data: "0xabcdee" },
			networkId: { networkId: 3 },
		};

		const seen = new Map<string, string>();
		for (const [label, overrides] of Object.entries(variants)) {
			const hash = Transaction.from({ ...BASE, ...overrides }).unsignedHash;
			const clash = seen.get(hash);
			assert.equal(clash, undefined, `${label} hashes the same as ${clash}`);
			seen.set(hash, label);
		}
	});

	it("is the hash of the pre-image, not of the signed form", () => {
		const tx = Transaction.from(BASE);
		assert.equal(tx.unsignedHash, sha256(tx.unsignedSerialized));
	});
});

describe("transaction signing and sender recovery", () => {
	let raw: string;

	before(async () => {
		raw = await sender.signTransaction(BASE);
	});

	it("produces a fixed-width Ed448 signature", () => {
		const tx = Transaction.from(raw);
		assert.equal(dataLength(tx.signature as string), SIGNATURE_LENGTH);
	});

	it("appends the signature as an eighth RLP item", () => {
		assert.equal(decodeRlp(raw).length, 8);
		assert.equal(
			decodeRlp(Transaction.from(BASE).unsignedSerialized).length,
			7,
		);
	});

	it("reorders the fields so networkId comes fourth once signed", () => {
		// The signed layout is nonce, energyPrice, energyLimit, networkId, to,
		// value, data. Changing this would invalidate existing signatures.
		assert.deepEqual(decodeRlp(raw).slice(0, 7), [
			"0x07",
			"0x3b9aca00",
			"0x5208",
			"0x01",
			recipient.address,
			"0x04d2",
			"0xabcdef",
		]);
	});

	it("recovers the signer's address", () => {
		assert.equal(Transaction.from(raw).from, sender.address);
	});

	it("recovers the signer's public key", () => {
		assert.equal(
			Transaction.from(raw).fromPublicKey,
			new SigningKey(KEY).publicKey,
		);
	});

	it("reports itself as signed and exposes a hash", () => {
		const tx = Transaction.from(raw);
		assert.equal(tx.isSigned(), true);
		assert.ok(tx.hash);
		assert.equal(dataLength(tx.hash as string), 32);
	});

	it("is deterministic for the same key and transaction", async () => {
		assert.equal(await sender.signTransaction(BASE), raw);
	});

	it("differs between signers", async () => {
		const other = await recipient.signTransaction(BASE);
		assert.notEqual(other, raw);
		assert.equal(Transaction.from(other).from, recipient.address);
	});

	it("accepts a Transaction instance as well as an object", async () => {
		assert.equal(await sender.signTransaction(Transaction.from(BASE)), raw);
	});

	it("signs an init transaction", async () => {
		const initRaw = await sender.signTransaction({ ...BASE, to: null });
		const tx = Transaction.from(initRaw);
		assert.equal(tx.to, null);
		assert.equal(tx.from, sender.address);
	});
});

describe("transaction signature tampering", () => {
	let raw: string;
	let signed: Transaction;

	before(async () => {
		raw = await sender.signTransaction(BASE);
		signed = Transaction.from(raw);
	});

	it("rejects a flipped signature byte instead of recovering a wrong sender", () => {
		// Ed448 recovery either verifies or fails; unlike secp256k1 it cannot
		// hand back a plausible-but-wrong address for a corrupted signature.
		const bytes = getBytes(signed.signature as string);
		bytes[0] ^= 0xff;
		const tampered = signed.clone();
		tampered.signature = hexlify(bytes);
		assert.throws(() => tampered.from, isArgumentError("INVALID_ARGUMENT"));
	});

	it("rejects an all-zero signature", () => {
		const tampered = signed.clone();
		tampered.signature = "0x" + "00".repeat(SIGNATURE_LENGTH);
		assert.throws(() => tampered.from, isArgumentError("INVALID_ARGUMENT"));
	});

	it("rejects a truncated signature", () => {
		const tampered = signed.clone();
		tampered.signature = "0x1234";
		assert.throws(() => tampered.from, isArgumentError("INVALID_ARGUMENT"));
	});

	it("rejects the signature once any signed field is altered", () => {
		for (const overrides of [
			{ nonce: 8 },
			{ value: 1235 },
			{ energyLimit: 21001 },
			{ energyPrice: 1n },
			{ networkId: 3 },
			{ data: "0xabcdee" },
			{ to: sender.address },
		]) {
			const tampered = signed.clone();
			Object.assign(tampered, overrides);
			assert.throws(
				() => tampered.from,
				isArgumentError("INVALID_ARGUMENT"),
				`accepted the signature after changing ${Object.keys(overrides)[0]}`,
			);
		}
	});

	it("clearing the signature returns it to an unsigned state", () => {
		const cleared = signed.clone();
		cleared.signature = null;
		assert.equal(cleared.isSigned(), false);
		assert.equal(cleared.from, null);
		assert.equal(cleared.hash, null);
	});
});

describe("transaction parsing", () => {
	it("round-trips an unsigned transaction", () => {
		const tx = Transaction.from(BASE);
		const parsed = Transaction.from(tx.unsignedSerialized);
		assert.equal(parsed.to, tx.to);
		assert.equal(parsed.nonce, tx.nonce);
		assert.equal(parsed.energyLimit, tx.energyLimit);
		assert.equal(parsed.energyPrice, tx.energyPrice);
		assert.equal(parsed.value, tx.value);
		assert.equal(parsed.networkId, tx.networkId);
		assert.equal(parsed.data, tx.data);
		assert.equal(parsed.signature, null);
		assert.equal(parsed.unsignedSerialized, tx.unsignedSerialized);
	});

	it("round-trips a signed transaction byte for byte", async () => {
		const raw = await sender.signTransaction(BASE);
		assert.equal(Transaction.from(raw).serialized, raw);
	});

	it("accepts a byte array as well as a hex string", async () => {
		const raw = await sender.signTransaction(BASE);
		assert.equal(Transaction.from(hexlify(getBytes(raw))).serialized, raw);
	});

	it("rejects an RLP list with the wrong number of items", () => {
		for (const count of [0, 1, 6, 9, 12]) {
			const payload = encodeRlp(new Array(count).fill("0x01"));
			assert.throws(
				() => Transaction.from(payload),
				isArgumentError("INVALID_ARGUMENT"),
				`accepted a ${count}-item transaction`,
			);
		}
	});

	it("rejects truncated or non-RLP input", () => {
		for (const payload of ["0x", "0xdeadbeef", "0xf8"]) {
			assert.throws(
				() => Transaction.from(payload),
				(err: any) => err.code === "BUFFER_OVERRUN",
				`accepted ${payload}`,
			);
		}
	});

	it("returns an empty transaction for no argument", () => {
		assert.equal(Transaction.from().unsignedSerialized, "0xc780808080808080");
		assert.equal(
			Transaction.from(undefined).unsignedSerialized,
			"0xc780808080808080",
		);
	});
});

describe("Transaction.from cross-checks", () => {
	let signed: Transaction;

	before(async () => {
		signed = Transaction.from(await sender.signTransaction(BASE));
	});

	it("refuses a hash on an unsigned transaction", () => {
		assert.throws(
			() =>
				Transaction.from({
					to: recipient.address,
					hash: "0x" + "00".repeat(32),
				}),
			isArgumentError("INVALID_ARGUMENT"),
		);
	});

	it("refuses a sender on an unsigned transaction", () => {
		assert.throws(
			() => Transaction.from({ to: recipient.address, from: sender.address }),
			isArgumentError("INVALID_ARGUMENT"),
		);
	});

	it("rejects a hash that does not match the signature", () => {
		assert.throws(
			() =>
				Transaction.from({
					...BASE,
					signature: signed.signature,
					hash: "0x" + "00".repeat(32),
				}),
			isArgumentError("INVALID_ARGUMENT"),
		);
	});

	it("accepts the hash the transaction actually has", () => {
		const tx = Transaction.from({
			...BASE,
			signature: signed.signature,
			hash: signed.hash,
		});
		assert.equal(tx.hash, signed.hash);
	});

	it("rejects a sender that does not match the signature", () => {
		assert.throws(
			() =>
				Transaction.from({
					...BASE,
					signature: signed.signature,
					from: recipient.address,
				}),
			isArgumentError("INVALID_ARGUMENT"),
		);
	});

	it("accepts the sender the signature recovers to", () => {
		const tx = Transaction.from({
			...BASE,
			signature: signed.signature,
			from: sender.address,
		});
		assert.equal(tx.from, sender.address);
	});
});

describe("transaction clone and JSON", () => {
	let signed: Transaction;

	before(async () => {
		signed = Transaction.from(await sender.signTransaction(BASE));
	});

	it("clones an unsigned transaction", () => {
		const tx = Transaction.from(BASE);
		const copy = tx.clone();
		assert.notEqual(copy, tx);
		assert.equal(copy.unsignedSerialized, tx.unsignedSerialized);
	});

	it("clones a signed transaction, signature included", () => {
		const copy = signed.clone();
		assert.equal(copy.serialized, signed.serialized);
		assert.equal(copy.from, signed.from);
	});

	it("leaves the original untouched when the clone is edited", () => {
		const copy = signed.clone();
		copy.nonce = 99;
		assert.equal(signed.nonce, BASE.nonce);
	});

	it("serializes to JSON with Core field names only", () => {
		const json = signed.toJSON();
		assert.deepEqual(Object.keys(json).sort(), [
			"data",
			"energyLimit",
			"energyPrice",
			"networkId",
			"nonce",
			"signature",
			"to",
			"value",
		]);
	});

	it("renders the bigint fields as decimal strings", () => {
		const json = signed.toJSON();
		assert.equal(json.energyLimit, "21000");
		assert.equal(json.energyPrice, "1000000000");
		assert.equal(json.value, "1234");
		assert.equal(json.networkId, "1");
		assert.equal(json.nonce, 7);
	});

	it("survives a JSON round trip with the signature intact", () => {
		const revived = Transaction.from(
			JSON.parse(JSON.stringify(signed.toJSON())),
		);
		assert.equal(revived.serialized, signed.serialized);
		assert.equal(revived.from, sender.address);
	});

	it("survives a JSON round trip while unsigned", () => {
		const tx = Transaction.from(BASE);
		const revived = Transaction.from(JSON.parse(JSON.stringify(tx.toJSON())));
		assert.equal(revived.unsignedSerialized, tx.unsignedSerialized);
	});

	it("reports a null signature for an unsigned transaction", () => {
		assert.equal(Transaction.from(BASE).toJSON().signature, null);
	});
});
