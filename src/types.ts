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
  openTxHash: Signature;
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
  openTxHash: Signature;
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

type LimitOrderTrade = {
  confirmedAt: StringifiedDate;
  inputMint: Address;
  outputMint: Address;
  /** Note: already adjusted for decimals */
  inputAmount: StringifiedNumber;
  /** Note: already adjusted for decimals */
  outputAmount: StringifiedNumber;
  /** Note: already adjusted for decimals */
  feeAmount: StringifiedNumber;
  orderKey: Address;
  txId: Signature;
};

export type TriggerFetchedAccount = {
  orderKey: Address;
  inputMint: Address;
  outputMint: Address;
  /** Note: already adjusted for decimals */
  makingAmount: StringifiedNumber;
  createdAt: StringifiedDate;
  // TODO: waiting to find out more status values
  status: "Completed" | "Cancelled";
  openTx: Signature;
  trades: LimitOrderTrade[];
};

export type LimitOrderOrdersResponse = {
  orders: TriggerFetchedAccount[];
  totalPages: number;
  page: number;
};

export type AmountToDisplay = {
  amount: StringifiedNumber;
  adjustedForDecimals: boolean;
};

export type StrategyType = "dca" | "value average" | "trigger";

export type Deposit = {
  kind: "deposit";
  date: Date;
  inputMint: Address;
  inputAmount: AmountToDisplay;
  strategyType: StrategyType;
  strategyKey: Address;
  userAddress: Address;
  transactionSignature: Signature;
};

export type Trade = {
  kind: "trade";
  date: Date;
  inputMint: Address;
  outputMint: Address;
  inputAmount: AmountToDisplay;
  outputAmount: AmountToDisplay;
  fee: AmountToDisplay;
  strategyType: StrategyType;
  strategyKey: Address;
  userAddress: Address;
  transactionSignature: Signature;
};

export type Timestamp = number;

export type TokenPricesToFetch = {
  [key: Address]: Timestamp[];
};

export type FetchedTokenPriceKey = `${Address}-${Timestamp}`;

export type FetchedTokenPrices = {
  [key in FetchedTokenPriceKey]: number;
};
