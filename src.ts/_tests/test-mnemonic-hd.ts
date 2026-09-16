/**
 *  Mnemonic, HD wallet and keystore-interop tests.
 *
 *  Three things make this layer different from upstream ethers, and most of
 *  what follows exists to pin them down:
 *
 *    - Keys are Ed448/Goldilocks: 57-byte private keys, 57-byte public keys
 *      and 171-byte signatures. There is no secp256k1 anywhere.
 *
 *    - Addresses are 22-byte ICAN addresses carrying a network prefix, so one
 *      key renders as three different addresses ("cb" mainnet, "ab" devin,
 *      "ce" private) that share a common 20-byte body.
 *
 *    - Derivation is flat. The Ed448 primitive walks straight from the seed to
 *      ``m/44'/654'/0'/0/<index>`` (Core's coin type is 654) and the
 *      intermediate BIP-44 nodes are never materialised. Only that one path
 *      shape, plus the legacy coin-type-60 spelling kept for old keystores, is
 *      accepted; every other path is refused rather than silently answered
 *      with an unrelated account's key. That strictness is deliberate.
 *
 *  Existing coverage lives in test-keystore.ts (keystore formats and KDF
 *  limits), test-wordlists.ts (non-English wordlists) and test-golden.ts
 *  (pinned derivation vectors); this file avoids repeating them.
 *
 *  Every key here is derived from fixed test material. None of it is secret.
 */
import assert from "node:assert/strict";

import {
	HDNodeWallet,
	LangEn,
	Mnemonic,
	Wallet,
	decryptKeystoreJson,
	decryptKeystoreJsonSync,
	defaultPath,
	encryptKeystoreJsonSync,
	getAccountPath,
	getAddress,
	getBytes,
	getIndexedAccountPath,
	isKeystoreJson,
	networkIdToPrefix,
	verifyMessage,
	wordlists,
} from "../index.js";

/** 16 bytes of fixed entropy and the 12-word phrase it encodes. */
const ENTROPY_12 = "0x" + "0f".repeat(16);
const PHRASE_12 =
	"audit journey sense bulk valley maple destroy tiger audit journey sense cable";

/** The BIP-39 seed for PHRASE_12 with the default (empty) password. */
const SEED_12 =
	"d3b73ade1ae372466c16e7914aedf56964543ab3fce9939214404ef5d217e77552f615a504173505cc85c75976b685d6fc82700054428376d96aba77daf04267";

/** Account 0 of PHRASE_12, rendered on each network. */
const ADDRESS_0 = {
	cb: "0xcb92fc0f6ce594fb25f4291993cb1dde696565303a03",
	ab: "0xab13fc0f6ce594fb25f4291993cb1dde696565303a03",
	ce: "0xce83fc0f6ce594fb25f4291993cb1dde696565303a03",
} as const;

const PREFIXES = [
	{ prefix: "cb", networkId: 1, label: "mainnet" },
	{ prefix: "ab", networkId: 3, label: "devin" },
	{ prefix: "ce", networkId: 0, label: "private" },
] as const;

const PREFIX = "cb";

/** Entropy size (bytes) and the word count it encodes, for every strength. */
const STRENGTHS = [
	{ bytes: 16, words: 12 },
	{ bytes: 20, words: 15 },
	{ bytes: 24, words: 18 },
	{ bytes: 28, words: 21 },
	{ bytes: 32, words: 24 },
] as const;

/** Cheap scrypt parameters; the default N of 2**17 is not needed to prove a
 *  round trip and encryptKeystoreJson* is the only API that accepts them. */
const LOW_COST = { scrypt: { N: 16, r: 1, p: 1 } };

const HardenedBit = 0x80000000;

function hd(prefix: string = PREFIX): HDNodeWallet {
	return HDNodeWallet.fromPhrase({ phrase: PHRASE_12, prefix });
}

/** The account object HDNodeWallet.encrypt builds internally, so keystore
 *  shape can be exercised without paying for default-cost scrypt. */
function hdAccount(wallet: HDNodeWallet) {
	return {
		address: wallet.address,
		privateKey: wallet.privateKey,
		mnemonic: {
			path: wallet.path as string,
			locale: "en",
			entropy: wallet.mnemonic!.entropy,
		},
	};
}

describe("Mnemonic: phrase and entropy encoding", () => {
	it("encodes fixed entropy as the expected 12-word phrase", () => {
		const mnemonic = Mnemonic.fromEntropy(ENTROPY_12);
		assert.equal(mnemonic.phrase, PHRASE_12);
		assert.equal(mnemonic.entropy, ENTROPY_12);
		assert.equal(mnemonic.password, "");
		assert.equal(mnemonic.wordlist, LangEn.wordlist());
		assert.equal(mnemonic.wordlist.locale, "en");
	});

	it("supports every BIP-39 strength from 12 to 24 words", () => {
		for (const { bytes, words } of STRENGTHS) {
			const entropy = "0x" + "0f".repeat(bytes);
			const mnemonic = Mnemonic.fromEntropy(entropy);
			assert.equal(
				mnemonic.phrase.split(" ").length,
				words,
				`${bytes} bytes must encode ${words} words`,
			);
			assert.equal(mnemonic.entropy, entropy);
		}
	});

	it("round-trips entropy -> phrase -> entropy at every strength", () => {
		for (const { bytes, words } of STRENGTHS) {
			for (const fill of ["00", "ff", "5a", "0f"]) {
				const entropy = "0x" + fill.repeat(bytes);
				const phrase = Mnemonic.fromEntropy(entropy).phrase;
				assert.equal(phrase.split(" ").length, words);
				assert.equal(
					Mnemonic.fromPhrase({ phrase }).entropy,
					entropy,
					`${bytes}/${fill}`,
				);
				assert.equal(Mnemonic.phraseToEntropy(phrase), entropy);
				assert.equal(Mnemonic.entropyToPhrase(entropy), phrase);
			}
		}
	});

	it("emits only words drawn from the wordlist", () => {
		const wordlist = LangEn.wordlist();
		for (const { bytes } of STRENGTHS) {
			const phrase = Mnemonic.fromEntropy("0x" + "5a".repeat(bytes)).phrase;
			for (const word of phrase.split(" ")) {
				assert.ok(wordlist.getWordIndex(word) >= 0, `unknown word ${word}`);
			}
			// Single spaces, no leading or trailing whitespace.
			assert.equal(phrase, phrase.trim());
			assert.ok(!phrase.includes("  "));
		}
	});

	it("accepts entropy as bytes as well as a hex string", () => {
		assert.equal(
			Mnemonic.fromEntropy(getBytes(ENTROPY_12)).phrase,
			PHRASE_12,
			"Uint8Array",
		);
		assert.equal(
			Mnemonic.fromEntropy(getBytes(ENTROPY_12)).entropy,
			ENTROPY_12,
		);
	});

	it("rejects entropy that is not a well-formed BytesLike", () => {
		for (const value of [
			"0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f", // no 0x
			"0x0f0", // odd length
			"hello",
			1234,
			null,
			undefined,
			{},
		]) {
			assert.throws(
				() => Mnemonic.fromEntropy(value as any),
				/invalid BytesLike value/,
				JSON.stringify(value),
			);
		}
	});

	it("rejects every entropy size outside 16-32 bytes in 4-byte steps", () => {
		for (const bytes of [0, 4, 8, 12, 15, 17, 18, 31, 33, 36, 64]) {
			assert.throws(
				() => Mnemonic.fromEntropy("0x" + "00".repeat(bytes)),
				/invalid entropy size/,
				`${bytes} bytes`,
			);
		}
	});

	it("keeps the constructor private", () => {
		assert.throws(
			() => new (Mnemonic as any)({}, ENTROPY_12, PHRASE_12),
			/private constructor/,
		);
	});
});

