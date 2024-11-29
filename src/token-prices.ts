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

export async function fetchTokenPrices(
  tokenPricesToFetch: TokenPricesToFetch,
  birdeyeApiKey: string,
): Promise<FetchedTokenPrices> {
  const fetchedTokenPrices: FetchedTokenPrices = {};

  for (const [tokenAddress, timestamps] of Object.entries(tokenPricesToFetch)) {
    for (const timestamp of timestamps) {
      // round to the minute boundary before fetching
      const roundedTimestamp = timestamp - (timestamp % 60);

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

      const response = await fetch(url, {
        headers: {
          "X-API-KEY": birdeyeApiKey,
          "x-chain": "solana",
        },
      });

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
        return {};
      }

      const price = birdeyeHistoryPriceResponse.data.items[0].value;
      fetchedTokenPrices[key] = {
        amount: price.toString() as StringifiedNumber,
        adjustedForDecimals: true,
      };
    }
  }
  return fetchedTokenPrices;
}
