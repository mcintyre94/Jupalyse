import { Address } from "@solana/web3.js";
import {
  Deposit,
  FetchedTokenPriceKey,
  FetchedTokenPrices,
  StringifiedNumber,
  Timestamp,
  TokenPricesToFetch,
  Trade,
} from "./types";

export function getTokenPricesToFetch(
  events: (Trade | Deposit)[],
): TokenPricesToFetch {
  const tokenPricesToFetch: TokenPricesToFetch = {};

  for (const event of events) {
    const { inputMint, date } = event;
    const timestamp = Math.floor(date.getTime() / 1000);

    tokenPricesToFetch[inputMint] ||= [];
    tokenPricesToFetch[inputMint].push(timestamp);

    if (event.kind === "trade") {
      const { outputMint } = event;
      tokenPricesToFetch[outputMint] ||= [];
      tokenPricesToFetch[outputMint].push(timestamp);
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

      const queryParams = new URLSearchParams({
        address: tokenAddress,
        address_type: "token",
        type: "1m",
        time_from: roundedTimestamp.toString(),
        time_to: roundedTimestamp.toString(),
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
        console.error(
          `Failed to fetch token price for ${tokenAddress} at rounded timestamp ${roundedTimestamp} (requested timestamp: ${timestamp}). Response status: ${response.statusText}`,
        );
        continue;
      }

      const birdeyeHistoryPriceResponse: BirdeyeHistoryPriceResponse =
        await response.json();

      if (
        !birdeyeHistoryPriceResponse.success ||
        birdeyeHistoryPriceResponse.data.items.length === 0
      ) {
        console.error(
          `Failed to fetch token price for ${tokenAddress} at rounded timestamp ${roundedTimestamp} (requested timestamp: ${timestamp}). Response: ${JSON.stringify(birdeyeHistoryPriceResponse)}`,
        );
        continue;
      }

      const price = birdeyeHistoryPriceResponse.data.items[0].value;
      fetchedTokenPrices[key] = price;
    }
  }
  return fetchedTokenPrices;
}