describe("Mnemonic: checksum and validation", () => {
	it("rejects word counts that are not 12, 15, 18, 21 or 24", () => {
		for (const count of [1, 2, 3, 6, 9, 11, 13, 14, 16, 23, 25, 27, 30]) {
			const phrase = Array(count).fill("abandon").join(" ");
			assert.throws(
				() => Mnemonic.fromPhrase({ phrase }),
				/invalid mnemonic length/,
				`${count} words`,
			);
			assert.equal(Mnemonic.isValidMnemonic(phrase), false, `${count} words`);
		}
		assert.throws(
			() => Mnemonic.fromPhrase({ phrase: "" }),
			/invalid mnemonic length/,
		);
	});

	it("names the index of the first word outside the wordlist", () => {
		const words = PHRASE_12.split(" ");
		for (const index of [0, 1, 5, 11]) {
			const bad = [...words];
			bad[index] = "notaword";
			assert.throws(
				() => Mnemonic.fromPhrase({ phrase: bad.join(" ") }),
				new RegExp(`invalid mnemonic word at index ${index}`),
			);
			assert.equal(Mnemonic.isValidMnemonic(bad.join(" ")), false);
		}
	});

	it("reports the earliest unknown word when several are unknown", () => {
		const words = PHRASE_12.split(" ");
		words[3] = "notaword";
		words[8] = "alsonotaword";
		assert.throws(
			() => Mnemonic.fromPhrase({ phrase: words.join(" ") }),
			/invalid mnemonic word at index 3/,
		);
	});

	it("rejects a valid-length phrase whose checksum is wrong", () => {
		for (const { bytes, words } of STRENGTHS) {
			const phrase = Mnemonic.fromEntropy("0x" + "0f".repeat(bytes)).phrase;
			const parts = phrase.split(" ");
			// Replacing the final word changes the checksum bits.
			parts[words - 1] = parts[words - 1] === "abandon" ? "ability" : "abandon";
			assert.throws(
				() => Mnemonic.fromPhrase({ phrase: parts.join(" ") }),
				/invalid mnemonic checksum/,
				`${words} words`,
			);
			assert.equal(Mnemonic.isValidMnemonic(parts.join(" ")), false);
		}
	});

	it("rejects the all-'abandon' phrase at every length", () => {
		// A run of the first word is a valid encoding of zero entropy only when
		// the trailing checksum word is right, so these must all fail.
		for (const count of [12, 15, 18, 21, 24]) {
			const phrase = Array(count).fill("abandon").join(" ");
			assert.throws(
				() => Mnemonic.fromPhrase({ phrase }),
				/invalid mnemonic checksum/,
				`${count} words`,
			);
		}
	});

	it("accepts the all-'abandon' phrase once the checksum word is correct", () => {
		for (const { bytes, words } of STRENGTHS) {
			const entropy = "0x" + "00".repeat(bytes);
			const phrase = Mnemonic.fromEntropy(entropy).phrase;
			const parts = phrase.split(" ");
			assert.deepEqual(
				parts.slice(0, words - 1),
				Array(words - 1).fill("abandon"),
			);
			assert.notEqual(parts[words - 1], "abandon", "checksum word differs");
			assert.equal(Mnemonic.fromPhrase({ phrase }).entropy, entropy);
		}
	});

	it("catches almost every single-word substitution via the checksum", () => {
		// The checksum is words/3 bits, so for 12 words roughly 1 substitution
		// in 16 is expected to survive. Pin the rate rather than perfection.
		const words = PHRASE_12.split(" ");
		let accepted = 0;
		let total = 0;
		for (let i = 0; i < words.length; i++) {
			for (const candidate of ["abandon", "ability", "zoo", "zebra"]) {
				if (candidate === words[i]) {
					continue;
				}
				const swapped = [...words];
				swapped[i] = candidate;
				total++;
				if (Mnemonic.isValidMnemonic(swapped.join(" "))) {
					accepted++;
				}
			}
		}
		assert.equal(total, 48);
		assert.ok(accepted / total < 0.15, `acceptance rate ${accepted}/${total}`);
	});

	it("answers isValidMnemonic without throwing for any input", () => {
		assert.equal(Mnemonic.isValidMnemonic(PHRASE_12), true);
		assert.equal(Mnemonic.isValidMnemonic(PHRASE_12.toUpperCase()), true);
		for (const value of [
			"",
			"not a real mnemonic phrase at all here ok",
			Array(12).fill("abandon").join(" "),
			Array(11).fill("abandon").join(" "),
			null,
			undefined,
			123,
			{},
		]) {
			assert.equal(
				Mnemonic.isValidMnemonic(value as any),
				false,
				JSON.stringify(value),
			);
		}
	});

	it("rejects an English phrase when told to read it with another wordlist", () => {
		assert.equal(Mnemonic.isValidMnemonic(PHRASE_12, wordlists.sk), false);
		assert.throws(
			() => Mnemonic.fromPhrase({ phrase: PHRASE_12, wordlist: wordlists.sk }),
			/invalid mnemonic word at index 0/,
		);
	});

	it("throws rather than leaking the phrase in the error value", () => {
		// The rejected phrase is redacted; error reports must not carry key
		// material into logs.
		for (const phrase of [
			Array(11).fill("abandon").join(" "),
			Array(12).fill("abandon").join(" "),
			"notaword " + Array(11).fill("abandon").join(" "),
		]) {
			assert.throws(
				() => Mnemonic.fromPhrase({ phrase }),
				(error: any) => {
					assert.equal(error.code, "INVALID_ARGUMENT");
					assert.equal(error.argument, "mnemonic");
					assert.equal(error.value, "[ REDACTED ]");
					assert.ok(!error.message.includes("abandon"));
					return true;
				},
			);
		}
	});
});

describe("Mnemonic: phrase normalization", () => {
	it("normalizes case and returns the canonical phrase", () => {
		for (const variant of [
			PHRASE_12,
			PHRASE_12.toUpperCase(),
			PHRASE_12.replace("audit", "Audit"),
		]) {
			const mnemonic = Mnemonic.fromPhrase({ phrase: variant });
			assert.equal(mnemonic.phrase, PHRASE_12);
			assert.equal(mnemonic.entropy, ENTROPY_12);
		}
	});

	it("treats any run of whitespace between words as one separator", () => {
		for (const separator of [
			" ",
			"  ",
			"     ",
			"\t",
			"\n",
			"\r\n",
			" \t ",
			"\u00a0", // no-break space
			"\u3000", // ideographic space
			"\u2009", // thin space
		]) {
			const phrase = PHRASE_12.split(" ").join(separator);
			assert.equal(
				Mnemonic.fromPhrase({ phrase }).phrase,
				PHRASE_12,
				JSON.stringify(separator),
			);
		}
	});

	it("normalizes compatibility-equivalent characters (NFKD)", () => {
		// Full-width Latin letters are compatibility equivalents of ASCII, so
		// a phrase pasted from an IME must still resolve to the same entropy.
		const toFullWidth = (base: number) =>
			PHRASE_12.replace(/[a-z]/g, (c) =>
				String.fromCharCode(c.charCodeAt(0) - 0x61 + base),
			);
		for (const [label, phrase] of [
			["full-width lower", toFullWidth(0xff41)],
			["full-width upper", toFullWidth(0xff21)],
		] as const) {
			assert.notEqual(phrase, PHRASE_12, `${label} really differs`);
			const mnemonic = Mnemonic.fromPhrase({ phrase });
			assert.equal(mnemonic.phrase, PHRASE_12, label);
			assert.equal(mnemonic.entropy, ENTROPY_12, label);
		}
	});

	it("does not trim leading or trailing whitespace", () => {
		// Splitting on whitespace yields an empty leading/trailing token, which
		// pushes the word count off and is refused. Surprising, but refusing is
		// the safe direction: it never guesses at a different phrase.
		for (const phrase of [
			" " + PHRASE_12,
			PHRASE_12 + " ",
			"  " + PHRASE_12 + "  ",
			"\n" + PHRASE_12,
		]) {
			assert.throws(
				() => Mnemonic.fromPhrase({ phrase }),
				/invalid mnemonic length/,
				JSON.stringify(phrase.slice(0, 4)),
			);
		}
	});

	it("does not treat zero-width or combining characters as separators", () => {
		assert.throws(
			() =>
				Mnemonic.fromPhrase({ phrase: PHRASE_12.split(" ").join("\u200b") }),
			/invalid mnemonic length/,
			"zero-width space is not whitespace",
		);
		assert.throws(
			() =>
				Mnemonic.fromPhrase({ phrase: PHRASE_12.replace("audit", "aúdit") }),
			/invalid mnemonic word at index 0/,
			"an accent makes a different word",
		);
	});

	it("throws on a missing or non-string phrase", () => {
		for (const argument of [
			PHRASE_12 as any,
			{},
			{ phrase: null },
			{ phrase: 12 },
			undefined,
		]) {
			assert.throws(() => Mnemonic.fromPhrase(argument as any));
		}
	});
});

