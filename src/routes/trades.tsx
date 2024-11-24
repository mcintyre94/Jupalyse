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
  FetchValueAverageFillsResponse,
  MintData,
  StringifiedNumber,
  Trade,
} from "../types";
import { Address } from "@solana/web3.js";
import { getMintData } from "../mint-data";
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  CopyButton,
  Flex,
  Group,
  Image,
  rem,
  Stack,
  Switch,
  Table,
  Text,
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
  numberDisplay,
  numberDisplayAlreadyAdjustedForDecimals,
} from "../number-display";
import BigDecimal from "js-big-decimal";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getClosedValueAverages,
  getLimitOrdersWithTrades,
  getOpenDCAs,
  getOpenValueAverages,
} from "../jupiter-api";
import { getClosedDCAs } from "../jupiter-api";

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
      tradeGroupType: "dca",
      tradeGroupKey: fill.dcaKey,
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
      tradeGroupType: "value average",
      tradeGroupKey: fill.valueAverageKey,
      userAddress: fill.userKey,
      transactionSignature: fill.txSignature,
    };
  });
}

async function getLimitOrderTrades(
  userAddress: Address,
  limitOrderKeys: Address[],
): Promise<Trade[]> {
  // Limit orders are fetched by user address, so fetch them all (cached with react-query),
  // then filter to only those selected
  const limitOrders = await getLimitOrdersWithTrades(userAddress);
  const limitOrderKeysSet = new Set(limitOrderKeys);
  const limitOrderTrades = limitOrders
    .filter((order) => limitOrderKeysSet.has(order.orderKey))
    .flatMap((order) => order.trades);
  console.log({ limitOrders, limitOrderKeysSet, limitOrderTrades });
  return limitOrderTrades.map((trade) => ({
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
    tradeGroupType: "limit order",
    tradeGroupKey: trade.orderKey,
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
    limitOrdersWithTrades,
  ] = await Promise.all([
    dcaKeys.size > 0 ? getClosedDCAs(userAddress) : [],
    dcaKeys.size > 0 ? getOpenDCAs(userAddress) : [],
    valueAverageKeys.size > 0 ? getClosedValueAverages(userAddress) : [],
    valueAverageKeys.size > 0 ? getOpenValueAverages(userAddress) : [],
    limitOrderKeys.size > 0 ? getLimitOrdersWithTrades(userAddress) : [],
  ]);

  const dcas = [...closedDCAs, ...openDCAs].filter((dca) =>
    dcaKeys.has(dca.dcaKey),
  );
  const valueAverages = [...closedValueAverages, ...openValueAverages].filter(
    (va) => valueAverageKeys.has(va.valueAverageKey),
  );
  const limitOrders = limitOrdersWithTrades.filter((order) =>
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
    tradeGroupType: "dca",
    tradeGroupKey: dca.dcaKey,
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
    tradeGroupType: "value average",
    tradeGroupKey: va.valueAverageKey,
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
    tradeGroupType: "limit order",
    tradeGroupKey: order.orderKey,
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
  const limitOrderKeys = [
    ...new Set(url.searchParams.getAll("lo")),
  ] as Address[];

  const [dcaTrades, valueAverageTrades, limitOrderTrades, deposits] =
    await Promise.all([
      dcaKeys.length > 0 ? getDCAFills(dcaKeys) : [],
      valueAverageKeys.length > 0 ? getValueAverageFills(valueAverageKeys) : [],
      limitOrderKeys.length > 0
        ? getLimitOrderTrades(userAddress, limitOrderKeys)
        : [],
      dcaKeys.length > 0 ||
      valueAverageKeys.length > 0 ||
      limitOrderKeys.length > 0
        ? getDeposits(
            userAddress,
            new Set(dcaKeys),
            new Set(valueAverageKeys),
            new Set(limitOrderKeys),
          )
        : [],
    ]);

  const allTrades = [...dcaTrades, ...valueAverageTrades, ...limitOrderTrades];

  const uniqueMintAddresses: Address[] = Array.from(
    new Set<Address>(
      allTrades.flatMap((fill) => [fill.inputMint, fill.outputMint]),
    ),
  );
  const mints = await getMintData(uniqueMintAddresses);

  const events = [...deposits, ...allTrades].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  return {
    dcaKeys,
    valueAverageKeys,
    limitOrderKeys,
    userAddress,
    events,
    mints,
  };
}

type DownloadButtonProps = {
  events: (Trade | Deposit)[];
  mints: MintData[];
  userAddress: Address;
};

function DownloadButton({ events, mints, userAddress }: DownloadButtonProps) {
  const fetcher = useFetcher();
  const isLoading = fetcher.state === "loading";
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);

  const submit = useCallback(() => {
    fetcher.submit(
      JSON.stringify({
        events,
        mints,
      }),
      {
        method: "post",
        action: "/trades/csv",
        encType: "application/json",
      },
    );
  }, [events, mints]);

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

type TokenAmountCellProps = {
  address: Address;
  amountToDisplay: {
    amount: StringifiedNumber;
    adjustedForDecimals: boolean;
  };
  tokenMintData: MintData | undefined;
  isDeposit: boolean;
  onNumberClick?: () => void;
};

function TokenAmountCell({
  address,
  amountToDisplay,
  tokenMintData,
  isDeposit,
  onNumberClick,
}: TokenAmountCellProps) {
  const explorerLink = `https://explorer.solana.com/address/${address}`;

  if (!tokenMintData) {
    return (
      <DottedAnchorLink href={explorerLink}>Unknown Token</DottedAnchorLink>
    );
  }

  const { amount, adjustedForDecimals } = amountToDisplay;
  const formattedAmount = adjustedForDecimals
    ? numberDisplayAlreadyAdjustedForDecimals(amount)
    : numberDisplay(amount, tokenMintData.decimals);

  return (
    <Flex gap="micro" direction="row" align="center">
      {isDeposit && <Text>Deposited</Text>}
      <Image src={tokenMintData.logoURI} width={16} height={16} />
      <Text>
        <Text component="span" onClick={onNumberClick}>
          {formattedAmount}
        </Text>{" "}
        <DottedAnchorLink href={explorerLink}>
          {tokenMintData.symbol}
        </DottedAnchorLink>
      </Text>
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

function TransactionKindCell({ kind }: { kind: "deposit" | "trade" }) {
  if (kind === "deposit") {
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

function TransactionProductCell({
  tradeGroupType,
}: {
  tradeGroupType: "dca" | "value average" | "limit order";
}) {
  if (tradeGroupType === "dca") {
    return (
      <Badge size="xs" variant="light" c="green.1">
        DCA
      </Badge>
    );
  }

  if (tradeGroupType === "value average") {
    return (
      <Badge size="xs" variant="light" c="blue.1">
        VA
      </Badge>
    );
  }

  return (
    <Badge size="xs" variant="light" c="orange.1">
      LO
    </Badge>
  );
}

type ChangeDisplayedTradesButtonProps = {
  userAddress: Address;
  dcaKeys: Address[];
  valueAverageKeys: Address[];
  limitOrderKeys: Address[];
};

function ChangeDisplayedTradesButton({
  userAddress,
  dcaKeys,
  valueAverageKeys,
  limitOrderKeys,
}: ChangeDisplayedTradesButtonProps) {
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  return (
    <Form action={`/trade-groups/${userAddress}`}>
      {dcaKeys.map((dcaKey) => (
        <input key={dcaKey} type="hidden" name="dca" value={dcaKey} />
      ))}
      {valueAverageKeys.map((vaKey) => (
        <input key={vaKey} type="hidden" name="va" value={vaKey} />
      ))}
      {limitOrderKeys.map((loKey) => (
        <input key={loKey} type="hidden" name="lo" value={loKey} />
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
    console.log({
      outputAmount,
      fee,
      outputAmountDecimal: new BigDecimal(outputAmount).getValue(),
      feeDecimal: new BigDecimal(fee).getValue(),
    });

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
};

function TradeRow({
  trade,
  mints,
  subtractFee,
  rateType,
  switchSubtractFee,
  switchRateType,
}: TradeRowProps) {
  const inputMintData = mints.find((mint) => mint.address === trade.inputMint);
  const outputMintData = mints.find(
    (mint) => mint.address === trade.outputMint,
  );

  const outputAmountWithFee = useMemo(
    () => adjustOutputAmountForFee(trade.outputAmount, trade.fee, subtractFee),
    [trade.outputAmount, trade.fee, subtractFee],
  );

  return (
    <Table.Tr key={trade.transactionSignature}>
      <Table.Td miw={100}>
        <TransactionKindCell kind="trade" />
      </Table.Td>
      <Table.Td>
        <DateCell date={trade.date} />
      </Table.Td>
      <Table.Td>
        <TokenAmountCell
          address={trade.inputMint}
          amountToDisplay={trade.inputAmount}
          tokenMintData={inputMintData}
          isDeposit={false}
        />
      </Table.Td>
      <Table.Td>
        <TokenAmountCell
          address={trade.outputMint}
          amountToDisplay={outputAmountWithFee}
          tokenMintData={outputMintData}
          isDeposit={false}
          onNumberClick={switchSubtractFee}
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
      <Table.Td>
        <TransactionProductCell tradeGroupType={trade.tradeGroupType} />
      </Table.Td>
    </Table.Tr>
  );
}

type DepositRowProps = {
  deposit: Deposit;
  mints: MintData[];
};

function DepositRow({ deposit, mints }: DepositRowProps) {
  const inputMintData = mints.find(
    (mint) => mint.address === deposit.inputMint,
  );

  return (
    <Table.Tr key={deposit.transactionSignature}>
      <Table.Td>
        <TransactionKindCell kind="deposit" />
      </Table.Td>
      <Table.Td>
        <DateCell date={deposit.date} />
      </Table.Td>
      <Table.Td colSpan={3}>
        <TokenAmountCell
          address={deposit.inputMint}
          amountToDisplay={deposit.inputAmount}
          tokenMintData={inputMintData}
          isDeposit={true}
        />
      </Table.Td>
      <Table.Td>
        <TransactionLinkCell txId={deposit.transactionSignature} />
      </Table.Td>
      <Table.Td>
        <TransactionProductCell tradeGroupType={deposit.tradeGroupType} />
      </Table.Td>
    </Table.Tr>
  );
}

function TradeCountsTitle({
  dcaKeysCount,
  valueAverageKeysCount,
  limitOrderKeysCount,
  tradesCount,
}: {
  dcaKeysCount: number;
  valueAverageKeysCount: number;
  limitOrderKeysCount: number;
  tradesCount: number;
}) {
  const counts = [
    dcaKeysCount > 0 && `${dcaKeysCount} DCAs`,
    valueAverageKeysCount > 0 && `${valueAverageKeysCount} VAs`,
    limitOrderKeysCount > 0 && `${limitOrderKeysCount} LOs`,
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

export default function Fills() {
  const {
    dcaKeys,
    valueAverageKeys,
    limitOrderKeys,
    userAddress,
    events,
    mints,
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

  if (
    dcaKeys.length === 0 &&
    valueAverageKeys.length === 0 &&
    limitOrderKeys.length === 0
  ) {
    return (
      <Stack gap="md">
        <Group>
          <ChangeDisplayedTradesButton
            userAddress={userAddress}
            dcaKeys={dcaKeys}
            valueAverageKeys={valueAverageKeys}
            limitOrderKeys={limitOrderKeys}
          />
          <Title order={3}>No trades selected</Title>
        </Group>
      </Stack>
    );
  }

  const trades = events.filter((event) => event.kind === "trade") as Trade[];

  console.log({ events });

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <ChangeDisplayedTradesButton
          userAddress={userAddress}
          dcaKeys={dcaKeys}
          valueAverageKeys={valueAverageKeys}
          limitOrderKeys={limitOrderKeys}
        />
        <TradeCountsTitle
          dcaKeysCount={dcaKeys.length}
          valueAverageKeysCount={valueAverageKeys.length}
          limitOrderKeysCount={limitOrderKeys.length}
          tradesCount={trades.length}
        />
        <DownloadButton
          events={events}
          mints={mints}
          userAddress={userAddress}
        />
      </Group>

      <Table stickyHeader horizontalSpacing="lg">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Kind</Table.Th>
            <Table.Th>Date</Table.Th>
            <Table.Th>Swapped</Table.Th>
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
            <Table.Th>Product</Table.Th>
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
                />
              );
            } else {
              return (
                <DepositRow
                  key={event.transactionSignature}
                  deposit={event}
                  mints={mints}
                />
              );
            }
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
