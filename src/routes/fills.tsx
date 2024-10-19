import { Link, LoaderFunctionArgs, useFetcher, useLoaderData, useNavigation } from "react-router-dom";
import { DCAFillData, FetchDCAFillsResponse, MintData, StringifiedNumber } from "../types";
import { Address } from "@solana/web3.js";
import { getMintData } from "../mint-data";
import { ActionIcon, Anchor, Button, CopyButton, Flex, Group, Image, rem, Stack, Switch, Table, Text, Title, Tooltip } from "@mantine/core";
import { IconCopy, IconCheck, IconArrowsUpDown, IconArrowLeft } from '@tabler/icons-react';
import { numberDisplay } from "../number-display";
import BigDecimal from "js-big-decimal";
import { useCallback, useEffect, useRef, useState } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
    const url = new URL(request.url);
    const dcaKeys = [...new Set(url.searchParams.getAll("dca"))] as Address[];

    const responses = await Promise.all(dcaKeys.map(async dcaKey => {
        const response = await fetch(`https://dca-api.jup.ag/dca/${dcaKey}/fills`)
        const fillResponse = await response.json() as FetchDCAFillsResponse
        return fillResponse.data.fills
    }))

    const allFills = responses.flat().sort((a, b) => a.confirmedAt - b.confirmedAt);

    const uniqueMintAddresses: Address[] = Array.from(new Set<Address>(allFills.flatMap(fill => [fill.inputMint, fill.outputMint])));
    const mints = await getMintData(uniqueMintAddresses);

    return {
        dcaKeys,
        dcaFills: allFills,
        mints,
    }
}

type DownloadButtonProps = {
    dcaFills: DCAFillData[];
    mints: MintData[];
}

function DownloadButton({ dcaFills, mints }: DownloadButtonProps) {
    const fetcher = useFetcher();
    const isLoading = fetcher.state === 'loading';
    const downloadLinkRef = useRef<HTMLAnchorElement>(null);

    const submit = useCallback(() => {
        fetcher.submit(
            JSON.stringify({
                dcaFills,
                mints,
            }),
            {
                method: 'post',
                action: '/fills/csv',
                encType: "application/json"
            }
        )
    }, [dcaFills, mints])

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
            <Button onClick={submit} loading={isLoading}>Download CSV</Button>
            <a ref={downloadLinkRef} style={{ display: 'none' }}></a>
        </>
    )
}

function DateCell({ timestamp }: { timestamp: number }) {
    const date = new Date(timestamp * 1000);
    const friendlyDate = date.toLocaleDateString();
    const friendlyTime = date.toLocaleTimeString();
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

type ChangeDisplayedDCAsButtonProps = {
    userAddress: Address;
    dcaKeys: Address[];
}

function ChangeDisplayedDCAsButton({ userAddress, dcaKeys }: ChangeDisplayedDCAsButtonProps) {
    const navigation = useNavigation();
    const isLoading = navigation.state === 'loading';

    return (
        <Button variant="subtle" leftSection={<IconArrowLeft size={14} />} component={Link}
            to={`/dcas/${userAddress}?${dcaKeys.map(dcaKey => `dca=${dcaKey}`).join('&')}`}
            loading={isLoading}
        >Change displayed DCAs</Button>
    )
}

export default function Fills() {
    const { dcaKeys, dcaFills, mints } = useLoaderData() as Awaited<ReturnType<typeof loader>>;

    const [rateType, setRateType] = useState<RateType>(RateType.OUTPUT_PER_INPUT);
    const switchRateType = useCallback(() => {
        setRateType(rateType === RateType.INPUT_PER_OUTPUT ? RateType.OUTPUT_PER_INPUT : RateType.INPUT_PER_OUTPUT);
    }, [rateType]);

    const [subtractFee, setSubtractFee] = useState(false);


    if (dcaKeys.length === 0) {
        return <Text>No DCAs selected</Text>
    }

    if (dcaFills.length === 0) {
        return <Text>No transactions found for selected DCAs</Text>
    }

    const userAddress = dcaFills[0].userKey;

    return (
        <Stack gap='md'>
            <Group justify="space-between">
                <ChangeDisplayedDCAsButton userAddress={userAddress} dcaKeys={dcaKeys} />
                <Title order={3}>Displaying data for {dcaKeys.length} DCAs ({dcaFills.length} fills)</Title>
                <DownloadButton dcaFills={dcaFills} mints={mints} />
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
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {dcaFills.map((fill) => {
                        const inputMintData = mints.find(mint => mint.address === fill.inputMint);
                        const outputMintData = mints.find(mint => mint.address === fill.outputMint);

                        const outputAmountWithFee: StringifiedNumber = subtractFee ? (BigInt(fill.outAmount) - BigInt(fill.fee)).toString() as StringifiedNumber : fill.outAmount;

                        return (
                            <Table.Tr key={fill.txId}>
                                <Table.Td><DateCell timestamp={fill.confirmedAt} /></Table.Td>
                                <Table.Td><TokenAmountCell address={fill.inputMint} amountRaw={fill.inAmount} tokenMintData={inputMintData} /></Table.Td>
                                <Table.Td><TokenAmountCell address={fill.outputMint} amountRaw={outputAmountWithFee} tokenMintData={outputMintData} /></Table.Td>
                                <Table.Td><RateCell inputAmountRaw={fill.inAmount} outputAmountRaw={fill.outAmount} inputMintData={inputMintData} outputMintData={outputMintData} rateType={rateType} /></Table.Td>
                                <Table.Td><TransactionLinkCell txId={fill.txId} /></Table.Td>
                            </Table.Tr>
                        )
                    })}
                </Table.Tbody>
            </Table>
        </Stack>
    )
}