describe("Mnemonic: seed derivation and password", () => {
	it("computes a deterministic 64-byte seed", () => {
		const mnemonic = Mnemonic.fromPhrase({ phrase: PHRASE_12 });
		const seed = mnemonic.computeSeed();
		assert.equal(seed, SEED_12);
		assert.match(seed, /^[0-9a-f]{128}$/, "unprefixed lower-case hex");
		assert.equal(seed.length, 128, "64 bytes");
		assert.equal(mnemonic.computeSeed(), seed, "deterministic");
	});

	it("gives every strength its own seed", () => {
		const seeds = STRENGTHS.map(({ bytes }) =>
			Mnemonic.fromEntropy("0x" + "0f".repeat(bytes)).computeSeed(),
		);
		assert.equal(new Set(seeds).size, seeds.length);
		for (const seed of seeds) {
			assert.match(seed, /^[0-9a-f]{128}$/);
		}
	});

	it("folds the password into the seed but not into the entropy", () => {
		const plain = Mnemonic.fromPhrase({ phrase: PHRASE_12 });
		const seen = new Map<string, string>();
		for (const password of [
			"",
			"pw",
			"PW",
			"p w",
			"a longer pass phrase",
			"0",
		]) {
			const mnemonic = Mnemonic.fromPhrase({ phrase: PHRASE_12, password });
			assert.equal(mnemonic.password, password);
			assert.equal(
				mnemonic.phrase,
				PHRASE_12,
				"password must not alter phrase",
			);
			assert.equal(
				mnemonic.entropy,
				plain.entropy,
				"password must not alter entropy",
			);
			seen.set(password, mnemonic.computeSeed());
		}
		assert.equal(seen.get(""), SEED_12);
		assert.equal(
			new Set(seen.values()).size,
			seen.size,
			"each password differs",
		);
	});

	it("treats a null password as the empty string", () => {
		for (const password of [null, undefined]) {
			const mnemonic = Mnemonic.fromPhrase({
				phrase: PHRASE_12,
				password: password as any,
			});
			assert.equal(mnemonic.password, "");
			assert.equal(mnemonic.computeSeed(), SEED_12);
		}
		assert.equal(
			Mnemonic.fromEntropy(ENTROPY_12, null).computeSeed(),
			SEED_12,
			"fromEntropy takes the password positionally",
		);
		assert.equal(
			Mnemonic.fromEntropy(ENTROPY_12, "pw").computeSeed(),
			Mnemonic.fromPhrase({ phrase: PHRASE_12, password: "pw" }).computeSeed(),
		);
	});

	it("agrees with the HDNodeWallet.mnemonicToSeed helper", () => {
		assert.equal(HDNodeWallet.mnemonicToSeed(PHRASE_12), SEED_12);
		assert.equal(
			HDNodeWallet.mnemonicToSeed(PHRASE_12, "pw"),
			Mnemonic.fromPhrase({ phrase: PHRASE_12, password: "pw" }).computeSeed(),
		);
		assert.equal(
			HDNodeWallet.mnemonicToSeed(PHRASE_12, ""),
			HDNodeWallet.mnemonicToSeed(PHRASE_12),
		);
	});

	it("derives the seed from the canonical phrase, so spelling cannot matter", () => {
		// The raw helper hashes whatever string it is handed, which is why
		// callers should go through Mnemonic/HDNodeWallet: those normalize
		// first, so case and spacing cannot fork the wallet.
		assert.notEqual(
			HDNodeWallet.mnemonicToSeed(PHRASE_12.toUpperCase()),
			SEED_12,
			"the raw helper is case sensitive",
		);
		for (const variant of [
			PHRASE_12.toUpperCase(),
			PHRASE_12.split(" ").join("   "),
			PHRASE_12.split(" ").join("\t"),
		]) {
			assert.equal(
				Mnemonic.fromPhrase({ phrase: variant }).computeSeed(),
				SEED_12,
				JSON.stringify(variant.slice(0, 12)),
			);
		}
	});
});

