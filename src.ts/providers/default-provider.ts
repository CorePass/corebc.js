import { assert, assertArgument } from "../utils/index.js";
import { Network } from "./network.js";
import { JsonRpcProvider } from "./provider-jsonrpc.js";
import { WebSocketProvider } from "./provider-websocket.js";

import type { AbstractProvider } from "./abstract-provider.js";
import type { Networkish } from "./network.js";
import type { WebSocketLike } from "./provider-websocket.js";

function isWebSocketLike(value: any): value is WebSocketLike {
	return (
		value &&
		typeof value.send === "function" &&
		typeof value.close === "function"
	);
}

/**
 *  Connects to the public Core Mainnet (the default) or Devin RPC.
 *  The provider checks the node's network ID against the selected profile.
 *  Pass an HTTP(S) URL, WebSocket URL or WebSocket connection to use your own node.
 *  Named profiles each use a single endpoint and accept no backend options.
 */
export function getDefaultProvider(
	network?: Networkish | WebSocketLike,
	options?: any,
): AbstractProvider {
	if (typeof network === "string" && /^https?:/i.test(network)) {
		return new JsonRpcProvider(network);
	}
	if (
		(typeof network === "string" && /^wss?:/i.test(network)) ||
		isWebSocketLike(network)
	) {
		return new WebSocketProvider(network);
	}

	assertArgument(
		options == null || Object.keys(options).length === 0,
		"Core RPC profiles do not accept backend options",
		"options",
		"[ REDACTED ]",
	);

	const profile = Network.from(network);
	if (profile.name === "mainnet" && profile.networkId === 1n) {
		return new JsonRpcProvider("https://xcbapi.coreblockchain.net/", profile);
	}
	if (profile.name === "devin" && profile.networkId === 3n) {
		return new JsonRpcProvider("https://xcbapi.corecoin.cc/", profile);
	}
	assert(
		false,
		"no public Core RPC for this network; pass a node URL",
		"UNSUPPORTED_OPERATION",
		{
			operation: "getDefaultProvider",
		},
	);
}
