import { Address } from "@solana/web3.js";

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
