import { StringifiedNumber } from "./types";

export function numberDisplay(value: StringifiedNumber, decimals: number) {
  const formatter = Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
  });

  // @ts-expect-error Typescript doesn't know about this format
  return formatter.format(`${value}E-${decimals}`);
}

export function numberDisplayAlreadyAdjustedForDecimals(
  value: StringifiedNumber,
) {
  const formatter = Intl.NumberFormat("en-US");
  // @ts-expect-error Typescript doesn't know about this format
  // we use the formatter to get better display, eg `123456` -> `123,456`
  return formatter.format(`${value}`);
}

const dollarTwoDecimalsFormatter = Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dollarFourDecimalsFormatter = Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

export function dollarAmountDisplay(value: number) {
  if (value < 0.0001) {
    return "<$0.0001";
  }

  const formatter =
    value < 1 ? dollarFourDecimalsFormatter : dollarTwoDecimalsFormatter;
  return formatter.format(value);
}
