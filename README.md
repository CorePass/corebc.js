# CoreBC

A complete, compact, and simple library for CoreBC, written in [TypeScript](https://www.typescriptlang.org).

## Features

- Keep your private keys in your client
- Import and export **JSON wallets** (Gocore, XCB HODLER, CorePass)
- Import and export BIP 39 **mnemonic phrases** (12-word backup phrases) and **HD Wallets** (in languages including English, Czech, French, Italian, Japanese, Korean, Simplified Chinese, Spanish, and Traditional Chinese)
- Use meta-classes to generate JavaScript objects from any contract ABI, including **ABIv2** and **Human-Readable ABI**
- **Tiny** (~120kb compressed; 400kb uncompressed)
- **Tree-shaking** focused; include only what you need during bundling
- **Complete** functionality to fulfill all your CoreBC needs
- Entirely written in **TypeScript** with strict types for enhanced security
- **CORE License** (MIT for ALL dependencies); fully open source

## Installation

### NodeJS

```bash
npm i corebc
```

### Browser (ESM)

The bundled library is available in the `./dist/` folder in this repo.

```html
<script type="module">
    import { corebc } from "./dist/corebc.min.js";
</script>
```

## Providers

CoreBC collaborates with an ever-growing list of third-party providers, making it quick and easy to get started. CoreBC provides default keys for each service.

These built-in keys allow you to use `corebc.getDefaultProvider()` and begin developing immediately.

However, note that the API keys provided by CoreBC are shared and intentionally throttled. This approach encourages developers to acquire their own keys, which come with additional benefits like faster responses, increased capacity, analytics, and access to features like archival data.

## Extension Packages

The `corebc` package includes the core functionality required to interact with CoreBC. There are several other packages designed to augment its functionality and improve the user experience.

- Hardware Wallets (@TODO)

## License

CORE License (MIT for ALL dependencies).
