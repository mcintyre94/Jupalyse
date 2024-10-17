import { StringifiedNumber } from "./types";

export function numberDisplay(value: StringifiedNumber, decimals: number) {
  const formatter = Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
  });

  // @ts-expect-error Typescript doesn't know about this format
  return formatter.format(`${value}E-${decimals}`);
}
