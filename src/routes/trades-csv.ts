import { ActionFunctionArgs } from "react-router-dom";
import {
  Trade,
  MintData,
  Deposit,
  AmountToDisplay,
  FetchedTokenPrices,
  Timestamp,
  FetchedTokenPriceKey,
  OrderType,
} from "../types";
import { Address, Signature, StringifiedNumber } from "@solana/web3.js";
import {
  numberDisplay,
  numberDisplayAlreadyAdjustedForDecimals,
} from "../number-display";
import BigDecimal from "js-big-decimal";
import { roundTimestampToMinuteBoundary } from "../token-prices";

type InputData = {
  events: (Deposit | Trade)[];
  mints: MintData[];
  fetchedTokenPrices: FetchedTokenPrices;
};

type CSVTradeDataRow = {
  kind: "trade";
  timestamp: number;
  inTokenAddress: Address;
  inTokenName: string;
  inTokenSymbol: string;
  inAmount: StringifiedNumber;
  inAmountUsd: StringifiedNumber;
  outTokenAddress: Address;
  outTokenName: string;
  outTokenSymbol: string;
  outAmount: StringifiedNumber;
  outAmountUsd: StringifiedNumber;
  outAmountFee: StringifiedNumber;
  outAmountFeeUsd: StringifiedNumber;
  outAmountNet: StringifiedNumber;
  outAmountNetUsd: StringifiedNumber;
  transactionSignature: Signature;
  orderType: OrderType;
  orderKey: Address;
};

type CSVDepositDataRow = {
  kind: "deposit";
  timestamp: number;
  inTokenAddress: Address;
  inTokenName: string;
  inTokenSymbol: string;
  inAmount: StringifiedNumber;
  inAmountUsd: StringifiedNumber;
  transactionSignature: Signature;
  orderType: OrderType;
  orderKey: Address;
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
    "inAmountUsd",
    "outTokenAddress",
    "outTokenName",
    "outTokenSymbol",
    "outAmount",
    "outAmountUsd",
    "outAmountFee",
    "outAmountFeeUsd",
    "outAmountNet",
    "outAmountNetUsd",
    "transactionSignature",
    "orderType",
    "orderKey",
  ];
  const headerNames = [
    "Kind",
    "Timestamp",
    "In Token Address",
    "In Token Name",
    "In Token Symbol",
    "In Amount",
    "In Amount USD",
    "Out Token Address",
    "Out Token Name",
    "Out Token Symbol",
    "Out Amount",
    "Out Amount USD",
    "Out Amount (fee)",
    "Out Amount (fee) USD",
    "Out Amount (net)",
    "Out Amount (net) USD",
    "Transaction Signature",
    "Order Type",
    "Order Key",
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

function getUsdPrice(
  mintAddress: Address,
  timestamp: Timestamp,
  fetchedTokenPrices: FetchedTokenPrices,
): number | undefined {
  const roundedTimestamp = roundTimestampToMinuteBoundary(timestamp);
  const key: FetchedTokenPriceKey = `${mintAddress}-${roundedTimestamp}`;
  return fetchedTokenPrices[key];
}

function getUsdAmount(
  price: number | undefined,
  mintAmount: AmountToDisplay,
  mintData: MintData | undefined,
): StringifiedNumber {
  if (!price) {
    return "" as StringifiedNumber;
  }
  if (mintData || mintAmount.adjustedForDecimals) {
    const mintDecimals = mintData?.decimals ?? 0;
    const tokenAmount = getAmountBigDecimal(mintAmount, mintDecimals);
    return tokenAmount
      .multiply(new BigDecimal(price))
      .round(6)
      .getPrettyValue() as StringifiedNumber;
  }
  return "" as StringifiedNumber;
}

function csvDataForTrade(
  trade: Trade,
  mints: MintData[],
  fetchedTokenPrices: FetchedTokenPrices,
): CSVTradeDataRow {
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

    const outputAmountNetBigDecimal = getAmountBigDecimal(
      trade.outputAmount,
      decimals,
    );

    const outputFeeBigDecimal = getAmountBigDecimal(trade.fee, decimals);

    const outputAmountGrossBigDecimal =
      outputAmountNetBigDecimal.add(outputFeeBigDecimal);

    outputAmountFormatted =
      outputAmountGrossBigDecimal.getPrettyValue() as StringifiedNumber;
    outputAmountFeeFormatted =
      outputFeeBigDecimal.getPrettyValue() as StringifiedNumber;
    outputAmountNetFormatted =
      outputAmountNetBigDecimal.getPrettyValue() as StringifiedNumber;
  }

  const timestamp = Math.floor(new Date(trade.date).getTime() / 1000);

  const inUsdPrice = getUsdPrice(
    trade.inputMint,
    timestamp,
    fetchedTokenPrices,
  );
  const inAmountUsd = getUsdAmount(
    inUsdPrice,
    trade.inputAmount,
    inputMintData,
  );

  const outUsdPrice = getUsdPrice(
    trade.outputMint,
    timestamp,
    fetchedTokenPrices,
  );

  const outAmountUsd = getUsdAmount(
    outUsdPrice,
    trade.outputAmount,
    outputMintData,
  );

  const outAmountFeeUsd = getUsdAmount(outUsdPrice, trade.fee, outputMintData);

  const outAmountNetUsd = new BigDecimal(outAmountUsd)
    .subtract(new BigDecimal(outAmountFeeUsd))
    .round(6)
    .getPrettyValue() as StringifiedNumber;

  return {
    kind: "trade",
    timestamp,
    inTokenAddress: trade.inputMint,
    inTokenName: inputMintData?.name ?? "",
    inTokenSymbol: inputMintData?.symbol ?? "",
    inAmount: inputAmountFormatted as StringifiedNumber,
    inAmountUsd: inAmountUsd as StringifiedNumber,
    outTokenAddress: trade.outputMint,
    outTokenName: outputMintData?.name ?? "",
    outTokenSymbol: outputMintData?.symbol ?? "",
    outAmount: outputAmountFormatted as StringifiedNumber,
    outAmountUsd: outAmountUsd as StringifiedNumber,
    outAmountFee: outputAmountFeeFormatted as StringifiedNumber,
    outAmountFeeUsd: outAmountFeeUsd as StringifiedNumber,
    outAmountNet: outputAmountNetFormatted as StringifiedNumber,
    outAmountNetUsd: outAmountNetUsd as StringifiedNumber,
    transactionSignature: trade.transactionSignature,
    orderType: trade.orderType,
    orderKey: trade.orderKey,
  };
}

