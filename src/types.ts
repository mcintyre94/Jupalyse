import { Address, Signature } from "@solana/web3.js";

type StringifiedDate = string & { __brand: "StringifiedDate" };
export type StringifiedNumber = string & { __brand: "StringifiedNumber" };

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

type JupiterTrade = {
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

export type RecurringOrderFetchedAccount = {
  recurringType: "time" | "price";
  orderKey: Address;
  inputMint: Address;
  outputMint: Address;
  /** Note: already adjusted for decimals */
  inDeposited: StringifiedNumber;
  /** Note: already adjusted for decimals */
  outReceived: StringifiedNumber;
  cycleFrequency: number;
  /** Note: already adjusted for decimals */
  inAmountPerCycle: StringifiedNumber;
  openTx: Signature;
  createdAt: StringifiedDate;
  trades: JupiterTrade[];
};

export type RecurringOrdersResponse = {
  all: RecurringOrderFetchedAccount[];
  totalPages: number;
  page: number;
};

export type TriggerOrderFetchedAccount = {
  orderKey: Address;
  inputMint: Address;
  outputMint: Address;
  /** Note: already adjusted for decimals */
  makingAmount: StringifiedNumber;
  createdAt: StringifiedDate;
  status: "Completed" | "Cancelled" | "Open";
  openTx: Signature;
  trades: JupiterTrade[];
};

export type TriggerOrdersResponse = {
  orders: TriggerOrderFetchedAccount[];
  totalPages: number;
  page: number;
};

export type AmountToDisplay = {
  amount: StringifiedNumber;
  adjustedForDecimals: boolean;
};

export type OrderType = "recurring time" | "recurring price" | "trigger";

export type Deposit = {
  kind: "deposit";
  date: Date;
  inputMint: Address;
  inputAmount: AmountToDisplay;
  orderType: OrderType;
  orderKey: Address;
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
  orderType: OrderType;
  orderKey: Address;
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
