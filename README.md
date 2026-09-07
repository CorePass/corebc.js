# CoreBC

TypeScript and JavaScript tools for Core Blockchain: Ed448 wallets, signing,
Core addresses, `xcb_*` JSON-RPC providers, ABI encoding, smart contracts, and
token metadata.

## Install

Requires Node.js **22.12 or newer**, or a modern browser with BigInt and Web
Crypto support.

```sh
npm install corebc
```

```ts
import { JsonRpcProvider, formatXCB } from "corebc";

const provider = new JsonRpcProvider("https://your-core-node.example");
console.log(await provider.getBlockNumber());
// console.log(formatXCB(await provider.getBalance(coreAddress)));
provider.destroy();
```

Use your own Core RPC endpoint. CommonJS is supported with
`const { Wallet } = require("corebc")`. The package includes declarations and
subpath exports such as `corebc/abi`, `corebc/crypto`, `corebc/providers`,
`corebc/cip`, and `corebc/ipfs`.

## Wallets and contracts

```ts
import { Wallet, networkIdToPrefix } from "corebc";

const wallet = Wallet.createRandom(networkIdToPrefix(3));
console.log(wallet.address);
const signature = await wallet.signMessage("Hello Core");
```

Wallets support mnemonics, seed derivation, and encrypted JSON keystores. Wallet
KDF limits match Core Web3Dart: PBKDF2 permits up to 10 million iterations;
scrypt permits `N <= 1048576`, `r * p <= 1048576`, and at most 256 MiB of
estimated memory. Wallets exceeding these limits are rejected. Private keys stay
with the caller. Core uses 57-byte Ed448 private and public keys and
network-prefixed addresses; Ethereum secp256k1 keys are not interchangeable.
Keep private keys and recovery phrases out of logs and source control.

`SigningKey.computeSharedSecret` returns the 56-byte X448 shared secret used
by go-core, accepting the peer's 57-byte Ed448 public key. This changes the
57-byte Edwards-point result returned by version 1.1.0. Applications using
the previous result as key material must account for that change.

PBKDF2 keystore imports recognize go-core's SHA3-256 interpretation of
`hmac-sha256`, with MAC-checked fallback for historical CoreBC SHA2-256
keystores. SHA2-512 keystores remain supported. This does not change the
public `pbkdf2` API, mnemonic derivation, or scrypt keystore exports.

`Contract` accepts JSON or human-readable ABIs and a provider for reads or
signer for writes. Transaction fields use `energyLimit`, `energyPrice`, and
`networkId`.

For compatibility, the existing `sha256` and `sha512` exports compute **SHA3-256
and SHA3-512** respectively. `keccak256` is a separate algorithm. Do not
substitute hashes when porting signing code.

## CIP metadata

The typed helpers follow the same feature scope as Core Web3Dart:

- [CIP-150]: Read, enumerate, set, and seal on-chain metadata.
- [CIP-151]: Optional expiration and trading-stop timestamps; inclusive boundary
  checks.
- [CIP-152]: Resolve `lab` references ending in `lab.json` and validate
  measurement structure.

[CIP-150]: https://cip.coreblockchain.net/cip/cbc/cip-150/
[CIP-151]: https://cip.coreblockchain.net/cip/cbc/cip-151/
[CIP-152]: https://cip.coreblockchain.net/cip/cbc/cip-152/

```ts
import { Cip150MetadataContract, IpfsGateway } from "corebc";

// provider is a JsonRpcProvider; tokenAddress is a Core contract address.
const metadata = new Cip150MetadataContract(tokenAddress, provider);
const block = await provider.getBlockNumber();
const entries = await metadata.readAll(block);
const lifecycle = await metadata.readLifecycle(block);
const expired = lifecycle.isExpiredAt(BigInt(Math.floor(Date.now() / 1000)));
const lab = await metadata.readLabCertificate(new IpfsGateway(), block);
```

CIP-151 timestamps remain exact `bigint` Unix seconds. Missing lifecycle values
impose no limit. These helpers expose metadata; enforcement of transfers or
trading belongs to the contract or application. CIP-152 validation checks JSON
structure, not issuer authenticity or gateway content integrity.

## IPFS and custom units

`IpfsGateway` accepts `ipfs://CID/path`, `/ipfs/CID/path`, bare CID references,
and HTTP(S) URLs. Its default template is `https://ipf.sk/{cid}`; configure
another gateway with
`new IpfsGateway({ template: "https://gateway.example/ipfs/{cid}" })`. JSON
reads default to a 1 MiB limit and 30-second timeout. Treat metadata URLs as
untrusted input; server applications should supply a `fetch` implementation that
enforces their outbound network policy.

```ts
import { CustomUnitToken } from "corebc/cip";

const token = new CustomUnitToken(tokenAddress, provider);
const block = await provider.getBlockNumber();
const units = await token.discover(block);
if (units) {
	const balance = await token.balance(
		accountAddress,
		units.preferredUnit,
		block,
	);
	console.log(balance.canonicalAmount, balance.unitAmount, balance.unit);
}
```

Custom-unit discovery follows the Tone/Core API convention: `supportsUnit`,
`supportedUnits`, `preferredUnit`, and `balanceOfUnit`. Balances and multiplier
numerator/denominator stay as `bigint`; a zero canonical balance has no defined
multiplier. This convention is separate from the numbered CIPs above.

## Browser bundles

ESM and UMD bundles, including minified versions, are in `dist/` in the npm
package. Serve them from your application:

```html
<script type="module">
	import { Wallet, networkIdToPrefix } from "./dist/corebc.min.js";
	const wallet = Wallet.createRandom(networkIdToPrefix(3));
</script>
```

The UMD bundle `dist/corebc.umd.min.js` exposes `globalThis.corebc`. Secure
randomness requires a secure browser context.

## Development

```sh
npm install
npm run check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for builds, tests, CIP contributions, and
release setup. Report problems or request features through the
[issue forms](https://github.com/CorePass/corebc.js/issues/new/choose).

## License

[CORE License](LICENSE). Dependencies retain their respective licenses.
