/**
 *  Behavioural baseline for the library.
 *
 *  Every value here is derived from fixed inputs, so a capture taken before a
 *  refactor must reproduce byte-for-byte afterwards. Thrown errors are
 *  recorded as values too: rejecting bad input is behaviour worth pinning.
 *
 *  Do not use these keys for anything. They are hard-coded test material.
 */

import {
	AbiCoder,
	BigNumber,
	CoreSymbol,
	HDNodeWallet,
	Interface,
	Mnemonic,
	OrePerXCB,
	SigningKey,
	Transaction,
	TypedDataEncoder,
	Wallet,
	computeAddress,
	computeHmac,
	concat,
	dataLength,
	dataSlice,
	decodeBase58,
	decodeBase64,
	decodeBytes32String,
	decodeRlp,
	decryptKeystoreJsonSync,
	defaultPath,
	encodeBase58,
	encodeBase64,
	encodeBytes32String,
	encodeRlp,
	encryptKeystoreJsonSync,
	formatUnits,
	formatXCB,
	fromTwos,
	getAccountPath,
	getAddress,
	getBytes,
	getCreateAddress,
	getIndexedAccountPath,
	hashMessage,
	hexlify,
	id,
	isAddress,
	keccak256,
	mask,
	networkIdToPrefix,
	parseUnits,
	parseXCB,
	pbkdf2,
	publicToAddress,
	recoverAddress,
	ripemd160,
	scryptSync,
	sha256,
	sha512,
	solidityPacked,
	solidityPackedSha256,
	stripZerosLeft,
	toBeArray,
	toBeHex,
	toBigInt,
	toNumber,
	toQuantity,
	toTwos,
	toUtf8Bytes,
	toUtf8String,
	verifyMessage,
	verifyTypedData,
	wordlists,
	zeroPadBytes,
	zeroPadValue,
} from "../index.js";

import {
	pbkdf2KeystoreVectors,
	sharedSecretVectors,
} from "./crypto-compat-vectors.js";

/** Fixed Ed448 material: 57-byte seed mode and 57-byte scalar mode. */
const PRIV_A = "0x" + "01".repeat(57);
const PRIV_B = "0x" + "02".repeat(56) + "80";
const KNOWN_ADDRESS = "0xab41f5e89ba978317da861b7ad06ba3103d41c876098";
const PHRASE_ENTROPY = "0x" + "0f".repeat(16);
/** Core addresses carry a network prefix; "cb" is mainnet (networkId 1). */
const PREFIX = "cb";

/** Convert any runtime value into a stable, comparable JSON shape. */
function norm(v: any): any {
	if (v === null || v === undefined) return null;
	if (typeof v === "bigint") return `bigint:${v.toString()}`;
	if (
		typeof v === "string" ||
		typeof v === "number" ||
		typeof v === "boolean"
	) {
		return v;
	}
	if (v instanceof Uint8Array) return hexlify(v);
	if (Array.isArray(v)) return v.map(norm);
	if (typeof v === "object") {
		const out: Record<string, any> = {};
		for (const k of Object.keys(v).sort()) {
			let raw: any;
			try {
				raw = v[k];
			} catch (e: any) {
				out[k] = `ERROR: ${e?.message ?? String(e)}`;
				continue;
			}
			if (typeof raw === "function") continue;
			out[k] = norm(raw);
		}
		return out;
	}
	return String(v);
}

type Bucket = Record<string, any>;

async function cap(out: Bucket, name: string, fn: () => any): Promise<void> {
	try {
		out[name] = norm(await fn());
	} catch (e: any) {
		// Error text is part of the contract; normalise away object identity.
		const msg = e?.shortMessage ?? e?.message ?? String(e);
		out[name] = `ERROR: ${String(msg).split("(")[0].trim()}`;
	}
}

