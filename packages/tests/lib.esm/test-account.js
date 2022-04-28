'use strict';
import assert from 'assert';
import { ethers } from "ethers";
import { loadTests } from "@ethersproject/testcases";
describe('Private key generation', function () {
    let tests = loadTests('accounts');
    tests.forEach((test) => {
        if (!test.privateKey) {
            return;
        }
        it(('correctly converts private key - ' + test.name), function () {
            let wallet = new ethers.Wallet(test.privateKey, test.prefix);
            assert.equal(wallet.address.toLowerCase(), test.address.toLowerCase(), 'correctly computes privateKey - ' + test.privateKey);
        });
    });
});
//# sourceMappingURL=test-account.js.map