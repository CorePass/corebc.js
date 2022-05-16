'use strict';

import assert from 'assert';

import { corebc } from "corebc";
import { loadTests } from "@corepass/corebc-testcases";


type TestCase = {
    name: string;
    address: string;
    checksumAddress: string;
    icapAddress: string;
    privateKey?: string;
    prefix: string;
};

describe('Private key generation', function() {
    let tests: Array<TestCase> = loadTests('accounts');
    tests.forEach((test) => {
        if (!test.privateKey) { return; }
        it(('correctly converts private key - ' + test.name), function() {
            let wallet = new corebc.Wallet(test.privateKey, test.prefix);
            assert.equal(wallet.address.toLowerCase(), test.address.toLowerCase(),
                'correctly computes privateKey - ' + test.privateKey);
        });
    });
});
