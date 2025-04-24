import { Address } from "@solana/web3.js";
import {
  DCAStatus,
  FetchDCAsResponse,
  ValueAverageStatus,
  FetchValueAveragesResponse,
  TriggerFetchedAccount,
  LimitOrderOrdersResponse,
  DCAFetchedAccount,
  ValueAverageFetchedAccount,
  RecurringOrderFetchedAccount,
  RecurringOrdersResponse,
} from "./types";
import { queryClient } from "./query-client";

async function getClosedDCAsImpl(
  address: Address,
): Promise<DCAFetchedAccount[]> {
  const response = await fetch(
    `https://dca-api.jup.ag/user/${address}?status=${DCAStatus.CLOSED}`,
  );
  const data = (await response.json()) as FetchDCAsResponse;
  if (!data.ok) {
    throw new Error("Error fetching closed DCAs from Jupiter");
  }
  return data.data.dcaAccounts;
}

export async function getClosedDCAs(
  address: Address,
): Promise<DCAFetchedAccount[]> {
  return queryClient.fetchQuery({
    queryKey: ["closedDCAs", address],
    queryFn: () => getClosedDCAsImpl(address),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

async function getRecurringOrdersHistoryImpl(
  address: Address,
): Promise<RecurringOrderFetchedAccount[]> {
  // Note that this API is paginated
  let page = 1;
  let totalPages = 1;
  const orders: RecurringOrderFetchedAccount[] = [];

  while (page <= totalPages) {
    const response = await fetch(
      `https://lite-api.jup.ag/recurring/v1/getRecurringOrders?user=${address}&orderStatus=history&recurringType=all&includeFailedTx=false&page=${page}`,
    );
    if (response.status >= 400) {
      throw new Error("Error fetching past recurring orders from Jupiter");
    }
    const data = (await response.json()) as RecurringOrdersResponse;
    orders.push(...data.all);
    totalPages = data.totalPages;
    page += 1;
  }
  return orders;
}

export async function getRecurringOrdersHistory(
  address: Address,
): Promise<RecurringOrderFetchedAccount[]> {
  return queryClient.fetchQuery({
    queryKey: ["recurringOrdersHistory", address],
    queryFn: () => getRecurringOrdersHistoryImpl(address),
  });
}
async function getOpenDCAsImpl(address: Address): Promise<DCAFetchedAccount[]> {
  const response = await fetch(
    `https://dca-api.jup.ag/user/${address}?status=${DCAStatus.OPEN}`,
  );
  const data = (await response.json()) as FetchDCAsResponse;
  if (!data.ok) {
    throw new Error("Error fetching open DCAs from Jupiter");
  }
  return data.data.dcaAccounts;
}

export async function getOpenDCAs(
  address: Address,
): Promise<DCAFetchedAccount[]> {
  return queryClient.fetchQuery({
    queryKey: ["openDCAs", address],
    queryFn: () => getOpenDCAsImpl(address),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

async function getClosedValueAveragesImpl(
  address: Address,
): Promise<ValueAverageFetchedAccount[]> {
  const response = await fetch(
    `https://va.jup.ag/value-averages?user=${address}&status=${ValueAverageStatus.CLOSED}`,
  );
  const data = (await response.json()) as FetchValueAveragesResponse;
  if (!data.ok) {
    throw new Error("Error fetching closed value averages from Jupiter");
  }
  return data.data.valueAverageAccounts;
}

export async function getClosedValueAverages(
  address: Address,
): Promise<ValueAverageFetchedAccount[]> {
  return queryClient.fetchQuery({
    queryKey: ["closedValueAverages", address],
    queryFn: () => getClosedValueAveragesImpl(address),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

async function getOpenValueAveragesImpl(
  address: Address,
): Promise<ValueAverageFetchedAccount[]> {
  const response = await fetch(
    `https://va.jup.ag/value-averages?user=${address}&status=${ValueAverageStatus.OPEN}`,
  );
  const data = (await response.json()) as FetchValueAveragesResponse;
  if (!data.ok) {
    throw new Error("Error fetching open value averages from Jupiter");
  }
  return data.data.valueAverageAccounts;
}

export async function getOpenValueAverages(
  address: Address,
): Promise<ValueAverageFetchedAccount[]> {
  return queryClient.fetchQuery({
    queryKey: ["openValueAverages", address],
    queryFn: () => getOpenValueAveragesImpl(address),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

async function getClosedTriggersImpl(
  address: Address,
): Promise<TriggerFetchedAccount[]> {
  // Note that this API is paginated
  let page = 1;
  let totalPages = 1;
  const orders: TriggerFetchedAccount[] = [];

  while (page <= totalPages) {
    const response = await fetch(
      `https://api.jup.ag/trigger/v1/orderHistory?wallet=${address}&page=${page}`,
    );
    if (response.status >= 400) {
      throw new Error("Error fetching closed trigger orders from Jupiter");
    }
    const data = (await response.json()) as LimitOrderOrdersResponse;
    orders.push(...data.orders.filter((order) => order.trades.length > 0));
    totalPages = data.totalPages;
    page += 1;
  }
  return orders;
}

export async function getClosedTriggers(
  address: Address,
): Promise<TriggerFetchedAccount[]> {
  return queryClient.fetchQuery({
    queryKey: ["closedTriggers", address],
    queryFn: () => getClosedTriggersImpl(address),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

async function getOpenTriggersImpl(
  address: Address,
): Promise<TriggerFetchedAccount[]> {
  // Note that this API is paginated
  let page = 1;
  let totalPages = 1;
  const orders: TriggerFetchedAccount[] = [];

  while (page <= totalPages) {
    const response = await fetch(
      `https://api.jup.ag/trigger/v1/openOrders?responseV2=1&wallet=${address}&page=${page}`,
    );
    if (response.status >= 400) {
      throw new Error("Error fetching open trigger orders from Jupiter");
    }
    const data = (await response.json()) as LimitOrderOrdersResponse;
    orders.push(...data.orders.filter((order) => order.trades.length > 0));
    totalPages = data.totalPages;
    page += 1;
  }
  return orders;
}

export async function getOpenTriggers(
  address: Address,
): Promise<TriggerFetchedAccount[]> {
  return queryClient.fetchQuery({
    queryKey: ["openTriggers", address],
    queryFn: () => getOpenTriggersImpl(address),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
