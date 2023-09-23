"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomBytes = exports.pbkdf2Sync = exports.createHmac = exports.createHash = exports.Ed448Goldilock = exports.ed448 = void 0;
const tslib_1 = require("tslib");
const ed448_js_1 = tslib_1.__importDefault(require("./ed448.js"));
exports.ed448 = ed448_js_1.default;
var ed448goldilock_js_1 = require("./ed448goldilock.js");
Object.defineProperty(exports, "Ed448Goldilock", { enumerable: true, get: function () { return ed448goldilock_js_1.Ed448Goldilock; } });
var crypto_1 = require("crypto");
Object.defineProperty(exports, "createHash", { enumerable: true, get: function () { return crypto_1.createHash; } });
Object.defineProperty(exports, "createHmac", { enumerable: true, get: function () { return crypto_1.createHmac; } });
Object.defineProperty(exports, "pbkdf2Sync", { enumerable: true, get: function () { return crypto_1.pbkdf2Sync; } });
Object.defineProperty(exports, "randomBytes", { enumerable: true, get: function () { return crypto_1.randomBytes; } });
//# sourceMappingURL=crypto.js.map