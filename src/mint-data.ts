import { Address } from "@solana/web3.js";
import { FetchMintsResponse, MintData } from "./types";

export async function getMintData(addresses: Address[]) {
  if (addresses.length === 0) {
    return [];
  }

  const url = "https://token-list-api.solana.cloud/v1/mints?chainId=101";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      addresses,
    }),
  });

  const data = (await response.json()) as FetchMintsResponse;

  const fetchedMints = data.content.map((item) => item.address);
  const missingMints = addresses.filter(
    (address) => !fetchedMints.includes(address),
  );

  if (missingMints.length > 0) {
    // use Jup token list to fetch missing mints
    // Jup has a low rate limit so use as fallback
    const jupFallbackData = await Promise.all(
      missingMints.map(async (address) => {
        const response = await fetch(`https://tokens.jup.ag/token/${address}`);
        // Jup returns the same structure
        const mintData = (await response.json()) as MintData;
        return mintData;
      }),
    );

    return [...data.content, ...jupFallbackData];
  }

  return data.content;
}
