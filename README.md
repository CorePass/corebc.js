The CoreBC Project
==================

A complete, compact and simple library for CoreBC and ilk, written
in [TypeScript](https://www.typescriptlang.org).

**Features**

- Keep your private keys in your client, **safe** and sound
- Import and export **JSON wallets** (Geth, Parity and crowdsale)
- Import and export BIP 39 **mnemonic phrases** (12 word backup phrases) and **HD Wallets** (English as well as Czech, French, Italian, Japanese, Korean, Simplified Chinese, Spanish, Traditional Chinese)
- Meta-classes create JavaScript objects from any contract ABI, including **ABIv2** and **Human-Readable ABI**
- **Tiny** (~120kb compressed; 400kb uncompressed)
- **Tree-shaking** focused; include only what you need during bundling
- **Complete** functionality for all your CoreBC desires
- Fully written in **TypeScript**, with strict types for security
- **MIT License** (including ALL dependencies); completely open source to do with as you please
Installing
----------

**NodeJS**

```
/home/ricmoo/some_project> npm install corebc
```

**Browser (ESM)**

The bundled library is available in the `./dist/` folder in this repo.

```
<script type="module">
    import { corebc } from "./dist/corebc.min.js";
</script>
```


Providers
---------

corebc works closely with an ever-growing list of third-party providers
to ensure getting started is quick and easy, by providing default keys
to each service.

These built-in keys mean you can use `corebc.getDefaultProvider()` and
start developing right away.

However, the API keys provided to corebc are also shared and are
intentionally throttled to encourage developers to eventually get
their own keys, which unlock many other features, such as faster
responses, more capacity, analytics and other features like archival
data.

Extension Packages
------------------

The `corebc` package only includes the most common and most core
functionality to interact with CoreBC. There are many other
packages designed to further enhance the functionality and experience.

- Hardware Wallets (@TODO)


License
-------

MIT License (including **all** dependencies).