async function hashes(): Promise<Bucket> {
	const o: Bucket = {};
	const inputs = ["0x", "0x00", "0x1234", "0xdeadbeef"];
	for (const i of inputs) {
		await cap(o, `sha256(${i})`, () => sha256(i));
		await cap(o, `sha512(${i})`, () => sha512(i));
		await cap(o, `keccak256(${i})`, () => keccak256(i));
		await cap(o, `ripemd160(${i})`, () => ripemd160(i));
	}
	await cap(o, "id(hello)", () => id("hello"));
	await cap(o, "hashMessage(hello)", () => hashMessage("hello"));
	await cap(o, "hashMessage(bytes)", () => hashMessage(getBytes("0x1234")));
	await cap(o, "computeHmac", () => computeHmac("sha256", "0x0102", "0x1234"));
	await cap(o, "pbkdf2", () => pbkdf2("0x0102", "0x0304", 16, 32, "sha256"));
	await cap(o, "scryptSync", () => scryptSync("0x", "0x", 16, 1, 1, 16));
	await cap(o, "solidityPacked", () =>
		solidityPacked(["uint8", "string"], [1, "abc"]),
	);
	await cap(o, "solidityPackedSha256", () =>
		solidityPackedSha256(["uint8", "string"], [1, "abc"]),
	);
	return o;
}

async function dataUtils(): Promise<Bucket> {
	const o: Bucket = {};
	await cap(o, "hexlify", () => hexlify(new Uint8Array([1, 2, 255])));
	await cap(o, "getBytes", () => getBytes("0x010203"));
	await cap(o, "concat", () => concat(["0x0102", "0x0304"]));
	await cap(o, "dataLength", () => dataLength("0x010203"));
	await cap(o, "dataSlice", () => dataSlice("0x00112233", 1, 3));
	await cap(o, "stripZerosLeft", () => stripZerosLeft("0x00001234"));
	await cap(o, "zeroPadValue", () => zeroPadValue("0x1234", 8));
	await cap(o, "zeroPadBytes", () => zeroPadBytes("0x1234", 8));
	for (const n of ["0x0", "0x1234", "0xdeadbeef"]) {
		await cap(o, `toBigInt(${n})`, () => toBigInt(n));
		await cap(o, `toNumber(${n})`, () => toNumber(n));
		await cap(o, `toQuantity(${n})`, () => toQuantity(n));
	}
	await cap(o, "toBeHex(255,4)", () => toBeHex(255, 4));
	await cap(o, "toBeHex(0)", () => toBeHex(0));
	await cap(o, "toBeArray(65535)", () => toBeArray(65535));
	await cap(o, "toTwos", () => toTwos(-1, 32));
	await cap(o, "fromTwos", () => fromTwos("0xffffffff", 32));
	await cap(o, "mask", () => mask("0xffff", 8));
	await cap(o, "encodeBase58", () => encodeBase58("0x1234"));
	await cap(o, "decodeBase58", () => decodeBase58(encodeBase58("0x1234")));
	await cap(o, "encodeBase64", () => encodeBase64("0x1234"));
	await cap(o, "decodeBase64", () => decodeBase64(encodeBase64("0x1234")));
	await cap(o, "encodeBytes32String", () => encodeBytes32String("abc"));
	await cap(o, "decodeBytes32String", () =>
		decodeBytes32String(encodeBytes32String("abc")),
	);
	await cap(o, "toUtf8Bytes", () => toUtf8Bytes("héllo"));
	await cap(o, "toUtf8String", () => toUtf8String(toUtf8Bytes("héllo")));
	await cap(o, "encodeRlp", () => encodeRlp(["0x1234", ["0x5678"], "0x"]));
	await cap(o, "decodeRlp", () =>
		decodeRlp(encodeRlp(["0x1234", ["0x5678"], "0x"])),
	);
	// The fork's own BigNumber shim.
	await cap(o, "BigNumber.from", () => BigNumber.from("1234").toHexString());
	await cap(o, "BigNumber.add", () =>
		BigNumber.from(7).add(BigNumber.from(5)).toString(),
	);
	return o;
}

