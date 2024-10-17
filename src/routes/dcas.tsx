import { Button, Checkbox, Stack, Text } from "@mantine/core";
import { Address, assertIsAddress, isAddress } from "@solana/web3.js";
import { Form, LoaderFunctionArgs, redirect, useLoaderData, useParams } from "react-router-dom";
import { DCAFetchedAccount, DCAStatus, FetchDCAsResponse, FetchMintsResponse, MintData } from "../types";
import { randomId, useListState } from "@mantine/hooks";

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

async function getMintData(addresses: Address[]) {
    const url = 'https://token-list-api.solana.cloud/v1/mints?chainId=101';
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            addresses,
        }),
    });

    const data = await response.json() as FetchMintsResponse;

    const fetchedMints = data.content.map(item => item.address);
    const missingMints = addresses.filter(address => !fetchedMints.includes(address));

    if (missingMints.length > 0) {
        // use Jup token list to fetch missing mints
        // Jup has a low rate limit so use as fallback
        const jupFallbackData = await Promise.all(missingMints.map(async (address) => {
            const response = await fetch(`https://tokens.jup.ag/token/${address}`);
            // Jup returns the same structure
            const mintData = await response.json() as MintData;
            return mintData;
        }));

        return [...data.content, ...jupFallbackData];
    }

    return data.content;
}

export async function loader({ params }: LoaderFunctionArgs) {
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

    return {
        dcas: [...closedDCAs, ...openDCAs],
        mints,
    };
}

export async function action({ request }: { request: Request }) {
    console.log("in action!");
    const formData = await request.formData();
    const dcaKeys = formData.getAll("dca") as Address[];
    console.log({ dcaKeys });

    const redirectUrl = new URL('/dca-data', window.location.href);
    for (const dcaKey of dcaKeys) {
        redirectUrl.searchParams.append("dca", dcaKey);
    }

    return redirect(redirectUrl.toString());
}

type CheckboxGroupProps = {
    dcas: DCAFetchedAccount[],
    mints: MintData[],
}

function CheckboxGroup({ dcas, mints }: CheckboxGroupProps) {
    const { inputMint, outputMint } = dcas[0];
    const inputMintData = mints.find(mint => mint.address === inputMint);
    const outputMintData = mints.find(mint => mint.address === outputMint);
    const label = `${inputMintData?.symbol ?? `Unknown (${inputMint})`} -> ${outputMintData?.symbol ?? `Unknown (${outputMint})`}`;

    const initialValues = dcas.map(dca => {
        const date = new Date(dca.createdAt);
        const friendlyDate = date.toLocaleDateString();
        const friendlyTime = date.toLocaleTimeString();

        return {
            label: `Started ${friendlyDate} ${friendlyTime} ${dca.status === DCAStatus.OPEN ? "(open)" : ""}`,
            checked: true,
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
                label={label}
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

export default function DCAs() {
    const params = useParams();
    const address = params.address as string;
    assertIsAddress(address);

    const { dcas, mints } = useLoaderData() as Awaited<ReturnType<typeof loader>>;

    // Group DCAs by input + output mint
    const groupedDCAs = dcas.reduce((acc, dca) => {
        const key = `${dca.inputMint}-${dca.outputMint}`;
        acc[key] ??= [];
        acc[key].push(dca);
        return acc;
    }, {} as Record<string, DCAFetchedAccount[]>);

    return (
        <Form method="post">
            <Stack>
                {Object.entries(groupedDCAs).map(([key, dcas]) => <CheckboxGroup key={key} dcas={dcas} mints={mints} />)}

                <Button type="submit">Submit</Button>
            </Stack>
        </Form>
    )
}
