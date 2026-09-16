/**
 *  Cryptographic primitives and hash helpers.
 *
 *  Core is not Ethereum, and the two biggest differences show up here:
 *
 *   - The functions exported as `sha256` and `sha512` are **SHA3**-256 and
 *     SHA3-512 (FIPS 202), not SHA-2. Their output therefore matches the
 *     NIST SHA3 known answers and deliberately does *not* match SHA-2.
 *   - `keccak256` is still original Keccak-256 and is only reachable
 *     through `id(value, true)`; Core's own hashing goes through `sha256`.
 *
 *  `computeHmac` and `pbkdf2`, by contrast, really are SHA-2 based and are
 *  pinned against RFC 4231 / RFC 6070-style vectors below.
 *
 *  Not covered here (already covered elsewhere): the Ed448 signing and
 *  recovery surface (test-core-signing.ts), the X448 shared-secret and
 *  PBKDF2 keystore compatibility vectors (crypto-compat-vectors.ts), and
 *  the scrypt memory budget (test-crypto.ts).
 */
import assert from "node:assert/strict";

import {
	MessagePrefix,
	SigningKey,
	Wallet,
	computeHmac,
	concat,
	getBytes,
	hashMessage,
	hexlify,
	id,
	keccak256,
	pbkdf2,
	randomBytes,
	ripemd160,
	scrypt,
	scryptSync,
	sha256,
	sha512,
	solidityPacked,
	solidityPackedSha256,
	toUtf8Bytes,
	uuidV4,
} from "../index.js";

/** 57-byte Ed448 private keys. Test material only. */
const KEY_A = "0x" + "11".repeat(57);
const KEY_B = "0x" + "22".repeat(57);
const KEY_C = "0x" + "33".repeat(57);

/** A 22-byte ICAN address derived from KEY_A. */
const ADDRESS = new Wallet({ key: KEY_A, prefix: "cb" }).address;

/** NIST FIPS 202 uses this 448-bit message in its SHA3 known answers. */
const NIST_448 = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";

/** The NIST / RIPEMD "one million 'a' characters" long-input message. */
const MILLION_A = new Uint8Array(1000000).fill(0x61);

/** UTF-8 bytes of %%text%% as a DataHexString, for BytesLike arguments. */
function utf8Hex(text: string): string {
	return hexlify(toUtf8Bytes(text));
}

/** Values `getBytes` must refuse, for every function that takes BytesLike. */
const NOT_BYTES_LIKE: Array<any> = [
	"0x1", // odd length
	"0xzz", // not hex
	"nope", // no 0x prefix
	"", // empty string is not even "0x"
	null,
	undefined,
	42,
	{},
	[0x13, 0x37], // BytesLike's type includes ArrayLike<number>, getBytes does not
];

