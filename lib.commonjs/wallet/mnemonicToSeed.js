"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mnemonicToSeed = void 0;
const tslib_1 = require("tslib");
const crypto_js_1 = require("../crypto/crypto.js");
const utf8_1 = tslib_1.__importDefault(require("utf8"));
function mnemonicToSeed(mnemonic, password) {
    if (!password) {
        password = "";
    }
    const t = generateSeed(mnemonic, password);
    return t.goldilock;
}
exports.mnemonicToSeed = mnemonicToSeed;
const generateSeed = (mnemonic, password) => {
    const goldilockSaltPrefix = "mnemonic";
    const aesSaltPrefix = "mnemonicfortheAESkey";
    const goldilockSalt = utf8_1.default.encode(goldilockSaltPrefix + password);
    const aesSalt = utf8_1.default.encode(aesSaltPrefix + password);
    const goldilockKey = (0, crypto_js_1.pbkdf2Sync)(Buffer.from(mnemonic), goldilockSalt, 2048, 64, "sha512");
    const aesKeySeed = (0, crypto_js_1.pbkdf2Sync)(Buffer.from(mnemonic), aesSalt, 2048, 64, "sha512");
    return {
        aes: aesKeySeed.toString("hex"),
        goldilock: goldilockKey.toString("hex"),
    };
};
//# sourceMappingURL=mnemonicToSeed.js.map