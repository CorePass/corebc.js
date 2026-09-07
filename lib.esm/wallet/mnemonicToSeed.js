import { Buffer } from "buffer";
import { pbkdf2Sync } from "../crypto/crypto.js";
import utf8 from "utf8";
export function mnemonicToSeed(mnemonic, password) {
    if (!password) {
        password = "";
    }
    const t = generateSeed(mnemonic, password);
    return t.goldilock;
}
const generateSeed = (mnemonic, password) => {
    const goldilockSaltPrefix = "mnemonic";
    const aesSaltPrefix = "mnemonicfortheAESkey";
    const goldilockSalt = utf8.encode(goldilockSaltPrefix + password);
    const aesSalt = utf8.encode(aesSaltPrefix + password);
    const goldilockKey = pbkdf2Sync(Buffer.from(mnemonic), Buffer.from(goldilockSalt), 2048, 64, "sha512");
    const aesKeySeed = pbkdf2Sync(Buffer.from(mnemonic), Buffer.from(aesSalt), 2048, 64, "sha512");
    return {
        aes: Buffer.from(aesKeySeed).toString("hex"),
        goldilock: Buffer.from(goldilockKey).toString("hex"),
    };
};
//# sourceMappingURL=mnemonicToSeed.js.map