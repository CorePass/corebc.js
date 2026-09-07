'use strict';

var assert = require('node:assert/strict');
require('buffer');
require('../address/index.js');
require('../crypto/hmac.js');
var ripemd160 = require('../crypto/ripemd160.js');
require('../crypto/pbkdf2.js');
require('../crypto/random.js');
var scrypt = require('../crypto/scrypt.js');
var sha3 = require('../crypto/sha3.js');
require('bcrypto/lib/ed448.js');
require('bcrypto/lib/pbkdf2.js');
require('bcrypto/lib/sha3-512.js');
require('crypto');
var keccak = require('../crypto/keccak.js');
var signingKey = require('../crypto/signing-key.js');
require('../crypto/signature.js');
var data = require('../utils/data.js');
require('../abi/abi-coder.js');
require('../utils/base58.js');
require('../utils/errors.js');
require('../logger/logger.js');
require('http');
require('https');
require('zlib');
require('../utils/fixednumber.js');
require('../utils/maths.js');
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
require('../wallet/json-keystore.js');
require('../wallet/json-crowdsale.js');
require('../bigNumber/bigNumber.js');
require('../wordlists/wordlists.js');
var cryptoBrowser = require('../crypto/crypto-browser.js');

describe("updated crypto dependencies", () => {
    it("matches standard hash and scrypt vectors", async () => {
        assert.equal(sha3.sha256("0x"), "0xa7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a");
        assert.equal(ripemd160.ripemd160("0x"), "0x9c1185a5c5e9fc54612808977ee8f548b2258d31");
        assert.equal(keccak.keccak256("0x"), "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
        const expected = "0x77d6576238657b203b19ca42c18a0497";
        assert.equal(scrypt.scryptSync("0x", "0x", 16, 1, 1, 16), expected);
        assert.equal(await scrypt.scrypt("0x", "0x", 16, 1, 1, 16), expected);
        assert.deepEqual(cryptoBrowser.createHash("sha256").update(new Uint8Array()).digest(), data.getBytes("0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"));
    });
    it("copies byte private keys and validates lengths", () => {
        const bytes = new Uint8Array(57).fill(1);
        const key = new signingKey.SigningKey(bytes);
        bytes.fill(2);
        assert.equal(key.privateKey, "0x" + "01".repeat(57));
        for (const length of [0, 32, 56, 58])
            assert.throws(() => new signingKey.SigningKey(new Uint8Array(length)));
        assert.throws(() => key.sign("0x00"));
    });
    it("signs, rejects tampering and derives symmetric Ed448 secrets in both key modes", () => {
        const a = new signingKey.SigningKey("01".repeat(57));
        const b = new signingKey.SigningKey("02".repeat(56) + "80");
        const digest = sha3.sha256("0x1234");
        for (const key of [a, b]) {
            const sig = key.sign(digest);
            assert.equal(signingKey.SigningKey.recoverPublicKey(digest, sig), key.publicKey);
            assert.throws(() => signingKey.SigningKey.recoverPublicKey(sha3.sha256("0x1235"), sig));
        }
        assert.equal(a.computeSharedSecret(b.publicKey), b.computeSharedSecret(a.publicKey));
        assert.equal(signingKey.SigningKey.addPoints(a.publicKey, b.publicKey), signingKey.SigningKey.addPoints(b.publicKey, a.publicKey));
        assert.throws(() => a.computeSharedSecret("0x00"));
    });
});
//# sourceMappingURL=test-crypto.js.map
