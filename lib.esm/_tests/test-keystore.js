import assert from "node:assert/strict";
import { Wallet, networkIdToPrefix, encryptKeystoreJsonSync, encryptKeystoreJson, decryptKeystoreJsonSync, decryptKeystoreJson, } from "../index.js";
describe("AES keystores", () => {
    const wallet = Wallet.fromSeed({
        seed: "01".repeat(64),
        prefix: networkIdToPrefix(3),
    });
    const account = { address: wallet.address, privateKey: wallet.privateKey };
    const options = { scrypt: { N: 16, r: 1, p: 1 } };
    it("round-trips Ed448 keys with sync and async encryption", async () => {
        for (const json of [
            encryptKeystoreJsonSync(account, "test", options),
            await encryptKeystoreJson(account, "test", options),
        ]) {
            assert.deepEqual(decryptKeystoreJsonSync(json, "test"), account);
            assert.deepEqual(await decryptKeystoreJson(json, "test"), account);
            assert.throws(() => decryptKeystoreJsonSync(json, "wrong"), /incorrect password/);
            const changed = JSON.parse(json);
            changed.Crypto.mac = "00".repeat(32);
            await assert.rejects(decryptKeystoreJson(JSON.stringify(changed), "test"), /incorrect password/);
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
            assert.throws(() => encryptKeystoreJsonSync(account, "test", { scrypt }), /unsafe/);
        const data = JSON.parse(encryptKeystoreJsonSync(account, "test", options));
        data.Crypto.kdfparams.n = 2 ** 32;
        assert.throws(() => decryptKeystoreJsonSync(JSON.stringify(data), "test"), /unsafe/);
        data.Crypto.kdf = "pbkdf2";
        Object.assign(data.Crypto.kdfparams, { c: 10000001, prf: "hmac-sha256" });
        assert.throws(() => decryptKeystoreJsonSync(JSON.stringify(data), "test"), /unsafe/);
    });
});
//# sourceMappingURL=test-keystore.js.map