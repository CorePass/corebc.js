# Changelog

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