describe("HDNodeWallet: construction and metadata", () => {
	it("reports the canonical path and flat-derivation metadata", () => {
		const wallet = hd();
		assert.equal(wallet.path, "m/44'/654'/0'/0/0");
		assert.equal(wallet.path, defaultPath);
		assert.equal(wallet.index, 0);
		assert.equal(wallet.depth, 5, "the path has five components");
		assert.equal(
			wallet.parentFingerprint,
			"0x00000000",
			"there is no materialised parent node",
		);
		assert.match(wallet.fingerprint, /^0x[0-9a-f]{8}$/);
		assert.equal(wallet.fingerprint, "0x8f914b02");
		assert.equal(wallet.hasPath(), true);
		assert.equal(wallet.provider, null);
		assert.equal(wallet.prefix, PREFIX);
	});

	it("carries Ed448 key material, not secp256k1", () => {
		const wallet = hd();
		assert.equal((wallet.privateKey.length - 2) / 2, 57, "57-byte private key");
		assert.equal((wallet.publicKey.length - 2) / 2, 57, "57-byte public key");
		assert.match(wallet.privateKey, /^0x[0-9a-f]{114}$/);
		assert.match(wallet.publicKey, /^0x[0-9a-f]{114}$/);
		assert.equal(wallet.publicKey, wallet.signingKey.publicKey);
	});

	it("produces a canonical 22-byte ICAN address", () => {
		const wallet = hd();
		assert.equal(wallet.address, ADDRESS_0.cb);
		assert.equal(wallet.address.length, 46, "0x + 44 hex characters");
		assert.equal(getAddress(wallet.address), wallet.address, "canonical");
		assert.equal(wallet.address.substring(2, 4), "cb");
	});

	it("keeps the mnemonic it was built from", () => {
		const wallet = hd();
		assert.ok(wallet.mnemonic);
		assert.equal(wallet.mnemonic!.phrase, PHRASE_12);
		assert.equal(wallet.mnemonic!.entropy, ENTROPY_12);
		assert.equal(wallet.mnemonic!.password, "");
		assert.equal(wallet.mnemonic!.wordlist.locale, "en");
	});

	it("agrees across fromPhrase, fromMnemonic, fromSeed and Wallet", () => {
		const expected = hd();
		const mnemonic = Mnemonic.fromPhrase({ phrase: PHRASE_12 });
		const candidates: Array<[string, HDNodeWallet]> = [
			["fromMnemonic", HDNodeWallet.fromMnemonic(mnemonic, PREFIX)],
			["fromSeed", HDNodeWallet.fromSeed({ seed: SEED_12, prefix: PREFIX })],
			[
				"Wallet.fromPhrase",
				Wallet.fromPhrase({ phrase: PHRASE_12, prefix: PREFIX }),
			],
			["Wallet.fromSeed", Wallet.fromSeed({ seed: SEED_12, prefix: PREFIX })],
		];
		for (const [label, wallet] of candidates) {
			assert.equal(wallet.privateKey, expected.privateKey, label);
			assert.equal(wallet.address, ADDRESS_0.cb, label);
			assert.equal(wallet.path, defaultPath, label);
			assert.equal(wallet.depth, 5, label);
			assert.ok(wallet instanceof HDNodeWallet, `${label} is an HDNodeWallet`);
		}
	});

	it("has no mnemonic when built from a bare seed", () => {
		const wallet = HDNodeWallet.fromSeed({ seed: SEED_12, prefix: PREFIX });
		assert.equal(wallet.mnemonic, null);
		assert.equal(wallet.path, defaultPath, "the path is still known");
		assert.equal(wallet.hasPath(), true);
	});

	it("honours an explicit path in fromMnemonic, fromSeed and createRandom", () => {
		const mnemonic = Mnemonic.fromPhrase({ phrase: PHRASE_12 });
		const expected = hd().deriveChild(3);
		for (const [label, wallet] of [
			[
				"fromMnemonic",
				HDNodeWallet.fromMnemonic(mnemonic, PREFIX, getIndexedAccountPath(3)),
			],
			[
				"fromSeed",
				HDNodeWallet.fromSeed({
					seed: SEED_12,
					prefix: PREFIX,
					path: getIndexedAccountPath(3),
				}),
			],
			[
				"Wallet.fromSeed",
				Wallet.fromSeed({
					seed: SEED_12,
					prefix: PREFIX,
					path: getIndexedAccountPath(3),
				}),
			],
		] as Array<[string, HDNodeWallet]>) {
			assert.equal(wallet.privateKey, expected.privateKey, label);
			assert.equal(wallet.path, "m/44'/654'/0'/0/3", label);
			assert.equal(wallet.index, 3, label);
		}
		assert.equal(
			HDNodeWallet.createRandom(PREFIX, "", getIndexedAccountPath(4)).path,
			"m/44'/654'/0'/0/4",
		);
	});

	it("folds the mnemonic password into the derived key", () => {
		const plain = hd();
		const guarded = HDNodeWallet.fromPhrase({
			phrase: PHRASE_12,
			prefix: PREFIX,
			password: "pw",
		});
		assert.notEqual(guarded.privateKey, plain.privateKey);
		assert.notEqual(guarded.address, plain.address);
		assert.equal(guarded.mnemonic!.entropy, plain.mnemonic!.entropy);
		assert.equal(guarded.mnemonic!.password, "pw");
		assert.equal(guarded.path, defaultPath, "the path is unchanged");
	});

	it("creates independent random wallets with 24-word mnemonics", () => {
		const wallets = [
			HDNodeWallet.createRandom(PREFIX),
			HDNodeWallet.createRandom(PREFIX),
			Wallet.createRandom(PREFIX),
		];
		for (const wallet of wallets) {
			assert.ok(wallet instanceof HDNodeWallet);
			assert.equal(wallet.mnemonic!.phrase.split(" ").length, 24);
			assert.equal((wallet.mnemonic!.entropy.length - 2) / 2, 32);
			assert.equal(wallet.path, defaultPath);
			assert.equal(wallet.depth, 5);
			assert.equal(getAddress(wallet.address), wallet.address);
		}
		assert.equal(new Set(wallets.map((w) => w.address)).size, wallets.length);
	});

	it("copies all metadata through connect", () => {
		const wallet = hd();
		const connected = wallet.connect(null);
		assert.ok(connected instanceof HDNodeWallet);
		assert.notEqual(connected, wallet, "a new instance");
		for (const key of [
			"privateKey",
			"publicKey",
			"address",
			"path",
			"index",
			"depth",
			"fingerprint",
			"parentFingerprint",
			"prefix",
		] as const) {
			assert.equal((connected as any)[key], (wallet as any)[key], key);
		}
		assert.equal(connected.mnemonic, wallet.mnemonic);
		// The seed survives, so the reconnected wallet can still derive.
		assert.equal(
			connected.deriveChild(6).privateKey,
			wallet.deriveChild(6).privateKey,
		);
	});

	it("keeps the constructor private", () => {
		assert.throws(
			() =>
				new (HDNodeWallet as any)({
					guard: {},
					seed: SEED_12,
					signingKey: hd().signingKey,
					parentFingerprint: "0x00000000",
					path: defaultPath,
					index: 0,
					depth: 5,
					mnemonic: null,
					provider: null,
					prefix: PREFIX,
				}),
			/private constructor/,
		);
	});

	it("exposes no BIP-32 extended-key surface", () => {
		// Ed448 derivation carries no chain code, so there is nothing to
		// serialise as an xprv/xpub and no neutered variant to hand out. Pin
		// the absence so a half-ported BIP-32 API cannot appear unnoticed.
		const wallet = hd() as any;
		for (const name of [
			"chainCode",
			"extendedKey",
			"neuter",
			"publicExtendedKey",
		]) {
			assert.equal(wallet[name], undefined, name);
		}
		for (const name of ["fromExtendedKey", "fromMnemonicPhrase"]) {
			assert.equal((HDNodeWallet as any)[name], undefined, name);
		}
		assert.deepEqual(
			Object.getOwnPropertyNames(HDNodeWallet)
				.filter((n) => !["length", "name", "prototype"].includes(n))
				.sort(),
			[
				"createRandom",
				"fromMnemonic",
				"fromPhrase",
				"fromSeed",
				"mnemonicToSeed",
			],
		);
	});

	it("signs with the derived Ed448 key", async () => {
		const child = hd().deriveChild(3);
		const signature = await child.signMessage("hello");
		assert.equal((signature.length - 2) / 2, 171, "171-byte Ed448 signature");
		assert.equal(verifyMessage("hello", signature, PREFIX), child.address);
	});
});

