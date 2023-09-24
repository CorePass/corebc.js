import { getDefaultProvider, Wallet, Transaction, SigningKey, BaseWallet, verifyMessage, } from "../corebc.js";
import assert from "assert";
import { networkIdToPrefix } from "../address/index.js";
const TIMEOUT_PERIOD = 120000;
const tesSignedTransaction = "0xf8ce800a830f423f0496ce276773ac97d16855a3c8faa45399136b56d419486081c880b8ab54bc60412c90c104a89865a43c33f335836bcb473f0cd477ecb2c82e6310676c87b708e3971d009b4a04e518f12454c3ee1aebc19a6b7df00076b834b692b7432611f3dafff0f422dfbae722ba4b989cfc82fee2e539fbbf21d652ea587df59e8421a3a8bc8ca2ba35033598954c54e10c00315484db568379ce94f9c894e3e6e4c7ee216676b713ca892d9b26746ae902a772e217a6a8bb493ce2bb313cf0cb66e76765d4c45ec6b68600";
const testWalletPhrase = "better artwork flavor fish solve deer orient spread adapt doll attack hour sort copper super income bacon engine skate ill similar wink crack club";
const testSeed = "c1df56a610fd92afedb1ec838f3a4ab60668e157f3ea802cd587f18e215d25106fcdb47a2bdd9d989365371e602edf31896712c4af6dcbb443a1528b723502a0";
const tesPrivateKey = "69bb68c3a00a0cd9cbf2cab316476228c758329bbfe0b1759e8634694a9497afea05bcbf24e2aa0627eac4240484bb71de646a9296872a3c0e";
const testAddress = "0xab45fc2f96ea4708a9fbaafa39038bde9995c31cf8a3";
const testPublicKey = "0x65e9bdb24e972e64aa323a237f936435115da03cfbe3d3dd1a2d3cd2b6f072c1a770faf96d4075ca6d1776910f38ef48f902c807af2accc700";
const provider = getDefaultProvider("https://xcbapi.corecoin.cc/");
const wallet = Wallet.fromSeed({
    prefix: networkIdToPrefix(3),
    seed: testSeed,
    provider,
});
const mnemonicWallet = Wallet.fromPhrase({
    phrase: testWalletPhrase,
    password: "111111",
    prefix: networkIdToPrefix(3),
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
const transaction = Transaction.from({
    to: "0xce276773ac97d16855a3c8faa45399136b56d4194860",
    value: 200n,
    nonce: 0,
    energyLimit: 999999n,
    energyPrice: 10n,
    networkId: 4,
});
describe("Test getting data from blockchain and calling smart contract", function () {
    it("can currectly sign a transaction", async function () {
        this.timeout(TIMEOUT_PERIOD);
        const tx = await baseWallet.signTransaction(transaction);
        assert.equal(tx, tesSignedTransaction, "sign transaction failed");
    });
    it("can currectly get signer from signed transaction", async function () {
        this.timeout(TIMEOUT_PERIOD);
        const message = "my message";
        const signedMessage = await baseWallet.signMessage(message);
        const address = verifyMessage(message, signedMessage, networkIdToPrefix(3));
        assert.equal(address, baseWalletAddress, "get address from signed message failed");
    });
    it("can get feeData ", async function () {
        this.timeout(TIMEOUT_PERIOD);
        const feeData = await provider.getFeeData();
        assert.equal(feeData.energyPrice, 1000000000n, "mismatch in expected energy price");
    });
    it("can generate wallet", function () {
        assert.equal(mnemonicWallet.address.length, 46, "mismatch in address length");
        assert.equal(mnemonicWallet.publicKey, testPublicKey, "mismatch in public key");
        assert.equal(mnemonicWallet.address, testAddress, "mismatch in seed length");
        assert.equal(seedWallet.address.length, 46, "mismatch in address length for seed wallet");
        assert.equal(seedWallet.publicKey, testPublicKey, "mismatch in public key for seed wallet");
        assert.equal(seedWallet.address, testAddress, "mismatch in seed length for seed wallet");
        assert.equal(wallet.address.length, 46, "mismatch in address length for wallet");
        assert.equal(wallet.publicKey, testPublicKey, "mismatch in public key for wallet");
        assert.equal(wallet.address, testAddress, "mismatch in seed length for wallet");
    });
});
//# sourceMappingURL=test-contract.js.map