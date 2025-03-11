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
  FetchDCAFillsResponse,
  FetchedTokenPriceKey,
  FetchedTokenPrices,
  FetchValueAverageFillsResponse,
  MintData,
  StrategyType,
  StringifiedNumber,
  TokenPricesToFetch,
  Trade,
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
  getClosedTriggers,
  getClosedValueAverages,
  getOpenDCAs,
  getOpenTriggers,
  getOpenValueAverages,
} from "../jupiter-api";
import { getClosedDCAs } from "../jupiter-api";
import { toSvg } from "jdenticon";
import { useDisclosure } from "@mantine/hooks";
import {
  getAlreadyFetchedTokenPrices,
  getTokenPricesToFetch,
  roundTimestampToMinuteBoundary,
} from "../token-prices";

async function getDCAFills(dcaKeys: Address[]): Promise<Trade[]> {
  const responses = await Promise.all(
    dcaKeys.map(async (dcaKey) => {
      const response = await fetch(
        `https://dca-api.jup.ag/dca/${dcaKey}/fills`,
      );
      const fillResponse = (await response.json()) as FetchDCAFillsResponse;
      return fillResponse.data.fills;
    }),
  );
  return responses.flat().map((fill) => {
    return {
      kind: "trade",
      date: new Date(fill.confirmedAt * 1000),
      inputMint: fill.inputMint,
      outputMint: fill.outputMint,
      inputAmount: {
        amount: fill.inAmount,
        adjustedForDecimals: false,
      },
      outputAmount: {
        amount: fill.outAmount,
        adjustedForDecimals: false,
      },
      fee: {
        amount: fill.fee,
        adjustedForDecimals: false,
      },
      txSignature: fill.txId,
      strategyType: "dca",
      strategyKey: fill.dcaKey,
      userAddress: fill.userKey,
      transactionSignature: fill.txId,
    };
  });
}

async function getValueAverageFills(
  valueAverageKeys: Address[],
): Promise<Trade[]> {
  const responses = await Promise.all(
    valueAverageKeys.map(async (valueAverageKey) => {
      const response = await fetch(
        `https://va.jup.ag/value-averages/${valueAverageKey}/fills`,
      );
      const fillResponse =
        (await response.json()) as FetchValueAverageFillsResponse;
      return fillResponse.data.fills;
    }),
  );
  return responses.flat().map((fill) => {
    return {
      kind: "trade",
      date: new Date(fill.confirmedAt * 1000),
      inputMint: fill.inputMint,
      outputMint: fill.outputMint,
      inputAmount: {
        amount: fill.inputAmount,
        adjustedForDecimals: false,
      },
      outputAmount: {
        amount: fill.outputAmount,
        adjustedForDecimals: false,
      },
      fee: {
        amount: fill.fee,
        adjustedForDecimals: false,
      },
      txSignature: fill.txSignature,
      strategyType: "value average",
      strategyKey: fill.valueAverageKey,
      userAddress: fill.userKey,
      transactionSignature: fill.txSignature,
    };
  });
}

async function getTriggerOrderTrades(
  userAddress: Address,
  triggerKeys: Address[],
): Promise<Trade[]> {
  // Triggers are fetched by user address, so fetch them all (cached with react-query),
  // then filter to only those selected
  const [closedTriggers, openTriggers] = await Promise.all([
    getClosedTriggers(userAddress),
    getOpenTriggers(userAddress),
  ]);
  const limitOrderKeysSet = new Set(triggerKeys);
  const triggerOrderTrades = [...closedTriggers, ...openTriggers]
    .filter((order) => limitOrderKeysSet.has(order.orderKey))
    .flatMap((order) => order.trades);

  return triggerOrderTrades.map((trade) => ({
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
    strategyType: "trigger",
    strategyKey: trade.orderKey,
    userAddress,
    transactionSignature: trade.txId,
  }));
}

