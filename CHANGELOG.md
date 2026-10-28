# Changelog

## 1.1.2-rc.2

- Replace bcrypto with `@noble/curves` for Ed448 signing, verification, key derivation and X448 shared secrets. Keys, signatures, addresses and shared secrets are byte-identical, checked against bcrypto's native and JavaScript builds; the minified browser bundle shrinks from 768 kB to 570 kB, and installs no longer build bcrypto's native addon.
- HD derivation uses Node's PBKDF2-HMAC-SHA3-512 in Node and noble's in browsers.
- Behavior change: Ed448 operations in Node now run in JavaScript, 10 to 20 times slower than bcrypto's native addon (signing about 0.7 ms, verification and key agreement about 2 ms each). Browser builds are about as fast as before or faster. `SigningKey` now computes its public key once and reuses it, so signing no longer derives it a second time.
- Behavior change: in browser builds, a shared secret with a small-order public key now fails with `Invalid public key.`, as Node builds already did, instead of `Invalid point.`.
- Behavior change: `Ed448Goldilock._channel` now has only the Ed448 methods corebc uses (key creation and conversion, point checks and addition, signing, verification and derivation) rather than bcrypto's whole Ed448 object.
- Replace bn.js with native `bigint` in `BigNumber`, `_base36To16` and `_base16To36`. Results and errors are unchanged, checked against bn.js for every method; together with the bcrypto change, the minified browser bundle is now 516 kB.
- Behavior change: `BigNumber`'s `toTwos`, `fromTwos`, `mask`, `shl` and `shr` now throw `Assertion failed` for a bit count that isn't a finite, non-negative integer (such as 1.5 or `Infinity`), where bn.js returned truncated or wrong values. A bit count too large for a `bigint` in `shl`, or in `toTwos` of a negative number, now fails with a `RangeError` instead of hanging or running out of memory.

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
