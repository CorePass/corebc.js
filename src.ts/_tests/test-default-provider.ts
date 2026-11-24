import assert from "node:assert/strict";
import {
	getDefaultProvider,
	JsonRpcProvider,
	Network,
	WebSocketProvider,
} from "../index.js";

import type { Networkish } from "../providers/index.js";

describe("Core default RPC profiles", () => {
	const profiles = [
		{
			name: "mainnet",
			id: 1,
			url: "https://xcbapi.coreblockchain.net/",
			inputs: [undefined, "mainnet", "cb", 1, 1n],
		},
		{
			name: "devin",
			id: 3,
			url: "https://xcbapi.corecoin.cc/",
			inputs: ["devin", "testnet", "ab", 3, 3n],
		},
	];

	for (const { name, id, url, inputs } of profiles) {
		it(`routes each form of ${name} directly to its Core endpoint`, () => {
			const networks: Array<Networkish | undefined> = [
				...inputs,
				new Network(name, id),
				{ name, networkId: id },
			];
			for (const network of networks) {
				const provider = getDefaultProvider(network);
				try {
					assert.ok(provider instanceof JsonRpcProvider);
					assert.equal(provider._getConnection().url, url);
				} finally {
					provider.destroy();
				}
			}
		});

		it(`verifies the RPC network ID for ${name}`, async () => {
			const provider = getDefaultProvider(name);
			assert.ok(provider instanceof JsonRpcProvider);
			let reportedId = id;
			provider._send = async (payload) => {
				assert.ok(!Array.isArray(payload));
				assert.equal(payload.method, "xcb_networkId");
				return [{ id: payload.id, result: "0x" + reportedId.toString(16) }];
			};
			try {
				assert.equal((await provider.getNetwork()).networkId, BigInt(id));
				reportedId = id === 1 ? 3 : 1;
				await assert.rejects(provider.getNetwork(), { code: "NETWORK_ERROR" });
			} finally {
				provider.destroy();
			}
		});
	}

	it("requires an explicit endpoint outside the two public networks", () => {
		for (const network of [
			"homestead",
			"ropsten",
			"sepolia",
			"matic",
			"private",
			"ce",
			1337,
			new Network("ropsten", 3),
			new Network("devin", 1),
		]) {
			assert.throws(
				() => getDefaultProvider(network),
				/unknown network|no public Core RPC/,
			);
		}
	});

	it("rejects legacy backend selection for named profiles", () => {
		assert.throws(
			() => getDefaultProvider("mainnet", { exclusive: "infura" }),
			/backend options/,
		);
	});

	it("connects directly to an explicitly supplied HTTP URL or WebSocket", async () => {
		const url = "http://localhost:8545/";
		const http = getDefaultProvider(url);
		try {
			assert.ok(http instanceof JsonRpcProvider);
			assert.equal(http._getConnection().url, url);
		} finally {
			http.destroy();
		}

		const socket = {
			onopen: null,
			onmessage: null,
			onerror: null,
			readyState: 0,
			send() {},
			close() {},
		};
		const ws = getDefaultProvider(socket);
		try {
			assert.ok(ws instanceof WebSocketProvider);
			assert.equal(ws.websocket, socket);
		} finally {
			await ws.destroy();
		}
	});
});
