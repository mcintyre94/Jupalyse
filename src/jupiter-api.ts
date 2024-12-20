import { Address } from "@solana/web3.js";
import {
  DCAStatus,
  FetchDCAsResponse,
  ValueAverageStatus,
  FetchValueAveragesResponse,
  LimitOrderFetchedAccount,
  LimitOrderOrdersResponse,
} from "./types";
import { queryClient } from "./query-client";

async function getClosedDCAsImpl(address: Address) {
  const response = await fetch(
    `https://dca-api.jup.ag/user/${address}?status=${DCAStatus.CLOSED}`,
  );
  const data = (await response.json()) as FetchDCAsResponse;
  if (!data.ok) {
    throw new Error("Error fetching closed DCAs from Jupiter");
  }
  return data.data.dcaAccounts;
}

export async function getClosedDCAs(address: Address) {
  return queryClient.fetchQuery({
    queryKey: ["closedDCAs", address],
    queryFn: () => getClosedDCAsImpl(address),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

async function getOpenDCAsImpl(address: Address) {
  const response = await fetch(
    `https://dca-api.jup.ag/user/${address}?status=${DCAStatus.OPEN}`,
  );
  const data = (await response.json()) as FetchDCAsResponse;
  if (!data.ok) {
    throw new Error("Error fetching open DCAs from Jupiter");
  }
  return data.data.dcaAccounts;
}

export async function getOpenDCAs(address: Address) {
  return queryClient.fetchQuery({
    queryKey: ["openDCAs", address],
    queryFn: () => getOpenDCAsImpl(address),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

async function getClosedValueAveragesImpl(address: Address) {
  const response = await fetch(
    `https://va.jup.ag/value-averages?user=${address}&status=${ValueAverageStatus.CLOSED}`,
  );
  const data = (await response.json()) as FetchValueAveragesResponse;
  if (!data.ok) {
    throw new Error("Error fetching closed value averages from Jupiter");
  }
  return data.data.valueAverageAccounts;
}

export async function getClosedValueAverages(address: Address) {
  return queryClient.fetchQuery({
    queryKey: ["closedValueAverages", address],
    queryFn: () => getClosedValueAveragesImpl(address),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

async function getOpenValueAveragesImpl(address: Address) {
  const response = await fetch(
    `https://va.jup.ag/value-averages?user=${address}&status=${ValueAverageStatus.OPEN}`,
  );
  const data = (await response.json()) as FetchValueAveragesResponse;
  if (!data.ok) {
    throw new Error("Error fetching open value averages from Jupiter");
  }
  return data.data.valueAverageAccounts;
}

export async function getOpenValueAverages(address: Address) {
  return queryClient.fetchQuery({
    queryKey: ["openValueAverages", address],
    queryFn: () => getOpenValueAveragesImpl(address),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Note that these are limit orders which may or may not have been closed, but have at least one trade
// The `openOrders` API gives open limit orders, but does not include any trades in the output
// If a limit order has a trade, this should be in `orderHistory`
// So for our purpose we only look at `orderHistory`
// This is different from DCA and Value Averages, where they only move from open to closed when they are completed
// and we care about both open and closed states
// With limit orders, we just need `orderHistory` because only it includes trades
async function getLimitOrdersWithTradesImpl(address: Address) {
  // Note that this API is paginated
  let page = 1;
  let hasMoreData = true;
  const orders: LimitOrderFetchedAccount[] = [];

  while (hasMoreData) {
    const response = await fetch(
      `https://api.jup.ag/limit/v2/orderHistory?wallet=${address}&page=${page}`,
    );
    if (response.status >= 400) {
      throw new Error("Error fetching limit orders from Jupiter");
    }
    const data = (await response.json()) as LimitOrderOrdersResponse;
    orders.push(...data.orders.filter((order) => order.trades.length > 0));
    hasMoreData = data.hasMoreData;
    page = data.page + 1;
  }
  return orders;
}

export async function getLimitOrdersWithTrades(address: Address) {
  return queryClient.fetchQuery({
    queryKey: ["limitOrdersWithTrades", address],
    queryFn: () => getLimitOrdersWithTradesImpl(address),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
