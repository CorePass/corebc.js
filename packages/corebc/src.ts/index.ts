"use strict";

// To modify this file, you must update ./misc/admin/lib/cmds/update-exports.js

import * as corebc from "./corebc";

try {
    const anyGlobal = (window as any);

    if (anyGlobal._corebc == null) {
        anyGlobal._corebc = corebc;
    }
} catch (error) { }

export { corebc };

export {
    Signer,

    Wallet,
    VoidSigner,

    getDefaultProvider,
    providers,

    BaseContract,
    Contract,
    ContractFactory,

    BigNumber,
    FixedNumber,

    constants,
    errors,

    logger,

    utils,

    wordlists,


    ////////////////////////
    // Compile-Time Constants

    version,


    ////////////////////////
    // Types

    ContractFunction,
    ContractReceipt,
    ContractTransaction,
    Event,
    EventFilter,

    Overrides,
    PayableOverrides,
    CallOverrides,

    PopulatedTransaction,

    ContractInterface,

    BigNumberish,

    Bytes,
    BytesLike,

    Transaction,
    UnsignedTransaction,

    Wordlist
} from "./corebc";