async function addresses(): Promise<Bucket> {
	const o: Bucket = {};
	await cap(o, "getAddress(known)", () => getAddress(KNOWN_ADDRESS));
	await cap(o, "getAddress(upper)", () =>
		getAddress(KNOWN_ADDRESS.toUpperCase().replace("0X", "0x")),
	);
	await cap(o, "getAddress(bad-checksum)", () =>
		getAddress("0xab00f5e89ba978317da861b7ad06ba3103d41c876098"),
	);
	await cap(o, "getAddress(too-short)", () => getAddress("0xab41f5"));
	await cap(o, "isAddress(known)", () => isAddress(KNOWN_ADDRESS));
	await cap(o, "isAddress(garbage)", () => isAddress("nope"));
	for (const nid of [0, 1, 2, 3, 4, 5, 11, 100]) {
		await cap(o, `networkIdToPrefix(${nid})`, () => networkIdToPrefix(nid));
	}
	for (const p of ["cb", "ab", "ce"]) {
		await cap(o, `computeAddress(A,${p})`, () => computeAddress(PRIV_A, p));
		await cap(o, `computeAddress(B,${p})`, () => computeAddress(PRIV_B, p));
	}
	await cap(o, "computeAddress(bad-prefix)", () =>
		computeAddress(PRIV_A, "zz"),
	);
	await cap(o, "publicToAddress", () =>
		publicToAddress(new SigningKey(PRIV_A).publicKey, PREFIX),
	);
	await cap(o, "getCreateAddress", () =>
		getCreateAddress({ from: KNOWN_ADDRESS, nonce: 7 }),
	);
	return o;
}

async function units(): Promise<Bucket> {
	const o: Bucket = {};
	await cap(o, "CoreSymbol", () => CoreSymbol);
	await cap(o, "OrePerXCB", () => OrePerXCB);
	for (const v of ["1", "0.5", "1234.000000000000000001"]) {
		await cap(o, `parseXCB(${v})`, () => parseXCB(v));
	}
	await cap(o, "formatXCB", () => formatXCB("1000000000000000000"));
	await cap(o, "parseUnits(1,9)", () => parseUnits("1", 9));
	await cap(o, "formatUnits(1e9,9)", () => formatUnits("1000000000", 9));
	return o;
}

async function signing(): Promise<Bucket> {
	const o: Bucket = {};
	for (const [label, pk] of [
		["A", PRIV_A],
		["B", PRIV_B],
	] as const) {
		const key = new SigningKey(pk);
		await cap(o, `${label}.privateKey`, () => key.privateKey);
		await cap(o, `${label}.publicKey`, () => key.publicKey);
		const digest = sha256("0x1234");
		// sign() returns signature||publicKey as a hex string in this fork.
		await cap(o, `${label}.sign`, () => key.sign(digest));
		await cap(o, `${label}.recover`, () =>
			SigningKey.recoverPublicKey(digest, key.sign(digest)),
		);
		await cap(o, `${label}.recover-wrong-digest`, () =>
			SigningKey.recoverPublicKey(sha256("0x1235"), key.sign(digest)),
		);
	}
	const a = new SigningKey(PRIV_A);
	const b = new SigningKey(PRIV_B);
	await cap(o, "sharedSecret(a,b)", () => a.computeSharedSecret(b.publicKey));
	await cap(o, "sharedSecret(b,a)", () => b.computeSharedSecret(a.publicKey));
	await cap(o, "addPoints", () =>
		SigningKey.addPoints(a.publicKey, b.publicKey),
	);
	await cap(o, "sharedSecret(invalid)", () => a.computeSharedSecret("0x00"));
	for (const len of [0, 32, 56, 58]) {
		await cap(
			o,
			`SigningKey(len=${len})`,
			() => new SigningKey(new Uint8Array(len)).publicKey,
		);
	}
	// Pinned go-core interop vectors.
	for (const v of sharedSecretVectors) {
		await cap(o, `vector:${v.name}`, () => {
			const ka = new SigningKey(v.privateA);
			const kb = new SigningKey(v.privateB);
			return {
				publicA: ka.publicKey,
				publicB: kb.publicKey,
				secret: ka.computeSharedSecret(kb.publicKey),
				reverse: kb.computeSharedSecret(ka.publicKey),
			};
		});
	}
	await cap(o, "recoverAddress", () =>
		recoverAddress(sha256("0x1234"), a.sign(sha256("0x1234")), PREFIX),
	);
	return o;
}

