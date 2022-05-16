"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomBytes = void 0;
var crypto_1 = require("crypto");
var corebc_bytes_1 = require("@corepass/corebc-bytes");
function randomBytes(length) {
    return (0, corebc_bytes_1.arrayify)((0, crypto_1.randomBytes)(length));
}
exports.randomBytes = randomBytes;
//# sourceMappingURL=random.js.map