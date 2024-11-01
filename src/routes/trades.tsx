import { Form, LoaderFunctionArgs, useFetcher, useLoaderData, useNavigation } from "react-router-dom";
import { Deposit, FetchDCAFillsResponse, FetchValueAverageFillsResponse, MintData, StringifiedNumber, Trade } from "../types";
import { Address } from "@solana/web3.js";
import { getMintData } from "../mint-data";
import { ActionIcon, Anchor, Badge, Button, CopyButton, Flex, Group, Image, rem, Stack, Switch, Table, Text, Title, Tooltip } from "@mantine/core";
import { IconCopy, IconCheck, IconArrowsUpDown, IconArrowLeft } from '@tabler/icons-react';
import { numberDisplay } from "../number-display";
import BigDecimal from "js-big-decimal";
import { useCallback, useEffect, useRef, useState } from "react";
import { getClosedValueAverages, getOpenDCAs, getOpenValueAverages } from "../jupiter-api";
import { getClosedDCAs } from "../jupiter-api";

async function getDCAFills(dcaKeys: Address[]): Promise<Trade[]> {
    const responses = await Promise.all(dcaKeys.map(async dcaKey => {
        const response = await fetch(`https://dca-api.jup.ag/dca/${dcaKey}/fills`)
        const fillResponse = await response.json() as FetchDCAFillsResponse
        return fillResponse.data.fills
    }))
    return responses.flat().map(fill => {
        return ({
            kind: "trade",
            date: new Date(fill.confirmedAt * 1000),
            inputMint: fill.inputMint,
            outputMint: fill.outputMint,
            inputAmount: fill.inAmount,
            outputAmount: fill.outAmount,
            fee: fill.fee,
            txSignature: fill.txId,
            tradeGroupType: "dca",
            tradeGroupKey: fill.dcaKey,
            userAddress: fill.userKey,
            transactionSignature: fill.txId,
        })
    })
}

async function getValueAverageFills(valueAverageKeys: Address[]): Promise<Trade[]> {
    const responses = await Promise.all(valueAverageKeys.map(async valueAverageKey => {
        const response = await fetch(`https://va.jup.ag/value-averages/${valueAverageKey}/fills`)
        const fillResponse = await response.json() as FetchValueAverageFillsResponse
        return fillResponse.data.fills
    }))
    return responses.flat().map(fill => {
        return ({
            kind: "trade",
            date: new Date(fill.confirmedAt * 1000),
            inputMint: fill.inputMint,
            outputMint: fill.outputMint,
            inputAmount: fill.inputAmount,
            outputAmount: fill.outputAmount,
            fee: fill.fee,
            txSignature: fill.txSignature,
            tradeGroupType: "value average",
            tradeGroupKey: fill.valueAverageKey,
            userAddress: fill.userKey,
            transactionSignature: fill.txSignature,
        })
    })
}

async function getDeposits(userAddress: Address, dcaKeys: Set<Address>, valueAverageKeys: Set<Address>): Promise<Deposit[]> {
    const [closedDCAs, openDCAs, closedValueAverages, openValueAverages] = await Promise.all([
        dcaKeys.size > 0 ? getClosedDCAs(userAddress) : [],
        dcaKeys.size > 0 ? getOpenDCAs(userAddress) : [],
        valueAverageKeys.size > 0 ? getClosedValueAverages(userAddress) : [],
        valueAverageKeys.size > 0 ? getOpenValueAverages(userAddress) : [],
    ]);

    const dcas = [...closedDCAs, ...openDCAs].filter(dca => dcaKeys.has(dca.dcaKey));
    const valueAverages = [...closedValueAverages, ...openValueAverages].filter(va => valueAverageKeys.has(va.valueAverageKey));

    const dcaDeposits: Deposit[] = dcas.map(dca => ({
        kind: "deposit",
        date: new Date(dca.createdAt),
        inputMint: dca.inputMint,
        inputAmount: dca.inDeposited,
        tradeGroupType: "dca",
        tradeGroupKey: dca.dcaKey,
        userAddress: userAddress,
        transactionSignature: dca.openTxHash,
    }));

    const valueAverageDeposits: Deposit[] = valueAverages.map(va => ({
        kind: "deposit",
        date: new Date(va.createdAt),
        inputMint: va.inputMint,
        inputAmount: va.inDeposited,
        tradeGroupType: "value average",
        tradeGroupKey: va.valueAverageKey,
        userAddress: userAddress,
        transactionSignature: va.openTxHash,
    }));

    return [...dcaDeposits, ...valueAverageDeposits];
}

