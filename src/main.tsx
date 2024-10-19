import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Root from "./routes/root";
import HomeRoute, { action as HomeAction } from "./routes/home";
import DCAsRoute, { loader as DCAsLoader, action as DCAsAction } from "./routes/dcas";
import TradesRoute, { loader as TradesLoader } from "./routes/trades";
import { action as TradesCsvAction } from "./routes/trades-csv";
import { createTheme, MantineProvider } from "@mantine/core";

import "@mantine/core/styles.css";

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
        path: "/dcas/:address",
        element: <DCAsRoute />,
        loader: DCAsLoader,
        action: DCAsAction,
      },
      {
        path: "/trades",
        element: <TradesRoute />,
        loader: TradesLoader,
      },
      {
        path: "/trades/csv",
        action: TradesCsvAction,
      }
    ],
  },
]);

const theme = createTheme({
  spacing: {
    micro: "calc(0.25rem * var(--mantine-scale))",
  },
  fontSizes: {
    'h1': "calc(2.125rem * var(--mantine-scale))",
  }
})

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <RouterProvider router={router} />
    </MantineProvider>
  </React.StrictMode>
);
