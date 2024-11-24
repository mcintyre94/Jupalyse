import { ActionFunctionArgs } from "react-router-dom";
import {
  Trade,
  MintData,
  Deposit,
  AmountToDisplay,
  StrategyType,
} from "../types";
import { Address, Signature, StringifiedNumber } from "@solana/web3.js";
import {
  numberDisplay,
  numberDisplayAlreadyAdjustedForDecimals,
} from "../number-display";
import BigDecimal from "js-big-decimal";

type InputData = {
  events: (Deposit | Trade)[];
  mints: MintData[];
};

type ShortStrategyType = "DCA" | "VA" | "LO";

type CSVTradeDataRow = {
  kind: "trade";
  timestamp: number;
  inTokenAddress: Address;
  inTokenName: string;
  inTokenSymbol: string;
  inAmount: StringifiedNumber;
  outTokenAddress: Address;
  outTokenName: string;
  outTokenSymbol: string;
  outAmount: StringifiedNumber;
  outAmountFee: StringifiedNumber;
  outAmountNet: StringifiedNumber;
  transactionSignature: Signature;
  strategyType: ShortStrategyType;
  strategyKey: Address;
};

type CSVDepositDataRow = {
  kind: "deposit";
  timestamp: number;
  inTokenAddress: Address;
  inTokenName: string;
  inTokenSymbol: string;
  inAmount: StringifiedNumber;
  transactionSignature: Signature;
  strategyType: ShortStrategyType;
  strategyKey: Address;
};

export function convertToCSV(
  items: (CSVTradeDataRow | CSVDepositDataRow)[],
): string {
  if (items.length === 0) {
    return "";
  }
  const headers = [
    "kind",
    "timestamp",
    "inTokenAddress",
    "inTokenName",
    "inTokenSymbol",
    "inAmount",
    "outTokenAddress",
    "outTokenName",
    "outTokenSymbol",
    "outAmount",
    "outAmountFee",
    "outAmountNet",
    "transactionSignature",
    "strategyType",
    "strategyKey",
  ];
  const headerNames = [
    "Kind",
    "Timestamp",
    "In Token Address",
    "In Token Name",
    "In Token Symbol",
    "In Amount",
    "Out Token Address",
    "Out Token Name",
    "Out Token Symbol",
    "Out Amount (gross)",
    "Out Amount (fee)",
    "Out Amount (net)",
    "Transaction Signature",
    "Strategy Type",
    "Strategy Key",
  ];
  const csvRows = [headerNames.join(",")];

  // Create a row for each object
  for (const item of items) {
    const values: string[] = [];
    for (const header of headers) {
      const value = item[header as keyof typeof item];
      if (!value) {
        values.push("");
      } else if (typeof value === "string" && value.includes(",")) {
        values.push(`"${value}"`);
      } else {
        values.push(value.toString());
      }
    }
    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}

function getAmountFormatted(
  amountToDisplay: AmountToDisplay,
  decimals: number,
): string {
  return amountToDisplay.adjustedForDecimals
    ? numberDisplayAlreadyAdjustedForDecimals(amountToDisplay.amount)
    : numberDisplay(amountToDisplay.amount, decimals);
}

function getAmountBigDecimal(
  amountToDisplay: AmountToDisplay,
  decimals: number,
): BigDecimal {
  return amountToDisplay.adjustedForDecimals
    ? new BigDecimal(amountToDisplay.amount)
    : new BigDecimal(`${amountToDisplay.amount}E-${decimals}`);
}

function getShortStrategyType(strategyType: StrategyType): ShortStrategyType {
  if (strategyType === "dca") return "DCA";
  if (strategyType === "value average") return "VA";
  if (strategyType === "limit order") return "LO";
  throw new Error(`Unknown strategy type: ${strategyType}`);
}

function csvDataForTrade(trade: Trade, mints: MintData[]): CSVTradeDataRow {
  const inputMintData = mints.find((mint) => mint.address === trade.inputMint);
  const outputMintData = mints.find(
    (mint) => mint.address === trade.outputMint,
  );
  const inputAmountFormatted = inputMintData
    ? getAmountFormatted(trade.inputAmount, inputMintData.decimals)
    : "";

  let outputAmountFormatted = "";
  let outputAmountFeeFormatted = "";
  let outputAmountNetFormatted = "";

  if (outputMintData || trade.outputAmount.adjustedForDecimals) {
    const decimals = outputMintData?.decimals ?? 0;

    const outputAmountBigDecimal = getAmountBigDecimal(
      trade.outputAmount,
      decimals,
    );

    const outputFeeBigDecimal = getAmountBigDecimal(trade.fee, decimals);

    const outputAmountNetBigDecimal =
      outputAmountBigDecimal.subtract(outputFeeBigDecimal);

    outputAmountFormatted =
      outputAmountBigDecimal.getPrettyValue() as StringifiedNumber;
    outputAmountFeeFormatted =
      outputFeeBigDecimal.getPrettyValue() as StringifiedNumber;
    outputAmountNetFormatted =
      outputAmountNetBigDecimal.getPrettyValue() as StringifiedNumber;
  }

  return {
    kind: "trade",
    timestamp: Math.floor(new Date(trade.date).getTime() / 1000),
    inTokenAddress: trade.inputMint,
    inTokenName: inputMintData?.name ?? "",
    inTokenSymbol: inputMintData?.symbol ?? "",
    inAmount: inputAmountFormatted as StringifiedNumber,
    outTokenAddress: trade.outputMint,
    outTokenName: outputMintData?.name ?? "",
    outTokenSymbol: outputMintData?.symbol ?? "",
    outAmount: outputAmountFormatted as StringifiedNumber,
    outAmountFee: outputAmountFeeFormatted as StringifiedNumber,
    outAmountNet: outputAmountNetFormatted as StringifiedNumber,
    transactionSignature: trade.transactionSignature,
    strategyType: getShortStrategyType(trade.strategyType),
    strategyKey: trade.strategyKey,
  };
}

function csvDataForDeposit(
  deposit: Deposit,
  mints: MintData[],
): CSVDepositDataRow {
  const inputMintData = mints.find(
    (mint) => mint.address === deposit.inputMint,
  );
  const inputAmountFormatted = inputMintData
    ? getAmountFormatted(deposit.inputAmount, inputMintData.decimals)
    : "";

  return {
    kind: "deposit",
    timestamp: Math.floor(new Date(deposit.date).getTime() / 1000),
    inTokenAddress: deposit.inputMint,
    inTokenName: inputMintData?.name ?? "",
    inTokenSymbol: inputMintData?.symbol ?? "",
    inAmount: inputAmountFormatted as StringifiedNumber,
    transactionSignature: deposit.transactionSignature,
    strategyType: getShortStrategyType(deposit.strategyType),
    strategyKey: deposit.strategyKey,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const inputData: InputData = await request.json();

  const csvData: (CSVTradeDataRow | CSVDepositDataRow)[] = inputData.events.map(
    (event) => {
      if (event.kind === "deposit") {
        return csvDataForDeposit(event, inputData.mints);
      } else {
        return csvDataForTrade(event, inputData.mints);
      }
    },
  );

  const csvContent = convertToCSV(csvData);
  return new Response(csvContent);
}
