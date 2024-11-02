import { Address } from "@solana/web3.js";
import {
  DCAStatus,
  FetchDCAsResponse,
  ValueAverageStatus,
  FetchValueAveragesResponse,
} from "./types";

export async function getClosedDCAs(address: Address) {
  const response = await fetch(
    `https://dca-api.jup.ag/user/${address}?status=${DCAStatus.CLOSED}`,
  );
  const data = (await response.json()) as FetchDCAsResponse;
  if (!data.ok) {
    throw new Error("Error fetching closed DCAs from Jupiter");
  }
  return data.data.dcaAccounts;
}

export async function getOpenDCAs(address: Address) {
  const response = await fetch(
    `https://dca-api.jup.ag/user/${address}?status=${DCAStatus.OPEN}`,
  );
  const data = (await response.json()) as FetchDCAsResponse;
  if (!data.ok) {
    throw new Error("Error fetching open DCAs from Jupiter");
  }
  return data.data.dcaAccounts;
}

export async function getClosedValueAverages(address: Address) {
  const response = await fetch(
    `https://va.jup.ag/value-averages?user=${address}&status=${ValueAverageStatus.CLOSED}`,
  );
  const data = (await response.json()) as FetchValueAveragesResponse;
  if (!data.ok) {
    throw new Error("Error fetching closed value averages from Jupiter");
  }
  return data.data.valueAverageAccounts;
}

export async function getOpenValueAverages(address: Address) {
  const response = await fetch(
    `https://va.jup.ag/value-averages?user=${address}&status=${ValueAverageStatus.OPEN}`,
  );
  const data = (await response.json()) as FetchValueAveragesResponse;
  if (!data.ok) {
    throw new Error("Error fetching open value averages from Jupiter");
  }
  return data.data.valueAverageAccounts;
}
