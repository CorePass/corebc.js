# Contributing to corebc.js

Use Node.js 22.12 or newer (Node.js 24 is used for releases) and npm. Install dependencies with `npm install`. This library does not commit lockfiles; npm may create an ignored local lockfile. CI resolves dependencies from `package.json` on each fresh runner.

```sh
npm install
npm run check
```

Edit TypeScript in `src.ts/`. Use tabs for indentation; `npm run format` applies the repository's Prettier configuration. Add regression tests under `src.ts/_tests/test-*.ts` for behavior changes. Keep private keys and RPC credentials out of issues and logs; test vectors must use disposable keys.

`npm run check` builds ESM, CommonJS, browser bundles, and declarations, checks formatting, runs both Node module test suites, and installs a packed archive into a temporary project to check public exports and TypeScript consumers. It also exercises browser bundles without Node globals. Build outputs are ignored by Git and generated from source for validation and npm publication. Do not commit `dist/`, `lib.esm/`, `lib.commonjs/`, `types/`, or package-manager lockfiles. `npm run clean` removes generated outputs and `npm run build-all` restores them.

The live fee-data test is optional because it depends on an external node:

```sh
COREBC_RPC_URL=https://your-node.example npm test
```

Use a node with the Core `xcb_*` RPC API. Ordinary tests need no live blockchain. The package smoke check downloads production dependencies into a temporary directory and therefore needs registry access. Run `npm audit` to inspect dependency advisories.

For CIP changes, link the [proposal](https://cip.coreblockchain.net/), describe supported operations and interoperability vectors, and update the README. Current helpers follow the CIP-150/151/152 and custom-unit work introduced in core_web3dart commit `ec787c8`, with subsequent history reviewed through `e472746`. Custom units are a Core application convention and are not presented as a numbered CIP. Keep token amounts and Unix seconds as `bigint`; use an explicit block reference when related reads need a consistent snapshot.

Open a pull request explaining the problem, changed behavior, and validation. Bug and feature forms are available under GitHub Issues.

## Releases

1. Update `package.json` and `src.ts/_version.ts` to the intended version, install dependencies with `npm install`, and document changes in `CHANGELOG.md`.
2. Run `npm run check` and commit source, configuration, and documentation changes.
3. Create a GitHub release whose tag is the version, optionally prefixed with `v`.

The release workflow checks the tag against the package version, reruns validation and the dependency audit, and publishes the validated npm archive with provenance. Both workflows use `npm install` with package-manager caching disabled; npm creates an ephemeral runner lockfile for the dependency audit. GitHub prereleases use the `next` dist-tag; normal releases use `latest`.

Before the first automated release, a package owner must configure an npm trusted publisher for `CorePass/corebc.js`, workflow `publish-npm.yml`. This is an npm account setting, not a repository secret. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/). Publishing a GitHub release triggers publication; CI on pull requests does not publish.
