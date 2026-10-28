/**
 *  Recorded Ed448 behaviour, for `testcases/ed448-backend.json`.
 *
 *  Every input is derived from a fixed label, so the capture reproduces
 *  byte-for-byte. The baseline file was written from the bcrypto-backed
 *  build (corebc 1.1.2-rc.1); regenerate it only from a build whose Ed448
 *  output is already trusted:
 *
 *    node -e "import('./lib.esm/_tests/ed448-capture.js').then((m) =>
 *      console.log(JSON.stringify(m.captureEd448(), null, '\t')))"
 *
 *  Do not use these keys for anything. They are hard-coded test material.
 */

import { sha256 as sha2_256 } from "@noble/hashes/sha2.js";
import { Buffer } from "buffer";

import { SigningKey, computeAddress } from "../index.js";
import ed448 from "../crypto/ed448.js";
import { Ed448Goldilock } from "../crypto/ed448goldilock.js";

/** Deterministic test bytes: SHA-256 in counter mode over a label. */
export function bytesFrom(label: string, length: number): Buffer {
	const chunks: Uint8Array[] = [];
	for (let i = 0, total = 0; total < length; i++, total += 32) {
		chunks.push(sha2_256(new TextEncoder().encode(`${label}/${i}`)));
	}
	return Buffer.concat(chunks).subarray(0, length);
}

/** The Ed448 group order and field prime. */
export const N = BigInt(
	"0x3fffffffffffffffffffffffffffffffffffffffffffffffffffffff7cca23e9c44edb49aed63690216cc2728dc58f552378c292ab5844f3",
);
export const P =
	(BigInt(1) << BigInt(448)) - (BigInt(1) << BigInt(224)) - BigInt(1);

export function le(value: bigint, length: number): Buffer {
	const out = Buffer.alloc(length);
	let v = value;
	for (let i = 0; i < length; i++) {
		out[i] = Number(v & BigInt(0xff));
		v >>= BigInt(8);
	}
	return out;
}

/**
 *  Point encodings chosen to hit every decoding rule: valid keys, the
 *  identity, the three non-trivial torsion points, keys with a torsion
 *  component, non-canonical and off-curve encodings, and wrong lengths.
 */
export function edgePoints(): Array<[string, Buffer]> {
	const pubs = [0, 1, 2].map((i) =>
		ed448.publicKeyCreate(bytesFrom(`edge-secret-${i}`, 57)),
	);
	const identity = le(BigInt(1), 57);
	const order2 = le(P - BigInt(1), 57);
	const order4odd = Buffer.alloc(57);
	order4odd[56] = 0x80;
	const order4even = Buffer.alloc(57);
	const signedIdentity = Buffer.from(identity);
	signedIdentity[56] = 0x80;
	const highBits = Buffer.from(pubs[0]);
	highBits[56] |= 0x01;
	const flipped = Buffer.from(pubs[1]);
	flipped[56] ^= 0x80;

	const points: Array<[string, Buffer]> = [
		["pub0", pubs[0]],
		["pub1", pubs[1]],
		["pub2", pubs[2]],
		["negatedPub1", flipped],
		["identity", identity],
		["order2", order2],
		["order4odd", order4odd],
		["order4even", order4even],
		["pub0+order2", ed448.publicKeyCombine([pubs[0], order2])],
		["pub1+order4", ed448.publicKeyCombine([pubs[1], order4odd])],
		["identitySignBit", signedIdentity],
		["yEqualsP", le(P, 57)],
		["yEqualsP+1", le(P + BigInt(1), 57)],
		["byte56LowBit", highBits],
		["allFF", Buffer.alloc(57, 0xff)],
		["short", pubs[0].subarray(0, 56)],
		["long", Buffer.concat([pubs[0], Buffer.from([0])])],
		["empty", Buffer.alloc(0)],
	];
	for (let i = 0; i < 6; i++) {
		points.push([`random${i}`, bytesFrom(`edge-random-${i}`, 57)]);
	}
	return points;
}

/** 56-byte scalars at and around the boundaries bcrypto and noble treat differently. */
export function edgeScalars(): Array<[string, Buffer]> {
	const clamped = bytesFrom("edge-scalar-clamped", 56);
	clamped[0] &= 0xfc;
	clamped[55] |= 0x80;
	return [
		["zero", Buffer.alloc(56)],
		["one", le(BigInt(1), 56)],
		["n-1", le(N - BigInt(1), 56)],
		["n", le(N, 56)],
		["n+1", le(N + BigInt(1), 56)],
		["2n", le(BigInt(2) * N, 56)],
		["max", Buffer.alloc(56, 0xff)],
		["clamped", clamped],
		["random", bytesFrom("edge-scalar-random", 56)],
		["short", Buffer.alloc(55, 1)],
		["long", Buffer.alloc(57, 1)],
	];
}

/** Hex output, `true`/`false`, or `throws` when the call rejects its input. */
export function outcome(fn: () => unknown): string {
	try {
		const value = fn();
		if (typeof value === "boolean") return String(value);
		return "0x" + Buffer.from(value as Uint8Array).toString("hex");
	} catch {
		return "throws";
	}
}