async function walletsAndMnemonics(): Promise<Bucket> {
	const o: Bucket = {};
	const w = new Wallet({ key: PRIV_A, prefix: PREFIX });
	await cap(o, "wallet.address", () => w.address);
	await cap(o, "wallet.privateKey", () => w.privateKey);
	await cap(o, "wallet.signMessage", () => w.signMessage("hello"));
	await cap(o, "verifyMessage", async () =>
		verifyMessage("hello", await w.signMessage("hello"), PREFIX),
	);
	for (const p of ["ab", "ce"]) {
		await cap(
			o,
			`wallet.address(${p})`,
			() => new Wallet({ key: PRIV_A, prefix: p }).address,
		);
	}
	await cap(o, "defaultPath", () => defaultPath);
	for (const i of [0, 1, 5, 100]) {
		// Core pins the account component, so only the indexed pattern works.
		await cap(o, `getAccountPath(${i})`, () => getAccountPath(i));
		await cap(o, `getIndexedAccountPath(${i})`, () => getIndexedAccountPath(i));
	}

	await cap(o, "mnemonic.fromEntropy", () => {
		const m = Mnemonic.fromEntropy(PHRASE_ENTROPY);
		return { phrase: m.phrase, entropy: m.entropy, seed: m.computeSeed() };
	});
	const phrase = (() => {
		try {
			return Mnemonic.fromEntropy(PHRASE_ENTROPY).phrase;
		} catch {
			return null;
		}
	})();
	await cap(o, "mnemonic.phrase", () => phrase);
	if (phrase) {
		await cap(o, "mnemonic.fromPhrase.seed", () =>
			Mnemonic.fromPhrase({ phrase }).computeSeed(),
		);
		await cap(o, "mnemonic.withPassword", () =>
			Mnemonic.fromPhrase({ phrase, password: "pw" }).computeSeed(),
		);
		await cap(o, "hd.fromPhrase", () => {
			const hd = HDNodeWallet.fromPhrase({ phrase, prefix: PREFIX });
			return {
				address: hd.address,
				privateKey: hd.privateKey,
				publicKey: hd.publicKey,
				path: hd.path,
				depth: hd.depth,
				index: hd.index,
				fingerprint: hd.fingerprint,
			};
		});
		// Only m/44'/654'/0'/0/<index> is derivable; the coin-type-60 spelling is
		// accepted for keystores written before the path was pinned. Everything
		// else must be rejected rather than answered with another account's key.
		for (const p of [
			"m/44'/654'/0'/0/0",
			"m/44'/654'/0'/0/1",
			"m/44'/654'/0'/0/5",
			"m/44'/60'/0'/0/5",
			"m",
			"m/0",
			"m/1",
			"m/0/1",
			"m/44'/654'/1'/0/0",
			"m/44'/654'/0'/0/0'",
			"m/44'/654'/0'/0/x",
		]) {
			await cap(o, `hd.derive(${p})`, () => {
				const hd = HDNodeWallet.fromPhrase({ phrase, prefix: PREFIX });
				const child = hd.derivePath(p);
				return {
					address: child.address,
					privateKey: child.privateKey,
					path: child.path,
					depth: child.depth,
				};
			});
		}
		for (const i of [0, 1, 2, 5, 100]) {
			await cap(o, `hd.deriveChild(${i})`, () => {
				const child = HDNodeWallet.fromPhrase({
					phrase,
					prefix: PREFIX,
				}).deriveChild(i);
				return { address: child.address, privateKey: child.privateKey };
			});
		}
		await cap(o, "hd.fromSeed", () => {
			const seed = Mnemonic.fromPhrase({ phrase }).computeSeed();
			const hd = HDNodeWallet.fromSeed({ seed, prefix: PREFIX });
			return { address: hd.address, path: hd.path, privateKey: hd.privateKey };
		});
		await cap(o, "hd.fromSeed.absolute", () => {
			const seed = Mnemonic.fromPhrase({ phrase }).computeSeed();
			const hd = HDNodeWallet.fromSeed({
				seed,
				prefix: PREFIX,
				path: "m/44'/654'/0'/0/0",
			});
			return { address: hd.address, privateKey: hd.privateKey, path: hd.path };
		});
	}
	return o;
}

