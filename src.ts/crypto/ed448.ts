/**
 *  Ed448 (RFC 8032) on top of noble, with bcrypto's interface and results.
 *
 *  corebc used bcrypto here until 1.1.x, and keys, signatures and shared
 *  secrets must stay byte-identical. Three bcrypto behaviours differ from
 *  noble's defaults and are kept on purpose:
 *
 *   - verification is cofactorless: `G * s == R + A * e`;
 *   - scalars are taken as given, including values of n or more;
 *   - X448 conversion maps x = 0 to u = 0 instead of failing.
 */
import { ed448 as nobleEd448 } from "@noble/curves/ed448.js";
import { shake256 } from "@noble/hashes/sha3.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { bytesToNumberLE, numberToBytesLE } from "@noble/curves/utils.js";
import { Buffer } from "buffer";

import type { Ed448Backend } from "./ed448-types.js";

const Point = nobleEd448.Point;
type EdPoint = InstanceType<typeof Point>;

const N = Point.Fn.ORDER;
const ZERO = BigInt(0);
const FOUR = BigInt(4);

const KEY_SIZE = 57;
const SCALAR_SIZE = 56;

/** RFC 8032 dom4 with no pre-hash and an empty context. */
const DOM4 = Buffer.concat([
	Buffer.from("SigEd448", "latin1"),
	Buffer.from([0, 0]),
]);

function assertLength(bytes: Uint8Array, length: number, what: string): void {
	if (!(bytes instanceof Uint8Array) || bytes.length !== length) {
		throw new Error(`Invalid ${what} size.`);
	}
}

function decodeLE(bytes: Uint8Array): bigint {
	return bytesToNumberLE(bytes);
}

/** Every value encoded here is below 2^448, so it always fits. */
function encodeLE(value: bigint, length: number): Buffer {
	return Buffer.from(numberToBytesLE(value, length));
}

/** SHAKE256(dom4 || parts, 114) as a little-endian integer mod n. */
function hashToScalar(...parts: Uint8Array[]): bigint {
	const hash = shake256.create({ dkLen: 2 * KEY_SIZE });
	hash.update(DOM4);
	for (const part of parts) hash.update(part);
	return decodeLE(hash.digest()) % N;
}

/** Strict RFC 8032 decoding. The identity and torsion points are accepted. */
function decodePoint(bytes: Uint8Array): EdPoint {
	assertLength(bytes, KEY_SIZE, "point");
	try {
		return Point.fromBytes(bytes, false);
	} catch {
		throw new Error("Invalid point.");
	}
}

function encodePoint(point: EdPoint): Buffer {
	return Buffer.from(point.toBytes());
}

/** G * k for any k >= 0; G has order n, so k is reduced first. */
function mulBase(k: bigint, secret: boolean): EdPoint {
	const r = k % N;
	if (r === ZERO) return Point.ZERO;
	return secret ? Point.BASE.multiply(r) : Point.BASE.multiplyUnsafe(r);
}

/**
 *  A * k for any point on the curve and any k >= 0. A may carry a torsion
 *  component, so k cannot be reduced mod n directly. With k = 4q + r, the
 *  point 4A has order dividing n: A * k = (4A) * (q mod n) + A * r.
 */
function mulPoint(A: EdPoint, k: bigint): EdPoint {
	const q = (k / FOUR) % N;
	let result = Point.ZERO;
	if (q !== ZERO) {
		const A4 = A.clearCofactor();
		if (!A4.is0()) {
			result = A4.multiply(q);
		}
	}
	for (let r = k % FOUR; r > ZERO; r--) result = result.add(A);
	return result;
}

/** RFC 8032 key expansion: clamped scalar and nonce prefix. */
function expand(secret: Uint8Array): [Buffer, Buffer] {
	assertLength(secret, KEY_SIZE, "private key");
	const hash = Buffer.from(shake256(secret, { dkLen: 2 * KEY_SIZE }));
	const scalar = clamp(hash.subarray(0, SCALAR_SIZE));
	return [scalar, hash.subarray(KEY_SIZE)];
}

