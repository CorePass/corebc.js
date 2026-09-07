import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Mnemonic, wordlists } from "../index.js";
import { LangDe } from "../wordlists/lang-de.js";
import { LangSk } from "../wordlists/lang-sk.js";

// Independently calculated SHA-256 mnemonic vectors using upstream word indices.
const vectors = [
	[
		"00000000000000000000000000000000",
		"abakus abakus abakus abakus abakus abakus abakus abakus abakus abakus abakus abrazia",
	],
	[
		"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
		"zvuk zvuk zvuk zvuk zvuk zvuk zvuk zvuk zvuk zvuk zvuk zvuk zvuk zvuk zvuk zvuk zvuk zvuk zvuk zvuk zvuk zvuk zvuk zaliv",
	],
	[
		"000102030405060708090a0b0c0d0e0f10111213",
		"abakus anjel kridlo anjel gremium akrobat cisterna clona atlet humanita favorit ciara adept lezec gorila",
	],
];

describe("Slovak mnemonic wordlist", () => {
	it("preserves all 2048 upstream word indices", () => {
		assert.equal(wordlists.sk, LangSk.wordlist());
		assert.equal(wordlists.sk.locale, "sk");
		const words = Array.from({ length: 2048 }, (_, i) => {
			const word = wordlists.sk.getWord(i);
			assert.equal(wordlists.sk.getWordIndex(word), i);
			return word;
		});
		assert.equal(new Set(words).size, 2048);
		assert.equal(
			createHash("sha256")
				.update(words.join("\n") + "\n")
				.digest("hex"),
			"79b7334ea13a4ad25f7bdaf4e82075d888e81839ad69ebdf647e0467c33e0b24",
		);
		assert.equal(wordlists.sk.getWord(208), "chalupa");
		assert.equal(wordlists.sk.getWordIndex("not-a-word"), -1);
		for (const index of [-1, 2048, 0.5, NaN]) {
			assert.throws(() => wordlists.sk.getWord(index));
		}
	});
	it("matches mnemonic vectors and recovers entropy", () => {
		for (const [hex, phrase] of vectors) {
			const entropy = "0x" + hex;
			assert.equal(
				Mnemonic.fromEntropy(entropy, "", wordlists.sk).phrase,
				phrase,
			);
			assert.equal(
				Mnemonic.fromPhrase({ phrase, wordlist: wordlists.sk }).entropy,
				entropy,
			);
			assert.equal(Mnemonic.isValidMnemonic(phrase, wordlists.sk), true);
			assert.equal(Mnemonic.isValidMnemonic(phrase), false);
		}
		assert.equal(
			Mnemonic.isValidMnemonic(
				Array(12).fill("abakus").join(" "),
				wordlists.sk,
			),
			false,
		);
	});
});

const germanVectors = [
	[
		"00000000000000000000000000000000",
		"abbau abbau abbau abbau abbau abbau abbau abbau abbau abbau abbau abdruck",
	],
	[
		"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
		"zyklus zyklus zyklus zyklus zyklus zyklus zyklus zyklus zyklus zyklus zyklus zyklus zyklus zyklus zyklus zyklus zyklus zyklus zyklus zyklus zyklus zyklus zyklus winzig",
	],
	[
		"000102030405060708090a0b0c0d0e0f10111213",
		"abbau ameise korn ameise fordern achse bewahren bieder anliegen gravur esstisch bereich abgrund leer flugzeug",
	],
];

describe("German mnemonic wordlist", () => {
	it("preserves all 2048 upstream word indices", () => {
		assert.equal(wordlists.de, LangDe.wordlist());
		assert.equal(wordlists.de.locale, "de");
		const words = Array.from({ length: 2048 }, (_, i) => {
			const word = wordlists.de.getWord(i);
			assert.equal(wordlists.de.getWordIndex(word), i);
			return word;
		});
		assert.equal(new Set(words).size, 2048);
		assert.equal(
			createHash("sha256")
				.update(words.join("\n") + "\n")
				.digest("hex"),
			"7965dc8c6b413ccb635d3021043365e18df0367bf5413a50a069a98addfe4e1d",
		);
		assert.equal(wordlists.de.getWord(2047), "zyklus");
		assert.equal(wordlists.de.getWordIndex("not-a-word"), -1);
		for (const index of [-1, 2048, 0.5, NaN]) {
			assert.throws(() => wordlists.de.getWord(index));
		}
	});
	it("matches mnemonic vectors and recovers entropy", () => {
		for (const [hex, phrase] of germanVectors) {
			const entropy = "0x" + hex;
			assert.equal(
				Mnemonic.fromEntropy(entropy, "", wordlists.de).phrase,
				phrase,
			);
			assert.equal(
				Mnemonic.fromPhrase({ phrase, wordlist: wordlists.de }).entropy,
				entropy,
			);
			assert.equal(Mnemonic.isValidMnemonic(phrase, wordlists.de), true);
			assert.equal(Mnemonic.isValidMnemonic(phrase), false);
		}
		assert.equal(
			Mnemonic.isValidMnemonic(Array(12).fill("abbau").join(" "), wordlists.de),
			false,
		);
	});
});
