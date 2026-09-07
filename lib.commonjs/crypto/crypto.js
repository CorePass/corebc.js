'use strict';

var ed448 = require('./ed448.js');
var ed448goldilock = require('./ed448goldilock.js');
var crypto = require('crypto');



exports.ed448 = ed448.default;
exports.Ed448Goldilock = ed448goldilock.Ed448Goldilock;
Object.defineProperty(exports, "createHash", {
	enumerable: true,
	get: function () { return crypto.createHash; }
});
Object.defineProperty(exports, "createHmac", {
	enumerable: true,
	get: function () { return crypto.createHmac; }
});
Object.defineProperty(exports, "pbkdf2Sync", {
	enumerable: true,
	get: function () { return crypto.pbkdf2Sync; }
});
Object.defineProperty(exports, "randomBytes", {
	enumerable: true,
	get: function () { return crypto.randomBytes; }
});
//# sourceMappingURL=crypto.js.map
