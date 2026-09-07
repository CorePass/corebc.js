import assert from "node:assert/strict";
import {
	Interface,
	Cip150MetadataContract,
	Cip151Lifecycle,
	Cip152LabCertificate,
	CustomUnitToken,
	cip150Abi,
	customUnitAbi,
	IpfsGateway,
} from "../index.js";
import type { TransactionRequest } from "../providers/index.js";
const address = "0xab38254e30777140469a3aa168df81182d3d61f9843f";

describe("CIP metadata and custom units", () => {
	it("uses Unix seconds and exact inclusive lifecycle boundaries", () => {
		const lifecycle = new Cip151Lifecycle({
			tokenExpiration: "9007199254740993",
			tradingStop: "0",
		});
		assert.equal(lifecycle.isExpiredAt(9007199254740992n), false);
		assert.equal(lifecycle.isExpiredAt(9007199254740993n), true);
		assert.equal(lifecycle.isTradingStoppedAt(0n), true);
		assert.equal(new Cip151Lifecycle().isExpiredAt(1n), false);
		for (const value of ["-1", "1.5", "1e3", " 1", "NaN"])
			assert.throws(() => new Cip151Lifecycle({ tokenExpiration: value }));
	});
	it("validates and copies lab measurements", () => {
		const input = { moisture: { value: 12, unit: "%" } };
		const lab = new Cip152LabCertificate(input);
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
			assert.throws(() => new Cip152LabCertificate(json));
	});
	it("encodes CIP-150 calls and preserves block references", async () => {
		const abi = new Interface(cip150Abi);
		const values: Record<string, string> = {
			tokenExpiration: "100",
			lab: "ipfs://QmExample/lab.json",
		};
		const calls: string[] = [];
		const metadata = new Cip150MetadataContract(address, {
			provider: null,
			call: async (tx: TransactionRequest) => {
				assert.equal(tx.blockTag, 42);
				const parsed = abi.parseTransaction({ data: tx.data! })!;
				calls.push(parsed.name);
				const key = parsed.args.length ? parsed.args[0] : "";
				const result: Record<string, unknown[]> = {
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
		const gateway = new IpfsGateway({
			fetch: async () => new Response('{"pH":{"value":7}}'),
		});
		assert.equal(
			(await metadata.readLabCertificate(gateway, 42))!.measurements.pH.value,
			7,
		);
		values.lab = "ipfs://QmExample/wrong.json";
		await assert.rejects(metadata.readLabCertificate(gateway, 42), /lab.json/);
		delete values.lab;
		assert.equal(await metadata.readLabCertificate(gateway, 42), null);
		await assert.rejects(metadata.setValue("x", "y"), /sendTransaction/);
		assert.ok(calls.includes("isMetadataSealed"));
	});
	it("discovers custom units and retains balances beyond Number precision", async () => {
		const abi = new Interface(customUnitAbi);
		const canonical = 9007199254740993n;
		const token = new CustomUnitToken(address, {
			provider: null,
			call: async (tx) => {
				assert.equal(tx.blockTag, 10);
				const parsed = abi.parseTransaction({ data: tx.data! })!;
				const result: Record<string, unknown[]> = {
					supportsUnit: [parsed.args.length > 0 && parsed.args[0] === "units"],
					supportedUnits: [["units", "kg"]],
					preferredUnit: ["kg"],
					balanceOf: [canonical],
					balanceOfUnit: [canonical * 3n],
				};
				if (parsed.name === "balanceOfUnit") assert.equal(parsed.args[1], "kg");
				return abi.encodeFunctionResult(parsed.fragment, result[parsed.name]);
			},
		});
		assert.equal((await token.discover(10))!.supports("kg"), true);
		const balance = await token.balance(address, undefined, 10);
		assert.equal(balance.multiplierNumerator, canonical * 3n);
		assert.equal(balance.multiplierDenominator, canonical);
		assert.equal(await token.supportsUnit(" ", 10), false);
		assert.throws(() => token.balanceOfUnit(address, " "));
	});
});

describe("IPFS gateway", () => {
	it("resolves references and rejects unsupported schemes and traversal", () => {
		const gateway = new IpfsGateway();
		for (const ref of [
			"ipfs://QmExample/lab.json",
			"/ipfs/QmExample/lab.json",
			"QmExample/lab.json",
			"ipfs://ipfs/QmExample/lab.json",
		])
			assert.equal(
				gateway.resolve(ref).href,
				"https://ipf.sk/QmExample/lab.json",
			);
		assert.equal(
			gateway.resolve("https://example.com/lab.json").href,
			"https://example.com/lab.json",
		);
		for (const ref of ["", "file:///tmp/lab.json", "QmExample/../lab.json"])
			assert.throws(() => gateway.resolve(ref));
		assert.throws(() => new IpfsGateway({ maxResponseBytes: 0 }));
		assert.throws(
			() => new IpfsGateway({ template: "ftp://example.com/{cid}" }),
		);
	});
	it("bounds streamed bodies and cancels oversized responses", async () => {
		let cancelled = false;
		const gateway = new IpfsGateway({
			maxResponseBytes: 4,
			fetch: async () =>
				new Response(
					new ReadableStream({
						start(c) {
							c.enqueue(new Uint8Array(5));
						},
						cancel() {
							cancelled = true;
						},
					}),
				),
		});
		await assert.rejects(gateway.readJson("QmExample"), /exceeds/);
		assert.equal(cancelled, true);
	});
	it("rejects HTTP errors and invalid JSON", async () => {
		await assert.rejects(
			new IpfsGateway({
				fetch: async () => new Response("no", { status: 404 }),
			}).readJson("QmExample"),
			/404/,
		);
		await assert.rejects(
			new IpfsGateway({ fetch: async () => new Response("not json") }).readJson(
				"QmExample",
			),
			SyntaxError,
		);
	});
	it("aborts stalled requests", async () => {
		const gateway = new IpfsGateway({
			timeoutMs: 5,
			fetch: async (_url, init) =>
				new Promise((_resolve, reject) =>
					init!.signal!.addEventListener("abort", () =>
						reject(new Error("aborted")),
					),
				),
		});
		await assert.rejects(gateway.readJson("QmExample"), /aborted/);
	});
});
