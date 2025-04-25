import {
  Form,
  LoaderFunctionArgs,
  useFetcher,
  useLoaderData,
  useNavigation,
} from "react-router-dom";
import {
  AmountToDisplay,
  Deposit,
  FetchedTokenPriceKey,
  FetchedTokenPrices,
  MintData,
  OrderType,
  RecurringOrderFetchedAccount,
  StringifiedNumber,
  TokenPricesToFetch,
  Trade,
  TriggerOrderFetchedAccount,
} from "../types";
import { Address } from "@solana/web3.js";
import { getMintData } from "../mint-data";
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Checkbox,
  CopyButton,
  Flex,
  Group,
  Image,
  Input,
  Modal,
  rem,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconCopy,
  IconCheck,
  IconArrowsUpDown,
  IconArrowLeft,
  IconArrowsDownUp,
} from "@tabler/icons-react";
import {
  usdAmountDisplay,
  numberDisplay,
  numberDisplayAlreadyAdjustedForDecimals,
} from "../number-display";
import BigDecimal from "js-big-decimal";
import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getRecurringOrdersActive,
  getRecurringOrdersHistory,
  getTriggerOrdersActive,
  getTriggerOrdersHistory,
} from "../jupiter-api";
import { toSvg } from "jdenticon";
import { useDisclosure } from "@mantine/hooks";
import {
  getAlreadyFetchedTokenPrices,
  getTokenPricesToFetch,
  roundTimestampToMinuteBoundary,
} from "../token-prices";

async function getSelectedRecurringOrders(
  userAddress: Address,
  recurringKeys: Address[],
): Promise<RecurringOrderFetchedAccount[]> {
  const recurringOrdersHistory = await getRecurringOrdersHistory(userAddress);
  const recurringOrdersActive = await getRecurringOrdersActive(userAddress);
  const keysSet = new Set(recurringKeys);
  return [...recurringOrdersHistory, ...recurringOrdersActive].filter((order) =>
    keysSet.has(order.orderKey),
  );
}

async function getSelectedTriggerOrders(
  userAddress: Address,
  triggerKeys: Address[],
): Promise<TriggerOrderFetchedAccount[]> {
  const triggerOrdersHistory = await getTriggerOrdersHistory(userAddress);
  const triggerOrdersActive = await getTriggerOrdersActive(userAddress);
  const keysSet = new Set(triggerKeys);
  return [...triggerOrdersHistory, ...triggerOrdersActive].filter((order) =>
    keysSet.has(order.orderKey),
  );
}

function makeDepositsForRecurringOrders(
  orders: RecurringOrderFetchedAccount[],
  userAddress: Address,
): Deposit[] {
  return orders.map((order) => ({
    kind: "deposit",
    date: new Date(order.createdAt),
    inputMint: order.inputMint,
    inputAmount: {
      amount: order.inDeposited,
      adjustedForDecimals: true,
    },
    orderType:
      order.recurringType === "time" ? "recurring time" : "recurring price",
    orderKey: order.orderKey,
    userAddress,
    transactionSignature: order.openTx,
  }));
}

function makeDepositsForTriggerOrders(
  orders: TriggerOrderFetchedAccount[],
  userAddress: Address,
): Deposit[] {
  return orders.map((order) => ({
    kind: "deposit",
    date: new Date(order.createdAt),
    inputMint: order.inputMint,
    inputAmount: {
      amount: order.makingAmount,
      adjustedForDecimals: true,
    },
    orderType: "trigger",
    orderKey: order.orderKey,
    userAddress,
    transactionSignature: order.openTx,
  }));
}

function makeTradesForRecurringOrders(
  orders: RecurringOrderFetchedAccount[],
  userAddress: Address,
): Trade[] {
  return orders.flatMap((order) =>
    order.trades.map((trade) => ({
      kind: "trade",
      date: new Date(trade.confirmedAt),
      inputMint: trade.inputMint,
      outputMint: trade.outputMint,
      inputAmount: {
        amount: trade.inputAmount,
        adjustedForDecimals: true,
      },
      outputAmount: {
        amount: trade.outputAmount,
        adjustedForDecimals: true,
      },
      fee: {
        amount: trade.feeAmount,
        adjustedForDecimals: true,
      },
      orderType:
        order.recurringType === "time" ? "recurring time" : "recurring price",
      orderKey: order.orderKey,
      userAddress,
      transactionSignature: trade.txId,
    })),
  );
}

