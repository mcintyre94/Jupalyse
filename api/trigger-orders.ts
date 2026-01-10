import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.JUPITER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  // Forward all query params to Jupiter API
  const { user, orderStatus, page } = req.query;

  const params = new URLSearchParams({
    user: user as string,
    orderStatus: orderStatus as string,
    page: page as string,
  });

  try {
    const response = await fetch(
      `https://api.jup.ag/trigger/v1/getTriggerOrders?${params}`,
      {
        headers: {
          "x-api-key": apiKey,
        },
      },
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Error fetching trigger orders from Jupiter",
      });
    }

    const data = await response.json();

    // Set cache headers based on order status
    // Historical orders never change, so cache them indefinitely
    // Active orders change frequently, so cache for 5 minutes
    if (orderStatus === "history") {
      res.setHeader("Cache-Control", "public, immutable, max-age=31536000");
    } else if (orderStatus === "active") {
      res.setHeader("Cache-Control", "public, max-age=300");
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch trigger orders",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
