import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.JUPITER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  // Get addresses query parameter
  const { addresses } = req.query;

  if (!addresses || typeof addresses !== "string") {
    return res
      .status(400)
      .json({ error: "Missing or invalid addresses parameter" });
  }

  try {
    const response = await fetch(
      `https://api.jup.ag/ultra/v1/search?query=${encodeURIComponent(addresses)}`,
      {
        headers: {
          "x-api-key": apiKey,
        },
      },
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Error fetching token data from Jupiter",
      });
    }

    const data = await response.json();

    // Cache token metadata for 24 hours (metadata rarely changes)
    res.setHeader("Cache-Control", "public, max-age=86400");

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch token data",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
