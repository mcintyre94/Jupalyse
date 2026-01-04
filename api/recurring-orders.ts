import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.JUPITER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  // Forward all query params to Jupiter API
  const { user, orderStatus, recurringType, includeFailedTx, page } = req.query;

  const params = new URLSearchParams({
    user: user as string,
    orderStatus: orderStatus as string,
    recurringType: recurringType as string,
    includeFailedTx: includeFailedTx as string,
    page: page as string,
  });

  try {
    const response = await fetch(
      `https://api.jup.ag/recurring/v1/getRecurringOrders?${params}`,
      {
        headers: {
          "x-api-key": apiKey,
        },
      },
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Error fetching recurring orders from Jupiter",
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch recurring orders",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