function clamp(scalar: Uint8Array): Buffer {
	const out = Buffer.from(scalar);
	out[0] &= 0xfc;
	out[SCALAR_SIZE - 1] |= 0x80;
	return out;
}

function publicKeyFromScalar(scalar: Uint8Array): Buffer {
	assertLength(scalar, SCALAR_SIZE, "scalar");
	return encodePoint(mulBase(decodeLE(scalar), true));
}

function signWithScalar(
	message: Uint8Array,
	scalar: Uint8Array,
	prefix: Uint8Array,
): Buffer {
	assertLength(prefix, KEY_SIZE, "prefix");
	assertLength(scalar, SCALAR_SIZE, "scalar");
	const a = decodeLE(scalar);
	const k = hashToScalar(prefix, message);
	const R = encodePoint(mulBase(k, true));
	const A = encodePoint(mulBase(a, true));
	const e = hashToScalar(R, A, message);
	return Buffer.concat([R, encodeLE((k + e * a) % N, KEY_SIZE)]);
}

function verify(
	message: Uint8Array,
	signature: Uint8Array,
	publicKey: Uint8Array,
): boolean {
	if (signature.length !== 2 * KEY_SIZE || publicKey.length !== KEY_SIZE) {
		return false;
	}
	try {
		const Rraw = signature.subarray(0, KEY_SIZE);
		const R = decodePoint(Rraw);
		const s = decodeLE(signature.subarray(KEY_SIZE));
		const A = decodePoint(publicKey);
		if (s >= N) return false;
		const e = hashToScalar(Rraw, publicKey, message);
		// e < n, so A * e needs no torsion-safe decomposition.
		return mulBase(s, false).subtract(A.multiplyUnsafe(e)).equals(R);
	} catch {
		return false;
	}
}

function deriveWithScalar(publicKey: Uint8Array, scalar: Uint8Array): Buffer {
	const A = decodePoint(publicKey);
	assertLength(scalar, SCALAR_SIZE, "scalar");
	const shared = mulPoint(A, decodeLE(clamp(scalar)));
	if (shared.is0()) throw new Error("Invalid public key.");
	return encodePoint(shared);
}

const ed448: Ed448Backend = {
	privateKeyGenerate(): Buffer {
		return Buffer.from(randomBytes(KEY_SIZE));
	},

	publicKeyCreate(secret: Buffer): Buffer {
		return publicKeyFromScalar(expand(secret)[0]);
	},

	publicKeyFromScalar,

	publicKeyVerify(key: Buffer): boolean {
		try {
			decodePoint(key);
			return true;
		} catch {
			return false;
		}
	},

	/** Ed448 to X448 through RFC 7748's 4-isogeny, u = y^2 / x^2. */
	publicKeyConvert(key: Buffer): Buffer {
		const point = decodePoint(key);
		if (point.is0()) throw new Error("Invalid point.");
		const { x, y } = point.toAffine();
		if (x === ZERO) return Buffer.alloc(SCALAR_SIZE);
		const u = Point.Fp.div(Point.Fp.sqr(y), Point.Fp.sqr(x));
		return encodeLE(u, SCALAR_SIZE);
	},

	publicKeyCombine(keys: Buffer[]): Buffer {
		let sum = Point.ZERO;
		for (const key of keys) sum = sum.add(decodePoint(key));
		return encodePoint(sum);
	},

	sign(message: Buffer, secret: Buffer): Buffer {
		const [scalar, prefix] = expand(secret);
		return signWithScalar(message, scalar, prefix);
	},

	signWithScalar,

	verify,

	derive(publicKey: Buffer, secret: Buffer): Buffer {
		return deriveWithScalar(publicKey, expand(secret)[0]);
	},

	deriveWithScalar,
};

export default ed448;
