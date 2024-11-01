import { Badge, Button, Checkbox, Container, Group, Space, Stack, Text, Title } from "@mantine/core";
import { Address, assertIsAddress, isAddress } from "@solana/web3.js";
import { Form, Link, LoaderFunctionArgs, useLoaderData, useNavigation, useParams } from "react-router-dom";
import { DCAFetchedAccount, DCAStatus, MintData, ValueAverageFetchedAccount, ValueAverageStatus } from "../types";
import { useListState } from "@mantine/hooks";
import { numberDisplay } from "../number-display";
import { getMintData } from "../mint-data";
import { IconArrowLeft } from "@tabler/icons-react";
import { getClosedDCAs, getOpenDCAs, getClosedValueAverages, getOpenValueAverages } from "../jupiter-api";

export async function loader({ params, request }: LoaderFunctionArgs) {
    const address = params.address as string;

    if (!isAddress(address)) {
        throw new Error("Invalid address");
    }

    const [closedDCAs, openDCAs, closedValueAverages, openValueAverages] = await Promise.all([
        getClosedDCAs(address),
        getOpenDCAs(address),
        getClosedValueAverages(address),
        getOpenValueAverages(address),
    ]);

    const uniqueMintAddresses: Address[] = Array.from(new Set<Address>([
        ...closedDCAs.flatMap(dca => [dca.inputMint, dca.outputMint]),
        ...openDCAs.flatMap(dca => [dca.inputMint, dca.outputMint]),
        ...closedValueAverages.flatMap(va => [va.inputMint, va.outputMint]),
        ...openValueAverages.flatMap(va => [va.inputMint, va.outputMint]),
    ]));

    const mints = await getMintData(uniqueMintAddresses);

    const dcaKeys = new Set(new URL(request.url).searchParams.getAll("dca") as Address[]);
    const valueAverageKeys = new Set(new URL(request.url).searchParams.getAll("va") as Address[]);
    return {
        dcas: [...closedDCAs, ...openDCAs],
        valueAverages: [...closedValueAverages, ...openValueAverages],
        selectedDcaKeys: dcaKeys,
        selectedValueAverageKeys: valueAverageKeys,
        mints,
    };
}

type SingleItemCheckboxGroupProps = {
    selectedKeys: Set<Address>,
    mints: MintData[],
    account: DCAFetchedAccount | ValueAverageFetchedAccount,
    field: "dca" | "va",
}

function SingleItemCheckboxGroup({ selectedKeys, mints, account, field }: SingleItemCheckboxGroupProps) {
    const key = "dcaKey" in account ? account.dcaKey : account.valueAverageKey;
    const inputMintData = mints.find(mint => mint.address === account.inputMint);
    const outputMintData = mints.find(mint => mint.address === account.outputMint);

    const inputAmount = inputMintData ? `${numberDisplay(account.inDeposited, inputMintData.decimals)} ${inputMintData.symbol}` : "Unknown Amount";
    const isOpen = "dcaKey" in account ? account.status === DCAStatus.OPEN : account.status === ValueAverageStatus.OPEN;

    const date = new Date(account.createdAt);
    const friendlyDate = date.toLocaleDateString();
    const friendlyTime = date.toLocaleTimeString();

    return (
        <Checkbox
            defaultChecked={selectedKeys.size === 0 || selectedKeys.has(key)}
            label={(
                <Group>
                    <Text size='sm'>{inputAmount} {'->'} {outputMintData?.symbol ?? `Unknown (${account.outputMint})`} - Started {friendlyDate} {friendlyTime}</Text>
                    {isOpen ? <Badge size='xs' variant='outline' c='green.1'>Open</Badge> : null}
                </Group>
            )}
            name={field}
            value={key}
        />
    )
}

type BaseCheckboxGroupProps = {
    mints: MintData[],
    selectedKeys: Set<Address>,
}

type CheckboxGroupProps = BaseCheckboxGroupProps & ({
    accounts: DCAFetchedAccount[],
    field: "dca"
} | {
    accounts: ValueAverageFetchedAccount[],
    field: "va"
})

