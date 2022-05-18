'use strict';
import assert from 'assert';
import { corebc } from "@corepass/corebc";
import { loadTests } from "@corepass/corebc-testcases";
describe('Private key generation', function () {
    let tests = loadTests('accounts');
    tests.forEach((test) => {
        if (!test.privateKey) {
            return;
        }
        it(('correctly converts private key - ' + test.name), function () {
            let wallet = new corebc.Wallet(test.privateKey, test.prefix);
            assert.equal(wallet.address.toLowerCase(), test.address.toLowerCase(), 'correctly computes privateKey - ' + test.privateKey);
        });
    });
});
//# sourceMappingURL=test-account.js.map