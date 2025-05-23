import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Root from "./routes/root";
import HomeRoute, { action as HomeAction } from "./routes/home";
import OrdersRoute, { loader as OrdersLoader } from "./routes/orders";
import TradesRoute, { loader as TradesLoader } from "./routes/trades";
import { action as TradesCsvAction } from "./routes/trades-csv";
import { action as FetchUsdPricesAction } from "./routes/fetch-usd-prices";
import { createTheme, MantineProvider } from "@mantine/core";

import "@mantine/core/styles.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "./query-client";
const router = createBrowserRouter([
  {
    path: "/",
    element: <Root />,
    children: [
      {
        index: true,
        element: <HomeRoute />,
        action: HomeAction,
      },
      {
        path: "/orders/:address",
        element: <OrdersRoute />,
        loader: OrdersLoader,
      },
      {
        path: "/trades",
        element: <TradesRoute />,
        loader: TradesLoader,
      },
      {
        path: "/trades/csv",
        action: TradesCsvAction,
      },
      {
        path: "/trades/fetch-usd-prices",
        action: FetchUsdPricesAction,
      },
    ],
  },
]);

const theme = createTheme({
  spacing: {
    micro: "calc(0.25rem * var(--mantine-scale))",
  },
  fontSizes: {
    h1: "calc(2.125rem * var(--mantine-scale))",
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </MantineProvider>
  </React.StrictMode>,
);
