import assert from "node:assert/strict";
import {
	SigningKey,
	getBytes,
	sha256,
	ripemd160,
	scryptSync,
	scrypt,
	keccak256,
} from "../index.js";
import { createHash } from "../crypto/crypto-browser.js";

describe("updated crypto dependencies", () => {
	it("matches standard hash and scrypt vectors", async () => {
		assert.equal(
			sha256("0x"),
			"0xa7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a",
		);
		assert.equal(ripemd160("0x"), "0x9c1185a5c5e9fc54612808977ee8f548b2258d31");
		assert.equal(
			keccak256("0x"),
			"0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
		);
		const expected = "0x77d6576238657b203b19ca42c18a0497";
		assert.equal(scryptSync("0x", "0x", 16, 1, 1, 16), expected);
		assert.equal(await scrypt("0x", "0x", 16, 1, 1, 16), expected);
		assert.deepEqual(
			createHash("sha256").update(new Uint8Array()).digest(),
			getBytes(
				"0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			),
		);
	});
	it("copies byte private keys and validates lengths", () => {
		const bytes = new Uint8Array(57).fill(1);
		const key = new SigningKey(bytes);
		bytes.fill(2);
		assert.equal(key.privateKey, "0x" + "01".repeat(57));
		for (const length of [0, 32, 56, 58])
			assert.throws(() => new SigningKey(new Uint8Array(length)));
		assert.throws(() => key.sign("0x00"));
	});
	it("signs, rejects tampering and derives symmetric Ed448 secrets in both key modes", () => {
		const a = new SigningKey("01".repeat(57));
		const b = new SigningKey("02".repeat(56) + "80");
		const digest = sha256("0x1234");
		for (const key of [a, b]) {
			const sig = key.sign(digest);
			assert.equal(SigningKey.recoverPublicKey(digest, sig), key.publicKey);
			assert.throws(() => SigningKey.recoverPublicKey(sha256("0x1235"), sig));
		}
		assert.equal(
			a.computeSharedSecret(b.publicKey),
			b.computeSharedSecret(a.publicKey),
		);
		assert.equal(
			SigningKey.addPoints(a.publicKey, b.publicKey),
			SigningKey.addPoints(b.publicKey, a.publicKey),
		);
		assert.throws(() => a.computeSharedSecret("0x00"));
	});
});
