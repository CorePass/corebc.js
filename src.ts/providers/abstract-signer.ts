/**
 *  About Abstract Signer and subclassing
 *
 *  @_section: api/providers/abstract-signer: Subclassing Signer [abstract-signer]
 */
import { resolveAddress } from "../address/checks.js";
import { getAddress } from "../address/index.js";
import { Transaction } from "../transaction/index.js";
import {
  defineProperties,
  getBigInt,
  resolveProperties,
  assert,
  assertArgument,
} from "../utils/index.js";

import { copyRequest } from "./provider.js";

import type { TypedDataDomain, TypedDataField } from "../hash/index.js";
import type { TransactionLike } from "../transaction/index.js";

import type {
  BlockTag,
  Provider,
  TransactionRequest,
  TransactionResponse,
} from "./provider.js";
import type { Signer } from "./signer.js";

function checkProvider(signer: AbstractSigner, operation: string): Provider {
  if (signer.provider) {
    return signer.provider;
  }
  assert(false, "missing provider", "UNSUPPORTED_OPERATION", { operation });
}

async function populate(
  signer: AbstractSigner,
  tx: TransactionRequest,
): Promise<TransactionLike<string>> {
  let pop: any = copyRequest(tx);

  if (pop.to != null) {
    pop.to = resolveAddress(pop.to);
  }

  if (pop.from != null) {
    const from = pop.from;
    pop.from = Promise.all([signer.getAddress(), resolveAddress(from)]).then(
      ([address, from]) => {
        assertArgument(
          address.toLowerCase() === from.toLowerCase(),
          "transaction from mismatch",
          "tx.from",
          from,
        );
        return address;
      },
    );
  } else {
    pop.from = signer.getAddress();
  }

  return await resolveProperties(pop);
}

export abstract class AbstractSigner<
  P extends null | Provider = null | Provider,
> implements Signer
{
  readonly provider!: P;

  constructor(provider?: P) {
    defineProperties<AbstractSigner>(this, { provider: provider || null });
  }

  abstract getAddress(): Promise<string>;
  abstract connect(provider: null | Provider): Signer;

  async getNonce(blockTag?: BlockTag): Promise<number> {
    return checkProvider(this, "getTransactionCount").getTransactionCount(
      await this.getAddress(),
      blockTag,
    );
  }

  async populateCall(tx: TransactionRequest): Promise<TransactionLike<string>> {
    const pop = await populate(this, tx);
    return pop;
  }

  async populateTransaction(
    tx: TransactionRequest,
  ): Promise<TransactionLike<string>> {
    const provider = checkProvider(this, "populateTransaction");

    const pop = await populate(this, tx);

    if (pop.nonce == null) {
      pop.nonce = await this.getNonce("pending");
    }

    if (pop.energyLimit == null) {
      pop.energyLimit = await this.estimateEnergy(pop);
    }

    // Populate the chain ID
    const network = await (<Provider>this.provider).getNetwork();
    if (pop.networkId != null) {
      const networkId = getBigInt(pop.networkId);
      assertArgument(
        networkId === network.networkId,
        "transaction networkId mismatch",
        "tx.networkId",
        tx.networkId,
      );
    } else {
      pop.networkId = network.networkId;
    }

    // We need to get fee data to determine things
    const feeData = await provider.getFeeData();
    // We need to auto-detect the intended type of this transaction...

    if (feeData.energyPrice != null) {
      // Network doesn't support EIP-1559...
      // Populate missing fee data
      if (pop.energyPrice == null) {
        pop.energyPrice = feeData.energyPrice;
      }
    } else {
      // getFeeData has failed us.
      assert(
        false,
        "failed to get consistent fee data",
        "UNSUPPORTED_OPERATION",
        {
          operation: "signer.getFeeData",
        },
      );
    }

    //@TOOD: Don't await all over the place; save them up for
    // the end for better batching
    return await resolveProperties(pop);
  }

  async estimateEnergy(tx: TransactionRequest): Promise<bigint> {
    return checkProvider(this, "estimateEnergy").estimateEnergy(
      await this.populateCall(tx),
    );
  }

  async call(tx: TransactionRequest): Promise<string> {
    return checkProvider(this, "call").call(await this.populateCall(tx));
  }

  async resolveName(name: string): Promise<null | string> {
    return getAddress(name);
  }

  async sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
    const provider = checkProvider(this, "sendTransaction");

    const pop = await this.populateTransaction(tx);
    delete pop.from;
    const txObj = Transaction.from(pop);
    return await provider.broadcastTransaction(
      await this.signTransaction(txObj),
    );
  }

  abstract signTransaction(tx: TransactionRequest): Promise<string>;
  abstract signMessage(message: string | Uint8Array): Promise<string>;
  abstract signTypedData(
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, any>,
  ): Promise<string>;
}

export class VoidSigner extends AbstractSigner {
  readonly address!: string;

  constructor(address: string, provider?: null | Provider) {
    super(provider);
    defineProperties<VoidSigner>(this, { address });
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  connect(provider: null | Provider): VoidSigner {
    return new VoidSigner(this.address, provider);
  }

  #throwUnsupported(suffix: string, operation: string): never {
    assert(false, `VoidSigner cannot sign ${suffix}`, "UNSUPPORTED_OPERATION", {
      operation,
    });
  }

  async signTransaction(tx: TransactionRequest): Promise<string> {
    this.#throwUnsupported("transactions", "signTransaction");
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    this.#throwUnsupported("messages", "signMessage");
  }

  async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    value: Record<string, any>,
  ): Promise<string> {
    this.#throwUnsupported("typed-data", "signTypedData");
  }
}
