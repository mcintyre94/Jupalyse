import { Address } from "@solana/web3.js";
import {
  RecurringOrderFetchedAccount,
  RecurringOrdersResponse,
  TriggerOrderFetchedAccount,
  TriggerOrdersResponse,
} from "./types";
import { queryClient } from "./query-client";

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

async function getRecurringOrdersActiveImpl(
  address: Address,
): Promise<RecurringOrderFetchedAccount[]> {
  // Note that this API is paginated
  let page = 1;
  let totalPages = 1;
  const orders: RecurringOrderFetchedAccount[] = [];

  while (page <= totalPages) {
    const response = await fetch(
      `https://lite-api.jup.ag/recurring/v1/getRecurringOrders?user=${address}&orderStatus=active&recurringType=all&includeFailedTx=false&page=${page}`,
    );
    if (response.status >= 400) {
      throw new Error("Error fetching active recurring orders from Jupiter");
    }
    const data = (await response.json()) as RecurringOrdersResponse;
    orders.push(...data.all);
    totalPages = data.totalPages;
    page += 1;
  }
  return orders;
}

export async function getRecurringOrdersActive(
  address: Address,
): Promise<RecurringOrderFetchedAccount[]> {
  return queryClient.fetchQuery({
    queryKey: ["recurringOrdersActive", address],
    queryFn: () => getRecurringOrdersActiveImpl(address),
  });
}

async function getTriggerOrdersHistoryImpl(
  address: Address,
): Promise<TriggerOrderFetchedAccount[]> {
  // Note that this API is paginated
  let page = 1;
  let totalPages = 1;
  const orders: TriggerOrderFetchedAccount[] = [];

  while (page <= totalPages) {
    const response = await fetch(
      `https://lite-api.jup.ag/trigger/v1/getTriggerOrders?user=${address}&orderStatus=history&page=${page}`,
    );
    if (response.status >= 400) {
      throw new Error("Error fetching past trigger orders from Jupiter");
    }
    const data = (await response.json()) as TriggerOrdersResponse;
    orders.push(...data.orders.filter((order) => order.trades.length > 0));
    totalPages = data.totalPages;
    page += 1;
  }
  return orders;
}

export async function getTriggerOrdersHistory(
  address: Address,
): Promise<TriggerOrderFetchedAccount[]> {
  return queryClient.fetchQuery({
    queryKey: ["triggerOrdersHistory", address],
    queryFn: () => getTriggerOrdersHistoryImpl(address),
  });
}

async function getTriggerOrdersActiveImpl(
  address: Address,
): Promise<TriggerOrderFetchedAccount[]> {
  // Note that this API is paginated
  let page = 1;
  let totalPages = 1;
  const orders: TriggerOrderFetchedAccount[] = [];

  while (page <= totalPages) {
    const response = await fetch(
      `https://lite-api.jup.ag/trigger/v1/getTriggerOrders?user=${address}&orderStatus=active&page=${page}`,
    );
    if (response.status >= 400) {
      throw new Error("Error fetching active trigger orders from Jupiter");
    }
    const data = (await response.json()) as TriggerOrdersResponse;
    orders.push(...data.orders.filter((order) => order.trades.length > 0));
    totalPages = data.totalPages;
    page += 1;
  }
  return orders;
}

export async function getTriggerOrdersActive(
  address: Address,
): Promise<TriggerOrderFetchedAccount[]> {
  return queryClient.fetchQuery({
    queryKey: ["triggerOrdersActive", address],
    queryFn: () => getTriggerOrdersActiveImpl(address),
  });
}
