/**
 *  The Ed448 backend behind SigningKey and Ed448Goldilock.
 *
 *  Up to 1.1.x the backend was bcrypto. Every operation is checked here
 *  three ways:
 *
 *   - against `testcases/ed448-backend.json`, recorded from the
 *     bcrypto-backed build (see ed448-capture.ts);
 *   - live against bcrypto's native and pure-JS builds (a dev dependency
 *     only), over deterministic random inputs and hand-picked edge cases;
 *   - against noble's RFC 8032 Ed448 for the standard operations.
 *
 *  The edge cases are where Ed448 libraries are known to differ: cofactorless
 *  versus cofactored verification, scalars of n or more, points with a
 *  torsion component, the identity point, and non-canonical encodings.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ed448 as nobleEd448 } from "@noble/curves/ed448.js";
import { shake256 } from "@noble/hashes/sha3.js";
import { Buffer } from "buffer";

// bcrypto does not ship TypeScript declarations.
// @ts-ignore
import bcryptoNative from "bcrypto/lib/ed448.js";
// @ts-ignore
import bcryptoJs from "bcrypto/lib/js/ed448.js";
// @ts-ignore
import bcryptoPbkdf2 from "bcrypto/lib/pbkdf2.js";
// @ts-ignore
import bcryptoSha3_512 from "bcrypto/lib/sha3-512.js";

import ed448 from "../crypto/ed448.js";
import browserEd448 from "../crypto/browser-ed448.js";
import { Ed448Goldilock } from "../crypto/ed448goldilock.js";
import { Ed448Goldilock as BrowserEd448Goldilock } from "../crypto/ed448goldilock-browser.js";

import {
	N,
	bytesFrom,
	captureEd448,
	edgePoints,
	edgeScalars,
	le,
	outcome,
} from "./ed448-capture.js";

const references: Array<[string, any]> = [
	["bcrypto native", bcryptoNative],
	["bcrypto js", bcryptoJs],
];

/** The operations corebc calls, with the arguments each one takes. */
type Op = (backend: any) => unknown;

function agree(name: string, op: Op): void {
	const actual = outcome(() => op(ed448));
	for (const [label, backend] of references) {
		assert.equal(
			actual,
			outcome(() => op(backend)),
			`${name} vs ${label}`,
		);
	}
}

function randomCase(label: string, i: number) {
	const secret = bytesFrom(`${label}-secret-${i}`, 57);
	const scalar = bytesFrom(`${label}-scalar-${i}`, 56);
	scalar[0] &= 0xfc;
	scalar[55] |= 0x80;
	return {
		secret,
		scalar,
		prefix: bytesFrom(`${label}-prefix-${i}`, 57),
		message: bytesFrom(`${label}-message-${i}`, (i * 37) % 300),
		digest: bytesFrom(`${label}-digest-${i}`, 32),
	};
}