async function keystores(): Promise<Bucket> {
	const o: Bucket = {};
	const account = { address: KNOWN_ADDRESS, privateKey: PRIV_A };
	const options = {
		salt: "0x" + "02".repeat(32),
		iv: "0x" + "03".repeat(16),
		uuid: "0x" + "04".repeat(16),
		scrypt: { N: 1 << 10, r: 8, p: 1 },
	};
	await cap(o, "encryptKeystoreJsonSync", () =>
		JSON.parse(
			encryptKeystoreJsonSync(account as any, "password", options as any),
		),
	);
	await cap(o, "roundtrip", () => {
		const json = encryptKeystoreJsonSync(
			account as any,
			"password",
			options as any,
		);
		const back = decryptKeystoreJsonSync(json, "password");
		return { address: back.address, privateKey: back.privateKey };
	});
	await cap(o, "wrong-password", () => {
		const json = encryptKeystoreJsonSync(
			account as any,
			"password",
			options as any,
		);
		return decryptKeystoreJsonSync(json, "wrong").address;
	});
	// Keystores written before the derivation path was pinned recorded labels
	// like "m" or "m/3". Those must still reopen as HD wallets on the right
	// account, and a mislabelled one must fall back instead of being trusted.
	for (const [account, label] of [
		[0, "m"],
		[1, "m/1"],
		[1, "m/0/1"],
		[3, "m/3"],
		[3, "m/44'/654'/0'/0/3"],
		[3, "m/44'/60'/0'/0/3"],
		[3, "m/44'/654'/0'/0/7"],
	] as Array<[number, string]>) {
		await cap(o, `legacy-path:${account}:${label}`, () => {
			const hd = HDNodeWallet.fromPhrase({
				phrase: Mnemonic.fromEntropy(PHRASE_ENTROPY).phrase,
				prefix: PREFIX,
			}).deriveChild(account);
			const json = encryptKeystoreJsonSync(
				{
					address: hd.address,
					privateKey: hd.privateKey,
					mnemonic: { path: label, locale: "en", entropy: PHRASE_ENTROPY },
				} as any,
				"pw",
				options as any,
			);
			const back: any = Wallet.fromEncryptedJsonSync(json, "pw");
			return {
				kind: back.constructor.name,
				keyMatches: back.privateKey === hd.privateKey,
				path: back.path ?? null,
			};
		});
	}

	// go-core / historical keystore import compatibility.
	for (const v of pbkdf2KeystoreVectors) {
		await cap(o, `import:${v.name}`, () => {
			const back = decryptKeystoreJsonSync(
				JSON.stringify(v.keystore),
				v.password,
			);
			return { address: back.address, privateKey: back.privateKey };
		});
	}
	return o;
}

