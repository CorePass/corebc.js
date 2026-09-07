const U32_MASK64 = /* @__PURE__ */ (() => BigInt(2 ** 32 - 1))();
const _32n = /* @__PURE__ */ BigInt(32);
// Split bigint into two 32-bit halves. With `le=true`, returned fields become `{ h: low, l: high
// }` to match little-endian word order rather than the property names.
function fromBig(n, le = false) {
    if (le)
        return { h: Number(n & U32_MASK64), l: Number((n >> _32n) & U32_MASK64) };
    return { h: Number((n >> _32n) & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
// Split bigint list into `[highWords, lowWords]` when `le=false`; with `le=true`, the first array
// holds the low halves because `fromBig(...)` swaps the semantic meaning of `h` and `l`.
function split(lst, le = false) {
    const len = lst.length;
    let Ah = new Uint32Array(len);
    let Al = new Uint32Array(len);
    for (let i = 0; i < len; i++) {
        const { h, l } = fromBig(lst[i], le);
        [Ah[i], Al[i]] = [h, l];
    }
    return [Ah, Al];
}
// Split a JS number into u32 halves without a BigInt allocation. Exact only for integers
// `0 <= n < 2**53`; callers use it on byte / bit counters, which JS length math caps far below
// that (an ArrayBuffer cannot exceed 2**53 - 1 bytes).
const fromNumH = (n) => (n / 2 ** 32) | 0;
const fromNumL = (n) => n >>> 0;
// Drop-in replacement for `view.setBigUint64(byteOffset, BigInt(n), isLE)` without the per-call
// BigInt allocation. Same `n < 2**53` precondition as `fromNumH`/`fromNumL`.
function setU64FromNum(view, byteOffset, n, isLE) {
    const h = fromNumH(n);
    const l = fromNumL(n);
    view.setUint32(byteOffset, isLE ? l : h, isLE);
    view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
}
// High 32-bit half of a 64-bit logical right shift for `s` in `0..31`.
const shrSH = (h, _l, s) => h >>> s;
// Low 32-bit half of a 64-bit logical right shift, valid for `s` in `1..31`.
const shrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
// High 32-bit half of a 64-bit right rotate, valid for `s` in `1..31`.
const rotrSH = (h, l, s) => (h >>> s) | (l << (32 - s));
// Low 32-bit half of a 64-bit right rotate, valid for `s` in `1..31`.
const rotrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
// High 32-bit half of a 64-bit right rotate, valid for `s` in `33..63`; `32` uses `rotr32*`.
const rotrBH = (h, l, s) => (h << (64 - s)) | (l >>> (s - 32));
// Low 32-bit half of a 64-bit right rotate, valid for `s` in `33..63`; `32` uses `rotr32*`.
const rotrBL = (h, l, s) => (h >>> (s - 32)) | (l << (64 - s));
// 64-bit left rotates (rotl*) are not defined here: sha3.ts, their only consumer, keeps
// local copies so V8 inlines them into keccakP.
// Add two split 64-bit words and return the split `{ h, l }` sum.
// JS uses 32-bit signed integers for bitwise operations, so we cannot simply shift the carry out
// of the low sum and instead use division.
function add(Ah, Al, Bh, Bl) {
    const l = (Al >>> 0) + (Bl >>> 0);
    return { h: (Ah + Bh + ((l / 2 ** 32) | 0)) | 0, l: l | 0 };
}
// Addition with more than 2 elements
// Unmasked low-word accumulator for 3-way addition; pass the raw result into `add3H(...)`.
const add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
// High-word finalize step for 3-way addition; `low` must be the untruncated output of `add3L(...)`.
const add3H = (low, Ah, Bh, Ch) => (Ah + Bh + Ch + ((low / 2 ** 32) | 0)) | 0;
// Unmasked low-word accumulator for 4-way addition; pass the raw result into `add4H(...)`.
const add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
// High-word finalize step for 4-way addition; `low` must be the untruncated output of `add4L(...)`.
const add4H = (low, Ah, Bh, Ch, Dh) => (Ah + Bh + Ch + Dh + ((low / 2 ** 32) | 0)) | 0;
// Unmasked low-word accumulator for 5-way addition; pass the raw result into `add5H(...)`.
const add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
// High-word finalize step for 5-way addition; `low` must be the untruncated output of `add5L(...)`.
const add5H = (low, Ah, Bh, Ch, Dh, Eh) => (Ah + Bh + Ch + Dh + Eh + ((low / 2 ** 32) | 0)) | 0;

/**
 * Checks if something is Uint8Array. Be careful: nodejs Buffer will return true.
 * @param a - value to test
 * @returns `true` when the value is a Uint8Array-compatible view.
 * @example
 * Check whether a value is a Uint8Array-compatible view.
 * ```ts
 * isBytes(new Uint8Array([1, 2, 3]));
 * ```
 */
function isBytes$1(a) {
    // Plain `instanceof Uint8Array` is too strict for some Buffer / proxy / cross-realm cases.
    // The fallback still requires a real ArrayBuffer view, so plain
    // JSON-deserialized `{ constructor: ... }` spoofing is rejected, and
    // `BYTES_PER_ELEMENT === 1` keeps the fallback on byte-oriented views.
    return (a instanceof Uint8Array ||
        (ArrayBuffer.isView(a) &&
            a.constructor.name === 'Uint8Array' &&
            'BYTES_PER_ELEMENT' in a &&
            a.BYTES_PER_ELEMENT === 1));
}
// Shared error-message prefix builder. Only called on throw paths, so assert
// success paths never pay for the string concatenation.
const atitle = (title) => (title ? `"${title}" ` : '');
/**
 * Asserts something is a non-negative integer.
 * @param n - number to validate
 * @param title - label included in thrown errors
 * @returns The validated number.
 * @throws On wrong argument types. {@link TypeError}
 * @throws On wrong argument ranges or values. {@link RangeError}
 * @example
 * Validate a non-negative integer option.
 * ```ts
 * anumber(32, 'length');
 * ```
 */
function anumber(n, title = '') {
    if (typeof n !== 'number')
        throw new TypeError(atitle(title) + 'expected number, got ' + typeof n);
    if (!Number.isSafeInteger(n) || n < 0)
        throw new RangeError(atitle(title) + 'expected integer >= 0, got ' + n);
    return n;
}
/**
 * Asserts something is a boolean.
 * @param value - value to validate
 * @param title - label included in thrown errors
 * @returns The validated boolean.
 * @throws On wrong argument types. {@link TypeError}
 * @example
 * Validate a boolean option.
 * ```ts
 * abool(true, 'enableXOF');
 * ```
 */
function abool(value, title = '') {
    if (typeof value !== 'boolean')
        throw new TypeError(atitle(title) + 'expected boolean, got type=' + typeof value);
    return value;
}
/**
 * Asserts something is Uint8Array.
 * @param value - value to validate
 * @param length - optional exact length constraint
 * @param title - label included in thrown errors
 * @returns The validated byte array.
 * @throws On wrong argument types. {@link TypeError}
 * @throws On wrong argument ranges or values. {@link RangeError}
 * @example
 * Validate that a value is a byte array.
 * ```ts
 * abytes(new Uint8Array([1, 2, 3]));
 * ```
 */
function abytes(value, length, title = '') {
    // Success path first: this runs at the start of every update() / digestInto(), and the
    // common `abytes(data)` form must not pay for length handling it does not use.
    if (isBytes$1(value) && (length === undefined))
        return value;
    const bytes = isBytes$1(value);
    const ofLen = '';
    const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
    const message = atitle(title) + 'expected Uint8Array' + ofLen + ', got ' + got;
    if (!bytes)
        throw new TypeError(message);
    throw new RangeError(message);
}
const aobject = (value, label) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new TypeError((label === 'object' ? '' : `"${label}" `) + 'expected object, got type=' + typeof value);
};
const aopts = (value, label) => {
    aobject(value, label);
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null)
        throw new TypeError(`"${label}" expected plain object`);
    // Object.assign() treats an own "__proto__" source key as a write to the target's legacy
    // prototype setter. Reject it before merging so inherited option values cannot be injected.
    if (Object.hasOwn(value, '__proto__'))
        throw new TypeError(`"${label}.__proto__" is not allowed`);
};
/**
 * Asserts a hash instance has not been destroyed or finished.
 * @param instance - hash instance to validate
 * @param checkFinished - whether to reject finalized instances
 * @throws If the hash instance has already been destroyed or finalized. {@link Error}
 * @example
 * Validate that a hash instance is still usable.
 * ```ts
 * import { aexists } from '@noble/hashes/utils.js';
 * import { sha256 } from '@noble/hashes/sha2.js';
 * const hash = sha256.create();
 * aexists(hash);
 * ```
 */
function aexists(instance, checkFinished = true) {
    // Runs on every update()/digestInto(); the flags are library-owned booleans, so only their
    // truthiness is checked - re-validating their type per call was pure hot-path overhead.
    if (instance.destroyed)
        throw new Error('hash was destroyed');
    if (checkFinished && instance.finished)
        throw new Error('digest() was already called');
}
/**
 * Asserts output is a sufficiently-sized byte array.
 * @param out - destination buffer
 * @param instance - hash instance providing output length
 * Oversized buffers are allowed; downstream code only promises to fill the first `outputLen` bytes.
 * @throws On wrong argument types. {@link TypeError}
 * @throws On wrong argument ranges or values. {@link RangeError}
 * @example
 * Validate a caller-provided digest buffer.
 * ```ts
 * import { aoutput } from '@noble/hashes/utils.js';
 * import { sha256 } from '@noble/hashes/sha2.js';
 * const hash = sha256.create();
 * aoutput(new Uint8Array(hash.outputLen), hash);
 * ```
 */
function aoutput(out, instance) {
    abytes(out, undefined, 'output');
    // `outputLen` is a library-owned readonly number; the negated comparison keeps failing fast
    // when it is missing/NaN (comparisons with undefined/NaN are false) without an anumber() call.
    const min = instance.outputLen;
    if (!(out.length >= min)) {
        throw new RangeError('"output" expected length >= ' + min);
    }
}
/**
 * Casts a typed array view to Uint32Array.
 * `arr.byteOffset` must already be 4-byte aligned or the platform
 * Uint32Array constructor will throw.
 * @param arr - source typed array
 * @returns Uint32Array view over the same buffer.
 * @example
 * Reinterpret a byte array as 32-bit words.
 * ```ts
 * u32(new Uint8Array(8));
 * ```
 */
function u32(arr) {
    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
/**
 * Zeroizes typed arrays in place. Warning: JS provides no guarantees.
 * @param arrays - arrays to overwrite with zeros
 * @example
 * Zeroize sensitive buffers in place.
 * ```ts
 * clean(new Uint8Array([1, 2, 3]));
 * ```
 */
function clean(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
        arrays[i].fill(0);
    }
}
/**
 * Creates a DataView for byte-level manipulation.
 * @param arr - source typed array
 * @returns DataView over the same buffer region.
 * @example
 * Create a DataView over an existing buffer.
 * ```ts
 * createView(new Uint8Array(4));
 * ```
 */
function createView(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
/**
 * Rotate-right operation for uint32 values.
 * @param word - source word
 * @param shift - shift amount in bits
 * @returns Rotated word.
 * @example
 * Rotate a 32-bit word to the right.
 * ```ts
 * rotr(0x12345678, 8);
 * ```
 */
function rotr(word, shift) {
    return (word << (32 - shift)) | (word >>> shift);
}
/**
 * Rotate-left operation for uint32 values.
 * @param word - source word
 * @param shift - shift amount in bits
 * @returns Rotated word.
 * @example
 * Rotate a 32-bit word to the left.
 * ```ts
 * rotl(0x12345678, 8);
 * ```
 */
function rotl(word, shift) {
    return (word << shift) | ((word >>> (32 - shift)) >>> 0);
}
/** Whether the current platform is little-endian. */
const isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44)();
/**
 * Byte-swap operation for uint32 values.
 * @param word - source word
 * @returns Word with reversed byte order.
 * @example
 * Reverse the byte order of a 32-bit word.
 * ```ts
 * byteSwap(0x11223344);
 * ```
 */
function byteSwap(word) {
    return (((word << 24) & 0xff000000) |
        ((word << 8) & 0xff0000) |
        ((word >>> 8) & 0xff00) |
        ((word >>> 24) & 0xff));
}
/**
 * Byte-swaps every word of a Uint32Array in place.
 * @param arr - array to mutate
 * @returns The same array after mutation; callers pass live state arrays here.
 * @example
 * Reverse the byte order of every word in place.
 * ```ts
 * byteSwap32(new Uint32Array([0x11223344]));
 * ```
 */
function byteSwap32(arr) {
    for (let i = 0; i < arr.length; i++) {
        arr[i] = byteSwap(arr[i]);
    }
    return arr;
}
/**
 * Conditionally byte-swaps a Uint32Array on big-endian platforms.
 * @param u - array to normalize for host endianness
 * @returns Original or byte-swapped array depending on platform endianness.
 *   On big-endian runtimes this mutates `u` in place via `byteSwap32(...)`.
 * @example
 * Normalize a word array for host endianness.
 * ```ts
 * swap32IfBE(new Uint32Array([0x11223344]));
 * ```
 */
const swap32IfBE = isLE
    ? (u) => u
    : byteSwap32;
/**
 * Merges default options and passed options.
 * @param defaults - base option object
 * @param opts - user overrides
 * @param title - label included in thrown override errors
 * @returns Fresh merged option object with a null prototype.
 * @throws On wrong argument types. {@link TypeError}
 * @example
 * Merge user overrides onto default options.
 * ```ts
 * checkOpts({ dkLen: 32 }, { asyncTick: 10 });
 * ```
 */
function checkOpts(defaults, opts, title = 'opts') {
    aopts(defaults, 'defaults');
    if (opts !== undefined)
        aopts(opts, title);
    // Callers read optional fields directly, so omitted values must not fall through to ambient
    // Object.prototype pollution (for example a forged `dkLen` changing SHAKE's default output).
    const merged = Object.assign(Object.create(null), defaults, opts);
    return merged;
}
/**
 * Creates a callable hash function from a stateful class constructor.
 * @param hashCons - hash constructor or factory
 * @param info - optional metadata such as DER OID
 * @returns Frozen callable hash wrapper with `.create()`.
 *   Wrapper construction eagerly calls `hashCons(undefined)` once to read
 *   `outputLen` / `blockLen`, so constructor side effects happen at module
 *   init time.
 * @throws On wrong argument types. {@link TypeError}
 * @example
 * Wrap a stateful hash constructor into a callable helper.
 * ```ts
 * import { createHasher } from '@noble/hashes/utils.js';
 * import { sha256 } from '@noble/hashes/sha2.js';
 * const wrapped = createHasher(sha256.create, { oid: sha256.oid });
 * wrapped(new Uint8Array([1]));
 * ```
 */
function createHasher(hashCons, info = {}) {
    if (typeof hashCons !== 'function')
        throw new TypeError('"hashCons" expected function, got type=' + typeof hashCons);
    info = checkOpts({}, info, 'info');
    const hashC = (msg, opts) => hashCons(opts)
        .update(msg)
        .digest();
    const tmp = hashCons(undefined);
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.canXOF = tmp.canXOF;
    hashC.create = (opts) => hashCons(opts);
    Object.assign(hashC, info);
    return Object.freeze(hashC);
}
/**
 * Creates OID metadata for NIST hashes with prefix `06 09 60 86 48 01 65 03 04 02`.
 * @param suffix - final OID byte for the selected hash.
 *   The helper accepts any byte even though only the documented NIST hash
 *   suffixes are meaningful downstream.
 * @returns Object containing the DER-encoded OID.
 * @example
 * Build OID metadata for a NIST hash.
 * ```ts
 * oidNist(0x01);
 * ```
 */
const oidNist = (suffix) => ({
    // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
    // Larger suffix values would need base-128 OID encoding and a different length byte.
    oid: Uint8Array.from([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, suffix]),
});

/**
 * SHA3 (keccak) hash function, based on a new "Sponge function" design.
 * Different from older hashes, the internal state is bigger than output size.
 *
 * Check out
 * {@link https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.202.pdf | FIPS-202},
 * {@link https://keccak.team/keccak.html | Website}, and
 * {@link https://crypto.stackexchange.com/q/15727 | the differences between
 * SHA-3 and Keccak}.
 *
 * Check out `sha3-addons` module for cSHAKE, k12, and others.
 * @module
 */
// No __PURE__ annotations in sha3 header:
// EVERYTHING is in fact used on every export.
// Various per round constants calculations
const _0n = BigInt(0);
const _1n = BigInt(1);
const _2n = BigInt(2);
const _7n = BigInt(7);
const _256n = BigInt(256);
// FIPS 202 Algorithm 5 rc(): when the outgoing bit is 1, the 8-bit LFSR xors
// taps 0, 4, 5, and 6, which compresses to the feedback mask `0x71`.
const _0x71n = BigInt(0x71);
const SHA3_PI = [];
const SHA3_ROTL = [];
const _SHA3_IOTA = []; // no pure annotation: var is always used
for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
    // Pi
    [x, y] = [y, (2 * x + 3 * y) % 5];
    SHA3_PI.push(2 * (5 * y + x));
    // Rotational
    SHA3_ROTL.push((((round + 1) * (round + 2)) / 2) % 64);
    // Iota
    let t = _0n;
    for (let j = 0; j < 7; j++) {
        R = ((R << _1n) ^ ((R >> _7n) * _0x71n)) % _256n;
        if (R & _2n)
            t ^= _1n << ((_1n << BigInt(j)) - _1n);
    }
    _SHA3_IOTA.push(t);
}
const IOTAS = split(_SHA3_IOTA, true);
// `split(..., true)` keeps the local little-endian lane-word layout used by
// `state32`, so these `H` / `L` tables follow the file's first-word /
// second-word lane slots rather than `_u64.ts`'s usual high/low naming.
const SHA3_IOTA_H = IOTAS[0];
const SHA3_IOTA_L = IOTAS[1];
// 64-bit left rotates as u32 pairs. Inlined here (not imported from _u64) so V8 can
// inline them into keccakP — the import path costs ~24% on sha3_256. SHA3 is the only
// consumer of left-rotates; other hashes use right-rotates from _u64.
// Valid for s in 1..31 (SH/SL) and 33..63 (BH/BL); keccak never rotates by 0/32/64.
const rotlSH = (h, l, s) => (h << s) | (l >>> (32 - s));
const rotlSL = (h, l, s) => (l << s) | (h >>> (32 - s));
const rotlBH = (h, l, s) => (l << (s - 32)) | (h >>> (64 - s));
const rotlBL = (h, l, s) => (h << (s - 32)) | (l >>> (64 - s));
const rotlH = (h, l, s) => (s > 32 ? rotlBH(h, l, s) : rotlSH(h, l, s));
const rotlL = (h, l, s) => (s > 32 ? rotlBL(h, l, s) : rotlSL(h, l, s));
// Reused Theta scratch buffer (column parities), same pattern as SHA256_W in sha2.
// keccakP never calls user code, so the shared buffer cannot be observed mid-permutation.
const B = new Uint32Array(5 * 2);
/**
 * `keccakf1600` internal permutation, additionally allows adjusting the round count.
 * @param s - 5x5 Keccak state encoded as 25 lanes split into 50 uint32 words
 *   in this file's local little-endian lane-word order
 * @param rounds - number of rounds to execute
 * @throws On wrong argument types. {@link TypeError}
 * @throws On wrong argument ranges or values. {@link RangeError}
 * @throws If `rounds` is outside the supported `1..24` range. {@link Error}
 * @example
 * Permute a Keccak state with the default 24 rounds.
 * ```ts
 * keccakP(new Uint32Array(50));
 * ```
 */
function keccakP(s, rounds = 24) {
    if (!(s instanceof Uint32Array))
        throw new TypeError('"s" expected Uint32Array(50), got type=' + typeof s);
    if (s.length !== 50)
        throw new RangeError('"s" expected Uint32Array(50), got length=' + s.length);
    anumber(rounds, 'rounds');
    // This implementation precomputes only the standard Keccak-f[1600] 24-round Iota table.
    if (rounds < 1 || rounds > 24)
        throw new Error('"rounds" expected integer 1..24');
    // NOTE: all indices are x2 since we store state as u32 instead of u64 (bigints to slow in js)
    for (let round = 24 - rounds; round < 24; round++) {
        // Theta θ
        for (let x = 0; x < 10; x++)
            B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
        for (let x = 0; x < 10; x += 2) {
            const idx1 = (x + 8) % 10;
            const idx0 = (x + 2) % 10;
            const B0 = B[idx0];
            const B1 = B[idx0 + 1];
            const Th = rotlH(B0, B1, 1) ^ B[idx1];
            const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
            for (let y = 0; y < 50; y += 10) {
                s[x + y] ^= Th;
                s[x + y + 1] ^= Tl;
            }
        }
        // Rho (ρ) and Pi (π)
        let curH = s[2];
        let curL = s[3];
        for (let t = 0; t < 24; t++) {
            const shift = SHA3_ROTL[t];
            const Th = rotlH(curH, curL, shift);
            const Tl = rotlL(curH, curL, shift);
            const PI = SHA3_PI[t];
            curH = s[PI];
            curL = s[PI + 1];
            s[PI] = Th;
            s[PI + 1] = Tl;
        }
        // Chi (χ)
        // Same as:
        // for (let x = 0; x < 10; x++) B[x] = s[y + x];
        // for (let x = 0; x < 10; x++) s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
        for (let y = 0; y < 50; y += 10) {
            const b0 = s[y], b1 = s[y + 1], b2 = s[y + 2], b3 = s[y + 3];
            s[y] ^= ~s[y + 2] & s[y + 4];
            s[y + 1] ^= ~s[y + 3] & s[y + 5];
            s[y + 2] ^= ~s[y + 4] & s[y + 6];
            s[y + 3] ^= ~s[y + 5] & s[y + 7];
            s[y + 4] ^= ~s[y + 6] & s[y + 8];
            s[y + 5] ^= ~s[y + 7] & s[y + 9];
            s[y + 6] ^= ~s[y + 8] & b0;
            s[y + 7] ^= ~s[y + 9] & b1;
            s[y + 8] ^= ~b0 & b2;
            s[y + 9] ^= ~b1 & b3;
        }
        // Iota (ι)
        s[0] ^= SHA3_IOTA_H[round];
        s[1] ^= SHA3_IOTA_L[round];
    }
    clean(B);
}
/**
 * Keccak sponge function.
 * @param blockLen - absorb/squeeze rate in bytes
 * @param suffix - domain separation suffix byte
 * @param outputLen - default digest length in bytes. This base sponge only
 *   requires a non-negative integer; wrappers that need positive output
 *   lengths must enforce that themselves.
 * @param enableXOF - whether XOF output is allowed
 * @param rounds - number of Keccak-f rounds
 * @example
 * Build a sponge state, absorb bytes, then finalize a digest.
 * ```ts
 * const hash = new Keccak(136, 0x06, 32);
 * hash.update(new Uint8Array([1, 2, 3]));
 * hash.digest();
 * ```
 */
class Keccak {
    state;
    pos = 0;
    posOut = 0;
    finished = false;
    state32;
    destroyed = false;
    blockLen;
    suffix;
    outputLen;
    canXOF;
    enableXOF = false;
    rounds;
    // NOTE: we accept arguments in bytes instead of bits here.
    constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
        anumber(blockLen, 'blockLen');
        anumber(suffix, 'suffix');
        anumber(rounds, 'rounds');
        abool(enableXOF, 'enableXOF');
        this.blockLen = blockLen;
        this.suffix = suffix;
        this.outputLen = outputLen;
        this.enableXOF = enableXOF;
        this.canXOF = enableXOF;
        this.rounds = rounds;
        // Can be passed from user as dkLen
        anumber(outputLen, 'outputLen');
        // Only keccak-f1600 is supported: 1600 bits (5x5 matrix of 64bit) === 200 bytes of state.
        if (!(0 < blockLen && blockLen < 200))
            throw new Error('"blockLen" must be 1..199');
        this.state = new Uint8Array(200);
        this.state32 = u32(this.state);
    }
    clone() {
        return this._cloneInto();
    }
    keccak() {
        swap32IfBE(this.state32);
        keccakP(this.state32, this.rounds);
        swap32IfBE(this.state32);
        this.posOut = 0;
        this.pos = 0;
    }
    update(data) {
        aexists(this);
        abytes(data);
        const { blockLen, state, state32 } = this;
        const len = data.length;
        // Absorb full blocks with u32 XORs when both sides are 4-byte aligned.
        // XOR of same-position words equals XOR of same-position bytes, so this is endianness-safe.
        const canUseU32 = blockLen % 4 === 0 && data.byteOffset % 4 === 0;
        const blockLen32 = blockLen / 4;
        const data32 = canUseU32 && len >= blockLen ? u32(data) : undefined;
        for (let pos = 0; pos < len;) {
            if (data32 !== undefined && this.pos === 0 && pos % 4 === 0 && len - pos >= blockLen) {
                for (let i = 0, o = pos / 4; i < blockLen32; i++)
                    state32[i] ^= data32[o + i];
                pos += blockLen;
                // Subclasses (_KeccakPRG) read `this.pos` inside their `keccak()` override,
                // so it must reflect the fully-absorbed block before the permutation fires.
                this.pos = blockLen;
                this.keccak();
                continue;
            }
            const take = Math.min(blockLen - this.pos, len - pos);
            for (let i = 0; i < take; i++)
                state[this.pos++] ^= data[pos++];
            if (this.pos === blockLen)
                this.keccak();
        }
        return this;
    }
    finish() {
        if (this.finished)
            return;
        this.finished = true;
        const { state, suffix, pos, blockLen } = this;
        // FIPS 202 appends the SHA3/SHAKE domain-separation suffix before pad10*1.
        // These byte values already include the first padding bit, while the
        // final `0x80` below supplies the closing `1` bit in the last rate byte.
        state[pos] ^= suffix;
        // If that combined suffix lands in the last rate byte and already sets
        // bit 7, absorb it first so the final pad10*1 bit can be xored into a
        // fresh block.
        if ((suffix & 0x80) !== 0 && pos === blockLen - 1)
            this.keccak();
        state[blockLen - 1] ^= 0x80;
        this.keccak();
    }
    writeInto(out) {
        aexists(this, false);
        abytes(out);
        this.finish();
        const bufferOut = this.state;
        const { blockLen } = this;
        for (let pos = 0, len = out.length; pos < len;) {
            if (this.posOut >= blockLen)
                this.keccak();
            const take = Math.min(blockLen - this.posOut, len - pos);
            out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
            this.posOut += take;
            pos += take;
        }
        return out;
    }
    xofInto(out) {
        // Plain SHA3/Keccak usage with XOF is probably a mistake, but this base
        // class is also reused by SHAKE/cSHAKE/KMAC/TupleHash/ParallelHash/
        // TurboSHAKE/KangarooTwelve wrappers that intentionally enable XOF.
        if (!this.enableXOF)
            throw new Error('XOF is not enabled');
        return this.writeInto(out);
    }
    xof(bytes) {
        anumber(bytes);
        return this.xofInto(new Uint8Array(bytes));
    }
    digestInto(out) {
        aoutput(out, this);
        if (this.finished)
            throw new Error('digest() was already called');
        // `aoutput(...)` allows oversized buffers; digestInto() must fill only the advertised digest.
        this.writeInto(out.length === this.outputLen ? out : out.subarray(0, this.outputLen));
        this.destroy();
    }
    digest() {
        const out = new Uint8Array(this.outputLen);
        this.digestInto(out);
        return out;
    }
    destroy() {
        this.destroyed = true;
        clean(this.state);
    }
    _cloneInto(to) {
        const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
        to ||= new Keccak(blockLen, suffix, outputLen, enableXOF, rounds);
        // Reused destinations can come from a different rate/capacity variant, so clone must rewrite
        // the sponge geometry as well as the state words.
        to.blockLen = blockLen;
        to.state32.set(this.state32);
        // Sponge padding and XOF output are positional, so both offsets are part of the clone state.
        to.pos = this.pos;
        to.posOut = this.posOut;
        to.finished = this.finished;
        to.rounds = rounds;
        // Suffix can change in cSHAKE
        to.suffix = suffix;
        to.outputLen = outputLen;
        to.enableXOF = enableXOF;
        // Clones must preserve the public capability bit too; `_KMAC` reuses this path and deep clone
        // tests compare instance fields directly, so leaving `canXOF` behind makes the clone lie.
        to.canXOF = this.canXOF;
        to.destroyed = this.destroyed;
        return to;
    }
}
const genKeccak = (suffix, blockLen, outputLen, info = {}) => createHasher(() => new Keccak(blockLen, suffix, outputLen), info);
/**
 * SHA3-256 hash function. Different from keccak-256.
 * @param msg - message bytes to hash
 * @param opts - Reserved hash options.
 * @returns Digest bytes.
 * @example
 * Hash a message with SHA3-256.
 * ```ts
 * sha3_256(new Uint8Array([97, 98, 99]));
 * ```
 */
const sha3_256 = /* @__PURE__ */ genKeccak(0x06, 136, 32, 
/* @__PURE__ */ oidNist(0x08));
/**
 * SHA3-512 hash function.
 * @param msg - message bytes to hash
 * @param opts - Reserved hash options.
 * @returns Digest bytes.
 * @example
 * Hash a message with SHA3-512.
 * ```ts
 * sha3_512(new Uint8Array([97, 98, 99]));
 * ```
 */
const sha3_512 = /* @__PURE__ */ genKeccak(0x06, 72, 64, 
/* @__PURE__ */ oidNist(0x0a));
/**
 * Keccak-256 hash function. Different from SHA3-256.
 * @param msg - message bytes to hash
 * @param opts - Reserved hash options.
 * @returns Digest bytes.
 * @example
 * Hash a message with Keccak-256.
 * ```ts
 * keccak_256(new Uint8Array([97, 98, 99]));
 * ```
 */
const keccak_256 = /* @__PURE__ */ genKeccak(0x01, 136, 32);

let _permanentCensorErrors = false;
let _censorErrors = false;
const LogLevels = {
    debug: 1,
    default: 2,
    info: 2,
    warning: 3,
    error: 4,
    off: 5,
};
let _logLevel = LogLevels["default"];
let _globalLogger = null;
function _checkNormalize() {
    try {
        const missing = [];
        // Make sure all forms of normalization are supported
        ["NFD", "NFC", "NFKD", "NFKC"].forEach((form) => {
            try {
                if ("test".normalize(form) !== "test") {
                    throw new Error("bad normalize");
                }
            }
            catch (error) {
                missing.push(form);
            }
        });
        if (missing.length) {
            throw new Error("missing " + missing.join(", "));
        }
        if (String.fromCharCode(0xe9).normalize("NFD") !==
            String.fromCharCode(0x65, 0x0301)) {
            throw new Error("broken implementation");
        }
    }
    catch (error) {
        return error.message;
    }
    return null;
}
const _normalizeError = _checkNormalize();
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "DEBUG";
    LogLevel["INFO"] = "INFO";
    LogLevel["WARNING"] = "WARNING";
    LogLevel["ERROR"] = "ERROR";
    LogLevel["OFF"] = "OFF";
})(LogLevel || (LogLevel = {}));
var ErrorCode;
(function (ErrorCode) {
    ///////////////////
    // Generic Errors
    // Unknown Error
    ErrorCode["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
    // Not Implemented
    ErrorCode["NOT_IMPLEMENTED"] = "NOT_IMPLEMENTED";
    // Unsupported Operation
    //   - operation
    ErrorCode["UNSUPPORTED_OPERATION"] = "UNSUPPORTED_OPERATION";
    // Network Error (i.e. Core Network, such as an invalid network ID)
    //   - event ("noNetwork" is not re-thrown in provider.ready; otherwise thrown)
    ErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    // Some sort of bad response from the server
    ErrorCode["SERVER_ERROR"] = "SERVER_ERROR";
    // Timeout
    ErrorCode["TIMEOUT"] = "TIMEOUT";
    ///////////////////
    // Operational  Errors
    // Buffer Overrun
    ErrorCode["BUFFER_OVERRUN"] = "BUFFER_OVERRUN";
    // Numeric Fault
    //   - operation: the operation being executed
    //   - fault: the reason this faulted
    ErrorCode["NUMERIC_FAULT"] = "NUMERIC_FAULT";
    ///////////////////
    // Argument Errors
    // Missing new operator to an object
    //  - name: The name of the class
    ErrorCode["MISSING_NEW"] = "MISSING_NEW";
    // Invalid argument (e.g. value is incompatible with type) to a function:
    //   - argument: The argument name that was invalid
    //   - value: The value of the argument
    ErrorCode["INVALID_ARGUMENT"] = "INVALID_ARGUMENT";
    // Missing argument to a function:
    //   - count: The number of arguments received
    //   - expectedCount: The number of arguments expected
    ErrorCode["MISSING_ARGUMENT"] = "MISSING_ARGUMENT";
    // Too many arguments
    //   - count: The number of arguments received
    //   - expectedCount: The number of arguments expected
    ErrorCode["UNEXPECTED_ARGUMENT"] = "UNEXPECTED_ARGUMENT";
    ///////////////////
    // Blockchain Errors
    // Call exception
    //  - transaction: the transaction
    //  - address?: the contract address
    //  - args?: The arguments passed into the function
    //  - method?: The Solidity method signature
    //  - errorSignature?: The EIP848 error signature
    //  - errorArgs?: The EIP848 error parameters
    //  - reason: The reason (only for EIP848 "Error(string)")
    ErrorCode["CALL_EXCEPTION"] = "CALL_EXCEPTION";
    // Insufficient funds (< value + energyLimit * energyPrice)
    //   - transaction: the transaction attempted
    ErrorCode["INSUFFICIENT_FUNDS"] = "INSUFFICIENT_FUNDS";
    // Nonce has already been used
    //   - transaction: the transaction attempted
    ErrorCode["NONCE_EXPIRED"] = "NONCE_EXPIRED";
    // The replacement fee for the transaction is too low
    //   - transaction: the transaction attempted
    ErrorCode["REPLACEMENT_UNDERPRICED"] = "REPLACEMENT_UNDERPRICED";
    // The energy limit could not be estimated
    //   - transaction: the transaction passed to estimateEnergy
    ErrorCode["UNPREDICTABLE_ENERGY_LIMIT"] = "UNPREDICTABLE_ENERGY_LIMIT";
    // The transaction was replaced by one with a higher energy price
    //   - reason: "cancelled", "replaced" or "repriced"
    //   - cancelled: true if reason == "cancelled" or reason == "replaced")
    //   - hash: original transaction hash
    //   - replacement: the full TransactionsResponse for the replacement
    //   - receipt: the receipt of the replacement
    ErrorCode["TRANSACTION_REPLACED"] = "TRANSACTION_REPLACED";
})(ErrorCode || (ErrorCode = {}));
const HEX = "0123456789abcdef";
class Logger {
    version = "0.0.1";
    static errors = ErrorCode;
    static levels = LogLevel;
    constructor(version) {
        Object.defineProperty(this, "version", {
            enumerable: true,
            value: version,
            writable: false,
        });
    }
    _log(logLevel, args) {
        const level = logLevel.toLowerCase();
        if (LogLevels[level] == null) {
            this.throwArgumentError("invalid log level name", "logLevel", logLevel);
        }
        if (_logLevel > LogLevels[level]) {
            return;
        }
        console.log.apply(console, args);
    }
    debug(...args) {
        this._log(Logger.levels.DEBUG, args);
    }
    info(...args) {
        this._log(Logger.levels.INFO, args);
    }
    warn(...args) {
        this._log(Logger.levels.WARNING, args);
    }
    makeError(message, code, params) {
        // Errors are being censored
        if (_censorErrors) {
            return this.makeError("censored error", code, {});
        }
        if (!code) {
            code = Logger.errors.UNKNOWN_ERROR;
        }
        if (!params) {
            params = {};
        }
        const messageDetails = [];
        Object.keys(params).forEach((key) => {
            const value = params[key];
            try {
                if (value instanceof Uint8Array) {
                    let hex = "";
                    for (let i = 0; i < value.length; i++) {
                        hex += HEX[value[i] >> 4];
                        hex += HEX[value[i] & 0x0f];
                    }
                    messageDetails.push(key + "=Uint8Array(0x" + hex + ")");
                }
                else {
                    messageDetails.push(key + "=" + JSON.stringify(value));
                }
            }
            catch (error) {
                messageDetails.push(key + "=" + JSON.stringify(params[key].toString()));
            }
        });
        messageDetails.push(`code=${code}`);
        messageDetails.push(`version=${this.version}`);
        const reason = message;
        if (messageDetails.length) {
            message += " (" + messageDetails.join(", ") + ")";
        }
        // @TODO: Any??
        const error = new Error(message);
        error.reason = reason;
        error.code = code;
        Object.keys(params).forEach(function (key) {
            error[key] = params[key];
        });
        return error;
    }
    throwError(message, code, params) {
        throw this.makeError(message, code, params);
    }
    throwArgumentError(message, name, value) {
        return this.throwError(message, Logger.errors.INVALID_ARGUMENT, {
            argument: name,
            value: value,
        });
    }
    assert(condition, message, code, params) {
        if (!!condition) {
            return;
        }
        this.throwError(message, code, params);
    }
    assertArgument(condition, message, name, value) {
        if (!!condition) {
            return;
        }
        this.throwArgumentError(message, name, value);
    }
    checkNormalize(message) {
        if (_normalizeError) {
            this.throwError("platform missing String.prototype.normalize", Logger.errors.UNSUPPORTED_OPERATION, {
                operation: "String.prototype.normalize",
                form: _normalizeError,
            });
        }
    }
    checkSafeUint53(value, message) {
        if (typeof value !== "number") {
            return;
        }
        if (message == null) {
            message = "value not safe";
        }
        if (value < 0 || value >= 0x1fffffffffffff) {
            this.throwError(message, Logger.errors.NUMERIC_FAULT, {
                operation: "checkSafeInteger",
                fault: "out-of-safe-range",
                value: value,
            });
        }
        if (value % 1) {
            this.throwError(message, Logger.errors.NUMERIC_FAULT, {
                operation: "checkSafeInteger",
                fault: "non-integer",
                value: value,
            });
        }
    }
    checkArgumentCount(count, expectedCount, message) {
        if (message) {
            message = ": " + message;
        }
        else {
            message = "";
        }
        if (count < expectedCount) {
            this.throwError("missing argument" + message, Logger.errors.MISSING_ARGUMENT, {
                count: count,
                expectedCount: expectedCount,
            });
        }
        if (count > expectedCount) {
            this.throwError("too many arguments" + message, Logger.errors.UNEXPECTED_ARGUMENT, {
                count: count,
                expectedCount: expectedCount,
            });
        }
    }
    checkNew(target, kind) {
        if (target === Object || target == null) {
            this.throwError("missing new", Logger.errors.MISSING_NEW, {
                name: kind.name,
            });
        }
    }
    checkAbstract(target, kind) {
        if (target === kind) {
            this.throwError("cannot instantiate abstract class " +
                JSON.stringify(kind.name) +
                " directly; use a sub-class", Logger.errors.UNSUPPORTED_OPERATION, { name: target.name, operation: "new" });
        }
        else if (target === Object || target == null) {
            this.throwError("missing new", Logger.errors.MISSING_NEW, {
                name: kind.name,
            });
        }
    }
    static globalLogger() {
        if (!_globalLogger) {
            _globalLogger = new Logger("logger/0.0.1");
        }
        return _globalLogger;
    }
    static setCensorship(censorship, permanent) {
        if (!censorship && permanent) {
            this.globalLogger().throwError("cannot permanently disable censorship", Logger.errors.UNSUPPORTED_OPERATION, {
                operation: "setCensorship",
            });
        }
        if (_permanentCensorErrors) {
            if (!censorship) {
                return;
            }
            this.globalLogger().throwError("error censorship permanent", Logger.errors.UNSUPPORTED_OPERATION, {
                operation: "setCensorship",
            });
        }
        _censorErrors = !!censorship;
        _permanentCensorErrors = !!permanent;
    }
    static setLogLevel(logLevel) {
        const level = LogLevels[logLevel.toLowerCase()];
        if (level == null) {
            Logger.globalLogger().warn("invalid log level - " + logLevel);
            return;
        }
        _logLevel = level;
    }
    static from(version) {
        return new Logger(version);
    }
}

/** The current version of corebc; keep in sync with package.json. */
const version = "0.4.1";

/**
 *  Assigns the %%values%% to %%target%% as read-only values.
 *
 *  It %%types%% is specified, the values are checked.
 */
function defineProperties(target, values, types) {
    for (let key in values) {
        let value = values[key];
        Object.defineProperty(target, key, {
            enumerable: true,
            value,
            writable: false,
        });
    }
}

/**
 *  About Errors.
 *
 *  @_section: api/utils/errors:Errors  [about-errors]
 */
function stringify(value) {
    if (value == null) {
        return "null";
    }
    if (Array.isArray(value)) {
        return "[ " + value.map(stringify).join(", ") + " ]";
    }
    if (value instanceof Uint8Array) {
        const HEX = "0123456789abcdef";
        let result = "0x";
        for (let i = 0; i < value.length; i++) {
            result += HEX[value[i] >> 4];
            result += HEX[value[i] & 0xf];
        }
        return result;
    }
    if (typeof value === "object" && typeof value.toJSON === "function") {
        return stringify(value.toJSON());
    }
    switch (typeof value) {
        case "boolean":
        case "symbol":
            return value.toString();
        case "bigint":
            return BigInt(value).toString();
        case "number":
            return value.toString();
        case "string":
            return JSON.stringify(value);
        case "object": {
            const keys = Object.keys(value);
            keys.sort();
            return ("{ " +
                keys.map((k) => `${stringify(k)}: ${stringify(value[k])}`).join(", ") +
                " }");
        }
    }
    return `[ COULD NOT SERIALIZE ]`;
}
/**
 *  Returns a new Error configured to the format corebc emits errors, with
 *  the %%message%%, [[api:ErrorCode]] %%code%% and additioanl properties
 *  for the corresponding corebcError.
 *
 *  Each error in corebc includes the version of corebc, a
 *  machine-readable [[ErrorCode]], and depneding on %%code%%, additional
 *  required properties. The error message will also include the %%meeage%%,
 *  corebc version, %%code%% and all aditional properties, serialized.
 */
function makeError(message, code, info) {
    {
        const details = [];
        if (info) {
            if ("message" in info || "code" in info || "name" in info) {
                throw new Error(`value will overwrite populated values: ${stringify(info)}`);
            }
            for (const key in info) {
                const value = info[key];
                //                try {
                details.push(key + "=" + stringify(value));
                //                } catch (error: any) {
                //                console.log("MMM", error.message);
                //                    details.push(key + "=[could not serialize object]");
                //                }
            }
        }
        details.push(`code=${code}`);
        details.push(`version=${version}`);
        if (details.length) {
            message += " (" + details.join(", ") + ")";
        }
    }
    let error;
    switch (code) {
        case "INVALID_ARGUMENT":
            error = new TypeError(message);
            break;
        case "NUMERIC_FAULT":
        case "BUFFER_OVERRUN":
            error = new RangeError(message);
            break;
        default:
            error = new Error(message);
    }
    defineProperties(error, { code });
    if (info) {
        Object.assign(error, info);
    }
    return error;
}
/**
 *  Throws an corebcError with %%message%%, %%code%% and additional error
 *  %%info%% when %%check%% is falsish..
 *
 *  @see [[api:makeError]]
 */
function assert(check, message, code, info) {
    if (!check) {
        throw makeError(message, code, info);
    }
}
/**
 *  A simple helper to simply ensuring provided arguments match expected
 *  constraints, throwing if not.
 *
 *  In TypeScript environments, the %%check%% has been asserted true, so
 *  any further code does not need additional compile-time checks.
 */
function assertArgument(check, message, name, value) {
    assert(check, message, "INVALID_ARGUMENT", { argument: name, value: value });
}
["NFD", "NFC", "NFKD", "NFKC"].reduce((accum, form) => {
    try {
        // General test for normalize
        /* c8 ignore start */
        if ("test".normalize(form) !== "test") {
            throw new Error("bad");
        }
        /* c8 ignore stop */
        if (form === "NFD") {
            const check = String.fromCharCode(0xe9).normalize("NFD");
            const expected = String.fromCharCode(0x65, 0x0301);
            /* c8 ignore start */
            if (check !== expected) {
                throw new Error("broken");
            }
            /* c8 ignore stop */
        }
        accum.push(form);
    }
    catch (error) { }
    return accum;
}, []);

/**
 *  Some data helpers.
 *
 *
 *  @_subsection api/utils:Data Helpers  [about-data]
 */
const logger = new Logger("utils/data/0.0.1");
function isHexable(value) {
    return !!value.toHexString;
}
function isInteger(value) {
    return typeof value === "number" && value == value && value % 1 === 0;
}
function isBytes(value) {
    if (value == null) {
        return false;
    }
    if (value.constructor === Uint8Array) {
        return true;
    }
    if (typeof value === "string") {
        return false;
    }
    if (!isInteger(value.length) || value.length < 0) {
        return false;
    }
    for (let i = 0; i < value.length; i++) {
        const v = value[i];
        if (!isInteger(v) || v < 0 || v >= 256) {
            return false;
        }
    }
    return true;
}
function _getBytes(value, name, copy) {
    if (value instanceof Uint8Array) {
        return value;
    }
    if (typeof value === "string" && value.match(/^0x([0-9a-f][0-9a-f])*$/i)) {
        const result = new Uint8Array((value.length - 2) / 2);
        let offset = 2;
        for (let i = 0; i < result.length; i++) {
            result[i] = parseInt(value.substring(offset, offset + 2), 16);
            offset += 2;
        }
        return result;
    }
    assertArgument(false, "invalid BytesLike value", name || "value", value);
}
/**
 *  Get a typed Uint8Array for %%value%%. If already a Uint8Array
 *  the original %%value%% is returned; if a copy is required use
 *  [[getBytesCopy]].
 *
 *  @see: getBytesCopy
 */
function getBytes(value, name) {
    return _getBytes(value, name);
}
/**
 *  Returns true if %%value%% is a valid [[HexString]].
 *
 *  If %%length%% is ``true`` or a //number//, it also checks that
 *  %%value%% is a valid [[DataHexString]] of %%length%% (if a //number//)
 *  bytes of data (e.g. ``0x1234`` is 2 bytes).
 */
function isHexString(value, length) {
    if (typeof value !== "string" || !value.match(/^0x[0-9A-Fa-f]*$/)) {
        return false;
    }
    return true;
}
const HexCharacters = "0123456789abcdef";
/**
 *  Returns a [[DataHexString]] representation of %%data%%.
 */
function hexlify(value, options) {
    if (!options) {
        options = {};
    }
    if (typeof value === "string") {
        if (value.includes(",") && value.startsWith("0x")) {
            const v = value
                .replace("0x", "")
                .split(",")
                .map((item) => Number(item));
            // @ts-ignore
            value = new Uint8Array(v);
        }
    }
    if (typeof value === "number") {
        logger.checkSafeUint53(value, "invalid hexlify value");
        let hex = "";
        while (value) {
            hex = HexCharacters[value & 0xf] + hex;
            value = Math.floor(value / 16);
        }
        if (hex.length) {
            if (hex.length % 2) {
                hex = "0" + hex;
            }
            return "0x" + hex;
        }
        return "0x00";
    }
    if (typeof value === "bigint") {
        value = value.toString(16);
        if (value.length % 2) {
            return "0x0" + value;
        }
        return "0x" + value;
    }
    if (options.allowMissingPrefix &&
        typeof value === "string" &&
        value.substring(0, 2) !== "0x") {
        value = "0x" + value;
    }
    if (isHexable(value)) {
        return value.toHexString();
    }
    if (isHexString(value)) {
        if (value.length % 2) {
            if (options.hexPad === "left") {
                value = "0x0" + value.substring(2);
            }
            else if (options.hexPad === "right") {
                value += "0";
            }
            else {
                logger.throwArgumentError("hex data is odd-length", "value", value);
            }
        }
        return value.toLowerCase();
    }
    if (isBytes(value)) {
        let result = "0x";
        for (let i = 0; i < value.length; i++) {
            let v = value[i];
            result += HexCharacters[(v & 0xf0) >> 4] + HexCharacters[v & 0x0f];
        }
        return result;
    }
    return logger.throwArgumentError("invalid hexlify value", "value", value);
}

/**
 *  Using strings in Core (or any security-basd system) requires
 *  additional care. These utilities attempt to mitigate some of the
 *  safety issues as well as provide the ability to recover and analyse
 *  strings.
 *
 *  @_subsection api/utils:Strings and UTF-8  [about-strings]
 */
function errorFunc(reason, offset, bytes, output, badCodepoint) {
    assertArgument(false, `invalid codepoint at offset ${offset}; ${reason}`, "bytes", bytes);
}
function ignoreFunc(reason, offset, bytes, output, badCodepoint) {
    // If there is an invalid prefix (including stray continuation), skip any additional continuation bytes
    if (reason === "BAD_PREFIX" || reason === "UNEXPECTED_CONTINUE") {
        let i = 0;
        for (let o = offset + 1; o < bytes.length; o++) {
            if (bytes[o] >> 6 !== 0x02) {
                break;
            }
            i++;
        }
        return i;
    }
    // This byte runs us past the end of the string, so just jump to the end
    // (but the first byte was read already read and therefore skipped)
    if (reason === "OVERRUN") {
        return bytes.length - offset - 1;
    }
    // Nothing to skip
    return 0;
}
function replaceFunc(reason, offset, bytes, output, badCodepoint) {
    // Overlong representations are otherwise "valid" code points; just non-deistingtished
    if (reason === "OVERLONG") {
        assertArgument(typeof badCodepoint === "number", "invalid bad code point for replacement", "badCodepoint", badCodepoint);
        output.push(badCodepoint);
        return 0;
    }
    // Put the replacement character into the output
    output.push(0xfffd);
    // Otherwise, process as if ignoring errors
    return ignoreFunc(reason, offset, bytes);
}
/**
 *  A handful of popular, built-in UTF-8 error handling strategies.
 *
 *  **``"error"``** - throws on ANY illegal UTF-8 sequence or
 *  non-canonical (overlong) codepoints (this is the default)
 *
 *  **``"ignore"``** - silently drops any illegal UTF-8 sequence
 *  and accepts non-canonical (overlong) codepoints
 *
 *  **``"replace"``** - replace any illegal UTF-8 sequence with the
 *  UTF-8 replacement character (i.e. ``"\\ufffd"``) and accepts
 *  non-canonical (overlong) codepoints
 *
 *  @returns: Record<"error" | "ignore" | "replace", Utf8ErrorFunc>
 */
const Utf8ErrorFuncs = Object.freeze({
    error: errorFunc,
    ignore: ignoreFunc,
    replace: replaceFunc,
});
// http://stackoverflow.com/questions/13356493/decode-utf-8-with-javascript#13691499
function getUtf8CodePoints(_bytes, onError) {
    if (onError == null) {
        onError = Utf8ErrorFuncs.error;
    }
    const bytes = getBytes(_bytes, "bytes");
    const result = [];
    let i = 0;
    // Invalid bytes are ignored
    while (i < bytes.length) {
        const c = bytes[i++];
        // 0xxx xxxx
        if (c >> 7 === 0) {
            result.push(c);
            continue;
        }
        // Multibyte; how many bytes left for this character?
        let extraLength = null;
        let overlongMask = null;
        // 110x xxxx 10xx xxxx
        if ((c & 0xe0) === 0xc0) {
            extraLength = 1;
            overlongMask = 0x7f;
            // 1110 xxxx 10xx xxxx 10xx xxxx
        }
        else if ((c & 0xf0) === 0xe0) {
            extraLength = 2;
            overlongMask = 0x7ff;
            // 1111 0xxx 10xx xxxx 10xx xxxx 10xx xxxx
        }
        else if ((c & 0xf8) === 0xf0) {
            extraLength = 3;
            overlongMask = 0xffff;
        }
        else {
            if ((c & 0xc0) === 0x80) {
                i += onError("UNEXPECTED_CONTINUE", i - 1, bytes, result);
            }
            else {
                i += onError("BAD_PREFIX", i - 1, bytes, result);
            }
            continue;
        }
        // Do we have enough bytes in our data?
        if (i - 1 + extraLength >= bytes.length) {
            i += onError("OVERRUN", i - 1, bytes, result);
            continue;
        }
        // Remove the length prefix from the char
        let res = c & ((1 << (8 - extraLength - 1)) - 1);
        for (let j = 0; j < extraLength; j++) {
            let nextChar = bytes[i];
            // Invalid continuation byte
            if ((nextChar & 0xc0) != 0x80) {
                i += onError("MISSING_CONTINUE", i, bytes, result);
                res = null;
                break;
            }
            res = (res << 6) | (nextChar & 0x3f);
            i++;
        }
        // See above loop for invalid continuation byte
        if (res === null) {
            continue;
        }
        // Maximum code point
        if (res > 0x10ffff) {
            i += onError("OUT_OF_RANGE", i - 1 - extraLength, bytes, result, res);
            continue;
        }
        // Reserved for UTF-16 surrogate halves
        if (res >= 0xd800 && res <= 0xdfff) {
            i += onError("UTF16_SURROGATE", i - 1 - extraLength, bytes, result, res);
            continue;
        }
        // Check for overlong sequences (more bytes than needed)
        if (res <= overlongMask) {
            i += onError("OVERLONG", i - 1 - extraLength, bytes, result, res);
            continue;
        }
        result.push(res);
    }
    return result;
}
// http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
/**
 *  Returns the UTF-8 byte representation of %%str%%.
 *
 *  If %%form%% is specified, the string is normalized.
 */
function toUtf8Bytes(str, form) {
    let result = [];
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c < 0x80) {
            result.push(c);
        }
        else if (c < 0x800) {
            result.push((c >> 6) | 0xc0);
            result.push((c & 0x3f) | 0x80);
        }
        else if ((c & 0xfc00) == 0xd800) {
            i++;
            const c2 = str.charCodeAt(i);
            assertArgument(i < str.length && (c2 & 0xfc00) === 0xdc00, "invalid surrogate pair", "str", str);
            // Surrogate Pair
            const pair = 0x10000 + ((c & 0x03ff) << 10) + (c2 & 0x03ff);
            result.push((pair >> 18) | 0xf0);
            result.push(((pair >> 12) & 0x3f) | 0x80);
            result.push(((pair >> 6) & 0x3f) | 0x80);
            result.push((pair & 0x3f) | 0x80);
        }
        else {
            result.push((c >> 12) | 0xe0);
            result.push(((c >> 6) & 0x3f) | 0x80);
            result.push((c & 0x3f) | 0x80);
        }
    }
    return new Uint8Array(result);
}
//export
function _toUtf8String(codePoints) {
    return codePoints
        .map((codePoint) => {
        if (codePoint <= 0xffff) {
            return String.fromCharCode(codePoint);
        }
        codePoint -= 0x10000;
        return String.fromCharCode(((codePoint >> 10) & 0x3ff) + 0xd800, (codePoint & 0x3ff) + 0xdc00);
    })
        .join("");
}
/**
 *  Returns the string represented by the UTF-8 data %%bytes%%.
 *
 *  When %%onError%% function is specified, it is called on UTF-8
 *  errors allowing recovery using the [[Utf8ErrorFunc]] API.
 *  (default: [error](Utf8ErrorFuncs))
 */
function toUtf8String(bytes, onError) {
    return _toUtf8String(getUtf8CodePoints(bytes, onError));
}

/**
 *  Cryptographic hashing functions
 *
 *  @_subsection: api/crypto:Hash Functions [about-crypto-hashing]
 */
let locked = false;
const _keccak256 = function (data) {
    return keccak_256(data);
};
let __keccak256 = _keccak256;
/**
 *  Compute the cryptographic KECCAK256 hash of %%data%%.
 *
 *  The %%data%% **must** be a data representation, to compute the
 *  hash of UTF-8 data use the [[id]] function.
 *
 *  @returns DataHexstring
 *  @example:
 *    keccak256("0x")
 *    //_result:
 *
 *    keccak256("0x1337")
 *    //_result:
 *
 *    keccak256(new Uint8Array([ 0x13, 0x37 ]))
 *    //_result:
 *
 *    // Strings are assumed to be DataHexString, otherwise it will
 *    // throw. To hash UTF-8 data, see the note above.
 *    keccak256("Hello World")
 *    //_error:
 */
function keccak256(_data) {
    const data = getBytes(_data, "data");
    return hexlify(__keccak256(data));
}
keccak256._ = _keccak256;
keccak256.lock = function () {
    locked = true;
};
keccak256.register = function (func) {
    if (locked) {
        throw new TypeError("keccak256 is locked");
    }
    __keccak256 = func;
};
Object.freeze(keccak256);

/**
 * Internal Merkle-Damgard hash utils.
 * @module
 */
/**
 * Shared 32-bit conditional boolean primitive reused by SHA-256, SHA-1, and MD5 `F`.
 * Returns bits from `b` when `a` is set, otherwise from `c`.
 * The XOR form is equivalent to MD5's `F(X,Y,Z) = XY v not(X)Z` because the masked terms never
 * set the same bit.
 * @param a - selector word
 * @param b - word chosen when selector bit is set
 * @param c - word chosen when selector bit is clear
 * @returns Mixed 32-bit word.
 * @example
 * Combine three words with the shared 32-bit choice primitive.
 * ```ts
 * Chi(0xffffffff, 0x12345678, 0x87654321);
 * ```
 */
function Chi(a, b, c) {
    return (a & b) ^ (~a & c);
}
/**
 * Shared 32-bit majority primitive reused by SHA-256 and SHA-1.
 * Returns bits shared by at least two inputs.
 * @param a - first input word
 * @param b - second input word
 * @param c - third input word
 * @returns Mixed 32-bit word.
 * @example
 * Combine three words with the shared 32-bit majority primitive.
 * ```ts
 * Maj(0xffffffff, 0x12345678, 0x87654321);
 * ```
 */
function Maj(a, b, c) {
    return (a & b) ^ (a & c) ^ (b & c);
}
/**
 * Merkle-Damgard hash construction base class.
 * Could be used to create MD5, RIPEMD, SHA1, SHA2.
 * Accepts only byte-aligned `Uint8Array` input, even when the underlying spec describes bit
 * strings with partial-byte tails.
 * @param blockLen - internal block size in bytes
 * @param outputLen - digest size in bytes
 * @param padOffset - trailing length field size in bytes
 * @param isLE - whether length and state words are encoded in little-endian
 * @example
 * Use a concrete subclass to get the shared Merkle-Damgard update/digest flow.
 * ```ts
 * import { _SHA1 } from '@noble/hashes/legacy.js';
 * const hash = new _SHA1();
 * hash.update(new Uint8Array([97, 98, 99]));
 * hash.digest();
 * ```
 */
class HashMD {
    blockLen;
    outputLen;
    canXOF = false;
    padOffset;
    isLE;
    // For partial updates less than block size
    buffer;
    view;
    finished = false;
    length = 0;
    pos = 0;
    destroyed = false;
    constructor(blockLen, outputLen, padOffset, isLE) {
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.padOffset = padOffset;
        this.isLE = isLE;
        this.buffer = new Uint8Array(blockLen);
        this.view = createView(this.buffer);
    }
    update(data) {
        aexists(this);
        abytes(data);
        const { view, buffer, blockLen } = this;
        const len = data.length;
        let processed = false;
        for (let pos = 0; pos < len;) {
            const take = Math.min(blockLen - this.pos, len - pos);
            // Fast path only when there is no buffered partial block: `take === blockLen` implies
            // `this.pos === 0`, so we can process full blocks directly from the input view.
            if (take === blockLen) {
                const dataView = createView(data);
                for (; blockLen <= len - pos; pos += blockLen)
                    this.process(dataView, pos);
                processed = true;
                continue;
            }
            // When the whole input is buffered in one go (common for short messages), passing `data`
            // directly avoids allocating a subarray view.
            buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
            this.pos += take;
            pos += take;
            if (this.pos === blockLen) {
                this.process(view, 0);
                this.pos = 0;
                processed = true;
            }
        }
        this.length += data.length;
        // Shared schedule buffers only pick up input-derived words inside process(); if everything
        // was buffered without processing, there is nothing to zero.
        if (processed)
            this.roundClean();
        return this;
    }
    digestInto(out) {
        aexists(this);
        aoutput(out, this);
        this.finished = true;
        // Padding
        // We can avoid allocation of buffer for padding completely if it
        // was previously not allocated here. But it won't change performance.
        const { buffer, view, blockLen, isLE } = this;
        let { pos } = this;
        // append the bit '1' to the message, then zero-pad the rest of the block
        buffer[pos++] = 0b10000000;
        buffer.fill(0, pos);
        // we have less than padOffset left in buffer, so we cannot put length in
        // current block, need process it and pad again
        if (this.padOffset > blockLen - pos) {
            this.process(view, 0);
            buffer.fill(0);
        }
        // `padOffset` reserves the whole length field. For SHA-384/512 the high 64 bits stay zero from
        // the padding fill above, and JS will overflow before user input can make that half non-zero.
        // So we only need to write the low 64 bits here (`length * 8` only scales the exponent of an
        // integer below 2**53, so the split inside the helper stays exact).
        setU64FromNum(view, blockLen - 8, this.length * 8, isLE);
        this.process(view, 0);
        // The final block above is processed outside update(), so the shared message-schedule
        // buffers (e.g. SHA256_W) would otherwise retain input-derived words after digest().
        this.roundClean();
        // digest() passes our own `buffer` as `out`; reuse its cached view instead of allocating one.
        const oview = out === buffer ? view : createView(out);
        const len = this.outputLen;
        // NOTE: we do division by 4 later, which must be fused in single op with modulo by JIT
        const outLen = len / 4;
        const state = this.get();
        // Subclass-misconfiguration invariant: outputLen must be 32-bit aligned and fit the state.
        if (len % 4 || outLen > state.length)
            throw new Error('invalid outputLen');
        for (let i = 0; i < outLen; i++)
            oview.setUint32(4 * i, state[i], isLE);
    }
    digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        // Copy before destroy(): subclasses wipe `buffer` during cleanup, but `digest()` must return
        // fresh bytes to the caller.
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
    }
    _cloneIntoMeta(to) {
        const { buffer, length, finished, destroyed, pos } = this;
        to.destroyed = destroyed;
        to.finished = finished;
        to.length = length;
        to.pos = pos;
        // Only partial-block bytes need copying: when `length % blockLen === 0`, `pos === 0` and
        // later `update()` / `digestInto()` overwrite `to.buffer` from the start before reading it.
        if (pos)
            to.buffer.set(buffer); // Avoid a hot modulo guard.
        return to;
    }
    clone() {
        return this._cloneInto();
    }
}
/**
 * Initial SHA-2 state: fractional parts of square roots of first 16 primes 2..53.
 * Check out `test/misc/sha2-gen-iv.js` for recomputation guide.
 */
/** Initial SHA256 state from RFC 6234 §6.1: the first 32 bits of the fractional parts of the
 * square roots of the first eight prime numbers. Exported as a shared table; callers must treat
 * it as read-only because constructors copy words from it by index. */
const SHA256_IV = /* @__PURE__ */ Uint32Array.from([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);
/** Initial SHA512 state from RFC 6234 §6.3: eight RFC 64-bit `H(0)` words stored as sixteen
 * big-endian 32-bit halves. Derived from the fractional parts of the square roots of the first
 * eight prime numbers. Exported as a shared table; callers must treat it as read-only because
 * constructors copy halves from it by index. */
const SHA512_IV = /* @__PURE__ */ Uint32Array.from([
    0x6a09e667, 0xf3bcc908, 0xbb67ae85, 0x84caa73b, 0x3c6ef372, 0xfe94f82b, 0xa54ff53a, 0x5f1d36f1,
    0x510e527f, 0xade682d1, 0x9b05688c, 0x2b3e6c1f, 0x1f83d9ab, 0xfb41bd6b, 0x5be0cd19, 0x137e2179,
]);

/**

SHA1 (RFC 3174), MD5 (RFC 1321), and RIPEMD160 legacy, weak hash functions.
RFC 2286 only covers HMAC-RIPEMD160 wrapper material and test vectors,
not the base RIPEMD-160 compression spec.
Don't use them in a new protocol. What "weak" means:

- Collisions can be made with 2^18 effort in MD5, 2^60 in SHA1, 2^80 in RIPEMD160.
- No practical pre-image attacks (only theoretical, 2^123.4)
- HMAC seems kinda ok: https://www.rfc-editor.org/rfc/rfc6151
 * @module
 */
// RIPEMD-160
// Permutation repeatedly applied to derive the later RIPEMD-160 message-order tables.
const Rho160 = /* @__PURE__ */ Uint8Array.from([
    7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
]);
const Id160 = /* @__PURE__ */ (() => Uint8Array.from(new Array(16).fill(0).map((_, i) => i)))();
const Pi160 = /* @__PURE__ */ (() => Id160.map((i) => (9 * i + 5) % 16))();
// Five left/right message-word orderings for the RIPEMD-160 dual-lane rounds.
const idxLR = /* @__PURE__ */ (() => {
    const L = [Id160];
    const R = [Pi160];
    const res = [L, R];
    for (let i = 0; i < 4; i++)
        for (let j of res)
            j.push(j[i].map((k) => Rho160[k]));
    return res;
})();
const idxL = /* @__PURE__ */ (() => idxLR[0])();
const idxR = /* @__PURE__ */ (() => idxLR[1])();
// const [idxL, idxR] = idxLR;
// Base per-group shift table before the left/right message-order permutations are applied.
const shifts160 = /* @__PURE__ */ [
    [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
    [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
    [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
    [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
    [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5],
].map((i) => Uint8Array.from(i));
const shiftsL160 = /* @__PURE__ */ idxL.map((idx, i) => idx.map((j) => shifts160[i][j]));
const shiftsR160 = /* @__PURE__ */ idxR.map((idx, i) => idx.map((j) => shifts160[i][j]));
// Five left-lane additive constants for RIPEMD-160.
const Kl160 = /* @__PURE__ */ Uint32Array.from([
    0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e,
]);
// Five right-lane additive constants for RIPEMD-160.
const Kr160 = /* @__PURE__ */ Uint32Array.from([
    0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000,
]);
// Called `f()` in the spec; valid `group` values are 0..4, and out-of-range
// inputs currently fall through to the group-4 branch.
function ripemd_f(group, x, y, z) {
    if (group === 0)
        return x ^ y ^ z;
    if (group === 1)
        return (x & y) | (~x & z);
    if (group === 2)
        return (x | ~y) ^ z;
    if (group === 3)
        return (x & z) | (y & ~z);
    return x ^ (y | ~z);
}
// Reusable 16-word RIPEMD-160 message block buffer.
const BUF_160 = /* @__PURE__ */ new Uint32Array(16);
/**
 * Internal RIPEMD-160 legacy hash class.
 * RFC 2286 only adds HMAC-RIPEMD160 material, not the core hash specification.
 */
class _RIPEMD160 extends HashMD {
    h0 = 0x67452301 | 0;
    h1 = 0xefcdab89 | 0;
    h2 = 0x98badcfe | 0;
    h3 = 0x10325476 | 0;
    h4 = 0xc3d2e1f0 | 0;
    constructor() {
        super(64, 20, 8, true);
    }
    get() {
        const { h0, h1, h2, h3, h4 } = this;
        return [h0, h1, h2, h3, h4];
    }
    set(h0, h1, h2, h3, h4) {
        this.h0 = h0 | 0;
        this.h1 = h1 | 0;
        this.h2 = h2 | 0;
        this.h3 = h3 | 0;
        this.h4 = h4 | 0;
    }
    _cloneInto(to) {
        (to ||= new this.constructor()).set(...this.get());
        return this._cloneIntoMeta(to);
    }
    process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4)
            BUF_160[i] = view.getUint32(offset, true);
        // prettier-ignore
        let al = this.h0 | 0, ar = al, bl = this.h1 | 0, br = bl, cl = this.h2 | 0, cr = cl, dl = this.h3 | 0, dr = dl, el = this.h4 | 0, er = el;
        // Instead of iterating 0 to 80, we split it into 5 groups
        // And use the groups in constants, functions, etc. Much simpler
        for (let group = 0; group < 5; group++) {
            const rGroup = 4 - group;
            const hbl = Kl160[group], hbr = Kr160[group]; // prettier-ignore
            const rl = idxL[group], rr = idxR[group]; // prettier-ignore
            const sl = shiftsL160[group], sr = shiftsR160[group]; // prettier-ignore
            for (let i = 0; i < 16; i++) {
                const tl = (rotl(al + ripemd_f(group, bl, cl, dl) + BUF_160[rl[i]] + hbl, sl[i]) + el) | 0;
                al = el, el = dl, dl = rotl(cl, 10) | 0, cl = bl, bl = tl; // prettier-ignore
            }
            // 2 loops are 10% faster
            for (let i = 0; i < 16; i++) {
                const tr = (rotl(ar + ripemd_f(rGroup, br, cr, dr) + BUF_160[rr[i]] + hbr, sr[i]) + er) | 0;
                ar = er, er = dr, dr = rotl(cr, 10) | 0, cr = br, br = tr; // prettier-ignore
            }
        }
        // Add the compressed chunk to the current hash value
        // Final recombination cross-adds the left/right lane accumulators into the next h0..h4 order.
        this.set((this.h1 + cl + dr) | 0, (this.h2 + dl + er) | 0, (this.h3 + el + ar) | 0, (this.h4 + al + br) | 0, (this.h0 + bl + cr) | 0);
    }
    roundClean() {
        clean(BUF_160);
    }
    destroy() {
        this.destroyed = true;
        clean(this.buffer);
        this.set(0, 0, 0, 0, 0);
    }
}
/**
 * RIPEMD-160 - a legacy hash function from 1990s.
 * RFC 2286 only covers HMAC-RIPEMD160 test material; the links below point
 * at the base RIPEMD-160 references.
 * * {@link https://homes.esat.kuleuven.be/~bosselae/ripemd160.html}
 * * {@link https://homes.esat.kuleuven.be/~bosselae/ripemd160/pdf/AB-9601/AB-9601.pdf}
 * @param msg - message bytes to hash
 * @param opts - Reserved hash options.
 * @returns Digest bytes.
 * @example
 * Hash a message with RIPEMD-160.
 * ```ts
 * ripemd160(new Uint8Array([97, 98, 99]));
 * ```
 */
const ripemd160 = /* @__PURE__ */ createHasher(() => new _RIPEMD160());

/**
 * SHA2 hash function. A.k.a. sha256, sha384, sha512, sha512_224, sha512_256.
 * SHA256 is the fastest hash implementable in JS, even faster than Blake3.
 * Check out {@link https://www.rfc-editor.org/rfc/rfc4634 | RFC 4634} and
 * {@link https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf | FIPS 180-4}.
 * @module
 */
/**
 * SHA-224 / SHA-256 round constants from RFC 6234 §5.1: the first 32 bits
 * of the cube roots of the first 64 primes (2..311).
 */
// prettier-ignore
const SHA256_K = /* @__PURE__ */ Uint32Array.from([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
/** Reusable SHA-224 / SHA-256 message schedule buffer `W_t` from RFC 6234 §6.2 step 1. */
const SHA256_W = /* @__PURE__ */ new Uint32Array(64);
/** Internal SHA-224 / SHA-256 compression engine from RFC 6234 §6.2. */
class SHA2_32B extends HashMD {
    // We cannot use array here since array allows indexing by variable
    // which means optimizer/compiler cannot use registers.
    // Numeric initializers matter: starting the fields as `undefined` changes
    // V8's field representation and makes sha256 3x slower (measured).
    A = 0;
    B = 0;
    C = 0;
    D = 0;
    E = 0;
    F = 0;
    G = 0;
    H = 0;
    constructor(outputLen, IV) {
        super(64, outputLen, 8, false);
        this.A = IV[0] | 0;
        this.B = IV[1] | 0;
        this.C = IV[2] | 0;
        this.D = IV[3] | 0;
        this.E = IV[4] | 0;
        this.F = IV[5] | 0;
        this.G = IV[6] | 0;
        this.H = IV[7] | 0;
    }
    get() {
        const { A, B, C, D, E, F, G, H } = this;
        return [A, B, C, D, E, F, G, H];
    }
    // prettier-ignore
    set(A, B, C, D, E, F, G, H) {
        this.A = A | 0;
        this.B = B | 0;
        this.C = C | 0;
        this.D = D | 0;
        this.E = E | 0;
        this.F = F | 0;
        this.G = G | 0;
        this.H = H | 0;
    }
    _cloneInto(to) {
        (to ||= new this.constructor()).set(...this.get());
        return this._cloneIntoMeta(to);
    }
    process(view, offset) {
        // Extend the first 16 words into the remaining 48 words w[16..63] of the message schedule array
        for (let i = 0; i < 16; i++, offset += 4)
            SHA256_W[i] = view.getUint32(offset, false);
        for (let i = 16; i < 64; i++) {
            const W15 = SHA256_W[i - 15];
            const W2 = SHA256_W[i - 2];
            const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ (W15 >>> 3);
            const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ (W2 >>> 10);
            SHA256_W[i] = (s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16]) | 0;
        }
        // Compression function main loop, 64 rounds
        let { A, B, C, D, E, F, G, H } = this;
        for (let i = 0; i < 64; i++) {
            const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
            const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
            const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
            const T2 = (sigma0 + Maj(A, B, C)) | 0;
            H = G;
            G = F;
            F = E;
            E = (D + T1) | 0;
            D = C;
            C = B;
            B = A;
            A = (T1 + T2) | 0;
        }
        // Add the compressed chunk to the current hash value
        A = (A + this.A) | 0;
        B = (B + this.B) | 0;
        C = (C + this.C) | 0;
        D = (D + this.D) | 0;
        E = (E + this.E) | 0;
        F = (F + this.F) | 0;
        G = (G + this.G) | 0;
        H = (H + this.H) | 0;
        this.set(A, B, C, D, E, F, G, H);
    }
    roundClean() {
        clean(SHA256_W);
    }
    destroy() {
        // HashMD callers route post-destroy usability through `destroyed`; zeroizing alone still leaves
        // update()/digest() callable on reused instances.
        this.destroyed = true;
        this.set(0, 0, 0, 0, 0, 0, 0, 0);
        clean(this.buffer);
    }
}
/** Internal SHA-256 hash class grounded in RFC 6234 §6.2. */
class _SHA256 extends SHA2_32B {
    constructor() {
        super(32, SHA256_IV);
    }
}
// SHA2-512 is slower than sha256 in js because u64 operations are slow.
// SHA-384 / SHA-512 round constants from RFC 6234 §5.2:
// 80 full 64-bit words split into high/low halves.
// prettier-ignore
const K512 = /* @__PURE__ */ (() => split([
    '0x428a2f98d728ae22', '0x7137449123ef65cd', '0xb5c0fbcfec4d3b2f', '0xe9b5dba58189dbbc',
    '0x3956c25bf348b538', '0x59f111f1b605d019', '0x923f82a4af194f9b', '0xab1c5ed5da6d8118',
    '0xd807aa98a3030242', '0x12835b0145706fbe', '0x243185be4ee4b28c', '0x550c7dc3d5ffb4e2',
    '0x72be5d74f27b896f', '0x80deb1fe3b1696b1', '0x9bdc06a725c71235', '0xc19bf174cf692694',
    '0xe49b69c19ef14ad2', '0xefbe4786384f25e3', '0x0fc19dc68b8cd5b5', '0x240ca1cc77ac9c65',
    '0x2de92c6f592b0275', '0x4a7484aa6ea6e483', '0x5cb0a9dcbd41fbd4', '0x76f988da831153b5',
    '0x983e5152ee66dfab', '0xa831c66d2db43210', '0xb00327c898fb213f', '0xbf597fc7beef0ee4',
    '0xc6e00bf33da88fc2', '0xd5a79147930aa725', '0x06ca6351e003826f', '0x142929670a0e6e70',
    '0x27b70a8546d22ffc', '0x2e1b21385c26c926', '0x4d2c6dfc5ac42aed', '0x53380d139d95b3df',
    '0x650a73548baf63de', '0x766a0abb3c77b2a8', '0x81c2c92e47edaee6', '0x92722c851482353b',
    '0xa2bfe8a14cf10364', '0xa81a664bbc423001', '0xc24b8b70d0f89791', '0xc76c51a30654be30',
    '0xd192e819d6ef5218', '0xd69906245565a910', '0xf40e35855771202a', '0x106aa07032bbd1b8',
    '0x19a4c116b8d2d0c8', '0x1e376c085141ab53', '0x2748774cdf8eeb99', '0x34b0bcb5e19b48a8',
    '0x391c0cb3c5c95a63', '0x4ed8aa4ae3418acb', '0x5b9cca4f7763e373', '0x682e6ff3d6b2b8a3',
    '0x748f82ee5defb2fc', '0x78a5636f43172f60', '0x84c87814a1f0ab72', '0x8cc702081a6439ec',
    '0x90befffa23631e28', '0xa4506cebde82bde9', '0xbef9a3f7b2c67915', '0xc67178f2e372532b',
    '0xca273eceea26619c', '0xd186b8c721c0c207', '0xeada7dd6cde0eb1e', '0xf57d4f7fee6ed178',
    '0x06f067aa72176fba', '0x0a637dc5a2c898a6', '0x113f9804bef90dae', '0x1b710b35131c471b',
    '0x28db77f523047d84', '0x32caab7b40c72493', '0x3c9ebe0a15c9bebc', '0x431d67c49c100d4c',
    '0x4cc5d4becb3e42b6', '0x597f299cfc657e2a', '0x5fcb6fab3ad6faec', '0x6c44198c4a475817'
].map(n => BigInt(n))))();
const SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
const SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
// Reusable high-half schedule buffer for the RFC 6234 §6.4 64-bit `W_t` words.
const SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
// Reusable low-half schedule buffer for the RFC 6234 §6.4 64-bit `W_t` words.
const SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
/** Internal SHA-384 / SHA-512 compression engine from RFC 6234 §6.4. */
class SHA2_64B extends HashMD {
    // We cannot use array here since array allows indexing by variable
    // which means optimizer/compiler cannot use registers.
    // h -- high 32 bits, l -- low 32 bits
    // Numeric initializers matter: starting the fields as `undefined` changes
    // V8's field representation and slows hashing down (measured on sha256).
    Ah = 0;
    Al = 0;
    Bh = 0;
    Bl = 0;
    Ch = 0;
    Cl = 0;
    Dh = 0;
    Dl = 0;
    Eh = 0;
    El = 0;
    Fh = 0;
    Fl = 0;
    Gh = 0;
    Gl = 0;
    Hh = 0;
    Hl = 0;
    constructor(outputLen, IV) {
        super(128, outputLen, 16, false);
        this.Ah = IV[0] | 0;
        this.Al = IV[1] | 0;
        this.Bh = IV[2] | 0;
        this.Bl = IV[3] | 0;
        this.Ch = IV[4] | 0;
        this.Cl = IV[5] | 0;
        this.Dh = IV[6] | 0;
        this.Dl = IV[7] | 0;
        this.Eh = IV[8] | 0;
        this.El = IV[9] | 0;
        this.Fh = IV[10] | 0;
        this.Fl = IV[11] | 0;
        this.Gh = IV[12] | 0;
        this.Gl = IV[13] | 0;
        this.Hh = IV[14] | 0;
        this.Hl = IV[15] | 0;
    }
    // prettier-ignore
    get() {
        const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
    }
    // prettier-ignore
    set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
        this.Ah = Ah | 0;
        this.Al = Al | 0;
        this.Bh = Bh | 0;
        this.Bl = Bl | 0;
        this.Ch = Ch | 0;
        this.Cl = Cl | 0;
        this.Dh = Dh | 0;
        this.Dl = Dl | 0;
        this.Eh = Eh | 0;
        this.El = El | 0;
        this.Fh = Fh | 0;
        this.Fl = Fl | 0;
        this.Gh = Gh | 0;
        this.Gl = Gl | 0;
        this.Hh = Hh | 0;
        this.Hl = Hl | 0;
    }
    _cloneInto(to) {
        (to ||= new this.constructor()).set(...this.get());
        return this._cloneIntoMeta(to);
    }
    process(view, offset) {
        // Extend the first 16 words into the remaining 64 words w[16..79] of the message schedule array
        for (let i = 0; i < 16; i++, offset += 4) {
            SHA512_W_H[i] = view.getUint32(offset);
            SHA512_W_L[i] = view.getUint32((offset += 4));
        }
        for (let i = 16; i < 80; i++) {
            // s0 := (w[i-15] rightrotate 1) xor (w[i-15] rightrotate 8) xor (w[i-15] rightshift 7)
            const W15h = SHA512_W_H[i - 15] | 0;
            const W15l = SHA512_W_L[i - 15] | 0;
            const s0h = rotrSH(W15h, W15l, 1) ^ rotrSH(W15h, W15l, 8) ^ shrSH(W15h, W15l, 7);
            const s0l = rotrSL(W15h, W15l, 1) ^ rotrSL(W15h, W15l, 8) ^ shrSL(W15h, W15l, 7);
            // s1 := (w[i-2] rightrotate 19) xor (w[i-2] rightrotate 61) xor (w[i-2] rightshift 6)
            const W2h = SHA512_W_H[i - 2] | 0;
            const W2l = SHA512_W_L[i - 2] | 0;
            const s1h = rotrSH(W2h, W2l, 19) ^ rotrBH(W2h, W2l, 61) ^ shrSH(W2h, W2l, 6);
            const s1l = rotrSL(W2h, W2l, 19) ^ rotrBL(W2h, W2l, 61) ^ shrSL(W2h, W2l, 6);
            // SHA512_W[i] = s0 + s1 + SHA512_W[i - 7] + SHA512_W[i - 16];
            const SUMl = add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
            const SUMh = add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
            SHA512_W_H[i] = SUMh | 0;
            SHA512_W_L[i] = SUMl | 0;
        }
        let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        // Compression function main loop, 80 rounds
        for (let i = 0; i < 80; i++) {
            // S1 := (e rightrotate 14) xor (e rightrotate 18) xor (e rightrotate 41)
            const sigma1h = rotrSH(Eh, El, 14) ^ rotrSH(Eh, El, 18) ^ rotrBH(Eh, El, 41);
            const sigma1l = rotrSL(Eh, El, 14) ^ rotrSL(Eh, El, 18) ^ rotrBL(Eh, El, 41);
            //const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
            const CHIh = (Eh & Fh) ^ (~Eh & Gh);
            const CHIl = (El & Fl) ^ (~El & Gl);
            // T1 = H + sigma1 + Chi(E, F, G) + SHA512_K[i] + SHA512_W[i]
            // prettier-ignore
            const T1ll = add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
            const T1h = add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
            const T1l = T1ll | 0;
            // S0 := (a rightrotate 28) xor (a rightrotate 34) xor (a rightrotate 39)
            const sigma0h = rotrSH(Ah, Al, 28) ^ rotrBH(Ah, Al, 34) ^ rotrBH(Ah, Al, 39);
            const sigma0l = rotrSL(Ah, Al, 28) ^ rotrBL(Ah, Al, 34) ^ rotrBL(Ah, Al, 39);
            const MAJh = (Ah & Bh) ^ (Ah & Ch) ^ (Bh & Ch);
            const MAJl = (Al & Bl) ^ (Al & Cl) ^ (Bl & Cl);
            Hh = Gh | 0;
            Hl = Gl | 0;
            Gh = Fh | 0;
            Gl = Fl | 0;
            Fh = Eh | 0;
            Fl = El | 0;
            ({ h: Eh, l: El } = add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
            Dh = Ch | 0;
            Dl = Cl | 0;
            Ch = Bh | 0;
            Cl = Bl | 0;
            Bh = Ah | 0;
            Bl = Al | 0;
            const All = add3L(T1l, sigma0l, MAJl);
            Ah = add3H(All, T1h, sigma0h, MAJh);
            Al = All | 0;
        }
        // Add the compressed chunk to the current hash value
        ({ h: Ah, l: Al } = add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
        ({ h: Bh, l: Bl } = add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
        ({ h: Ch, l: Cl } = add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
        ({ h: Dh, l: Dl } = add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
        ({ h: Eh, l: El } = add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
        ({ h: Fh, l: Fl } = add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
        ({ h: Gh, l: Gl } = add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
        ({ h: Hh, l: Hl } = add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
        this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
    }
    roundClean() {
        clean(SHA512_W_H, SHA512_W_L);
    }
    destroy() {
        // HashMD callers route post-destroy usability through `destroyed`; zeroizing alone still leaves
        // update()/digest() callable on reused instances.
        this.destroyed = true;
        clean(this.buffer);
        this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }
}
/** Internal SHA-512 hash class grounded in RFC 6234 §6.3 and §6.4. */
class _SHA512 extends SHA2_64B {
    constructor() {
        super(64, SHA512_IV);
    }
}
/**
 * SHA2-256 hash function from RFC 4634. In JS it's the fastest: even faster than Blake3. Some info:
 *
 * - Trying 2^128 hashes would get 50% chance of collision, using birthday attack.
 * - BTC network is doing 2^70 hashes/sec (2^95 hashes/year) as per 2025.
 * - Each sha256 hash is executing 2^18 bit operations.
 * - Good 2024 ASICs can do 200Th/sec with 3500 watts of power, corresponding to 2^36 hashes/joule.
 * @param msg - message bytes to hash
 * @param opts - Reserved hash options.
 * @returns Digest bytes.
 * @example
 * Hash a message with SHA2-256.
 * ```ts
 * sha256(new Uint8Array([97, 98, 99]));
 * ```
 */
const sha256$1 = /* @__PURE__ */ createHasher(() => new _SHA256(), 
/* @__PURE__ */ oidNist(0x01));
/**
 * SHA2-512 hash function from RFC 4634.
 * @param msg - message bytes to hash
 * @param opts - Reserved hash options.
 * @returns Digest bytes.
 * @example
 * Hash a message with SHA2-512.
 * ```ts
 * sha512(new Uint8Array([97, 98, 99]));
 * ```
 */
const sha512$1 = /* @__PURE__ */ createHasher(() => new _SHA512(), 
/* @__PURE__ */ oidNist(0x03));

var buffer = {};

var base64Js = {};

var hasRequiredBase64Js;

function requireBase64Js () {
	if (hasRequiredBase64Js) return base64Js;
	hasRequiredBase64Js = 1;

	base64Js.byteLength = byteLength;
	base64Js.toByteArray = toByteArray;
	base64Js.fromByteArray = fromByteArray;

	var lookup = [];
	var revLookup = [];
	var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;

	var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	for (var i = 0, len = code.length; i < len; ++i) {
	  lookup[i] = code[i];
	  revLookup[code.charCodeAt(i)] = i;
	}

	// Support decoding URL-safe base64 strings, as Node.js does.
	// See: https://en.wikipedia.org/wiki/Base64#URL_applications
	revLookup['-'.charCodeAt(0)] = 62;
	revLookup['_'.charCodeAt(0)] = 63;

	function getLens (b64) {
	  var len = b64.length;

	  if (len % 4 > 0) {
	    throw new Error('Invalid string. Length must be a multiple of 4')
	  }

	  // Trim off extra bytes after placeholder bytes are found
	  // See: https://github.com/beatgammit/base64-js/issues/42
	  var validLen = b64.indexOf('=');
	  if (validLen === -1) validLen = len;

	  var placeHoldersLen = validLen === len
	    ? 0
	    : 4 - (validLen % 4);

	  return [validLen, placeHoldersLen]
	}

	// base64 is 4/3 + up to two characters of the original data
	function byteLength (b64) {
	  var lens = getLens(b64);
	  var validLen = lens[0];
	  var placeHoldersLen = lens[1];
	  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
	}

	function _byteLength (b64, validLen, placeHoldersLen) {
	  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
	}

	function toByteArray (b64) {
	  var tmp;
	  var lens = getLens(b64);
	  var validLen = lens[0];
	  var placeHoldersLen = lens[1];

	  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));

	  var curByte = 0;

	  // if there are placeholders, only get up to the last complete 4 chars
	  var len = placeHoldersLen > 0
	    ? validLen - 4
	    : validLen;

	  var i;
	  for (i = 0; i < len; i += 4) {
	    tmp =
	      (revLookup[b64.charCodeAt(i)] << 18) |
	      (revLookup[b64.charCodeAt(i + 1)] << 12) |
	      (revLookup[b64.charCodeAt(i + 2)] << 6) |
	      revLookup[b64.charCodeAt(i + 3)];
	    arr[curByte++] = (tmp >> 16) & 0xFF;
	    arr[curByte++] = (tmp >> 8) & 0xFF;
	    arr[curByte++] = tmp & 0xFF;
	  }

	  if (placeHoldersLen === 2) {
	    tmp =
	      (revLookup[b64.charCodeAt(i)] << 2) |
	      (revLookup[b64.charCodeAt(i + 1)] >> 4);
	    arr[curByte++] = tmp & 0xFF;
	  }

	  if (placeHoldersLen === 1) {
	    tmp =
	      (revLookup[b64.charCodeAt(i)] << 10) |
	      (revLookup[b64.charCodeAt(i + 1)] << 4) |
	      (revLookup[b64.charCodeAt(i + 2)] >> 2);
	    arr[curByte++] = (tmp >> 8) & 0xFF;
	    arr[curByte++] = tmp & 0xFF;
	  }

	  return arr
	}

	function tripletToBase64 (num) {
	  return lookup[num >> 18 & 0x3F] +
	    lookup[num >> 12 & 0x3F] +
	    lookup[num >> 6 & 0x3F] +
	    lookup[num & 0x3F]
	}

	function encodeChunk (uint8, start, end) {
	  var tmp;
	  var output = [];
	  for (var i = start; i < end; i += 3) {
	    tmp =
	      ((uint8[i] << 16) & 0xFF0000) +
	      ((uint8[i + 1] << 8) & 0xFF00) +
	      (uint8[i + 2] & 0xFF);
	    output.push(tripletToBase64(tmp));
	  }
	  return output.join('')
	}

	function fromByteArray (uint8) {
	  var tmp;
	  var len = uint8.length;
	  var extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
	  var parts = [];
	  var maxChunkLength = 16383; // must be multiple of 3

	  // go through the array every three bytes, we'll deal with trailing stuff later
	  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
	    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
	  }

	  // pad the end with zeros, but make sure to not forget the extra bytes
	  if (extraBytes === 1) {
	    tmp = uint8[len - 1];
	    parts.push(
	      lookup[tmp >> 2] +
	      lookup[(tmp << 4) & 0x3F] +
	      '=='
	    );
	  } else if (extraBytes === 2) {
	    tmp = (uint8[len - 2] << 8) + uint8[len - 1];
	    parts.push(
	      lookup[tmp >> 10] +
	      lookup[(tmp >> 4) & 0x3F] +
	      lookup[(tmp << 2) & 0x3F] +
	      '='
	    );
	  }

	  return parts.join('')
	}
	return base64Js;
}

var ieee754 = {};

/*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */

var hasRequiredIeee754;

function requireIeee754 () {
	if (hasRequiredIeee754) return ieee754;
	hasRequiredIeee754 = 1;
	ieee754.read = function (buffer, offset, isLE, mLen, nBytes) {
	  var e, m;
	  var eLen = (nBytes * 8) - mLen - 1;
	  var eMax = (1 << eLen) - 1;
	  var eBias = eMax >> 1;
	  var nBits = -7;
	  var i = isLE ? (nBytes - 1) : 0;
	  var d = isLE ? -1 : 1;
	  var s = buffer[offset + i];

	  i += d;

	  e = s & ((1 << (-nBits)) - 1);
	  s >>= (-nBits);
	  nBits += eLen;
	  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

	  m = e & ((1 << (-nBits)) - 1);
	  e >>= (-nBits);
	  nBits += mLen;
	  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

	  if (e === 0) {
	    e = 1 - eBias;
	  } else if (e === eMax) {
	    return m ? NaN : ((s ? -1 : 1) * Infinity)
	  } else {
	    m = m + Math.pow(2, mLen);
	    e = e - eBias;
	  }
	  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
	};

	ieee754.write = function (buffer, value, offset, isLE, mLen, nBytes) {
	  var e, m, c;
	  var eLen = (nBytes * 8) - mLen - 1;
	  var eMax = (1 << eLen) - 1;
	  var eBias = eMax >> 1;
	  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
	  var i = isLE ? 0 : (nBytes - 1);
	  var d = isLE ? 1 : -1;
	  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

	  value = Math.abs(value);

	  if (isNaN(value) || value === Infinity) {
	    m = isNaN(value) ? 1 : 0;
	    e = eMax;
	  } else {
	    e = Math.floor(Math.log(value) / Math.LN2);
	    if (value * (c = Math.pow(2, -e)) < 1) {
	      e--;
	      c *= 2;
	    }
	    if (e + eBias >= 1) {
	      value += rt / c;
	    } else {
	      value += rt * Math.pow(2, 1 - eBias);
	    }
	    if (value * c >= 2) {
	      e++;
	      c /= 2;
	    }

	    if (e + eBias >= eMax) {
	      m = 0;
	      e = eMax;
	    } else if (e + eBias >= 1) {
	      m = ((value * c) - 1) * Math.pow(2, mLen);
	      e = e + eBias;
	    } else {
	      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
	      e = 0;
	    }
	  }

	  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

	  e = (e << mLen) | m;
	  eLen += mLen;
	  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

	  buffer[offset + i - d] |= s * 128;
	};
	return ieee754;
}

/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */

var hasRequiredBuffer;

function requireBuffer () {
	if (hasRequiredBuffer) return buffer;
	hasRequiredBuffer = 1;
	(function (exports) {

		const base64 = requireBase64Js();
		const ieee754 = requireIeee754();
		const customInspectSymbol =
		  (typeof Symbol === 'function' && typeof Symbol['for'] === 'function') // eslint-disable-line dot-notation
		    ? Symbol['for']('nodejs.util.inspect.custom') // eslint-disable-line dot-notation
		    : null;

		exports.Buffer = Buffer;
		exports.SlowBuffer = SlowBuffer;
		exports.INSPECT_MAX_BYTES = 50;

		const K_MAX_LENGTH = 0x7fffffff;
		exports.kMaxLength = K_MAX_LENGTH;

		/**
		 * If `Buffer.TYPED_ARRAY_SUPPORT`:
		 *   === true    Use Uint8Array implementation (fastest)
		 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
		 *               implementation (most compatible, even IE6)
		 *
		 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
		 * Opera 11.6+, iOS 4.2+.
		 *
		 * We report that the browser does not support typed arrays if the are not subclassable
		 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
		 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
		 * for __proto__ and has a buggy typed array implementation.
		 */
		Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport();

		if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
		    typeof console.error === 'function') {
		  console.error(
		    'This browser lacks typed array (Uint8Array) support which is required by ' +
		    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
		  );
		}

		function typedArraySupport () {
		  // Can typed array instances can be augmented?
		  try {
		    const arr = new Uint8Array(1);
		    const proto = { foo: function () { return 42 } };
		    Object.setPrototypeOf(proto, Uint8Array.prototype);
		    Object.setPrototypeOf(arr, proto);
		    return arr.foo() === 42
		  } catch (e) {
		    return false
		  }
		}

		Object.defineProperty(Buffer.prototype, 'parent', {
		  enumerable: true,
		  get: function () {
		    if (!Buffer.isBuffer(this)) return undefined
		    return this.buffer
		  }
		});

		Object.defineProperty(Buffer.prototype, 'offset', {
		  enumerable: true,
		  get: function () {
		    if (!Buffer.isBuffer(this)) return undefined
		    return this.byteOffset
		  }
		});

		function createBuffer (length) {
		  if (length > K_MAX_LENGTH) {
		    throw new RangeError('The value "' + length + '" is invalid for option "size"')
		  }
		  // Return an augmented `Uint8Array` instance
		  const buf = new Uint8Array(length);
		  Object.setPrototypeOf(buf, Buffer.prototype);
		  return buf
		}

		/**
		 * The Buffer constructor returns instances of `Uint8Array` that have their
		 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
		 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
		 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
		 * returns a single octet.
		 *
		 * The `Uint8Array` prototype remains unmodified.
		 */

		function Buffer (arg, encodingOrOffset, length) {
		  // Common case.
		  if (typeof arg === 'number') {
		    if (typeof encodingOrOffset === 'string') {
		      throw new TypeError(
		        'The "string" argument must be of type string. Received type number'
		      )
		    }
		    return allocUnsafe(arg)
		  }
		  return from(arg, encodingOrOffset, length)
		}

		Buffer.poolSize = 8192; // not used by this implementation

		function from (value, encodingOrOffset, length) {
		  if (typeof value === 'string') {
		    return fromString(value, encodingOrOffset)
		  }

		  if (ArrayBuffer.isView(value)) {
		    return fromArrayView(value)
		  }

		  if (value == null) {
		    throw new TypeError(
		      'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
		      'or Array-like Object. Received type ' + (typeof value)
		    )
		  }

		  if (isInstance(value, ArrayBuffer) ||
		      (value && isInstance(value.buffer, ArrayBuffer))) {
		    return fromArrayBuffer(value, encodingOrOffset, length)
		  }

		  if (typeof SharedArrayBuffer !== 'undefined' &&
		      (isInstance(value, SharedArrayBuffer) ||
		      (value && isInstance(value.buffer, SharedArrayBuffer)))) {
		    return fromArrayBuffer(value, encodingOrOffset, length)
		  }

		  if (typeof value === 'number') {
		    throw new TypeError(
		      'The "value" argument must not be of type number. Received type number'
		    )
		  }

		  const valueOf = value.valueOf && value.valueOf();
		  if (valueOf != null && valueOf !== value) {
		    return Buffer.from(valueOf, encodingOrOffset, length)
		  }

		  const b = fromObject(value);
		  if (b) return b

		  if (typeof Symbol !== 'undefined' && Symbol.toPrimitive != null &&
		      typeof value[Symbol.toPrimitive] === 'function') {
		    return Buffer.from(value[Symbol.toPrimitive]('string'), encodingOrOffset, length)
		  }

		  throw new TypeError(
		    'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
		    'or Array-like Object. Received type ' + (typeof value)
		  )
		}

		/**
		 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
		 * if value is a number.
		 * Buffer.from(str[, encoding])
		 * Buffer.from(array)
		 * Buffer.from(buffer)
		 * Buffer.from(arrayBuffer[, byteOffset[, length]])
		 **/
		Buffer.from = function (value, encodingOrOffset, length) {
		  return from(value, encodingOrOffset, length)
		};

		// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
		// https://github.com/feross/buffer/pull/148
		Object.setPrototypeOf(Buffer.prototype, Uint8Array.prototype);
		Object.setPrototypeOf(Buffer, Uint8Array);

		function assertSize (size) {
		  if (typeof size !== 'number') {
		    throw new TypeError('"size" argument must be of type number')
		  } else if (size < 0) {
		    throw new RangeError('The value "' + size + '" is invalid for option "size"')
		  }
		}

		function alloc (size, fill, encoding) {
		  assertSize(size);
		  if (size <= 0) {
		    return createBuffer(size)
		  }
		  if (fill !== undefined) {
		    // Only pay attention to encoding if it's a string. This
		    // prevents accidentally sending in a number that would
		    // be interpreted as a start offset.
		    return typeof encoding === 'string'
		      ? createBuffer(size).fill(fill, encoding)
		      : createBuffer(size).fill(fill)
		  }
		  return createBuffer(size)
		}

		/**
		 * Creates a new filled Buffer instance.
		 * alloc(size[, fill[, encoding]])
		 **/
		Buffer.alloc = function (size, fill, encoding) {
		  return alloc(size, fill, encoding)
		};

		function allocUnsafe (size) {
		  assertSize(size);
		  return createBuffer(size < 0 ? 0 : checked(size) | 0)
		}

		/**
		 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
		 * */
		Buffer.allocUnsafe = function (size) {
		  return allocUnsafe(size)
		};
		/**
		 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
		 */
		Buffer.allocUnsafeSlow = function (size) {
		  return allocUnsafe(size)
		};

		function fromString (string, encoding) {
		  if (typeof encoding !== 'string' || encoding === '') {
		    encoding = 'utf8';
		  }

		  if (!Buffer.isEncoding(encoding)) {
		    throw new TypeError('Unknown encoding: ' + encoding)
		  }

		  const length = byteLength(string, encoding) | 0;
		  let buf = createBuffer(length);

		  const actual = buf.write(string, encoding);

		  if (actual !== length) {
		    // Writing a hex string, for example, that contains invalid characters will
		    // cause everything after the first invalid character to be ignored. (e.g.
		    // 'abxxcd' will be treated as 'ab')
		    buf = buf.slice(0, actual);
		  }

		  return buf
		}

		function fromArrayLike (array) {
		  const length = array.length < 0 ? 0 : checked(array.length) | 0;
		  const buf = createBuffer(length);
		  for (let i = 0; i < length; i += 1) {
		    buf[i] = array[i] & 255;
		  }
		  return buf
		}

		function fromArrayView (arrayView) {
		  if (isInstance(arrayView, Uint8Array)) {
		    const copy = new Uint8Array(arrayView);
		    return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength)
		  }
		  return fromArrayLike(arrayView)
		}

		function fromArrayBuffer (array, byteOffset, length) {
		  if (byteOffset < 0 || array.byteLength < byteOffset) {
		    throw new RangeError('"offset" is outside of buffer bounds')
		  }

		  if (array.byteLength < byteOffset + (length || 0)) {
		    throw new RangeError('"length" is outside of buffer bounds')
		  }

		  let buf;
		  if (byteOffset === undefined && length === undefined) {
		    buf = new Uint8Array(array);
		  } else if (length === undefined) {
		    buf = new Uint8Array(array, byteOffset);
		  } else {
		    buf = new Uint8Array(array, byteOffset, length);
		  }

		  // Return an augmented `Uint8Array` instance
		  Object.setPrototypeOf(buf, Buffer.prototype);

		  return buf
		}

		function fromObject (obj) {
		  if (Buffer.isBuffer(obj)) {
		    const len = checked(obj.length) | 0;
		    const buf = createBuffer(len);

		    if (buf.length === 0) {
		      return buf
		    }

		    obj.copy(buf, 0, 0, len);
		    return buf
		  }

		  if (obj.length !== undefined) {
		    if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
		      return createBuffer(0)
		    }
		    return fromArrayLike(obj)
		  }

		  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
		    return fromArrayLike(obj.data)
		  }
		}

		function checked (length) {
		  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
		  // length is NaN (which is otherwise coerced to zero.)
		  if (length >= K_MAX_LENGTH) {
		    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
		                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
		  }
		  return length | 0
		}

		function SlowBuffer (length) {
		  if (+length != length) { // eslint-disable-line eqeqeq
		    length = 0;
		  }
		  return Buffer.alloc(+length)
		}

		Buffer.isBuffer = function isBuffer (b) {
		  return b != null && b._isBuffer === true &&
		    b !== Buffer.prototype // so Buffer.isBuffer(Buffer.prototype) will be false
		};

		Buffer.compare = function compare (a, b) {
		  if (isInstance(a, Uint8Array)) a = Buffer.from(a, a.offset, a.byteLength);
		  if (isInstance(b, Uint8Array)) b = Buffer.from(b, b.offset, b.byteLength);
		  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
		    throw new TypeError(
		      'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
		    )
		  }

		  if (a === b) return 0

		  let x = a.length;
		  let y = b.length;

		  for (let i = 0, len = Math.min(x, y); i < len; ++i) {
		    if (a[i] !== b[i]) {
		      x = a[i];
		      y = b[i];
		      break
		    }
		  }

		  if (x < y) return -1
		  if (y < x) return 1
		  return 0
		};

		Buffer.isEncoding = function isEncoding (encoding) {
		  switch (String(encoding).toLowerCase()) {
		    case 'hex':
		    case 'utf8':
		    case 'utf-8':
		    case 'ascii':
		    case 'latin1':
		    case 'binary':
		    case 'base64':
		    case 'ucs2':
		    case 'ucs-2':
		    case 'utf16le':
		    case 'utf-16le':
		      return true
		    default:
		      return false
		  }
		};

		Buffer.concat = function concat (list, length) {
		  if (!Array.isArray(list)) {
		    throw new TypeError('"list" argument must be an Array of Buffers')
		  }

		  if (list.length === 0) {
		    return Buffer.alloc(0)
		  }

		  let i;
		  if (length === undefined) {
		    length = 0;
		    for (i = 0; i < list.length; ++i) {
		      length += list[i].length;
		    }
		  }

		  const buffer = Buffer.allocUnsafe(length);
		  let pos = 0;
		  for (i = 0; i < list.length; ++i) {
		    let buf = list[i];
		    if (isInstance(buf, Uint8Array)) {
		      if (pos + buf.length > buffer.length) {
		        if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
		        buf.copy(buffer, pos);
		      } else {
		        Uint8Array.prototype.set.call(
		          buffer,
		          buf,
		          pos
		        );
		      }
		    } else if (!Buffer.isBuffer(buf)) {
		      throw new TypeError('"list" argument must be an Array of Buffers')
		    } else {
		      buf.copy(buffer, pos);
		    }
		    pos += buf.length;
		  }
		  return buffer
		};

		function byteLength (string, encoding) {
		  if (Buffer.isBuffer(string)) {
		    return string.length
		  }
		  if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
		    return string.byteLength
		  }
		  if (typeof string !== 'string') {
		    throw new TypeError(
		      'The "string" argument must be one of type string, Buffer, or ArrayBuffer. ' +
		      'Received type ' + typeof string
		    )
		  }

		  const len = string.length;
		  const mustMatch = (arguments.length > 2 && arguments[2] === true);
		  if (!mustMatch && len === 0) return 0

		  // Use a for loop to avoid recursion
		  let loweredCase = false;
		  for (;;) {
		    switch (encoding) {
		      case 'ascii':
		      case 'latin1':
		      case 'binary':
		        return len
		      case 'utf8':
		      case 'utf-8':
		        return utf8ToBytes(string).length
		      case 'ucs2':
		      case 'ucs-2':
		      case 'utf16le':
		      case 'utf-16le':
		        return len * 2
		      case 'hex':
		        return len >>> 1
		      case 'base64':
		        return base64ToBytes(string).length
		      default:
		        if (loweredCase) {
		          return mustMatch ? -1 : utf8ToBytes(string).length // assume utf8
		        }
		        encoding = ('' + encoding).toLowerCase();
		        loweredCase = true;
		    }
		  }
		}
		Buffer.byteLength = byteLength;

		function slowToString (encoding, start, end) {
		  let loweredCase = false;

		  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
		  // property of a typed array.

		  // This behaves neither like String nor Uint8Array in that we set start/end
		  // to their upper/lower bounds if the value passed is out of range.
		  // undefined is handled specially as per ECMA-262 6th Edition,
		  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
		  if (start === undefined || start < 0) {
		    start = 0;
		  }
		  // Return early if start > this.length. Done here to prevent potential uint32
		  // coercion fail below.
		  if (start > this.length) {
		    return ''
		  }

		  if (end === undefined || end > this.length) {
		    end = this.length;
		  }

		  if (end <= 0) {
		    return ''
		  }

		  // Force coercion to uint32. This will also coerce falsey/NaN values to 0.
		  end >>>= 0;
		  start >>>= 0;

		  if (end <= start) {
		    return ''
		  }

		  if (!encoding) encoding = 'utf8';

		  while (true) {
		    switch (encoding) {
		      case 'hex':
		        return hexSlice(this, start, end)

		      case 'utf8':
		      case 'utf-8':
		        return utf8Slice(this, start, end)

		      case 'ascii':
		        return asciiSlice(this, start, end)

		      case 'latin1':
		      case 'binary':
		        return latin1Slice(this, start, end)

		      case 'base64':
		        return base64Slice(this, start, end)

		      case 'ucs2':
		      case 'ucs-2':
		      case 'utf16le':
		      case 'utf-16le':
		        return utf16leSlice(this, start, end)

		      default:
		        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
		        encoding = (encoding + '').toLowerCase();
		        loweredCase = true;
		    }
		  }
		}

		// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
		// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
		// reliably in a browserify context because there could be multiple different
		// copies of the 'buffer' package in use. This method works even for Buffer
		// instances that were created from another copy of the `buffer` package.
		// See: https://github.com/feross/buffer/issues/154
		Buffer.prototype._isBuffer = true;

		function swap (b, n, m) {
		  const i = b[n];
		  b[n] = b[m];
		  b[m] = i;
		}

		Buffer.prototype.swap16 = function swap16 () {
		  const len = this.length;
		  if (len % 2 !== 0) {
		    throw new RangeError('Buffer size must be a multiple of 16-bits')
		  }
		  for (let i = 0; i < len; i += 2) {
		    swap(this, i, i + 1);
		  }
		  return this
		};

		Buffer.prototype.swap32 = function swap32 () {
		  const len = this.length;
		  if (len % 4 !== 0) {
		    throw new RangeError('Buffer size must be a multiple of 32-bits')
		  }
		  for (let i = 0; i < len; i += 4) {
		    swap(this, i, i + 3);
		    swap(this, i + 1, i + 2);
		  }
		  return this
		};

		Buffer.prototype.swap64 = function swap64 () {
		  const len = this.length;
		  if (len % 8 !== 0) {
		    throw new RangeError('Buffer size must be a multiple of 64-bits')
		  }
		  for (let i = 0; i < len; i += 8) {
		    swap(this, i, i + 7);
		    swap(this, i + 1, i + 6);
		    swap(this, i + 2, i + 5);
		    swap(this, i + 3, i + 4);
		  }
		  return this
		};

		Buffer.prototype.toString = function toString () {
		  const length = this.length;
		  if (length === 0) return ''
		  if (arguments.length === 0) return utf8Slice(this, 0, length)
		  return slowToString.apply(this, arguments)
		};

		Buffer.prototype.toLocaleString = Buffer.prototype.toString;

		Buffer.prototype.equals = function equals (b) {
		  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
		  if (this === b) return true
		  return Buffer.compare(this, b) === 0
		};

		Buffer.prototype.inspect = function inspect () {
		  let str = '';
		  const max = exports.INSPECT_MAX_BYTES;
		  str = this.toString('hex', 0, max).replace(/(.{2})/g, '$1 ').trim();
		  if (this.length > max) str += ' ... ';
		  return '<Buffer ' + str + '>'
		};
		if (customInspectSymbol) {
		  Buffer.prototype[customInspectSymbol] = Buffer.prototype.inspect;
		}

		Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
		  if (isInstance(target, Uint8Array)) {
		    target = Buffer.from(target, target.offset, target.byteLength);
		  }
		  if (!Buffer.isBuffer(target)) {
		    throw new TypeError(
		      'The "target" argument must be one of type Buffer or Uint8Array. ' +
		      'Received type ' + (typeof target)
		    )
		  }

		  if (start === undefined) {
		    start = 0;
		  }
		  if (end === undefined) {
		    end = target ? target.length : 0;
		  }
		  if (thisStart === undefined) {
		    thisStart = 0;
		  }
		  if (thisEnd === undefined) {
		    thisEnd = this.length;
		  }

		  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
		    throw new RangeError('out of range index')
		  }

		  if (thisStart >= thisEnd && start >= end) {
		    return 0
		  }
		  if (thisStart >= thisEnd) {
		    return -1
		  }
		  if (start >= end) {
		    return 1
		  }

		  start >>>= 0;
		  end >>>= 0;
		  thisStart >>>= 0;
		  thisEnd >>>= 0;

		  if (this === target) return 0

		  let x = thisEnd - thisStart;
		  let y = end - start;
		  const len = Math.min(x, y);

		  const thisCopy = this.slice(thisStart, thisEnd);
		  const targetCopy = target.slice(start, end);

		  for (let i = 0; i < len; ++i) {
		    if (thisCopy[i] !== targetCopy[i]) {
		      x = thisCopy[i];
		      y = targetCopy[i];
		      break
		    }
		  }

		  if (x < y) return -1
		  if (y < x) return 1
		  return 0
		};

		// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
		// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
		//
		// Arguments:
		// - buffer - a Buffer to search
		// - val - a string, Buffer, or number
		// - byteOffset - an index into `buffer`; will be clamped to an int32
		// - encoding - an optional encoding, relevant is val is a string
		// - dir - true for indexOf, false for lastIndexOf
		function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
		  // Empty buffer means no match
		  if (buffer.length === 0) return -1

		  // Normalize byteOffset
		  if (typeof byteOffset === 'string') {
		    encoding = byteOffset;
		    byteOffset = 0;
		  } else if (byteOffset > 0x7fffffff) {
		    byteOffset = 0x7fffffff;
		  } else if (byteOffset < -2147483648) {
		    byteOffset = -2147483648;
		  }
		  byteOffset = +byteOffset; // Coerce to Number.
		  if (numberIsNaN(byteOffset)) {
		    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
		    byteOffset = dir ? 0 : (buffer.length - 1);
		  }

		  // Normalize byteOffset: negative offsets start from the end of the buffer
		  if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
		  if (byteOffset >= buffer.length) {
		    if (dir) return -1
		    else byteOffset = buffer.length - 1;
		  } else if (byteOffset < 0) {
		    if (dir) byteOffset = 0;
		    else return -1
		  }

		  // Normalize val
		  if (typeof val === 'string') {
		    val = Buffer.from(val, encoding);
		  }

		  // Finally, search either indexOf (if dir is true) or lastIndexOf
		  if (Buffer.isBuffer(val)) {
		    // Special case: looking for empty string/buffer always fails
		    if (val.length === 0) {
		      return -1
		    }
		    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
		  } else if (typeof val === 'number') {
		    val = val & 0xFF; // Search for a byte value [0-255]
		    if (typeof Uint8Array.prototype.indexOf === 'function') {
		      if (dir) {
		        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
		      } else {
		        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
		      }
		    }
		    return arrayIndexOf(buffer, [val], byteOffset, encoding, dir)
		  }

		  throw new TypeError('val must be string, number or Buffer')
		}

		function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
		  let indexSize = 1;
		  let arrLength = arr.length;
		  let valLength = val.length;

		  if (encoding !== undefined) {
		    encoding = String(encoding).toLowerCase();
		    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
		        encoding === 'utf16le' || encoding === 'utf-16le') {
		      if (arr.length < 2 || val.length < 2) {
		        return -1
		      }
		      indexSize = 2;
		      arrLength /= 2;
		      valLength /= 2;
		      byteOffset /= 2;
		    }
		  }

		  function read (buf, i) {
		    if (indexSize === 1) {
		      return buf[i]
		    } else {
		      return buf.readUInt16BE(i * indexSize)
		    }
		  }

		  let i;
		  if (dir) {
		    let foundIndex = -1;
		    for (i = byteOffset; i < arrLength; i++) {
		      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
		        if (foundIndex === -1) foundIndex = i;
		        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
		      } else {
		        if (foundIndex !== -1) i -= i - foundIndex;
		        foundIndex = -1;
		      }
		    }
		  } else {
		    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
		    for (i = byteOffset; i >= 0; i--) {
		      let found = true;
		      for (let j = 0; j < valLength; j++) {
		        if (read(arr, i + j) !== read(val, j)) {
		          found = false;
		          break
		        }
		      }
		      if (found) return i
		    }
		  }

		  return -1
		}

		Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
		  return this.indexOf(val, byteOffset, encoding) !== -1
		};

		Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
		  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
		};

		Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
		  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
		};

		function hexWrite (buf, string, offset, length) {
		  offset = Number(offset) || 0;
		  const remaining = buf.length - offset;
		  if (!length) {
		    length = remaining;
		  } else {
		    length = Number(length);
		    if (length > remaining) {
		      length = remaining;
		    }
		  }

		  const strLen = string.length;

		  if (length > strLen / 2) {
		    length = strLen / 2;
		  }
		  let i;
		  for (i = 0; i < length; ++i) {
		    const parsed = parseInt(string.substr(i * 2, 2), 16);
		    if (numberIsNaN(parsed)) return i
		    buf[offset + i] = parsed;
		  }
		  return i
		}

		function utf8Write (buf, string, offset, length) {
		  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
		}

		function asciiWrite (buf, string, offset, length) {
		  return blitBuffer(asciiToBytes(string), buf, offset, length)
		}

		function base64Write (buf, string, offset, length) {
		  return blitBuffer(base64ToBytes(string), buf, offset, length)
		}

		function ucs2Write (buf, string, offset, length) {
		  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
		}

		Buffer.prototype.write = function write (string, offset, length, encoding) {
		  // Buffer#write(string)
		  if (offset === undefined) {
		    encoding = 'utf8';
		    length = this.length;
		    offset = 0;
		  // Buffer#write(string, encoding)
		  } else if (length === undefined && typeof offset === 'string') {
		    encoding = offset;
		    length = this.length;
		    offset = 0;
		  // Buffer#write(string, offset[, length][, encoding])
		  } else if (isFinite(offset)) {
		    offset = offset >>> 0;
		    if (isFinite(length)) {
		      length = length >>> 0;
		      if (encoding === undefined) encoding = 'utf8';
		    } else {
		      encoding = length;
		      length = undefined;
		    }
		  } else {
		    throw new Error(
		      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
		    )
		  }

		  const remaining = this.length - offset;
		  if (length === undefined || length > remaining) length = remaining;

		  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
		    throw new RangeError('Attempt to write outside buffer bounds')
		  }

		  if (!encoding) encoding = 'utf8';

		  let loweredCase = false;
		  for (;;) {
		    switch (encoding) {
		      case 'hex':
		        return hexWrite(this, string, offset, length)

		      case 'utf8':
		      case 'utf-8':
		        return utf8Write(this, string, offset, length)

		      case 'ascii':
		      case 'latin1':
		      case 'binary':
		        return asciiWrite(this, string, offset, length)

		      case 'base64':
		        // Warning: maxLength not taken into account in base64Write
		        return base64Write(this, string, offset, length)

		      case 'ucs2':
		      case 'ucs-2':
		      case 'utf16le':
		      case 'utf-16le':
		        return ucs2Write(this, string, offset, length)

		      default:
		        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
		        encoding = ('' + encoding).toLowerCase();
		        loweredCase = true;
		    }
		  }
		};

		Buffer.prototype.toJSON = function toJSON () {
		  return {
		    type: 'Buffer',
		    data: Array.prototype.slice.call(this._arr || this, 0)
		  }
		};

		function base64Slice (buf, start, end) {
		  if (start === 0 && end === buf.length) {
		    return base64.fromByteArray(buf)
		  } else {
		    return base64.fromByteArray(buf.slice(start, end))
		  }
		}

		function utf8Slice (buf, start, end) {
		  end = Math.min(buf.length, end);
		  const res = [];

		  let i = start;
		  while (i < end) {
		    const firstByte = buf[i];
		    let codePoint = null;
		    let bytesPerSequence = (firstByte > 0xEF)
		      ? 4
		      : (firstByte > 0xDF)
		          ? 3
		          : (firstByte > 0xBF)
		              ? 2
		              : 1;

		    if (i + bytesPerSequence <= end) {
		      let secondByte, thirdByte, fourthByte, tempCodePoint;

		      switch (bytesPerSequence) {
		        case 1:
		          if (firstByte < 0x80) {
		            codePoint = firstByte;
		          }
		          break
		        case 2:
		          secondByte = buf[i + 1];
		          if ((secondByte & 0xC0) === 0x80) {
		            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F);
		            if (tempCodePoint > 0x7F) {
		              codePoint = tempCodePoint;
		            }
		          }
		          break
		        case 3:
		          secondByte = buf[i + 1];
		          thirdByte = buf[i + 2];
		          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
		            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F);
		            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
		              codePoint = tempCodePoint;
		            }
		          }
		          break
		        case 4:
		          secondByte = buf[i + 1];
		          thirdByte = buf[i + 2];
		          fourthByte = buf[i + 3];
		          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
		            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F);
		            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
		              codePoint = tempCodePoint;
		            }
		          }
		      }
		    }

		    if (codePoint === null) {
		      // we did not generate a valid codePoint so insert a
		      // replacement char (U+FFFD) and advance only 1 byte
		      codePoint = 0xFFFD;
		      bytesPerSequence = 1;
		    } else if (codePoint > 0xFFFF) {
		      // encode to utf16 (surrogate pair dance)
		      codePoint -= 0x10000;
		      res.push(codePoint >>> 10 & 0x3FF | 0xD800);
		      codePoint = 0xDC00 | codePoint & 0x3FF;
		    }

		    res.push(codePoint);
		    i += bytesPerSequence;
		  }

		  return decodeCodePointsArray(res)
		}

		// Based on http://stackoverflow.com/a/22747272/680742, the browser with
		// the lowest limit is Chrome, with 0x10000 args.
		// We go 1 magnitude less, for safety
		const MAX_ARGUMENTS_LENGTH = 0x1000;

		function decodeCodePointsArray (codePoints) {
		  const len = codePoints.length;
		  if (len <= MAX_ARGUMENTS_LENGTH) {
		    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
		  }

		  // Decode in chunks to avoid "call stack size exceeded".
		  let res = '';
		  let i = 0;
		  while (i < len) {
		    res += String.fromCharCode.apply(
		      String,
		      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
		    );
		  }
		  return res
		}

		function asciiSlice (buf, start, end) {
		  let ret = '';
		  end = Math.min(buf.length, end);

		  for (let i = start; i < end; ++i) {
		    ret += String.fromCharCode(buf[i] & 0x7F);
		  }
		  return ret
		}

		function latin1Slice (buf, start, end) {
		  let ret = '';
		  end = Math.min(buf.length, end);

		  for (let i = start; i < end; ++i) {
		    ret += String.fromCharCode(buf[i]);
		  }
		  return ret
		}

		function hexSlice (buf, start, end) {
		  const len = buf.length;

		  if (!start || start < 0) start = 0;
		  if (!end || end < 0 || end > len) end = len;

		  let out = '';
		  for (let i = start; i < end; ++i) {
		    out += hexSliceLookupTable[buf[i]];
		  }
		  return out
		}

		function utf16leSlice (buf, start, end) {
		  const bytes = buf.slice(start, end);
		  let res = '';
		  // If bytes.length is odd, the last 8 bits must be ignored (same as node.js)
		  for (let i = 0; i < bytes.length - 1; i += 2) {
		    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256));
		  }
		  return res
		}

		Buffer.prototype.slice = function slice (start, end) {
		  const len = this.length;
		  start = ~~start;
		  end = end === undefined ? len : ~~end;

		  if (start < 0) {
		    start += len;
		    if (start < 0) start = 0;
		  } else if (start > len) {
		    start = len;
		  }

		  if (end < 0) {
		    end += len;
		    if (end < 0) end = 0;
		  } else if (end > len) {
		    end = len;
		  }

		  if (end < start) end = start;

		  const newBuf = this.subarray(start, end);
		  // Return an augmented `Uint8Array` instance
		  Object.setPrototypeOf(newBuf, Buffer.prototype);

		  return newBuf
		};

		/*
		 * Need to make sure that buffer isn't trying to write out of bounds.
		 */
		function checkOffset (offset, ext, length) {
		  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
		  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
		}

		Buffer.prototype.readUintLE =
		Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
		  offset = offset >>> 0;
		  byteLength = byteLength >>> 0;
		  if (!noAssert) checkOffset(offset, byteLength, this.length);

		  let val = this[offset];
		  let mul = 1;
		  let i = 0;
		  while (++i < byteLength && (mul *= 0x100)) {
		    val += this[offset + i] * mul;
		  }

		  return val
		};

		Buffer.prototype.readUintBE =
		Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
		  offset = offset >>> 0;
		  byteLength = byteLength >>> 0;
		  if (!noAssert) {
		    checkOffset(offset, byteLength, this.length);
		  }

		  let val = this[offset + --byteLength];
		  let mul = 1;
		  while (byteLength > 0 && (mul *= 0x100)) {
		    val += this[offset + --byteLength] * mul;
		  }

		  return val
		};

		Buffer.prototype.readUint8 =
		Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 1, this.length);
		  return this[offset]
		};

		Buffer.prototype.readUint16LE =
		Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 2, this.length);
		  return this[offset] | (this[offset + 1] << 8)
		};

		Buffer.prototype.readUint16BE =
		Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 2, this.length);
		  return (this[offset] << 8) | this[offset + 1]
		};

		Buffer.prototype.readUint32LE =
		Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 4, this.length);

		  return ((this[offset]) |
		      (this[offset + 1] << 8) |
		      (this[offset + 2] << 16)) +
		      (this[offset + 3] * 0x1000000)
		};

		Buffer.prototype.readUint32BE =
		Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 4, this.length);

		  return (this[offset] * 0x1000000) +
		    ((this[offset + 1] << 16) |
		    (this[offset + 2] << 8) |
		    this[offset + 3])
		};

		Buffer.prototype.readBigUInt64LE = defineBigIntMethod(function readBigUInt64LE (offset) {
		  offset = offset >>> 0;
		  validateNumber(offset, 'offset');
		  const first = this[offset];
		  const last = this[offset + 7];
		  if (first === undefined || last === undefined) {
		    boundsError(offset, this.length - 8);
		  }

		  const lo = first +
		    this[++offset] * 2 ** 8 +
		    this[++offset] * 2 ** 16 +
		    this[++offset] * 2 ** 24;

		  const hi = this[++offset] +
		    this[++offset] * 2 ** 8 +
		    this[++offset] * 2 ** 16 +
		    last * 2 ** 24;

		  return BigInt(lo) + (BigInt(hi) << BigInt(32))
		});

		Buffer.prototype.readBigUInt64BE = defineBigIntMethod(function readBigUInt64BE (offset) {
		  offset = offset >>> 0;
		  validateNumber(offset, 'offset');
		  const first = this[offset];
		  const last = this[offset + 7];
		  if (first === undefined || last === undefined) {
		    boundsError(offset, this.length - 8);
		  }

		  const hi = first * 2 ** 24 +
		    this[++offset] * 2 ** 16 +
		    this[++offset] * 2 ** 8 +
		    this[++offset];

		  const lo = this[++offset] * 2 ** 24 +
		    this[++offset] * 2 ** 16 +
		    this[++offset] * 2 ** 8 +
		    last;

		  return (BigInt(hi) << BigInt(32)) + BigInt(lo)
		});

		Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
		  offset = offset >>> 0;
		  byteLength = byteLength >>> 0;
		  if (!noAssert) checkOffset(offset, byteLength, this.length);

		  let val = this[offset];
		  let mul = 1;
		  let i = 0;
		  while (++i < byteLength && (mul *= 0x100)) {
		    val += this[offset + i] * mul;
		  }
		  mul *= 0x80;

		  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

		  return val
		};

		Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
		  offset = offset >>> 0;
		  byteLength = byteLength >>> 0;
		  if (!noAssert) checkOffset(offset, byteLength, this.length);

		  let i = byteLength;
		  let mul = 1;
		  let val = this[offset + --i];
		  while (i > 0 && (mul *= 0x100)) {
		    val += this[offset + --i] * mul;
		  }
		  mul *= 0x80;

		  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

		  return val
		};

		Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 1, this.length);
		  if (!(this[offset] & 0x80)) return (this[offset])
		  return ((0xff - this[offset] + 1) * -1)
		};

		Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 2, this.length);
		  const val = this[offset] | (this[offset + 1] << 8);
		  return (val & 0x8000) ? val | 0xFFFF0000 : val
		};

		Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 2, this.length);
		  const val = this[offset + 1] | (this[offset] << 8);
		  return (val & 0x8000) ? val | 0xFFFF0000 : val
		};

		Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 4, this.length);

		  return (this[offset]) |
		    (this[offset + 1] << 8) |
		    (this[offset + 2] << 16) |
		    (this[offset + 3] << 24)
		};

		Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 4, this.length);

		  return (this[offset] << 24) |
		    (this[offset + 1] << 16) |
		    (this[offset + 2] << 8) |
		    (this[offset + 3])
		};

		Buffer.prototype.readBigInt64LE = defineBigIntMethod(function readBigInt64LE (offset) {
		  offset = offset >>> 0;
		  validateNumber(offset, 'offset');
		  const first = this[offset];
		  const last = this[offset + 7];
		  if (first === undefined || last === undefined) {
		    boundsError(offset, this.length - 8);
		  }

		  const val = this[offset + 4] +
		    this[offset + 5] * 2 ** 8 +
		    this[offset + 6] * 2 ** 16 +
		    (last << 24); // Overflow

		  return (BigInt(val) << BigInt(32)) +
		    BigInt(first +
		    this[++offset] * 2 ** 8 +
		    this[++offset] * 2 ** 16 +
		    this[++offset] * 2 ** 24)
		});

		Buffer.prototype.readBigInt64BE = defineBigIntMethod(function readBigInt64BE (offset) {
		  offset = offset >>> 0;
		  validateNumber(offset, 'offset');
		  const first = this[offset];
		  const last = this[offset + 7];
		  if (first === undefined || last === undefined) {
		    boundsError(offset, this.length - 8);
		  }

		  const val = (first << 24) + // Overflow
		    this[++offset] * 2 ** 16 +
		    this[++offset] * 2 ** 8 +
		    this[++offset];

		  return (BigInt(val) << BigInt(32)) +
		    BigInt(this[++offset] * 2 ** 24 +
		    this[++offset] * 2 ** 16 +
		    this[++offset] * 2 ** 8 +
		    last)
		});

		Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 4, this.length);
		  return ieee754.read(this, offset, true, 23, 4)
		};

		Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 4, this.length);
		  return ieee754.read(this, offset, false, 23, 4)
		};

		Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 8, this.length);
		  return ieee754.read(this, offset, true, 52, 8)
		};

		Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
		  offset = offset >>> 0;
		  if (!noAssert) checkOffset(offset, 8, this.length);
		  return ieee754.read(this, offset, false, 52, 8)
		};

		function checkInt (buf, value, offset, ext, max, min) {
		  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
		  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
		  if (offset + ext > buf.length) throw new RangeError('Index out of range')
		}

		Buffer.prototype.writeUintLE =
		Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  byteLength = byteLength >>> 0;
		  if (!noAssert) {
		    const maxBytes = Math.pow(2, 8 * byteLength) - 1;
		    checkInt(this, value, offset, byteLength, maxBytes, 0);
		  }

		  let mul = 1;
		  let i = 0;
		  this[offset] = value & 0xFF;
		  while (++i < byteLength && (mul *= 0x100)) {
		    this[offset + i] = (value / mul) & 0xFF;
		  }

		  return offset + byteLength
		};

		Buffer.prototype.writeUintBE =
		Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  byteLength = byteLength >>> 0;
		  if (!noAssert) {
		    const maxBytes = Math.pow(2, 8 * byteLength) - 1;
		    checkInt(this, value, offset, byteLength, maxBytes, 0);
		  }

		  let i = byteLength - 1;
		  let mul = 1;
		  this[offset + i] = value & 0xFF;
		  while (--i >= 0 && (mul *= 0x100)) {
		    this[offset + i] = (value / mul) & 0xFF;
		  }

		  return offset + byteLength
		};

		Buffer.prototype.writeUint8 =
		Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0);
		  this[offset] = (value & 0xff);
		  return offset + 1
		};

		Buffer.prototype.writeUint16LE =
		Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
		  this[offset] = (value & 0xff);
		  this[offset + 1] = (value >>> 8);
		  return offset + 2
		};

		Buffer.prototype.writeUint16BE =
		Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
		  this[offset] = (value >>> 8);
		  this[offset + 1] = (value & 0xff);
		  return offset + 2
		};

		Buffer.prototype.writeUint32LE =
		Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
		  this[offset + 3] = (value >>> 24);
		  this[offset + 2] = (value >>> 16);
		  this[offset + 1] = (value >>> 8);
		  this[offset] = (value & 0xff);
		  return offset + 4
		};

		Buffer.prototype.writeUint32BE =
		Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
		  this[offset] = (value >>> 24);
		  this[offset + 1] = (value >>> 16);
		  this[offset + 2] = (value >>> 8);
		  this[offset + 3] = (value & 0xff);
		  return offset + 4
		};

		function wrtBigUInt64LE (buf, value, offset, min, max) {
		  checkIntBI(value, min, max, buf, offset, 7);

		  let lo = Number(value & BigInt(0xffffffff));
		  buf[offset++] = lo;
		  lo = lo >> 8;
		  buf[offset++] = lo;
		  lo = lo >> 8;
		  buf[offset++] = lo;
		  lo = lo >> 8;
		  buf[offset++] = lo;
		  let hi = Number(value >> BigInt(32) & BigInt(0xffffffff));
		  buf[offset++] = hi;
		  hi = hi >> 8;
		  buf[offset++] = hi;
		  hi = hi >> 8;
		  buf[offset++] = hi;
		  hi = hi >> 8;
		  buf[offset++] = hi;
		  return offset
		}

		function wrtBigUInt64BE (buf, value, offset, min, max) {
		  checkIntBI(value, min, max, buf, offset, 7);

		  let lo = Number(value & BigInt(0xffffffff));
		  buf[offset + 7] = lo;
		  lo = lo >> 8;
		  buf[offset + 6] = lo;
		  lo = lo >> 8;
		  buf[offset + 5] = lo;
		  lo = lo >> 8;
		  buf[offset + 4] = lo;
		  let hi = Number(value >> BigInt(32) & BigInt(0xffffffff));
		  buf[offset + 3] = hi;
		  hi = hi >> 8;
		  buf[offset + 2] = hi;
		  hi = hi >> 8;
		  buf[offset + 1] = hi;
		  hi = hi >> 8;
		  buf[offset] = hi;
		  return offset + 8
		}

		Buffer.prototype.writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE (value, offset = 0) {
		  return wrtBigUInt64LE(this, value, offset, BigInt(0), BigInt('0xffffffffffffffff'))
		});

		Buffer.prototype.writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE (value, offset = 0) {
		  return wrtBigUInt64BE(this, value, offset, BigInt(0), BigInt('0xffffffffffffffff'))
		});

		Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) {
		    const limit = Math.pow(2, (8 * byteLength) - 1);

		    checkInt(this, value, offset, byteLength, limit - 1, -limit);
		  }

		  let i = 0;
		  let mul = 1;
		  let sub = 0;
		  this[offset] = value & 0xFF;
		  while (++i < byteLength && (mul *= 0x100)) {
		    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
		      sub = 1;
		    }
		    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
		  }

		  return offset + byteLength
		};

		Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) {
		    const limit = Math.pow(2, (8 * byteLength) - 1);

		    checkInt(this, value, offset, byteLength, limit - 1, -limit);
		  }

		  let i = byteLength - 1;
		  let mul = 1;
		  let sub = 0;
		  this[offset + i] = value & 0xFF;
		  while (--i >= 0 && (mul *= 0x100)) {
		    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
		      sub = 1;
		    }
		    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
		  }

		  return offset + byteLength
		};

		Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -128);
		  if (value < 0) value = 0xff + value + 1;
		  this[offset] = (value & 0xff);
		  return offset + 1
		};

		Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -32768);
		  this[offset] = (value & 0xff);
		  this[offset + 1] = (value >>> 8);
		  return offset + 2
		};

		Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -32768);
		  this[offset] = (value >>> 8);
		  this[offset + 1] = (value & 0xff);
		  return offset + 2
		};

		Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -2147483648);
		  this[offset] = (value & 0xff);
		  this[offset + 1] = (value >>> 8);
		  this[offset + 2] = (value >>> 16);
		  this[offset + 3] = (value >>> 24);
		  return offset + 4
		};

		Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -2147483648);
		  if (value < 0) value = 0xffffffff + value + 1;
		  this[offset] = (value >>> 24);
		  this[offset + 1] = (value >>> 16);
		  this[offset + 2] = (value >>> 8);
		  this[offset + 3] = (value & 0xff);
		  return offset + 4
		};

		Buffer.prototype.writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE (value, offset = 0) {
		  return wrtBigUInt64LE(this, value, offset, -BigInt('0x8000000000000000'), BigInt('0x7fffffffffffffff'))
		});

		Buffer.prototype.writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE (value, offset = 0) {
		  return wrtBigUInt64BE(this, value, offset, -BigInt('0x8000000000000000'), BigInt('0x7fffffffffffffff'))
		});

		function checkIEEE754 (buf, value, offset, ext, max, min) {
		  if (offset + ext > buf.length) throw new RangeError('Index out of range')
		  if (offset < 0) throw new RangeError('Index out of range')
		}

		function writeFloat (buf, value, offset, littleEndian, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) {
		    checkIEEE754(buf, value, offset, 4);
		  }
		  ieee754.write(buf, value, offset, littleEndian, 23, 4);
		  return offset + 4
		}

		Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
		  return writeFloat(this, value, offset, true, noAssert)
		};

		Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
		  return writeFloat(this, value, offset, false, noAssert)
		};

		function writeDouble (buf, value, offset, littleEndian, noAssert) {
		  value = +value;
		  offset = offset >>> 0;
		  if (!noAssert) {
		    checkIEEE754(buf, value, offset, 8);
		  }
		  ieee754.write(buf, value, offset, littleEndian, 52, 8);
		  return offset + 8
		}

		Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
		  return writeDouble(this, value, offset, true, noAssert)
		};

		Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
		  return writeDouble(this, value, offset, false, noAssert)
		};

		// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
		Buffer.prototype.copy = function copy (target, targetStart, start, end) {
		  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer')
		  if (!start) start = 0;
		  if (!end && end !== 0) end = this.length;
		  if (targetStart >= target.length) targetStart = target.length;
		  if (!targetStart) targetStart = 0;
		  if (end > 0 && end < start) end = start;

		  // Copy 0 bytes; we're done
		  if (end === start) return 0
		  if (target.length === 0 || this.length === 0) return 0

		  // Fatal error conditions
		  if (targetStart < 0) {
		    throw new RangeError('targetStart out of bounds')
		  }
		  if (start < 0 || start >= this.length) throw new RangeError('Index out of range')
		  if (end < 0) throw new RangeError('sourceEnd out of bounds')

		  // Are we oob?
		  if (end > this.length) end = this.length;
		  if (target.length - targetStart < end - start) {
		    end = target.length - targetStart + start;
		  }

		  const len = end - start;

		  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
		    // Use built-in when available, missing from IE11
		    this.copyWithin(targetStart, start, end);
		  } else {
		    Uint8Array.prototype.set.call(
		      target,
		      this.subarray(start, end),
		      targetStart
		    );
		  }

		  return len
		};

		// Usage:
		//    buffer.fill(number[, offset[, end]])
		//    buffer.fill(buffer[, offset[, end]])
		//    buffer.fill(string[, offset[, end]][, encoding])
		Buffer.prototype.fill = function fill (val, start, end, encoding) {
		  // Handle string cases:
		  if (typeof val === 'string') {
		    if (typeof start === 'string') {
		      encoding = start;
		      start = 0;
		      end = this.length;
		    } else if (typeof end === 'string') {
		      encoding = end;
		      end = this.length;
		    }
		    if (encoding !== undefined && typeof encoding !== 'string') {
		      throw new TypeError('encoding must be a string')
		    }
		    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
		      throw new TypeError('Unknown encoding: ' + encoding)
		    }
		    if (val.length === 1) {
		      const code = val.charCodeAt(0);
		      if ((encoding === 'utf8' && code < 128) ||
		          encoding === 'latin1') {
		        // Fast path: If `val` fits into a single byte, use that numeric value.
		        val = code;
		      }
		    }
		  } else if (typeof val === 'number') {
		    val = val & 255;
		  } else if (typeof val === 'boolean') {
		    val = Number(val);
		  }

		  // Invalid ranges are not set to a default, so can range check early.
		  if (start < 0 || this.length < start || this.length < end) {
		    throw new RangeError('Out of range index')
		  }

		  if (end <= start) {
		    return this
		  }

		  start = start >>> 0;
		  end = end === undefined ? this.length : end >>> 0;

		  if (!val) val = 0;

		  let i;
		  if (typeof val === 'number') {
		    for (i = start; i < end; ++i) {
		      this[i] = val;
		    }
		  } else {
		    const bytes = Buffer.isBuffer(val)
		      ? val
		      : Buffer.from(val, encoding);
		    const len = bytes.length;
		    if (len === 0) {
		      throw new TypeError('The value "' + val +
		        '" is invalid for argument "value"')
		    }
		    for (i = 0; i < end - start; ++i) {
		      this[i + start] = bytes[i % len];
		    }
		  }

		  return this
		};

		// CUSTOM ERRORS
		// =============

		// Simplified versions from Node, changed for Buffer-only usage
		const errors = {};
		function E (sym, getMessage, Base) {
		  errors[sym] = class NodeError extends Base {
		    constructor () {
		      super();

		      Object.defineProperty(this, 'message', {
		        value: getMessage.apply(this, arguments),
		        writable: true,
		        configurable: true
		      });

		      // Add the error code to the name to include it in the stack trace.
		      this.name = `${this.name} [${sym}]`;
		      // Access the stack to generate the error message including the error code
		      // from the name.
		      this.stack; // eslint-disable-line no-unused-expressions
		      // Reset the name to the actual name.
		      delete this.name;
		    }

		    get code () {
		      return sym
		    }

		    set code (value) {
		      Object.defineProperty(this, 'code', {
		        configurable: true,
		        enumerable: true,
		        value,
		        writable: true
		      });
		    }

		    toString () {
		      return `${this.name} [${sym}]: ${this.message}`
		    }
		  };
		}

		E('ERR_BUFFER_OUT_OF_BOUNDS',
		  function (name) {
		    if (name) {
		      return `${name} is outside of buffer bounds`
		    }

		    return 'Attempt to access memory outside buffer bounds'
		  }, RangeError);
		E('ERR_INVALID_ARG_TYPE',
		  function (name, actual) {
		    return `The "${name}" argument must be of type number. Received type ${typeof actual}`
		  }, TypeError);
		E('ERR_OUT_OF_RANGE',
		  function (str, range, input) {
		    let msg = `The value of "${str}" is out of range.`;
		    let received = input;
		    if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
		      received = addNumericalSeparator(String(input));
		    } else if (typeof input === 'bigint') {
		      received = String(input);
		      if (input > BigInt(2) ** BigInt(32) || input < -(BigInt(2) ** BigInt(32))) {
		        received = addNumericalSeparator(received);
		      }
		      received += 'n';
		    }
		    msg += ` It must be ${range}. Received ${received}`;
		    return msg
		  }, RangeError);

		function addNumericalSeparator (val) {
		  let res = '';
		  let i = val.length;
		  const start = val[0] === '-' ? 1 : 0;
		  for (; i >= start + 4; i -= 3) {
		    res = `_${val.slice(i - 3, i)}${res}`;
		  }
		  return `${val.slice(0, i)}${res}`
		}

		// CHECK FUNCTIONS
		// ===============

		function checkBounds (buf, offset, byteLength) {
		  validateNumber(offset, 'offset');
		  if (buf[offset] === undefined || buf[offset + byteLength] === undefined) {
		    boundsError(offset, buf.length - (byteLength + 1));
		  }
		}

		function checkIntBI (value, min, max, buf, offset, byteLength) {
		  if (value > max || value < min) {
		    const n = typeof min === 'bigint' ? 'n' : '';
		    let range;
		    {
		      if (min === 0 || min === BigInt(0)) {
		        range = `>= 0${n} and < 2${n} ** ${(byteLength + 1) * 8}${n}`;
		      } else {
		        range = `>= -(2${n} ** ${(byteLength + 1) * 8 - 1}${n}) and < 2 ** ` +
		                `${(byteLength + 1) * 8 - 1}${n}`;
		      }
		    }
		    throw new errors.ERR_OUT_OF_RANGE('value', range, value)
		  }
		  checkBounds(buf, offset, byteLength);
		}

		function validateNumber (value, name) {
		  if (typeof value !== 'number') {
		    throw new errors.ERR_INVALID_ARG_TYPE(name, 'number', value)
		  }
		}

		function boundsError (value, length, type) {
		  if (Math.floor(value) !== value) {
		    validateNumber(value, type);
		    throw new errors.ERR_OUT_OF_RANGE('offset', 'an integer', value)
		  }

		  if (length < 0) {
		    throw new errors.ERR_BUFFER_OUT_OF_BOUNDS()
		  }

		  throw new errors.ERR_OUT_OF_RANGE('offset',
		                                    `>= ${0} and <= ${length}`,
		                                    value)
		}

		// HELPER FUNCTIONS
		// ================

		const INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;

		function base64clean (str) {
		  // Node takes equal signs as end of the Base64 encoding
		  str = str.split('=')[0];
		  // Node strips out invalid characters like \n and \t from the string, base64-js does not
		  str = str.trim().replace(INVALID_BASE64_RE, '');
		  // Node converts strings with length < 2 to ''
		  if (str.length < 2) return ''
		  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
		  while (str.length % 4 !== 0) {
		    str = str + '=';
		  }
		  return str
		}

		function utf8ToBytes (string, units) {
		  units = units || Infinity;
		  let codePoint;
		  const length = string.length;
		  let leadSurrogate = null;
		  const bytes = [];

		  for (let i = 0; i < length; ++i) {
		    codePoint = string.charCodeAt(i);

		    // is surrogate component
		    if (codePoint > 0xD7FF && codePoint < 0xE000) {
		      // last char was a lead
		      if (!leadSurrogate) {
		        // no lead yet
		        if (codePoint > 0xDBFF) {
		          // unexpected trail
		          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
		          continue
		        } else if (i + 1 === length) {
		          // unpaired lead
		          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
		          continue
		        }

		        // valid lead
		        leadSurrogate = codePoint;

		        continue
		      }

		      // 2 leads in a row
		      if (codePoint < 0xDC00) {
		        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
		        leadSurrogate = codePoint;
		        continue
		      }

		      // valid surrogate pair
		      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000;
		    } else if (leadSurrogate) {
		      // valid bmp char, but last char was a lead
		      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
		    }

		    leadSurrogate = null;

		    // encode utf8
		    if (codePoint < 0x80) {
		      if ((units -= 1) < 0) break
		      bytes.push(codePoint);
		    } else if (codePoint < 0x800) {
		      if ((units -= 2) < 0) break
		      bytes.push(
		        codePoint >> 0x6 | 0xC0,
		        codePoint & 0x3F | 0x80
		      );
		    } else if (codePoint < 0x10000) {
		      if ((units -= 3) < 0) break
		      bytes.push(
		        codePoint >> 0xC | 0xE0,
		        codePoint >> 0x6 & 0x3F | 0x80,
		        codePoint & 0x3F | 0x80
		      );
		    } else if (codePoint < 0x110000) {
		      if ((units -= 4) < 0) break
		      bytes.push(
		        codePoint >> 0x12 | 0xF0,
		        codePoint >> 0xC & 0x3F | 0x80,
		        codePoint >> 0x6 & 0x3F | 0x80,
		        codePoint & 0x3F | 0x80
		      );
		    } else {
		      throw new Error('Invalid code point')
		    }
		  }

		  return bytes
		}

		function asciiToBytes (str) {
		  const byteArray = [];
		  for (let i = 0; i < str.length; ++i) {
		    // Node's code seems to be doing this and not & 0x7F..
		    byteArray.push(str.charCodeAt(i) & 0xFF);
		  }
		  return byteArray
		}

		function utf16leToBytes (str, units) {
		  let c, hi, lo;
		  const byteArray = [];
		  for (let i = 0; i < str.length; ++i) {
		    if ((units -= 2) < 0) break

		    c = str.charCodeAt(i);
		    hi = c >> 8;
		    lo = c % 256;
		    byteArray.push(lo);
		    byteArray.push(hi);
		  }

		  return byteArray
		}

		function base64ToBytes (str) {
		  return base64.toByteArray(base64clean(str))
		}

		function blitBuffer (src, dst, offset, length) {
		  let i;
		  for (i = 0; i < length; ++i) {
		    if ((i + offset >= dst.length) || (i >= src.length)) break
		    dst[i + offset] = src[i];
		  }
		  return i
		}

		// ArrayBuffer or Uint8Array objects from other contexts (i.e. iframes) do not pass
		// the `instanceof` check but they should be treated as of that type.
		// See: https://github.com/feross/buffer/issues/166
		function isInstance (obj, type) {
		  return obj instanceof type ||
		    (obj != null && obj.constructor != null && obj.constructor.name != null &&
		      obj.constructor.name === type.name)
		}
		function numberIsNaN (obj) {
		  // For IE11 support
		  return obj !== obj // eslint-disable-line no-self-compare
		}

		// Create lookup table for `toString('hex')`
		// See: https://github.com/feross/buffer/issues/219
		const hexSliceLookupTable = (function () {
		  const alphabet = '0123456789abcdef';
		  const table = new Array(256);
		  for (let i = 0; i < 16; ++i) {
		    const i16 = i * 16;
		    for (let j = 0; j < 16; ++j) {
		      table[i16 + j] = alphabet[i] + alphabet[j];
		    }
		  }
		  return table
		})();

		// Return not function with Error if BigInt not supported
		function defineBigIntMethod (fn) {
		  return typeof BigInt === 'undefined' ? BufferBigIntNotDefined : fn
		}

		function BufferBigIntNotDefined () {
		  throw new Error('BigInt not supported')
		} 
	} (buffer));
	return buffer;
}

requireBuffer();

/* Browser Crypto Shims */
function getGlobal() {
    if (typeof globalThis !== "undefined")
        return globalThis;
    if (typeof self !== "undefined") {
        return self;
    }
    if (typeof window !== "undefined") {
        return window;
    }
    if (typeof global !== "undefined") {
        return global;
    }
    throw new Error("unable to locate global object");
}
const anyGlobal = getGlobal();
anyGlobal.crypto || anyGlobal.msCrypto;
function createHash(algo) {
    switch (algo) {
        case "ripemd160":
            return ripemd160.create();
        case "sha256":
            return sha256$1.create();
        case "sha512":
            return sha512$1.create();
        case "sha3-256":
            return sha3_256.create();
        case "sha3-512":
            return sha3_512.create();
    }
    assertArgument(false, "invalid hashing algorithm name", "algorithm", algo);
}

const _sha256 = (data) => hexlify(createHash("sha3-256").update(data).digest());
const _sha512 = (data) => hexlify(createHash("sha3-512").update(data).digest());
let __sha256 = _sha256;
let __sha512 = _sha512;
let locked256 = false, locked512 = false;
/**
 *  Compute the cryptographic SHA3-256 hash of %%data%%.
 *
 *  @_docloc: api/crypto:Hash Functions
 *  @returns DataHexstring
 *
 *  @example:
 *    sha256("0x")
 *    //_result:
 *
 *    sha256("0x1337")
 *    //_result:
 *
 *    sha256(new Uint8Array([ 0x13, 0x37 ]))
 *    //_result:
 *
 */
var SupportedAlgorithm;
(function (SupportedAlgorithm) {
    SupportedAlgorithm["sha256"] = "sha256";
    SupportedAlgorithm["sha512"] = "sha512";
})(SupportedAlgorithm || (SupportedAlgorithm = {}));
function sha256(data) {
    return hexlify(__sha256(getBytes(data)));
}
sha256._ = _sha256;
sha256.lock = function () {
    locked256 = true;
};
sha256.register = function (func) {
    if (locked256) {
        throw new Error("sha256 is locked");
    }
    __sha256 = func;
};
Object.freeze(sha256);
/**
 *  Compute the cryptographic SHA3-512 hash of %%data%%.
 *
 *  @_docloc: api/crypto:Hash Functions
 *  @returns DataHexstring
 *
 *  @example:
 *    sha512("0x")
 *    //_result:
 *
 *    sha512("0x1337")
 *    //_result:
 *
 *    sha512(new Uint8Array([ 0x13, 0x37 ]))
 *    //_result:
 */
function sha512(data) {
    return hexlify(__sha512(getBytes(data)));
}
sha512._ = _sha512;
sha512.lock = function () {
    locked512 = true;
};
sha512.register = function (func) {
    if (locked512) {
        throw new Error("sha512 is locked");
    }
    __sha512 = func;
};
Object.freeze(sha512);

/**
 *  A simple hashing function which operates on UTF-8 strings to
 *  compute an 32-byte identifier.
 *
 *
 *  @example:
 *    id("hello world")
 *    //_result:
 */
function id(value, useKeccak) {
    if (useKeccak) {
        return keccak256(toUtf8Bytes(value));
    }
    return sha256(toUtf8Bytes(value));
}

const subsChrs = " !#$%&'()*+,-./<=>?@[]^_`{|}~";
const Word = /^[a-z]*$/i;
function unfold(words, sep) {
    let initial = 97;
    return words.reduce((accum, word) => {
        if (word === sep) {
            initial++;
        }
        else if (word.match(Word)) {
            accum.push(String.fromCharCode(initial) + word);
        }
        else {
            initial = 97;
            accum.push(word);
        }
        return accum;
    }, []);
}
/**
 *  @_ignore
 */
function decode(data, subs) {
    // Replace all the substitutions with their expanded form
    for (let i = subsChrs.length - 1; i >= 0; i--) {
        data = data.split(subsChrs[i]).join(subs.substring(2 * i, 2 * i + 2));
    }
    // Get all tle clumps; each suffix, first-increment and second-increment
    const clumps = [];
    const leftover = data.replace(/(:|([0-9])|([A-Z][a-z]*))/g, (all, item, semi, word) => {
        if (semi) {
            for (let i = parseInt(semi); i >= 0; i--) {
                clumps.push(";");
            }
        }
        else {
            clumps.push(item.toLowerCase());
        }
        return "";
    });
    /* c8 ignore start */
    if (leftover) {
        throw new Error(`leftovers: ${JSON.stringify(leftover)}`);
    }
    /* c8 ignore stop */
    return unfold(unfold(clumps, ";"), ":");
}
/**
 *  @_ignore
 */
function decodeOwl(data) {
    assertArgument(data[0] === "0", "unsupported auwl data", "data", data);
    return decode(data.substring(1 + 2 * subsChrs.length), data.substring(1, 1 + 2 * subsChrs.length));
}

/**
 *  A Wordlist represents a collection of language-specific
 *  words used to encode and devoce [[link-bip-39]] encoded data
 *  by mapping words to 11-bit values and vice versa.
 */
class Wordlist {
    locale;
    /**
     *  Creates a new Wordlist instance.
     *
     *  Sub-classes MUST call this if they provide their own constructor,
     *  passing in the locale string of the language.
     *
     *  Generally there is no need to create instances of a Wordlist,
     *  since each language-specific Wordlist creates an instance and
     *  there is no state kept internally, so they are safe to share.
     */
    constructor(locale) {
        defineProperties(this, { locale });
    }
    /**
     *  Sub-classes may override this to provide a language-specific
     *  method for spliting %%phrase%% into individual words.
     *
     *  By default, %%phrase%% is split using any sequences of
     *  white-space as defined by regular expressions (i.e. ``/\s+/``).
     */
    split(phrase) {
        return phrase.toLowerCase().split(/\s+/g);
    }
    /**
     *  Sub-classes may override this to provider a language-specific
     *  method for joining %%words%% into a phrase.
     *
     *  By default, %%words%% are joined by a single space.
     */
    join(words) {
        return words.join(" ");
    }
    static check(wordlist) {
        const words = [];
        for (let i = 0; i < 2048; i++) {
            const word = wordlist.getWord(i);
            /* istanbul ignore if */
            if (i !== wordlist.getWordIndex(word)) {
                return "0x";
            }
            words.push(word);
        }
        return id(words.join("\n") + "\n");
    }
}

// Use the encode-latin.js script to create the necessary
// data files to be consumed by this class
/**
 *  An OWL format Wordlist is an encoding method that exploits
 *  the general locality of alphabetically sorted words to
 *  achieve a simple but effective means of compression.
 *
 *  This class is generally not useful to most developers as
 *  it is used mainly internally to keep Wordlists for languages
 *  based on ASCII-7 small.
 *
 *  If necessary, there are tools within the ``generation/`` folder
 *  to create these necessary data.
 */
class WordlistOwl extends Wordlist {
    #data;
    #checksum;
    /**
     *  Creates a new Wordlist for %%locale%% using the OWL %%data%%
     *  and validated against the %%checksum%%.
     */
    constructor(locale, data, checksum) {
        super(locale);
        this.#data = data;
        this.#checksum = checksum;
        this.#words = null;
    }
    get _data() {
        return this.#data;
    }
    _decodeWords() {
        return decodeOwl(this.#data);
    }
    #words;
    #loadWords() {
        if (this.#words == null) {
            const words = this._decodeWords();
            // Verify the computed list matches the official list
            const checksum = id(words.join("\n") + "\n", true);
            /* c8 ignore start */
            if (checksum !== this.#checksum) {
                throw new Error(`BIP39 Wordlist for ${this.locale} FffffAILED`);
            }
            /* c8 ignore stop */
            this.#words = words;
        }
        return this.#words;
    }
    getWord(index) {
        const words = this.#loadWords();
        assertArgument(index >= 0 && index < words.length, `invalid word index: ${index}`, "index", index);
        return words[index];
    }
    getWordIndex(word) {
        return this.#loadWords().indexOf(word);
    }
}

const words$4 = "0itatkastcenaovo$taouleraeki&chor*teci%enbalodaeladet'!Chn=0Di#%E%^1Resa2Rese3CeT'#0EjKohol0Pu)%0A&sDul#Ekdo)Ke)Ti#Ul|3}aOgan%0FaltI$@tPi,%TmaTronom0LasL{i#Ol0Tobus4Yl:B#}<CilCul#D!_Ge)GrHnoKterieLa^L{#LkonLon-LvanLzaMbusNkom!R[rR{RmanRokoRvaTer#TohVl&Zal#Zili#Zu#3D&RanSe^StieTonZin#ZmocZ)k3CyklD]Ft-KinyLan%Og,fO]gTvaZon2AhobytAt*/E/aEdu+EskIk!Iz&Ok|Oud Ud2B-BrDl.D~H!(JkotJ|K<ysLe$R>R'?TaUb_U/!U^U+Ur!Xer2A^v#Ambo,An#AtrEp)Ike)KoLohOnzOskevUn{#Usin#Z^Zy2Bl.Bn|})D _D#D'aF{Jar(Kv?LdokLvaN^NkrRzaTikVolZola3D+tL.T'#0Ukot:PartRev&3DrDu+J/JnLaLerLkemLn?N.Nn(N'#NtrumNz<StopisT#2AlupaAp`]Ar aA)E/t!EmieI/otIrurgL`Le[Lub M_Mu,ObotO/olOd[O+,Om=Op Oro[OvRapotRl RtRupTiv(Ud.Utn!V!Vil#V(Y[Y$!Yt 0Bu+Gare)H_&HlaNkotRkusSter&Ta%TrusZin>Z(2O&2KolivUv!4It_N(0Dn(Ke)KrPot0Ak~AlIkRkot2Kli$a:L-oRe[T_Tum1E,1B!a}'#Cib_Fic Fla%KlKr{Mokr!PreseRbyS#T-tiv3Kob,zKt|O^P]mSkSp+jV`]Vo/2AhaOuhoUhopis1Es0BroByt-C@t}ut DnesH+dHo^H,JemJn?Kl`KolaKt<Kum@tLarLevaL.MaM.ntMluv M'Nut P`PisPln PosudPr'odPu$ Raz R(RtSahSl'St!-SudSy)TazT-Tk~Uf!Utn!Voz%Z`uZn!Z<%2Aho)AkAm!ikAv>AzeDolObn(OgerieOzdSn(T Z(2B@}'noD-HaH'#S SnoT(0Oj?Or>2Nam :9O]gOnomie0EktronIpsa0AilIseO%P!ie2Izo^O/aOpejOs2EjEn%K<)Kymo0Ike)0F<ie0Olu%1Eku%KurzePed?P]zeP<tT,kt:C#Jf#Kul)N!ikN)zieRmacieV< Zo+3De,%J{onN#3Al#Gu,ntLozofLtrNan%N)Xa%0Ord1An_IrtOtila2NdSf<T[lT#Ton2Ak%Es#On)2KarNk%3Zi#:LejeRant3N{i#O]g3Lot.2Azu,Ejt2LemLfi$aTi#2AfAmofonAnu+EpIlOgOtes#2Ma:D?DrLaL@#N[NopisRfaRpu&V,n3Bk(J#lJnoJtmanK)rLmaM!omR>R&S]Zky3St<ik2Ad'#AsivkyAvaEd!EnO^v>OhOup(T!Ub.U/o)0AtO)Yz0IsOjivoOut0Bl.Boj}DinyDl!Dno)D|Jn(KejLin#L#LubMo+N [No,%RalR^RizontRkoRliv>RmonRn.RoskopR$voSpo^St.T'(U[UfUp!Us#V<2Ad[An?Av(Az^Bo+kD.D]D(N-Ob#Oma^OtOu^Oz@St#Ub(Yz!2B@(B~D[KotMrS aSto)0Ozd2Bn(D,ntGie&M&Sterik:2Yl#3Ned2O&0Uze0Un a0F-%Fla%KasoOva%Sp-%Tern{Vali^Ve$<Zer%3Onie:Blko})Ho^Kmi+K(L'>N)rRmarkRoSanSnoT#V<Zyk3Din>D+Dn!_HlanKotL@L oMn(NomP?S{erV Zd>Zero3NakNdyNo/Sk,Sto)Trn?Zva3En|1Gurt5R):Bar{B_Bin{}&D{Did]HanJakJu)KaoKtusLam aLhotyLibrLn(Me,MkolivM&Ni[lNoeNt<Pal.P_aP olaP#P+Po)PrPu$aPy[,Ram_Rot#RtonSaTa]gTed,U%UzaVa+cZaj#Ze)Ziv(2EkolivEsi0Dlub@MpRami#3No2A%kAdivoAmApotAsi#AunEcEn[Ep!Es~IdImaIs&Ob*kO#nOpaOubUb'&Us!Uzk(0EnIt!Otr0IhaOt0Al?Ber>B#BlihaBylaC*rH=J@>KosKtejlLapsLe^LizeLoMandoMe)MikMn!aMo,MpasMun aN!N%ptNd?N>NfeseNgresN.NkursN)ktNzervaPan>PieP~Pr'#Rb_R-t<Rmid]RoptevRpusRu&RytoRz{S!>St#T_T+)T*lUk!Up_&Us-Uz]VbojZaZ<oh2Ab?A/Aj.Al|AsopisAv!aEd EjcarEs[Eve)Ik{ItikIzeKav>Me+cMivoOcanOkOni#Op OupaOv#T-Uh`]Up?Ut(Vin#Y/+Yp)Y$alYt2Dlan#FrJn(KlaLaj^Li/L#Lom{Ltu,NaPodivuRtRz<Til0Al aAsin#E$<2No]gS_.Ta,T?T#T'>V`]:B,d<})nDn(IkKom>M_aMpaN'#S?SoStu,Tin#V.3B#CkdyD@Dn?D'#Dv.G@^GieG,%H%Hk(H~KtvarNo/odNtil#P@#Pid]T`]T>TmoTokruhVhartV a%Vobok3B,}ot#DojedDsk(H'.Jav>L-M{#NieN#No+umStop`T.T|5Bi$aDivodGi#GopedKal aK{Mc|P!aPu/RdSosTrU^lUhU#Usk!V>3Tiv(1Cer&CiferMpSkSt,%0I%2RaRi#S.:DamD]Gi$rHagonJ{-J _J< aKakK'?Kr_aL[L.L|Lv?Min#Nd+NkoRn(SakrSkotSopu$T?Tri#Tur aZan>ZivoZl Zur#2Lo[0}anikD a%D'.LasaL*nNtol#TlaTo^TrZe,3G,%H~Hu+K.KrofonL@>Lim{rL(Mi#Nc'&Ni[rNom{Nul(S#StrX|2Ad(HaH'.OkS!Uv 1I/Ohem0BilCn(D_#Dl [HylaKroL-ulaM@t#Nar/aNoklN$rumNt|NzunSazSkytStTiva%T<#Ty#U/aUdr(Zai#Z-Zol2Am<Av@>KevTvolaZ{Zut(0T _1DrcF]nL!MieN?S{Ta%ZeumZi#nt3Sliv>0Da:B*r!}yt!Da%Dbyt-DhozDobroDpisHlasHn!Hodi+H,d Iv aJedn*Ji$oJm=K]n Kon>Krm LevoMaz!Mluv Nom{rOkoOpakO$roP`!PevnoPln P~Pos+dPr(oRod RubyRy/]S` S-!S+poSt!TolikV@-Vr/Vzd<yZv!3Be}!CkyDa+koDb!DuhGa%H{Ho^J@JprveKlidLib(Mil(MocO/o)On#PokojR(RvSmyslS*l`Tv<UronV.Zvyk+3Co)JakKamKdyKlKte,kTro5C+hHav?M.%RaR-S _Sn(UzeVinyVo)Zd,5DaD+G{T Tn(Trie3Mfa:0AlArv AvaDivEcEhn!Ejm=Ez aHajo[Iln?Jasn J-tK]p La$L-Li[LohaLu^NosOh! Oj-OutRaz>R&Ru[RysSahSluhaS)r!UvVazVin VodVyk+Yv!_Z<0AsElEn Hl` Ho)H,&It~0BojByt}odCiz Ebr!Esl!Evzd!EzvaH`%Hod J{JinudKazK*p LivLu#Ml#Oln(P`PisPl=P<Pu$ Pyk!Raz#S*d StupSunTokTudVahaVe)Vol!V,%tZ&k1I&Sajd1LasNiskoRa^Roz Ryz-2ApEn?Li#NoOuzl OvyRasaResRs-RuhUpantUr#Us 0Ejn.Iz|0AkE+)Ez L`.L*v!LuvaYl0Ehdy1Ak|As-E,%I%Il(Is|O,Oz?RavduRoti1B al}e$rGieL?LojT_0A^}~I#IvoLavaLep Ln L' N'aO[Ol Pa+cT@T,haTu^Ty/Voj 0Epl IskOpRh!Rl(RokRubyV<1A~ArEsLivn O%1Id1Do[:}!_Ci@tD*/H<-KtLan^L>LivoLu[Mf+tMls-N@#Ni#N&N|N$voNtof+Pri#Rke)RodieR)Ru#Ry[Se#Siv aSt_#T@tTro&V*kZnehtZ*r-3C#DagogJs-K]LotonNal)Ndr-NzeRiskopRoStr(Tar^T?Tro+jVn.Xeso3Ani$aHaJav?K+KnikL.Ln(Lul#Nze)Pe)S!_Sto+Tev&Vn?V'ar2A%n)Ak!Am@Ane)A$i#At Avid]AzE/Em@oEn)EsEtivoEv_Iv!N NoO/aOd.Om[OutUkYn2Bav Byt}odC Ctiv>D!D%n Deps!Dh+dDiv Dkl`Dman DnikDo[Dpo,D,zD$!aDvodDzimEzieHan#Hnut#H'<HromaHybIn)Ji$#Jm=Kaz K+sKojKrokKu)KynLedneLib-Lk~LohaLynomMaluMi~Ml#MocM$aMys+tNe/!N<#Nur(P`!P_Pis-Pla/Pros Ps!PudR`%R%RodRu/aRyvS` SedSilaSkokSlan>S*d SpoluS)vaSud-SypTahT#nT+skTom-T,vaTupaTvo,U#zUtoUzdroVahaVidlaVlakVozVr/V$!VykVzde/Zd,vZem-Zn!-Z<Zv!2Ac|Ah<yAkti#A+sAot>Ap<-AseAv^IncipKnoObud O%ntoOdejOfeseOh,Oj-tO]m Omi+Onik!Op`OrokOs[OtonOut-OvazS#v#St@Udk(UtV-Voh<y0An>OvodTruh0Actvo0Ber)}DlKav>Kl.Kr+LtMpaNcP@SaSin#St.T|Ty#3Rami^SkT_::C-}otDia%Dn?DonFtGbyKe)K'.M@oMp*/NdeRa/R aS'&StrTo+$Zan%Zid]3Ag|Ak%CeptDakt<Fer@tF+xJnokKlamaK<dKrutKt<Pu)%VizeVmaVolverZerva3Sk|Ziko5Boti#Dokm@H'#K+KokoMan{oP'odPu/aRejsSolStl.Tmi$rTopedTun^Ub@#U/oUpU,V.Vn?Zb<Z/odZd!Zezn!Zhod%Zin#ZjezdZ#zZ]haZmarZp`Zru/ZsahZtokZumZvod5Bri#}`]Kav?Kopis3BaBol'}l(D]P`]T.Z(:Di$aH!KoM>Mizd!Mo)N #Rdin#San#T_ Z[Z@?0Or0H|1B,n#CeseD`]Dim@tD]Hn!Jm=Ke,K)Kun^KvojeM@oNoRvisS` Sho,SkokSl!St,SuvSyp!T[T.Tk!T~Trv!VerZ&m2O^R~0FonLn?R#Rot-RupTua%1AfandrAliskoAnz@AutEptikIcaL`[L@?LoLuzO[O#nOroRip)RzUp.V(Vr&0Abi#Adid]An.A$Avn(Ed|Ep>EvaEz.IbI&Izn?OnOup-OvoU/UhaUn%Up#Za0A,gdE)&Il$voL*vaOgR`RkRt#Ut-Ysl0AdAhaOb0Bo)}aD'#KolP#TvaUbojUc Ud%UhlasUl`Um,kUp,vaUsedUtokUvis{0Al'&As _IsLavOd-Oj@>OluOnz<Orn(Ou$aR/aU$ 1An^AzD%NaN>Ovn!P@StUb1An?Ar(aAti#Av[EhnoEz#OdolaO+kOpaOrnoOup!Ra/ResRh~RomRu&Ud&Upn?VolYk0Bj-tBtropy}arD(KnoNd!N=Rik!aR'.0AhAl$voEtrAt[Az-Is+It-Obo^Odid]Or#Rab2Kav#KotN-N'>P!Pk(R'(S_T(:B+t#Bu+H*nJemnoJfunJgaJ Jn(Kti#Mh+MponNc|N>NkerPe)V@.Z!_3}ni#HdyKut.LefonMno)Nd@%Ni$aN<P])P&PrveRapieRmos#Xtil3}oSkopisTu+k1Ad+cAn.0Ap#Esk!UkotUpa0El1A+)Pin#PolRzoUhaU+c2Ad?Akt<AmpAsaAverzaEf E$Ez<Hav.Hl.O/uOj?Os#Ou[P%P _Pk(Ub>U/l Uhl?UsV!2DyH~H(Nd,Ri$aR&jZemsko0ArohOr[Rd(Rz2GrKev:0Oh(OzeR!R*s-RusYt'&0HoTiv(0Iv 3R` 1Edn!I$ M=0Az!_Lidn Lon Otv Roj 0I%I)Ov 0Yv`]0Av If<maIk~1Ad~L!n Ly~Out!Rav 1AnAz 0Ed~Il|Mrt N`n N=Oud Tl!Tr~0Ah|K!Lum O~Op@>R*s 1Al Oln Oz'#3D,v ElEn.L.N!:GonL/aL*nNaN^lNil#RanRhanyR|1ElkuHod0Ova0DroGe)%J%Lbl*dL{rhL _LmocLry[Nk'Ran^RzeS_#SkrzeSn?SpoduS)Ter.Ver#3B,%}rDeoh,D.D+LaN?S{Tal aZeZ #0Ezd0L`Us0Aj#AkAs>EvoHk(IvN'#Oup!1Uc|Uk0DaDiv(Doz&kD$voJ@skyJ&JskoLantL[L LnoSk'#Zid]Z'&0Ravo1Ab>A%tAhA)Ba}o+kH!StvaTu+0Ad T*p Tup0Ip4Bav Br!}|D!D,Fot H+d!H~Hod H,d Hub Jasn J{Jm=K]p Kon!L-!Maz!Mez Miz{Mys+tNe/!Nik!Nut P`!Pl! P,v Pu$ Raz R'n!Rv!Sl' SokoS)v Su~Syp!Tas Tes!Tr! Vi~Vol!Vrh_Zdob Zn!0AduBud }op D<Du/Dy/!E$upH+demKazLyk!NikOr-P*,TahT-::993Lofon::Br!Byd+t}|DarmoDus F*k!Hlt Hod H,^Hy~J!>J{Ji$ K+p!K*p Lep Mez Mot!Mys+tNe/!Nik!Pl! Poj Ps!Raz S)v Su~Taj Temn Tk~Ujm=Val Ve+tVin Vol!Vrt!Zvon 0Av RusuUd|Yt-1A+#ArmaAtn(IvoOb RojVihYm`]0L@.ManM.Pt!Z`uZdola2At Lt~Lubo#Ot' Ru[0MaMn?0Emn 0Lam!Oum!R!#Umav#0AtoEh#O[OmO$Ozvyk0Ap|ArAt-IjeIz{Ocn Odr!Rzl.Ut|0AkAl(Am@!Ovu0B,z Tav Ub-Ufa+0Lod Omal RavaR( Rud#Rvu1A^An C`]N (NoOv&Y/l Zav(1I/aR! 0B'.Br0Ed~EnkuEs_aOnR!Uk'odYk";
const checksum$4 = "0x25f44555f4af25b51a711136e1c7d6e50ce9f8917d39d6b1f076b2bb4d2fac1a";
let wordlist$6 = null;
/**
 *  The [[link-bip39-cz]] for [mnemonic phrases](link-bip-39).
 *
 *  @_docloc: api/wordlists
 */
class LangCz extends WordlistOwl {
    /**
     *  Creates a new instance of the Czech language Wordlist.
     *
     *  Using the constructor should be unnecessary, instead use the
     *  [[wordlist]] singleton method.
     *
     *  @_ignore:
     */
    constructor() {
        super("cz", words$4, checksum$4);
    }
    /**
     *  Returns a singleton instance of a ``LangCz``, creating it
     *  if this is the first time being called.
     */
    static wordlist() {
        if (wordlist$6 == null) {
            wordlist$6 = new LangCz();
        }
        return wordlist$6;
    }
}

const Base64 = ")!@#$%^&*(ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
/**
 *  @_ignore
 */
function decodeBits(width, data) {
    const maxValue = (1 << width) - 1;
    const result = [];
    let accum = 0, bits = 0, flood = 0;
    for (let i = 0; i < data.length; i++) {
        // Accumulate 6 bits of data
        accum = (accum << 6) | Base64.indexOf(data[i]);
        bits += 6;
        // While we have enough for a word...
        while (bits >= width) {
            // ...read the word
            const value = accum >> (bits - width);
            accum &= (1 << (bits - width)) - 1;
            bits -= width;
            // A value of 0 indicates we exceeded maxValue, it
            // floods over into the next value
            if (value === 0) {
                flood += maxValue;
            }
            else {
                result.push(value + flood);
                flood = 0;
            }
        }
    }
    return result;
}

/**
 *  @_ignore
 */
function decodeOwlA(data, accents) {
    let words = decodeOwl(data).join(",");
    // Inject the accents
    accents.split(/,/g).forEach((accent) => {
        const match = accent.match(/^([a-z]*)([0-9]+)([0-9])(.*)$/);
        assertArgument(match !== null, "internal error parsing accents", "accents", accents);
        let posOffset = 0;
        const positions = decodeBits(parseInt(match[3]), match[4]);
        const charCode = parseInt(match[2]);
        const regex = new RegExp(`([${match[1]}])`, "g");
        words = words.replace(regex, (all, letter) => {
            const rem = --positions[posOffset];
            if (rem === 0) {
                letter = String.fromCharCode(letter.charCodeAt(0), charCode);
                posOffset++;
            }
            return letter;
        });
    });
    return words.split(",");
}

/**
 *  An OWL-A format Wordlist extends the OWL format to add an
 *  overlay onto an OWL format Wordlist to support diacritic
 *  marks.
 *
 *  This class is generally not useful to most developers as
 *  it is used mainly internally to keep Wordlists for languages
 *  based on latin-1 small.
 *
 *  If necessary, there are tools within the ``generation/`` folder
 *  to create these necessary data.
 */
class WordlistOwlA extends WordlistOwl {
    #accent;
    constructor(locale, data, accent, checksum) {
        super(locale, data, checksum);
        this.#accent = accent;
    }
    get _accent() {
        return this.#accent;
    }
    _decodeWords() {
        return decodeOwlA(this._data, this._accent);
    }
}

const words$3 = "0arertoiotadonoaRteirroenaNonaLsolocoiliaralaorrenadaChoN$n0A>Dom,EjaI!#Oga&O'Or#RazoR*Ue=U<0Ab Adem@Ce<C~Ei)ElgaEn#Ept I&L  NeOg!O<TivoToTrizTu Ud*U!&Us 0Ic#Mit*Opt Or'Ua`Ul#0Reo0Ect Ic~In Irm 0IlIt On@Os#Ot Reg R$UaU&U?aUja0OgoOr+0ReSl 0Ed_zE'Us)1Ac[nAmb_ArmaBaBumCaldeDeaEg_Ej Er%E%F?!GaGo&nIa&I,#Iv$MaMejaMib T TezaTivoToTu[Um'Z 0AbleAn)Apo]ArgoAs B Bi#E'IgoIs%dOrP oPl$0|oC@'C]D D,Em@Gu=Il=ImoIsOt T,aTiguoTojoUalUl Unc$Ad*EjoO1Ag A[#Eti#IoLic O&Or)OyoR,d!Rob Ues%U+1A&A`ArBit+BolBus#|ivoCoD!D?]DuoEaI&IesM.i-esOmaPaP.Reg=RozRugaTeTis%0AA&Al#C,<Egur EoE<rI,#I=Ist*NoOmb+P!oT?]T+Tu#Um*Un#0AjoAqueArEn#EoI>Le%OmoRa!RozUn0DazD$GeLaM,#S,)T^0AlAnceA+EEl]`E`EstruzI.I<2ErU{U'0Af[nArO)Uc Uf_Ul:BaB^|eH@IleJ Lanz/c.LdeMbuN>Nd-oRb(>RnizR+Scu]S#nSu[Tal]T!@T*Tu%UlZ 3BeBid/=S SoSt@3|oEnNgo2An>OqueUsa2ABi`BoCaCi`DaDegaIn//!oLsaMb-{dNi#N}saiRdeRr SqueTeTinVe{Zal2AvoAzoEchaEveIl=In>IsaOcaOmaOnceO)UjaUs>U#2CeoCleE'EyFan{F.HoIt_L#Rbuj(l(+Sc TacaZ.:Bal=BezaBi`B[CaoDav!D,aErFeI{ImanJaJ.LLam Lc$L&Li{dLleLm/^LvoMaMb$Mel=Mi'Mp}c!Nd?Nel-gu+Nic-#N-.ObaOsPazPi%nPo)Pt Puch((b.RcelRe%Rg(i'RneRpe%R+R%SaS>S!oSpaS#rT^ceT_U{lUsaZo3Bol]D!D+Ld/eb_Lo<Lu]M,#Niz-t+Rc(&Rez(oRr R)zaSpedT+2AcalAle>AmpuAnc]ApaAr]I>Is)IvoOqueOzaUle%Up 0Cl.EgoE=EnEr#F[G +M->NeN%P_sR>Rue]SneTaU{d2Am^AnA+AseAveI,)ImaInica2B_Cc~|i'Ci`CoDigoDoF_G!He)JinJoL/ch/eg$Lg Lin/l LmoLum`Mba)M!Mi{Mo&Mpr-deNej}g-oc!Nsej}t PaPi(az.Rba%RchoR&nR.(r!S!SmosS%2AneoAt!E Ec!Ei&EmaIaIm,Ip%IsisOmoOnicaOque%U&Uz2Ad+Ar#At+BoBr*| aEl=En#Er{Es%EvaId Lebr/p/#Mb_Mpl*N-e%O%P.Pul( R$<R<RvaTis:M-z(R&T?3B!B?Ca{C*DoF,saFin*J LfinLga&Li#M^-<N%lP^)RechoR+%Sayu'SeoSf?eSnu&Sti'Sv$TalleT,!U{3AAb=AdemaAman)A`Ar$BujoCt En)E%EzFic?G'Lem/u*N!oRec#Rig*S>Se'Sf[zVaVi'5BleCeL^Ming}N Ra&Rm*R<SSis2Ag.Oga2|aDaE=E'LceOQueR Rez(o:0A'R$0H OUa&r0AdIc~Ific$I#rUc 1Ec#Icaz3EEmp=1Efan)Eg*Em,#Ev IpseI)Ix*Og$Ud*0Bu&It*Oc~Pa)Pe'PleoP_sa0A'C go|ufeC@EmigoE+Fa&F!moGa'Igm/aceOrmeRe&SayoS, T!oTr VaseV$1Oca0Uipo0Izo0Ca]C,aCol Crib*Cu&Enc@F!aFu!zoPa{PejoP@PosaPumaQuiT TeTi=Tufa0ApaEr'Ic-@1Ad*Alu En#It 1Ac#Am,Ce<CusaEn#Ig*Il$Ist*I#P!#Plic P.!T_mo:BricaBu]|a{C?C#rE`J/d/=L<Lt MaM?@Mo<Ra.Rmaci(olRsaSeTigaU`V^X3Br!o|/izORi(ozRt?Rv^Stin3AbleAnzaArB[Cc~|aDeoEb_ElE[Es%Gu[J JoL/e)L@lLt+NNc-g*Ni#Rma2A>Au%EchaOrO%U*UjoU^2B@CaGa%G.L$Lle#N&Rm(+Rtun(z SaTo2Aca<Ag?AnjaAseAudeE*E'EsaIoI#U%2EgoEn)ErzaGaM Nc~Nd(g.R@S?TbolTu+:Ce]FasI%JoL/!i/=Mb- Nch}g-<RajeRzaSoli`St ToV?an3Me=M*NN!}$N)Ran$R,)Rm,S#3Gan)M`s$R Ro2Aci OboOr@2LLfoLo<LpeM(&R?([TaTeoZ 2A{Afi>A'AsaAtisAveIe%Il=IpeIsI#O<rUaUe<UmoUpo2An)ApoArd@Er[IaI'I.I<It [Sa'St :B!B?Bl C!|aD/l Mac(i`ZZa`3B?]B[|oLa&L$Mbr(*Rma'RoeRv*3E=Er+Ga&Gi,eJoM'S#r@5Ci>G Gu!aJaMb_Ng}^Nr((mig('St?Yo5E>ElgaEr%E<EvoI{IrMa'Me&M?deM}d*RacanR#:1O'0EalIomaO=2Lesi/uUal4EgalUs~0Ag,AnIt P P!$P.!Pul<0CapazDiceEr)FielF^meG,$Ic$M,<MuneNa#Sec#S%n)T!esTimoTu*Ut?Vi!'3AIsOn@0L/o):BaliB.M.RabeRdinR[U]Zmin3FeRinga3Ne)5R`d(obaV,Ya5ErgaEvesEzGa&rGoGue)Ic$N>Ngl-$Nt Pit!R S#V,?Zg :7Lo5A]:B$C$C[DoD+nG #GrimaGu`I>M!Mi`Mp --ch-gos%NzaPizRgoRvaStimaTaTexT*U_lV Zo3AlCc~|eC#rErG~Gumb_Ja'Ngu-#NaOnOp &S~TalT[VeY,{3B!%dB+C^D!Di EnzoGaG!oMaMi)M.Mp$NceN&Ne-go)N}t!`Qui&SoS%T!aT$T+2AgaAmaAn#AveEg En Ev Or Ov!Uv@2BoC~CoCu[GicaG+MbrizM}jaTe5|aC*G J}-esPaSt+ToZ:Ce%|oD!aD_Du+Est+F@G@GoIzL{dLe%Ll/oMaMboMutN>N&Nej Ng-iquiNj N}<N%Na`PaQuin(R>Re(f?Rg,Ri&RmolR+nR)sRzoSaSc aSivoT T!@TizTrizXimoY^Z^ca3|aDal]D$Du]J?]J^L,/.M^i-^NsajeN)NuRca&R,gueRi#SS.TaT!To&T+Zc]3E&ElEmb+G/Lag+Lit Ll.M}-!}im}u#OpeR SaS!@S?SmoTadTo5|?aC~DaDe=HoJ LdeL!Li'M,#Mi- c-ed-j-#NoRad(d!Re'R*R+Rs(%lScaStr TivoV!V?Zo5|oD EbleE]Er)Est[G_J!L/e%L%N&Nec(alRoScu=SeoSgoSicaS=:C C~D IpeRanj(izRr SalTalTivoTu[lUseaValVeVi{d3C$Ct G Goc$G+OnRv$ToUt+V V!a3|oDoEb]E#NezNoTi&Vel5Bleza|eMin(i(m()TaTic@Va#Ve]V$5BeCaCleoD?=DoE[EveEzLoM!oTr@:Sis0E<IspoJe#R(!oS!v T,!V$0AA<Ea'H,%HoIoReTavoTub_Ul#Up Urr*0I IoIsea0S)0EnsaEr%Ic$Rec!0Ro1DoR0O1AEa{Fa#IvoLaMoOrVi&0Bligo0DaZa1A>C~E[In On!T TicaUes#1Ac~A&rAlBi%CaD,EjaGa'G@Gul=I,)Ig,Il]OQues%Uga0Ad@Cu+Ez'OT[0O'Ro1EjaU=1I&Ige'0En)0O':C#D_El]Gi`GoIsJ oLabr/>Le%Li&Lm/om/p NNalNi>Nt!-ue=PaPelP?]Que)R Rcel(edR*RoRpa&RqueR[foR)S SeoS~SoS%TaT$Tr@UsaU%VoYa<3A#nCa&C!a|oDalD*G IneL L{'Le/ig+LlejoLoLuc--s N.OnOrPi'Que'R(ch(d!Rez(f?Ri>Rl(mi<R+Rs.aSaScaSimoS%`Ta=T+leoZZu`3C |.EEd[Er`EzaJam/ Lo#Mi,%N}#rNz-aOjoP(a%S Sci`SoS%T.Zca2AcaAnA%AyaAzaEi#E'OmoUmaU[l2B_CoD!D$EmaEs@E%L,Lici/=LvoMa{Me=MoMp-!Rc~R%lSa{Se!SibleS)T,c@T+Zo2A&E>zEgun%Em$EnsaE<Ev$ImoIncipeIs~Iv OaOb Oce<Oduc#OezaOfe<rOg[maOleOmesaOn#Op$OximoUeba2Bli>|!oD^Eb=Er%Es#Lg/*Lm.LpoL<M-#NalNoPaP?(e:99Ed EjaEm Er!E<Ie#ImicaInceIt :Ba'B@BoC~DicalIzMaMp-ch}goPazPi&P#SgoSpaToYoZaZ.3Acc~Ali{dBa'Bo)Ca!Ce%|azoCog!C_oC#Cur<DD.&Duc*FlejoF^maF[nFug$Ga=G*G]G_<H,I'IrJ/a#LevoLieveLle'LojM Med$M}>rNd*N%P #Pet*Po<Pt?SSca)Si`Spe#S#Sum,T*oT^'T[#Un*VesVis%YZ 3CoEgoEn{EsgoFaGi&G^Nc.N.OQuezaSaTmoToZo5BleCeCi D DeoD?]ErJizoJoM!oMp!NN>N{PaP!oSaScaSt+T 5BiB^DoE{G*I&In/e%LoMboM^Ptu[TaTi`:Ba&B!B$BleC GazG[&L/&L!oL*Lm.L.Ls/#LudLv Mb-c~Ndi-e Ng_Ni{dN}#PoQueRdin()nSt_TanU`Xof.3Cc~CoC_#C%DGu*IsL=LvaMa`M?l-d-<rNalN^P  P@Qui(RieRm.Rv*S,%S~TaT,%V!oXoX#3D[Es%E)G=G'Lab/b L,c$L]Mbo=M$R,aS)maT$Tu 5B_C$D$LLap/{&Le{dLi&Lt Luc~Mbr-de}i&No+NrisaPaPl P^)R&Rp_s()oS)nTa'5AveB*Ce<D^Eg[E=E'Er)Fr*Je#L%nM P! Pl*P.!P_moRR>Re'Rg*S#T?:Ba>BiqueB]BuCoC#JoL L>L,#Ll/.Ma'Mb^Ng}quePaPe)P@P.Qu?l(deRe(if(je%RotR+R%TuajeU+ZaZ.3At+|oC]CnicaJa&J!Ji&L/efo'MaM^Mp=NazNd!N!NisN<Ori(api(>Rmi'Rnur(+rSisSo+StigoT!aX#Z3B$Bu+nEmpoEn{Er[E<G_J!/deMb_Mi&M}%OPi>PoR(.TanT!eTu=Za5Al]B?=C Ci'DoG/&M N}#P PeQueRaxR!oRm,%RneoRoRpe&R_R<RtugaSS>S!Xi>2AbajoAc#rA!Afi>AgoAjeAmoAnceA#AumaAz EbolEguaEin%EnEp EsIbuIgoIpaIs)IunfoOfeoOmpaOn>OpaO)OzoU>Ue'Ufa2B!@BoEr#MbaM^NelNic(bin(ismoR'T^:0Ic 9C!a0B[l0I{dIrIv!<OT A3Ba'BeG,)Na0ArU $0IlOp@1A:CaC$Cu`G GoI`J?l/eLi&LleL^Lvu]Mp*oR(i R.So3Ci'C#rHicu=In)JezL/!oLozN-c!Nd-e'Ng N*N%NusRRa'RboRdeRed(j(<Rt!3AAjeBr C$CtimaDaDeoDr$EjoErnesG^LLl-ag_N}e&OlinRalRgoRtudS^Sp!aS%Tami`U&VazV!oV*Vo5LcanLum,Lv!RazT ToZ5E=Lg :::C!Te3GuaM('So9DoGaGur:F*}jaPa#Rza93N(+5MoR&";
const accents$1 = "aeiou7695@@BZWWavwUJkO@Y-Kn))YEGq#E@O)cI@#ZkMHv$e*))M!!)D**$GW!oKm*Acoh^k&It-pi^SYW)$^n!G)bO!Wkzam(jS#X)Og*^l^RW!bQ#QygBKXfzE))hti!Qm)Cng%%c)mJiI*HJWbmYniCLwNdYyY%WKO^bnT$PuGOr!IvHu&G(GKbtBuhiW&!eO@XMeoYQeCa#!MrTJCq!OW&CHG(WCcW%%)$rfrIegu$)w!G)JGmWWw)MnD%SXXWIT^LWAZuVWB^W)eTL^x&$WGHW(nKWEMA)#$F$x$Waekqs,n7715)W*HM-$WAcCiu(a))VCZ)GG%(*CWWdW%$D!UCO$M";
const checksum$3 = "0xf74fb7092aeacdfbf8959557de22098da512207fb9f109cb526994938cf40300";
let wordlist$5 = null;
/**
 *  The [[link-bip39-es]] for [mnemonic phrases](link-bip-39).
 *
 *  @_docloc: api/wordlists
 */
class LangEs extends WordlistOwlA {
    /**
     *  Creates a new instance of the Spanish language Wordlist.
     *
     *  This should be unnecessary most of the time as the exported
     *  [[langEs]] should suffice.
     *
     *  @_ignore:
     */
    constructor() {
        super("es", words$3, accents$1, checksum$3);
    }
    /**
     *  Returns a singleton instance of a ``LangEs``, creating it
     *  if this is the first time being called.
     */
    static wordlist() {
        if (wordlist$5 == null) {
            wordlist$5 = new LangEs();
        }
        return wordlist$5;
    }
}

const words$2 = "0erreleontiteurinueiriet cegeanseali medenel q)eniluxaus ch0Ais}And$Diqu E`#Ol*Ord Ou%rOy RasifReuv Ri,Rog RuptS_-SoluS'@UsifYss=0A@m+AjouAr+nCab]Cep,Clam Cola@Cro~eCu}ErbeHatHe,Idu]I Omp&Qu *R$y?Te'TifT)l0Ep&EquatHesifJec%fJug Mett!M* Op,Or Ouc*Res<RoitUl&V be0R R$ef0Fai!Fec,Fi~eF!{Fub]0Ac Enc I#I,Raf Reab#Ru?1D Gu`#L>Mab#S/-0Ou,Us,1Arm Chim+Er&Geb!G)I_ I?ntLeg Lia.Lou Lum O'd*PagaTes<Veo#0A&'BiguB!Enag Ertu?Id$Ir=Orc O'Ovib#Phib+P#'Us/t0Aly<Apho!Ar~+Atom+C+nE/%rG#Gois<Gu#{Im=Nex N$-N)lOd(Om=+Ony?Orm=T_[Tido&X+{1Ai}Eri%fL/*Olog+Pa!`Pe]Por,Puy 0UariumUeduc0Bit!Bus&De'Doi<G_tLequ(Matu!Me?ntMoi!Mu!P_,Ra~ Riv Ro}S_icT +lTic#0PectPh=&P* S|tS v*S+t&Soc>S' TicotT!Tu-0El>O?RiumRo-Ta^T_%fT* Trap 0Ba(eB .Da-Dib#G' Ro!Tom[Tru~e0A]Anc Ari-En*Er<Eug#Ia&'I@I$I}O(eOu R`1I=Io?:D.Fou Ga.G)t&Igna@L/c Lc$Le(eLisa.Mb(Ncai!Nda.Nl+)Nn>eNqu>Rb>R`R$R^Rra.Ss(S%$Ta`#Te|T,+Udr>Vard 3Let&L>Lo&Nefi-R-|Rg Rl(eRmudaSa-Sog[Ta`Ur!3B $Cyc#Du#JouL/L(g)LlardNai!Olog+Ops+OtypeScuitS$Sto'iTu?Zar!2AfardAg)An~*Ess/tInd OndOqu Ous$2BardB(eI!I}Li@Nb$Nd*Nhe'Nif>NusRdu!R[T&Uc#Ue{Ug+Ul$Uqu(Ur<Usso#U%^Xe'2An~eAs>AveEbisE~eEuva.Ico]Iga@Ill/tIo~eI^O~u!Od Onz Ous<Oye'U?Us^Ut=Uy/t2Ff#Iss$L#%nRe|R(S% T( To*Vab#Vet&:B/$B(eChet&De|D!Fe(eIllouIss$Lcu]Lep(Lib!Lm Lomn+Lvai!Mara@M aMi$Mpag[N=Net$N$N%[NularPab#Por=Pri-Psu#P,Pu~eRab(eRb$eRes}RibouRna.Rot&R!|Rt$Sca@S>S^Ssu!U}U%$V=>V [Viar3D`#Intu!Les&Llu#Ndr>Ns' Ntr=Rc#Rebr=Ri<Rn Rve|S}2Agr(Ai<A#'Amb!An-Apit!Arb$As<'At$Auss$Av* Emi<En`#Equ>Er~ Ev=I_Iff!Ign$Im eIotLoru!OcolatOis*O<O)t&Ro?U&0Ga!Gog[M_,NemaNtr Rcu]R R^T [Toy_Tr$V`2A*$A?'Aqu As<Av>I_tIgn ImatIva.O~eOna.Opor&2B=tBraCas<Co% D Dif>Ff!Gn Hesi$Iff Inc L eLibriLl(eLma,L$elMbatMed+Mm/@MpactNc tNdui!Nf>N.]Nno,Ns$[NtactNvexePa(P+Ra`Rbe|Rda.Rni~eRpusR!ctR&.Smi^Stu?T$U@Upu!Ura.U&|Uvr*Yo&2AbeA(&Ava&Ay$Eatu!Edi,E?{Eu}Evet&Ib]I Ist=I,eOi!Oqu Ota#Uci=UelYp,2Bi^E`l*Il]eIs(eIv!Lm( L%v Mu]Pi@Ra%fR<'3Anu!C#L(d!Ni^:Ign M>Ng N<'Uph(3Batt!Bi,Bord Brid But/tC= Cemb!Ch* Cid Clar Cor Cri!Cup]Da#Duc%fEs<F_sifFi]Fray Gag Givr Glu%rGraf Jeun Li-Log M/d Me' Mol*Ni~ Nou N&l#Nud PartP_}Pha}Plac Po}R/g Rob Sast!S-n&S tSign Sobe*Ss( Str>Ta~ Tes,To' T!s<V/c V_*V( Vo*3Ab#Alog)Am/tC,Ff  G  Git=G[Lu M/~eM(u Oxy@Rec%fRig Scu,Spo}Ssip St/-V %rVi}5Ci#C&'G?IgtMa(eMici#Mp,Na&'Nj$Nn Pam(eRto*Ru!Sa.Se'Ss>Ta%$U/>Ub#U-'U,Y_2Ag$Ap Es}Ibb]Oitu!2P +P#xeRab#Rc*3Nas%e:0Lou*0Ar,HarpeHel#La* Lip<Lo!Lu<O#Onom+Or-Ou,Ra}Rem Riva(RouU?U!u`0If>Uqu 1Fac Fec%fFig+FortFray Fusi$0Ali}Ar 2Ec,1Abor Arg*Ectr$Eg/tEph/tEveIgib#I%s?O.Ucid Ud 0B=]Bell*Bry$Er|@Issi$M_ O%$Ouvo*P e'Ploy Por,Pri<Ulsi$0Cadr Ch eClaveCo~eDigu Dos}DroitDui!Erg+F/-F m Fou*Gag G(Glob Ig?Jamb JeuLev NemiNuye{Ri~*Roba.Seig[Tas}T_d!T>To' Trav Um  Vah*Viab#Voy Zy?0L+n0Aiss*Arg[At/tAu#Ic +I@m+I Ilog)I[Iso@ItapheO^ReuveRouv Uis/t0U !Uipe0Ig Osi$Re'Up%$0C=>Pad$Pe-P+g#Po*PritQuiv Say S_-S+uSor Ti?TomacTra@0Ag eA]An~eA%^E(d!Endo*Er[lH/olHi^Hn+Ir Off Oi#Onn/tO'd*R/.RoitU@0Phor+0Alu Asi$Enta`I@n-I,Olu%fOqu 1ActAg  Auc Cel]Cit/tClusifCu<Ecu,Emp#Erc H= Hor,I.n-I]Is,O%^Ped>Plor Po}Prim QuisT_sifTrai!Ul,:B#Bu#{Cet&Ci#Ctu!Ibl*Lai<Me{M`#R-'RfeluR(eRou~eSc( T=Tig)Uc$U%fVe'Vori3Bri#C$d D  L(M?M'Ndo*Od=Rm Ro-Rve'S%v=U`#Ut!Vr>3AscoCe]C%fDe#Gu!Latu!Leta.L>eL#ulLm LouLtr N/c N*O#R?Ssu!X 2A* Am?As^At&'E|E~eE'Exi$Oc$O!Uctu Ui@Uvi=2L+Nd +Ngib#Nta(eRc Rg $Rmu]Rtu[Ssi#Ud!Ug eU`]Ulu!Urmi2Agi#Ai<An~*App Aye'Ega&E( El$Em*E[s+E!Iab#Ic%$Iss$Ivo#OidOma.Ont=Ot,Uit2Gi%fI&Re'R+{R%fSi$T':Gn Lax+L +Mbad R/%rRd+nRn*Rrig)Zel#Z$3AntLa%[Lu#Ndar?N =N+NouN%lOlog+O?t!R/iumR?St)lY}3B>C]RafeV!2A-AiveIs}ObeOi!Or+{2Lfe'M?Nf]R.R`#Udr$Uff!UlotUp`#Urm/dUt&2Ad)lAffi%A(eAndApp(AtuitAv*EnatIffu!Il]Imp Ogn Ond Ot&OupeUg U% Uy e2EpardErr>I@Im|veIta!Sta%f3Mnas&Rostat:Bitu@Cho*L&Me|NgarN[t$RicotRm$+Rp$Sard3LiumMato?RbeRiss$Rm(eR$Si,U!{3B n BouLar/tStoi!V 5MardMma.Mo.[N['Nor N&{R@Riz$Rlo.Rm$eRrib#U#{Us<5BlotI#{Ma(Mb#Mi@Mo'R]3Dro?lG+[M[Pno<:2Yl#2Nor U/e4Lici&Lusi$0A.Bib I,M_<Mobi#Muab#PactP i=Plor Po}Prim Pu,0Carn C_d+Ci@ntCl( Colo!Dex Di-Duc%fEditEp%eExactF(iFlig Form Fusi$G  H= Hib Jec,Ju!No-ntOcu]Ond Scri!Sec&Sig[Soli&Sp* S%nctSul,TactT_<Ti?Trig)Tui%fU%#Vasi$V_,Vi,Voqu 3Oni^Rad>ReelRi,0O]2Oi!Res<:GuarIll*MbeNv>Rd(Ug U[Velot3Tab#T$UdiU[s<9Ind!N~ Ng]Ue'UissifUrn=Vi=Y|Ye{5Bi]Ge?ntNiorP$Ris&S%-Te{V_i#:Yak7M$oOs^:BelBi=Bo' C  Cto<Gu[I[Is}I% Mbe|Mel#MpeN-'Nga.N,[P(R.'R?Ur>VaboVo*3Ctu!G=G Gu?SsiveTt!V>Xi^Zard3As<B  B!C_-Cor[E.Ev!Gatu!Go,G)M Mi&M$a@Mpi@Neai!NgotOn-|Qui@S>eS,ThiumTi.Ttor=V!'5Gi^Inta(Is*MbricT +U UrdUt!UveY=5B+Ci@Cra%fE'Gub!Is/tM>eNai!NdiR$T,X){:Ch(eGas(G_taGi^Ig!Ill$In%_Ir+Is$Jor Lax Lefi-Lhe'Li-L#t&MmouthNda,Niab#Nqu/tN&|N)lRath$Rb!R~/dRdiRi%?R^'Rr$R&]Scot&SsifT +lT>eTra^Udi!Ussa@UveXim=3Ch/tC$nuDa`#Dec(Di,Du<Il#'L/.Lod+Mb!Moi!Nac N Nh*Ns$.NtorRc!diRi&R#Ssag Su!T=Teo!Tho@T>Ub#3Au]CrobeEt&Gn$Gr L+uLli$Mi^N-N =Nim=Nor Nu&Rac#Roi,Ssi#X&5Bi#D [El#{Ndi=Ni&'Nna+Not$eNst!Ntag[Nu?ntQ)'R-|Rsu!R% Te'TifU~eUf#Ul(Uss$Ut$Uv/t5L%p#Ni%$Ra`#Re[Rmu!Sc#SeumSic+nTa%$T T)l3Ria@R%l#S,eThi^:Ge'PpeRquoisRr Ta%$Ti$Tu!Ufra.U%^Vi!3Bu#{CtarFas&Ga%$Glig Goc>I.Rve{Ttoy Ur$eUtr$Veu3CheCkelTra&Ve|5B#CifCt'[Ir-'I<t&Ma@Mb!{Mm Rma%fTab#Tif>Toi!Urr*Uve|Va&'Vemb!Vi-5A.Anc I!Isib#M oP%=Q)Tri%f:0E*Jec%fLig Sc'S v Stac#T_*T' 0Casi$Cup E/Tob!Troy Tup]Ulai!0E'Or/t1F_}Fic>Fr*0Ive1Se|S`l$2Fac%fIv>0Bra.Ett!0Ct){Du]E!{Iri^1A#A^Er Ini$PortunPrim T Ti^1A.{An.Bi&D$n E`#G/eG)`Ifi-Ne?ntQ)T+0C`]Mo<Satu!0Ar+0Rag/Rs$T`Trag Vra.0A%$1Y@Y.[1O[:Isib#La-Lma!sLo'@Lp Na~eNdaNgol(Niqu N[|NoramaNt=$PayeP>Po,PyrusRadoxeR-l#Res<Rfum R]Ro#Rra(R<m Rtag Ru!Rv_*Ssi$S&^T [lT+n-Tr$V`l$Voi}Y Ysa.3Ig[Int!La.Lic/L#Lou<Lu~eNdu#Netr Nib#NsifN'+Pi&PlumRdrixRfor Rio@Rmu,Rp#xeRs`R&S Ta#TitTr*Up#2Ara$Ob+O^Ot$Ra<Ysi^0AnoCt'=E-Er!Euv!Lo&N-|Pet&Qu Rog)Sc(eSt$Vo,XelZza2AcardAf$dAis*An A^Astr$A&|E' ExusIa.OmbOng U+Uma.2Chet&Es+E&In&Ir>Iss$Iv!Lai!Lic>L#nLyg$eMma@Mp>Nct)lNd  NeyR%^Si%$S<d Stu!Tag Te|Ti$U-Ula(Um$Urp!Uss(Uvo*2A*+A%^Ec+{Edi!EfixeElu@EnomE<n-E&x&Evo*Imi%fIn-Is$Iv Ob#?O-d Odi.Of$dOg!sO+Oje,Olog)O?n Op!Osp eO&g O)s<Ov beU@n-U[|0Y~o<1BlicC $I}LpeLsarNai<Ni%fPit!Rif>Zz#3Rami@:99AsarE!l#Es%$Ietu@It,O%_t:C(eC$,D+{G$d(I@'Is(L_%rLl$.Mas}Pi@Sa.Tis}Vag V(Y$n 3Ac%fAg*Ali}Anim Cevo*Ci,Clam Col,Cru,Cu]Cyc]Dig Dou,Fai!F#xeForm Fra(Fu.G=+nGi$Gla.Gul>I, Je,Jou La%fLev L+fMar^Me@Mi<M$,Mpl*Mu NardNfortNif]N$c Ntr NvoiPl>Por,Pri<P%#Qu(S veS(e{Soud!SpectS,SultatTabl*T_*Ticu#Tomb Trac Uni$Uss*V/~eViv!Vol&Vulsif3Ches<De|E'Gi@Go]Nc Pos,Sib#S^T)lV=V>e5Che{M/-Mp!N-Nd(Se|S>Ta%fTorTu#U.U`#U#|U%[Y|?5B/BisCheEl#G){In Is<|S S%^3Th?:B]Bo,B!Co~eFariGes<Is*La@LiveL$Lu MediNc%$Ngl>Rcas?Rd(eT' Ug!nuUm$U,Uva.V/tV$n 1AlpelAnda#E]atEnarioEpt!HemaI_-Ind O!Ru%nUlp,1An-Cab#Ch Cou C!,Da%fDui!Ig['Jo'Lec%fMa(eMb]M_-M(=Na&'Nsib#N&n-Par Q)n-Re(R.ntR+{Rru!RumRvi-Sa?V*Vra.Xtup#3D =Ec#Eg Ff]G#Gn=L_-LiciumMp#Nc eNist!Ph$RopSmi^Tu 1I 3Ci=C#DiumIg[{LdatLe`Litu@Lub#Mb!M?`Mno]N@N.'N[t&No!Rc>R%rS+T%<Uc+{Udu!Uff#U#v UpapeUr-U%r Uv_*0Ac+{A%=Eci=H eIr=3Ab#A%$ErnumImulusIpu]RictUd+{Upe'Ylis&0Bli?BstratB%lBv_*C-sC!FfixeGg  Ive'Lfa&P bePpl>Rfa-Rica&R?n Rpri<Rs|tRv+Spect3LlabeMbo#Metr+Nap<NtaxeS&?:BacBl>C%#Il]L_tLism/L$n Mbo'Mi}Ngib#PisQu( Rd RifR%[S<TamiToua.UpeU!|X 3Mo(Mpo!lNa`#Nd!Ne'N*Nsi$Rm( R[Rrib#T(eX&2E?Eor+Erap+Orax0BiaE@Mi@Reli!Ro*SsuT/eT!Tub 5Bogg/L /tMa&Ni^N[|P$y?R~eRd!Rna@Rp`#R!ntR<Rt)TemU~ Urna.Us}X(e2Ac%$AficAgi^Ah*A(An~ Ava`Ef#Emp EsorEu`Ia.Ibun=Ico,Ilog+IompheIp]It' Ivi=Omb$eOncOpic=Oupe|2I#LipeMul&N[lRb(eTe'Toy Y|3Mp/Ph$Pi^R/:0Ues^9Ti?Tras$1Ani?If>I$I^Itai!Iv s3AniumBa(Tic/t0A.I[UelU!0I#Op+:Car?Cc(Gab$dG)Ill/tInc!Is<|Lab#Li<Ll$LveMpi!N`#Pe'R>Se{Ss=S&3C&'Det&Get=Hicu#InardLo-Nd!diN  Ng Ni?{Ntou<Rdu!R(Rn*RrouR}RtuSt$T /Tus&X/tX 3AducAn@Ctoi!D/.DeoG[t&G)'La(Lla.Naig!Ol$P eRe?ntRtuo<RusSa.Se'Si$S^{S)lT=Tes<Tico#Tr(eVa-Vipa!5Ca%$Gu I#Is(Itu!La`#Lc/L%g Lu?Ra-R&xT Ulo*Ya.Yel#:G$:3N$:Cht:3B!NithS&9Olog+";
const accents = "e7693&)U*o&)Ry^)*)W))))#X^))))@@)#Wf)m%)#!))AG)&IIAQIIIBIIHJNAgBIILIDJGo)))HIQIIIIA(IGgJHH(BIIxX#)Ou)@*IAAPIIIJHQJ)&QIQPYI(HYAQC%)!))QHJJ@)#)^f*^AXCJ))$%CP))%&m)u)@e^A#G#))W@!(IKK%!(I%))O@QA))@GG#e))))WHJIWh))my@IIBT^)!)HAYGETHI*))!QnUDG)))nBoKAC*HwyQh))$&)G&)UGO)G)))(BX#v**)%O,e7686)I))@)&)gdMP()))ud)p#L))I^FIHYdWG))D@DFV)QA)o%MyTh%*)Z)%)n(XANc^R)YS";
const checksum$2 = "0x51deb7ae009149dc61a6bd18a918eb7ac78d2775726c68e598b92d002519b045";
let wordlist$4 = null;
/**
 *  The [[link-bip39-fr]] for [mnemonic phrases](link-bip-39).
 *
 *  @_docloc: api/wordlists
 */
class LangFr extends WordlistOwlA {
    /**
     *  Creates a new instance of the French language Wordlist.
     *
     *  This should be unnecessary most of the time as the exported
     *  [[langFr]] should suffice.
     *
     *  @_ignore:
     */
    constructor() {
        super("fr", words$2, accents, checksum$2);
    }
    /**
     *  Returns a singleton instance of a ``LangFr``, creating it
     *  if this is the first time being called.
     */
    static wordlist() {
        if (wordlist$4 == null) {
            wordlist$4 = new LangFr();
        }
        return wordlist$4;
    }
}

const data$2 = [
    // 4-kana words
    "AQRASRAGBAGUAIRAHBAghAURAdBAdcAnoAMEAFBAFCBKFBQRBSFBCXBCDBCHBGFBEQBpBBpQBIkBHNBeOBgFBVCBhBBhNBmOBmRBiHBiFBUFBZDBvFBsXBkFBlcBjYBwDBMBBTBBTRBWBBWXXaQXaRXQWXSRXCFXYBXpHXOQXHRXhRXuRXmXXbRXlXXwDXTRXrCXWQXWGaBWaKcaYgasFadQalmaMBacAKaRKKBKKXKKjKQRKDRKCYKCRKIDKeVKHcKlXKjHKrYNAHNBWNaRNKcNIBNIONmXNsXNdXNnBNMBNRBNrXNWDNWMNFOQABQAHQBrQXBQXFQaRQKXQKDQKOQKFQNBQNDQQgQCXQCDQGBQGDQGdQYXQpBQpQQpHQLXQHuQgBQhBQhCQuFQmXQiDQUFQZDQsFQdRQkHQbRQlOQlmQPDQjDQwXQMBQMDQcFQTBQTHQrDDXQDNFDGBDGQDGRDpFDhFDmXDZXDbRDMYDRdDTRDrXSAhSBCSBrSGQSEQSHBSVRShYShkSyQSuFSiBSdcSoESocSlmSMBSFBSFKSFNSFdSFcCByCaRCKcCSBCSRCCrCGbCEHCYXCpBCpQCIBCIHCeNCgBCgFCVECVcCmkCmwCZXCZFCdRClOClmClFCjDCjdCnXCwBCwXCcRCFQCFjGXhGNhGDEGDMGCDGCHGIFGgBGVXGVEGVRGmXGsXGdYGoSGbRGnXGwXGwDGWRGFNGFLGFOGFdGFkEABEBDEBFEXOEaBEKSENBENDEYXEIgEIkEgBEgQEgHEhFEudEuFEiBEiHEiFEZDEvBEsXEsFEdXEdREkFEbBEbRElFEPCEfkEFNYAEYAhYBNYQdYDXYSRYCEYYoYgQYgRYuRYmCYZTYdBYbEYlXYjQYRbYWRpKXpQopQnpSFpCXpIBpISphNpdBpdRpbRpcZpFBpFNpFDpFopFrLADLBuLXQLXcLaFLCXLEhLpBLpFLHXLeVLhILdHLdRLoDLbRLrXIABIBQIBCIBsIBoIBMIBRIXaIaRIKYIKRINBINuICDIGBIIDIIkIgRIxFIyQIiHIdRIbYIbRIlHIwRIMYIcRIRVITRIFBIFNIFQOABOAFOBQOaFONBONMOQFOSFOCDOGBOEQOpBOLXOIBOIFOgQOgFOyQOycOmXOsXOdIOkHOMEOMkOWWHBNHXNHXWHNXHDuHDRHSuHSRHHoHhkHmRHdRHkQHlcHlRHwBHWcgAEgAggAkgBNgBQgBEgXOgYcgLXgHjgyQgiBgsFgdagMYgWSgFQgFEVBTVXEVKBVKNVKDVKYVKRVNBVNYVDBVDxVSBVSRVCjVGNVLXVIFVhBVhcVsXVdRVbRVlRhBYhKYhDYhGShxWhmNhdahdkhbRhjohMXhTRxAXxXSxKBxNBxEQxeNxeQxhXxsFxdbxlHxjcxFBxFNxFQxFOxFoyNYyYoybcyMYuBQuBRuBruDMuCouHBudQukkuoBulVuMXuFEmCYmCRmpRmeDmiMmjdmTFmFQiADiBOiaRiKRiNBiNRiSFiGkiGFiERipRiLFiIFihYibHijBijEiMXiWBiFBiFCUBQUXFUaRUNDUNcUNRUNFUDBUSHUCDUGBUGFUEqULNULoUIRUeEUeYUgBUhFUuRUiFUsXUdFUkHUbBUjSUjYUwXUMDUcHURdUTBUrBUrXUrQZAFZXZZaRZKFZNBZQFZCXZGBZYdZpBZLDZIFZHXZHNZeQZVRZVFZmXZiBZvFZdFZkFZbHZbFZwXZcCZcRZRBvBQvBGvBLvBWvCovMYsAFsBDsaRsKFsNFsDrsSHsSFsCXsCRsEBsEHsEfspBsLBsLDsIgsIRseGsbRsFBsFQsFSdNBdSRdCVdGHdYDdHcdVbdySduDdsXdlRdwXdWYdWcdWRkBMkXOkaRkNIkNFkSFkCFkYBkpRkeNkgBkhVkmXksFklVkMBkWDkFNoBNoaQoaFoNBoNXoNaoNEoSRoEroYXoYCoYbopRopFomXojkowXorFbBEbEIbdBbjYlaRlDElMXlFDjKjjSRjGBjYBjYkjpRjLXjIBjOFjeVjbRjwBnXQnSHnpFnLXnINnMBnTRwXBwXNwXYwNFwQFwSBwGFwLXwLDweNwgBwuHwjDwnXMBXMpFMIBMeNMTHcaQcNBcDHcSFcCXcpBcLXcLDcgFcuFcnXcwXccDcTQcrFTQErXNrCHrpFrgFrbFrTHrFcWNYWNbWEHWMXWTR",
    // 5-kana words
    "ABGHABIJAEAVAYJQALZJAIaRAHNXAHdcAHbRAZJMAZJRAZTRAdVJAklmAbcNAjdRAMnRAMWYAWpRAWgRAFgBAFhBAFdcBNJBBNJDBQKBBQhcBQlmBDEJBYJkBYJTBpNBBpJFBIJBBIJDBIcABOKXBOEJBOVJBOiJBOZJBepBBeLXBeIFBegBBgGJBVJXBuocBiJRBUJQBlXVBlITBwNFBMYVBcqXBTlmBWNFBWiJBWnRBFGHBFwXXKGJXNJBXNZJXDTTXSHSXSVRXSlHXCJDXGQJXEhXXYQJXYbRXOfXXeNcXVJFXhQJXhEJXdTRXjdXXMhBXcQTXRGBXTEBXTnQXFCXXFOFXFgFaBaFaBNJaBCJaBpBaBwXaNJKaNJDaQIBaDpRaEPDaHMFamDJalEJaMZJaFaFaFNBaFQJaFLDaFVHKBCYKBEBKBHDKXaFKXGdKXEJKXpHKXIBKXZDKXwXKKwLKNacKNYJKNJoKNWcKDGdKDTRKChXKGaRKGhBKGbRKEBTKEaRKEPTKLMDKLWRKOHDKVJcKdBcKlIBKlOPKFSBKFEPKFpFNBNJNJBQNBGHNBEPNBHXNBgFNBVXNBZDNBsXNBwXNNaRNNJDNNJENNJkNDCJNDVDNGJRNJiDNZJNNsCJNJFNNFSBNFCXNFEPNFLXNFIFQJBFQCaRQJEQQLJDQLJFQIaRQOqXQHaFQHHQQVJXQVJDQhNJQmEIQZJFQsJXQJrFQWbRDJABDBYJDXNFDXCXDXLXDXZDDXsJDQqXDSJFDJCXDEPkDEqXDYmQDpSJDOCkDOGQDHEIDVJDDuDuDWEBDJFgSBNDSBSFSBGHSBIBSBTQSKVYSJQNSJQiSJCXSEqXSJYVSIiJSOMYSHAHSHaQSeCFSepQSegBSHdHSHrFShSJSJuHSJUFSkNRSrSrSWEBSFaHSJFQSFCXSFGDSFYXSFODSFgBSFVXSFhBSFxFSFkFSFbBSFMFCADdCJXBCXaFCXKFCXNFCXCXCXGBCXEJCXYBCXLDCXIBCXOPCXHXCXgBCXhBCXiBCXlDCXcHCJNBCJNFCDCJCDGBCDVXCDhBCDiDCDJdCCmNCpJFCIaRCOqXCHCHCHZJCViJCuCuCmddCJiFCdNBCdHhClEJCnUJCreSCWlgCWTRCFBFCFNBCFYBCFVFCFhFCFdSCFTBCFWDGBNBGBQFGJBCGBEqGBpBGBgQGNBEGNJYGNkOGNJRGDUFGJpQGHaBGJeNGJeEGVBlGVKjGiJDGvJHGsVJGkEBGMIJGWjNGFBFGFCXGFGBGFYXGFpBGFMFEASJEAWpEJNFECJVEIXSEIQJEOqXEOcFEeNcEHEJEHlFEJgFEhlmEmDJEmZJEiMBEUqXEoSREPBFEPXFEPKFEPSFEPEFEPpFEPLXEPIBEJPdEPcFEPTBEJnXEqlHEMpREFCXEFODEFcFYASJYJAFYBaBYBVXYXpFYDhBYCJBYJGFYYbRYeNcYJeVYiIJYZJcYvJgYvJRYJsXYsJFYMYMYreVpBNHpBEJpBwXpQxFpYEJpeNDpJeDpeSFpeCHpHUJpHbBpHcHpmUJpiiJpUJrpsJuplITpFaBpFQqpFGBpFEfpFYBpFpBpFLJpFIDpFgBpFVXpFyQpFuFpFlFpFjDpFnXpFwXpJFMpFTBLXCJLXEFLXhFLXUJLXbFLalmLNJBLSJQLCLCLGJBLLDJLHaFLeNFLeSHLeCXLepFLhaRLZsJLsJDLsJrLocaLlLlLMdbLFNBLFSBLFEHLFkFIBBFIBXFIBaQIBKXIBSFIBpHIBLXIBgBIBhBIBuHIBmXIBiFIBZXIBvFIBbFIBjQIBwXIBWFIKTRIQUJIDGFICjQIYSRIINXIJeCIVaRImEkIZJFIvJRIsJXIdCJIJoRIbBQIjYBIcqXITFVIreVIFKFIFSFIFCJIFGFIFLDIFIBIJFOIFgBIFVXIJFhIFxFIFmXIFdHIFbBIJFrIJFWOBGBOQfXOOKjOUqXOfXBOqXEOcqXORVJOFIBOFlDHBIOHXiFHNTRHCJXHIaRHHJDHHEJHVbRHZJYHbIBHRsJHRkDHWlmgBKFgBSBgBCDgBGHgBpBgBIBgBVJgBuBgBvFgKDTgQVXgDUJgGSJgOqXgmUMgZIJgTUJgWIEgFBFgFNBgFDJgFSFgFGBgFYXgJFOgFgQgFVXgFhBgFbHgJFWVJABVQKcVDgFVOfXVeDFVhaRVmGdViJYVMaRVFNHhBNDhBCXhBEqhBpFhBLXhNJBhSJRheVXhhKEhxlmhZIJhdBQhkIJhbMNhMUJhMZJxNJgxQUJxDEkxDdFxSJRxplmxeSBxeCXxeGFxeYXxepQxegBxWVcxFEQxFLXxFIBxFgBxFxDxFZtxFdcxFbBxFwXyDJXyDlcuASJuDJpuDIBuCpJuGSJuIJFueEFuZIJusJXudWEuoIBuWGJuFBcuFKEuFNFuFQFuFDJuFGJuFVJuFUtuFdHuFTBmBYJmNJYmQhkmLJDmLJomIdXmiJYmvJRmsJRmklmmMBymMuCmclmmcnQiJABiJBNiJBDiBSFiBCJiBEFiBYBiBpFiBLXiBTHiJNciDEfiCZJiECJiJEqiOkHiHKFieNDiHJQieQcieDHieSFieCXieGFieEFieIHiegFihUJixNoioNXiFaBiFKFiFNDiFEPiFYXitFOitFHiFgBiFVEiFmXiFitiFbBiFMFiFrFUCXQUIoQUIJcUHQJUeCEUHwXUUJDUUqXUdWcUcqXUrnQUFNDUFSHUFCFUFEfUFLXUtFOZBXOZXSBZXpFZXVXZEQJZEJkZpDJZOqXZeNHZeCDZUqXZFBQZFEHZFLXvBAFvBKFvBCXvBEPvBpHvBIDvBgFvBuHvQNJvFNFvFGBvFIBvJFcsXCDsXLXsXsXsXlFsXcHsQqXsJQFsEqXseIFsFEHsFjDdBxOdNpRdNJRdEJbdpJRdhZJdnSJdrjNdFNJdFQHdFhNkNJDkYaRkHNRkHSRkVbRkuMRkjSJkcqDoSJFoEiJoYZJoOfXohEBoMGQocqXbBAFbBXFbBaFbBNDbBGBbBLXbBTBbBWDbGJYbIJHbFQqbFpQlDgQlOrFlVJRjGEBjZJRnXvJnXbBnEfHnOPDngJRnxfXnUJWwXEJwNpJwDpBwEfXwrEBMDCJMDGHMDIJMLJDcQGDcQpHcqXccqNFcqCXcFCJRBSBRBGBRBEJRBpQTBNFTBQJTBpBTBVXTFABTFSBTFCFTFGBTFMDrXCJrXLDrDNJrEfHrFQJrFitWNjdWNTR",
    // 6-kana words
    "AKLJMANOPFASNJIAEJWXAYJNRAIIbRAIcdaAeEfDAgidRAdjNYAMYEJAMIbRAFNJBAFpJFBBIJYBDZJFBSiJhBGdEBBEJfXBEJqXBEJWRBpaUJBLXrXBIYJMBOcfXBeEfFBestXBjNJRBcDJOBFEqXXNvJRXDMBhXCJNYXOAWpXONJWXHDEBXeIaRXhYJDXZJSJXMDJOXcASJXFVJXaBQqXaBZJFasXdQaFSJQaFEfXaFpJHaFOqXKBNSRKXvJBKQJhXKEJQJKEJGFKINJBKIJjNKgJNSKVElmKVhEBKiJGFKlBgJKjnUJKwsJYKMFIJKFNJDKFIJFKFOfXNJBSFNJBCXNBpJFNJBvQNJBMBNJLJXNJOqXNJeCXNJeGFNdsJCNbTKFNwXUJQNFEPQDiJcQDMSJQSFpBQGMQJQJeOcQyCJEQUJEBQJFBrQFEJqDXDJFDJXpBDJXIMDGiJhDIJGRDJeYcDHrDJDVXgFDkAWpDkIgRDjDEqDMvJRDJFNFDJFIBSKclmSJQOFSJQVHSJQjDSJGJBSJGJFSECJoSHEJqSJHTBSJVJDSViJYSZJNBSJsJDSFSJFSFEfXSJFLXCBUJVCJXSBCJXpBCXVJXCJXsXCJXdFCJNJHCLIJgCHiJFCVNJMChCJhCUHEJCsJTRCJdYcCoQJCCFEfXCFIJgCFUJxCFstFGJBaQGJBIDGQJqXGYJNRGJHKFGeQqDGHEJFGJeLXGHIiJGHdBlGUJEBGkIJTGFQPDGJFEqEAGegEJIJBEJVJXEhQJTEiJNcEJZJFEJoEqEjDEqEPDsXEPGJBEPOqXEPeQFEfDiDEJfEFEfepQEfMiJEqXNBEqDIDEqeSFEqVJXEMvJRYXNJDYXEJHYKVJcYYJEBYJeEcYJUqXYFpJFYFstXpAZJMpBSJFpNBNFpeQPDpHLJDpHIJFpHgJFpeitFpHZJFpJFADpFSJFpJFCJpFOqXpFitBpJFZJLXIJFLIJgRLVNJWLVHJMLwNpJLFGJBLFLJDLFOqXLJFUJIBDJXIBGJBIJBYQIJBIBIBOqXIBcqDIEGJFILNJTIIJEBIOiJhIJeNBIJeIBIhiJIIWoTRIJFAHIJFpBIJFuHIFUtFIJFTHOSBYJOEcqXOHEJqOvBpFOkVJrObBVJOncqDOcNJkHhNJRHuHJuHdMhBgBUqXgBsJXgONJBgHNJDgHHJQgJeitgHsJXgJyNagyDJBgZJDrgsVJQgkEJNgkjSJgJFAHgFCJDgFZtMVJXNFVXQfXVJXDJVXoQJVQVJQVDEfXVDvJHVEqNFVeQfXVHpJFVHxfXVVJSRVVmaRVlIJOhCXVJhHjYkhxCJVhWVUJhWiJcxBNJIxeEqDxfXBFxcFEPxFSJFxFYJXyBDQJydaUJyFOPDuYCJYuLvJRuHLJXuZJLDuFOPDuFZJHuFcqXmKHJdmCQJcmOsVJiJAGFitLCFieOfXiestXiZJMEikNJQirXzFiFQqXiFIJFiFZJFiFvtFUHpJFUteIcUteOcUVCJkUhdHcUbEJEUJqXQUMNJhURjYkUFitFZDGJHZJIxDZJVJXZJFDJZJFpQvBNJBvBSJFvJxBrseQqDsVFVJdFLJDkEJNBkmNJYkFLJDoQJOPoGsJRoEAHBoEJfFbBQqDbBZJHbFVJXlFIJBjYIrXjeitcjjCEBjWMNBwXQfXwXOaFwDsJXwCJTRwrCZJMDNJQcDDJFcqDOPRYiJFTBsJXTQIJBTFEfXTFLJDrXEJFrEJXMrFZJFWEJdEWYTlm",
    // 7-kana words
    "ABCDEFACNJTRAMBDJdAcNJVXBLNJEBXSIdWRXErNJkXYDJMBXZJCJaXMNJaYKKVJKcKDEJqXKDcNJhKVJrNYKbgJVXKFVJSBNBYBwDNJeQfXNJeEqXNhGJWENJFiJRQlIJbEQJfXxDQqXcfXQFNDEJQFwXUJDYcnUJDJIBgQDIUJTRDJFEqDSJQSJFSJQIJFSOPeZtSJFZJHCJXQfXCTDEqFGJBSJFGJBOfXGJBcqXGJHNJDGJRLiJEJfXEqEJFEJPEFpBEJYJBZJFYBwXUJYiJMEBYJZJyTYTONJXpQMFXFpeGIDdpJFstXpJFcPDLBVSJRLHQJqXLJFZJFIJBNJDIJBUqXIBkFDJIJEJPTIYJGWRIJeQPDIJeEfHIJFsJXOqGDSFHXEJqXgJCsJCgGQJqXgdQYJEgFMFNBgJFcqDVJwXUJVJFZJchIgJCCxOEJqXxOwXUJyDJBVRuscisciJBiJBieUtqXiJFDJkiFsJXQUGEZJcUJFsJXZtXIrXZDZJDrZJFNJDZJFstXvJFQqXvJFCJEsJXQJqkhkNGBbDJdTRbYJMEBlDwXUJMEFiJFcfXNJDRcNJWMTBLJXC",
    // 8-kana words
    "BraFUtHBFSJFdbNBLJXVJQoYJNEBSJBEJfHSJHwXUJCJdAZJMGjaFVJXEJPNJBlEJfFiJFpFbFEJqIJBVJCrIBdHiJhOPFChvJVJZJNJWxGFNIFLueIBQJqUHEJfUFstOZJDrlXEASJRlXVJXSFwVJNJWD",
    // 9-kana words
    "QJEJNNJDQJEJIBSFQJEJxegBQJEJfHEPSJBmXEJFSJCDEJqXLXNJFQqXIcQsFNJFIFEJqXUJgFsJXIJBUJEJfHNFvJxEqXNJnXUJFQqD",
    // 10-kana words
    "IJBEJqXZJ",
];
// Maps each character into its kana value (the index)
const mapping = "~~AzB~X~a~KN~Q~D~S~C~G~E~Y~p~L~I~O~eH~g~V~hxyumi~~U~~Z~~v~~s~~dkoblPjfnqwMcRTr~W~~~F~~~~~Jt";
let _wordlist$2 = null;
function hex(word) {
    return hexlify(toUtf8Bytes(word));
}
const KiYoKu = "0xe3818de38284e3818f";
const KyoKu = "0xe3818de38283e3818f";
function toString(data) {
    return toUtf8String(new Uint8Array(data));
}
function loadWords$2() {
    if (_wordlist$2 !== null) {
        return _wordlist$2;
    }
    const wordlist = [];
    // Transforms for normalizing (sort is a not quite UTF-8)
    const transform = {};
    // Delete the diacritic marks
    transform[toString([227, 130, 154])] = false;
    transform[toString([227, 130, 153])] = false;
    // Some simple transforms that sort out most of the order
    transform[toString([227, 130, 133])] = toString([227, 130, 134]);
    transform[toString([227, 129, 163])] = toString([227, 129, 164]);
    transform[toString([227, 130, 131])] = toString([227, 130, 132]);
    transform[toString([227, 130, 135])] = toString([227, 130, 136]);
    // Normalize words using the transform
    function normalize(word) {
        let result = "";
        for (let i = 0; i < word.length; i++) {
            let kana = word[i];
            const target = transform[kana];
            if (target === false) {
                continue;
            }
            if (target) {
                kana = target;
            }
            result += kana;
        }
        return result;
    }
    // Sort how the Japanese list is sorted
    function sortJapanese(a, b) {
        a = normalize(a);
        b = normalize(b);
        if (a < b) {
            return -1;
        }
        if (a > b) {
            return 1;
        }
        return 0;
    }
    // Load all the words
    for (let length = 3; length <= 9; length++) {
        const d = data$2[length - 3];
        for (let offset = 0; offset < d.length; offset += length) {
            const word = [];
            for (let i = 0; i < length; i++) {
                const k = mapping.indexOf(d[offset + i]);
                word.push(227);
                word.push(k & 0x40 ? 130 : 129);
                word.push((k & 0x3f) + 128);
            }
            wordlist.push(toString(word));
        }
    }
    wordlist.sort(sortJapanese);
    // For some reason kyoku and kiyoku are flipped in node (!!).
    // The order SHOULD be:
    //   - kyoku
    //   - kiyoku
    // This should ignore "if", but that doesn't work here??
    /* c8 ignore start */
    if (hex(wordlist[442]) === KiYoKu && hex(wordlist[443]) === KyoKu) {
        const tmp = wordlist[442];
        wordlist[442] = wordlist[443];
        wordlist[443] = tmp;
    }
    /* c8 ignore stop */
    // Verify the computed list matches the official list
    /* istanbul ignore if */
    const checksum = id(wordlist.join("\n") + "\n");
    /* c8 ignore start */
    if (checksum !==
        "0xcb36b09e6baa935787fd762ce65e80b0c6a8dabdfbc3a7f86ac0e2c4fd111600") {
        throw new Error("BIP39 Wordlist for ja (Japanese) FAILED");
    }
    /* c8 ignore stop */
    _wordlist$2 = wordlist;
    return wordlist;
}
let wordlist$3 = null;
/**
 *  The [[link-bip39-ja]] for [mnemonic phrases](link-bip-39).
 *
 *  @_docloc: api/wordlists
 */
class LangJa extends Wordlist {
    /**
     *  Creates a new instance of the Japanese language Wordlist.
     *
     *  This should be unnecessary most of the time as the exported
     *  [[langJa]] should suffice.
     *
     *  @_ignore:
     */
    constructor() {
        super("ja");
    }
    getWord(index) {
        const words = loadWords$2();
        assertArgument(index >= 0 && index < words.length, `invalid word index: ${index}`, "index", index);
        return words[index];
    }
    getWordIndex(word) {
        return loadWords$2().indexOf(word);
    }
    split(phrase) {
        //logger.assertNormalize();
        return phrase.split(/(?:\u3000| )+/g);
    }
    join(words) {
        return words.join("\u3000");
    }
    /**
     *  Returns a singleton instance of a ``LangJa``, creating it
     *  if this is the first time being called.
     */
    static wordlist() {
        if (wordlist$3 == null) {
            wordlist$3 = new LangJa();
        }
        return wordlist$3;
    }
}

const data$1 = [
    "OYAa",
    "ATAZoATBl3ATCTrATCl8ATDloATGg3ATHT8ATJT8ATJl3ATLlvATLn4ATMT8ATMX8ATMboATMgoAToLbAToMTATrHgATvHnAT3AnAT3JbAT3MTAT8DbAT8JTAT8LmAT8MYAT8MbAT#LnAUHT8AUHZvAUJXrAUJX8AULnrAXJnvAXLUoAXLgvAXMn6AXRg3AXrMbAX3JTAX3QbAYLn3AZLgvAZrSUAZvAcAZ8AaAZ8AbAZ8AnAZ8HnAZ8LgAZ8MYAZ8MgAZ8OnAaAboAaDTrAaFTrAaJTrAaJboAaLVoAaMXvAaOl8AaSeoAbAUoAbAg8AbAl4AbGnrAbMT8AbMXrAbMn4AbQb8AbSV8AbvRlAb8AUAb8AnAb8HgAb8JTAb8NTAb8RbAcGboAcLnvAcMT8AcMX8AcSToAcrAaAcrFnAc8AbAc8MgAfGgrAfHboAfJnvAfLV8AfLkoAfMT8AfMnoAfQb8AfScrAfSgrAgAZ8AgFl3AgGX8AgHZvAgHgrAgJXoAgJX8AgJboAgLZoAgLn4AgOX8AgoATAgoAnAgoCUAgoJgAgoLXAgoMYAgoSeAgrDUAgrJTAhrFnAhrLjAhrQgAjAgoAjJnrAkMX8AkOnoAlCTvAlCV8AlClvAlFg4AlFl6AlFn3AloSnAlrAXAlrAfAlrFUAlrFbAlrGgAlrOXAlvKnAlvMTAl3AbAl3MnAnATrAnAcrAnCZ3AnCl8AnDg8AnFboAnFl3AnHX4AnHbrAnHgrAnIl3AnJgvAnLXoAnLX4AnLbrAnLgrAnLhrAnMXoAnMgrAnOn3AnSbrAnSeoAnvLnAn3OnCTGgvCTSlvCTvAUCTvKnCTvNTCT3CZCT3GUCT3MTCT8HnCUCZrCULf8CULnvCU3HnCU3JUCY6NUCbDb8CbFZoCbLnrCboOTCboScCbrFnCbvLnCb8AgCb8HgCb$LnCkLfoClBn3CloDUDTHT8DTLl3DTSU8DTrAaDTrLXDTrLjDTrOYDTrOgDTvFXDTvFnDT3HUDT3LfDUCT9DUDT4DUFVoDUFV8DUFkoDUGgrDUJnrDULl8DUMT8DUMXrDUMX4DUMg8DUOUoDUOgvDUOg8DUSToDUSZ8DbDXoDbDgoDbGT8DbJn3DbLg3DbLn4DbMXrDbMg8DbOToDboJXGTClvGTDT8GTFZrGTLVoGTLlvGTLl3GTMg8GTOTvGTSlrGToCUGTrDgGTrJYGTrScGTtLnGTvAnGTvQgGUCZrGUDTvGUFZoGUHXrGULnvGUMT8GUoMgGXoLnGXrMXGXrMnGXvFnGYLnvGZOnvGZvOnGZ8LaGZ8LmGbAl3GbDYvGbDlrGbHX3GbJl4GbLV8GbLn3GbMn4GboJTGboRfGbvFUGb3GUGb4JnGgDX3GgFl$GgJlrGgLX6GgLZoGgLf8GgOXoGgrAgGgrJXGgrMYGgrScGgvATGgvOYGnAgoGnJgvGnLZoGnLg3GnLnrGnQn8GnSbrGnrMgHTClvHTDToHTFT3HTQT8HToJTHToJgHTrDUHTrMnHTvFYHTvRfHT8MnHT8SUHUAZ8HUBb4HUDTvHUoMYHXFl6HXJX6HXQlrHXrAUHXrMnHXrSbHXvFYHXvKXHX3LjHX3MeHYvQlHZrScHZvDbHbAcrHbFT3HbFl3HbJT8HbLTrHbMT8HbMXrHbMbrHbQb8HbSX3HboDbHboJTHbrFUHbrHgHbrJTHb8JTHb8MnHb8QgHgAlrHgDT3HgGgrHgHgrHgJTrHgJT8HgLX@HgLnrHgMT8HgMX8HgMboHgOnrHgQToHgRg3HgoHgHgrCbHgrFnHgrLVHgvAcHgvAfHnAloHnCTrHnCnvHnGTrHnGZ8HnGnvHnJT8HnLf8HnLkvHnMg8HnRTrITvFUITvFnJTAXrJTCV8JTFT3JTFT8JTFn4JTGgvJTHT8JTJT8JTJXvJTJl3JTJnvJTLX4JTLf8JTLhvJTMT8JTMXrJTMnrJTObrJTQT8JTSlvJT8DUJT8FkJT8MTJT8OXJT8OgJT8QUJT8RfJUHZoJXFT4JXFlrJXGZ8JXGnrJXLV8JXLgvJXMXoJXMX3JXNboJXPlvJXoJTJXoLkJXrAXJXrHUJXrJgJXvJTJXvOnJX4KnJYAl3JYJT8JYLhvJYQToJYrQXJY6NUJbAl3JbCZrJbDloJbGT8JbGgrJbJXvJbJboJbLf8JbLhrJbLl3JbMnvJbRg8JbSZ8JboDbJbrCZJbrSUJb3KnJb8LnJfRn8JgAXrJgCZrJgDTrJgGZrJgGZ8JgHToJgJT8JgJXoJgJgvJgLX4JgLZ3JgLZ8JgLn4JgMgrJgMn4JgOgvJgPX6JgRnvJgSToJgoCZJgoJbJgoMYJgrJXJgrJgJgrLjJg6MTJlCn3JlGgvJlJl8Jl4AnJl8FnJl8HgJnAToJnATrJnAbvJnDUoJnGnrJnJXrJnJXvJnLhvJnLnrJnLnvJnMToJnMT8JnMXvJnMX3JnMg8JnMlrJnMn4JnOX8JnST4JnSX3JnoAgJnoAnJnoJTJnoObJnrAbJnrAkJnrHnJnrJTJnrJYJnrOYJnrScJnvCUJnvFaJnvJgJnvJnJnvOYJnvQUJnvRUJn3FnJn3JTKnFl3KnLT6LTDlvLTMnoLTOn3LTRl3LTSb4LTSlrLToAnLToJgLTrAULTrAcLTrCULTrHgLTrMgLT3JnLULnrLUMX8LUoJgLVATrLVDTrLVLb8LVoJgLV8MgLV8RTLXDg3LXFlrLXrCnLXrLXLX3GTLX4GgLX4OYLZAXrLZAcrLZAgrLZAhrLZDXyLZDlrLZFbrLZFl3LZJX6LZJX8LZLc8LZLnrLZSU8LZoJTLZoJnLZrAgLZrAnLZrJYLZrLULZrMgLZrSkLZvAnLZvGULZvJeLZvOTLZ3FZLZ4JXLZ8STLZ8ScLaAT3LaAl3LaHT8LaJTrLaJT8LaJXrLaJgvLaJl4LaLVoLaMXrLaMXvLaMX8LbClvLbFToLbHlrLbJn4LbLZ3LbLhvLbMXrLbMnoLbvSULcLnrLc8HnLc8MTLdrMnLeAgoLeOgvLeOn3LfAl3LfLnvLfMl3LfOX8Lf8AnLf8JXLf8LXLgJTrLgJXrLgJl8LgMX8LgRZrLhCToLhrAbLhrFULhrJXLhvJYLjHTrLjHX4LjJX8LjLhrLjSX3LjSZ4LkFX4LkGZ8LkGgvLkJTrLkMXoLkSToLkSU8LkSZ8LkoOYLl3FfLl3MgLmAZrLmCbrLmGgrLmHboLmJnoLmJn3LmLfoLmLhrLmSToLnAX6LnAb6LnCZ3LnCb3LnDTvLnDb8LnFl3LnGnrLnHZvLnHgvLnITvLnJT8LnJX8LnJlvLnLf8LnLg6LnLhvLnLnoLnMXrLnMg8LnQlvLnSbrLnrAgLnrAnLnrDbLnrFkLnrJdLnrMULnrOYLnrSTLnvAnLnvDULnvHgLnvOYLnvOnLn3GgLn4DULn4JTLn4JnMTAZoMTAloMTDb8MTFT8MTJnoMTJnrMTLZrMTLhrMTLkvMTMX8MTRTrMToATMTrDnMTrOnMT3JnMT4MnMT8FUMT8FaMT8FlMT8GTMT8GbMT8GnMT8HnMT8JTMT8JbMT8OTMUCl8MUJTrMUJU8MUMX8MURTrMUSToMXAX6MXAb6MXCZoMXFXrMXHXrMXLgvMXOgoMXrAUMXrAnMXrHgMXrJYMXrJnMXrMTMXrMgMXrOYMXrSZMXrSgMXvDUMXvOTMX3JgMX3OTMX4JnMX8DbMX8FnMX8HbMX8HgMX8HnMX8LbMX8MnMX8OnMYAb8MYGboMYHTvMYHX4MYLTrMYLnvMYMToMYOgvMYRg3MYSTrMbAToMbAXrMbAl3MbAn8MbGZ8MbJT8MbJXrMbMXvMbMX8MbMnoMbrMUMb8AfMb8FbMb8FkMcJXoMeLnrMgFl3MgGTvMgGXoMgGgrMgGnrMgHT8MgHZrMgJnoMgLnrMgLnvMgMT8MgQUoMgrHnMgvAnMg8HgMg8JYMg8LfMloJnMl8ATMl8AXMl8JYMnAToMnAT4MnAZ8MnAl3MnAl4MnCl8MnHT8MnHg8MnJnoMnLZoMnLhrMnMXoMnMX3MnMnrMnOgvMnrFbMnrFfMnrFnMnrNTMnvJXNTMl8OTCT3OTFV8OTFn3OTHZvOTJXrOTOl3OT3ATOT3JUOT3LZOT3LeOT3MbOT8ATOT8AbOT8AgOT8MbOUCXvOUMX3OXHXvOXLl3OXrMUOXvDbOX6NUOX8JbOYFZoOYLbrOYLkoOYMg8OYSX3ObHTrObHT4ObJgrObLhrObMX3ObOX8Ob8FnOeAlrOeJT8OeJXrOeJnrOeLToOeMb8OgJXoOgLXoOgMnrOgOXrOgOloOgoAgOgoJbOgoMYOgoSTOg8AbOjLX4OjMnoOjSV8OnLVoOnrAgOn3DUPXQlrPXvFXPbvFTPdAT3PlFn3PnvFbQTLn4QToAgQToMTQULV8QURg8QUoJnQXCXvQbFbrQb8AaQb8AcQb8FbQb8MYQb8ScQeAlrQeLhrQjAn3QlFXoQloJgQloSnRTLnvRTrGURTrJTRUJZrRUoJlRUrQnRZrLmRZrMnRZrSnRZ8ATRZ8JbRZ8ScRbMT8RbST3RfGZrRfMX8RfMgrRfSZrRnAbrRnGT8RnvJgRnvLfRnvMTRn8AaSTClvSTJgrSTOXrSTRg3STRnvSToAcSToAfSToAnSToHnSToLjSToMTSTrAaSTrEUST3BYST8AgST8LmSUAZvSUAgrSUDT4SUDT8SUGgvSUJXoSUJXvSULTrSU8JTSU8LjSV8AnSV8JgSXFToSXLf8SYvAnSZrDUSZrMUSZrMnSZ8HgSZ8JTSZ8JgSZ8MYSZ8QUSaQUoSbCT3SbHToSbQYvSbSl4SboJnSbvFbSb8HbSb8JgSb8OTScGZrScHgrScJTvScMT8ScSToScoHbScrMTScvAnSeAZrSeAcrSeHboSeJUoSeLhrSeMT8SeMXrSe6JgSgHTrSkJnoSkLnvSk8CUSlFl3SlrSnSl8GnSmAboSmGT8SmJU8",
    "ATLnDlATrAZoATrJX4ATrMT8ATrMX4ATrRTrATvDl8ATvJUoATvMl8AT3AToAT3MX8AT8CT3AT8DT8AT8HZrAT8HgoAUAgFnAUCTFnAXoMX8AXrAT8AXrGgvAXrJXvAXrOgoAXvLl3AZvAgoAZvFbrAZvJXoAZvJl8AZvJn3AZvMX8AZvSbrAZ8FZoAZ8LZ8AZ8MU8AZ8OTvAZ8SV8AZ8SX3AbAgFZAboJnoAbvGboAb8ATrAb8AZoAb8AgrAb8Al4Ab8Db8Ab8JnoAb8LX4Ab8LZrAb8LhrAb8MT8Ab8OUoAb8Qb8Ab8ST8AcrAUoAcrAc8AcrCZ3AcrFT3AcrFZrAcrJl4AcrJn3AcrMX3AcrOTvAc8AZ8Ac8MT8AfAcJXAgoFn4AgoGgvAgoGnrAgoLc8AgoMXoAgrLnrAkrSZ8AlFXCTAloHboAlrHbrAlrLhrAlrLkoAl3CZrAl3LUoAl3LZrAnrAl4AnrMT8An3HT4BT3IToBX4MnvBb!Ln$CTGXMnCToLZ4CTrHT8CT3JTrCT3RZrCT#GTvCU6GgvCU8Db8CU8GZrCU8HT8CboLl3CbrGgrCbrMU8Cb8DT3Cb8GnrCb8LX4Cb8MT8Cb8ObrCgrGgvCgrKX4Cl8FZoDTrAbvDTrDboDTrGT6DTrJgrDTrMX3DTrRZrDTrRg8DTvAVvDTvFZoDT3DT8DT3Ln3DT4HZrDT4MT8DT8AlrDT8MT8DUAkGbDUDbJnDYLnQlDbDUOYDbMTAnDbMXSnDboAT3DboFn4DboLnvDj6JTrGTCgFTGTGgFnGTJTMnGTLnPlGToJT8GTrCT3GTrLVoGTrLnvGTrMX3GTrMboGTvKl3GZClFnGZrDT3GZ8DTrGZ8FZ8GZ8MXvGZ8On8GZ8ST3GbCnQXGbMbFnGboFboGboJg3GboMXoGb3JTvGb3JboGb3Mn6Gb3Qb8GgDXLjGgMnAUGgrDloGgrHX4GgrSToGgvAXrGgvAZvGgvFbrGgvLl3GgvMnvGnDnLXGnrATrGnrMboGnuLl3HTATMnHTAgCnHTCTCTHTrGTvHTrHTvHTrJX8HTrLl8HTrMT8HTrMgoHTrOTrHTuOn3HTvAZrHTvDTvHTvGboHTvJU8HTvLl3HTvMXrHTvQb4HT4GT6HT4JT8HT4Jb#HT8Al3HT8GZrHT8GgrHT8HX4HT8Jb8HT8JnoHT8LTrHT8LgvHT8SToHT8SV8HUoJUoHUoJX8HUoLnrHXrLZoHXvAl3HX3LnrHX4FkvHX4LhrHX4MXoHX4OnoHZrAZ8HZrDb8HZrGZ8HZrJnrHZvGZ8HZvLnvHZ8JnvHZ8LhrHbCXJlHbMTAnHboJl4HbpLl3HbrJX8HbrLnrHbrMnvHbvRYrHgoSTrHgrFV8HgrGZ8HgrJXoHgrRnvHgvBb!HgvGTrHgvHX4HgvHn!HgvLTrHgvSU8HnDnLbHnFbJbHnvDn8Hn6GgvHn!BTvJTCTLnJTQgFnJTrAnvJTrLX4JTrOUoJTvFn3JTvLnrJTvNToJT3AgoJT3Jn4JT3LhvJT3ObrJT8AcrJT8Al3JT8JT8JT8JnoJT8LX4JT8LnrJT8MX3JT8Rg3JT8Sc8JUoBTvJU8AToJU8GZ8JU8GgvJU8JTrJU8JXrJU8JnrJU8LnvJU8ScvJXHnJlJXrGgvJXrJU8JXrLhrJXrMT8JXrMXrJXrQUoJXvCTvJXvGZ8JXvGgrJXvQT8JX8Ab8JX8DT8JX8GZ8JX8HZvJX8LnrJX8MT8JX8MXoJX8MnvJX8ST3JYGnCTJbAkGbJbCTAnJbLTAcJboDT3JboLb6JbrAnvJbrCn3JbrDl8JbrGboJbrIZoJbrJnvJbrMnvJbrQb4Jb8RZrJeAbAnJgJnFbJgScAnJgrATrJgvHZ8JgvMn4JlJlFbJlLiQXJlLjOnJlRbOlJlvNXoJlvRl3Jl4AcrJl8AUoJl8MnrJnFnMlJnHgGbJnoDT8JnoFV8JnoGgvJnoIT8JnoQToJnoRg3JnrCZ3JnrGgrJnrHTvJnrLf8JnrOX8JnvAT3JnvFZoJnvGT8JnvJl4JnvMT8JnvMX8JnvOXrJnvPX6JnvSX3JnvSZrJn3MT8Jn3MX8Jn3RTrLTATKnLTJnLTLTMXKnLTRTQlLToGb8LTrAZ8LTrCZ8LTrDb8LTrHT8LT3PX6LT4FZoLT$CTvLT$GgrLUvHX3LVoATrLVoAgoLVoJboLVoMX3LVoRg3LV8CZ3LV8FZoLV8GTvLXrDXoLXrFbrLXvAgvLXvFlrLXvLl3LXvRn6LX4Mb8LX8GT8LYCXMnLYrMnrLZoSTvLZrAZvLZrAloLZrFToLZrJXvLZrJboLZrJl4LZrLnrLZrMT8LZrOgvLZrRnvLZrST4LZvMX8LZvSlvLZ8AgoLZ8CT3LZ8JT8LZ8LV8LZ8LZoLZ8Lg8LZ8SV8LZ8SbrLZ$HT8LZ$Mn4La6CTvLbFbMnLbRYFTLbSnFZLboJT8LbrAT9LbrGb3LbrQb8LcrJX8LcrMXrLerHTvLerJbrLerNboLgrDb8LgrGZ8LgrHTrLgrMXrLgrSU8LgvJTrLgvLl3Lg6Ll3LhrLnrLhrMT8LhvAl4LiLnQXLkoAgrLkoJT8LkoJn4LlrSU8Ll3FZoLl3HTrLl3JX8Ll3JnoLl3LToLmLeFbLnDUFbLnLVAnLnrATrLnrAZoLnrAb8LnrAlrLnrGgvLnrJU8LnrLZrLnrLhrLnrMb8LnrOXrLnrSZ8LnvAb4LnvDTrLnvDl8LnvHTrLnvHbrLnvJT8LnvJU8LnvJbrLnvLhvLnvMX8LnvMb8LnvNnoLnvSU8Ln3Al3Ln4FZoLn4GT6Ln4JgvLn4LhrLn4MT8Ln4SToMToCZrMToJX8MToLX4MToLf8MToRg3MTrEloMTvGb6MT3BTrMT3Lb6MT8AcrMT8AgrMT8GZrMT8JnoMT8LnrMT8MX3MUOUAnMXAbFnMXoAloMXoJX8MXoLf8MXoLl8MXrAb8MXrDTvMXrGT8MXrGgrMXrHTrMXrLf8MXrMU8MXrOXvMXrQb8MXvGT8MXvHTrMXvLVoMX3AX3MX3Jn3MX3LhrMX3MX3MX4AlrMX4OboMX8GTvMX8GZrMX8GgrMX8JT8MX8JX8MX8LhrMX8MT8MYDUFbMYMgDbMbGnFfMbvLX4MbvLl3Mb8Mb8Mb8ST4MgGXCnMg8ATrMg8AgoMg8CZrMg8DTrMg8DboMg8HTrMg8JgrMg8LT8MloJXoMl8AhrMl8JT8MnLgAUMnoJXrMnoLX4MnoLhrMnoMT8MnrAl4MnrDb8MnrOTvMnrOgvMnrQb8MnrSU8MnvGgrMnvHZ8Mn3MToMn4DTrMn4LTrMn4Mg8NnBXAnOTFTFnOToAToOTrGgvOTrJX8OT3JXoOT6MTrOT8GgrOT8HTpOT8MToOUoHT8OUoJT8OUoLn3OXrAgoOXrDg8OXrMT8OXvSToOX6CTvOX8CZrOX8OgrOb6HgvOb8AToOb8MT8OcvLZ8OgvAlrOgvHTvOgvJTrOgvJnrOgvLZrOgvLn4OgvMT8OgvRTrOg8AZoOg8DbvOnrOXoOnvJn4OnvLhvOnvRTrOn3GgoOn3JnvOn6JbvOn8OTrPTGYFTPbBnFnPbGnDnPgDYQTPlrAnvPlrETvPlrLnvPlrMXvPlvFX4QTMTAnQTrJU8QYCnJlQYJlQlQbGTQbQb8JnrQb8LZoQb8LnvQb8MT8Qb8Ml8Qb8ST4QloAl4QloHZvQloJX8QloMn8QnJZOlRTrAZvRTrDTrRTvJn4RTvLhvRT4Jb8RZrAZrRZ8AkrRZ8JU8RZ8LV8RZ8LnvRbJlQXRg3GboRg3MnvRg8AZ8Rg8JboRg8Jl4RnLTCbRnvFl3RnvQb8SToAl4SToCZrSToFZoSToHXrSToJU8SToJgvSToJl4SToLhrSToMX3STrAlvSTrCT9STrCgrSTrGgrSTrHXrSTrHboSTrJnoSTrNboSTvLnrST4AZoST8Ab8ST8JT8SUoJn3SU6HZ#SU6JTvSU8Db8SU8HboSU8LgrSV8JT8SZrAcrSZrAl3SZrJT8SZrJnvSZrMT8SZvLUoSZ4FZoSZ8JnoSZ8RZrScoLnrScoMT8ScoMX8ScrAT4ScrAZ8ScrLZ8ScrLkvScvDb8ScvLf8ScvNToSgrFZrShvKnrSloHUoSloLnrSlrMXoSl8HgrSmrJUoSn3BX6",
    "ATFlOn3ATLgrDYAT4MTAnAT8LTMnAYJnRTrAbGgJnrAbLV8LnAbvNTAnAeFbLg3AgOYMXoAlQbFboAnDboAfAnJgoJTBToDgAnBUJbAl3BboDUAnCTDlvLnCTFTrSnCYoQTLnDTwAbAnDUDTrSnDUHgHgrDX8LXFnDbJXAcrETvLTLnGTFTQbrGTMnGToGT3DUFbGUJlPX3GbQg8LnGboJbFnGb3GgAYGgAg8ScGgMbAXrGgvAbAnGnJTLnvGnvATFgHTDT6ATHTrDlJnHYLnMn8HZrSbJTHZ8LTFnHbFTJUoHgSeMT8HgrLjAnHgvAbAnHlFUrDlHnDgvAnHnHTFT3HnQTGnrJTAaMXvJTGbCn3JTOgrAnJXvAXMnJbMg8SnJbMnRg3Jb8LTMnJnAl3OnJnGYrQlJnJlQY3LTDlCn3LTJjLg3LTLgvFXLTMg3GTLV8HUOgLXFZLg3LXNXrMnLX8QXFnLX9AlMYLYLXPXrLZAbJU8LZDUJU8LZMXrSnLZ$AgFnLaPXrDULbFYrMnLbMn8LXLboJgJgLeFbLg3LgLZrSnLgOYAgoLhrRnJlLkCTrSnLkOnLhrLnFX%AYLnFZoJXLnHTvJbLnLloAbMTATLf8MTHgJn3MTMXrAXMT3MTFnMUITvFnMXFX%AYMXMXvFbMXrFTDbMYAcMX3MbLf8SnMb8JbFnMgMXrMTMgvAXFnMgvGgCmMnAloSnMnFnJTrOXvMXSnOX8HTMnObJT8ScObLZFl3ObMXCZoPTLgrQXPUFnoQXPU3RXJlPX3RkQXPbrJXQlPlrJbFnQUAhrDbQXGnCXvQYLnHlvQbLfLnvRTOgvJbRXJYrQlRYLnrQlRbLnrQlRlFT8JlRlFnrQXSTClCn3STHTrAnSTLZQlrSTMnGTrSToHgGbSTrGTDnSTvGXCnST3HgFbSU3HXAXSbAnJn3SbFT8LnScLfLnv",
    "AT3JgJX8AT8FZoSnAT8JgFV8AT8LhrDbAZ8JT8DbAb8GgLhrAb8SkLnvAe8MT8SnAlMYJXLVAl3GYDTvAl3LfLnvBUDTvLl3CTOn3HTrCT3DUGgrCU8MT8AbCbFTrJUoCgrDb8MTDTLV8JX8DTLnLXQlDT8LZrSnDUQb8FZ8DUST4JnvDb8ScOUoDj6GbJl4GTLfCYMlGToAXvFnGboAXvLnGgAcrJn3GgvFnSToGnLf8JnvGn#HTDToHTLnFXJlHTvATFToHTvHTDToHTvMTAgoHT3STClvHT4AlFl6HT8HTDToHUoDgJTrHUoScMX3HbRZrMXoHboJg8LTHgDb8JTrHgMToLf8HgvLnLnoHnHn3HT4Hn6MgvAnJTJU8ScvJT3AaQT8JT8HTrAnJXrRg8AnJbAloMXoJbrATFToJbvMnoSnJgDb6GgvJgDb8MXoJgSX3JU8JguATFToJlPYLnQlJlQkDnLbJlQlFYJlJl8Lf8OTJnCTFnLbJnLTHXMnJnLXGXCnJnoFfRg3JnrMYRg3Jn3HgFl3KT8Dg8LnLTRlFnPTLTvPbLbvLVoSbrCZLXMY6HT3LXNU7DlrLXNXDTATLX8DX8LnLZDb8JU8LZMnoLhrLZSToJU8LZrLaLnrLZvJn3SnLZ8LhrSnLaJnoMT8LbFlrHTvLbrFTLnrLbvATLlvLb6OTFn3LcLnJZOlLeAT6Mn4LeJT3ObrLg6LXFlrLhrJg8LnLhvDlPX4LhvLfLnvLj6JTFT3LnFbrMXoLnQluCTvLnrQXCY6LnvLfLnvLnvMgLnvLnvSeLf8MTMbrJn3MT3JgST3MT8AnATrMT8LULnrMUMToCZrMUScvLf8MXoDT8SnMX6ATFToMX8AXMT8MX8FkMT8MX8HTrDUMX8ScoSnMYJT6CTvMgAcrMXoMg8SToAfMlvAXLg3MnFl3AnvOT3AnFl3OUoATHT8OU3RnLXrOXrOXrSnObPbvFn6Og8HgrSnOg8OX8DbPTvAgoJgPU3RYLnrPXrDnJZrPb8CTGgvPlrLTDlvPlvFUJnoQUvFXrQlQeMnoAl3QlrQlrSnRTFTrJUoSTDlLiLXSTFg6HT3STJgoMn4STrFTJTrSTrLZFl3ST4FnMXoSUrDlHUoScvHTvSnSfLkvMXo",
    "AUoAcrMXoAZ8HboAg8AbOg6ATFgAg8AloMXoAl3AT8JTrAl8MX8MXoCT3SToJU8Cl8Db8MXoDT8HgrATrDboOT8MXoGTOTrATMnGT8LhrAZ8GnvFnGnQXHToGgvAcrHTvAXvLl3HbrAZoMXoHgBlFXLg3HgMnFXrSnHgrSb8JUoHn6HT8LgvITvATrJUoJUoLZrRnvJU8HT8Jb8JXvFX8QT8JXvLToJTrJYrQnGnQXJgrJnoATrJnoJU8ScvJnvMnvMXoLTCTLgrJXLTJlRTvQlLbRnJlQYvLbrMb8LnvLbvFn3RnoLdCVSTGZrLeSTvGXCnLg3MnoLn3MToLlrETvMT8SToAl3MbrDU6GTvMb8LX4LhrPlrLXGXCnSToLf8Rg3STrDb8LTrSTvLTHXMnSb3RYLnMnSgOg6ATFg",
    "HUDlGnrQXrJTrHgLnrAcJYMb8DULc8LTvFgGnCk3Mg8JbAnLX4QYvFYHnMXrRUoJnGnvFnRlvFTJlQnoSTrBXHXrLYSUJgLfoMT8Se8DTrHbDb",
    "AbDl8SToJU8An3RbAb8ST8DUSTrGnrAgoLbFU6Db8LTrMg8AaHT8Jb8ObDl8SToJU8Pb3RlvFYoJl",
];
const codes$1 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
function getHangul(code) {
    if (code >= 40) {
        code = code + 168 - 40;
    }
    else if (code >= 19) {
        code = code + 97 - 19;
    }
    return toUtf8String(new Uint8Array([225, (code >> 6) + 132, (code & 0x3f) + 128]));
}
let _wordlist$1 = null;
function loadWords$1() {
    if (_wordlist$1 != null) {
        return _wordlist$1;
    }
    const wordlist = [];
    data$1.forEach((data, length) => {
        length += 4;
        for (let i = 0; i < data.length; i += length) {
            let word = "";
            for (let j = 0; j < length; j++) {
                word += getHangul(codes$1.indexOf(data[i + j]));
            }
            wordlist.push(word);
        }
    });
    wordlist.sort();
    // Verify the computed list matches the official list
    /* istanbul ignore if */
    const checksum = id(wordlist.join("\n") + "\n");
    /* c8 ignore start */
    if (checksum !==
        "0xf9eddeace9c5d3da9c93cf7d3cd38f6a13ed3affb933259ae865714e8a3ae71a") {
        throw new Error("BIP39 Wordlist for ko (Korean) FAILED");
    }
    /* c8 ignore stop */
    _wordlist$1 = wordlist;
    return wordlist;
}
let wordlist$2 = null;
/**
 *  The [[link-bip39-ko]] for [mnemonic phrases](link-bip-39).
 *
 *  @_docloc: api/wordlists
 */
class LangKo extends Wordlist {
    /**
     *  Creates a new instance of the Korean language Wordlist.
     *
     *  This should be unnecessary most of the time as the exported
     *  [[langKo]] should suffice.
     *
     *  @_ignore:
     */
    constructor() {
        super("ko");
    }
    getWord(index) {
        const words = loadWords$1();
        assertArgument(index >= 0 && index < words.length, `invalid word index: ${index}`, "index", index);
        return words[index];
    }
    getWordIndex(word) {
        return loadWords$1().indexOf(word);
    }
    /**
     *  Returns a singleton instance of a ``LangKo``, creating it
     *  if this is the first time being called.
     */
    static wordlist() {
        if (wordlist$2 == null) {
            wordlist$2 = new LangKo();
        }
        return wordlist$2;
    }
}

const words$1 = "0torea noica!iosorolotaleratelanena%oiadoencotivomai t ca%a0A]Bagl'Bin#E.Is(Oli!Rasi_Rog#0Cade!C[$Cus#E <Hil,I@QuaReRil>Roba+U 0Ag'Deb{DomeEgu#Eri!IpeOtt&Ul&1Fabi,Fe|Fis(F-n Oris`O(R~$0AveEn.E_,Ganc'I!It&OnismoR>*Rume Uzzo4AbardaA Bat)Ber#BoBumeCeCol>E|<FaGeb-Ian.IbiIm[ Lag#Leg)Lie_Lo@/Lusi_Me$Oge$Pa}Pest!Ta,=Ter$T%c'T)veUn$Veo*Z&0Alga`Ani+A!=B{Br#EbaEr~E^s+I]Mas(M[daMir&Mon{O!P'Pli&U, 0A}r@Ag-feAlis+Arch?At-CaCel/Co-D&D!aEl*Ge*Gol&Gus I`Neg&Nid#NoNunc'OnimoT%ipoZi1At>Ertu-OdePari!Pe^ Pogg'P)@Pun Ri,1Ab~AchideAgos+Ald~Anc'Atu-AzzoBit)Chiv'D{Eni,G[ Gi<Gu IaMon?NeseRed#RingaRos S[>SoTef%eZil*0Ciu|Col EpsiEtt>Fal I$O/Pir#P)Sagg'SeSolu Sur@TaT[u T%eT-|0Av>EismoOm>O$TesaTiv&Tor$Tr{Tua,0Sil'Str?Tis+To$moTun$0Anz#E!V[i!Vi(Volge!3Io<O ZimoZur):Be,C}$Ci$CoDessaDi/+Gn#I+L]<L@Le=L/+Lza$Mbi$Ndi!RaondaRba)R}R{$RlumeRoc]Sil>S(Tos+Ttu U,VaVosa3C]FfaLg'LvaNdaNe_,Nig$Nzi=ReRli=Ta3Bi+CiDo<Fi@GaLanc?MboNo]*O*goPedePol&Rban.R-S]|Ses S$n$Son.SturiZzar)2An@At+2Ll{Nif>R@S]Tan>T^$Zzo*2Acc'AdipoA`An}Avu-E.l/Eve|EzzaIgl?Il/n.Ind&Oc]*O@Onzi=Ul*U$2Bbo<CaDi$Ffo<IoLboO$R*<R-s}S(/S+:De|Du]La`)L]*LesseLib)LmoLor?MbusaMe-+M%?Mmi$Mo/Mpa,NapaNde/NeNi$No|N^=PacePel*P{*Pogi)Ppe)P-Psu/RapaceR}ssaR@Ris`Rova=R!|R li=Sacc'S}+Ser`SoS(<S.l*Sua,Tas+Te=T-meU Vil*3Dibi,D-+Fa*Leb!Llul&NaNo<N.simoRam~Rc&R RumeRvel*So?SpoTo2E/Ia)Ic}Iede!Ime-I=IrurgoI+r-0AoClismoFr&G$Lind)O|*R}R)siTr>T+di$UffoVet+Vi,2Ass>In~O)2C]Dar@D%eE!n.G$meLl&Lm#Lo!Lpo(L^v#LzaMaMe+M`n@Mo@Mpu.rMu<Nci(Ndur!Nfer`Ngel&NiugeN<s(Nosce!NsumoN^nuoNveg$Per P'<Pp?Pr~poRazzaRda+R%#Rn%eRol/RpoR!@Rs?R.seSm>S+n.Ttu-V#2A.!Avat+E#Ede!Emo(Esci+E+Ice I=,IsiIt>OceO=}Os++Uc?,Us}2Ci!Cu*Gi$Ll#Po/R#!R(!R_Sci$S de:DoI$L`+Meri$Nie/N$(Nz&T#Van^Vve)3Bu|C[n'Ci(Cli$Col*C! D%#Fin{FormeG$Leg&Lfi$Lir'L+M[zaNot#Nt)Pos{Rapa+Riv&RogaScri|Ser Sider'Sume!Tersi_Vo 3Amet)Cemb!Ed)Fe(Ffu(Geri!Gi+,Luv'Nam>N=nziPin P*`Po*Rad&ReRo|RupoSag'Sc! Sf&Sge*Spos S+nzaSu`$ToVa$Vel Vide!Vor#5B*<C[.Ga=,G`LceM#M[~Min&N@*NoRmi!TeT !Vu Zzi=2AgoUi@2Bb'Bit&Ca,NaOmoPl%eRatu):0A$0Ces(CoLissiO$m?0E-I]/I,I r?Uc&2Emon?LiOismoReg'4Abor#Argi!Egan.Enc#E|Ev&F>I}MoSaU(0An#B,`Es(I)O^_Oz'<Pir>U*0Dem>Du)Erg?FasiO.}Tr&Zi`1A^.I*goI(d'O},Pu!0U#!0Ar'BaBo(EdeEmi+Ige!Met>OeOsi_Ran.0Ago$AmeAnimeAudi!CaEmp'Erc{Ib{Ig[.Is.!I OfagoOrt#O(Pan(P!s(S[zaSoTe(Tim&Ton?T)(Ult&0Il>N>Rus]To0ClideoRopa0A(Id[zaIt#Olu Viva:Bbr~Cc[daChi)L]Migl?Na,Nfa-NgoN+s`ReRfal/Ri$(R`]Sc?S (Sul*T%&ToVo*(3Bb!Co/DeG#LpaLt)Mmi=Nde!Nome$Rm[ R)R^,Ssu-S^_T+U@3AbaDuc?FaGur#LoNanzaNest-Ni!O!S},S>Ume2A]<Am[]EboEm`Ori@U[.Uo)2B>Cacc?Co(Der#Gl'La+Lc*!Lgo!Nd[.Net>N?N+=Rb{Rchet+Res+Rm~R='RoR.zzaRz&Sf#S(2A}s(A=Assi$A.l*Eccet+E=+Es]IgoOlli$OndeUga,Ut+2Ci/+Cs?Gg[.Lmi<L_Man.Me|Mo(NeNz'<O]RboRgo<Ro!SoTi,:Bb?$FfeLa.oLli=LoppoMbe)M`Ranz?RboRofa$Rzo<S@|Sol'Str>T Ud'ZeboZzel/3CoLa^=L(Mel*Mm#NeN{!N='No^poRgo2Epar@Iacc'Isa0Al*LdaNep)Oc&Oiel*Or$OveR#Ro<T++Udiz'Ur#Us 2Obu*U^<1Omo0BbaLfM{Mmo<Nf'N=Ver$2Aci,A@Af>AmmoAndeAtt&A_(Az?E}EggeIfo<Ig'InzaOt+Uppo2Adag$A'An Ard&FoId&::0Ern#0O=0Ent>Ill'O*RaR>Roge$2Ie<Na)Nor#4A!Le(Log>Lude!0Bal*Bevu Boc]Bu Ma<Mer(Mol#Pac]Pe PiegoPor P)n+0Al&Arc&At^_Can C[d'Chi$Cisi_Clu(Cont)C)c'CuboDagi<D?Do,Ed{Fat^Fil&Fli|Gagg'Geg$G,seGor@G)s(Nes]O@!Oltr&Ond#Sa$Se|SiemeSonn?Suli=Tas#Te)To=]Tu{Umidi!Vali@VeceV{1Erbo,Not>O.siP~1IdeLandaOn>Rig#Ror&0Ol#O poTer>Titu Tr%e0Al?Er&:::Bb)Birin C}Cer#Cri`Cu=D@veGoMpoNcet+N.r=R@(RgaRingeSt-T[zaTi$TtugaVag=Vo)3Ga,Gge)MboN.zzaNzaO<P!Si_Ss#S T.-,VaVig#3Be)DoEv{L/Matu-Mit&Mpi@Ne&NguaQui@RaR~S}TeTig'V!a5CandaDeG~Mb&Nd-Nge_QuaceR[zoToT.r?5CeCid#Ma}Mi$(NgoPoPpo*SingaS(T :Cab)Cchi=Ce)Cin#Da`G>Gl?G<.G)Iol~LafedeLg-@Lin.(Lsa$L Lumo!NaNc?N@r/Ngi&Nifes N=)Nov-NsardaN^deNubr'PpaR#=Rci!Ret+RmoRsup'Sche-Ssa?S^$Te-s(Tr>/T <Tu)Zur}3And)C}n>Ce=.DesimoDit&GaLassaLisLod?NingeNoN(/Rcur'R[daR*Schi$SeSse!S *Tal*To@T.!3Agol&CaCel'Che,C)boDol*E,Gl'!La$Li.MosaNe-,NiNo!Ri$R^l*Sce/SsivaS Sur&TezzaTig&T-T.n.4Emon>0Del*Dif~Du*Ga$G'LeLos(Nas.)N]Ndi=Ne+r'Ni,No $N(<Nt#Nvi(RaRde!Rs%#St)Tiv#TosegaT V[zaVim[ Zzo5C}CosaFfaGhe|G='La|Li<l*L^p*Mm?N Ove!Ra,SaS]*S~Te_,To:BabboF+Nomet)Rci(R%eRr#Sce!Str&Tu-,Ut~Vigl'3Bu*saC)siGa^_Goz'Mme$Ofi+Re|R_Ssu$Ttu$Ut-,VeV)t>3Cch?NfaTi@5Bi,Ci_DoMeMi=Rd>R`,RvegeseSt-$T&Tiz?Ttur$Vel/5C,oL/Me)O_Tri!Vo/Z?,:Si0Bedi!BligoElis]L'O*So, 0Cas'<Ch'Cid[.Cor!!Cult&RaUl#0Ier$Or&1Fer+Fri!Fusc#0Ge|GiNu$4AndeseFa|I#IvaOg-m`T!0Agg'Bel>B-EgaIss'<0Do(E!IceNi_)O!_,Ta1Er#In'<Pos 1A]*AfoDi<Ecchi$Ef%eFa$Gan>Igi<Izzon.MaMegg'Na^_O*g'R[@Ribi,T[s?T~Za+Zo0A!Cur&MosiPeda,Pi.SaSid&Ta]*Te0I.ReTago$TimoTob!1A,EstI$Ipa)Oc{UnqueVi&3Io:Cche|CeCif>Del/D)<EseGaGi=Lazzi=Les&Lli@LoLudeN@)N<l*O*O=zzoPr~Rabo/Rcel/Re!Rgo*RiRl#Ro/R^!Rv[zaRz?,Ssi_St%}Tac}To*g?TtumeVo<3Cc#Dal&Do=,Gg'Lo(N&Nd%eNi(/Nnu Nomb-Ns&N /PePi+Rbe<R]r(R@n#Rfor&Rgame=R'@Rmes(R$Rp,s(Rsua(Rtug'Rva(S#!Sis+SoS^fe)Ta*T^<Tu/n.Zzo3Ace!An+At^$Cci$CozzaEgaEt-Ffe)G?`Gol'G)LaLife)L*/Lo+Mpan.Ne+N=No*Ogg?OmboRamideRet>Ri.RolisiTo<Zz>2AceboAn&As`A+$E=r'2ChezzaDe)(DismoEs?Ggi&L[+Ligo$Ll%eLmoni.Lpet+L(Lt)=Lve!M%eMo@)N.Po*(Rfi@Ro(Rpo-R!R++SaSi^_Sses(Stul#Tass'Te!2AnzoAssiAt~Eclu(Ed~Efis(Egi#Elie_Eme!E$t&Epar#Es[zaE.s Eval(I`IncipeIv#Ob,`Ocu-Odur!OfumoOge|OlungaOmessaO$meOpos+O)gaO.(OvaUd[.Ug=Ur{0Iche1Bbl>D~Gil#G$LceL{Lsan.Nt&PazzoPil/Ro:99Ad)Al]saAsiE!/O+:C]l D@pp'D~,Dun#Ff~GazzoG'<G$Mar)MingoMoNdag'N l&P#Pi=Pp!(Satu-Schi#S[.Sseg=St!l*TaVvedu 3A,Cepi!Cin Clu+Cond{Cupe)Dd{Dime!Gal#Gist)Go/G!s(Laz'<M&Mo N=Pl~Prime!Put&SaSid[.Spon(S+u)TeTi=Tor~T^f~Voc#3Assun Badi!Bel,B!zzoCar~C]Ceve!C%l#Cor@C!du D>*Dur!Fas&F,s(For`Fug'G&Gett#Ghel*Lass#Lev#Ma<!MbalzoMed'Morch'Nasci+N})NforzoN$_Nom#Nsav{N c]Nunc?Nv[i!Par#Petu Pie$Port&P!saPuli!Sa+Sch'ServaSibi,SoSpe|S )Sult#S_l Tar@Teg$Tm>T)_Un'<VaVer(Vinci+Vol Zo`5BaBot>Bus Cc?CoDagg'De!D{!G{Ll'Mant>Mpe!Nz'Sol&SpoTan.Ton@Tu/Vesc'5BizzoBr~GaLli$Mi<Mo)(O*PeSs&St>:B#Bbi&Bot#Go`Las(Ldatu-Lgem`Liv&Lmo<Lo<Lt&Lu L_Pe!Pi@Por{Race$R}smoR S((Telli.Ti-Tol*Tur$Va=V'Zi#0Adigl'AlzoAnc#Ar-At.!Av&End&Irci&Locc#Occi#Rin&Ruffo<Uff&0Ab)(Ad[zaA/Ambi&Anda*Apo/Ar(A.n&Av#El En>Ett)HedaHie=IarpaI[zaInde!IppoI)ppoI_*Ler&Odel/Olp{Ompar Onfor Opri!Or+Os(<OzzeseRibaRoll&Ru^n'Uder?Ul !Uo/U)Us&0Ebit&Ogan&0C}tu-Con@Da$Gg'/G=l#G!g#Gu{Lci#Let^_L/Lvagg'Mafo)Mbr&MeMin#Mp!N(N^!Pol Qu[zaRa+Rb#Re$R'Rp[.R-gl'Rvi!S^=To/T^`=0Ace*Ald&Am#Arzo(At%#E-IdaIl#IngeOc#Oder&OgoOl^!Orz#Ra|Rutt#Ugg{Um&U(0Abel*Arb#Onfi&Orb'Rass#Uar@1Bi*C]meEr-G/G$!L[z'L/baMbo*Mpat>Mul#Nfon?Ngo*Nist)NoN.siNu(idePar'S`S ,Tu#2It+Ogatu-Ove$0Arr{Emor#En^ E-l@IlzoOnt&Ott#Uss#0Elli!Erv#O@0BbalzoBr'C]r(C?,Da,Ffi|G$Ld#L[<Li@L/zzoLoLubi,Lv[.Mat>M`NdaNe|Nnife)Pi!Ppe(P-Rge!Rpas(Rri(R(R.gg'R_l#Spi)S+T^,0AdaAl/Arge!A /Av[ Azzo/EcieEdi!Eg<!E/tu-E-nzaEs(!Ett-,Ezz#IaIgo*(Ill#I$(I-,L[di@Or^_O(RangaRec&Ron#RuzzoUn^$0Uil*0Ad%&O l#1Abi,Ac]AffaAgn&Amp#Ant'Arnu Ase-Atu E*EppaErzoI,|I`IrpeIva,Izzo(On#Or>RappoReg#Ridu*Rozz&Ru|Ucc&UfoUp[@0B[t)C](Do!Gger{GoL+$On&PerboPpor Rgel#R)g#Ssur)Tu-0Ag&EdeseEgl'El&Enu Ez?IluppoIs+Izze-Ol+Uot&:Bac]Bul#Cci&Citur$LeLis`$Mpo<Nni$RaRdi_Rg#RiffaRp&R+rugaS Tt>Ver=Vo/+Zza3CaCn>Lefo$Me-r'MpoMu N@<Ne)Ns'<N+]*O!`RmeR-zzoRze|SiSser#St#T)T ?3F&Gel/Mb)N P>Pog-foRagg'RoTan'To*Tuban.Z'Zzo<5Cc&L,r&L Mbo/MoNfoNsil/Paz'Po*g?PpaRbaRn&R)<R -S}$Ssi!S+tu-Ta$2Aboc]AcheaAfi/Aged?Alc'Amon Ans{Apa$Ar!As*]Att#AveEcc?Emol'Espo*Ibu Iche]Ifogl'Il*InceaIoIs.zzaItur#Ivel/OmbaO$OppoO|/Ov&Ucc#2Batu-Ff#Lipa$Mul Nis?Rb&Rchi$TaTe/:0Ic#0Cel*Ci(!0I!I^_1FaF%'0Ua,4IsseTim#0A$I,Orismo0Ci<|Ge!Ghe!seI]r$If%#I($I+r'Te0Vo0Upa1Aga$G[zaLo0AnzaA C{Ig$*U-'0Ensi,IlizzoOp?:Can.Ccin#Gabon@Gli#LangaLgoL>L,t+Lo)(Lut&L_/Mpa+Ng&N{(NoN+gg'Nve-Po!Ra$Rc#R?n.S}3Det+DovaDu Ge+,I]*Lc)Li=Llu LoceN#Ndemm?N RaceRba,Rgog=Rif~RoRru}Rt~,Sc~Ssil*S+,Te-$Tri=Tus 3Andan.B-n.C[daChingoCi=nzaDim&Gil?G< Go!LeL/$MiniNc{!O/Pe-Rgo/Ro*goRu,n S](S'<SpoSsu Su-TaTel*T^`VandaVi@Zi&5CeGaLa^,Le!LpeRagi<5L}$::::Mpog=N=Pp#T.-Vor-3Fi)Lan.LoNze)Rbi$3Be|N]R]<T 5L/T>5Cche)Fo*LuPpa";
const checksum$1 = "0x5c1362d88fd4cf614a96f3234941d29f7d37c08c5292fde03bf62c2db6ff7620";
let wordlist$1 = null;
/**
 *  The [[link-bip39-it]] for [mnemonic phrases](link-bip-39).
 *
 *  @_docloc: api/wordlists
 */
class LangIt extends WordlistOwl {
    /**
     *  Creates a new instance of the Italian language Wordlist.
     *
     *  This should be unnecessary most of the time as the exported
     *  [[langIt]] should suffice.
     *
     *  @_ignore:
     */
    constructor() {
        super("it", words$1, checksum$1);
    }
    /**
     *  Returns a singleton instance of a ``LangIt``, creating it
     *  if this is the first time being called.
     */
    static wordlist() {
        if (wordlist$1 == null) {
            wordlist$1 = new LangIt();
        }
        return wordlist$1;
    }
}

const words = "0arad!ototealirertainrasoent hoandoaR#riareha!aroele'oronul0Aca%AixoAl A%rDuz'El]Er$IsmoO$ R<g(Revi Rig Rup$S*$Solu$Sur=Ut[0Ab#Alm Amp Anh A,Ei.El( En ErvoEss E$naHa.IdezImaI}#Irr Lam LiveOlhidaOmod Opl Ord Um~ Us?0Ap.EgaEnt_Ep$Equ Er-%EsivoEusI<%ItivoJetivoJun$M' Or Qu''UboV(,Vog#0R}ave0As.Er'EtivoIn?Iv` Li$Lu-%R}.0Ach Arr As&/Enci Iliz Io)It#O+R! Res%Rup U d Ul]2O`h Ud Us.1AmedaArmeAstr Av<caB(gueB*oCat+De@EcrimEgr@Er.FaceF*e%GumHeioI Ica%I- Inh Ivi Mof^Oc Pis%T( TitudeUc* Ug UnoUsivoVo0Aci A=rA[loAss BasBi-%EixaEniz I=Is$,Iz!eOl?On$ O_,Ost+P  Pli Pola0Ag+maAlis Arqu@A$m@DaimeElExoG~ Im JoOm&@Ot#Sio,T(i|Uid!eUnci Zol1Ag?Alp Anh#EgoEli=Ert^Es Eti%I$Lau,Lic^OioOn.Os)R-dizRov 0Uec(0AmeAn]A+C^D-%E@Ej Eni$Es)Gilo,GolaMaQuivoRai&Reba%Risc Rob>um S-&T(i&TigoVo[=0F&.Il#P' S?S* So&/Sun$Tr&0Ac#Adu+Al/A[f E End(Er_EuIng'Ir?IvoOl{oRac Revi=RizU&Um0Di$rM-.R>o+TismoT|@Tu 0Ali An%Ar@Ent&Es,I?Is Ul,1Ila1Ar E=Ei%Ulejo:B BosaC&]uCh `C@GagemI<oIl I}e)Ir_Ixis)J~ Le@LizaLsaN&Nd{aN/N'Nque%Ra$Rb#R}es>+c>~/Se#S)n%Ta)Te=rTidaTomTuc Unil]3B(IjoIr^IsebolLd!eLezaLgaLisc Ndi$Ng&aNz(RimbauRl*d>_Sou_XigaZ(_3CoCu=En&Foc&Furc G|naLhe%Mest[Mo$rOlog@OmboOsf(aPol Rr-$Scoi$Sne$SpoSsex$TolaZ _2Ind#OcoOque 2A$BagemC#CejoChec]Ico.L^LetimL]LoMb{oNdeNecoNi)Rb~h>d>e&R+c]V*oXe?2AncoAsaAvezaEuIgaIl/Inc OaOchu+Onze O$Uxo2C]DismoF LeRacoScaS$Z*a:B<aB`oBideBoBri$CauCet^C/r_CiqueDast_De#Fez&IaqueIp'aIxo%J#JuLafrioLc~ Ld{aLibr Lm<%Lo)M^Mbis)MisaMomilaMp<]Mufl Navi&Nc` Ne)NguruN/$Nive%NoaNs#N.Nu=Pac/P`aP* Po.Pric/Pt?PuzRacolRb}oRde&Rec>imb Rn{oRpe%R['>)zRv&/SacoScaSeb[S%loS~oT a)Tiv UleUs?U%l V&oV(na3BolaDil]G}]Lebr L~ Nou+N,N%ioRc Rr#R%'oRvejaTimV^2Aco)Al{aAm#Ap^ArmeAticeAveEfeEg^E'oEqueIco%If[In`oOc&/Ov(UmboU.Uva0CatrizCl}eD!eD['aEn%G<aM-$N$Nz><d>cui$Rurg@T 2A[zaE_Ic OneUbe2A=Ag'Ba@B($rBr C^El/Ent_E,Gum`oIb'IfaIo%L L{aLh(Lid'Lme@L}oLunaM<=Mb* M-.MitivaMov(MplexoMumNc]N=rNec.Nfu,Ng` Nhec(Njug Nsum'Nt+$Nvi%Op( P{oPi?PoQue%lRagemRdi&Rne)R}h>p|&R[ioR%joRuj>voSs-oS%laT}e%U_UveVilZ*]2A%+AvoEcheE=rEmeErEspoI^Im*&Io~oIseItic Os)UaUz{o2B<oEcaId#JoLat+Lm* Lp Ltu+Mpr'Nh#Pi=RativoRr&Rs R$Sp'S% T`o:MascoT 3Ba%rBi.BocheB~h C&queCim&CliveCo%C[.D&Dic#Duz'FesaFum G`oG+uGus.It#Ix La$rLeg#L*e L}gaM<daMit'Moli=Ntis)P-#Pil PoisP[ssaPur Riv>+m SafioSbo.Sc<,S-/Sfi#Sgas%Sigu&SlizeSmam SovaSpesaS)queSvi T&h T-$rT} Tri$UsaV(Vi=Vot#Z-a3Ag+maAle$Da)Fu,Gi.Lat#Lu-%M*u'Nast@Nh{oOceseRe$Sc[)Sf ceSp oSque%Ssip S)n%T?UrnoV(,Vi,rV~g Z(5Br?L|i=M?M*#NativoNz`>m-%Rs&SagemUr#U$r2EnagemIbleOg @2El EndeE$PloQues><%Vi=,:1Lod'O Olog@0Ific It&Uc#1Ei$Etiv 3E.1Ab| Eg(Ei$rEncoEv?Im* Ogi 0B goBol#Br~/Buti=EndaErg'Is,rPat@P-/P*#Polg P[goPurr Ul?0CaixeC-#Ch-%C}t_Deus Doss Faix Fei%FimGaj#G-/Glob Gom#G+x Gu@Jo La.Qu<$Raiz Rol#Rug SaioSe^S*oSop#T<$Te#Tid!eT|.Tr^T~/V(g Vi#Volv(XameX($Xof[Xu$1Id(me0Uip 0E$Gui=Ra)VaVil]0B<j B`$CamaColaCri)Cu)F*geFol F[g Fum#GrimaM&%P<$P`/PigaP}jaP[i)Pum Qu(daTacaT{aTic Tof#T[laTu=Vazi 0AnolIque)0F|i>opeu0Acu Ap| AsivoEntu&Id-%Olu'1Ag(oAl Am* A$Aus$Ces,Ci.Clam Ecu.EmploIb'Ig-%On( P<d'P`'P' Pl< Pos$P[s,P~s T(noT*$T+$:Bric B~o,Ce)Ci&DaDigaIxaL L)Mili Nd<goNf +N$cheRd#R`oR*h>of>p>tu+T@T|V|i)X*aZ-da3Ch#Ijo^I+n%L*oM**oNdaNoR>i#RrugemRv(S%j T&Ud&3ApoB_seC Ch{oGur#L{aL/LmeLtr RmezaSg^Ssu+TaV`aX?Xo2AcidezAm*goAn`aEch^O+Utu Uxo2C&C*/Foc GoGue%IceLg#Lhe$Rj Rmig>noR%ScoSsa2Aga)AldaAngoAscoA%rnoE'aEn%E.IezaI,Itu+On]Ustr U%'a2G'L<oLigemNd NgoNilR?Rio,Tebol:B i$B*e%DoIa$IolaIvo)LegaL/L*]Loc]Nh RagemRfoRg&oRimpoRoup>+faSodu$S$TaTil/Ve)Z`a3L#Le@LoM^M(Mi=N(o,NgivaNi&NomaN_Ologi>?Rm* S,S$r3Nas)Nc<aNg#Raf>*o2Aci&IcoseOb&Orio,2ElaIabaLfeLpe Rdu+Rje)R_S$,T{aV(n 2AcejoAdu&Afi%Al]AmpoAn^Atui$Ave$AxaEgoElh EveIloIs&/I.@Os,O%scoUd#Unhi=U)2AcheA+niAx*imEr[ I Inc/Is#LaLo,Ru:Bi.Rm}@S%V(3C.eRd Res@Si.3A$B(n D+.EnaNoPismoPnosePo%ca5JeLofo%MemNes$Nr#Rm}&Sped 5M|#:Te2E@O,2N|#RejaU<a4E,HaUdi=Um* Ustr 0AgemEd@$En,ErsivoIn-%It?Ort&Pac$Ped'Pl<%P|Pr-saPuneUniz 0Al?Ap$AtivoC-,Ch Cid'Clu'Col|Deci,D'e$Du$rEficazEr-%F<tilFes.F*i$Flam F|m&F+$rG('Ibi=Ici&ImigoJe.Oc-%O=_Ov?OxQuie$Scri$Se$Sist'Spe$rSt& S~$Tac$Tegr&Tim Toc#TrigaVa,rV(noVic$Voc 0Gur%2Ani<oOniz Re&Rit#0CaEn$Ol#Qu{o0Ali<o:N{oNg^N)R ac>dimR_SmimToV&iZida3Jum9An*]Elh^G?I>n&Rr Vem5BaDeuDocaIzLg?L/R#Ris)RoS)::B edaB|&C[C)n%Dril/G )GoaJeMb(M-.M* MpejoNchePid P,R<j>{>gu+S<]St_T(&Ti=V<daVou+Vr?X<%Z(3Ald!eB[G#G-d Gis)IgoIlo Itu+Mb[%MeNh?Ntil]OaSmaS%TivoT['oV VezaVi.3B(&Bi=D( G G{oMi.Mo{oMp?NdaNe N]gemQuidezS)gemSu+T|&V_XaX{a5C?Cu$rJis)MboNaNgeNt+RdeT#T(@Ucu+UsaUv 5ArCidezC_Ne)St[T?Va:CacoCe%Ch#CioD{aDr*]Gna)G[zaI|IsL<d_L]Lo%LucoMiloMo{oMu%N^Nc]Nda$NequimN/,Niv`aNobr NsaN%rNuse Pe#Qu* Rc?Resi>fimRgemR*/Rmi)Ro$RquiseR[coR%loRujoSco%Sm|+SsagemStig Tag&T(noT*&Tu.Xil 3D&]DidaDusaGaf}eIgaL<c@L/rMb_M|i&N*oNosNsagemNt&Rec(Rg~/S^Scl SmoSqui)St[T!eTeo_T+gemX(Xic<o3C_G&]Gr Lag[L- Lh M#N( N/caNist_N|@OloR<%RtiloStur 5Cid!eD(noD~ EdaErIn/I)Ldu+LezaL/L*e%LuscoN)n]Quec><goRcegoR=moR-aSaicoSque%S.daT`TimToTriz5DaI$La)Lh(L.Ndi&Ni=R&h>c/Sc~ SeuSic&:Ci}&D?JaMo_R*>r#Sc(TivaTu[zaV&]Veg Vio3Bl*aB~o,GativaGoci Gri$Rvo,TaUr&VascaVo{o3N N/TidezV` 5B[zaI%IvaMe M*&Rdes%R% T Tici TurnoV`oVil/Vo5Bl#DezM(&Pci&Tr'Vem:0Cec#Edec(JetivoRig#Scu_S%t+T(Tur 0Id-%Io,Orr(Ulis)Up#2Eg<%EnsivaEr-daIc*aUsc#0Iva4Ar@Eo,H Iv{a0B_Ele%Is,It'0D~#E_,Tem1Ci}&Er?On-%OrtunoOs$1ArBi.DemD*&F<a$GasmoG~/I-t&IgemIun=LaTo=xoV&/0Cil S^SoT-.0Imismo0S!@T}oTub_Vi=0El]Ul 1Id Ig- :Ca$Ci-%Co%Ctu D @Dr*/G GodeIn`Ir IsagemLav+Lest+Lhe)Li$Lm^Lpi.Nc^N`aNfle$NquecaN)n&PagaioP`^P'oRaf*>ci&Rd&RedeRtidaSmoSs#S%lTam T-%T* T_noUl^Us 3C~i D& Dest[D@t+D+G^I$r&IxeLeLic<oNcaNdur N{aN]scoNs?N%Rceb(Rfei$Rgun)Ri$Rmit'Rn>plexoRsi<>%nceRucaSc#SquisaS,aTisc 3AdaC#Ed!eGm-$Last+Lh#Lo.M-)Nc`NguimN]No%N.On{oPocaQue%R<h>esRue)Sc S$laT<gaVe%2An)Aque)At*aEbeuUmagemUvi&1Eu0DaE'aEtisaLeg^Lici Lu-%Lvil/M MbaNd( N.@P~o,R)Ssu'St&TeUp U,Vo 2A@Anc]A$AxeEceEd?Efei$Emi Ens Ep  Esil]E%x$Ev-'Ez Ima)IncesaIsmaIv#Oces,Odu$Ofe)Oibi=Oje$Ome%rOpag OsaO%$rOv?2Blic DimL Lm} Ls{aNh&N'PiloRezaX?:99Ad+Ant@Ar$AseEbr EdaEijoEn%Eri=Im}oInaIosque:B<^BiscoCh Ci} Di&I In]IoIvaJ^L#M&Ng(Nhu+P!u+P`PidezPosaQue%Rid!eS<%Scun/Sg Sp?S%'aSur Taz<aTo{a3AlezaAnim Av(Baix B`deBol C#C-%CheioCiboC|d Cru.Cu DeDim'D}daDuzidaEnvioF* Flet'Fog F[scoFugi G&@GimeG+In#I$rJei.LativoM?M-=M|,Nov#P oP`'Ple$Pol/P[saPudi Qu((S-]Sfri Sga.Sid'Solv(Spei$SsacaS)n%Sum'T&/T(T' Tom^T+.V` Vi,rVol)3Ac/CaGidezGo_,M NgueS^ScoS}/5B&oChe=D^DeioDov@E=rLe)M<oNc S#S{aS$TaT{oT*aT~ UcoUpaXo5B_Gi=Go,IvoMoPest[S,:B|Ci ColaCud'DioF'aGaGr^Ib_L^L{oLg#LivaLpic Lsic]L.Lv?Mb Mu+iN Nf}aNgueNid!ePa$Rd>g-$Rje)Tur Ud!eXof}eZ}&3C C~ DaD-$Di#Do,Du$rGm-$G[=Gun=IvaLe$LvagemM<&M-%N?N/rNsu&Nt#P #Rei>*g>+RvoTemb_T|3GiloLhue)Lic}eMetr@Mpat@M~ N&Nc(oNg~ NopseN$ni>-eRiTu#5B(<oB+C|_G_JaLdaLetr L%'oMbrioNa)Nd Neg Nh?NoP+noQue%Rr'R%ioSsegoTaqueT(r V#Z*/5Aviz BidaBm(,B,loBt+'Ca)Ces,CoDes%FixoG?G('Jei$Lfa$M'OrP(i|Plic Pos$Prim'Rd*>fis)Rp[s>[&Rt'Sp'oS%n$:B`aBle%Bu^C/G `aLh(LoLvezM</Mb|imMpaNg-%N$P Pioc>dioRef>j>+xaTuagemUr*oXativoXis)3Atr&C(Ci=Cl#Dio,IaIm Lef}eLh#Mp(oN-%N,rN.Rm&RnoRr-oSeSou+St#ToXtu+Xugo3A+G`aJoloMbr MidezNgi=N%'oRagemT~ 5Al]C]L( LiceM^Mil/N`Ntu+Pe%R>ci=RneioRqueRr!>$S.UcaUp{aX*a2Ab&/Acej Adu$rAfeg Aje$AmaAnc ApoAs{oAt?Av E*oEm(Epid EvoIagemIboIcicloId-%Ilog@Ind!eIploItur Iunf&Oc Ombe)OvaUnfoUque2B~ C<oDoLipaPiRboRm>quesaT` T|i&:7V 3Bigo0HaId!eIf|me3Olog@SoTigaUbu0A=InaUfru':C*aDi G o,I=,LaL-%Lid!eLo[sN)gemQu{oR<d>e)Rr(Sc~ Sil]S,u+Z Zio3A=D Ge.Ic~ L{oLhiceLu=Nce=rNdav&N( Nt[Rb&Rd!eRe?Rg}h>m`/RnizRs R%n%SpaSti=T|i&3Adu$AgemAj Atu+Br?D{aDr @ElaGaG-%Gi G| L ejoNcoNhe)NilOle)R!>tudeSi.S$Tr&V{oZ*/5A=rArG&L<%LeibolL)gemLumo,Nt!e5L$Vuz`a::D[zRope3QueRe.Rife3Ng ::Ng#Rp 3BuL?9Mb Olog@5Mbi=";
const checksum = "0x2219000926df7b50d8aa0a3d495826b988287df4657fbd100e6fe596c8f737ac";
let wordlist = null;
/**
 *  The [[link-bip39-pt]] for [mnemonic phrases](link-bip-39).
 *
 *  @_docloc: api/wordlists
 */
class LangPt extends WordlistOwl {
    /**
     *  Creates a new instance of the Portuguese language Wordlist.
     *
     *  This should be unnecessary most of the time as the exported
     *  [[langPt]] should suffice.
     *
     *  @_ignore:
     */
    constructor() {
        super("pt", words, checksum);
    }
    /**
     *  Returns a singleton instance of a ``LangPt``, creating it
     *  if this is the first time being called.
     */
    static wordlist() {
        if (wordlist == null) {
            wordlist = new LangPt();
        }
        return wordlist;
    }
}

const data = "}aE#4A=Yv&co#4N#6G=cJ&SM#66|/Z#4t&kn~46#4K~4q%b9=IR#7l,mB#7W_X2*dl}Uo~7s}Uf&Iw#9c&cw~6O&H6&wx&IG%v5=IQ~8a&Pv#47$PR&50%Ko&QM&3l#5f,D9#4L|/H&tQ;v0~6n]nN<di,AM=W5%QO&ka&ua,hM^tm=zV=JA=wR&+X]7P&NB#4J#5L|/b[dA}tJ<Do&6m&u2[U1&Kb.HM&mC=w0&MW<rY,Hq#6M}QG,13&wP}Jp]Ow%ue&Kg<HP<D9~4k~9T&I2_c6$9T#9/[C5~7O~4a=cs&O7=KK=An&l9$6U$8A&uD&QI|/Y&bg}Ux&F2#6b}E2&JN&kW&kp=U/&bb=Xl<Cj}k+~5J#6L&5z&9i}b4&Fo,ho(X0_g3~4O$Fz&QE<HN=Ww]6/%GF-Vw=tj&/D&PN#9g=YO}cL&Of&PI~5I&Ip=vU=IW#9G;0o-wU}ss&QR<BT&R9=tk$PY_dh&Pq-yh]7T,nj.Xu=EP&76=cI&Fs*Xg}z7$Gb&+I=DF,AF=cA}rL#7j=Dz&3y<Aa$52=PQ}b0(iY$Fa}oL&xV#6U=ec=WZ,xh%RY<dp#9N&Fl&44=WH*A7=sh&TB&8P=07;u+&PK}uh}J5#72)V/=xC,AB$k0&f6;1E|+5=1B,3v]6n&wR%b+&xx]7f=Ol}fl;+D^wG]7E;nB;uh^Ir&l5=JL,nS=cf=g5;u6|/Q$Gc=MH%Hg#5d%M6^86=U+$Gz,l/,ir^5y&Ba&/F-IY&FI&be%IZ#77&PW_Nu$kE(Yf&NX]7Z,Jy&FJ(Xo&Nz#/d=y7&MX<Ag}Z+;nE]Dt(iG#4D=13&Pj~4c%v8&Zo%OL&/X#4W<HR&ie~6J_1O(Y2=y5=Ad*cv_eB#6k&PX:BU#7A;uk&Ft&Fx_dD=U2;vB=U5=4F}+O&GN.HH:9s=b0%NV(jO&IH=JT}Z9=VZ<Af,Kx^4m&uJ%c6,6r;9m#+L}cf%Kh&F3~4H=vP}bu,Hz|++,1w]nv}k6;uu$jw*Kl*WX&uM[x7&Fr[m7$NO&QN]hu=JN}nR^8g#/h(ps|KC;vd}xz=V0}p6&FD$G1#7K<bG_4p~8g&cf;u4=tl}+k%5/}fz;uw<cA=u1}gU}VM=LJ=eX&+L&Pr#4U}p2:nC,2K]7H:jF&9x}uX#9O=MB<fz~8X~5m&4D&kN&u5%E/(h7(ZF&VG<de(qM|/e-Wt=3x(a+,/R]f/&ND$Ro&nU}0g=KA%kH&NK$Ke<dS}cB&IX~5g$TN]6m=Uv,Is&Py=Ef%Kz#+/%bi&+A<F4$OG&4C&FL#9V<Zk=2I_eE&6c]nw&kq$HG}y+&A8$P3}OH=XP]70%IS(AJ_gH%GZ&tY&AZ=vb~6y&/r=VI=Wv<Zi=fl=xf&eL}c8}OL=MJ=g8$F7=YT}9u=0+^xC}JH&nL^N0~4T]K2,Cy%OC#6s;vG(AC^xe^cG&MF}Br#9P;wD-7h$O/&xA}Fn^PC]6i]7G&8V$Qs;vl(TB~73~4l<mW&6V=2y&uY&+3)aP}XF;LP&kx$wU=t7;uy<FN&lz)7E=Oo*Y+;wI}9q}le;J6&Ri&4t&Qr#8B=cb&vG=J5|Ql(h5<Yy~4+}QD,Lx=wn%K/&RK=dO&Pw,Q9=co%4u;9u}g0@6a^4I%b0=zo|/c&tX=dQ=OS#+b=yz_AB&wB&Pm=W9$HP_gR=62=AO=ti=hI,oA&jr&dH=tm&b6$P2(x8=zi;nG~7F;05]0n[Ix&3m}rg=Xp=cd&uz]7t;97=cN;vV<jf&FF&F1=6Q&Ik*Kk&P4,2z=fQ]7D&3u,H0=d/}Uw<ZN<7R}Kv;0f$H7,MD]7n$F0#88~9Z%da=by;+T#/u=VF&fO&kr^kf<AB]sU,I5$Ng&Pz;0i&QD&vM=Yl:BM;nJ_xJ]U7&Kf&30,3f|Z9*dC)je_jA&Q4&Kp$NH(Yz#6S&Id%Ib=KX,AD=KV%dP}tW&Pk^+E_Ni=cq,3R}VZ(Si=b+}rv;0j}rZ]uA,/w(Sx&Jv$w9&4d&wE,NJ$Gy=J/]Ls#7k<ZQ<Y/&uj]Ov$PM;v3,2F&+u:up=On&3e,Jv;90=J+&Qm]6q}bK#+d~8Y(h2]hA;99&AS=I/}qB&dQ}yJ-VM}Vl&ui,iB&G3|Dc]7d=eQ%dX%JC_1L~4d^NP;vJ&/1)ZI#7N]9X[bQ&PL=0L(UZ,Lm&kc&IR}n7(iR<AQ<dg=33=vN}ft}au]7I,Ba=x9=dR~6R&Tq=Xi,3d$Nr&Bc}DI&ku&vf]Dn,/F&iD,Ll&Nw=0y&I7=Ls=/A&tU=Qe}Ua&uk&+F=g4=gh=Vj#+1&Qn}Uy*44#5F,Pc&Rz*Xn=oh=5W;0n_Nf(iE<Y7=vr=Zu]oz#5Z%mI=kN=Bv_Jp(T2;vt_Ml<FS&uI=L/&6P]64$M7}86<bo%QX(SI%IY&VK=Al&Ux;vv;ut*E/%uh<ZE|O3,M2(yc]yu=Wk&tp:Ex}hr,Cl&WE)+Z=8U}I2_4Q,hA_si=iw=OM=tM=yZ%Ia=U7;wT}b+;uo=Za}yS!5x}HD}fb#5O_dA;Nv%uB(yB;01(Sf}Fk;v7}Pt#8v<mZ#7L,/r&Pl~4w&f5=Ph$Fw_LF&8m,bL=yJ&BH}p/*Jn}tU~5Q;wB(h6]Df]8p^+B;E4&Wc=d+;Ea&bw$8C&FN,DM=Yf}mP~5w=fT#6V=mC=Fi=AV}jB&AN}lW}aH#/D)dZ;hl;vE}/7,CJ;31&w8,hj%u9_Js=jJ&4M~8k=TN&eC}nL&uc-wi&lX}dj=Mv=e2#6u=cr$uq$6G]8W}Jb:nm=Yg<b3(UA;vX&6n&xF=KT,jC,De&R8&oY=Zv&oB]7/=Z2&Oa}bf,hh(4h^tZ&72&Nx;D2&xL~5h~40)ZG)h+=OJ&RA]Bv$yB=Oq=df,AQ%Jn}OJ;11,3z&Tl&tj;v+^Hv,Dh(id=s+]7N&N3)9Q~8f,S4=uW=w4&uX,LX&3d]CJ&yp&8x<b2_do&lP=y/<cy_dG=Oi=7R(VH(lt_1T,Iq_AA;12^6T%k6#8K[B1{oO<AU[Bt;1b$9S&Ps<8T=St{bY,jB(Zp&63&Uv$9V,PM]6v&Af}zW[bW_oq}sm}nB&Kq&gC&ff_eq_2m&5F&TI}rf}Gf;Zr_z9;ER&jk}iz_sn<BN~+n&vo=Vi%97|ZR=Wc,WE&6t]6z%85(ly#84=KY)6m_5/=aX,N3}Tm&he&6K]tR_B2-I3;u/&hU&lH<AP=iB&IA=XL;/5&Nh=wv<BH#79=vS=zl<AA=0X_RG}Bw&9p$NW,AX&kP_Lp&/Z(Tc]Mu}hs#6I}5B&cI<bq&H9#6m=K9}vH(Y1(Y0#4B&w6,/9&gG<bE,/O=zb}I4_l8<B/;wL%Qo<HO[Mq=XX}0v&BP&F4(mG}0i}nm,EC=9u{I3,xG&/9=JY*DK&hR)BX=EI=cx=b/{6k}yX%A+&wa}Xb=la;wi^lL;0t}jo&Qb=xg=XB}iO<qo{bR=NV&8f=a0&Jy;0v=uK)HK;vN#6h&jB(h/%ud&NI%wY.X7=Pt}Cu-uL&Gs_hl%mH,tm]78=Lb^Q0#7Y=1u<Bt&+Q=Co_RH,w3;1e}ux<aU;ui}U3&Q5%bt]63&UQ|0l&uL}O7&3o,AV&dm|Nj(Xt*5+(Uu&Hh(p7(UF=VR=Bp^Jl&Hd[ix)9/=Iq]C8<67]66}mB%6f}bb}JI]8T$HA}db=YM&pa=2J}tS&Y0=PS&y4=cX$6E,hX,XP&nR;04,FQ&l0&Vm_Dv#5Y~8Z=Bi%MA]6x=JO:+p,Az&9q,Hj~6/}SD=K1:EJ}nA;Qo#/E]9R,Ie&6X%W3]61&v4=xX_MC=0q;06(Xq=fs}IG}Dv=0l}o7$iZ;9v&LH&DP-7a&OY,SZ,Kz,Cv&dh=fx|Nh,F/~7q=XF&w+;9n&Gw;0h}Z7<7O&JK(S7&LS<AD<ac=wo<Dt&zw%4B=4v#8P;9o~6p*vV=Tm,Or&I6=1q}nY=P0=gq&Bl&Uu,Ch%yb}UY=zh}dh}rl(T4_xk(YA#8R*xH,IN}Jn]7V}C4&Ty}j3]7p=cL=3h&wW%Qv<Z3=f0&RI&+S(ic_zq}oN&/Y=z1;Td=LW=0e=OI(Vc,+b^ju(UL;0r:Za%8v=Rp=zw&58&73&wK}qX]6y&8E)a2}WR=wP^ur&nQ<cH}Re=Aq&wk}Q0&+q=PP,Gc|/d^k5,Fw]8Y}Pg]p3=ju=ed}r5_yf&Cs]7z$/G<Cm&Jp&54_1G_gP_Ll}JZ;0u]k8_7k(Sg]65{9i=LN&Sx&WK,iW&fD&Lk{9a}Em-9c#8N&io=sy]8d&nT&IK(lx#7/$lW(Td<s8~49,3o<7Y=MW(T+_Jr&Wd,iL}Ct=xh&5V;v4&8n%Kx=iF&l2_0B{B+,If(J0,Lv;u8=Kx-vB=HC&vS=Z6&fU&vE^xK;3D=4h=MR#45:Jw;0d}iw=LU}I5=I0]gB*im,K9}GU,1k_4U&Tt=Vs(iX&lU(TF#7y,ZO}oA&m5#5P}PN}Uz=hM<B1&FB<aG,e6~7T<tP(UQ_ZT=wu&F8)aQ]iN,1r_Lo&/g:CD}84{J1_Ki&Na&3n$jz&FE=dc;uv;va}in}ll=fv(h1&3h}fp=Cy}BM(+E~8m}lo%v7=hC(T6$cj=BQ=Bw(DR,2j=Ks,NS|F+;00=fU=70}Mb(YU;+G&m7&hr=Sk%Co]t+(X5_Jw}0r}gC(AS-IP&QK<Z2#8Q$WC]WX}T2&pG_Ka,HC=R4&/N;Z+;ch(C7,D4$3p_Mk&B2$8D=n9%Ky#5z(CT&QJ#7B]DC]gW}nf~5M;Iw#80}Tc_1F#4Z-aC}Hl=ph=fz,/3=aW}JM}nn;DG;vm}wn,4P}T3;wx&RG$u+}zK=0b;+J_Ek{re<aZ=AS}yY#5D]7q,Cp}xN=VP*2C}GZ}aG~+m_Cs=OY#6r]6g<GS}LC(UB=3A=Bo}Jy<c4}Is;1P<AG}Op<Z1}ld}nS=1Z,yM&95&98=CJ(4t:2L$Hk=Zo}Vc;+I}np&N1}9y=iv}CO*7p=jL)px]tb^zh&GS&Vl%v/;vR=14=zJ&49|/f]hF}WG;03=8P}o/&Gg&rp;DB,Kv}Ji&Pb;aA^ll(4j%yt}+K$Ht#4y&hY]7Y<F1,eN}bG(Uh%6Z]t5%G7;+F_RE;it}tL=LS&Da=Xx(S+(4f=8G=yI}cJ}WP=37=jS}pX}hd)fp<A8=Jt~+o$HJ=M6}iX=g9}CS=dv=Cj(mP%Kd,xq|+9&LD(4/=Xm&QP=Lc}LX&fL;+K=Op(lu=Qs.qC:+e&L+=Jj#8w;SL]7S(b+#4I=c1&nG_Lf&uH;+R)ZV<bV%B/,TE&0H&Jq&Ah%OF&Ss(p2,Wv&I3=Wl}Vq;1L&lJ#9b_1H=8r=b8=JH(SZ=hD=J2#7U,/U#/X~6P,FU<eL=jx,mG=hG=CE&PU=Se(qX&LY=X6=y4&tk&QQ&tf=4g&xI}W+&mZ=Dc#7w}Lg;DA;wQ_Kb(cJ=hR%yX&Yb,hw{bX_4X;EP;1W_2M}Uc=b5(YF,CM&Tp^OJ{DD]6s=vF=Yo~8q}XH}Fu%P5(SJ=Qt;MO]s8<F3&B3&8T(Ul-BS*dw&dR<87}/8]62$PZ]Lx<Au}9Q]7c=ja=KR,Go,Us&v6(qk}pG&G2=ev^GM%w4&H4]7F&dv]J6}Ew:9w=sj-ZL}Ym$+h(Ut(Um~4n=Xs(U7%eE=Qc_JR<CA#6t<Fv|/I,IS,EG<F2(Xy$/n<Fa(h9}+9_2o&N4#7X<Zq|+f_Dp=dt&na,Ca=NJ)jY=8C=YG=s6&Q+<DO}D3=xB&R1(lw;Qn<bF(Cu|/B}HV=SS&n7,10&u0]Dm%A6^4Q=WR(TD=Xo<GH,Rj(l8)bP&n/=LM&CF,F5&ml=PJ;0k=LG=tq,Rh,D6@4i=1p&+9=YC%er_Mh;nI;0q=Fw]80=xq=FM$Gv;v6&nc;wK%H2&Kj;vs,AA=YP,66}bI(qR~5U=6q~4b$Ni=K5.X3$So&Iu(p+]8G=Cf=RY(TS_O3(iH&57=fE=Dg_Do#9z#7H;FK{qd_2k%JR}en&gh_z8;Rx}9p<cN_Ne,DO;LN_7o~/p=NF=5Y}gN<ce<C1,QE]Wv=3u<BC}GK]yq}DY&u/_hj=II(pz&rC,jV&+Z}ut=NQ;Cg-SR_ZS,+o=u/;Oy_RK_QF(Fx&xP}Wr&TA,Uh&g1=yr{ax[VF$Pg(YB;Ox=Vy;+W(Sp}XV%dd&33(l/]l4#4Y}OE=6c=bw(A7&9t%wd&N/&mo,JH&Qe)fm=Ao}fu=tH";
const deltaData = "FAZDC6BALcLZCA+GBARCW8wNCcDDZ8LVFBOqqDUiou+M42TFAyERXFb7EjhP+vmBFpFrUpfDV2F7eB+eCltCHJFWLFCED+pWTojEIHFXc3aFn4F68zqjEuKidS1QBVPDEhE7NA4mhMF7oThD49ot3FgtzHFCK0acW1x8DH1EmLoIlrWFBLE+y5+NA3Cx65wJHTaEZVaK1mWAmPGxgYCdxwOjTDIt/faOEhTl1vqNsKtJCOhJWuio2g07KLZEQsFBUpNtwEByBgxFslFheFbiEPvi61msDvApxCzB6rBCzox7joYA5UdDc+Cb4FSgIabpXFAj3bjkmFAxCZE+mD/SFf/0ELecYCt3nLoxC6WEZf2tKDB4oZvrEmqFkKk7BwILA7gtYBpsTq//D4jD0F0wEB9pyQ1BD5Ba0oYHDI+sbDFhvrHXdDHfgFEIJLi5r8qercNFBgFLC4bo5ERJtamWBDFy73KCEb6M8VpmEt330ygCTK58EIIFkYgF84gtGA9Uyh3m68iVrFbWFbcbqiCYHZ9J1jeRPbL8yswhMiDbhEhdNoSwFbZrLT740ABEqgCkO8J1BLd1VhKKR4sD1yUo0z+FF59Mvg71CFbyEhbHSFBKEIKyoQNgQppq9T0KAqePu0ZFGrXOHdKJqkoTFhYvpDNyuuznrN84thJbsCoO6Cu6Xlvntvy0QYuAExQEYtTUBf3CoCqwgGFZ4u1HJFzDVwEy3cjcpV4QvsPaBC3rCGyCF23o4K3pp2gberGgFEJEHo4nHICtyKH2ZqyxhN05KBBJIQlKh/Oujv/DH32VrlqFdIFC7Fz9Ct4kaqFME0UETLprnN9kfy+kFmtQBB0+5CFu0N9Ij8l/VvJDh2oq3hT6EzjTHKFN7ZjZwoTsAZ4Exsko6Fpa6WC+sduz8jyrLpegTv2h1EBeYpLpm2czQW0KoCcS0bCVXCmuWJDBjN1nQNLdF58SFJ0h7i3pC3oEOKy/FjBklL70XvBEEIWp2yZ04xObzAWDDJG7f+DbqBEA7LyiR95j7MDVdDViz2RE5vWlBMv5e4+VfhP3aXNPhvLSynb9O2x4uFBV+3jqu6d5pCG28/sETByvmu/+IJ0L3wb4rj9DNOLBF6XPIODr4L19U9RRofAG6Nxydi8Bki8BhGJbBAJKzbJxkZSlF9Q2Cu8oKqggB9hBArwLLqEBWEtFowy8XK8bEyw9snT+BeyFk1ZCSrdmgfEwFePTgCjELBEnIbjaDDPJm36rG9pztcEzT8dGk23SBhXBB1H4z+OWze0ooFzz8pDBYFvp9j9tvFByf9y4EFdVnz026CGR5qMr7fxMHN8UUdlyJAzlTBDRC28k+L4FB8078ljyD91tUj1ocnTs8vdEf7znbzm+GIjEZnoZE5rnLL700Xc7yHfz05nWxy03vBB9YGHYOWxgMQGBCR24CVYNE1hpfKxN0zKnfJDmmMgMmBWqNbjfSyFCBWSCGCgR8yFXiHyEj+VtD1FB3FpC1zI0kFbzifiKTLm9yq5zFmur+q8FHqjoOBWsBPiDbnCC2ErunV6cJ6TygXFYHYp7MKN9RUlSIS8/xBAGYLzeqUnBF4QbsTuUkUqGs6CaiDWKWjQK9EJkjpkTmNCPYXL";
const _wordlist = {
    zh_cn: null,
    zh_tw: null,
};
const Checks = {
    zh_cn: "0x17bcc4d8547e5a7135e365d1ab443aaae95e76d8230c2782c67305d4f21497a1",
    zh_tw: "0x51e720e90c7b87bec1d70eb6e74a21a449bd3ec9c020b01d3a40ed991b60ce5d",
};
const codes = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const style = "~!@#$%^&*_-=[]{}|;:,.()<>?";
function loadWords(locale) {
    if (_wordlist[locale] != null) {
        return _wordlist[locale];
    }
    const wordlist = [];
    let deltaOffset = 0;
    for (let i = 0; i < 2048; i++) {
        const s = style.indexOf(data[i * 3]);
        const bytes = [
            228 + (s >> 2),
            128 + codes.indexOf(data[i * 3 + 1]),
            128 + codes.indexOf(data[i * 3 + 2]),
        ];
        if (locale === "zh_tw") {
            const common = s % 4;
            for (let i = common; i < 3; i++) {
                bytes[i] =
                    codes.indexOf(deltaData[deltaOffset++]) + (i == 0 ? 228 : 128);
            }
        }
        wordlist.push(toUtf8String(new Uint8Array(bytes)));
    }
    // Verify the computed list matches the official list
    const checksum = id(wordlist.join("\n") + "\n");
    /* c8 ignore start */
    if (checksum !== Checks[locale]) {
        throw new Error(`BIP39 Wordlist for ${locale} (Chinese) FAILED`);
    }
    /* c8 ignore stop */
    _wordlist[locale] = wordlist;
    return wordlist;
}
const wordlists = {};
/**
 *  The [[link-bip39-zh_cn]] and [[link-bip39-zh_tw]] for
 *  [mnemonic phrases](link-bip-39).
 *
 *  @_docloc: api/wordlists
 */
class LangZh extends Wordlist {
    /**
     *  Creates a new instance of the Chinese language Wordlist for
     *  the %%dialect%%, either ``"cn"`` or ``"tw"`` for simplified
     *  or traditional, respectively.
     *
     *  This should be unnecessary most of the time as the exported
     *  [[langZhCn]] and [[langZhTw]] should suffice.
     *
     *  @_ignore:
     */
    constructor(dialect) {
        super("zh_" + dialect);
    }
    getWord(index) {
        const words = loadWords(this.locale);
        assertArgument(index >= 0 && index < words.length, `invalid word index: ${index}`, "index", index);
        return words[index];
    }
    getWordIndex(word) {
        return loadWords(this.locale).indexOf(word);
    }
    split(phrase) {
        phrase = phrase.replace(/(?:\u3000| )+/g, "");
        return phrase.split("");
    }
    /**
     *  Returns a singleton instance of a ``LangZh`` for %%dialect%%,
     *  creating it if this is the first time being called.
     *
     *  Use the %%dialect%% ``"cn"`` or ``"tw"`` for simplified or
     *  traditional, respectively.
     */
    static wordlist(dialect) {
        if (wordlists[dialect] == null) {
            wordlists[dialect] = new LangZh(dialect);
        }
        return wordlists[dialect];
    }
}

export { LangCz, LangEs, LangFr, LangIt, LangJa, LangKo, LangPt, LangZh };
//# sourceMappingURL=wordlists-extra.js.map