function CheckboxGroup({ accounts, field, selectedKeys, mints }: CheckboxGroupProps) {
    if (accounts.length === 0) {
        return null;
    }

    if (accounts.length === 1) {
        return <SingleItemCheckboxGroup selectedKeys={selectedKeys} mints={mints} account={accounts[0]} field={field} />
    }

    const { inputMint, outputMint } = accounts[0];
    const inputMintData = mints.find(mint => mint.address === inputMint);
    const outputMintData = mints.find(mint => mint.address === outputMint);
    const groupLabel = `${inputMintData?.symbol ?? `Unknown (${inputMint})`} -> ${outputMintData?.symbol ?? `Unknown (${outputMint})`}`;

    const initialValues = accounts.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(account => {
        const date = new Date(account.createdAt);
        const friendlyDate = date.toLocaleDateString();
        const friendlyTime = date.toLocaleTimeString();
        const inputAmount = inputMintData ? `${numberDisplay(account.inDeposited, inputMintData.decimals)} ${inputMintData.symbol}` : "Unknown Amount";

        const key = "dcaKey" in account ? account.dcaKey : account.valueAverageKey;
        const isOpen = field === "dca" ? account.status === DCAStatus.OPEN : account.status === ValueAverageStatus.OPEN;

        return {
            label: (
                <Group align='center'>
                    <Text size='sm'>{inputAmount} - Started {friendlyDate} {friendlyTime}</Text>
                    {isOpen ? <Badge size='xs' variant='outline' c='green.1'>Open</Badge> : null}
                </Group>
            ),
            checked: selectedKeys.size === 0 || selectedKeys.has(key),
            key,
        };
    });

    const [values, handlers] = useListState(initialValues);

    const allChecked = values.every((value) => value.checked);
    const indeterminate = values.some((value) => value.checked) && !allChecked;

    const items = values.map((value, index) => (
        <Checkbox
            ml={33}
            label={value.label}
            key={value.key}
            checked={value.checked}
            name={field}
            value={value.key}
            onChange={(event) => handlers.setItemProp(index, 'checked', event.currentTarget.checked)}
        />
    ));

    return (
        <>
            <Checkbox
                checked={allChecked}
                indeterminate={indeterminate}
                label={groupLabel}
                onChange={() =>
                    handlers.setState((current) =>
                        current.map((value) => ({ ...value, checked: !allChecked }))
                    )
                }
            />
            {items}
        </>
    );
}

function ChangeAddressButton() {
    return (
        <Button variant="subtle" leftSection={<IconArrowLeft size={14} />} component={Link} to={'/'}
        >Change Address</Button>
    )
}

export default function TradeGroups() {
    const params = useParams();
    const address = params.address as string;
    assertIsAddress(address);

    const { dcas, valueAverages, selectedDcaKeys, selectedValueAverageKeys, mints } = useLoaderData() as Awaited<ReturnType<typeof loader>>;

    const navigation = useNavigation();
    const isLoading = navigation.state === 'loading';

    // Group DCAs by input + output mint
    const groupedDCAs = dcas.reduce((acc, dca) => {
        const key = `${dca.inputMint}-${dca.outputMint}`;
        acc[key] ??= [];
        acc[key].push(dca);
        return acc;
    }, {} as Record<string, DCAFetchedAccount[]>);

    const groupedValueAverages = valueAverages.reduce((acc, va) => {
        const key = `${va.inputMint}-${va.outputMint}`;
        acc[key] ??= [];
        acc[key].push(va);
        return acc;
    }, {} as Record<string, ValueAverageFetchedAccount[]>);

    const allSelectedKeys = new Set([...selectedDcaKeys, ...selectedValueAverageKeys]);

    return (

        <Container size='sm'>
            <Stack gap='xl' align='center'>
                <Group gap='xl'>
                    <ChangeAddressButton />
                    <Title order={3}>Select items to display</Title>
                    <Space />
                </Group>

                <Form action='/trades'>
                    <Stack align="flex-start" gap='xl'>
                        <input type='hidden' name='userAddress' value={address} />
                        {Object.keys(groupedDCAs).length > 0 ?
                            <Stack gap='sm'>
                                <Title order={4}>DCAs (Dollar-Cost Averages)</Title>
                                {Object.entries(groupedDCAs).map(([key, dcas]) => <CheckboxGroup key={key} accounts={dcas} field="dca" selectedKeys={allSelectedKeys} mints={mints} />)}
                            </Stack>
                            : <Text>No Jupiter DCAs found for {address}</Text>
                        }

                        {Object.keys(groupedValueAverages).length > 0 ?
                            <Stack gap='sm'>
                                <Title order={4}>VAs (Value Averages)</Title>
                                {Object.entries(groupedValueAverages).map(([key, vas]) => <CheckboxGroup key={key} accounts={vas} field="va" selectedKeys={allSelectedKeys} mints={mints} />)}
                            </Stack>
                            : <Text>No Jupiter VAs found for {address}</Text>
                        }

                        <Button type="submit" loading={isLoading}>Submit</Button>
                    </Stack>
                </Form>
            </Stack>
        </Container>
    )
}
