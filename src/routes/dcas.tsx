import { Button, Checkbox, Container, Group, Stack, Text, Title } from "@mantine/core";
import { Address, assertIsAddress, isAddress } from "@solana/web3.js";
import { Form, Link, LoaderFunctionArgs, redirect, useLoaderData, useNavigation, useParams } from "react-router-dom";
import { DCAFetchedAccount, DCAStatus, FetchDCAsResponse, MintData } from "../types";
import { useListState } from "@mantine/hooks";
import { numberDisplay } from "../number-display";
import { getMintData } from "../mint-data";
import { IconArrowLeft } from "@tabler/icons-react";

async function getClosedDCAs(address: Address) {
    const response = await fetch(`https://dca-api.jup.ag/user/${address}?status=${DCAStatus.CLOSED}`);
    const data = await response.json() as FetchDCAsResponse
    if (!data.ok) {
        throw new Error("Error fetching closed DCAs from Jupiter");
    }
    return data.data.dcaAccounts;
}

async function getOpenDCAs(address: Address) {
    const response = await fetch(`https://dca-api.jup.ag/user/${address}?status=${DCAStatus.OPEN}`);
    const data = await response.json() as FetchDCAsResponse
    if (!data.ok) {
        throw new Error("Error fetching open DCAs from Jupiter");
    }
    return data.data.dcaAccounts;
}

export async function loader({ params, request }: LoaderFunctionArgs) {
    const address = params.address as string;

    if (!isAddress(address)) {
        throw new Error("Invalid address");
    }

    const closedDCAs = await getClosedDCAs(address);
    const openDCAs = await getOpenDCAs(address);

    const uniqueMintAddresses: Address[] = Array.from(new Set<Address>([
        ...closedDCAs.flatMap(dca => [dca.inputMint, dca.outputMint]),
        ...openDCAs.flatMap(dca => [dca.inputMint, dca.outputMint]),
    ]));

    const mints = await getMintData(uniqueMintAddresses);

    const dcaKeys = new Set(new URL(request.url).searchParams.getAll("dca") as Address[]);

    return {
        dcas: [...closedDCAs, ...openDCAs],
        selectedDcaKeys: dcaKeys,
        mints,
    };
}

export async function action({ request }: { request: Request }) {
    const formData = await request.formData();
    const dcaKeys = formData.getAll("dca") as Address[];

    const redirectUrl = new URL('/fills', window.location.href);
    for (const dcaKey of dcaKeys) {
        redirectUrl.searchParams.append("dca", dcaKey);
    }

    return redirect(redirectUrl.toString());
}

type CheckboxGroupProps = {
    dcas: DCAFetchedAccount[],
    selectedDcaKeys: Set<Address>
    mints: MintData[],
}

function CheckboxGroup({ dcas, selectedDcaKeys, mints }: CheckboxGroupProps) {
    const { inputMint, outputMint } = dcas[0];
    const inputMintData = mints.find(mint => mint.address === inputMint);
    const outputMintData = mints.find(mint => mint.address === outputMint);
    const groupLabel = `${inputMintData?.symbol ?? `Unknown (${inputMint})`} -> ${outputMintData?.symbol ?? `Unknown (${outputMint})`}`;

    const initialValues = dcas.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(dca => {
        const date = new Date(dca.createdAt);
        const friendlyDate = date.toLocaleDateString();
        const friendlyTime = date.toLocaleTimeString();
        const inputAmount = inputMintData ? `${numberDisplay(dca.inDeposited, inputMintData.decimals)} ${inputMintData.symbol}` : "Unknown Amount";

        return {
            label: `${inputAmount} - Started ${friendlyDate} ${friendlyTime} ${dca.status === DCAStatus.OPEN ? "(open)" : ""}`,
            checked: selectedDcaKeys.size === 0 || selectedDcaKeys.has(dca.dcaKey),
            key: dca.dcaKey,
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
            name="dca"
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

export default function DCAs() {
    const params = useParams();
    const address = params.address as string;
    assertIsAddress(address);

    const { dcas, selectedDcaKeys, mints } = useLoaderData() as Awaited<ReturnType<typeof loader>>;

    const navigation = useNavigation();
    const isLoading = navigation.state === 'loading';

    // Group DCAs by input + output mint
    const groupedDCAs = dcas.reduce((acc, dca) => {
        const key = `${dca.inputMint}-${dca.outputMint}`;
        acc[key] ??= [];
        acc[key].push(dca);
        return acc;
    }, {} as Record<string, DCAFetchedAccount[]>);

    return (
        <Container>
            <Stack gap='xl'>
                <Group gap='xl'>
                    <ChangeAddressButton />
                    <Title order={3}>Select DCAs to display</Title>
                </Group>

                {Object.keys(groupedDCAs).length > 1 ? (
                    <Form method="post">
                        <Stack align="flex-start" gap='xl'>
                            <Stack gap='sm'>
                                {Object.entries(groupedDCAs).map(([key, dcas]) => <CheckboxGroup key={key} dcas={dcas} selectedDcaKeys={selectedDcaKeys} mints={mints} />)}
                            </Stack>
                            <Button type="submit" loading={isLoading}>Submit</Button>
                        </Stack>
                    </Form>
                ) : (
                    <Text>No Jupiter DCAs found for {address}</Text>
                )}
            </Stack>
        </Container>
    )
}
