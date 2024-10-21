import { Address, Signature } from "@solana/web3.js";

type StringifiedDate = string & { __brand: "StringifiedDate" };
export type StringifiedNumber = string & { __brand: "StringifiedNumber" };

export enum DCAStatus {
  OPEN = 0,
  CLOSED = 1,
}

export type DCAFetchedAccount = {
  createdAt: StringifiedDate;
  cycleFrequency: number;
  dcaKey: Address;
  inputMint: Address;
  outputMint: Address;
  inDeposited: StringifiedNumber;
  inAmountPerCycle: StringifiedNumber;
  status: DCAStatus;
};

export type FetchDCAsResponse = {
  ok: boolean;
  data: {
    dcaAccounts: DCAFetchedAccount[];
  };
};

export type MintData = {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
};

export type FetchMintsResponse = {
  content: MintData[];
};

export type DCAFillData = {
  userKey: Address;
  confirmedAt: number; // unix timestamp
  inputMint: Address;
  outputMint: Address;
  inAmount: StringifiedNumber;
  outAmount: StringifiedNumber;
  fee: StringifiedNumber;
  txId: Signature;
  dcaKey: Address;
};

export type FetchDCAFillsResponse = {
  ok: boolean;
  data: {
    fills: DCAFillData[];
  };
};

export enum ValueAverageStatus {
  CLOSED = 0,
  OPEN = 1,
}

export type ValueAverageFetchedAccount = {
  createdAt: StringifiedDate;
  valueAverageKey: Address;
  inputMint: Address;
  outputMint: Address;
  inDeposited: StringifiedNumber;
  inLeft: StringifiedNumber;
  status: ValueAverageStatus;
  supposedUsdcValue: StringifiedNumber;
};

export type FetchValueAveragesResponse = {
  ok: boolean;
  data: {
    valueAverageAccounts: ValueAverageFetchedAccount[];
  };
};

export type ValueAverageFillData = {
  userKey: Address;
  confirmedAt: number; // unix timestamp
  inputMint: Address;
  outputMint: Address;
  inputAmount: StringifiedNumber;
  outputAmount: StringifiedNumber;
  fee: StringifiedNumber;
  txSignature: Signature;
  valueAverageKey: Address;
};

export type FetchValueAverageFillsResponse = {
  ok: boolean;
  data: {
    fills: ValueAverageFillData[];
  };
};

export type Trade = {
  confirmedAt: Date;
  inputMint: Address;
  outputMint: Address;
  inputAmount: StringifiedNumber;
  outputAmount: StringifiedNumber;
  fee: StringifiedNumber;
  txSignature: Signature;
  tradeGroupType: "dca" | "value average";
  tradeGroupKey: Address;
  userAddress: Address;
  transactionSignature: Signature;
};
