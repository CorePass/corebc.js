import { Buffer } from "buffer";
import { pbkdf2Sync } from "../crypto/crypto.js";

export function mnemonicToSeed(mnemonic: string, password?: string): string {
	const words = Buffer.from(mnemonic.normalize("NFKD"), "utf8");
	const salt = Buffer.from(
		("mnemonic" + (password ?? "")).normalize("NFKD"),
		"utf8",
	);
	return Buffer.from(pbkdf2Sync(words, salt, 2048, 64, "sha512")).toString(
		"hex",
	);
}
