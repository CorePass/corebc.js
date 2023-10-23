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
    const goldilockKey = pbkdf2Sync(Buffer.from(mnemonic), goldilockSalt, 2048, 64, "sha512");
    const aesKeySeed = pbkdf2Sync(Buffer.from(mnemonic), aesSalt, 2048, 64, "sha512");
    return {
        aes: aesKeySeed.toString("hex"),
        goldilock: goldilockKey.toString("hex"),
    };
};
//# sourceMappingURL=mnemonicToSeed.js.map