describe("Ed448 backend", function () {
	this.timeout(300000);

	it("is the same module in node and browser builds", () => {
		assert.equal(browserEd448, ed448);
		assert.equal(BrowserEd448Goldilock._channel, ed448);
		assert.equal(Ed448Goldilock._channel, ed448);
	});

	it("reproduces the outputs recorded from bcrypto", () => {
		const expected = JSON.parse(
			readFileSync(
				resolve(process.cwd(), "testcases/ed448-backend.json"),
				"utf8",
			),
		);
		assert.deepEqual(captureEd448(), expected);
	});

	it("returns Buffers, as bcrypto did", () => {
		const { secret, scalar, prefix, digest } = randomCase("types", 0);
		const pub = ed448.publicKeyCreate(secret);
		const values = [
			ed448.privateKeyGenerate(),
			pub,
			ed448.publicKeyFromScalar(scalar),
			ed448.publicKeyConvert(pub),
			ed448.publicKeyCombine([pub, pub]),
			ed448.sign(digest, secret),
			ed448.signWithScalar(digest, scalar, prefix),
			ed448.derive(pub, secret),
			ed448.deriveWithScalar(pub, scalar),
		];
		for (const value of values) assert.ok(Buffer.isBuffer(value));
	});

	it("generates fresh 57-byte private keys", () => {
		const a = ed448.privateKeyGenerate();
		const b = ed448.privateKeyGenerate();
		assert.equal(a.length, 57);
		assert.notDeepEqual(a, b);
	});

	describe("matches bcrypto on random inputs", () => {
		const COUNT = 64;

		it("publicKeyCreate and publicKeyFromScalar", () => {
			for (let i = 0; i < COUNT; i++) {
				const { secret, scalar } = randomCase("pub", i);
				const raw = bytesFrom(`pub-raw-scalar-${i}`, 56);
				agree(`publicKeyCreate #${i}`, (b) => b.publicKeyCreate(secret));
				agree(`publicKeyFromScalar #${i}`, (b) =>
					b.publicKeyFromScalar(scalar),
				);
				agree(`publicKeyFromScalar raw #${i}`, (b) =>
					b.publicKeyFromScalar(raw),
				);
			}
		});

		it("sign, signWithScalar and verify", () => {
			for (let i = 0; i < COUNT; i++) {
				const { secret, scalar, prefix, message, digest } = randomCase(
					"sign",
					i,
				);
				for (const msg of [message, digest]) {
					agree(`sign #${i}`, (b) => b.sign(msg, secret));
					agree(`signWithScalar #${i}`, (b) =>
						b.signWithScalar(msg, scalar, prefix),
					);
					const pub = ed448.publicKeyCreate(secret);
					const sig = ed448.sign(msg, secret);
					assert.equal(ed448.verify(msg, sig, pub), true);
					agree(`verify #${i}`, (b) => b.verify(msg, sig, pub));

					const scalarPub = ed448.publicKeyFromScalar(scalar);
					const scalarSig = ed448.signWithScalar(msg, scalar, prefix);
					assert.equal(ed448.verify(msg, scalarSig, scalarPub), true);
				}
			}
		});

		it("verify rejects what bcrypto rejects", () => {
			for (let i = 0; i < COUNT; i++) {
				const { secret, message } = randomCase("reject", i);
				const pub = ed448.publicKeyCreate(secret);
				const sig = ed448.sign(message, secret);
				const other = ed448.publicKeyCreate(bytesFrom(`reject-other-${i}`, 57));

				const flipped = Buffer.from(sig);
				flipped[i % 114] ^= 1 << (i % 8);
				const s = BigInt(
					"0x" + Buffer.from(sig.subarray(57)).reverse().toString("hex"),
				);
				const sPlusN = Buffer.concat([sig.subarray(0, 57), le(s + N, 57)]);
				const changed = Buffer.concat([message, Buffer.from([i])]);

				const cases: Array<[string, Buffer, Buffer, Buffer]> = [
					["flipped bit", changed, sig, pub],
					["signature bit", message, flipped, pub],
					["other key", message, sig, other],
					["s + n", message, sPlusN, pub],
					["short signature", message, sig.subarray(0, 113), pub],
					[
						"long signature",
						message,
						Buffer.concat([sig, Buffer.alloc(1)]),
						pub,
					],
					["short key", message, sig, pub.subarray(0, 56)],
				];
				for (const [name, msg, signature, key] of cases) {
					assert.equal(ed448.verify(msg, signature, key), false, name);
					agree(`verify ${name} #${i}`, (b) => b.verify(msg, signature, key));
				}
			}
		});

		it("derive and deriveWithScalar", () => {
			for (let i = 0; i < COUNT; i++) {
				const { secret, scalar } = randomCase("derive", i);
				const peer = ed448.publicKeyCreate(bytesFrom(`derive-peer-${i}`, 57));
				const raw = bytesFrom(`derive-raw-scalar-${i}`, 56);
				agree(`derive #${i}`, (b) =>
					b.publicKeyConvert(b.derive(peer, secret)),
				);
				agree(`deriveWithScalar #${i}`, (b) =>
					b.publicKeyConvert(b.deriveWithScalar(peer, scalar)),
				);
				agree(`deriveWithScalar raw #${i}`, (b) =>
					b.deriveWithScalar(peer, raw),
				);
			}
		});

		it("publicKeyVerify, publicKeyConvert and publicKeyCombine", () => {
			for (let i = 0; i < COUNT; i++) {
				const a = ed448.publicKeyCreate(bytesFrom(`combine-a-${i}`, 57));
				const b2 = ed448.publicKeyCreate(bytesFrom(`combine-b-${i}`, 57));
				const noise = bytesFrom(`combine-noise-${i}`, 57);
				agree(`publicKeyVerify noise #${i}`, (b) => b.publicKeyVerify(noise));
				agree(`publicKeyConvert #${i}`, (b) => b.publicKeyConvert(a));
				agree(`publicKeyCombine #${i}`, (b) => b.publicKeyCombine([a, b2]));
				agree(`publicKeyCombine three #${i}`, (b) =>
					b.publicKeyCombine([a, b2, a]),
				);
			}
		});
	});

	describe("matches bcrypto on edge cases", () => {
		const points = edgePoints();
		const scalars = edgeScalars();
		const secret = bytesFrom("edge-case-secret", 57);
		const prefix = bytesFrom("edge-case-prefix", 57);
		const message = bytesFrom("edge-case-message", 32);

		it("decodes, converts, combines and derives every edge point", () => {
			for (const [name, p] of points) {
				agree(`publicKeyVerify ${name}`, (b) => b.publicKeyVerify(p));
				agree(`publicKeyConvert ${name}`, (b) => b.publicKeyConvert(p));
				agree(`derive ${name}`, (b) => b.derive(p, secret));
				for (const [other, q] of points) {
					agree(`publicKeyCombine ${name} + ${other}`, (b) =>
						b.publicKeyCombine([p, q]),
					);
				}
			}
			agree("publicKeyCombine of nothing", (b) => b.publicKeyCombine([]));
		});

		it("handles every edge scalar", () => {
			const pubs = points.filter(([, p]) => ed448.publicKeyVerify(p));
			for (const [name, k] of scalars) {
				agree(`publicKeyFromScalar ${name}`, (b) => b.publicKeyFromScalar(k));
				agree(`signWithScalar ${name}`, (b) =>
					b.signWithScalar(message, k, prefix),
				);
				for (const [pubName, p] of pubs) {
					agree(`deriveWithScalar ${pubName} * ${name}`, (b) =>
						b.deriveWithScalar(p, k),
					);
				}
			}
		});

		it("verifies signatures under edge keys exactly as bcrypto", () => {
			for (const [name, p] of points) {
				for (const [sigName, sigPoint] of points) {
					const sig = Buffer.concat([sigPoint, le(BigInt(7), 57)]);
					agree(`verify key ${name} sig R ${sigName}`, (b) =>
						b.verify(message, sig, p),
					);
				}
			}
		});

		it("verifies without multiplying by the cofactor, as bcrypto does", () => {
			// R + T still passes a cofactored check (noble's default verify)
			// but not bcrypto's cofactorless one.
			const pub = ed448.publicKeyCreate(secret);
			const sig = ed448.sign(message, secret);
			for (const [name, torsion] of points.filter(([n]) =>
				["order2", "order4odd", "order4even"].includes(n),
			)) {
				const R = ed448.publicKeyCombine([sig.subarray(0, 57), torsion]);
				const dirty = Buffer.concat([R, sig.subarray(57)]);
				assert.equal(ed448.verify(message, dirty, pub), false, name);
				agree(`verify R + ${name}`, (b) => b.verify(message, dirty, pub));
			}
		});

		it("accepts signatures under torsion and small-order keys where bcrypto does", () => {
			// With A' = aG + T and R = kG + T2, the cofactorless check passes
			// exactly when T2 = -e * T, so trying every T2 yields some valid
			// signatures. A small-order key A = T with R = sG passes when T * e = 0.
			const named = Object.fromEntries(points);
			const torsion = ["identity", "order2", "order4odd", "order4even"].map(
				(name) => named[name],
			);
			const challenge = (R: Buffer, A: Buffer, msg: Buffer) => {
				const hash = shake256
					.create({ dkLen: 114 })
					.update(Buffer.from("SigEd448\x00\x00", "latin1"))
					.update(R)
					.update(A)
					.update(msg)
					.digest();
				return BigInt("0x" + Buffer.from(hash).reverse().toString("hex")) % N;
			};
			const decode = (bytes: Buffer) =>
				BigInt("0x" + Buffer.from(bytes).reverse().toString("hex"));

			let accepted = 0;
			let total = 0;
			for (let i = 0; i < 8; i++) {
				const a = bytesFrom(`torsion-key-${i}`, 56);
				const k = bytesFrom(`torsion-nonce-${i}`, 56);
				const msg = bytesFrom(`torsion-message-${i}`, 32);
				for (const T of torsion) {
					const key = ed448.publicKeyCombine([ed448.publicKeyFromScalar(a), T]);
					for (const T2 of torsion) {
						const R = ed448.publicKeyCombine([
							ed448.publicKeyFromScalar(k),
							T2,
						]);
						const e = challenge(R, key, msg);
						const s = (decode(k) + e * decode(a)) % N;
						const sig = Buffer.concat([R, le(s, 57)]);
						if (ed448.verify(msg, sig, key)) accepted++;
						total++;
						agree(`verify torsion key #${i}`, (b) => b.verify(msg, sig, key));
					}
				}
				for (const T of torsion) {
					const s = decode(k) % N;
					const sig = Buffer.concat([ed448.publicKeyFromScalar(k), le(s, 57)]);
					if (ed448.verify(msg, sig, T)) accepted++;
					total++;
					agree(`verify small-order key #${i}`, (b) => b.verify(msg, sig, T));
				}
			}
			assert.ok(accepted > 0, "some constructed signatures verify");
			assert.ok(accepted < total, "some constructed signatures fail");
		});

		it("keeps a key's torsion component out of the shared secret", () => {
			const named = Object.fromEntries(points);
			const clean = ed448.derive(named["pub0"], secret);
			assert.deepEqual(ed448.derive(named["pub0+order2"], secret), clean);
		});

		it("throws bcrypto's native message for a small-order peer", () => {
			const named = Object.fromEntries(points);
			for (const name of ["identity", "order2", "order4odd", "order4even"]) {
				assert.throws(() => ed448.derive(named[name], secret), {
					message: "Invalid public key.",
				});
			}
		});
	});

	describe("matches noble's RFC 8032 Ed448", () => {
		it("derives the same public keys and signatures", () => {
			for (let i = 0; i < 32; i++) {
				const { secret, message } = randomCase("noble", i);
				const pub = ed448.publicKeyCreate(secret);
				assert.equal(
					pub.toString("hex"),
					Buffer.from(nobleEd448.getPublicKey(secret)).toString("hex"),
				);
				const sig = ed448.sign(message, secret);
				assert.equal(
					sig.toString("hex"),
					Buffer.from(nobleEd448.sign(message, secret)).toString("hex"),
				);
				assert.equal(nobleEd448.verify(sig, message, pub), true);
			}
		});
	});

	describe("Ed448Goldilock", () => {
		it("hashes with PBKDF2-HMAC-SHA3-512 exactly as bcrypto", () => {
			for (let i = 0; i < 24; i++) {
				const password = bytesFrom(`goldilock-pass-${i}`, (i * 11) % 160);
				const salt = bytesFrom(`goldilock-salt-${i}`, (i * 5) % 90);
				const expected = Buffer.from(
					bcryptoPbkdf2.derive(bcryptoSha3_512, password, salt, 2048, 57),
				).toString("hex");
				for (const Goldilock of [Ed448Goldilock, BrowserEd448Goldilock]) {
					assert.equal(
						Goldilock.SHA512Hash(
							password.toString("hex"),
							salt.toString("hex"),
						),
						expected,
					);
				}
			}
		});

		it("derives HD keys identically in node and browser builds", () => {
			for (let i = 0; i < 4; i++) {
				const seed = bytesFrom(`goldilock-hd-${i}`, 64).toString("hex");
				for (const index of [0, 3, 0x7fffffff]) {
					assert.equal(
						BrowserEd448Goldilock.HDWalletGenerateKeyFromSeed(seed, index),
						Ed448Goldilock.HDWalletGenerateKeyFromSeed(seed, index),
					);
				}
			}
		});

		it("generates seed-mode private keys", () => {
			for (const Goldilock of [Ed448Goldilock, BrowserEd448Goldilock]) {
				const key = Goldilock.generatePrivateKey();
				assert.equal(key.length, 57);
				assert.ok(key[56] < 0x80);
			}
		});
	});
});
