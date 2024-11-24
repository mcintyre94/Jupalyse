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
