# Changelog

## 1.2.0

- Keep `energyPrice` and the node's `network_id` on transactions from `getTransaction` and prefetched blocks, so fetched transactions re-serialize to their on-chain hash.
- Accept the raw all-zero address and the precompile addresses in `getAddress`, so `address(0)` results such as a factory's missing pool, and mint or burn `Transfer` logs, decode instead of failing the checksum.
- Fix HD derivation paths: paths are parsed rather than walked, `defaultPath` and the account path helpers use Core's `m/44'/654'/0'/0/<index>`, `HDNodeWallet.fromSeed` honours its path, and keystores with older path labels still restore the right account.
- Fix `getCreateAddress`, which returned the deployer's address, `signTypedData` for typed data containing addresses, and `parseUnits` silently truncating malformed amounts.
- Register Core's networks (mainnet `1`/`cb`, devin `3`/`ab`, private `0`/`ce`) and add `prefixToNetworkId`, `isNetworkPrefix`, `networkPrefixes`, `getZeroAddress`, `ZeroAddressDevin` and `ZeroAddressPrivate`.
- Sync upstream typing, robustness and ABI decoding fixes, including bounded decoding of compressed ABI data.
- Behavior changes: unsupported derivation paths and unknown address prefixes now throw instead of returning an unrelated key or address, `getAddress` returns lower-case, `getAddress` accepts ICAP input, and the Ethereum networks are no longer registered.
- Add regression tests from recorded Devin responses, and opt-in live Devin tests against the Swaptopia contracts.

## 1.1.1

- Fix IPFS subdomain gateway resolution and percent-encoded URI paths, with traversal validation.
- Bound combined scrypt wallet work and temporary memory, and enforce the 256 MiB backend memory limit.
- Return go-core-compatible 56-byte X448 shared secrets from `SigningKey.computeSharedSecret`, replacing the previous 57-byte Edwards encoding.
- Import go-core PBKDF2-SHA3-256 keystores while preserving MAC-validated access to historical CoreBC SHA2 keystores.
- Add independent shared-secret and keystore compatibility vectors for Node and browser builds.

## 1.1.0

- Add the German community mnemonic wordlist from dys2p/wordlists-de as `wordlists.de` and `LangDe` in the extra browser bundle.
- Add the Slovak mnemonic wordlist as `wordlists.sk` and `LangSk` in the extra browser wordlist bundle, preserving upstream word order.

## 1.0.0

- Support the updated Noble hashes, TypeScript 7, Node types, and Rollup dependencies.
- Require Node.js 22.12 or newer; regenerate CommonJS through Rollup for ESM dependencies.
- Correct byte-array signing-key input and use Ed448 for shared secrets and point addition.
- Fix AES 3 keystore integration and browser crypto parity; bound wallet KDF resources and compare all MAC bytes.
- Synchronize the exported runtime version with the npm package version.
- Add typed CIP-150, CIP-151, and CIP-152 helpers, bounded IPFS JSON loading, and exact Core custom-unit balances.
- Add regression tests, package and browser smoke checks, npm dependency checks, issue forms, and validated npm trusted-publishing workflows.
- Update package documentation and contributor instructions.
- Remove committed build artifacts and lockfiles; generate npm distributions from source and use `npm install` in CI and releases.
