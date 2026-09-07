import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
for (const file of ["dist/corebc.umd.js", "dist/corebc.umd.min.js"]) {
	const context = vm.createContext({
		crypto: webcrypto,
		console,
		TextEncoder,
		TextDecoder,
		setTimeout,
		clearTimeout,
		AbortController,
		fetch,
		URL,
	});
	vm.runInContext(
		"globalThis.self = globalThis; globalThis.window = globalThis;",
		context,
	);
	vm.runInContext(await readFile(file, "utf8"), context, { filename: file });
	vm.runInContext(
		`
			const key = new corebc.SigningKey("01".repeat(57));
			const digest = corebc.sha256("0x1234");
			if (corebc.SigningKey.recoverPublicKey(digest, key.sign(digest)) !== key.publicKey) throw new Error("browser signature mismatch");
			const wallet = corebc.Wallet.createRandom(corebc.networkIdToPrefix(3));
			if (wallet.address.length !== 46) throw new Error("invalid browser wallet");
			const account = { address: wallet.address, privateKey: wallet.privateKey };
			const json = corebc.encryptKeystoreJsonSync(account, "test", { scrypt: { N: 16, r: 1, p: 1 } });
			if (corebc.decryptKeystoreJsonSync(json, "test").privateKey !== wallet.privateKey) throw new Error("browser keystore mismatch");
			const known = corebc.Wallet.fromPhrase({ phrase: "better artwork flavor fish solve deer orient spread adapt doll attack hour sort copper super income bacon engine skate ill similar wink crack club", password: "111111", prefix: corebc.networkIdToPrefix(3) });
			if (known.address !== "0xab38254e30777140469a3aa168df81182d3d61f9843f") throw new Error("browser mnemonic mismatch");
		`,
		context,
	);
}
for (const file of ["wordlists-extra.js", "wordlists-extra.min.js"]) {
	const { LangSk, LangDe } = await import(
		new URL("../dist/" + file, import.meta.url)
	);
	const de = LangDe.wordlist();
	if (
		de.locale !== "de" ||
		de.getWord(0) !== "abbau" ||
		de.getWordIndex("zyklus") !== 2047
	) {
		throw new Error("browser German wordlist mismatch");
	}
	const sk = LangSk.wordlist();
	if (
		sk.locale !== "sk" ||
		sk.getWord(208) !== "chalupa" ||
		sk.getWordIndex("zvuk") !== 2047
	) {
		throw new Error("browser Slovak wordlist mismatch");
	}
}
console.log("Browser bundle checks passed");