describe("SHA3-256 digest (exported as sha256)", () => {
	it("matches the NIST FIPS 202 SHA3-256 known answers", () => {
		assert.equal(
			sha256("0x"),
			"0xa7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a",
			"empty message",
		);
		assert.equal(
			sha256(utf8Hex("abc")),
			"0x3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532",
		);
		assert.equal(
			sha256(utf8Hex(NIST_448)),
			"0x41c0dba2a9d6240849100376a8235e2c82e1b9998a999e21db32dd97496d3376",
		);
	});

	it("matches the NIST known answer for a one-megabyte message", () => {
		assert.equal(
			sha256(MILLION_A),
			"0x5c8875ae474a3634ba4fd55ec85bffd661f32aca75c6d699d0cdcb6c115891c1",
		);
	});

	it("is SHA3-256, not SHA-2 256", () => {
		// Core hashes with SHA3. Anything that expects the SHA-2 digest of
		// "abc" (ba7816bf...) is reading the name, not the implementation.
		assert.notEqual(
			sha256(utf8Hex("abc")),
			"0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});

	it("is not keccak256 either", () => {
		assert.notEqual(sha256("0x"), keccak256("0x"));
	});

	it("treats a hex string and the equivalent Uint8Array identically", () => {
		assert.equal(sha256("0x1337"), sha256(new Uint8Array([0x13, 0x37])));
		assert.equal(sha256(utf8Hex("abc")), sha256(toUtf8Bytes("abc")));
	});

	it("returns a lower-case 0x-prefixed 32-byte digest", () => {
		const digest = sha256(utf8Hex("Core"));
		assert.match(digest, /^0x[0-9a-f]{64}$/);
		assert.equal(getBytes(digest).length, 32);
	});

	it("rejects values that are not BytesLike", () => {
		for (const bad of NOT_BYTES_LIKE) {
			assert.throws(
				() => sha256(bad),
				/invalid BytesLike value/,
				`should reject ${String(bad)}`,
			);
		}
	});
});

describe("SHA3-512 digest (exported as sha512)", () => {
	it("matches the NIST FIPS 202 SHA3-512 known answers", () => {
		assert.equal(
			sha512("0x"),
			"0xa69f73cca23a9ac5c8b567dc185a756e97c982164fe25859e0d1dcc1475c80a6" +
				"15b2123af1f5f94c11e3e9402c3ac558f500199d95b6d3e301758586281dcd26",
			"empty message",
		);
		assert.equal(
			sha512(utf8Hex("abc")),
			"0xb751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e" +
				"10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0",
		);
		assert.equal(
			sha512(utf8Hex(NIST_448)),
			"0x04a371e84ecfb5b8b77cb48610fca8182dd457ce6f326a0fd3d7ec2f1e91636d" +
				"ee691fbe0c985302ba1b0d8dc78c086346b533b49c030d99a27daf1139d6e75e",
		);
	});

	it("matches the NIST known answer for a one-megabyte message", () => {
		assert.equal(
			sha512(MILLION_A),
			"0x3c3a876da14034ab60627c077bb98f7e120a2a5370212dffb3385a18d4f38859" +
				"ed311d0a9d5141ce9cc5c66ee689b266a8aa18ace8282a0e0db596c90b0a7b87",
		);
	});

	it("is SHA3-512, not SHA-2 512", () => {
		assert.notEqual(
			sha512(utf8Hex("abc")),
			"0xddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a" +
				"2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
		);
	});

	it("treats a hex string and the equivalent Uint8Array identically", () => {
		assert.equal(sha512("0x1337"), sha512(new Uint8Array([0x13, 0x37])));
	});

	it("returns a lower-case 0x-prefixed 64-byte digest", () => {
		const digest = sha512(utf8Hex("Core"));
		assert.match(digest, /^0x[0-9a-f]{128}$/);
		assert.equal(getBytes(digest).length, 64);
	});

	it("rejects values that are not BytesLike", () => {
		for (const bad of NOT_BYTES_LIKE) {
			assert.throws(() => sha512(bad), /invalid BytesLike value/);
		}
	});
});

describe("keccak256 digest", () => {
	it("matches the published Keccak-256 known answers", () => {
		// Unlike sha256/sha512, this one really is the hash Ethereum uses,
		// so the well-known values do apply.
		assert.equal(
			keccak256("0x"),
			"0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
		);
		assert.equal(
			keccak256(utf8Hex("abc")),
			"0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
		);
		assert.equal(
			keccak256(utf8Hex("hello world")),
			"0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad",
		);
	});

	it("hashes a one-megabyte message", () => {
		assert.equal(
			keccak256(MILLION_A),
			"0xfadae6b49f129bbb812be8407b7b2894f34aecf6dbd1f9b0f0c7e9853098fc96",
		);
	});

	it("is original Keccak, which differs from SHA3-256 by padding", () => {
		// Same permutation, different domain separator, so every digest
		// differs. This is why Core hashes are not Ethereum hashes.
		for (const data of ["0x", "0x1337", utf8Hex("abc")]) {
			assert.notEqual(keccak256(data), sha256(data), data);
		}
	});

	it("treats a hex string and the equivalent Uint8Array identically", () => {
		assert.equal(keccak256("0x1337"), keccak256(new Uint8Array([0x13, 0x37])));
	});

	it("returns a lower-case 0x-prefixed 32-byte digest", () => {
		assert.match(keccak256(utf8Hex("Core")), /^0x[0-9a-f]{64}$/);
	});

	it("rejects values that are not BytesLike", () => {
		for (const bad of NOT_BYTES_LIKE) {
			assert.throws(() => keccak256(bad), /invalid BytesLike value/);
		}
	});
});

describe("ripemd160 digest", () => {
	it("matches the published RIPEMD-160 known answers", () => {
		assert.equal(ripemd160("0x"), "0x9c1185a5c5e9fc54612808977ee8f548b2258d31");
		assert.equal(
			ripemd160(utf8Hex("abc")),
			"0x8eb208f7e05d987a9b044a8e98c6b087f15a0bfc",
		);
		assert.equal(
			ripemd160(utf8Hex("message digest")),
			"0x5d0689ef49d2fae572b881b123a85ffa21595f36",
		);
		assert.equal(
			ripemd160(utf8Hex("abcdefghijklmnopqrstuvwxyz")),
			"0xf71c27109c692c1b56bbdceb5b9d2865b3708dbc",
		);
	});

	it("matches the published known answer for a one-megabyte message", () => {
		assert.equal(
			ripemd160(MILLION_A),
			"0x52783243c1697bdbe16d37f97f68f08325dc1528",
		);
	});

	it("treats a hex string and the equivalent Uint8Array identically", () => {
		assert.equal(ripemd160("0x1337"), ripemd160(new Uint8Array([0x13, 0x37])));
	});

	it("returns a lower-case 0x-prefixed 20-byte digest", () => {
		const digest = ripemd160(utf8Hex("Core"));
		assert.match(digest, /^0x[0-9a-f]{40}$/);
		assert.equal(getBytes(digest).length, 20);
	});

	it("rejects values that are not BytesLike", () => {
		for (const bad of NOT_BYTES_LIKE) {
			assert.throws(() => ripemd160(bad), /invalid BytesLike value/);
		}
	});
});

describe("computeHmac", () => {
	// RFC 4231 test vectors. Note these pass, which means computeHmac is
	// HMAC-SHA2 even though the same library's sha256() is SHA3-256.
	const RFC4231_KEY_1 = "0x" + "0b".repeat(20);
	const RFC4231_KEY_LONG = "0x" + "aa".repeat(131);

	it("matches RFC 4231 test case 1", () => {
		const data = utf8Hex("Hi There");
		assert.equal(
			computeHmac("sha256", RFC4231_KEY_1, data),
			"0xb0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
		);
		assert.equal(
			computeHmac("sha512", RFC4231_KEY_1, data),
			"0x87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cde" +
				"daa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854",
		);
	});

	it("matches RFC 4231 test case 2 (key shorter than the block size)", () => {
		const key = utf8Hex("Jefe");
		const data = utf8Hex("what do ya want for nothing?");
		assert.equal(
			computeHmac("sha256", key, data),
			"0x5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
		);
		assert.equal(
			computeHmac("sha512", key, data),
			"0x164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea250554" +
				"9758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737",
		);
	});

	it("matches RFC 4231 test case 6 (key longer than the block size)", () => {
		const data = utf8Hex(
			"Test Using Larger Than Block-Size Key - Hash Key First",
		);
		assert.equal(
			computeHmac("sha256", RFC4231_KEY_LONG, data),
			"0x60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
		);
		assert.equal(
			computeHmac("sha512", RFC4231_KEY_LONG, data),
			"0x80b24263c7c1a3ebb71493c1dd7be8b49b46d1f41b4aeec1121b013783f8f352" +
				"6b56d037e05f2598bd0fd2215d6a1e5295e64f73f63f0aec8b915a985d786598",
		);
	});

	it("matches RFC 4231 test case 7 (long key and long data)", () => {
		assert.equal(
			computeHmac(
				"sha256",
				RFC4231_KEY_LONG,
				utf8Hex(
					"This is a test using a larger than block-size key and a larger " +
						"than block-size data. The key needs to be hashed before being " +
						"used by the HMAC algorithm.",
				),
			),
			"0x9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2",
		);
	});

	it("accepts an empty key and empty data", () => {
		assert.equal(
			computeHmac("sha256", "0x", "0x"),
			"0xb613679a0814d9ec772f95d778c35fc5ff1697c493715653c6c712144292c5ad",
		);
	});

	it("is HMAC-SHA2, unlike the SHA3 used by sha256()", () => {
		// HMAC-SHA3-256 of the same inputs is ba851923..., so the MAC and
		// the digest exported by this library use different hash families.
		assert.notEqual(
			computeHmac("sha256", RFC4231_KEY_1, utf8Hex("Hi There")),
			"0xba85192310dffa96e2a3a40e69774351140bb7185e1202cdcc917589f95e16bb",
		);
	});

	it("returns digests sized for the requested algorithm", () => {
		assert.equal(getBytes(computeHmac("sha256", "0x00", "0x00")).length, 32);
		assert.equal(getBytes(computeHmac("sha512", "0x00", "0x00")).length, 64);
	});

	it("treats hex strings and Uint8Arrays identically", () => {
		assert.equal(
			computeHmac("sha256", "0x0b0b", "0x1337"),
			computeHmac(
				"sha256",
				new Uint8Array([0x0b, 0x0b]),
				new Uint8Array([0x13, 0x37]),
			),
		);
	});

	it("binds the MAC to the key and to the data", () => {
		const mac = computeHmac("sha256", "0x0b0b", "0x1337");
		assert.notEqual(mac, computeHmac("sha256", "0x0b0c", "0x1337"));
		assert.notEqual(mac, computeHmac("sha256", "0x0b0b", "0x1338"));
		assert.notEqual(mac, computeHmac("sha512", "0x0b0b", "0x1337"));
	});

	it("rejects keys and data that are not BytesLike", () => {
		for (const bad of NOT_BYTES_LIKE) {
			assert.throws(
				() => computeHmac("sha256", bad, "0x00"),
				/invalid BytesLike value/,
			);
			assert.throws(
				() => computeHmac("sha256", "0x00", bad),
				/invalid BytesLike value/,
			);
		}
	});

	it("PINS BUG: an unsupported algorithm name is passed straight through", () => {
		// hmac.ts hands the string to node's createHmac without checking it,
		// so "md5" silently produces a 16-byte HMAC-MD5. The browser shim
		// (crypto-browser.ts createHmac) asserts on the same input, so the
		// two backends disagree. The unexported computeHmac in sha3.ts does
		// validate - that validation just never reached the exported one.
		const mac = computeHmac("md5" as any, "0x00", "0x");
		assert.equal(mac, "0x74e6f7298a9c2d168935f58c001bad88");
		assert.equal(getBytes(mac).length, 16);
	});

	it.skip("computeHmac should reject an unsupported algorithm", () => {
		assert.throws(
			() => computeHmac("md5" as any, "0x00", "0x"),
			/unsupported algorithm|invalid hmac algorithm/,
		);
	});
});

describe("pbkdf2", () => {
	const PASSWORD = utf8Hex("password");
	const SALT = utf8Hex("salt");

	it("matches the published PBKDF2-HMAC-SHA256 vectors", () => {
		assert.equal(
			pbkdf2(PASSWORD, SALT, 1, 32, "sha256"),
			"0x120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b",
		);
		assert.equal(
			pbkdf2(PASSWORD, SALT, 2, 32, "sha256"),
			"0xae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43",
		);
	});

	it("matches the published vector whose key is longer than the digest", () => {
		// 40 bytes out of a 32-byte PRF exercises the multi-block path.
		assert.equal(
			pbkdf2(
				utf8Hex("passwordPASSWORDpassword"),
				utf8Hex("saltSALTsaltSALTsaltSALTsaltSALTsalt"),
				4096,
				40,
				"sha256",
			),
			"0x348c89dbcbd32b2f32d814b8116e84cf2b17347ebc1800181c4e2a1fb8dd53e1" +
				"c635518c7dac47e9",
		);
	});

	it("matches the published PBKDF2-HMAC-SHA512 vector", () => {
		assert.equal(
			pbkdf2(PASSWORD, SALT, 1, 64, "sha512"),
			"0x867f70cf1ade02cff3752599a3a53dc4af34c7a669815ae5d513554e1c8cf252" +
				"c02d470a285a0501bad999bfe943c08f050235d7d68b1da55e63f73b60a57fce",
		);
	});

	it("accepts an empty password and empty salt", () => {
		assert.equal(
			pbkdf2("0x", "0x", 1, 16, "sha256"),
			"0xf7ce0b653d2d72a4108cf5abe912ffdd",
		);
	});

	it("returns exactly the requested key length", () => {
		for (const keylen of [1, 16, 32, 64]) {
			assert.equal(
				getBytes(pbkdf2(PASSWORD, SALT, 1, keylen, "sha256")).length,
				keylen,
			);
		}
	});

	it("binds the key to the password, salt, iterations and algorithm", () => {
		const key = pbkdf2(PASSWORD, SALT, 4, 32, "sha256");
		assert.notEqual(key, pbkdf2(utf8Hex("Password"), SALT, 4, 32, "sha256"));
		assert.notEqual(key, pbkdf2(PASSWORD, utf8Hex("Salt"), 4, 32, "sha256"));
		assert.notEqual(key, pbkdf2(PASSWORD, SALT, 5, 32, "sha256"));
		assert.notEqual(key, pbkdf2(PASSWORD, SALT, 4, 32, "sha512"));
	});

	it("treats hex strings and Uint8Arrays identically", () => {
		assert.equal(
			pbkdf2(PASSWORD, SALT, 4, 16, "sha256"),
			pbkdf2(toUtf8Bytes("password"), toUtf8Bytes("salt"), 4, 16, "sha256"),
		);
	});

	it("rejects a password or salt that is not BytesLike", () => {
		for (const bad of NOT_BYTES_LIKE) {
			assert.throws(
				() => pbkdf2(bad, SALT, 1, 16, "sha256"),
				/invalid BytesLike value/,
			);
			assert.throws(
				() => pbkdf2(PASSWORD, bad, 1, 16, "sha256"),
				/invalid BytesLike value/,
			);
		}
	});

	it("rejects a non-positive iteration count and a negative key length", () => {
		assert.throws(
			() => pbkdf2(PASSWORD, SALT, 0, 16, "sha256"),
			/"iterations" is out of range/,
		);
		assert.throws(
			() => pbkdf2(PASSWORD, SALT, 1, -1, "sha256"),
			/"keylen" is out of range/,
		);
	});
});

describe("scrypt and scryptSync", function () {
	// Deliberately low cost parameters; the memory budget is covered by
	// test-crypto.ts and is not re-tested here.
	this.timeout(60000);

	it("matches RFC 7914 test vector 1", async () => {
		const expected =
			"0x77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442" +
			"fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906";
		assert.equal(scryptSync("0x", "0x", 16, 1, 1, 64), expected);
		assert.equal(await scrypt("0x", "0x", 16, 1, 1, 64), expected);
	});

	it("matches RFC 7914 test vector 2", async () => {
		const expected =
			"0xfdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b373162" +
			"2eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640";
		assert.equal(
			scryptSync(utf8Hex("password"), utf8Hex("NaCl"), 1024, 8, 16, 64),
			expected,
		);
		assert.equal(
			await scrypt(utf8Hex("password"), utf8Hex("NaCl"), 1024, 8, 16, 64),
			expected,
		);
	});

	it("returns exactly the requested key length", async () => {
		for (const dkLen of [1, 16, 32]) {
			assert.equal(
				getBytes(scryptSync("0x", "0x", 16, 1, 1, dkLen)).length,
				dkLen,
			);
			assert.equal(
				getBytes(await scrypt("0x", "0x", 16, 1, 1, dkLen)).length,
				dkLen,
			);
		}
	});

	it("binds the key to the password, salt and cost parameters", () => {
		const key = scryptSync(utf8Hex("pw"), utf8Hex("salt"), 16, 1, 1, 16);
		assert.notEqual(
			key,
			scryptSync(utf8Hex("PW"), utf8Hex("salt"), 16, 1, 1, 16),
		);
		assert.notEqual(
			key,
			scryptSync(utf8Hex("pw"), utf8Hex("Salt"), 16, 1, 1, 16),
		);
		assert.notEqual(
			key,
			scryptSync(utf8Hex("pw"), utf8Hex("salt"), 32, 1, 1, 16),
		);
		assert.notEqual(
			key,
			scryptSync(utf8Hex("pw"), utf8Hex("salt"), 16, 2, 1, 16),
		);
		assert.notEqual(
			key,
			scryptSync(utf8Hex("pw"), utf8Hex("salt"), 16, 1, 2, 16),
		);
	});

	it("treats hex strings and Uint8Arrays identically", () => {
		assert.equal(
			scryptSync(utf8Hex("pw"), utf8Hex("salt"), 16, 1, 1, 16),
			scryptSync(toUtf8Bytes("pw"), toUtf8Bytes("salt"), 16, 1, 1, 16),
		);
	});

	it("reports progress from 0 to 1 through the async callback", async () => {
		const progress: Array<number> = [];
		await scrypt("0x", "0x", 16, 1, 1, 16, (percent) => {
			progress.push(percent);
		});
		assert.ok(progress.length > 0, "callback must fire");
		assert.equal(progress[progress.length - 1], 1, "must finish at 1");
		for (const percent of progress) {
			assert.ok(percent >= 0 && percent <= 1, `out of range: ${percent}`);
		}
		const sorted = progress.slice().sort((a, b) => a - b);
		assert.deepEqual(progress, sorted, "progress must be monotonic");
	});

	it("rejects an N that is not a power of two", async () => {
		assert.throws(
			() => scryptSync("0x", "0x", 3, 1, 1, 16),
			/"N" expected a power of 2/,
		);
		await assert.rejects(
			scrypt("0x", "0x", 3, 1, 1, 16),
			/"N" expected a power of 2/,
		);
	});

	it("rejects non-positive r, p and dkLen", () => {
		assert.throws(
			() => scryptSync("0x", "0x", 16, 0, 1, 16),
			/"r" expected integer >= 1/,
		);
		assert.throws(() => scryptSync("0x", "0x", 16, 1, 0, 16), /"p" expected/);
		assert.throws(
			() => scryptSync("0x", "0x", 16, 1, 1, 0),
			/"dkLen" expected/,
		);
	});

	it("rejects a password or salt that is not BytesLike", () => {
		for (const bad of NOT_BYTES_LIKE) {
			assert.throws(
				() => scryptSync(bad, "0x", 16, 1, 1, 16),
				/invalid BytesLike value/,
			);
			assert.throws(
				() => scryptSync("0x", bad, 16, 1, 1, 16),
				/invalid BytesLike value/,
			);
		}
	});
});

describe("randomBytes", () => {
	it("returns exactly the requested number of bytes", () => {
		for (const length of [1, 8, 16, 32, 57, 1024]) {
			const bytes = randomBytes(length);
			assert.ok(bytes instanceof Uint8Array);
			assert.equal(bytes.length, length);
		}
	});

	it("returns a different value on every call", () => {
		const seen = new Set<string>();
		for (let i = 0; i < 16; i++) {
			seen.add(hexlify(randomBytes(32)));
		}
		assert.equal(seen.size, 16, "32-byte draws must not repeat");
	});

	it("returns a fresh buffer each time rather than a shared one", () => {
		const first = randomBytes(8);
		const before = hexlify(first);
		randomBytes(8);
		assert.equal(hexlify(first), before, "earlier result must not change");
	});

	it("produces output that is not obviously constant", () => {
		// A 256-byte draw of all-equal bytes would be astronomically
		// unlikely; this catches a stubbed-out generator.
		const bytes = randomBytes(256);
		assert.ok(new Set(bytes).size > 1, "must not be a constant buffer");
	});

	it("rejects a negative, NaN, oversized or non-numeric length", () => {
		assert.throws(() => randomBytes(-1), /out of range/);
		assert.throws(() => randomBytes(NaN), /out of range/);
		assert.throws(() => randomBytes(2 ** 31), /out of range/);
		assert.throws(() => randomBytes("8" as any), /must be of type number/);
		assert.throws(
			() => randomBytes(undefined as any),
			/must be of type number/,
		);
	});

	it("PINS BUG: a non-integer or zero length is not rejected", () => {
		// random.ts passes the length straight to node's randomBytes, which
		// truncates 1.5 to 1 and happily returns an empty buffer for 0. The
		// browser shim (crypto-browser.ts randomBytes) asserts
		// Number.isInteger(length) && length > 0 && length <= 1024, so the
		// same call throws in a browser build and succeeds under node.
		assert.equal(randomBytes(1.5).length, 1);
		assert.equal(randomBytes(0).length, 0);
		assert.equal(randomBytes(2048).length, 2048);
	});

	it.skip("randomBytes should reject a length that is not a positive integer", () => {
		assert.throws(() => randomBytes(1.5), /invalid length/);
		assert.throws(() => randomBytes(0), /invalid length/);
	});
});

describe("SigningKey public keys", () => {
	it("derives the same public key as the instance accessor", () => {
		const key = new SigningKey(KEY_A);
		assert.equal(SigningKey.computePublicKey(KEY_A), key.publicKey);
		assert.equal(key.publicKey, key.publicKey, "accessor is stable");
	});

	it("returns a lower-case 0x-prefixed 57-byte public key", () => {
		const publicKey = new SigningKey(KEY_A).publicKey;
		assert.match(publicKey, /^0x[0-9a-f]{114}$/);
		assert.equal(getBytes(publicKey).length, 57);
	});

	it("accepts a 0x hex string and the equivalent Uint8Array", () => {
		assert.equal(
			SigningKey.computePublicKey(getBytes(KEY_A)),
			SigningKey.computePublicKey(KEY_A),
		);
	});

	it("ignores the compressed flag, since Ed448 has one encoding", () => {
		const uncompressed = SigningKey.computePublicKey(KEY_A, false);
		assert.equal(uncompressed, SigningKey.computePublicKey(KEY_A, true));
		assert.equal(uncompressed, new SigningKey(KEY_A).compressedPublicKey);
		assert.equal(uncompressed, new SigningKey(KEY_A).publicKey);
	});

	it("derives distinct public keys from distinct private keys", () => {
		const publicKeys = [KEY_A, KEY_B, KEY_C].map((key) =>
			SigningKey.computePublicKey(key),
		);
		assert.equal(new Set(publicKeys).size, 3);
	});

	it("handles the high-bit scalar-mode private key encoding", () => {
		// A private key whose last byte exceeds 0x7f is treated as a raw
		// clamped scalar rather than a seed, and still yields 57 bytes.
		const scalarKey = "0x" + "22".repeat(56) + "80";
		const publicKey = SigningKey.computePublicKey(scalarKey);
		assert.equal(getBytes(publicKey).length, 57);
		assert.equal(publicKey, new SigningKey(scalarKey).publicKey);
		assert.notEqual(publicKey, SigningKey.computePublicKey(KEY_B));
	});

	it("rejects private keys that are not 57 bytes", () => {
		for (const bad of [
			"0x",
			"0x1122",
			"0x" + "11".repeat(56),
			"0x" + "11".repeat(58),
		]) {
			assert.throws(
				() => SigningKey.computePublicKey(bad),
				/invalid private key/,
				bad,
			);
		}
	});

	it("PINS BUG: computePublicKey rejects the un-prefixed hex the constructor accepts", () => {
		// The constructor normalises a bare hex string by prepending 0x, but
		// the static helper calls arrayify directly and throws instead, so
		// the two entry points disagree on the same input.
		assert.equal(new SigningKey("11".repeat(57)).privateKey, KEY_A);
		assert.throws(
			() => SigningKey.computePublicKey("11".repeat(57)),
			/invalid arrayify value/,
		);
	});

	it.skip("computePublicKey should accept un-prefixed hex like the constructor", () => {
		assert.equal(
			SigningKey.computePublicKey("11".repeat(57)),
			SigningKey.computePublicKey(KEY_A),
		);
	});
});

describe("X448 shared secrets", () => {
	const a = new SigningKey(KEY_A);
	const b = new SigningKey(KEY_B);
	const c = new SigningKey(KEY_C);

	it("agrees whichever side derives it, for every pair", () => {
		for (const [left, right] of [
			[a, b],
			[a, c],
			[b, c],
		]) {
			assert.equal(
				left.computeSharedSecret(right.publicKey),
				right.computeSharedSecret(left.publicKey),
			);
		}
	});

	it("gives a distinct secret for every distinct pair", () => {
		const secrets = [
			a.computeSharedSecret(b.publicKey),
			a.computeSharedSecret(c.publicKey),
			b.computeSharedSecret(c.publicKey),
		];
		assert.equal(new Set(secrets).size, 3);
	});

	it("returns a 56-byte X448 secret, not the 57-byte Ed448 encoding", () => {
		const secret = a.computeSharedSecret(b.publicKey);
		assert.match(secret, /^0x[0-9a-f]{112}$/);
		assert.equal(getBytes(secret).length, 56);
	});

	it("does not leak either party's public key", () => {
		const secret = a.computeSharedSecret(b.publicKey);
		assert.notEqual(secret, a.publicKey);
		assert.notEqual(secret, b.publicKey);
		assert.ok(!a.publicKey.includes(secret.substring(2)));
		assert.ok(!b.publicKey.includes(secret.substring(2)));
	});

	it("does not depend on how the private key was encoded", () => {
		const fromBytes = new SigningKey(getBytes(KEY_A));
		const fromBareHex = new SigningKey("11".repeat(57));
		const expected = a.computeSharedSecret(b.publicKey);
		assert.equal(fromBytes.computeSharedSecret(b.publicKey), expected);
		assert.equal(fromBareHex.computeSharedSecret(b.publicKey), expected);
	});

	it("accepts the peer key as a Uint8Array as well as hex", () => {
		assert.equal(
			a.computeSharedSecret(getBytes(b.publicKey)),
			a.computeSharedSecret(b.publicKey),
		);
	});

	it("interoperates between seed-mode and scalar-mode keys", () => {
		const scalarKey = new SigningKey("0x" + "44".repeat(56) + "80");
		assert.equal(
			a.computeSharedSecret(scalarKey.publicKey),
			scalarKey.computeSharedSecret(a.publicKey),
		);
	});

	it("rejects a peer key of the wrong length", () => {
		for (const bad of [
			"0x",
			"0x" + "11".repeat(56),
			"0x" + "11".repeat(58),
			b.publicKey.substring(0, b.publicKey.length - 2),
		]) {
			assert.throws(() => a.computeSharedSecret(bad), /invalid public key/);
		}
	});

	it("rejects a 57-byte peer key that is not a valid point", () => {
		for (const bad of ["0x" + "ff".repeat(57), "0x" + "11".repeat(57)]) {
			assert.throws(() => a.computeSharedSecret(bad), /invalid public key/);
		}
	});

	it("rejects a peer key that is not BytesLike at all", () => {
		for (const bad of NOT_BYTES_LIKE) {
			assert.throws(
				() => a.computeSharedSecret(bad),
				/invalid BytesLike value|invalid public key/,
			);
		}
	});
});

describe("hash helper: id", () => {
	it("is SHA3-256 over the UTF-8 bytes of the string", () => {
		assert.equal(id("hello world"), sha256(toUtf8Bytes("hello world")));
		assert.equal(
			id("hello world"),
			"0x644bcc7e564373040999aac89e7622f3ca71fba1d972fd94a31c3bfbf24e3938",
		);
	});

	it("switches to keccak256 when asked", () => {
		assert.equal(
			id("hello world", true),
			keccak256(toUtf8Bytes("hello world")),
		);
		assert.equal(
			id("hello world", true),
			"0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad",
		);
		assert.notEqual(id("hello world", true), id("hello world"));
	});

	it("treats a falsy flag as the SHA3 default", () => {
		assert.equal(id("hello world", false), id("hello world"));
	});

	it("hashes the empty string", () => {
		assert.equal(id(""), sha256("0x"));
	});

	it("hashes multi-byte characters by their UTF-8 bytes", () => {
		assert.equal(id("héllo"), sha256(toUtf8Bytes("héllo")));
		assert.notEqual(id("héllo"), id("hello"));
	});

	it("hashes a long string", () => {
		assert.equal(
			id("a".repeat(10000)),
			"0xb61166b03a22f4ace84e2ad281780aabbf3eb436cc71d281cef9d8cae1e1236d",
		);
	});
});

describe("hash helper: hashMessage", () => {
	it("builds the Core personal-sign digest from prefix, length and message", () => {
		assert.equal(
			hashMessage("Hello World"),
			sha256(
				concat([
					toUtf8Bytes(MessagePrefix),
					toUtf8Bytes("11"),
					toUtf8Bytes("Hello World"),
				]),
			),
		);
		assert.equal(
			hashMessage("Hello World"),
			"0xaa1f0c682af61f7d7893f3f610c72c2847c76d00b841237e99bb5c44c2b2cd5b",
		);
	});

	it("counts UTF-8 bytes, not characters, in the length prefix", () => {
		// "héllo" is five characters but six bytes, and it is the byte count
		// that goes into the prefix.
		assert.equal(toUtf8Bytes("héllo").length, 6);
		assert.equal(
			hashMessage("héllo"),
			sha256(
				concat([
					toUtf8Bytes(MessagePrefix),
					toUtf8Bytes("6"),
					toUtf8Bytes("héllo"),
				]),
			),
		);
	});

	it("uses SHA3, so the digest is not the Ethereum personal-sign hash", () => {
		assert.notEqual(
			hashMessage("Hello World"),
			keccak256(
				concat([
					toUtf8Bytes("\u0019Ethereum Signed Message:\n"),
					toUtf8Bytes("11"),
					toUtf8Bytes("Hello World"),
				]),
			),
		);
	});

	it("hashes a hex-looking string as its characters, not as data", () => {
		// "0x4243" is six characters here; only a Uint8Array is treated as
		// the two bytes 0x42 0x43.
		assert.equal(
			hashMessage("0x4243"),
			"0x32447cf7416df0797a69c00baf0454f7b9cdbb5587bf642f74ca46bb1efe5c1e",
		);
		assert.notEqual(hashMessage("0x4243"), hashMessage(getBytes("0x4243")));
		assert.equal(
			hashMessage(getBytes("0x4243")),
			hashMessage(new Uint8Array([0x42, 0x43])),
		);
	});

	it("hashes the empty message", () => {
		assert.equal(
			hashMessage(""),
			sha256(concat([toUtf8Bytes(MessagePrefix), toUtf8Bytes("0")])),
		);
	});

	it("returns a distinct digest per message", () => {
		const digests = ["", "a", "b", "hello", "hello "].map(hashMessage);
		assert.equal(new Set(digests).size, digests.length);
	});
});

describe("solidityPacked: primitive types", () => {
	it("packs unsigned integers tightly at their declared width", () => {
		assert.equal(solidityPacked(["uint8"], [1]), "0x01");
		assert.equal(solidityPacked(["uint16"], [258]), "0x0102");
		assert.equal(
			solidityPacked(["uint256"], [2n ** 256n - 1n]),
			"0x" + "ff".repeat(32),
		);
	});

	it("treats a bare uint/int as 256 bits", () => {
		assert.equal(
			solidityPacked(["uint"], [45]),
			"0x000000000000000000000000000000000000000000000000000000000000002d",
		);
		assert.equal(
			solidityPacked(["uint"], [45]),
			solidityPacked(["uint256"], [45]),
		);
		assert.equal(
			solidityPacked(["int"], [-1]),
			solidityPacked(["int256"], [-1]),
		);
	});

	it("packs signed integers in two's complement", () => {
		assert.equal(solidityPacked(["int8"], [-1]), "0xff");
		assert.equal(solidityPacked(["int16"], [-2]), "0xfffe");
		assert.equal(solidityPacked(["int256"], [-1]), "0x" + "ff".repeat(32));
		assert.equal(solidityPacked(["int8"], [1]), "0x01");
	});

	it("packs booleans as a single byte", () => {
		assert.equal(solidityPacked(["bool"], [true]), "0x01");
		assert.equal(solidityPacked(["bool"], [false]), "0x00");
		assert.equal(solidityPacked(["bool"], [1]), "0x01", "truthy");
		assert.equal(solidityPacked(["bool"], [""]), "0x00", "falsy");
	});

	it("packs strings as raw UTF-8 with no length and no padding", () => {
		assert.equal(solidityPacked(["string"], ["abc"]), "0x616263");
		assert.equal(solidityPacked(["string"], ["héllo"]), "0x68c3a96c6c6f");
		assert.equal(solidityPacked(["string"], [""]), "0x");
	});

	it("packs dynamic bytes verbatim", () => {
		assert.equal(solidityPacked(["bytes"], ["0x1234"]), "0x1234");
		assert.equal(solidityPacked(["bytes"], ["0x"]), "0x");
		assert.equal(
			solidityPacked(["bytes"], [new Uint8Array([0x12, 0x34])]),
			"0x1234",
		);
	});

	it("packs fixed bytesN at exactly N bytes", () => {
		assert.equal(solidityPacked(["bytes4"], ["0x12345678"]), "0x12345678");
		assert.equal(solidityPacked(["bytes1"], ["0xff"]), "0xff");
		assert.equal(
			solidityPacked(["bytes32"], ["0x" + "ab".repeat(32)]),
			"0x" + "ab".repeat(32),
		);
	});

	it("concatenates several values with no separators", () => {
		assert.equal(
			solidityPacked(["uint8", "string", "bytes2"], [1, "ab", "0x0102"]),
			"0x0161620102",
		);
	});

	it("packs an empty type list as empty data", () => {
		assert.equal(solidityPacked([], []), "0x");
	});
});

describe("solidityPacked: Core addresses", () => {
	it("packs an address at Core's 22-byte width, not Ethereum's 20", () => {
		assert.equal(getBytes(ADDRESS).length, 22);
		const packed = solidityPacked(["address"], [ADDRESS]);
		assert.equal(packed, ADDRESS);
		assert.equal(getBytes(packed).length, 22);
	});

	it("normalises case and a missing 0x prefix", () => {
		assert.equal(
			solidityPacked(["address"], ["0x" + ADDRESS.substring(2).toUpperCase()]),
			ADDRESS,
		);
		assert.equal(solidityPacked(["address"], [ADDRESS.substring(2)]), ADDRESS);
	});

	it("keeps the network prefix in the packed bytes", () => {
		for (const prefix of ["cb", "ab", "ce"]) {
			const address = new Wallet({ key: KEY_A, prefix }).address;
			assert.equal(
				solidityPacked(["address"], [address]).substring(2, 4),
				prefix,
			);
		}
	});

	it("left-pads an address to 32 bytes inside an array", () => {
		assert.equal(
			solidityPacked(["address[]"], [[ADDRESS]]),
			"0x" + "00".repeat(10) + ADDRESS.substring(2),
		);
		assert.equal(
			getBytes(solidityPacked(["address[]"], [[ADDRESS]])).length,
			32,
		);
	});

	it("rejects a 20-byte Ethereum address", () => {
		// The doc comment on solidityPacked still uses an Ethereum address
		// as its example; Core requires the 22-byte ICAN form.
		assert.throws(
			() =>
				solidityPacked(
					["address"],
					["0x8ba1f109551bd432803012645ac136ddd64dba72"],
				),
			/invalid address/,
		);
	});

	it("rejects an address whose ICAN check digits are wrong", () => {
		const broken =
			ADDRESS.substring(0, ADDRESS.length - 1) +
			(ADDRESS.slice(-1) === "1" ? "2" : "1");
		assert.throws(
			() => solidityPacked(["address"], [broken]),
			/bad address checksum/,
		);
	});
});

describe("solidityPacked: arrays", () => {
	it("pads every numeric element to 32 bytes", () => {
		assert.equal(
			solidityPacked(["uint8[3]"], [[1, 2, 3]]),
			"0x" +
				"00".repeat(31) +
				"01" +
				"00".repeat(31) +
				"02" +
				"00".repeat(31) +
				"03",
		);
		assert.equal(
			getBytes(solidityPacked(["uint8[3]"], [[1, 2, 3]])).length,
			96,
		);
	});

	it("pads signed elements to a full 32-byte two's complement word", () => {
		assert.equal(
			solidityPacked(["int8[2]"], [[-1, 2]]),
			"0x" + "ff".repeat(32) + "00".repeat(31) + "02",
		);
	});

	it("pads booleans to 32 bytes inside an array", () => {
		assert.equal(
			solidityPacked(["bool[]"], [[true, false]]),
			"0x" + "00".repeat(31) + "01" + "00".repeat(32),
		);
	});

	it("right-pads bytesN elements to 32 bytes", () => {
		assert.equal(
			solidityPacked(["bytes4[]"], [["0x12345678"]]),
			"0x12345678" + "00".repeat(28),
		);
	});

	it("accepts a dynamic array of any length", () => {
		assert.equal(solidityPacked(["uint8[]"], [[]]), "0x");
		assert.equal(
			getBytes(solidityPacked(["uint8[]"], [[1, 2, 3, 4]])).length,
			128,
		);
	});

	it("does not pad string or bytes elements, unlike every other type", () => {
		// _pack ignores the isArray flag for the two dynamic types, so these
		// stay tightly packed. Solidity itself forbids encodePacked on
		// nested dynamic arrays, so there is no standard to contradict.
		assert.equal(solidityPacked(["string[]"], [["ab", "c"]]), "0x616263");
		assert.equal(solidityPacked(["bytes[]"], [["0x12", "0x3456"]]), "0x123456");
	});

	it("rejects a fixed-length array whose length does not match", () => {
		assert.throws(
			() => solidityPacked(["uint8[3]"], [[1, 2]]),
			/invalid array length for uint8\[3\]/,
		);
		assert.throws(
			() => solidityPacked(["uint8[2]"], [[1, 2, 3]]),
			/invalid array length for uint8\[2\]/,
		);
	});
});

describe("solidityPacked: input validation", () => {
	it("rejects a type list and value list of different lengths", () => {
		assert.throws(() => solidityPacked(["uint8", "bool"], [1]));
		assert.throws(() => solidityPacked(["uint8"], [1, true]));
		assert.throws(() => solidityPacked([], [1]));
	});

	it("PINS BUG: the count-mismatch message is an un-interpolated template", () => {
		// solidity.ts uses a double-quoted string where a template literal
		// was intended, so the message says `expected ${ types.length }`
		// verbatim instead of the number.
		assert.throws(() => solidityPacked(["uint8", "bool"], [1]), {
			message: /wrong number of values; expected \$\{ types\.length \}/,
		});
	});

	it.skip("the count-mismatch message should report the expected count", () => {
		assert.throws(() => solidityPacked(["uint8", "bool"], [1]), {
			message: /wrong number of values; expected 2/,
		});
	});

	it("rejects an unknown type", () => {
		for (const type of ["foo", "uint8x", "address2", ""]) {
			assert.throws(() => solidityPacked([type], [1]), /invalid type/, type);
		}
	});

	it("rejects a number width that is not a multiple of 8 or is too large", () => {
		for (const type of ["uint7", "uint257", "int0", "uint9"]) {
			assert.throws(
				() => solidityPacked([type], [1]),
				/invalid number type/,
				type,
			);
		}
	});

	it("rejects a bytes width outside 1..32", () => {
		for (const type of ["bytes0", "bytes33"]) {
			assert.throws(
				() => solidityPacked([type], ["0x" + "11".repeat(33)]),
				/invalid bytes type/,
				type,
			);
		}
	});

	it("rejects a bytesN value of the wrong length", () => {
		assert.throws(
			() => solidityPacked(["bytes4"], ["0x1234"]),
			/invalid value for bytes4/,
		);
		assert.throws(
			() => solidityPacked(["bytes4"], ["0x1234567890"]),
			/invalid value for bytes4/,
		);
	});

	it("rejects a value that does not fit the declared width", () => {
		assert.throws(() => solidityPacked(["uint8"], [256]), /padding exceeds/);
		assert.throws(
			() => solidityPacked(["uint8"], [-1]),
			/unsigned value cannot be negative/,
		);
	});
});

describe("solidityPackedSha256", () => {
	it("is SHA3-256 over the packed encoding", () => {
		const types = ["address", "uint"];
		const values = [ADDRESS, 45];
		assert.equal(
			solidityPackedSha256(types, values),
			sha256(solidityPacked(types, values)),
		);
		assert.match(solidityPackedSha256(types, values), /^0x[0-9a-f]{64}$/);
	});

	it("is not the keccak256 hash an Ethereum caller would expect", () => {
		const types = ["uint8", "string"];
		const values = [1, "ab"];
		assert.notEqual(
			solidityPackedSha256(types, values),
			keccak256(solidityPacked(types, values)),
		);
	});

	it("inherits the ambiguity of packed encoding", () => {
		// Packed encoding carries no type or length information, so two
		// different argument lists that pack to the same bytes hash the
		// same. This is a property of the encoding, not a defect, and is
		// why packed hashes need a domain separator in practice.
		assert.equal(solidityPacked(["uint8", "uint8"], [1, 2]), "0x0102");
		assert.equal(solidityPacked(["uint16"], [258]), "0x0102");
		assert.equal(
			solidityPackedSha256(["uint8", "uint8"], [1, 2]),
			solidityPackedSha256(["uint16"], [258]),
		);
		assert.equal(
			solidityPackedSha256(["string", "string"], ["a", "bc"]),
			solidityPackedSha256(["string"], ["abc"]),
		);
	});

	it("hashes the empty packing", () => {
		assert.equal(solidityPackedSha256([], []), sha256("0x"));
	});

	it("propagates packing errors rather than hashing garbage", () => {
		assert.throws(() => solidityPackedSha256(["foo"], [1]), /invalid type/);
		assert.throws(() => solidityPackedSha256(["uint8", "bool"], [1]));
	});
});

describe("uuidV4", () => {
	it("formats 16 bytes as a dashed 8-4-4-4-12 UUID", () => {
		assert.match(
			uuidV4(randomBytes(16)),
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
	});

	it("sets the version nibble to 4 and the variant bits to 10", () => {
		for (let i = 0; i < 32; i++) {
			assert.match(
				uuidV4(randomBytes(16)),
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
			);
		}
	});

	it("forces the version and variant bits even on all-zero input", () => {
		assert.equal(
			uuidV4("0x" + "00".repeat(16)),
			"00000000-0000-4000-8000-000000000000",
		);
	});

	it("clears only the bits it owns on all-ones input", () => {
		// 0x4f keeps the low nibble of byte 6; 0xbf keeps the low six bits
		// of byte 8.
		assert.equal(
			uuidV4("0x" + "ff".repeat(16)),
			"ffffffff-ffff-4fff-bfff-ffffffffffff",
		);
	});

	it("is a deterministic function of its input bytes", () => {
		const input = "0x" + "ab".repeat(16);
		assert.equal(uuidV4(input), "abababab-abab-4bab-abab-abababababab");
		assert.equal(uuidV4(input), uuidV4(input));
		assert.equal(uuidV4(input), uuidV4(getBytes(input)));
	});

	it("produces distinct UUIDs from distinct random input", () => {
		const seen = new Set<string>();
		for (let i = 0; i < 16; i++) {
			seen.add(uuidV4(randomBytes(16)));
		}
		assert.equal(seen.size, 16);
	});

	it("rejects input that is not BytesLike", () => {
		for (const bad of NOT_BYTES_LIKE) {
			assert.throws(() => uuidV4(bad), /invalid BytesLike value/);
		}
	});

	it("requires exactly 16 bytes", () => {
		// Without a length check a short buffer produced a short final group
		// and a long one was silently truncated.
		for (const length of [0, 1, 15, 17, 20]) {
			assert.throws(
				() => uuidV4("0x" + "11".repeat(length)),
				/randomBytes must be 16 bytes/,
				String(length),
			);
		}
		assert.equal(
			uuidV4("0x" + "11".repeat(16)),
			"11111111-1111-4111-9111-111111111111",
		);
	});

	it("does not mutate its argument", () => {
		// getBytes does not copy, so setting the version and variant bits
		// used to overwrite the caller's buffer - which is usually the output
		// of randomBytes, so the entropy the caller still held no longer
		// matched what it handed in.
		const bytes = new Uint8Array(16).fill(0xff);
		const uuid = uuidV4(bytes);
		assert.deepEqual(bytes, new Uint8Array(16).fill(0xff));

		// The returned UUID still carries the version and variant bits.
		assert.equal(uuid, "ffffffff-ffff-4fff-bfff-ffffffffffff");
	});
});
