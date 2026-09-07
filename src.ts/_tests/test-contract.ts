import {
	getDefaultProvider,
	Wallet,
	Transaction,
	SigningKey,
	BaseWallet,
	verifyMessage,
	isAddressable,
} from "../corebc.js";
import assert from "assert";
import { networkIdToPrefix } from "../address/index.js";

const TIMEOUT_PERIOD = 120000;
const tesSignedTransaction =
	"0xf8ce800a830f423f0496ce276773ac97d16855a3c8faa45399136b56d419486081c880b8ab54bc60412c90c104a89865a43c33f335836bcb473f0cd477ecb2c82e6310676c87b708e3971d009b4a04e518f12454c3ee1aebc19a6b7df00076b834b692b7432611f3dafff0f422dfbae722ba4b989cfc82fee2e539fbbf21d652ea587df59e8421a3a8bc8ca2ba35033598954c54e10c00315484db568379ce94f9c894e3e6e4c7ee216676b713ca892d9b26746ae902a772e217a6a8bb493ce2bb313cf0cb66e76765d4c45ec6b68600";
const testWalletPhrase =
	"better artwork flavor fish solve deer orient spread adapt doll attack hour sort copper super income bacon engine skate ill similar wink crack club";
const testSeed =
	"ec372b08ffc451a5dd991c68006aa01a033a6a391e0e72d5690c13cff719fdcb2502812dbf5f32a6df828cd22d77a36405bb15bb2637b7e77f99fa60f00d3560";
const tesPrivateKey =
	"69bb68c3a00a0cd9cbf2cab316476228c758329bbfe0b1759e8634694a9497afea05bcbf24e2aa0627eac4240484bb71de646a9296872a3c0e";
const testAddress = "0xab38254e30777140469a3aa168df81182d3d61f9843f";
const testPublicKey =
	"0x484ed765af56534f1c98c0f3ac9fb460fbf5c3cf582e54a6cdfc319986ce1bb875d3afcc9c336764348c96264dfeef9565364d7e8e14e9aa80";
const provider = getDefaultProvider(
	process.env.COREBC_RPC_URL || "https://xcbapi.corecoin.cc/",
);

const mnemonicWallet = Wallet.fromPhrase({
	phrase: testWalletPhrase,
	password: "111111",
	prefix: networkIdToPrefix(3),
});
const mnemonicWalletWithoutPassKey = Wallet.fromPhrase({
	phrase: testWalletPhrase,
	prefix: networkIdToPrefix(3),
});

const wallet = Wallet.fromSeed({
	prefix: networkIdToPrefix(3),
	seed: testSeed,
	provider,
});
const seedWallet = Wallet.fromSeed({
	prefix: networkIdToPrefix(3),
	seed: testSeed,
});

const signingKey = new SigningKey(tesPrivateKey);
const baseWalletAddress = "0xab03a5fd22b9bee8b8ab877c86e0a2c21765e1d5bfc5";
const baseWallet = new BaseWallet({
	signingKey,
	prefix: networkIdToPrefix(3),
	provider,
});
const randomWallet = Wallet.createRandom(networkIdToPrefix(3), provider);
const transaction = Transaction.from({
	to: "0xce276773ac97d16855a3c8faa45399136b56d4194860",
	value: 200n,
	nonce: 0,
	energyLimit: 999999n,
	energyPrice: 10n,
	networkId: 4,
});

describe("Test wallet creation", function () {
	after(() => provider.destroy());
	it("can generate a random wallet", function () {
		assert.equal(mnemonicWalletWithoutPassKey.publicKey.length, 116);
		assert.equal(
			randomWallet.mnemonic?.phrase.split(" ").length,
			24,
			"mismatch in phrase length",
		);

		assert.equal(
			isAddressable(randomWallet),
			true,
			"random wallet is not addressable",
		);
	});
});

describe("Test getting data from blockchain and calling smart contract", function () {
	it("can correctly sign a transaction", async function () {
		this.timeout(TIMEOUT_PERIOD);
		const tx = await baseWallet.signTransaction(transaction);
		assert.equal(tx, tesSignedTransaction, "sign transaction failed");
	});
	it("can correctly get signer from signed transaction", async function () {
		this.timeout(TIMEOUT_PERIOD);
		const message = "my message";
		const signedMessage = await baseWallet.signMessage(message);
		const address = verifyMessage(message, signedMessage, networkIdToPrefix(3));
		assert.equal(
			address,
			baseWalletAddress,
			"get address from signed message failed",
		);
	});
	(process.env.COREBC_RPC_URL ? it : it.skip)(
		"can get fee data",
		async function () {
			this.timeout(TIMEOUT_PERIOD);
			const feeData = await provider.getFeeData();
			assert.ok(feeData.energyPrice !== null && feeData.energyPrice >= 0n);
		},
	);
	it("can generate wallet", function () {
		assert.equal(
			mnemonicWallet.address.length,
			46,
			"mismatch in address length",
		);
		assert.equal(
			mnemonicWallet.publicKey,
			testPublicKey,
			"mismatch in public key",
		);
		assert.equal(
			mnemonicWallet.address,
			testAddress,
			"mismatch in generated address",
		);
		assert.equal(
			seedWallet.address.length,
			46,
			"mismatch in address length for seed wallet",
		);
		assert.equal(
			seedWallet.publicKey,
			testPublicKey,
			"mismatch in public key for seed wallet",
		);
		assert.equal(
			seedWallet.address,
			testAddress,
			"mismatch in seed length for seed wallet",
		);
		assert.equal(
			wallet.address.length,
			46,
			"mismatch in address length for wallet",
		);
		assert.equal(
			wallet.publicKey,
			testPublicKey,
			"mismatch in public key for wallet",
		);
		assert.equal(
			wallet.address,
			testAddress,
			"mismatch in seed length for wallet",
		);
	});
});