async function transactions(): Promise<Bucket> {
	const o: Bucket = {};
	const base: any = {
		to: KNOWN_ADDRESS,
		nonce: 3,
		energyLimit: 21000,
		energyPrice: 1000000000,
		value: 1000000000000000000n,
		data: "0x",
		networkId: 1,
	};
	await cap(o, "unsigned", () => {
		const tx = Transaction.from(base);
		return {
			unsignedSerialized: tx.unsignedSerialized,
			unsignedHash: tx.unsignedHash,
			networkId: tx.networkId,
			energyLimit: tx.energyLimit,
			energyPrice: tx.energyPrice,
		};
	});
	await cap(o, "signed", async () => {
		const w = new Wallet({ key: PRIV_A, prefix: PREFIX });
		const signed = await w.signTransaction(base);
		const parsed = Transaction.from(signed);
		return {
			serialized: signed,
			hash: parsed.hash,
			from: parsed.from,
			to: parsed.to,
			nonce: parsed.nonce,
		};
	});
	await cap(o, "withData", () => {
		const tx = Transaction.from({ ...base, data: "0xdeadbeef" });
		return tx.unsignedSerialized;
	});
	await cap(o, "noTo", () => {
		const tx = Transaction.from({ ...base, to: null });
		return tx.unsignedSerialized;
	});
	return o;
}

async function abiAndTypedData(): Promise<Bucket> {
	const o: Bucket = {};
	const coder = AbiCoder.defaultAbiCoder();
	const cases: Array<[string[], any[]]> = [
		[["uint256"], [123n]],
		[["string"], ["hello"]],
		[
			["bool", "bytes"],
			[true, "0x1234"],
		],
		[["uint8[]"], [[1, 2, 3]]],
		[["(uint256,string)"], [[7n, "x"]]],
	];
	for (const [types, values] of cases) {
		await cap(o, `encode(${types.join(",")})`, () =>
			coder.encode(types, values),
		);
		await cap(o, `decode(${types.join(",")})`, () =>
			coder.decode(types, coder.encode(types, values)).toArray(),
		);
	}
	const iface = new Interface([
		"function transfer(address to, uint256 amount) returns (bool)",
		"event Transfer(address indexed from, address indexed to, uint256 value)",
		"error Failed(string reason)",
	]);
	await cap(o, "iface.format", () => iface.format());
	await cap(o, "iface.selector", () => iface.getFunction("transfer")!.selector);
	await cap(o, "iface.encodeFunctionData", () =>
		iface.encodeFunctionData("transfer", [KNOWN_ADDRESS, 5n]),
	);
	await cap(o, "iface.eventTopic", () => iface.getEvent("Transfer")!.topicHash);
	await cap(o, "iface.errorSelector", () => iface.getError("Failed")!.selector);
	const domain = { name: "T", version: "1", networkId: 1 } as any;
	const types = { Msg: [{ name: "v", type: "uint256" }] };
	await cap(o, "typedData.hash", () =>
		TypedDataEncoder.hash(domain, types, { v: 1n }),
	);
	await cap(o, "typedData.sign+verify", async () => {
		const w = new Wallet({ key: PRIV_A, prefix: PREFIX });
		const sig = await w.signTypedData(domain, types, { v: 1n });
		return {
			sig,
			signer: verifyTypedData(domain, types, { v: 1n }, sig, PREFIX),
		};
	});
	return o;
}

async function wordlistData(): Promise<Bucket> {
	const o: Bucket = {};
	for (const locale of Object.keys(wordlists as any).sort()) {
		await cap(o, locale, () => {
			const wl: any = (wordlists as any)[locale];
			const words: string[] = [];
			for (let i = 0; i < 2048; i++) words.push(wl.getWord(i));
			return {
				first: words[0],
				second: words[1],
				last: words[2047],
				checksum: id(words.join(" ")),
				indexOfFirst: wl.getWordIndex(words[0]),
			};
		});
	}
	return o;
}

/** Build the full baseline. */
export async function capture(): Promise<Bucket> {
	return {
		hashes: await hashes(),
		dataUtils: await dataUtils(),
		addresses: await addresses(),
		units: await units(),
		signing: await signing(),
		wallets: await walletsAndMnemonics(),
		keystores: await keystores(),
		transactions: await transactions(),
		abi: await abiAndTypedData(),
		wordlists: await wordlistData(),
	};
}
