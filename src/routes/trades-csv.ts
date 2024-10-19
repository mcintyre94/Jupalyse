import { ActionFunctionArgs } from "react-router-dom";
import { DCAFillData, MintData } from "../types";
import { Address, Signature, StringifiedNumber } from "@solana/web3.js";
import { numberDisplay } from "../number-display";
import BigDecimal from "js-big-decimal";

type InputData = {
  dcaFills: DCAFillData[];
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
  DCAKey: Address;
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
    "DCA Key",
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

  const csvData: CSVDataRow[] = inputData.dcaFills.map((fill) => {
    const inputMintData = inputData.mints.find(
      (mint) => mint.address === fill.inputMint
    );
    const outputMintData = inputData.mints.find(
      (mint) => mint.address === fill.outputMint
    );
    const inputAmountFormatted = inputMintData
      ? numberDisplay(fill.inAmount, inputMintData.decimals)
      : "";

    let outputAmountFormatted = "";
    let outputAmountFeeFormatted = "";
    let outputAmountNetFormatted = "";

    if (outputMintData) {
      const outputAmountBigDecimal = new BigDecimal(
        `${fill.outAmount}E-${outputMintData.decimals}`
      );
      const outputFeeBigDecimal = new BigDecimal(
        `${fill.fee}E-${outputMintData.decimals}`
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
      timestamp: fill.confirmedAt,
      inTokenAddress: fill.inputMint,
      inTokenName: inputMintData?.name ?? "",
      inTokenSymbol: inputMintData?.symbol ?? "",
      inAmount: inputAmountFormatted as StringifiedNumber,
      outTokenAddress: fill.outputMint,
      outTokenName: outputMintData?.name ?? "",
      outTokenSymbol: outputMintData?.symbol ?? "",
      outAmount: outputAmountFormatted as StringifiedNumber,
      outAmountFee: outputAmountFeeFormatted as StringifiedNumber,
      outAmountNet: outputAmountNetFormatted as StringifiedNumber,
      transactionSignature: fill.txId,
      DCAKey: fill.dcaKey,
    };
  });

  const csvContent = convertToCSV(csvData);

  // Create a Blob with the CSV content
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

  // Create a temporary URL for the Blob
  const url = URL.createObjectURL(blob);

  // Return the URL and filename
  const userAddress = inputData.dcaFills[0].userKey;
  return { url, filename: `${userAddress}-dcas.csv` };
}