export async function loader({ request }: LoaderFunctionArgs) {
    const url = new URL(request.url);
    const userAddress = url.searchParams.get("userAddress") as Address;
    const dcaKeys = [...new Set(url.searchParams.getAll("dca"))] as Address[];
    const valueAverageKeys = [...new Set(url.searchParams.getAll("va"))] as Address[];

    const [dcaTrades, valueAverageTrades, deposits] = await Promise.all([
        dcaKeys.length > 0 ? getDCAFills(dcaKeys) : [],
        valueAverageKeys.length > 0 ? getValueAverageFills(valueAverageKeys) : [],
        dcaKeys.length > 0 || valueAverageKeys.length > 0 ? getDeposits(userAddress, new Set(dcaKeys), new Set(valueAverageKeys)) : [],
    ])

    const allTrades = [...dcaTrades, ...valueAverageTrades] //.sort((a, b) => a.confirmedAt.getTime() - b.confirmedAt.getTime());

    const uniqueMintAddresses: Address[] = Array.from(new Set<Address>(allTrades.flatMap(fill => [fill.inputMint, fill.outputMint])));
    const mints = await getMintData(uniqueMintAddresses);

    const events = [...deposits, ...allTrades].sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
        dcaKeys,
        valueAverageKeys,
        userAddress,
        events,
        mints,
    }
}

type DownloadButtonProps = {
    events: (Trade | Deposit)[];
    mints: MintData[];
    userAddress: Address;
}

