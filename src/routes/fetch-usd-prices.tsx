import { ActionFunctionArgs } from "react-router-dom";
import { fetchTokenPrices } from "../token-prices";
import { TokenPricesToFetch } from "../types";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const birdeyeApiKey = formData.get("birdeyeApiKey")?.toString();
  const rememberApiKeyValue = formData.get("rememberApiKey")?.toString();
  const rememberApiKey = rememberApiKeyValue === "on";

  if (!birdeyeApiKey) {
    throw new Error("Birdeye API key is required");
  }

  const tokenPricesToFetchField = formData.get("tokenPricesToFetch");

  if (!tokenPricesToFetchField) {
    throw new Error("Token prices to fetch is required");
  }

  const tokenPricesToFetch = JSON.parse(
    tokenPricesToFetchField.toString(),
  ) as TokenPricesToFetch;

  const tokenPrices = await fetchTokenPrices(
    tokenPricesToFetch,
    birdeyeApiKey,
    request.signal,
  );

  if (rememberApiKey) {
    localStorage.setItem("birdeyeApiKey", birdeyeApiKey);
  } else {
    localStorage.removeItem("birdeyeApiKey");
  }

  return tokenPrices;
}