function csvDataForDeposit(
  deposit: Deposit,
  mints: MintData[],
  fetchedTokenPrices: FetchedTokenPrices,
): CSVDepositDataRow {
  console.log({ fetchedTokenPrices });

  const inputMintData = mints.find(
    (mint) => mint.address === deposit.inputMint,
  );
  const inputAmountFormatted = inputMintData
    ? getAmountFormatted(deposit.inputAmount, inputMintData.decimals)
    : "";

  const timestamp = Math.floor(new Date(deposit.date).getTime() / 1000);

  const usdPrice = getUsdPrice(
    deposit.inputMint,
    timestamp,
    fetchedTokenPrices,
  );

  const inAmountUsd = getUsdAmount(
    usdPrice,
    deposit.inputAmount,
    inputMintData,
  );

  return {
    kind: "deposit",
    timestamp,
    inTokenAddress: deposit.inputMint,
    inTokenName: inputMintData?.name ?? "",
    inTokenSymbol: inputMintData?.symbol ?? "",
    inAmount: inputAmountFormatted as StringifiedNumber,
    inAmountUsd: inAmountUsd as StringifiedNumber,
    transactionSignature: deposit.transactionSignature,
    orderType: deposit.orderType,
    orderKey: deposit.orderKey,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const inputData: InputData = await request.json();

  const csvData: (CSVTradeDataRow | CSVDepositDataRow)[] = inputData.events.map(
    (event) => {
      if (event.kind === "deposit") {
        return csvDataForDeposit(
          event,
          inputData.mints,
          inputData.fetchedTokenPrices,
        );
      } else {
        return csvDataForTrade(
          event,
          inputData.mints,
          inputData.fetchedTokenPrices,
        );
      }
    },
  );

  const csvContent = convertToCSV(csvData);
  return new Response(csvContent);
}
