'use strict';

import assert from 'assert';

import { ethers } from "ethers";
import { loadTests } from "@ethersproject/testcases";


type TestCase = {
    name: string;
    address: string;
    checksumAddress: string;
    icapAddress: string;
    privateKey?: string;
};

describe('Private key generation', function() {
    let tests: Array<TestCase> = loadTests('accounts');
    tests.forEach((test) => {
        if (!test.privateKey) { return; }
        it(('correctly converts private key - ' + test.name), function() {
            let wallet = new ethers.Wallet(test.privateKey);
            assert.equal(wallet.address.toLowerCase(), test.address.toLowerCase(),
                'correctly computes privateKey - ' + test.privateKey);
        });
    });
});