describe("HDNodeWallet: account derivation", () => {
	it("gives every index a distinct key, public key and address", () => {
		// A regression guard: indices once collided onto one key, which would
		// silently merge every account in a wallet into a single identity.
		const wallet = hd();
		const privateKeys = new Set<string>();
		const publicKeys = new Set<string>();
		const addresses = new Set<string>();
		const indices = [
			...Array.from({ length: 24 }, (_, i) => i),
			100,
			255,
			256,
			257,
			65535,
			65536,
			1000000,
			HardenedBit - 1,
		];
		for (const index of indices) {
			const child = wallet.deriveChild(index);
			privateKeys.add(child.privateKey);
			publicKeys.add(child.publicKey);
			addresses.add(child.address);
		}
		assert.equal(privateKeys.size, indices.length, "private keys must differ");
		assert.equal(publicKeys.size, indices.length, "public keys must differ");
		assert.equal(addresses.size, indices.length, "addresses must differ");
	});

	it("labels each derived node with its own index", () => {
		const wallet = hd();
		for (const index of [0, 1, 2, 7, 10, 99, 65536, HardenedBit - 1]) {
			const child = wallet.deriveChild(index);
			assert.equal(child.path, `m/44'/654'/0'/0/${index}`);
			assert.equal(child.index, index);
			assert.equal(child.depth, 5, "derivation is flat, so depth never grows");
			assert.equal(getAddress(child.address), child.address);
			assert.equal(child.prefix, PREFIX);
		}
	});

	it("re-derives any node from its own reported path", () => {
		const wallet = hd();
		for (const index of [
			0,
			1,
			2,
			3,
			10,
			100,
			1000,
			65535,
			2 ** 20,
			HardenedBit - 1,
		]) {
			const child = wallet.deriveChild(index);
			const again = wallet.derivePath(child.path!);
			assert.equal(again.privateKey, child.privateKey, `index ${index}`);
			assert.equal(again.address, child.address);
			assert.equal(again.index, child.index);
			assert.equal(again.path, child.path);
		}
	});

	it("reproduces index 0 as the node returned by the from* constructors", () => {
		const wallet = hd();
		assert.equal(wallet.deriveChild(0).privateKey, wallet.privateKey);
		assert.equal(wallet.deriveChild(0).address, wallet.address);
		assert.equal(wallet.derivePath(defaultPath).privateKey, wallet.privateKey);
	});

	it("derives siblings, not descendants", () => {
		// The primitive goes straight from the seed to the account index, so
		// deriveChild on a derived node yields that account again rather than
		// descending a level.
		const wallet = hd();
		const child = wallet.deriveChild(5);
		assert.equal(child.deriveChild(5).privateKey, child.privateKey);
		assert.equal(
			child.deriveChild(7).privateKey,
			wallet.deriveChild(7).privateKey,
		);
		assert.equal(
			child.deriveChild(7).deriveChild(9).privateKey,
			wallet.deriveChild(9).privateKey,
			"repeated calls do not descend",
		);
		assert.equal(child.deriveChild(7).depth, 5);
		assert.equal(child.deriveChild(7).path, "m/44'/654'/0'/0/7");
	});

	it("leaves the parent fingerprint unset while the node fingerprint tracks the key", () => {
		const wallet = hd();
		const fingerprints = new Set<string>();
		for (const index of [0, 1, 2, 3, 4]) {
			const child = wallet.deriveChild(index);
			assert.equal(
				child.parentFingerprint,
				"0x00000000",
				"no parent node exists to fingerprint",
			);
			assert.match(child.fingerprint, /^0x[0-9a-f]{8}$/);
			fingerprints.add(child.fingerprint);
		}
		assert.equal(fingerprints.size, 5, "fingerprints follow the public key");
	});

	it("keeps the mnemonic and seed on derived nodes", () => {
		const child = hd().deriveChild(4);
		assert.equal(child.mnemonic!.phrase, PHRASE_12);
		assert.equal(child.mnemonic!.entropy, ENTROPY_12);
		// The seed is private, but a further derivation proves it came along.
		assert.equal(
			child.deriveChild(0).privateKey,
			hd().privateKey,
			"the seed travelled with the node",
		);
	});

	it("rejects an index that is not a non-negative integer", () => {
		const wallet = hd();
		for (const index of [-1, -2, -1000]) {
			assert.throws(
				() => wallet.deriveChild(index),
				/invalid account index/,
				String(index),
			);
		}
		for (const index of [-0.5, 0.5, 1.5, NaN, Infinity, -Infinity]) {
			assert.throws(
				() => wallet.deriveChild(index),
				/underflow/,
				String(index),
			);
		}
		for (const index of [null, undefined, true, {}, []]) {
			assert.throws(
				() => wallet.deriveChild(index as any),
				/invalid numeric value/,
				JSON.stringify(index),
			);
		}
		for (const index of ["", "3.5"]) {
			assert.throws(
				() => wallet.deriveChild(index as any),
				/invalid numeric string/,
				JSON.stringify(index),
			);
		}
	});

	it("coerces a numeric string or bigint index to the same account", () => {
		const wallet = hd();
		const expected = wallet.deriveChild(3);
		for (const index of ["3", "0x03", " 3", 3n] as Array<any>) {
			const child = wallet.deriveChild(index);
			assert.equal(child.index, 3, JSON.stringify(String(index)));
			assert.equal(child.path, "m/44'/654'/0'/0/3");
			assert.equal(child.privateKey, expected.privateKey);
		}
	});

	it("labels every derived node with a path it can re-derive", () => {
		// The index used to be written into the path as its low 31 bits with a
		// hardened marker, so a node could carry a label derivePath refused,
		// or one belonging to a different account entirely.
		const wallet = hd();
		for (const index of [0, 1, 5, 1000, HardenedBit - 1]) {
			const child = wallet.deriveChild(index);
			assert.equal(child.path, `m/44'/654'/0'/0/${index}`, String(index));
			assert.equal(
				wallet.derivePath(child.path!).privateKey,
				child.privateKey,
				String(index),
			);
		}
	});

	it("deriveChild rejects account indices at or above 2**31", () => {
		const wallet = hd();
		for (const index of [
			HardenedBit,
			HardenedBit + 5,
			2 ** 32,
			2 ** 32 + 5,
			2 ** 33 + 5,
			Number.MAX_SAFE_INTEGER,
		]) {
			assert.throws(
				() => wallet.deriveChild(index),
				/invalid account index/,
				String(index),
			);
		}
	});
});

