import { Address } from "@solana/web3.js";
import { JupiterTokenResponse, MintData } from "./types";

export async function getMintData(addresses: Address[]): Promise<MintData[]> {
  if (addresses.length === 0) {
    return [];
  }

  // Split addresses into chunks of 100 (Jupiter API limit)
  const chunks: Address[][] = [];
  for (let i = 0; i < addresses.length; i += 100) {
    chunks.push(addresses.slice(i, i + 100));
  }

  // Process each chunk sequentially to avoid rate limiting
  const allResults: MintData[] = [];

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

    // Map Jupiter response to MintData format
    const mintData = jupiterTokens.map((token) => ({
      address: token.id,
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
      logoURI: token.icon || "",
      isVerified: token.isVerified,
    }));

    allResults.push(...mintData);
  }

  return allResults;
}
