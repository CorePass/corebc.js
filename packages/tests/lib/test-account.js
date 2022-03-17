'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var assert_1 = __importDefault(require("assert"));
var ethers_1 = require("ethers");
var testcases_1 = require("@ethersproject/testcases");
describe('Private key generation', function () {
    var tests = (0, testcases_1.loadTests)('accounts');
    tests.forEach(function (test) {
        if (!test.privateKey) {
            return;
        }
        it(('correctly converts private key - ' + test.name), function () {
            var wallet = new ethers_1.ethers.Wallet(test.privateKey);
            assert_1.default.equal(wallet.address.toLowerCase(), test.address.toLowerCase(), 'correctly computes privateKey - ' + test.privateKey);
        });
    });
});
//# sourceMappingURL=test-account.js.map