describe("HDNodeWallet: canonical path enforcement", () => {
	it("derives the canonical Core path at any account index", () => {
		const wallet = hd();
		for (const index of [0, 1, 5, 99, 65536, HardenedBit - 1]) {
			const path = `m/44'/654'/0'/0/${index}`;
			const child = wallet.derivePath(path);
			assert.equal(child.path, path);
			assert.equal(child.index, index);
			assert.equal(child.depth, 5);
			assert.equal(
				child.privateKey,
				wallet.deriveChild(index).privateKey,
				`index ${index}`,
			);
		}
	});

	it("accepts the legacy coin-type-60 prefix and relabels it as Core", () => {
		// Keystores written before the path was pinned recorded Ethereum's coin
		// type while still deriving the Core key, so that spelling has to keep
		// opening the same account. This is deliberate, not a leftover.
		const wallet = hd();
		for (const index of [0, 1, 5, 99, HardenedBit - 1]) {
			const legacy = wallet.derivePath(`m/44'/60'/0'/0/${index}`);
			const core = wallet.derivePath(`m/44'/654'/0'/0/${index}`);
			assert.equal(legacy.privateKey, core.privateKey, `index ${index}`);
			assert.equal(legacy.address, core.address);
			assert.equal(
				legacy.path,
				`m/44'/654'/0'/0/${index}`,
				"the node reports the Core spelling",
			);
			assert.equal(legacy.index, index);
		}
	});

	it("rejects every non-canonical path rather than answering with another key", () => {
		const wallet = hd();
		for (const path of [
			"m",
			"m/0",
			"m/1",
			"m/0/1",
			"m/44'",
			"m/44'/654'",
			"m/44'/654'/0'/0",
			"m/44'/654'/0'/0/",
			"m/44'/654'/1'/0/0", // a different account
			"m/44'/654'/0'/1/0", // the change branch
			"m/44'/654'/0'/0/0'", // hardened index
			"m/44'/654'/0'/0/0/0", // a level too deep
			"m/44'/654'/0'/0/x",
			"m/44'/654'/0'/0/-1",
			"m/44'/654'/0'/0/1.5",
			"m/44'/654'/0'/0/1e3",
			"m/44'/654'/0'/0/+1",
			"m/44'/654'/0'/0/0x1",
			"m/44'/654'/0'/0/ 1",
			"m/44'/654/0'/0/0", // coin type not hardened
			"m/44'/61'/0'/0/0", // some other coin
			"m/44'/0'/0'/0/0",
			"44'/654'/0'/0/0", // no master component
			"M/44'/654'/0'/0/0", // wrong case
			"m/44'/654'/0'/0/0 ",
			"",
			"0",
			"nonsense",
		]) {
			assert.throws(
				() => wallet.derivePath(path),
				(error: any) => {
					assert.equal(error.code, "INVALID_ARGUMENT");
					assert.equal(error.argument, "path");
					assert.equal(error.value, path);
					assert.match(error.shortMessage, /unsupported derivation path/);
					assert.ok(
						error.message.includes("m/44'/654'/0'/0/<index>"),
						"the message names the one supported shape",
					);
					return true;
				},
				JSON.stringify(path),
			);
		}
	});

	it("rejects a canonical path whose index is out of range", () => {
		const wallet = hd();
		for (const prefix of ["m/44'/654'/0'/0", "m/44'/60'/0'/0"]) {
			for (const index of [HardenedBit, HardenedBit + 1, 2 ** 32, 2 ** 53]) {
				assert.throws(
					() => wallet.derivePath(`${prefix}/${index}`),
					/invalid account index/,
					`${prefix}/${index}`,
				);
			}
		}
	});

	it("throws on a missing path", () => {
		const wallet = hd();
		for (const path of [null, undefined, 0, {}]) {
			assert.throws(() => wallet.derivePath(path as any), JSON.stringify(path));
		}
	});

	it("normalizes a zero-padded index instead of forking the wallet", () => {
		// Leading zeros are tolerated, but the node relabels itself with the
		// plain index, so its path still round-trips to the same key.
		const wallet = hd();
		for (const spelling of ["01", "0001", "000000001"]) {
			const child = wallet.derivePath(`m/44'/654'/0'/0/${spelling}`);
			assert.equal(child.index, 1);
			assert.equal(child.path, "m/44'/654'/0'/0/1");
			assert.equal(child.privateKey, wallet.deriveChild(1).privateKey);
		}
	});

	it("reports defaultPath as the canonical account-0 path", () => {
		assert.equal(defaultPath, "m/44'/654'/0'/0/0");
		assert.equal(defaultPath, getIndexedAccountPath(0));
		assert.equal(defaultPath, getAccountPath(0));
		assert.equal(hd().derivePath(defaultPath).path, defaultPath);
	});

	it("builds indexed account paths that the wallet can actually derive", () => {
		const wallet = hd();
		for (const index of [0, 1, 2, 5, 100, 65536, HardenedBit - 1]) {
			const path = getIndexedAccountPath(index);
			assert.equal(path, `m/44'/654'/0'/0/${index}`);
			assert.equal(wallet.derivePath(path).index, index);
		}
	});

	it("rejects an invalid index in getIndexedAccountPath", () => {
		for (const index of [-1, -100, HardenedBit, HardenedBit + 1, 2 ** 40]) {
			assert.throws(
				() => getIndexedAccountPath(index),
				/invalid account index/,
				String(index),
			);
		}
		for (const index of [0.5, 1.5, NaN, Infinity]) {
			assert.throws(
				() => getIndexedAccountPath(index),
				/underflow/,
				String(index),
			);
		}
	});

	it("directs getAccountPath callers to the indexed pattern for account 1 and up", () => {
		// The primitive pins the account component to 0', so this pattern
		// cannot address a second account; refusing beats returning a path
		// that derives an unrelated key.
		assert.equal(getAccountPath(0), "m/44'/654'/0'/0/0");
		for (const index of [1, 2, 5, 100, HardenedBit - 1]) {
			assert.throws(
				() => getAccountPath(index),
				/use getIndexedAccountPath/,
				String(index),
			);
		}
		for (const index of [-1, HardenedBit, 2 ** 40]) {
			assert.throws(
				() => getAccountPath(index),
				/invalid account index/,
				String(index),
			);
		}
		assert.throws(() => getAccountPath(0.5), /underflow/);
	});

	it("accepts numeric strings and bigints as path indices", () => {
		assert.equal(getIndexedAccountPath("7" as any), "m/44'/654'/0'/0/7");
		assert.equal(getIndexedAccountPath(7n), "m/44'/654'/0'/0/7");
		assert.equal(getAccountPath(0n), defaultPath);
	});
});

describe("HDNodeWallet: network prefixes", () => {
	it("renders one derived key as one address per network", () => {
		const wallets = PREFIXES.map(({ prefix }) => hd(prefix));
		for (const [i, { prefix, label }] of PREFIXES.entries()) {
			assert.equal(
				wallets[i].address,
				ADDRESS_0[prefix as keyof typeof ADDRESS_0],
				label,
			);
			assert.equal(wallets[i].prefix, prefix);
			assert.equal(wallets[i].address.substring(2, 4), prefix);
			assert.equal(getAddress(wallets[i].address), wallets[i].address);
		}
		// One key, three renderings: the 20-byte body is shared and only the
		// prefix and its check digits change.
		assert.equal(new Set(wallets.map((w) => w.privateKey)).size, 1);
		assert.equal(new Set(wallets.map((w) => w.publicKey)).size, 1);
		assert.equal(new Set(wallets.map((w) => w.fingerprint)).size, 1);
		assert.equal(new Set(wallets.map((w) => w.address.substring(6))).size, 1);
		assert.equal(
			new Set(wallets.map((w) => w.address.substring(4, 6))).size,
			PREFIXES.length,
			"check digits bind the prefix",
		);
		assert.equal(new Set(wallets.map((w) => w.address)).size, PREFIXES.length);
	});

	it("keeps the same key body per index across networks", () => {
		for (const index of [0, 1, 7, 100]) {
			const derived = PREFIXES.map(({ prefix }) =>
				hd(prefix).deriveChild(index),
			);
			assert.equal(
				new Set(derived.map((w) => w.privateKey)).size,
				1,
				`index ${index} has one key`,
			);
			assert.equal(
				new Set(derived.map((w) => w.address.substring(6))).size,
				1,
				`index ${index} has one body`,
			);
			assert.equal(
				new Set(derived.map((w) => w.address)).size,
				PREFIXES.length,
				`index ${index} renders three addresses`,
			);
			for (const [i, wallet] of derived.entries()) {
				assert.equal(wallet.address.substring(2, 4), PREFIXES[i].prefix);
				assert.equal(getAddress(wallet.address), wallet.address);
				assert.equal(wallet.path, `m/44'/654'/0'/0/${index}`);
			}
		}
	});

	it("agrees with the prefix implied by a network id", () => {
		for (const { prefix, networkId } of PREFIXES) {
			assert.equal(
				hd(networkIdToPrefix(networkId)).address,
				ADDRESS_0[prefix as keyof typeof ADDRESS_0],
				`network ${networkId}`,
			);
		}
	});

	it("requires a known network prefix", () => {
		for (const prefix of ["zz", "ff", "00", "", "CB", "cbcb", "c"]) {
			assert.throws(
				() => HDNodeWallet.fromPhrase({ phrase: PHRASE_12, prefix }),
				/invalid network prefix/,
				JSON.stringify(prefix),
			);
		}
		assert.throws(
			() => HDNodeWallet.fromPhrase({ phrase: PHRASE_12 } as any),
			/invalid network prefix/,
		);
		assert.throws(
			() => HDNodeWallet.fromSeed({ seed: SEED_12 } as any),
			/invalid network prefix/,
		);
	});
});