async function getDeposits(
  userAddress: Address,
  dcaKeys: Set<Address>,
  valueAverageKeys: Set<Address>,
  limitOrderKeys: Set<Address>,
): Promise<Deposit[]> {
  const [
    closedDCAs,
    openDCAs,
    closedValueAverages,
    openValueAverages,
    closedTriggers,
    openTriggers,
  ] = await Promise.all([
    dcaKeys.size > 0 ? getClosedDCAs(userAddress) : [],
    dcaKeys.size > 0 ? getOpenDCAs(userAddress) : [],
    valueAverageKeys.size > 0 ? getClosedValueAverages(userAddress) : [],
    valueAverageKeys.size > 0 ? getOpenValueAverages(userAddress) : [],
    limitOrderKeys.size > 0 ? getClosedTriggers(userAddress) : [],
    limitOrderKeys.size > 0 ? getOpenTriggers(userAddress) : [],
  ]);

  const dcas = [...closedDCAs, ...openDCAs].filter((dca) =>
    dcaKeys.has(dca.dcaKey),
  );
  const valueAverages = [...closedValueAverages, ...openValueAverages].filter(
    (va) => valueAverageKeys.has(va.valueAverageKey),
  );
  const limitOrders = [...closedTriggers, ...openTriggers].filter((order) =>
    limitOrderKeys.has(order.orderKey),
  );

  const dcaDeposits: Deposit[] = dcas.map((dca) => ({
    kind: "deposit",
    date: new Date(dca.createdAt),
    inputMint: dca.inputMint,
    inputAmount: {
      amount: dca.inDeposited,
      adjustedForDecimals: false,
    },
    strategyType: "dca",
    strategyKey: dca.dcaKey,
    userAddress: userAddress,
    transactionSignature: dca.openTxHash,
  }));

  const valueAverageDeposits: Deposit[] = valueAverages.map((va) => ({
    kind: "deposit",
    date: new Date(va.createdAt),
    inputMint: va.inputMint,
    inputAmount: {
      amount: va.inDeposited,
      adjustedForDecimals: false,
    },
    strategyType: "value average",
    strategyKey: va.valueAverageKey,
    userAddress: userAddress,
    transactionSignature: va.openTxHash,
  }));

  const limitOrderDeposits: Deposit[] = limitOrders.map((order) => ({
    kind: "deposit",
    date: new Date(order.createdAt),
    inputMint: order.inputMint,
    inputAmount: {
      amount: order.makingAmount,
      adjustedForDecimals: true,
    },
    strategyType: "trigger",
    strategyKey: order.orderKey,
    userAddress: userAddress,
    transactionSignature: order.openTx,
  }));

  return [...dcaDeposits, ...valueAverageDeposits, ...limitOrderDeposits];
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const userAddress = url.searchParams.get("userAddress") as Address;
  const dcaKeys = [...new Set(url.searchParams.getAll("dca"))] as Address[];
  const valueAverageKeys = [
    ...new Set(url.searchParams.getAll("va")),
  ] as Address[];
  const triggerKeys = [
    ...new Set(url.searchParams.getAll("trigger")),
  ] as Address[];

  const [dcaTrades, valueAverageTrades, triggerTrades, deposits] =
    await Promise.all([
      dcaKeys.length > 0 ? getDCAFills(dcaKeys) : [],
      valueAverageKeys.length > 0 ? getValueAverageFills(valueAverageKeys) : [],
      triggerKeys.length > 0
        ? getTriggerOrderTrades(userAddress, triggerKeys)
        : [],
      dcaKeys.length > 0 ||
      valueAverageKeys.length > 0 ||
      triggerKeys.length > 0
        ? getDeposits(
            userAddress,
            new Set(dcaKeys),
            new Set(valueAverageKeys),
            new Set(triggerKeys),
          )
        : [],
    ]);

  const allTrades = [...dcaTrades, ...valueAverageTrades, ...triggerTrades];

  const uniqueMintAddresses: Address[] = Array.from(
    new Set<Address>(
      allTrades.flatMap((fill) => [fill.inputMint, fill.outputMint]),
    ),
  );
  const mints = await getMintData(uniqueMintAddresses);

  const events = [...deposits, ...allTrades].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  const storedBirdeyeApiKey = localStorage.getItem("birdeyeApiKey");

  return {
    dcaKeys,
    valueAverageKeys,
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

function TransactionStrategyBadge({
  strategyType,
}: {
  strategyType: StrategyType;
}) {
  if (strategyType === "dca") {
    return (
      <Badge size="xs" variant="light" c="green.1">
        DCA
      </Badge>
    );
  }

  if (strategyType === "value average") {
    return (
      <Badge size="xs" variant="light" c="blue.1">
        VA
      </Badge>
    );
  }

  return (
    <Badge size="xs" variant="light" c="orange.1">
      TR
    </Badge>
  );
}

function StrategyKeyIcon({ strategyKey }: { strategyKey: Address }) {
  const size = 24;
  const svg = useMemo(() => toSvg(strategyKey, size), [strategyKey, size]);
  return <Box w={size} h={size} dangerouslySetInnerHTML={{ __html: svg }} />;
}

type TransactionEventCellProps = {
  strategyType: StrategyType;
  strategyKey: Address;
};

function TransactionEventCell({
  strategyType,
  strategyKey,
}: TransactionEventCellProps) {
  return (
    <Group maw={120} justify="space-between">
      <TransactionStrategyBadge strategyType={strategyType} />
      <StrategyKeyIcon strategyKey={strategyKey} />
    </Group>
  );
}

type ChangeDisplayedTradesButtonProps = {
  userAddress: Address;
  dcaKeys: Address[];
  valueAverageKeys: Address[];
  triggerKeys: Address[];
};

function ChangeDisplayedTradesButton({
  userAddress,
  dcaKeys,
  valueAverageKeys,
  triggerKeys,
}: ChangeDisplayedTradesButtonProps) {
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  return (
    <Form action={`/strategies/${userAddress}`}>
      {dcaKeys.map((dcaKey) => (
        <input key={dcaKey} type="hidden" name="dca" value={dcaKey} />
      ))}
      {valueAverageKeys.map((vaKey) => (
        <input key={vaKey} type="hidden" name="va" value={vaKey} />
      ))}
      {triggerKeys.map((triggerKey) => (
        <input
          key={triggerKey}
          type="hidden"
          name="trigger"
          value={triggerKey}
        />
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
  if (!subtractFee) {
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

  if (outputAdjustedForDecimals) {
    return {
      amount: new BigDecimal(outputAmount)
        .subtract(new BigDecimal(fee))
        .getValue() as StringifiedNumber,
      adjustedForDecimals: true,
    };
  } else {
    return {
      amount: (
        BigInt(outputAmount) - BigInt(fee)
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
          strategyType={trade.strategyType}
          strategyKey={trade.strategyKey}
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
          strategyType={deposit.strategyType}
          strategyKey={deposit.strategyKey}
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
  dcaKeysCount,
  valueAverageKeysCount,
  triggerKeysCount,
  tradesCount,
}: {
  dcaKeysCount: number;
  valueAverageKeysCount: number;
  triggerKeysCount: number;
  tradesCount: number;
}) {
  const counts = [
    dcaKeysCount > 0 && `${dcaKeysCount} DCAs`,
    valueAverageKeysCount > 0 && `${valueAverageKeysCount} VAs`,
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
    dcaKeys,
    valueAverageKeys,
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

  const [subtractFee, setSubtractFee] = useState(false);

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

  if (
    dcaKeys.length === 0 &&
    valueAverageKeys.length === 0 &&
    triggerKeys.length === 0
  ) {
    return (
      <Stack gap="md">
        <Group>
          <ChangeDisplayedTradesButton
            userAddress={userAddress}
            dcaKeys={dcaKeys}
            valueAverageKeys={valueAverageKeys}
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
            dcaKeys={dcaKeys}
            valueAverageKeys={valueAverageKeys}
            triggerKeys={triggerKeys}
          />
          <TradeCountsTitle
            dcaKeysCount={dcaKeys.length}
            valueAverageKeysCount={valueAverageKeys.length}
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
              <Table.Th>Position</Table.Th>
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
