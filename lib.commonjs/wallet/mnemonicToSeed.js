'use strict';

var buffer = require('buffer');
require('bcrypto/lib/ed448.js');
require('bcrypto/lib/pbkdf2.js');
require('bcrypto/lib/sha3-512.js');
var crypto = require('crypto');
var utf8 = require('utf8');

function mnemonicToSeed(mnemonic, password) {
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
    const goldilockKey = crypto.pbkdf2Sync(buffer.Buffer.from(mnemonic), buffer.Buffer.from(goldilockSalt), 2048, 64, "sha512");
    const aesKeySeed = crypto.pbkdf2Sync(buffer.Buffer.from(mnemonic), buffer.Buffer.from(aesSalt), 2048, 64, "sha512");
    return {
        aes: buffer.Buffer.from(aesKeySeed).toString("hex"),
        goldilock: buffer.Buffer.from(goldilockKey).toString("hex"),
    };
};

exports.mnemonicToSeed = mnemonicToSeed;
//# sourceMappingURL=mnemonicToSeed.js.map