describe("HDNodeWallet: seed input handling", () => {
	it("derives the same wallet from a seed given as hex text or bytes", () => {
		const expected = hd();
		assert.equal(
			HDNodeWallet.fromSeed({ seed: SEED_12, prefix: PREFIX }).privateKey,
			expected.privateKey,
		);
		assert.equal(
			HDNodeWallet.fromSeed({
				seed: getBytes("0x" + SEED_12) as any,
				prefix: PREFIX,
			}).privateKey,
			expected.privateKey,
			"a byte array decodes correctly",
		);
		assert.equal(
			HDNodeWallet.fromSeed({ seed: SEED_12.toUpperCase(), prefix: PREFIX })
				.privateKey,
			expected.privateKey,
			"hex case does not matter",
		);
	});

	it("gives distinct seeds distinct wallets", () => {
		const keys = new Set<string>();
		for (const seed of [
			SEED_12,
			"00".repeat(64),
			"01".repeat(64),
			"ff".repeat(64),
			SEED_12.slice(0, 64),
			SEED_12.slice(0, 32),
		]) {
			const wallet = HDNodeWallet.fromSeed({ seed, prefix: PREFIX });
			assert.equal(wallet.path, defaultPath);
			assert.equal(wallet.mnemonic, null);
			keys.add(wallet.privateKey);
		}
		assert.equal(keys.size, 6, "every seed must yield its own key");
	});

	it("reads a 0x-prefixed seed as hex, matching the bare spelling", () => {
		// Node's hex decoder stops at the first character that is not a hex
		// digit rather than reporting an error, so an unvalidated "0x" prefix
		// decoded to an empty buffer and every such seed derived one and the
		// same key. The seed is normalized before derivation now.
		const expected = HDNodeWallet.fromSeed({ seed: SEED_12, prefix: PREFIX });
		for (const seed of ["0x" + SEED_12, "0X" + SEED_12]) {
			assert.equal(
				HDNodeWallet.fromSeed({ seed, prefix: PREFIX }).privateKey,
				expected.privateKey,
				seed.slice(0, 4),
			);
		}
		assert.equal(
			Wallet.fromSeed({ seed: "0x" + SEED_12, prefix: PREFIX }).address,
			expected.address,
		);
	});

	it("keeps 0x-prefixed seeds distinct from one another", () => {
		const keys = new Set<string>();
		const bodies = [SEED_12, "ab".repeat(64), "00".repeat(64), "11".repeat(64)];
		for (const body of bodies) {
			keys.add(
				HDNodeWallet.fromSeed({ seed: "0x" + body, prefix: PREFIX }).privateKey,
			);
		}
		assert.equal(keys.size, bodies.length, "every seed must yield its own key");
	});

	it("rejects a seed that is not hex", () => {
		for (const seed of ["zz", "not-hex-at-all", "0xzz", SEED_12 + "gg"]) {
			assert.throws(
				() => HDNodeWallet.fromSeed({ seed, prefix: PREFIX }),
				(err: any) => err.code === "INVALID_ARGUMENT",
				JSON.stringify(seed).slice(0, 24),
			);
		}
	});

	it("rejects a seed outside the 16 to 64 byte range", () => {
		const tooShortOrLong = ["", "0x", "ab".repeat(8), "ab".repeat(65)];
		for (const seed of tooShortOrLong) {
			assert.throws(
				() => HDNodeWallet.fromSeed({ seed, prefix: PREFIX }),
				(err: any) => err.code === "INVALID_ARGUMENT",
				JSON.stringify(seed).slice(0, 24),
			);
		}
	});

	it("rejects a seed with a trailing half byte", () => {
		assert.throws(
			() =>
				HDNodeWallet.fromSeed({ seed: SEED_12.slice(0, 127), prefix: PREFIX }),
			(err: any) => err.code === "INVALID_ARGUMENT",
		);
	});
});