function makeTradesForTriggerOrders(
  orders: TriggerOrderFetchedAccount[],
  userAddress: Address,
): Trade[] {
  return orders.flatMap((order) =>
    order.trades.map((trade) => ({
      kind: "trade",
      date: new Date(trade.confirmedAt),
      inputMint: trade.inputMint,
      outputMint: trade.outputMint,
      inputAmount: {
        amount: trade.inputAmount,
        adjustedForDecimals: true,
      },
      outputAmount: {
        amount: trade.outputAmount,
        adjustedForDecimals: true,
      },
      fee: {
        amount: trade.feeAmount,
        adjustedForDecimals: true,
      },
      orderType: "trigger",
      orderKey: order.orderKey,
      userAddress,
      transactionSignature: trade.txId,
    })),
  );
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  const userAddress = url.searchParams.get("userAddress") as Address;

  const recurringKeys = [
    ...new Set(url.searchParams.getAll("recurring")),
  ] as Address[];
  const triggerKeys = [
    ...new Set(url.searchParams.getAll("trigger")),
  ] as Address[];

  const recurringOrders = await getSelectedRecurringOrders(
    userAddress,
    recurringKeys,
  );
  const triggerOrders = await getSelectedTriggerOrders(
    userAddress,
    triggerKeys,
  );

  const deposits = [
    ...makeDepositsForRecurringOrders(recurringOrders, userAddress),
    ...makeDepositsForTriggerOrders(triggerOrders, userAddress),
  ];

  const trades = [
    ...makeTradesForRecurringOrders(recurringOrders, userAddress),
    ...makeTradesForTriggerOrders(triggerOrders, userAddress),
  ];

  const uniqueMintAddresses: Address[] = Array.from(
    new Set<Address>(
      trades.flatMap((trade) => [trade.inputMint, trade.outputMint]),
    ),
  );
  const mints = await getMintData(uniqueMintAddresses);

  const events = [...deposits, ...trades].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  const storedBirdeyeApiKey = localStorage.getItem("birdeyeApiKey");

  return {
    recurringKeys,
    triggerKeys,
    userAddress,
    events,
    mints,
    storedBirdeyeApiKey,
  };
}

type DownloadButtonProps = {
  events: (Trade | Deposit)[];
  mints: MintData[];
  userAddress: Address;
  fetchedTokenPrices: FetchedTokenPrices;
};

function DownloadButton({
  events,
  mints,
  userAddress,
  fetchedTokenPrices,
}: DownloadButtonProps) {
  const fetcher = useFetcher();
  const isLoading = fetcher.state === "loading";
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);

  const submit = useCallback(() => {
    fetcher.submit(
      JSON.stringify({
        events,
        mints,
        fetchedTokenPrices,
      }),
      {
        method: "post",
        action: "/trades/csv",
        encType: "application/json",
      },
    );
  }, [events, mints, fetchedTokenPrices]);

  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      const csvContent = fetcher.data as string;

      // Create a Blob with the CSV content
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

      // Create a temporary URL for the Blob
      const downloadUrl = URL.createObjectURL(blob);

      const link = downloadLinkRef.current;
      if (link) {
        link.href = downloadUrl;
        link.download = `${userAddress}-trades.csv`;
        link.click();
        URL.revokeObjectURL(downloadUrl);
      }
    }
  }, [fetcher.data, fetcher.state]);

  return (
    <>
      <Button onClick={submit} loading={isLoading}>
        Download CSV
      </Button>
      <a ref={downloadLinkRef} style={{ display: "none" }}></a>
    </>
  );
}