function DownloadButton({ events, mints, userAddress }: DownloadButtonProps) {
    const fetcher = useFetcher();
    const isLoading = fetcher.state === 'loading';
    const downloadLinkRef = useRef<HTMLAnchorElement>(null);

    const submit = useCallback(() => {
        fetcher.submit(
            JSON.stringify({
                events,
                mints,
            }),
            {
                method: 'post',
                action: '/trades/csv',
                encType: "application/json"
            }
        )
    }, [events, mints])

    useEffect(() => {
        if (fetcher.data && fetcher.state === 'idle') {
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
            <Button onClick={submit} loading={isLoading}>Download CSV</Button>
            <a ref={downloadLinkRef} style={{ display: 'none' }}></a>
        </>
    )
}

function DateCell({ date }: { date: Date }) {
    const friendlyDate = date.toLocaleDateString();
    const friendlyTime = date.toLocaleTimeString();
    const timestamp = Math.floor(date.getTime() / 1000);
    return (
        <Flex gap='micro' direction='row' align='center'>
            <Text>{friendlyDate} {friendlyTime}</Text>
            <CopyButton value={timestamp.toString()} timeout={2000}>
                {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Copied' : 'Copy timestamp'} withArrow position="right">
                        <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy}>
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
    )
}

type DottedAnchorLinkProps = {
    href: string;
    children: React.ReactNode;
}

function DottedAnchorLink({ href, children }: DottedAnchorLinkProps) {
    return <Anchor href={href} target="_blank" underline="always" style={{ textDecoration: "underline dotted", color: 'inherit' }}>{children}</Anchor>
}

type TokenAmountCellProps = {
    address: Address;
    amountRaw: StringifiedNumber;
    tokenMintData: MintData | undefined;
    isDeposit: boolean;
}

function TokenAmountCell({ address, amountRaw, tokenMintData, isDeposit }: TokenAmountCellProps) {
    const explorerLink = `https://explorer.solana.com/address/${address}`;

    if (!tokenMintData) {
        return <DottedAnchorLink href={explorerLink}>Unknown Token</DottedAnchorLink>
    }

    const formattedAmount = numberDisplay(amountRaw, tokenMintData.decimals);

    return (
        <Flex gap='micro' direction='row' align='center'>
            {isDeposit && <Text>Deposited</Text>}
            <Image src={tokenMintData.logoURI} width={16} height={16} />
            <Text>{formattedAmount} <DottedAnchorLink href={explorerLink}>{tokenMintData.symbol}</DottedAnchorLink></Text>
            <CopyButton value={address} timeout={2000}>
                {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Copied' : 'Copy mint address'} withArrow position="right">
                        <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy}>
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
    )
}

enum RateType {
    INPUT_PER_OUTPUT,
    OUTPUT_PER_INPUT,
}

type RateCellProps = {
    inputAmountRaw: StringifiedNumber;
    outputAmountRaw: StringifiedNumber;
    inputMintData: MintData | undefined;
    outputMintData: MintData | undefined;
    rateType: RateType;
}

function RateCell({ inputAmountRaw, outputAmountRaw, inputMintData, outputMintData, rateType }: RateCellProps) {
    if (!inputMintData || !outputMintData) {
        return <Text>Unknown</Text>
    }

    const inputAmountBigDecimal = new BigDecimal(`${inputAmountRaw}E-${inputMintData.decimals}`);
    const outputAmountBigDecimal = new BigDecimal(`${outputAmountRaw}E-${outputMintData.decimals}`);

    const rateInputOverOutput = inputAmountBigDecimal.divide(outputAmountBigDecimal, inputMintData.decimals);
    const rateOutputOverInput = outputAmountBigDecimal.divide(inputAmountBigDecimal, outputMintData.decimals);



    const text = rateType === RateType.INPUT_PER_OUTPUT ?
        `${rateInputOverOutput.getPrettyValue()} ${inputMintData.symbol} per ${outputMintData.symbol}`
        :
        `${rateOutputOverInput.getPrettyValue()} ${outputMintData.symbol} per ${inputMintData.symbol}`

    return <Text>{text}</Text>
}

function TransactionLinkCell({ txId }: { txId: string }) {
    const explorerLink = `https://explorer.solana.com/tx/${txId}`;
    return <DottedAnchorLink href={explorerLink}>View</DottedAnchorLink>
}

function TransactionKindCell({ kind }: { kind: "deposit" | "trade" }) {
    if (kind === 'deposit') {
        return <Badge size='xs' variant='default' c='green.1'>Deposit</Badge>
    }
    return <Badge size='xs' variant='default' c='blue.1'>Trade</Badge>
}

function TransactionProductCell({ tradeGroupType }: { tradeGroupType: "dca" | "value average" }) {
    if (tradeGroupType === 'dca') {
        return <Badge size='xs' variant='light' c='green.1'>DCA</Badge>
    }
    return <Badge size='xs' variant='light' c='blue.1'>VA</Badge>
}

type ChangeDisplayedTradesButtonProps = {
    userAddress: Address;
    dcaKeys: Address[];
    valueAverageKeys: Address[];
}

function ChangeDisplayedTradesButton({ userAddress, dcaKeys, valueAverageKeys }: ChangeDisplayedTradesButtonProps) {
    const navigation = useNavigation();
    const isLoading = navigation.state === 'loading';

    return (
        <Form action={`/trade-groups/${userAddress}`}>
            {dcaKeys.map(dcaKey => <input key={dcaKey} type="hidden" name="dca" value={dcaKey} />)}
            {valueAverageKeys.map(vaKey => <input key={vaKey} type="hidden" name="va" value={vaKey} />)}

            <Button
                type='submit'
                variant='subtle'
                leftSection={<IconArrowLeft size={14} />}
                loading={isLoading}>
                Change displayed trades
            </Button>
        </Form>
    )
}

type TradeRowProps = {
    trade: Trade;
    mints: MintData[];
    subtractFee: boolean;
    rateType: RateType;
}

function TradeRow({ trade, mints, subtractFee, rateType }: TradeRowProps) {
    const inputMintData = mints.find(mint => mint.address === trade.inputMint);
    const outputMintData = mints.find(mint => mint.address === trade.outputMint);

    const outputAmountWithFee: StringifiedNumber = subtractFee ? (BigInt(trade.outputAmount) - BigInt(trade.fee)).toString() as StringifiedNumber : trade.outputAmount;

    return (
        <Table.Tr key={trade.transactionSignature}>
            <Table.Td><TransactionKindCell kind="trade" /></Table.Td>
            <Table.Td><DateCell date={trade.date} /></Table.Td>
            <Table.Td><TokenAmountCell address={trade.inputMint} amountRaw={trade.inputAmount} tokenMintData={inputMintData} isDeposit={false} /></Table.Td>
            <Table.Td><TokenAmountCell address={trade.outputMint} amountRaw={outputAmountWithFee} tokenMintData={outputMintData} isDeposit={false} /></Table.Td>
            <Table.Td><RateCell inputAmountRaw={trade.inputAmount} outputAmountRaw={trade.outputAmount} inputMintData={inputMintData} outputMintData={outputMintData} rateType={rateType} /></Table.Td>
            <Table.Td><TransactionLinkCell txId={trade.transactionSignature} /></Table.Td>
            <Table.Td><TransactionProductCell tradeGroupType={trade.tradeGroupType} /></Table.Td>
        </Table.Tr>
    )
}

type DepositRowProps = {
    deposit: Deposit;
    mints: MintData[];
}

function DepositRow({ deposit, mints }: DepositRowProps) {
    const inputMintData = mints.find(mint => mint.address === deposit.inputMint);

    return (
        <Table.Tr key={deposit.transactionSignature}>
            <Table.Td><TransactionKindCell kind="deposit" /></Table.Td>
            <Table.Td><DateCell date={deposit.date} /></Table.Td>
            <Table.Td colSpan={3}><TokenAmountCell address={deposit.inputMint} amountRaw={deposit.inputAmount} tokenMintData={inputMintData} isDeposit={true} /></Table.Td>
            <Table.Td><TransactionLinkCell txId={deposit.transactionSignature} /></Table.Td>
            <Table.Td><TransactionProductCell tradeGroupType={deposit.tradeGroupType} /></Table.Td>
        </Table.Tr>
    )
}

export default function Fills() {
    const { dcaKeys, valueAverageKeys, userAddress, events, mints } = useLoaderData() as Awaited<ReturnType<typeof loader>>;

    const [rateType, setRateType] = useState<RateType>(RateType.OUTPUT_PER_INPUT);
    const switchRateType = useCallback(() => {
        setRateType(rateType === RateType.INPUT_PER_OUTPUT ? RateType.OUTPUT_PER_INPUT : RateType.INPUT_PER_OUTPUT);
    }, [rateType]);

    const [subtractFee, setSubtractFee] = useState(false);


    if (dcaKeys.length === 0 && valueAverageKeys.length === 0) {
        return <Text>No DCAs or VAs selected</Text>
    }

    const trades = events.filter(event => event.kind === "trade") as Trade[];

    console.log({ events });

    return (
        <Stack gap='md'>
            <Group justify="space-between">
                <ChangeDisplayedTradesButton userAddress={userAddress} dcaKeys={dcaKeys} valueAverageKeys={valueAverageKeys} />
                <Title order={3}>Displaying data for {dcaKeys.length} DCAs and {valueAverageKeys.length} VAs ({trades.length} trades)</Title>
                <DownloadButton events={events} mints={mints} userAddress={userAddress} />
            </Group>

            <Table horizontalSpacing='lg'>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Kind</Table.Th>
                        <Table.Th>Date</Table.Th>
                        <Table.Th>Swapped</Table.Th>
                        <Table.Th>
                            <Group gap='xl'>
                                <Text fw={700}>For</Text>
                                <Switch
                                    checked={subtractFee}
                                    onChange={() => setSubtractFee(!subtractFee)}
                                    label='Subtract fee'
                                    styles={{
                                        label: {
                                            fontWeight: 'normal',
                                        }
                                    }}
                                />
                            </Group>
                        </Table.Th>
                        <Table.Th>
                            <Group gap='micro'>
                                <Text>Rate</Text>
                                <ActionIcon color="gray" size='sm' onClick={switchRateType} variant="subtle" aria-label="Switch rate type">
                                    <IconArrowsUpDown style={{ width: '70%', height: '70%' }} stroke={1.5} />
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
                            return <TradeRow key={event.transactionSignature} trade={event} mints={mints} subtractFee={subtractFee} rateType={rateType} />
                        } else {
                            return <DepositRow key={event.transactionSignature} deposit={event} mints={mints} />
                        }
                    })}
                </Table.Tbody>
            </Table>
        </Stack>
    )
}
