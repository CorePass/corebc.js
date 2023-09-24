// @ts-ignore
import ed448 from "bcrypto/lib/ed448.js";
// @ts-ignore
import pbkdf2 from "bcrypto/lib/pbkdf2.js";
// @ts-ignore
import SHA3_512 from "bcrypto/lib/sha3-512.js";
export class Ed448Goldilock {
    static _channel = ed448;
    static generatePrivateKey() {
        var privateKey = ed448.privateKeyGenerate();
        privateKey[56] &= 0x7f;
        return privateKey;
    }
    static getPublicKeyFromPrivateKey(privateKey) {
        var secret = Buffer.from(privateKey, "hex");
        if (secret[56] > 127) {
            var scalar = secret.slice(0, 56);
            scalar[0] &= 0xfc;
            scalar[55] |= 0x80;
            var publicKey = this._channel.publicKeyFromScalar(scalar);
            return Buffer.from(publicKey).toString("hex");
        }
        else {
            var publicKey = this._channel.publicKeyCreate(secret);
            return Buffer.from(publicKey).toString("hex");
        }
    }
    static signWithPrivateKey(privateKey, msg) {
        var msgToSign = Buffer.from(msg, "hex");
        var secret = Buffer.from(privateKey, "hex");
        if (secret[56] > 127) {
            var prefix = secret.slice(0, 57);
            prefix[0] &= 0xfc;
            prefix[56] = 0;
            prefix[55] |= 0x80;
            var scalar = prefix.slice(0, 56);
            var signedMessage = this._channel.signWithScalar(msgToSign, scalar, prefix);
            return Buffer.from(signedMessage).toString("hex");
        }
        else {
            var signedMessage = this._channel.sign(msgToSign, secret);
            return Buffer.from(signedMessage).toString("hex");
        }
    }
    static signWithPrivateKeyNConcatPubkey(privateKey, msg) {
        var signedMessage = Ed448Goldilock.signWithPrivateKey(privateKey, msg);
        var publicKey = Ed448Goldilock.getPublicKeyFromPrivateKey(privateKey);
        return signedMessage + publicKey;
    }
    static verifySignature(msgHash, signedMsg, pubKey) {
        return this._channel.verify(msgHash, signedMsg, pubKey);
    }
    static SHA512Hash(password, salt) {
        var p1 = Buffer.from(password, "hex");
        var s1 = Buffer.from(salt, "hex");
        return Buffer.from(pbkdf2.derive(SHA3_512, p1, s1, 2048, 57)).toString("hex");
    }
    static concatenateAndHex(prefix, key, index, salt) {
        var ind = Buffer.alloc(4);
        var p = Buffer.alloc(1);
        p[0] = prefix % 256;
        var j = index;
        for (let i = 0; i < 4; i++) {
            ind[i] = j % 256;
            j = Math.floor(j / 256);
        }
        var t = p.toString("hex") + key + ind.toString("hex");
        return Ed448Goldilock.SHA512Hash(t, salt);
    }
    static addScalar(a, b) {
        var a1 = Buffer.from(a, "hex");
        var b1 = Buffer.from(b.substr(0, 106) + "00000000", "hex");
        b1[0] &= 0xfc;
        var c = Buffer.alloc(57);
        var hold = 0;
        for (let i = 0; i < 57; i++) {
            hold += a1[i] + b1[i];
            c[i] = hold % 256;
            hold = Math.floor(hold / 256);
        }
        return c.toString("hex");
    }
    static seedToExtendedPrivate(seed) {
        var s1 = Ed448Goldilock.SHA512Hash(seed, "6d6e656d6f6e6963666f72746865636861696e");
        var s2 = Ed448Goldilock.SHA512Hash(seed, "6d6e656d6f6e6963666f727468656b6579");
        var b = Buffer.from(s2, "hex");
        b[56] |= 0x80;
        b[55] |= 0x80;
        b[55] &= 0xbf;
        var s3 = b.toString("hex");
        return s1 + s3;
    }
    static childPrivateToPrivate(s, index) {
        var s0 = s.substr(0, 114);
        var s1 = s.substr(114, 228);
        var r0, r1;
        if (index >= 0x80000000) {
            r0 = Ed448Goldilock.concatenateAndHex(1, s1, index, s0);
            r1 = Ed448Goldilock.concatenateAndHex(0, s1, index, s0);
            return r0 + Ed448Goldilock.addScalar(s1, r1);
        }
        else {
            var pub = Ed448Goldilock.getPublicKeyFromPrivateKey(s1);
            r0 = Ed448Goldilock.concatenateAndHex(3, pub, index, s0);
            r1 = Ed448Goldilock.concatenateAndHex(2, pub, index, s0);
            return r0 + Ed448Goldilock.addScalar(s1, r1);
        }
    }
    static HDWalletGenerateKeyFromSeed(seed, index) {
        var m = Ed448Goldilock.seedToExtendedPrivate(seed);
        var k1 = Ed448Goldilock.childPrivateToPrivate(m, 0x80000000 + 44);
        var k2 = Ed448Goldilock.childPrivateToPrivate(k1, 0x80000000 + 654);
        var k3 = Ed448Goldilock.childPrivateToPrivate(k2, 0x80000000 + 0);
        var k4 = Ed448Goldilock.childPrivateToPrivate(k3, 0x80000000 + 0);
        var k5 = Ed448Goldilock.childPrivateToPrivate(k4, index);
        return k5.substr(114, 228);
    }
}
//# sourceMappingURL=ed448goldilock.js.map