function DateCell({ date }: { date: Date }) {
  const friendlyDate = date.toLocaleDateString();
  const friendlyTime = date.toLocaleTimeString();
  const timestamp = Math.floor(date.getTime() / 1000);
  return (
    <Flex gap="micro" direction="row" align="center">
      <Text>
        {friendlyDate} {friendlyTime}
      </Text>
      <CopyButton value={timestamp.toString()} timeout={2000}>
        {({ copied, copy }) => (
          <Tooltip
            label={copied ? "Copied" : "Copy timestamp"}
            withArrow
            position="right"
          >
            <ActionIcon
              color={copied ? "teal" : "gray"}
              variant="subtle"
              onClick={copy}
            >
              {copied ? (
                <IconCheck style={{ width: rem(16) }} />
              ) : (
                <IconCopy style={{ width: rem(16) }} />
              )}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Flex>
  );
}

type DottedAnchorLinkProps = {
  href: string;
  children: React.ReactNode;
};

function DottedAnchorLink({ href, children }: DottedAnchorLinkProps) {
  return (
    <Anchor
      href={href}
      target="_blank"
      underline="always"
      style={{ textDecoration: "underline dotted", color: "inherit" }}
    >
      {children}
    </Anchor>
  );
}

function calculateUsdAmount(
  amount: AmountToDisplay,
  tokenPrice: number,
  tokenMintData: MintData | undefined,
): number | undefined {
  const tokenAmountAlreadyAdjustedForDecimals = amount.adjustedForDecimals;

  if (tokenAmountAlreadyAdjustedForDecimals) {
    return tokenPrice * Number(amount.amount);
  }

  if (!tokenMintData) {
    return undefined;
  }

  const tokenAmount = Number(amount.amount) / 10 ** tokenMintData.decimals;
  return tokenPrice * tokenAmount;
}

type UsdAmountProps = {
  amount: number;
};

function UsdAmount({ amount, children }: PropsWithChildren<UsdAmountProps>) {
  const formattedUsdAmount = usdAmountDisplay(amount);

  return (
    <Tooltip position="bottom-start" withArrow label={children} inline>
      <Text size="sm" ta="left" c="dimmed">
        {formattedUsdAmount}
      </Text>
    </Tooltip>
  );
}

type TokenAmountCellProps = {
  address: Address;
  amountToDisplay: {
    amount: StringifiedNumber;
    adjustedForDecimals: boolean;
  };
  tokenMintData: MintData | undefined;
  onNumberClick?: () => void;
  tokenPrice?: number;
};

function TokenAmountCell({
  address,
  amountToDisplay,
  tokenMintData,
  onNumberClick,
  tokenPrice,
}: TokenAmountCellProps) {
  const explorerLink = `https://explorer.solana.com/address/${address}`;
  const { amount, adjustedForDecimals } = amountToDisplay;

  const usdAmount = useMemo(() => {
    return tokenPrice
      ? calculateUsdAmount(amountToDisplay, tokenPrice, tokenMintData)
      : undefined;
  }, [amountToDisplay, tokenPrice, tokenMintData]);

  if (!tokenMintData) {
    return (
      <DottedAnchorLink href={explorerLink}>Unknown Token</DottedAnchorLink>
    );
  }

  const formattedAmount = adjustedForDecimals
    ? numberDisplayAlreadyAdjustedForDecimals(amount)
    : numberDisplay(amount, tokenMintData.decimals);

  const formattedTokenPrice = tokenPrice
    ? usdAmountDisplay(tokenPrice)
    : undefined;

  return (
    <Stack gap={0}>
      <Flex
        gap="micro"
        direction="row"
        // when there is a USD amount we display it underneath, flex-start alignment looks better
        align={usdAmount ? "flex-start" : "center"}
      >
        <Image
          src={tokenMintData.logoURI}
          width={16}
          height={16}
          // when there is a USD amount we use flex-start alignment, need to nudge the image down to align with the text
          mt={usdAmount ? 4 : 0}
        />
        <Stack gap={0}>
          <Text>
            <Text component="span" onClick={onNumberClick}>
              {formattedAmount}
            </Text>{" "}
            <DottedAnchorLink href={explorerLink}>
              {tokenMintData.symbol}
            </DottedAnchorLink>
          </Text>
          {usdAmount ? (
            <UsdAmount amount={usdAmount}>
              <Text size="sm">
                1 {tokenMintData.symbol ? `${tokenMintData.symbol}` : "token"} ={" "}
                {formattedTokenPrice}
              </Text>
            </UsdAmount>
          ) : null}
        </Stack>
        <CopyButton value={address} timeout={2000}>
          {({ copied, copy }) => (
            <Tooltip
              label={copied ? "Copied" : "Copy mint address"}
              withArrow
              position="right"
            >
              <ActionIcon
                color={copied ? "teal" : "gray"}
                variant="subtle"
                onClick={copy}
              >
                {copied ? (
                  <IconCheck style={{ width: rem(16) }} />
                ) : (
                  <IconCopy style={{ width: rem(16) }} />
                )}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Flex>
    </Stack>
  );
}

enum RateType {
  INPUT_PER_OUTPUT,
  OUTPUT_PER_INPUT,
}

function getRates(
  inputAmountToDisplay: AmountToDisplay,
  outputAmountToDisplay: AmountToDisplay,
  inputMintData: MintData,
  outputMintData: MintData,
): {
  rateInputOverOutput: BigDecimal;
  rateOutputOverInput: BigDecimal;
} {
  const { amount: inputAmount, adjustedForDecimals: inputAdjustedForDecimals } =
    inputAmountToDisplay;

  const {
    amount: outputAmount,
    adjustedForDecimals: outputAdjustedForDecimals,
  } = outputAmountToDisplay;

  const inputAmountBigDecimal = inputAdjustedForDecimals
    ? new BigDecimal(inputAmount)
    : new BigDecimal(`${inputAmount}E-${inputMintData.decimals}`);
  const outputAmountBigDecimal = outputAdjustedForDecimals
    ? new BigDecimal(outputAmount)
    : new BigDecimal(`${outputAmount}E-${outputMintData.decimals}`);

  const rateInputOverOutput = inputAmountBigDecimal.divide(
    outputAmountBigDecimal,
    inputMintData.decimals,
  );
  const rateOutputOverInput = outputAmountBigDecimal.divide(
    inputAmountBigDecimal,
    outputMintData.decimals,
  );

  return {
    rateInputOverOutput,
    rateOutputOverInput,
  };
}

type RateCellProps = {
  inputAmountToDisplay: AmountToDisplay;
  outputAmountToDisplay: AmountToDisplay;
  inputMintData: MintData | undefined;
  outputMintData: MintData | undefined;
  rateType: RateType;
  onNumberClick: () => void;
};

function RateCell({
  inputAmountToDisplay,
  outputAmountToDisplay,
  inputMintData,
  outputMintData,
  rateType,
  onNumberClick,
}: RateCellProps) {
  if (!inputMintData || !outputMintData) {
    return <Text>Unknown</Text>;
  }

  const { rateInputOverOutput, rateOutputOverInput } = useMemo(
    () =>
      getRates(
        inputAmountToDisplay,
        outputAmountToDisplay,
        inputMintData,
        outputMintData,
      ),
    [
      inputAmountToDisplay,
      outputAmountToDisplay,
      inputMintData,
      outputMintData,
    ],
  );

  const text = useMemo(() => {
    return rateType === RateType.INPUT_PER_OUTPUT
      ? `${rateInputOverOutput.getPrettyValue()} ${inputMintData.symbol} per ${outputMintData.symbol}`
      : `${rateOutputOverInput.getPrettyValue()} ${outputMintData.symbol} per ${inputMintData.symbol}`;
  }, [
    rateInputOverOutput,
    rateOutputOverInput,
    inputMintData,
    outputMintData,
    rateType,
  ]);

  return <Text onClick={onNumberClick}>{text}</Text>;
}

function TransactionLinkCell({ txId }: { txId: string }) {
  const explorerLink = `https://explorer.solana.com/tx/${txId}`;
  return <DottedAnchorLink href={explorerLink}>View</DottedAnchorLink>;
}

function TransactionEventTypeBadge({
  eventType,
}: {
  eventType: "deposit" | "trade";
}) {
  if (eventType === "deposit") {
    return (
      <Badge size="xs" variant="default" c="green.1">
        Deposit
      </Badge>
    );
  }
  return (
    <Badge size="xs" variant="default" c="blue.1">
      Trade
    </Badge>
  );
}

function TransactionOrderTypeBadge({ orderType }: { orderType: OrderType }) {
  if (orderType === "recurring time") {
    return (
      <Tooltip label="Recurring (Time)">
        <Badge size="xs" variant="light" c="green.1">
          RT
        </Badge>
      </Tooltip>
    );
  }

  if (orderType === "recurring price") {
    return (
      <Tooltip label="Recurring (Price)">
        <Badge size="xs" variant="light" c="blue.1">
          RP
        </Badge>
      </Tooltip>
    );
  }
  if (orderType === "trigger") {
    return (
      <Tooltip label="Trigger">
        <Badge size="xs" variant="light" c="orange.1">
          T
        </Badge>
      </Tooltip>
    );
  }
}

function OrderKeyIcon({ orderKey }: { orderKey: Address }) {
  const size = 24;
  const svg = useMemo(() => toSvg(orderKey, size), [orderKey, size]);
  return <Box w={size} h={size} dangerouslySetInnerHTML={{ __html: svg }} />;
}

type TransactionEventCellProps = {
  orderType: Trade["orderType"];
  orderKey: Address;
};

function TransactionEventCell({
  orderType,
  orderKey,
}: TransactionEventCellProps) {
  return (
    <Group maw={120} justify="space-between">
      <TransactionOrderTypeBadge orderType={orderType} />
      <OrderKeyIcon orderKey={orderKey} />
    </Group>
  );
}

type ChangeDisplayedTradesButtonProps = {
  userAddress: Address;
  recurringKeys: Address[];
  triggerKeys: Address[];
};

function ChangeDisplayedTradesButton({
  userAddress,
  recurringKeys,
  triggerKeys,
}: ChangeDisplayedTradesButtonProps) {
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  return (
    <Form action={`/orders/${userAddress}`}>
      {recurringKeys.map((recurringKey) => (
        <input key={recurringKey} type="hidden" name="o" value={recurringKey} />
      ))}
      {triggerKeys.map((triggerKey) => (
        <input key={triggerKey} type="hidden" name="o" value={triggerKey} />
      ))}

      <Button
        type="submit"
        variant="subtle"
        leftSection={<IconArrowLeft size={14} />}
        loading={isLoading}
      >
        Change displayed trades
      </Button>
    </Form>
  );
}

function adjustOutputAmountForFee(
  outputAmountToDisplay: AmountToDisplay,
  feeToDisplay: AmountToDisplay,
  subtractFee: boolean,
): AmountToDisplay {
  if (subtractFee) {
    return outputAmountToDisplay;
  }

  const {
    amount: outputAmount,
    adjustedForDecimals: outputAdjustedForDecimals,
  } = outputAmountToDisplay;
  const { amount: fee, adjustedForDecimals: feeAdjustedForDecimals } =
    feeToDisplay;

  if (outputAdjustedForDecimals !== feeAdjustedForDecimals) {
    // For now assume that output and fee are either both or neither adjusted for decimals
    throw new Error("Output and fee must have the same adjustedForDecimals");
  }

  // If not subtracting fee, add the fee to the output amount
  if (outputAdjustedForDecimals) {
    return {
      amount: new BigDecimal(outputAmount)
        .add(new BigDecimal(fee))
        .getValue() as StringifiedNumber,
      adjustedForDecimals: true,
    };
  } else {
    return {
      amount: (
        BigInt(outputAmount) + BigInt(fee)
      ).toString() as StringifiedNumber,
      adjustedForDecimals: false,
    };
  }
}

type TradeRowProps = {
  trade: Trade;
  mints: MintData[];
  subtractFee: boolean;
  rateType: RateType;
  switchSubtractFee: () => void;
  switchRateType: () => void;
  tokenPrices: FetchedTokenPrices;
};

function TradeRow({
  trade,
  mints,
  subtractFee,
  rateType,
  switchSubtractFee,
  switchRateType,
  tokenPrices,
}: TradeRowProps) {
  const inputMintData = mints.find((mint) => mint.address === trade.inputMint);
  const outputMintData = mints.find(
    (mint) => mint.address === trade.outputMint,
  );

  const outputAmountWithFee = useMemo(
    () => adjustOutputAmountForFee(trade.outputAmount, trade.fee, subtractFee),
    [trade.outputAmount, trade.fee, subtractFee],
  );

  const inputTokenPrice: number | undefined = useMemo(() => {
    if (!tokenPrices) {
      return undefined;
    }

    return getTokenPrice(tokenPrices, trade.inputMint, trade.date);
  }, [trade, tokenPrices]);

  const outputTokenPrice: number | undefined = useMemo(() => {
    if (!tokenPrices) {
      return undefined;
    }

    return getTokenPrice(tokenPrices, trade.outputMint, trade.date);
  }, [trade, tokenPrices]);

  return (
    <Table.Tr key={trade.transactionSignature}>
      <Table.Td>
        <TransactionEventCell
          orderType={trade.orderType}
          orderKey={trade.orderKey}
        />
      </Table.Td>
      <Table.Td style={{ width: "1%" }}>
        <DateCell date={trade.date} />
      </Table.Td>
      <Table.Td>
        <TransactionEventTypeBadge eventType="trade" />
      </Table.Td>
      <Table.Td>
        <TokenAmountCell
          address={trade.inputMint}
          amountToDisplay={trade.inputAmount}
          tokenMintData={inputMintData}
          tokenPrice={inputTokenPrice}
        />
      </Table.Td>
      <Table.Td>
        <TokenAmountCell
          address={trade.outputMint}
          amountToDisplay={outputAmountWithFee}
          tokenMintData={outputMintData}
          onNumberClick={switchSubtractFee}
          tokenPrice={outputTokenPrice}
        />
      </Table.Td>
      <Table.Td onClick={switchRateType}>
        <RateCell
          inputAmountToDisplay={trade.inputAmount}
          outputAmountToDisplay={trade.outputAmount}
          inputMintData={inputMintData}
          outputMintData={outputMintData}
          rateType={rateType}
          onNumberClick={switchRateType}
        />
      </Table.Td>
      <Table.Td>
        <TransactionLinkCell txId={trade.transactionSignature} />
      </Table.Td>
    </Table.Tr>
  );
}

function getTokenPrice(
  tokenPrices: FetchedTokenPrices,
  mintAddress: Address,
  date: Date,
): number | undefined {
  const timestamp = Math.floor(date.getTime() / 1000);
  const roundedTimestamp = roundTimestampToMinuteBoundary(timestamp);
  const key: FetchedTokenPriceKey = `${mintAddress}-${roundedTimestamp}`;
  return tokenPrices[key];
}

type DepositRowProps = {
  deposit: Deposit;
  mints: MintData[];
  tokenPrices: FetchedTokenPrices;
};

function DepositRow({ deposit, mints, tokenPrices }: DepositRowProps) {
  const inputMintData = mints.find(
    (mint) => mint.address === deposit.inputMint,
  );

  const tokenPrice: number | undefined = useMemo(() => {
    if (!tokenPrices) {
      return undefined;
    }

    return getTokenPrice(tokenPrices, deposit.inputMint, deposit.date);
  }, [deposit, tokenPrices]);

  return (
    <Table.Tr key={deposit.transactionSignature}>
      <Table.Td>
        <TransactionEventCell
          orderType={deposit.orderType}
          orderKey={deposit.orderKey}
        />
      </Table.Td>
      <Table.Td>
        <DateCell date={deposit.date} />
      </Table.Td>
      <Table.Td>
        <TransactionEventTypeBadge eventType="deposit" />
      </Table.Td>
      <Table.Td colSpan={3}>
        <TokenAmountCell
          address={deposit.inputMint}
          amountToDisplay={deposit.inputAmount}
          tokenMintData={inputMintData}
          tokenPrice={tokenPrice}
        />
      </Table.Td>
      <Table.Td>
        <TransactionLinkCell txId={deposit.transactionSignature} />
      </Table.Td>
    </Table.Tr>
  );
}

function TradeCountsTitle({
  recurringKeysCount,
  triggerKeysCount,
  tradesCount,
}: {
  recurringKeysCount: number;
  triggerKeysCount: number;
  tradesCount: number;
}) {
  const counts = [
    recurringKeysCount > 0 && `${recurringKeysCount} Recurring Orders`,
    triggerKeysCount > 0 && `${triggerKeysCount} Triggers`,
  ].filter(Boolean);

  const countsDisplay = counts.reduce((acc, curr, i, arr) => {
    if (i === 0) return curr;
    if (i === arr.length - 1) return `${acc} and ${curr}`;
    return `${acc}, ${curr}`;
  }, "");

  return (
    <Title order={3}>
      Displaying data for {countsDisplay} ({tradesCount} trades)
    </Title>
  );
}

function UsdPricesModal({
  opened,
  onClose,
  tokenPricesToFetch,
  storedBirdeyeApiKey,
}: {
  opened: boolean;
  onClose: () => void;
  tokenPricesToFetch: TokenPricesToFetch;
  storedBirdeyeApiKey: string | null;
}) {
  const fetcher = useFetcher();

  // Close after fetcher is done
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      onClose();
    }
  }, [fetcher.state, fetcher.data, onClose]);

  const estimatedRequests = Object.values(tokenPricesToFetch).flat().length;
  // Birdeye rate limits us to 100 requests per minute
  const estimatedTimeMinutes = Math.ceil(estimatedRequests / 100);

  return (
    <Modal opened={opened} onClose={onClose} title="Include USD prices">
      <fetcher.Form method="POST" action="/trades/fetch-usd-prices">
        <Input
          type="hidden"
          name="tokenPricesToFetch"
          value={JSON.stringify(tokenPricesToFetch)}
        />
        <Stack gap="md" align="flex-start">
          <TextInput
            label={
              <Text span>
                Your{" "}
                <DottedAnchorLink href="https://bds.birdeye.so/">
                  Birdeye
                </DottedAnchorLink>{" "}
                API key
              </Text>
            }
            description="Only used to fetch token prices. Never sent anywhere else"
            name="birdeyeApiKey"
            required
            autoComplete="off"
            defaultValue={storedBirdeyeApiKey ?? undefined}
          />

          <Checkbox
            label="Remember API key"
            name="rememberApiKey"
            description="The API key will be stored in your browser"
            defaultChecked={storedBirdeyeApiKey ? true : false}
          />

          <Stack gap="micro">
            <Button
              maw="fit-content"
              size="md"
              type="submit"
              loading={fetcher.state !== "idle"}
            >
              Fetch USD prices
            </Button>
            <Text size="sm" c="dimmed">
              Approx {estimatedRequests} prices to fetch
              {estimatedTimeMinutes > 1 &&
                ` (estimated time: ${estimatedTimeMinutes} minute${
                  estimatedTimeMinutes > 1 ? "s" : ""
                })`}
            </Text>
          </Stack>
        </Stack>
      </fetcher.Form>
    </Modal>
  );
}

// 1. Get the already fetched token prices from the query cache
// 2. Find which token prices are missing
// 3. Fetch them when the modal form is submitted

export default function Trades() {
  const {
    recurringKeys,
    triggerKeys,
    userAddress,
    events,
    mints,
    storedBirdeyeApiKey,
  } = useLoaderData() as Awaited<ReturnType<typeof loader>>;

  const [rateType, setRateType] = useState<RateType>(RateType.OUTPUT_PER_INPUT);
  const switchRateType = useCallback(() => {
    setRateType(
      rateType === RateType.INPUT_PER_OUTPUT
        ? RateType.OUTPUT_PER_INPUT
        : RateType.INPUT_PER_OUTPUT,
    );
  }, [rateType]);

  const [subtractFee, setSubtractFee] = useState(true);

  const [
    usdPricesModalOpened,
    { open: openUsdPricesModal, close: closeUsdPricesModal },
  ] = useDisclosure(false);

  // Intentionally not memoized so that it updates when we fetch more token prices
  const alreadyFetchedTokenPrices = getAlreadyFetchedTokenPrices(events);

  const tokenPricesToFetch = useMemo(
    () => getTokenPricesToFetch(events, alreadyFetchedTokenPrices),
    [events, alreadyFetchedTokenPrices],
  );

  console.log({ alreadyFetchedTokenPrices, tokenPricesToFetch });

  const amountOfTokenPricesAlreadyFetched = Object.values(
    alreadyFetchedTokenPrices,
  ).flat().length;
  const hasAlreadyFetchedAnyTokenPrices = amountOfTokenPricesAlreadyFetched > 0;
  const amountOfTokenPricesMissing =
    Object.values(tokenPricesToFetch).flat().length;
  const [showUsdPrices, setShowUsdPrices] = useState(
    hasAlreadyFetchedAnyTokenPrices,
  );

  if (recurringKeys.length === 0 && triggerKeys.length === 0) {
    return (
      <Stack gap="md">
        <Group>
          <ChangeDisplayedTradesButton
            userAddress={userAddress}
            recurringKeys={recurringKeys}
            triggerKeys={triggerKeys}
          />
          <Title order={3}>No trades selected</Title>
        </Group>
      </Stack>
    );
  }

  const trades = events.filter((event) => event.kind === "trade") as Trade[];

  return (
    <>
      <UsdPricesModal
        opened={usdPricesModalOpened}
        onClose={closeUsdPricesModal}
        tokenPricesToFetch={tokenPricesToFetch}
        storedBirdeyeApiKey={storedBirdeyeApiKey}
      />

      <Stack gap="md">
        <Group justify="space-between">
          <ChangeDisplayedTradesButton
            userAddress={userAddress}
            recurringKeys={recurringKeys}
            triggerKeys={triggerKeys}
          />
          <TradeCountsTitle
            recurringKeysCount={recurringKeys.length}
            triggerKeysCount={triggerKeys.length}
            tradesCount={trades.length}
          />
          <Group gap="lg">
            <Switch
              checked={showUsdPrices}
              onChange={() => setShowUsdPrices(!showUsdPrices)}
              label={
                <div>
                  Show USD prices
                  <br />({amountOfTokenPricesAlreadyFetched} fetched)
                </div>
              }
            />

            {amountOfTokenPricesMissing > 0 ? (
              <Button variant="outline" onClick={openUsdPricesModal}>
                Fetch USD prices
                <br />({amountOfTokenPricesMissing} Missing)
              </Button>
            ) : (
              <Button variant="outline" disabled>
                All USD prices fetched!
              </Button>
            )}

            <DownloadButton
              events={events}
              mints={mints}
              userAddress={userAddress}
              fetchedTokenPrices={alreadyFetchedTokenPrices}
            />
          </Group>
        </Group>

        <Table stickyHeader horizontalSpacing="lg">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Order</Table.Th>
              <Table.Th>Date</Table.Th>
              <Table.Th>Action</Table.Th>
              <Table.Th>Amount</Table.Th>
              <Table.Th>
                <Group gap="xl">
                  <Text fw={700}>For</Text>
                  <Switch
                    checked={subtractFee}
                    onChange={() => setSubtractFee(!subtractFee)}
                    label="Subtract fee"
                    styles={{
                      label: {
                        fontWeight: "normal",
                      },
                    }}
                  />
                </Group>
              </Table.Th>
              <Table.Th>
                <Group gap="micro">
                  <Text>Rate</Text>
                  <ActionIcon
                    color="gray"
                    size="sm"
                    onClick={switchRateType}
                    variant="subtle"
                    aria-label="Switch rate type"
                  >
                    {rateType === RateType.OUTPUT_PER_INPUT ? (
                      <IconArrowsUpDown
                        style={{ width: "70%", height: "70%" }}
                        stroke={1.5}
                      />
                    ) : (
                      <IconArrowsDownUp
                        style={{ width: "70%", height: "70%" }}
                        stroke={1.5}
                      />
                    )}
                  </ActionIcon>
                </Group>
              </Table.Th>
              <Table.Th>Transaction</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {events.map((event) => {
              if (event.kind === "trade") {
                return (
                  <TradeRow
                    key={event.transactionSignature}
                    trade={event}
                    mints={mints}
                    subtractFee={subtractFee}
                    rateType={rateType}
                    switchSubtractFee={() => setSubtractFee(!subtractFee)}
                    switchRateType={switchRateType}
                    tokenPrices={showUsdPrices ? alreadyFetchedTokenPrices : {}}
                  />
                );
              } else {
                return (
                  <DepositRow
                    key={event.transactionSignature}
                    deposit={event}
                    mints={mints}
                    tokenPrices={showUsdPrices ? alreadyFetchedTokenPrices : {}}
                  />
                );
              }
            })}
          </Table.Tbody>
        </Table>
      </Stack>
    </>
  );
}

// TODO: add USD prices to CSV!
