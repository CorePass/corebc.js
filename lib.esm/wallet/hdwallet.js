/**
 *  Explain HD Wallets..
 *
 *  @_subsection: api/wallet:HD Wallets  [hd-wallets]
 */
import { randomBytes, ripemd160, SigningKey, sha256 } from "../crypto/index.js";
import { dataSlice, defineProperties, getNumber, assertPrivate, assertArgument, } from "../utils/index.js";
import { LangEn } from "../wordlists/lang-en.js";
import { BaseWallet } from "./base-wallet.js";
import { Mnemonic } from "./mnemonic.js";
import { encryptKeystoreJson, encryptKeystoreJsonSync, } from "./json-keystore.js";
import { Ed448Goldilock } from "../crypto/crypto.js";
import { mnemonicToSeed } from "./mnemonicToSeed.js";
// import { arrayify,
//     //  hexDataSlice
//      } from "../utils/data.js";
// function sha512Hash(password: BytesLike, salt: BytesLike): Uint8Array {
//     const p = getBytes(password);
//     const s = getBytes(salt);
//     return getBytes(pbkdf2(p, s, 2048, 57, "sha512"));
// }
/**
 *  The default derivation path for Core HD Nodes. (i.e. ``"m/44'/60'/0'/0/0"``)
 */
export const defaultPath = "m";
// "Bitcoin seed"
// const MasterSecret = new Uint8Array([66, 105, 116, 99, 111, 105, 110, 32, 115, 101, 101, 100]);
const HardenedBit = 0x80000000;
// function addScalar(a: Uint8Array, b: Uint8Array): Uint8Array {
//     b = getBytes(concat([b.slice(0, 53), "0x00000000"]));
//     b[0] &= 0xfc;
//     const c = new Uint8Array(57);
//     let hold = 0;
//     for (let i = 0; i < 57; i++) {
//         hold += a[i] + b[i];
//         c[i] = hold % 256;
//         hold = Math.floor(hold / 256);
//     }
//     return c;
// };
const _guard = {};
function derivePath(node, path) {
    const components = path.split("/");
    assertArgument(components.length > 0 && (components[0] === "m" || node.depth > 0), "invalid path", "path", path);
    if (components[0] === "m") {
        components.shift();
    }
    let result = node;
    for (let i = 0; i < components.length; i++) {
        const component = components[i];
        if (component.match(/^[0-9]+'$/)) {
            const index = parseInt(component.substring(0, component.length - 1));
            assertArgument(index < HardenedBit, "invalid path index", `path[${i}]`, component);
            result = result.deriveChild(HardenedBit + index);
        }
        else if (component.match(/^[0-9]+$/)) {
            const index = parseInt(component);
            assertArgument(index < HardenedBit, "invalid path index", `path[${i}]`, component);
            result = result.deriveChild(index);
        }
        else {
            assertArgument(false, "invalid path component", `path[${i}]`, component);
        }
    }
    return result;
}
/**
 *  An **HDNodeWallet** is a [[Signer]] backed by the private key derived
 *  from an HD Node using the [[link-bip-32]] stantard.
 *
 *  An HD Node forms a hierarchal structure with each HD Node having a
 *  private key and the ability to derive child HD Nodes, defined by
 *  a path indicating the index of each child.
 */
export class HDNodeWallet extends BaseWallet {
    /**
     *  The compressed public key.
     */
    publicKey;
    prefix;
    /**
     *  The fingerprint.
     *
     *  A fingerprint allows quick qay to detect parent and child nodes,
     *  but developers should be prepared to deal with collisions as it
     *  is only 4 bytes.
     */
    fingerprint;
    /**
     *  The parent fingerprint.
     */
    parentFingerprint;
    /**
     *  The mnemonic used to create this HD Node, if available.
     *
     *  Sources such as extended keys do not encode the mnemonic, in
     *  which case this will be ``null``.
     */
    mnemonic;
    #seed;
    /**
     *  The derivation path of this wallet.
     *
     *  Since extended keys do not provider full path details, this
     *  may be ``null``, if instantiated from a source that does not
     *  enocde it.
     */
    path;
    /**
     *  The child index of this wallet. Values over ``2 *\* 31`` indicate
     *  the node is hardened.
     */
    index;
    /**
     *  The depth of this wallet, which is the number of components
     *  in its path.
     */
    depth;
    /**
     *  @private
     */
    constructor({ guard, seed, signingKey, parentFingerprint, path, index, depth, mnemonic, provider, prefix, }) {
        super({
            signingKey,
            prefix,
            provider,
        });
        assertPrivate(guard, _guard, "HDNodeWallet");
        defineProperties(this, { publicKey: signingKey.publicKey });
        this.prefix = prefix;
        this.#seed = seed;
        const fingerprint = dataSlice(ripemd160(sha256(this.publicKey)), 0, 4);
        defineProperties(this, {
            parentFingerprint,
            fingerprint,
            path,
            index,
            depth,
        });
        defineProperties(this, { mnemonic });
    }
    connect(provider) {
        return new HDNodeWallet({
            guard: _guard,
            signingKey: this.signingKey,
            parentFingerprint: this.parentFingerprint,
            path: this.path,
            index: this.index,
            depth: this.depth,
            seed: this.#seed,
            mnemonic: this.mnemonic,
            provider,
            prefix: this.prefix,
        });
    }
    #account() {
        const account = {
            address: this.address,
            privateKey: this.privateKey,
        };
        const m = this.mnemonic;
        if (this.path && m && m.wordlist.locale === "en" && m.password === "") {
            account.mnemonic = {
                path: this.path,
                locale: "en",
                entropy: m.entropy,
            };
        }
        return account;
    }
    /**
     *  Resolves to a [JSON Keystore Wallet](json-wallets) encrypted with
     *  %%password%%.
     *
     *  If %%progressCallback%% is specified, it will receive periodic
     *  updates as the encryption process progreses.
     */
    async encrypt(password, progressCallback) {
        return await encryptKeystoreJson(this.#account(), password, {
            progressCallback,
        });
    }
    /**
     *  Returns a [JSON Keystore Wallet](json-wallets) encryped with
     *  %%password%%.
     *
     *  It is preferred to use the [async version](encrypt) instead,
     *  which allows a [[ProgressCallback]] to keep the user informed.
     *
     *  This method will block the event loop (freezing all UI) until
     *  it is complete, which may be a non-trivial duration.
     */
    encryptSync(password) {
        return encryptKeystoreJsonSync(this.#account(), password);
    }
    /**
     *  Returns true if this wallet has a path, providing a Type Guard
     *  that the path is non-null.
     */
    hasPath() {
        return this.path != null;
    }
    /**
     *  Return the child for %%index%%.
     */
    deriveChild(_index) {
        const newPrivateKey = Ed448Goldilock.HDWalletGenerateKeyFromSeed(this.#seed, Number(_index));
        const newSigningKey = new SigningKey(newPrivateKey);
        // Base path
        let path = this.path;
        if (path) {
            path += "/" + (_index & ~HardenedBit);
            if (_index & HardenedBit) {
                path += "'";
            }
        }
        return new HDNodeWallet({
            guard: _guard,
            signingKey: newSigningKey,
            parentFingerprint: this.fingerprint,
            path,
            index: _index,
            seed: this.#seed,
            depth: this.depth + 1,
            mnemonic: this.mnemonic,
            provider: this.provider,
            prefix: this.prefix,
        });
    }
    /**
     *  Return the HDNode for %%path%% from this node.
     */
    derivePath(path) {
        return derivePath(this, path);
    }
    static #fromSeed({ _seed, mnemonic, prefix, path, }) {
        const extendetPrivateKey = Ed448Goldilock.HDWalletGenerateKeyFromSeed(_seed, 0);
        const signingKey = new SigningKey(extendetPrivateKey);
        // console.log({ privateKey, thisKey: signingKey.privateKey,len:tmp.privateKey.length })
        return new HDNodeWallet({
            seed: _seed,
            guard: _guard,
            signingKey,
            parentFingerprint: "0x00000000",
            path: path || defaultPath,
            index: 0,
            depth: 0,
            mnemonic,
            provider: null,
            prefix,
        });
    }
    /**
     *  Creates a new random HDNode.
     */
    static createRandom(prefix, password, path, wordlist) {
        if (password == null) {
            password = "";
        }
        if (path == null) {
            path = defaultPath;
        }
        if (wordlist == null) {
            wordlist = LangEn.wordlist();
        }
        const mnemonic = Mnemonic.fromEntropy(randomBytes(32), password, wordlist);
        return HDNodeWallet.#fromSeed({
            _seed: mnemonic.computeSeed(),
            mnemonic,
            prefix,
        }).derivePath(path);
    }
    /**
     *  Create am HD Node from %%mnemonic%%.
     */
    static fromMnemonic(mnemonic, prefix, path) {
        if (!path) {
            path = defaultPath;
        }
        return HDNodeWallet.#fromSeed({
            _seed: mnemonic.computeSeed(),
            mnemonic,
            prefix,
        }).derivePath(path);
    }
    static mnemonicToSeed(mnemonic, password) {
        const seed = mnemonicToSeed(mnemonic, password);
        return seed;
    }
    /**
     *  Creates an HD Node from a mnemonic %%phrase%%.
     */
    static fromPhrase({ phrase, prefix, password, path, wordlist, }) {
        if (!password) {
            password = "";
        }
        if (!path) {
            path = defaultPath;
        }
        if (!wordlist) {
            wordlist = LangEn.wordlist();
        }
        const mnemonic = Mnemonic.fromPhrase({ phrase, password, wordlist });
        const _seed = mnemonic.computeSeed();
        return HDNodeWallet.#fromSeed({
            _seed,
            mnemonic,
            prefix,
        }).derivePath(path);
    }
    /**
     *  Creates an HD Node from a %%seed%%.
     */
    static fromSeed({ seed, prefix, path, }) {
        return HDNodeWallet.#fromSeed({
            _seed: seed,
            mnemonic: null,
            path: path || defaultPath,
            prefix,
        });
    }
}
/*
export class HDNodeWalletManager {
    #root: HDNodeWallet;

    constructor(phrase: string, password?: null | string, path?: null | string, locale?: null | Wordlist) {
        if (password == null) { password = ""; }
        if (path == null) { path = "m/44'/60'/0'/0"; }
        if (locale == null) { locale = LangEn.wordlist(); }
        this.#root = HDNodeWallet.fromPhrase(phrase, password, path, locale);
    }

    getSigner(index?: number): HDNodeWallet {
        return this.#root.deriveChild((index == null) ? 0: index);
    }
}
*/
/**
 *  Returns the [[link-bip-32]] path for the acount at %%index%%.
 *
 *  This is the pattern used by wallets like Ledger.
 *
 *  There is also an [alternate pattern](getIndexedAccountPath) used by
 *  some software.
 */
export function getAccountPath(_index) {
    const index = getNumber(_index, "index");
    assertArgument(index >= 0 && index < HardenedBit, "invalid account index", "index", index);
    return `m/44'/60'/${index}'/0/0`;
}
/**
 *  Returns the path using an alternative pattern for deriving accounts,
 *  at %%index%%.
 *
 *  This derivation path uses the //index// component rather than the
 *  //account// component to derive sequential accounts.
 *
 *  This is the pattern used by wallets like MetaMask.
 */
export function getIndexedAccountPath(_index) {
    const index = getNumber(_index, "index");
    assertArgument(index >= 0 && index < HardenedBit, "invalid account index", "index", index);
    return `m/44'/60'/0'/0/${index}`;
}
//# sourceMappingURL=hdwallet.js.map