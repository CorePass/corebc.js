/**
 *  Opt-in checks against the Devin test network and the Swaptopia contracts
 *  deployed there. Skipped unless CORE_LIVE_DEVIN=1.
 *
 *  Read-only by default. Set CORE_TEST_MNEMONIC (and CORE_TEST_PIN, the
 *  mnemonic password) to also send a few tiny transactions from that wallet;
 *  never commit the mnemonic. CORE_DEVIN_RPC overrides the endpoint.
 */
import assert from "node:assert/strict";

import {
	Contract,
	Interface,
	JsonRpcProvider,
	Transaction,
	Wallet,
	parseUnits,
} from "../index.js";
import type { HDNodeWallet } from "../index.js";

const LIVE = process.env.CORE_LIVE_DEVIN === "1";
const RPC = process.env.CORE_DEVIN_RPC || "https://xcbapi.corecoin.cc";
const MNEMONIC = process.env.CORE_TEST_MNEMONIC;
const PIN = process.env.CORE_TEST_PIN;

const SWAP_HASH =
	"0x5890e0733606c4ff3e36ff3212d60259e9a5dcb03a6d560c25c3b75991cb8977";
const SWAP_BLOCK = 13547341;
const SWAP_SENDER = "0xab468123323b87cfbcf4a8cd05acbc2fd2b49f961951";
const ZERO = "0x" + "0".repeat(44);

const C = {
	v3Factory: "0xab570b7c4bc9ce5aae2d10e8b9dd02c0edfd00d95d3a",
	swapRouter: "0xab37b3070569ed78be15e3e7862ed457c84793d548cb",
	quoter: "0xab50d72e6941b25be0ac42b720cf3f2121489dd5474f",
	quoterV2: "0xab32b6b5266e6878bc00d9fe5e4850ab3f4da409fd71",
	multicall: "0xab6529cefda4ad8c081d15eef7848a12efc882861db8",
	wxcb: "0xab39efc377b7abf8e876bd6ba04665d5c742ea597b28",
	ctn: "0xab7935cdef94ac9e6bcbcf779277aad7025993bc1964",
	cusd: "0xab80c526831282d2eaf503b90f2a87f3d57b2513070d",
};

const erc20Abi = [
	"function symbol() view returns (string)",
	"function decimals() view returns (uint8)",
	"function balanceOf(address) view returns (uint256)",
	"function transfer(address,uint256) returns (bool)",
	"event Transfer(address indexed from, address indexed to, uint256 value)",
];
const wxcbAbi = [
	...erc20Abi,
	"function deposit() payable",
	"function withdraw(uint256)",
	"event Deposit(address indexed dst, uint256 wad)",
	"event Withdrawal(address indexed src, uint256 wad)",
];

