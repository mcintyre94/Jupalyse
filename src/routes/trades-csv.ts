import { ActionFunctionArgs } from "react-router-dom";
import { Trade, MintData } from "../types";
import { Address, Signature, StringifiedNumber } from "@solana/web3.js";
import { numberDisplay } from "../number-display";
import BigDecimal from "js-big-decimal";

type InputData = {
  trades: Trade[];
  mints: MintData[];
};

type CSVDataRow = {
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
  tradeGroupType: "DCA" | "VA";
  tradeGroupKey: Address;
};

export function convertToCSV(items: CSVDataRow[]): string {
  if (items.length === 0) {
    return "";
  }
  const headers = Object.keys(items[0]);
  const headerNames = [
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
    "Trade Group Type",
    "Trade Group Key",
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

export async function action({ request }: ActionFunctionArgs) {
  const inputData: InputData = await request.json();

  const csvData: CSVDataRow[] = inputData.trades.map((trade) => {
    const inputMintData = inputData.mints.find(
      (mint) => mint.address === trade.inputMint
    );
    const outputMintData = inputData.mints.find(
      (mint) => mint.address === trade.outputMint
    );
    const inputAmountFormatted = inputMintData
      ? numberDisplay(trade.inputAmount, inputMintData.decimals)
      : "";

    let outputAmountFormatted = "";
    let outputAmountFeeFormatted = "";
    let outputAmountNetFormatted = "";

    if (outputMintData) {
      const outputAmountBigDecimal = new BigDecimal(
        `${trade.outputAmount}E-${outputMintData.decimals}`
      );
      const outputFeeBigDecimal = new BigDecimal(
        `${trade.fee}E-${outputMintData.decimals}`
      );
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
      timestamp: Math.floor(new Date(trade.confirmedAt).getTime() / 1000),
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
      tradeGroupType: trade.tradeGroupType === "dca" ? "DCA" : "VA",
      tradeGroupKey: trade.tradeGroupKey,
    };
  });

  const csvContent = convertToCSV(csvData);

  // Create a Blob with the CSV content
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

  // Create a temporary URL for the Blob
  const url = URL.createObjectURL(blob);

  // Return the URL and filename
  const userAddress = inputData.trades[0].userAddress;
  return { url, filename: `${userAddress}-trades.csv` };
}
