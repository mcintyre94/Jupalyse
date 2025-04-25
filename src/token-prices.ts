import { Address } from "@solana/web3.js";
import {
  Deposit,
  FetchedTokenPrice,
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
    if (!cachedTokenPrice.state.data) {
      continue;
    }

    const [, tokenAddress, timestamp] = cachedTokenPrice.queryKey;
    const key: FetchedTokenPriceKey = `${tokenAddress as Address}-${timestamp as Timestamp}`;
    if (!relevantKeys.has(key)) {
      continue;
    }

    fetchedTokenPrices[key] = cachedTokenPrice.state.data as FetchedTokenPrice;
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

async function waitForSeconds(seconds: number, abortSignal: AbortSignal) {
  await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, seconds * 1000);
    // If aborted during wait, clear timeout and reject
    abortSignal?.addEventListener("abort", () => {
      clearTimeout(timeoutId);
      reject(new Error("Aborted"));
    });
  });
}

async function fetchTokenPriceAtTimestampImpl(
  tokenAddress: Address,
  timestamp: Timestamp,
  birdeyeApiKey: string,
  abortSignal: AbortSignal,
): Promise<FetchedTokenPrice> {
  const timestampString = timestamp.toString();

  const queryParams = new URLSearchParams({
    address: tokenAddress,
    address_type: "token",
    type: "1m",
    time_from: timestampString,
    time_to: timestampString,
  });

  if (abortSignal.aborted) {
    throw new Error("Aborted");
  }

  // rate limit to 1 request per second
  await waitForSeconds(1, abortSignal);

  const url = `https://public-api.birdeye.so/defi/history_price?${queryParams.toString()}`;
  let response = await fetch(url, {
    headers: {
      "X-API-KEY": birdeyeApiKey,
      "x-chain": "solana",
    },
    signal: abortSignal,
  });

  if (response.status === 429) {
    // If we get rate limited, wait an additional 10 seconds before retrying
    const waitTimeSeconds = 10;

    console.log(
      `Birdeye rate limit exceeded. Waiting ${waitTimeSeconds}s before retrying.`,
    );

    await waitForSeconds(waitTimeSeconds, abortSignal);

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

  if (!birdeyeHistoryPriceResponse.success) {
    throw new Error(
      `Failed to fetch token price for ${tokenAddress} at rounded timestamp ${timestampString} (requested timestamp: ${timestampString}). Response: ${JSON.stringify(birdeyeHistoryPriceResponse)}`,
    );
  }

  if (birdeyeHistoryPriceResponse.data.items.length === 0) {
    // Successful response, but no data available
    return "missing";
  }

  return birdeyeHistoryPriceResponse.data.items[0].value;
}

async function fetchTokenPriceAtTimestamp(
  tokenAddress: Address,
  timestamp: Timestamp,
  birdeyeApiKey: string,
  abortSignal: AbortSignal,
): Promise<FetchedTokenPrice> {
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