(LIVE ? describe : describe.skip)("live: Devin reads", function () {
	this.timeout(120000);
	let provider: JsonRpcProvider;

	before(() => {
		provider = new JsonRpcProvider(RPC, "devin");
	});
	after(() => provider.destroy());

	it("detects the Devin network", async () => {
		const network = await provider.getNetwork();
		assert.equal(network.networkId, 3n);
		assert.equal(network.name, "devin");
	});

	it("re-hashes a fetched transaction and decodes its logs", async () => {
		const tx = await provider.getTransaction(SWAP_HASH);
		assert.ok(tx);
		assert.equal(tx.from, SWAP_SENDER);
		assert.equal(tx.networkId, 3n);
		assert.ok(tx.energyPrice > 0n);
		assert.equal(Transaction.from(tx).hash, SWAP_HASH);

		const block = await provider.getBlock(SWAP_BLOCK, true);
		assert.equal(block?.prefetchedTransactions[0].hash, SWAP_HASH);
		assert.equal(block?.prefetchedTransactions[0].networkId, 3n);

		const receipt = await provider.getTransactionReceipt(SWAP_HASH);
		assert.equal(receipt?.status, 1);
		const iface = new Interface(erc20Abi);
		const transfers = receipt!.logs
			.map((log) => iface.parseLog(log))
			.filter((log) => log?.name === "Transfer");
		assert.ok(transfers.some((log) => log!.args.from === ZERO));
		assert.ok(transfers.some((log) => log!.args.to === SWAP_SENDER));
	});

	it("queries a token's Transfer events", async () => {
		const cusd = new Contract(C.cusd, erc20Abi, provider);
		const events = await cusd.queryFilter(
			cusd.filters.Transfer(null, SWAP_SENDER),
			SWAP_BLOCK,
			SWAP_BLOCK,
		);
		assert.equal(events.length, 1);
		assert.equal(events[0].transactionHash, SWAP_HASH);
	});

	it("reads token metadata", async () => {
		const ctn = new Contract(C.ctn, erc20Abi, provider);
		assert.equal(await ctn.symbol(), "CTN");
		assert.equal(await ctn.decimals(), 18n);
		assert.equal(typeof (await ctn.balanceOf(SWAP_SENDER)), "bigint");
	});

	it("returns address(0) for a missing pool", async () => {
		const factory = new Contract(
			C.v3Factory,
			["function getPool(address,address,uint24) view returns (address)"],
			provider,
		);
		assert.equal(await factory.getPool(C.wxcb, C.wxcb, 500), ZERO);
		assert.notEqual(await factory.getPool(C.wxcb, C.cusd, 500), ZERO);
	});

	it("quotes a swap through both quoters", async () => {
		const amountIn = parseUnits("0.01", 18);
		const quoter = new Contract(
			C.quoter,
			[
				"function quoteExactInputSingle(address,address,uint24,uint256,uint160) returns (uint256)",
			],
			provider,
		);
		const quoterV2 = new Contract(
			C.quoterV2,
			[
				"function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
			],
			provider,
		);
		const v1 = await quoter.quoteExactInputSingle.staticCall(
			C.wxcb,
			C.cusd,
			500,
			amountIn,
			0,
		);
		const v2 = await quoterV2.quoteExactInputSingle.staticCall({
			tokenIn: C.wxcb,
			tokenOut: C.cusd,
			amountIn,
			fee: 500,
			sqrtPriceLimitX96: 0,
		});
		assert.ok(v1 > 0n);
		assert.equal(v2.amountOut, v1);
	});

	it("batches calls through the interface multicall", async () => {
		const multicall = new Contract(
			C.multicall,
			[
				"function multicall((address target,uint256 gasLimit,bytes callData)[] calls) returns (uint256 blockNumber,(bool success,uint256 gasUsed,bytes returnData)[] returnData)",
			],
			provider,
		);
		const iface = new Interface(erc20Abi);
		const callData = iface.encodeFunctionData("balanceOf", [SWAP_SENDER]);
		const [, results] = await multicall.multicall.staticCall(
			[C.ctn, C.cusd].map((target) => ({
				target,
				gasLimit: 200000,
				callData,
			})),
		);
		assert.equal(results.length, 2);
		assert.ok(results.every((result: any) => result.success));
	});

	it("rejects a provider pinned to the wrong network", async () => {
		const wrong = new JsonRpcProvider(RPC, "mainnet");
		try {
			// The first call may resolve with the pinned network before the
			// node has been asked, so allow either call to be the one to throw.
			await assert.rejects(async () => {
				await wrong.getNetwork();
				await wrong.getNetwork();
			}, /network changed/);
		} finally {
			wrong.destroy();
		}
	});
});

(LIVE && MNEMONIC ? describe : describe.skip)(
	"live: Devin writes",
	function () {
		this.timeout(300000);
		let provider: JsonRpcProvider;
		let wallet: HDNodeWallet;

		before(() => {
			provider = new JsonRpcProvider(RPC, "devin");
			wallet = Wallet.fromPhrase({
				phrase: MNEMONIC!,
				prefix: "ab",
				password: PIN,
				provider,
			});
		});
		after(() => provider.destroy());

		it("sends coin to its own HD child", async () => {
			const child = wallet.deriveChild(1);
			const tx = await wallet.sendTransaction({
				to: child.address,
				value: parseUnits("0.0001", 18),
			});
			assert.equal(tx.networkId, 3n);
			const receipt = await tx.wait();
			assert.equal(receipt?.status, 1);
			const fetched = await provider.getTransaction(tx.hash);
			assert.equal(Transaction.from(fetched!).hash, tx.hash);
		});

		it("wraps and unwraps WXCB", async () => {
			const wxcb = new Contract(C.wxcb, wxcbAbi, wallet);
			const amount = parseUnits("0.0001", 18);
			const deposit = await (await wxcb.deposit({ value: amount })).wait();
			const deposited = deposit.logs
				.map((log: any) => wxcb.interface.parseLog(log))
				.find((log: any) => log?.name === "Deposit");
			assert.equal(deposited.args.dst, wallet.address);
			assert.equal(deposited.args.wad, amount);
			const withdraw = await (await wxcb.withdraw(amount)).wait();
			assert.equal(withdraw.status, 1);
		});
	},
);