describe("Keystore interop: Wallet and HDNodeWallet round trips", function () {
	// Default-cost scrypt (N = 2**17) runs about a quarter of a second per
	// call, and Wallet/HDNodeWallet encryption does not expose KDF options.
	this.timeout(120000);

	const wallet = hd();
	const child = wallet.deriveChild(7);
	const plain = new Wallet({ key: wallet.privateKey, prefix: PREFIX });

	it("round-trips an HDNodeWallet through encryptSync", () => {
		const json = wallet.encryptSync("pw");
		assert.equal(isKeystoreJson(json), true);
		const account = decryptKeystoreJsonSync(json, "pw");
		assert.equal(account.address, wallet.address);
		assert.equal(account.privateKey, wallet.privateKey);
		assert.equal(account.mnemonic!.entropy, ENTROPY_12);
		assert.equal(account.mnemonic!.path, defaultPath);
		assert.equal(account.mnemonic!.locale, "en");
	});

	it("round-trips an HDNodeWallet through the async encrypt", async () => {
		const progress: Array<number> = [];
		const json = await wallet.encrypt("pw", (p) => progress.push(p));
		assert.ok(progress.length > 0, "progress was reported");
		assert.equal(progress[progress.length - 1], 1, "progress ends at 1");
		assert.ok(
			progress.every(
				(p, i) => p >= 0 && p <= 1 && (i === 0 || p >= progress[i - 1]),
			),
			"progress is monotonic within [0, 1]",
		);
		const account = await decryptKeystoreJson(json, "pw");
		assert.equal(account.privateKey, wallet.privateKey);
		assert.equal(account.mnemonic!.path, defaultPath);
	});

	it("round-trips a plain Wallet with sync and async encryption", async () => {
		for (const json of [plain.encryptSync("pw"), await plain.encrypt("pw")]) {
			const account = decryptKeystoreJsonSync(json, "pw");
			assert.equal(account.address, plain.address);
			assert.equal(account.privateKey, plain.privateKey);
			assert.equal(account.mnemonic, undefined, "no mnemonic to record");
			assert.equal(
				"x-corebc" in JSON.parse(json),
				false,
				"no mnemonic metadata block",
			);
		}
	});

	it("records the derived account path in the keystore", () => {
		for (const node of [wallet, child, wallet.deriveChild(3)]) {
			const json = encryptKeystoreJsonSync(hdAccount(node), "pw", LOW_COST);
			const data = JSON.parse(json);
			assert.equal(data["x-corebc"].path, node.path);
			assert.equal(data["x-corebc"].locale, "en");
			assert.equal(data["x-corebc"].version, "0.1");
			assert.match(data["x-corebc"].client, /^corebc\//);
			assert.equal(
				decryptKeystoreJsonSync(json, "pw").mnemonic!.path,
				node.path,
			);
		}
	});

	it("writes a version 3 keystore holding the Core address", () => {
		const json = encryptKeystoreJsonSync(hdAccount(child), "pw", LOW_COST);
		const data = JSON.parse(json);
		assert.equal(data.version, 3);
		assert.equal(
			data.address,
			child.address.substring(2),
			"the address is stored without 0x",
		);
		assert.equal(data.address, data.address.toLowerCase());
		assert.equal(data.address.length, 44, "22-byte ICAN address");
		assert.equal(data.Crypto.cipher, "aes-128-ctr");
		assert.equal(data.Crypto.kdf, "scrypt");
		assert.match(data["x-corebc"].gethFilename, /^UTC--.*--cb[0-9a-f]{42}$/);
	});

	it("keeps the network prefix through a keystore round trip", () => {
		for (const { prefix, label } of PREFIXES) {
			const node = hd(prefix);
			const json = encryptKeystoreJsonSync(hdAccount(node), "pw", LOW_COST);
			const account = decryptKeystoreJsonSync(json, "pw");
			assert.equal(account.address, node.address, label);
			const reopened = Wallet.fromEncryptedJsonSync(json, "pw");
			assert.equal(reopened.address, node.address, label);
			assert.equal(reopened.prefix, prefix, label);
		}
	});

	it("accepts a byte-array and an empty password", () => {
		const account = hdAccount(child);
		for (const password of [new Uint8Array([1, 2, 3]), ""]) {
			const json = encryptKeystoreJsonSync(account, password, LOW_COST);
			assert.deepEqual(decryptKeystoreJsonSync(json, password), {
				address: child.address,
				privateKey: child.privateKey,
				mnemonic: {
					path: child.path,
					locale: "en",
					entropy: ENTROPY_12,
				},
			});
		}
	});

	it("rejects the wrong password on every entry point", async () => {
		const json = encryptKeystoreJsonSync(hdAccount(wallet), "pw", LOW_COST);
		assert.throws(
			() => decryptKeystoreJsonSync(json, "nope"),
			/incorrect password/,
		);
		await assert.rejects(
			decryptKeystoreJson(json, "nope"),
			/incorrect password/,
		);
		assert.throws(
			() => Wallet.fromEncryptedJsonSync(json, "nope"),
			/incorrect password/,
		);
		await assert.rejects(
			Wallet.fromEncryptedJson(json, "nope"),
			/incorrect password/,
		);
		assert.throws(
			() => decryptKeystoreJsonSync(json, ""),
			/incorrect password/,
		);
	});

	it("omits the mnemonic when it cannot be replayed from the keystore", () => {
		// A keystore records entropy, not a password or a locale-specific
		// wordlist, so a wallet whose mnemonic needs either is stored as a
		// bare key rather than as something that would reopen differently.
		const guarded = HDNodeWallet.fromPhrase({
			phrase: PHRASE_12,
			prefix: PREFIX,
			password: "sekret",
		});
		const json = guarded.encryptSync("pw");
		assert.equal("x-corebc" in JSON.parse(json), false);
		const reopened = Wallet.fromEncryptedJsonSync(json, "pw");
		assert.equal(reopened.constructor.name, "Wallet");
		assert.equal(reopened.privateKey, guarded.privateKey);
		assert.equal(reopened.address, guarded.address);
	});
});

describe("Keystore interop: recovering the wallet class and path", function () {
	this.timeout(120000);

	const wallet = hd();

	it("returns an HDNodeWallet when the keystore records a mnemonic", () => {
		const json = encryptKeystoreJsonSync(hdAccount(wallet), "pw", LOW_COST);
		for (const reopened of [Wallet.fromEncryptedJsonSync(json, "pw")]) {
			assert.ok(reopened instanceof HDNodeWallet);
			assert.equal(reopened.constructor.name, "HDNodeWallet");
			assert.equal(reopened.privateKey, wallet.privateKey);
			assert.equal(reopened.address, wallet.address);
			assert.equal((reopened as HDNodeWallet).path, defaultPath);
			assert.equal((reopened as HDNodeWallet).index, 0);
			assert.equal((reopened as HDNodeWallet).depth, 5);
			assert.equal((reopened as HDNodeWallet).mnemonic!.entropy, ENTROPY_12);
			assert.equal((reopened as HDNodeWallet).mnemonic!.phrase, PHRASE_12);
		}
	});

	it("returns a plain Wallet when the keystore holds only a key", () => {
		const bare = new Wallet({ key: wallet.privateKey, prefix: PREFIX });
		const json = encryptKeystoreJsonSync(
			{ address: bare.address, privateKey: bare.privateKey },
			"pw",
			LOW_COST,
		);
		const reopened = Wallet.fromEncryptedJsonSync(json, "pw");
		assert.equal(reopened.constructor.name, "Wallet");
		assert.ok(!(reopened instanceof HDNodeWallet));
		assert.equal((reopened as any).path, undefined);
		assert.equal((reopened as any).mnemonic, undefined);
		assert.equal(reopened.privateKey, bare.privateKey);
	});

	it("recovers a derived account from its recorded path", async () => {
		for (const index of [0, 1, 7, 99]) {
			const node = wallet.deriveChild(index);
			const json = encryptKeystoreJsonSync(hdAccount(node), "pw", LOW_COST);
			for (const reopened of [
				Wallet.fromEncryptedJsonSync(json, "pw"),
				await Wallet.fromEncryptedJson(json, "pw"),
			] as Array<HDNodeWallet>) {
				assert.ok(reopened instanceof HDNodeWallet, `index ${index}`);
				assert.equal(reopened.privateKey, node.privateKey, `index ${index}`);
				assert.equal(reopened.address, node.address);
				assert.equal(reopened.path, `m/44'/654'/0'/0/${index}`);
				assert.equal(reopened.index, index);
				// The recovered wallet is a working HD node, not just a key.
				assert.equal(
					reopened.deriveChild(2).privateKey,
					wallet.deriveChild(2).privateKey,
				);
			}
		}
	});

	it("opens a keystore whose recorded path uses the legacy Ethereum coin type", () => {
		// Older releases wrote m/44'/60'/... while deriving the Core key. Such
		// a keystore must still reopen as the same HD account, relabelled with
		// Core's coin type.
		for (const index of [0, 1, 4, 7]) {
			const node = wallet.deriveChild(index);
			const recorded = `m/44'/60'/0'/0/${index}`;
			const json = encryptKeystoreJsonSync(
				{
					address: node.address,
					privateKey: node.privateKey,
					mnemonic: { path: recorded, locale: "en", entropy: ENTROPY_12 },
				},
				"pw",
				LOW_COST,
			);
			assert.equal(
				JSON.parse(json)["x-corebc"].path,
				recorded,
				"the legacy spelling is preserved on disk",
			);
			assert.equal(
				decryptKeystoreJsonSync(json, "pw").mnemonic!.path,
				recorded,
				"the raw account reports what was written",
			);
			const reopened = Wallet.fromEncryptedJsonSync(json, "pw") as HDNodeWallet;
			assert.ok(reopened instanceof HDNodeWallet, recorded);
			assert.equal(reopened.privateKey, node.privateKey, recorded);
			assert.equal(reopened.address, node.address, recorded);
			assert.equal(
				reopened.path,
				`m/44'/654'/0'/0/${index}`,
				"reopened on the Core path",
			);
			assert.equal(reopened.index, index);
		}
	});

	it("falls back to the private key when the recorded path disagrees", () => {
		// A candidate path is only accepted if it reproduces both the address
		// and the private key, so a mislabelled keystore degrades to a plain
		// Wallet instead of handing back the wrong account.
		const node = wallet.deriveChild(3);
		const json = encryptKeystoreJsonSync(
			{
				address: node.address,
				privateKey: node.privateKey,
				mnemonic: {
					path: "m/44'/654'/0'/0/9",
					locale: "en",
					entropy: ENTROPY_12,
				},
			},
			"pw",
			LOW_COST,
		);
		const written: Array<string> = [];
		const original = console.log;
		console.log = (...args: Array<any>) => written.push(args.join(" "));
		let reopened;
		try {
			reopened = Wallet.fromEncryptedJsonSync(json, "pw");
		} finally {
			console.log = original;
		}
		assert.equal(reopened.constructor.name, "Wallet");
		assert.equal(reopened.privateKey, node.privateKey);
		assert.equal(reopened.address, node.address);
		assert.equal(written.length, 1);
		assert.match(written[0], /WARNING: JSON mismatch/);
	});

	it("refuses input that is not a wallet at all", async () => {
		for (const json of ["{}", JSON.stringify({ version: 1 })]) {
			assert.throws(
				() => Wallet.fromEncryptedJsonSync(json, "pw"),
				/invalid JSON wallet/,
				json,
			);
			await assert.rejects(
				Wallet.fromEncryptedJson(json, "pw"),
				/invalid JSON wallet/,
				json,
			);
		}
		assert.equal(isKeystoreJson("not json"), false);
		assert.equal(isKeystoreJson(JSON.stringify({ version: 2 })), false);
	});
});
