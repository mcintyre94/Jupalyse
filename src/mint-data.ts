import { Address } from "@solana/web3.js";
import { JupiterTokenResponse, MintData } from "./types";
import { queryClient } from "./query-client";

export async function getMintData(addresses: Address[]): Promise<MintData[]> {
  if (addresses.length === 0) {
    return [];
  }

  // Check cache for each address and collect uncached addresses
  const cachedResults: MintData[] = [];
  const uncachedAddresses: Address[] = [];

  for (const address of addresses) {
    const cachedData = queryClient.getQueryData<MintData>([
      "tokenMetadata",
      address,
    ]);
    if (cachedData) {
      cachedResults.push(cachedData);
    } else {
      uncachedAddresses.push(address);
    }
  }

  // If all addresses are cached, return immediately
  if (uncachedAddresses.length === 0) {
    return cachedResults;
  }

  // Split uncached addresses into chunks of 100 (Jupiter API limit)
  const chunks: Address[][] = [];
  for (let i = 0; i < uncachedAddresses.length; i += 100) {
    chunks.push(uncachedAddresses.slice(i, i + 100));
  }

  // Process each chunk sequentially to avoid rate limiting
  const newlyFetchedResults: MintData[] = [];

  for (const chunk of chunks) {
    const queryString = chunk.join(",");
    const response = await fetch(
      `/api/token-search?addresses=${encodeURIComponent(queryString)}`,
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch token data: ${response.status} ${response.statusText}`,
      );
    }

    const jupiterTokens = (await response.json()) as JupiterTokenResponse[];

    // Map Jupiter response to MintData format and store each token in cache
    const mintData = jupiterTokens.map((token) => {
      const tokenData: MintData = {
        address: token.id,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        logoURI: token.icon || "",
        isVerified: token.isVerified,
      };

      // Store in cache with 24 hour stale time
      queryClient.setQueryData(["tokenMetadata", token.id], tokenData, {
        updatedAt: Date.now(),
      });

      return tokenData;
    });

    newlyFetchedResults.push(...mintData);
  }

  // Return all results (cached + newly fetched)
  return [...cachedResults, ...newlyFetchedResults];
}
