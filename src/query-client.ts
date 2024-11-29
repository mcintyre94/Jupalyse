import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/query-persist-client-core";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

export const queryClient = new QueryClient();
queryClient.setDefaultOptions({
  queries: {
    staleTime: 1000 * 60 * 5, // 5 minutes
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "react-query-cache",
});

persistQueryClient({
  queryClient,
  persister,
});
