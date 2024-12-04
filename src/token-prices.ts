import { Address } from "@solana/web3.js";
import {
  Deposit,
  FetchedTokenPriceKey,
  FetchedTokenPrices,
  Timestamp,
  TokenPricesToFetch,
  Trade,
} from "./types";
import { queryClient } from "./query-client";

export function getAlreadyFetchedTokenPrices(
  events: (Trade | Deposit)[],
): FetchedTokenPrices {
  const relevantKeys = new Set<FetchedTokenPriceKey>();

  for (const event of events) {
    const { inputMint, date } = event;
    const timestamp = Math.floor(date.getTime() / 1000);
    const roundedTimestamp = roundTimestampToMinuteBoundary(timestamp);
    const inputKey: FetchedTokenPriceKey = `${inputMint}-${roundedTimestamp}`;
    relevantKeys.add(inputKey);

    if (event.kind === "trade") {
      const { outputMint } = event;
      const outputKey: FetchedTokenPriceKey = `${outputMint}-${roundedTimestamp}`;
      relevantKeys.add(outputKey);
    }
  }

  const fetchedTokenPrices: FetchedTokenPrices = {};

  const cachedTokenPrices = queryClient.getQueryCache().findAll({
    queryKey: ["tokenPrices"],
  });

  for (const cachedTokenPrice of cachedTokenPrices) {
    if (typeof cachedTokenPrice.state.data !== "number") {
      continue;
    }

    const [, tokenAddress, timestamp] = cachedTokenPrice.queryKey;
    const key: FetchedTokenPriceKey = `${tokenAddress as Address}-${timestamp as Timestamp}`;
    if (!relevantKeys.has(key)) {
      continue;
    }

    fetchedTokenPrices[key] = cachedTokenPrice.state.data;
  }

  return fetchedTokenPrices;
}

export function getTokenPricesToFetch(
  events: (Trade | Deposit)[],
  alreadyFetchedTokenPrices: FetchedTokenPrices,
): TokenPricesToFetch {
  const tokenPricesToFetch: TokenPricesToFetch = {};

  for (const event of events) {
    const { inputMint, date } = event;
    const timestamp = Math.floor(date.getTime() / 1000);
    const roundedTimestamp = roundTimestampToMinuteBoundary(timestamp);

    if (!alreadyFetchedTokenPrices[`${inputMint}-${roundedTimestamp}`]) {
      tokenPricesToFetch[inputMint] ||= [];
      tokenPricesToFetch[inputMint].push(timestamp);
    }

    if (event.kind === "trade") {
      const { outputMint } = event;

      if (!alreadyFetchedTokenPrices[`${outputMint}-${roundedTimestamp}`]) {
        tokenPricesToFetch[outputMint] ||= [];
        tokenPricesToFetch[outputMint].push(timestamp);
      }
    }
  }

  return tokenPricesToFetch;
}

type BirdeyeHistoryPriceResponse = {
  success: boolean;
  data: {
    items: {
      address: Address;
      unixTime: Timestamp;
      value: number;
    }[];
  };
};

export function roundTimestampToMinuteBoundary(
  timestamp: Timestamp,
): Timestamp {
  return timestamp - (timestamp % 60);
}

async function fetchTokenPriceAtTimestampImpl(
  tokenAddress: Address,
  timestamp: Timestamp,
  birdeyeApiKey: string,
  abortSignal: AbortSignal,
): Promise<number> {
  const timestampString = timestamp.toString();

  const queryParams = new URLSearchParams({
    address: tokenAddress,
    address_type: "token",
    type: "1m",
    time_from: timestampString,
    time_to: timestampString,
  });

  const url = `https://public-api.birdeye.so/defi/history_price?${queryParams.toString()}`;
  let response = await fetch(url, {
    headers: {
      "X-API-KEY": birdeyeApiKey,
      "x-chain": "solana",
    },
    signal: abortSignal,
  });

  if (response.status === 429) {
    // Note that currently the x-ratelimit-reset header is not exposed to cors requests
    // therefore we can't use it to optimise our wait
    // we know they rate limit at 100 requests per minute
    // so we just wait 1 minute before retrying
    const waitTimeMs = 60 * 1000;

    console.log(
      `Birdeye rate limit exceeded. Waiting ${waitTimeMs / 1000}s before retrying.`,
    );

    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(resolve, waitTimeMs);
      // If aborted during wait, clear timeout and reject
      abortSignal?.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        reject(new Error("Aborted"));
      });
    });

    // retry the request
    // If it fails again, we'll just handle it as an error
    response = await fetch(url, {
      headers: {
        "X-API-KEY": birdeyeApiKey,
        "x-chain": "solana",
      },
      signal: abortSignal,
    });
  }

  if (!(response.status === 200)) {
    throw new Error(
      `Failed to fetch token price for ${tokenAddress} at rounded timestamp ${timestampString} (requested timestamp: ${timestampString}). Response status: ${response.statusText}`,
    );
  }

  const birdeyeHistoryPriceResponse: BirdeyeHistoryPriceResponse =
    await response.json();

  if (
    !birdeyeHistoryPriceResponse.success ||
    birdeyeHistoryPriceResponse.data.items.length === 0
  ) {
    throw new Error(
      `Failed to fetch token price for ${tokenAddress} at rounded timestamp ${timestampString} (requested timestamp: ${timestampString}). Response: ${JSON.stringify(birdeyeHistoryPriceResponse)}`,
    );
  }

  return birdeyeHistoryPriceResponse.data.items[0].value;
}

async function fetchTokenPriceAtTimestamp(
  tokenAddress: Address,
  timestamp: Timestamp,
  birdeyeApiKey: string,
  abortSignal: AbortSignal,
) {
  return queryClient.ensureQueryData({
    queryKey: ["tokenPrices", tokenAddress, timestamp],
    queryFn: () =>
      fetchTokenPriceAtTimestampImpl(
        tokenAddress,
        timestamp,
        birdeyeApiKey,
        abortSignal,
      ),
    // keep historic token prices cached indefinitely, since they won't change
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export async function fetchTokenPrices(
  tokenPricesToFetch: TokenPricesToFetch,
  birdeyeApiKey: string,
  abortSignal: AbortSignal,
): Promise<FetchedTokenPrices> {
  const fetchedTokenPrices: FetchedTokenPrices = {};

  for (const [tokenAddress, timestamps] of Object.entries(tokenPricesToFetch)) {
    for (const timestamp of timestamps) {
      if (abortSignal.aborted) {
        return fetchedTokenPrices;
      }

      // round to the minute boundary before fetching
      const roundedTimestamp = roundTimestampToMinuteBoundary(timestamp);

      const key: FetchedTokenPriceKey = `${tokenAddress as Address}-${roundedTimestamp as Timestamp}`;
      if (fetchedTokenPrices[key]) continue;

      try {
        const price = await fetchTokenPriceAtTimestamp(
          tokenAddress as Address,
          roundedTimestamp as Timestamp,
          birdeyeApiKey,
          abortSignal,
        );
        fetchedTokenPrices[key] = price;
      } catch (error) {
        console.error(error);
        continue;
      }
    }
  }
  return fetchedTokenPrices;
}
