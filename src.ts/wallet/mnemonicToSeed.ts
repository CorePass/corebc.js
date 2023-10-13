import { pbkdf2Sync } from "../crypto/crypto.js";
import utf8 from "utf8";
export function mnemonicToSeed(mnemonic: string, password?: string): string {
  if (!password) {
    password = "";
  }
  const t = generateSeed(mnemonic, password);
  return t.goldilock;
}

const generateSeed = (mnemonic: string, password?: string) => {
  const goldilockSaltPrefix = "mnemonicforthegoldilockkey";
  const aesSaltPrefix = "mnemonicfortheAESkey";

  const goldilockSalt = utf8.encode(goldilockSaltPrefix + password);
  const aesSalt = utf8.encode(aesSaltPrefix + password);

  const goldilockKey = pbkdf2Sync(
    Buffer.from(mnemonic),
    goldilockSalt,
    2048,
    64,
    "sha512",
  );

  const aesKeySeed = pbkdf2Sync(
    Buffer.from(mnemonic),
    aesSalt,
    2048,
    64,
    "sha512",
  );

  return {
    aes: aesKeySeed.toString("hex"),
    goldilock: goldilockKey.toString("hex"),
  };
};
