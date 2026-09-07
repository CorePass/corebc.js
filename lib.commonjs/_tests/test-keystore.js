'use strict';

var assert = require('node:assert/strict');
require('buffer');
var index = require('../address/index.js');
require('../crypto/hmac.js');
require('../crypto/ripemd160.js');
require('../crypto/pbkdf2.js');
require('../crypto/random.js');
require('../crypto/scrypt.js');
require('../crypto/sha3.js');
require('bcrypto/lib/ed448.js');
require('bcrypto/lib/pbkdf2.js');
require('bcrypto/lib/sha3-512.js');
require('crypto');
require('../crypto/keccak.js');
require('../utils/base58.js');
require('../logger/logger.js');
require('../utils/errors.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');
require('../crypto/signature.js');
require('../abi/abi-coder.js');
require('../abi/fragments.js');
require('../constants/numbers.js');
require('../transaction/transaction.js');
require('../hash/typed-data.js');
require('../contract/contract.js');
require('../providers/provider.js');
require('../providers/format.js');
require('ws');
require('../providers/provider-fallback.js');
require('net');
require('utf8');
var jsonKeystore = require('../wallet/json-keystore.js');
require('../wallet/json-crowdsale.js');
var wallet = require('../wallet/wallet.js');
require('../bigNumber/bigNumber.js');
require('../wordlists/wordlists.js');

describe("AES keystores", () => {
    const wallet$1 = wallet.Wallet.fromSeed({
        seed: "01".repeat(64),
        prefix: index.networkIdToPrefix(3),
    });
    const account = { address: wallet$1.address, privateKey: wallet$1.privateKey };
    const options = { scrypt: { N: 16, r: 1, p: 1 } };
    it("round-trips Ed448 keys with sync and async encryption", async () => {
        for (const json of [
            jsonKeystore.encryptKeystoreJsonSync(account, "test", options),
            await jsonKeystore.encryptKeystoreJson(account, "test", options),
        ]) {
            assert.deepEqual(jsonKeystore.decryptKeystoreJsonSync(json, "test"), account);
            assert.deepEqual(await jsonKeystore.decryptKeystoreJson(json, "test"), account);
            assert.throws(() => jsonKeystore.decryptKeystoreJsonSync(json, "wrong"), /incorrect password/);
            const changed = JSON.parse(json);
            changed.Crypto.mac = "00".repeat(32);
            await assert.rejects(jsonKeystore.decryptKeystoreJson(JSON.stringify(changed), "test"), /incorrect password/);
        }
    });
    it("rejects unsafe KDF parameters before allocating work", () => {
        for (const scrypt of [
            { N: 0 },
            { N: 1 },
            { N: 2 ** 32 },
            { r: 0 },
            { p: 2 ** 30 },
            { N: 1048576, r: 8 },
        ])
            assert.throws(() => jsonKeystore.encryptKeystoreJsonSync(account, "test", { scrypt }), /unsafe/);
        const data = JSON.parse(jsonKeystore.encryptKeystoreJsonSync(account, "test", options));
        data.Crypto.kdfparams.n = 2 ** 32;
        assert.throws(() => jsonKeystore.decryptKeystoreJsonSync(JSON.stringify(data), "test"), /unsafe/);
        data.Crypto.kdf = "pbkdf2";
        Object.assign(data.Crypto.kdfparams, { c: 10000001, prf: "hmac-sha256" });
        assert.throws(() => jsonKeystore.decryptKeystoreJsonSync(JSON.stringify(data), "test"), /unsafe/);
    });
});
//# sourceMappingURL=test-keystore.js.map
