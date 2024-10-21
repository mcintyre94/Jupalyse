import { Form, Link, LoaderFunctionArgs, useFetcher, useLoaderData, useNavigation } from "react-router-dom";
import { FetchDCAFillsResponse, FetchValueAverageFillsResponse, MintData, StringifiedNumber } from "../types";
import { Address, Signature } from "@solana/web3.js";
import { getMintData } from "../mint-data";
import { ActionIcon, Anchor, Badge, Button, CopyButton, Flex, Group, Image, rem, Stack, Switch, Table, Text, Title, Tooltip } from "@mantine/core";
import { IconCopy, IconCheck, IconArrowsUpDown, IconArrowLeft } from '@tabler/icons-react';
import { numberDisplay } from "../number-display";
import BigDecimal from "js-big-decimal";
import { useCallback, useEffect, useRef, useState } from "react";

type Trade = {
    confirmedAt: Date;
    inputMint: Address;
    outputMint: Address;
    inputAmount: StringifiedNumber;
    outputAmount: StringifiedNumber;
    fee: StringifiedNumber;
    txSignature: Signature;
    tradeGroupType: "dca" | "value average";
    tradeGroupKey: Address;
    userAddress: Address;
    transactionSignature: Signature;
}

async function getDCAFills(dcaKeys: Address[]): Promise<Trade[]> {
    const responses = await Promise.all(dcaKeys.map(async dcaKey => {
        const response = await fetch(`https://dca-api.jup.ag/dca/${dcaKey}/fills`)
        const fillResponse = await response.json() as FetchDCAFillsResponse
        return fillResponse.data.fills
    }))
    return responses.flat().map(fill => {
        return ({
            confirmedAt: new Date(fill.confirmedAt * 1000),
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
            confirmedAt: new Date(fill.confirmedAt * 1000),
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

export async function loader({ request }: LoaderFunctionArgs) {
    const url = new URL(request.url);
    const dcaKeys = [...new Set(url.searchParams.getAll("dca"))] as Address[];
    const valueAverageKeys = [...new Set(url.searchParams.getAll("va"))] as Address[];

    const dcaTrades = dcaKeys.length > 0 ? await getDCAFills(dcaKeys) : [];
    const valueAverageTrades = valueAverageKeys.length > 0 ? await getValueAverageFills(valueAverageKeys) : [];

    const allTrades = [...dcaTrades, ...valueAverageTrades].sort((a, b) => a.confirmedAt.getTime() - b.confirmedAt.getTime());

    const uniqueMintAddresses: Address[] = Array.from(new Set<Address>(allTrades.flatMap(fill => [fill.inputMint, fill.outputMint])));
    const mints = await getMintData(uniqueMintAddresses);

    return {
        dcaKeys,
        valueAverageKeys,
        trades: allTrades,
        mints,
    }
}

type DownloadButtonProps = {
    // dcaFills: DCAFillData[];
    // mints: MintData[];
}

function DownloadButton({ }: DownloadButtonProps) {
    const fetcher = useFetcher();
    const isLoading = fetcher.state === 'loading';
    const downloadLinkRef = useRef<HTMLAnchorElement>(null);

    // TODO: Implement download for DCAs and VAs

    // const submit = useCallback(() => {
    //     fetcher.submit(
    //         JSON.stringify({
    //             dcaFills,
    //             mints,
    //         }),
    //         {
    //             method: 'post',
    //             action: '/trades/csv',
    //             encType: "application/json"
    //         }
    //     )
    // }, [dcaFills, mints])

    useEffect(() => {
        if (fetcher.data && fetcher.state === 'idle') {
            const { url, filename } = fetcher.data;
            const link = downloadLinkRef.current;
            if (link) {
                link.href = url;
                link.download = filename;
                link.click();
                URL.revokeObjectURL(url);
            }
        }
    }, [fetcher.data, fetcher.state]);

    return (
        <>
            <Button /* onClick={submit} */ loading={isLoading}>Download CSV</Button>
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
}

function TokenAmountCell({ address, amountRaw, tokenMintData }: TokenAmountCellProps) {
    const explorerLink = `https://explorer.solana.com/address/${address}`;

    if (!tokenMintData) {
        return <DottedAnchorLink href={explorerLink}>Unknown Token</DottedAnchorLink>
    }

    const formattedAmount = numberDisplay(amountRaw, tokenMintData.decimals);

    return (
        <Flex gap='micro' direction='row' align='center'>
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

function TransactionTypeCell({ tradeGroupType }: { tradeGroupType: "dca" | "value average" }) {
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
            {dcaKeys.map(dcaKey => <input type="hidden" name="dca" value={dcaKey} />)}
            {valueAverageKeys.map(vaKey => <input type="hidden" name="va" value={vaKey} />)}

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

export default function Fills() {
    const { dcaKeys, valueAverageKeys, trades, mints } = useLoaderData() as Awaited<ReturnType<typeof loader>>;

    const [rateType, setRateType] = useState<RateType>(RateType.OUTPUT_PER_INPUT);
    const switchRateType = useCallback(() => {
        setRateType(rateType === RateType.INPUT_PER_OUTPUT ? RateType.OUTPUT_PER_INPUT : RateType.INPUT_PER_OUTPUT);
    }, [rateType]);

    const [subtractFee, setSubtractFee] = useState(false);


    if (dcaKeys.length === 0 && valueAverageKeys.length === 0) {
        return <Text>No DCAs or VAs selected</Text>
    }

    if (trades.length === 0) {
        return <Text>No trades found for selected DCAs/VAs</Text>
    }

    const userAddress = trades[0].userAddress;

    return (
        <Stack gap='md'>
            <Group justify="space-between">
                <ChangeDisplayedTradesButton userAddress={userAddress} dcaKeys={dcaKeys} valueAverageKeys={valueAverageKeys} />
                <Title order={3}>Displaying data for {dcaKeys.length} DCAs and {valueAverageKeys.length} VAs ({trades.length} trades)</Title>
                {/* <DownloadButton dcaFills={dcaFills} mints={mints} /> */}
                <DownloadButton />
            </Group>

            <Table horizontalSpacing='lg'>
                <Table.Thead>
                    <Table.Tr>
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
                        <Table.Th>Type</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {trades.map((trade) => {
                        const inputMintData = mints.find(mint => mint.address === trade.inputMint);
                        const outputMintData = mints.find(mint => mint.address === trade.outputMint);

                        const outputAmountWithFee: StringifiedNumber = subtractFee ? (BigInt(trade.outputAmount) - BigInt(trade.fee)).toString() as StringifiedNumber : trade.outputAmount;

                        return (
                            <Table.Tr key={trade.transactionSignature}>
                                <Table.Td><DateCell date={trade.confirmedAt} /></Table.Td>
                                <Table.Td><TokenAmountCell address={trade.inputMint} amountRaw={trade.inputAmount} tokenMintData={inputMintData} /></Table.Td>
                                <Table.Td><TokenAmountCell address={trade.outputMint} amountRaw={outputAmountWithFee} tokenMintData={outputMintData} /></Table.Td>
                                <Table.Td><RateCell inputAmountRaw={trade.inputAmount} outputAmountRaw={trade.outputAmount} inputMintData={inputMintData} outputMintData={outputMintData} rateType={rateType} /></Table.Td>
                                <Table.Td><TransactionLinkCell txId={trade.transactionSignature} /></Table.Td>
                                <Table.Td><TransactionTypeCell tradeGroupType={trade.tradeGroupType} /></Table.Td>
                            </Table.Tr>
                        )
                    })}
                </Table.Tbody>
            </Table>
        </Stack>
    )
}