function errorText(fn: () => unknown): unknown {
	try {
		return fn();
	} catch (e: any) {
		const msg = e?.shortMessage ?? e?.message ?? String(e);
		return `ERROR: ${String(msg).split("(")[0].trim()}`;
	}
}

/** Private keys in both of Core's modes: seed (byte 56 < 0x80) and scalar. */
export function testKeys(count: number): string[] {
	const keys: string[] = [];
	for (let i = 0; i < count; i++) {
		const key = bytesFrom(`key-${i}`, 57);
		if (i % 2 === 0) key[56] &= 0x7f;
		else key[56] |= 0x80;
		keys.push("0x" + key.toString("hex"));
	}
	return keys;
}

export function captureEd448(): Record<string, unknown> {
	const keys = testKeys(16);
	const signing = keys.map((privateKey, i) => {
		const key = new SigningKey(privateKey);
		const peer = new SigningKey(keys[(i + 1) % keys.length]);
		const digest = "0x" + bytesFrom(`digest-${i}`, 32).toString("hex");
		const signature = key.sign(digest);
		return {
			privateKey,
			publicKey: key.publicKey,
			address: computeAddress(key, "cb"),
			digest,
			signature,
			recovered: SigningKey.recoverPublicKey(digest, signature),
			sharedSecret: key.computeSharedSecret(peer.publicKey),
			addPoints: SigningKey.addPoints(key.publicKey, peer.publicKey),
		};
	});

	const goldilock = keys.slice(0, 8).map((privateKey, i) => {
		const bare = privateKey.slice(2);
		const message = bytesFrom(`goldilock-msg-${i}`, i * 17).toString("hex");
		const signature = Ed448Goldilock.signWithPrivateKey(bare, message);
		return {
			publicKey: Ed448Goldilock.getPublicKeyFromPrivateKey(bare),
			message,
			signature,
			signatureWithKey: Ed448Goldilock.signWithPrivateKeyNConcatPubkey(
				bare,
				message,
			),
			verifies: Ed448Goldilock.verifySignature(
				message,
				signature,
				Ed448Goldilock.getPublicKeyFromPrivateKey(bare),
			),
			sha512Hash: Ed448Goldilock.SHA512Hash(
				bytesFrom(`pbkdf-pass-${i}`, i * 13).toString("hex"),
				bytesFrom(`pbkdf-salt-${i}`, i * 7).toString("hex"),
			),
		};
	});

	const hd = [0, 1, 2, 3].flatMap((s) => {
		const seed = bytesFrom(`hd-seed-${s}`, 64).toString("hex");
		return [0, 1, 7, 0x7fffffff].map((index) => ({
			seed,
			index,
			key: Ed448Goldilock.HDWalletGenerateKeyFromSeed(seed, index),
		}));
	});

	const points = edgePoints();
	const scalars = edgeScalars();
	const pub = points[0][1];
	const secret = bytesFrom("edge-derive-secret", 57);
	const prefix = bytesFrom("edge-prefix", 57);
	const message = bytesFrom("edge-message", 32);

	const backend = {
		publicKeyVerify: Object.fromEntries(
			points.map(([name, p]) => [
				name,
				outcome(() => ed448.publicKeyVerify(p)),
			]),
		),
		publicKeyConvert: Object.fromEntries(
			points.map(([name, p]) => [
				name,
				outcome(() => ed448.publicKeyConvert(p)),
			]),
		),
		publicKeyCombine: Object.fromEntries(
			points.map(([name, p]) => [
				name,
				outcome(() => ed448.publicKeyCombine([pub, p])),
			]),
		),
		derive: Object.fromEntries(
			points.map(([name, p]) => [name, outcome(() => ed448.derive(p, secret))]),
		),
		publicKeyFromScalar: Object.fromEntries(
			scalars.map(([name, k]) => [
				name,
				outcome(() => ed448.publicKeyFromScalar(k)),
			]),
		),
		deriveWithScalar: Object.fromEntries(
			scalars.map(([name, k]) => [
				name,
				outcome(() => ed448.deriveWithScalar(pub, k)),
			]),
		),
		signWithScalar: Object.fromEntries(
			scalars.map(([name, k]) => [
				name,
				outcome(() => ed448.signWithScalar(message, k, prefix)),
			]),
		),
	};

	const errors = {
		sharedSecretWithOrder2: errorText(() =>
			new SigningKey(keys[0]).computeSharedSecret(
				"0x" + le(P - BigInt(1), 57).toString("hex"),
			),
		),
		sharedSecretWithIdentity: errorText(() =>
			new SigningKey(keys[1]).computeSharedSecret(
				"0x" + le(BigInt(1), 57).toString("hex"),
			),
		),
		recoverTampered: errorText(() => {
			const s = signing[0];
			const bad =
				s.signature.slice(0, -2) + (s.signature.endsWith("00") ? "01" : "00");
			return SigningKey.recoverPublicKey(s.digest, bad);
		}),
		addPointsInvalid: errorText(() =>
			SigningKey.addPoints(signing[0].publicKey, "0x" + "ff".repeat(57)),
		),
	};

	return { signing, goldilock, hd, backend, errors };
}
