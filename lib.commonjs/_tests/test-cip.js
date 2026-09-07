'use strict';

var assert = require('node:assert/strict');
require('buffer');
require('../address/index.js');
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
var _interface = require('../abi/interface.js');
require('../constants/numbers.js');
require('../contract/contract.js');
require('../providers/provider.js');
require('../transaction/transaction.js');
require('../hash/typed-data.js');
require('../providers/format.js');
require('ws');
require('../providers/provider-fallback.js');
require('net');
require('utf8');
require('../wallet/json-keystore.js');
require('../wallet/json-crowdsale.js');
require('../bigNumber/bigNumber.js');
require('../wordlists/wordlists.js');
var index = require('../cip/index.js');
var index$1 = require('../ipfs/index.js');
var customUnits = require('../cip/custom-units.js');

const address = "0xab38254e30777140469a3aa168df81182d3d61f9843f";
describe("CIP metadata and custom units", () => {
    it("uses Unix seconds and exact inclusive lifecycle boundaries", () => {
        const lifecycle = new index.Cip151Lifecycle({
            tokenExpiration: "9007199254740993",
            tradingStop: "0",
        });
        assert.equal(lifecycle.isExpiredAt(9007199254740992n), false);
        assert.equal(lifecycle.isExpiredAt(9007199254740993n), true);
        assert.equal(lifecycle.isTradingStoppedAt(0n), true);
        assert.equal(new index.Cip151Lifecycle().isExpiredAt(1n), false);
        for (const value of ["-1", "1.5", "1e3", " 1", "NaN"])
            assert.throws(() => new index.Cip151Lifecycle({ tokenExpiration: value }));
    });
    it("validates and copies lab measurements", () => {
        const input = { moisture: { value: 12, unit: "%" } };
        const lab = new index.Cip152LabCertificate(input);
        input.moisture.value = 99;
        assert.equal(lab.measurements.moisture.value, 12);
        for (const json of [
            null,
            [],
            { x: {} },
            { x: { value: true } },
            { x: { value: Infinity } },
            { x: { value: 1, unit: 3 } },
        ])
            assert.throws(() => new index.Cip152LabCertificate(json));
    });
    it("encodes CIP-150 calls and preserves block references", async () => {
        const abi = new _interface.Interface(index.cip150Abi);
        const values = {
            tokenExpiration: "100",
            lab: "ipfs://QmExample/lab.json",
        };
        const calls = [];
        const metadata = new index.Cip150MetadataContract(address, {
            provider: null,
            call: async (tx) => {
                assert.equal(tx.blockTag, 42);
                const parsed = abi.parseTransaction({ data: tx.data });
                calls.push(parsed.name);
                const key = parsed.args.length ? parsed.args[0] : "";
                const result = {
                    listMetadataKeys: [Object.keys(values)],
                    metadataCount: [2n],
                    getMetadataByIndex: ["tokenExpiration", "100"],
                    hasMetadataKey: [Object.hasOwn(values, key)],
                    getMetadataValue: [values[key]],
                    isMetadataSealed: [true],
                };
                return abi.encodeFunctionResult(parsed.fragment, result[parsed.name]);
            },
        });
        assert.equal(await metadata.count(42), 2n);
        assert.deepEqual(await metadata.getByIndex(0n, 42), {
            key: "tokenExpiration",
            value: "100",
        });
        assert.equal((await metadata.readAll(42))[0].sealed, true);
        assert.equal((await metadata.readAll(42, false))[0].sealed, undefined);
        assert.equal((await metadata.readLifecycle(42)).tokenExpiration, 100n);
        const gateway = new index$1.IpfsGateway({
            fetch: async () => new Response('{"pH":{"value":7}}'),
        });
        assert.equal((await metadata.readLabCertificate(gateway, 42)).measurements.pH.value, 7);
        values.lab = "ipfs://QmExample/wrong.json";
        await assert.rejects(metadata.readLabCertificate(gateway, 42), /lab.json/);
        delete values.lab;
        assert.equal(await metadata.readLabCertificate(gateway, 42), null);
        await assert.rejects(metadata.setValue("x", "y"), /sendTransaction/);
        assert.ok(calls.includes("isMetadataSealed"));
    });
    it("discovers custom units and retains balances beyond Number precision", async () => {
        const abi = new _interface.Interface(customUnits.customUnitAbi);
        const canonical = 9007199254740993n;
        const token = new customUnits.CustomUnitToken(address, {
            provider: null,
            call: async (tx) => {
                assert.equal(tx.blockTag, 10);
                const parsed = abi.parseTransaction({ data: tx.data });
                const result = {
                    supportsUnit: [parsed.args.length > 0 && parsed.args[0] === "units"],
                    supportedUnits: [["units", "kg"]],
                    preferredUnit: ["kg"],
                    balanceOf: [canonical],
                    balanceOfUnit: [canonical * 3n],
                };
                if (parsed.name === "balanceOfUnit")
                    assert.equal(parsed.args[1], "kg");
                return abi.encodeFunctionResult(parsed.fragment, result[parsed.name]);
            },
        });
        assert.equal((await token.discover(10)).supports("kg"), true);
        const balance = await token.balance(address, undefined, 10);
        assert.equal(balance.multiplierNumerator, canonical * 3n);
        assert.equal(balance.multiplierDenominator, canonical);
        assert.equal(await token.supportsUnit(" ", 10), false);
        assert.throws(() => token.balanceOfUnit(address, " "));
    });
});
describe("IPFS gateway", () => {
    it("resolves references and rejects unsupported schemes and traversal", () => {
        const gateway = new index$1.IpfsGateway();
        for (const ref of [
            "ipfs://QmExample/lab.json",
            "/ipfs/QmExample/lab.json",
            "QmExample/lab.json",
            "ipfs://ipfs/QmExample/lab.json",
        ])
            assert.equal(gateway.resolve(ref).href, "https://ipf.sk/QmExample/lab.json");
        assert.equal(gateway.resolve("https://example.com/lab.json").href, "https://example.com/lab.json");
        for (const ref of ["", "file:///tmp/lab.json", "QmExample/../lab.json"])
            assert.throws(() => gateway.resolve(ref));
        assert.throws(() => new index$1.IpfsGateway({ maxResponseBytes: 0 }));
        assert.throws(() => new index$1.IpfsGateway({ template: "ftp://example.com/{cid}" }));
    });
    it("bounds streamed bodies and cancels oversized responses", async () => {
        let cancelled = false;
        const gateway = new index$1.IpfsGateway({
            maxResponseBytes: 4,
            fetch: async () => new Response(new ReadableStream({
                start(c) {
                    c.enqueue(new Uint8Array(5));
                },
                cancel() {
                    cancelled = true;
                },
            })),
        });
        await assert.rejects(gateway.readJson("QmExample"), /exceeds/);
        assert.equal(cancelled, true);
    });
    it("rejects HTTP errors and invalid JSON", async () => {
        await assert.rejects(new index$1.IpfsGateway({
            fetch: async () => new Response("no", { status: 404 }),
        }).readJson("QmExample"), /404/);
        await assert.rejects(new index$1.IpfsGateway({ fetch: async () => new Response("not json") }).readJson("QmExample"), SyntaxError);
    });
    it("aborts stalled requests", async () => {
        const gateway = new index$1.IpfsGateway({
            timeoutMs: 5,
            fetch: async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))),
        });
        await assert.rejects(gateway.readJson("QmExample"), /aborted/);
    });
});
//# sourceMappingURL=test-cip.js.map
