/**
 *  Regression tests built from responses recorded on the Devin test network
 *  (block 13547341): a Swaptopia V3 swap of 1 XAB for CUSD and the WXCB logs
 *  it emitted.
 */
import assert from "node:assert/strict";

import { formatLog, formatTransactionResponse } from "../providers/format.js";
import {
	Interface,
	Transaction,
	TransactionResponse,
	getAddress,
	isAddress,
} from "../index.js";
import type { Provider } from "../index.js";

const SWAP_HASH =
	"0x5890e0733606c4ff3e36ff3212d60259e9a5dcb03a6d560c25c3b75991cb8977";
const SENDER = "0xab468123323b87cfbcf4a8cd05acbc2fd2b49f961951";
const ROUTER = "0xab37b3070569ed78be15e3e7862ed457c84793d548cb";
const WXCB = "0xab39efc377b7abf8e876bd6ba04665d5c742ea597b28";
const ZERO = "0x" + "0".repeat(44);

// xcb_getTransactionByHash, as returned by go-core: snake_case network_id,
// unprefixed addresses, and no type field.
const swapResponse = {
	blockHash:
		"0x583adac625ea6cbbcffc2055159c8b7a25a0665f607e52886b28b13dd4b9e0d5",
	blockNumber: "0xceb74d",
	from: "ab468123323b87cfbcf4a8cd05acbc2fd2b49f961951",
	energy: "0x3882b",
	energyPrice: "0x2540be400",
	hash: SWAP_HASH,
	input:
		"0xec1d752600000000000000000000ab39efc377b7abf8e876bd6ba04665d5c742ea597b2800000000000000000000ab80c526831282d2eaf503b90f2a87f3d57b2513070d00000000000000000000000000000000000000000000000000000000000001f400000000000000000000ab468123323b87cfbcf4a8cd05acbc2fd2b49f961951000000000000000000000000000000000000000000000000000000006ac78dfd0000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000001bf6b7824a273e7ef2f0000000000000000000000000000000000000000000000000000000000000000",
	nonce: "0x78",
	to: "ab37b3070569ed78be15e3e7862ed457c84793d548cb",
	network_id: "0x3",
	signature:
		"0xa0b6cc513e36197c68dbd5fb32e1f1fb2960101fc53a45f7a62e1f234a584a56bef6e0016e3897dad4a888a02015afb851cf273153434bc4009f408341fc05c92c167ac3a239e3a94f9f01615c3c71eab8a14e1efc24b9331f6f024d967925566763272acae75a3caf383fa5fe2637ff090093e8923c1793b5297cefb326c779e77749a59b9fa02e0d29bbe4ab04a29e55d52ee427943fccd24fc3d4919a65f185e4fdf5421776a6c8de80",
	transactionIndex: "0x0",
	value: "0xde0b6b3a7640000",
};

function logResponse(topics: Array<string>, logIndex: string) {
	return {
		address: "ab39efc377b7abf8e876bd6ba04665d5c742ea597b28",
		topics,
		data: "0x0000000000000000000000000000000000000000000000000de0b6b3a7640000",
		blockNumber: "0xceb74d",
		transactionHash: SWAP_HASH,
		transactionIndex: "0x0",
		blockHash:
			"0x583adac625ea6cbbcffc2055159c8b7a25a0665f607e52886b28b13dd4b9e0d5",
		logIndex,
		removed: false,
	};
}

// WXCB minting to the router: a Transfer from the raw all-zero address.
const mintLog = logResponse(
	[
		"0xc17a9d92b89f27cb79cc390f23a1a5d302fefab8c7911075ede952ac2b5607a1",
		"0x0000000000000000000000000000000000000000000000000000000000000000",
		"0x00000000000000000000ab37b3070569ed78be15e3e7862ed457c84793d548cb",
	],
	"0x1",
);
const depositLog = logResponse(
	[
		"0x71115c2702b517a6c3ef7d24ea97fb243f8e98893152108e3d8f4b3e07e5ee39",
		"0x00000000000000000000ab37b3070569ed78be15e3e7862ed457c84793d548cb",
	],
	"0x2",
);

const wxcb = new Interface([
	"event Transfer(address indexed from, address indexed to, uint256 value)",
	"event Deposit(address indexed dst, uint256 wad)",
	"function getPair(address,address) view returns (address)",
]);

describe("Devin transaction responses", () => {
	it("keeps the energy price and the snake_case network_id", () => {
		const tx = formatTransactionResponse(structuredClone(swapResponse));
		assert.equal(tx.energyPrice, 10_000_000_000n);
		assert.equal(tx.networkId, 3n);
		assert.equal(tx.energyLimit, 231467n);
		assert.equal(tx.from, SENDER);
		assert.equal(tx.to, ROUTER);
	});

	it("exposes them on TransactionResponse", () => {
		const tx = new TransactionResponse(
			formatTransactionResponse(structuredClone(swapResponse)),
			null as unknown as Provider,
		);
		assert.equal(tx.energyPrice, 10_000_000_000n);
		assert.equal(tx.networkId, 3n);
	});

	it("re-serializes to the hash the network assigned", () => {
		const response = new TransactionResponse(
			formatTransactionResponse(structuredClone(swapResponse)),
			null as unknown as Provider,
		);
		const tx = Transaction.from(response);
		assert.equal(tx.hash, SWAP_HASH);
		assert.equal(tx.from, SENDER);
		assert.equal(Transaction.from(tx.serialized).hash, SWAP_HASH);
	});

	it("still accepts camelCase networkId", () => {
		const { network_id, ...rest } = swapResponse;
		const tx = formatTransactionResponse({ ...rest, networkId: network_id });
		assert.equal(tx.networkId, 3n);
	});
});

describe("Devin logs with the raw zero address", () => {
	it("decodes a mint Transfer whose sender is address(0)", () => {
		const parsed = wxcb.parseLog(formatLog(mintLog));
		assert.ok(parsed);
		assert.equal(parsed.name, "Transfer");
		assert.equal(parsed.args.from, ZERO);
		assert.equal(parsed.args.to, ROUTER);
		assert.equal(parsed.args.value, 10n ** 18n);
	});

	it("decodes the matching Deposit", () => {
		const log = formatLog(depositLog);
		assert.equal(log.address, WXCB);
		const parsed = wxcb.parseLog(log);
		assert.equal(parsed?.name, "Deposit");
		assert.equal(parsed?.args.dst, ROUTER);
	});

	it("decodes an address(0) return value, as a factory gives for a missing pair", () => {
		const [pair] = wxcb.decodeFunctionResult("getPair", "0x" + "00".repeat(32));
		assert.equal(pair, ZERO);
		assert.equal(isAddress(pair), true);
		assert.equal(getAddress(pair), ZERO);
	});
});
