import {
  Badge,
  Button,
  Checkbox,
  Container,
  Group,
  Space,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Address, assertIsAddress, isAddress } from "@solana/web3.js";
import {
  Form,
  Link,
  LoaderFunctionArgs,
  useLoaderData,
  useNavigation,
  useParams,
} from "react-router-dom";
import {
  DCAFetchedAccount,
  DCAStatus,
  LimitOrderFetchedAccount,
  MintData,
  ValueAverageFetchedAccount,
  ValueAverageStatus,
} from "../types";
import { useListState } from "@mantine/hooks";
import {
  numberDisplay,
  numberDisplayAlreadyAdjustedForDecimals,
} from "../number-display";
import { getMintData } from "../mint-data";
import { IconArrowLeft } from "@tabler/icons-react";
import {
  getClosedDCAs,
  getOpenDCAs,
  getClosedValueAverages,
  getOpenValueAverages,
  getLimitOrdersWithTrades,
} from "../jupiter-api";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const address = params.address as string;

  if (!isAddress(address)) {
    throw new Error("Invalid address");
  }

  const [
    closedDCAs,
    openDCAs,
    closedValueAverages,
    openValueAverages,
    limitOrders,
  ] = await Promise.all([
    getClosedDCAs(address),
    getOpenDCAs(address),
    getClosedValueAverages(address),
    getOpenValueAverages(address),
    getLimitOrdersWithTrades(address),
  ]);

  const uniqueMintAddresses: Address[] = Array.from(
    new Set<Address>([
      ...closedDCAs.flatMap((dca) => [dca.inputMint, dca.outputMint]),
      ...openDCAs.flatMap((dca) => [dca.inputMint, dca.outputMint]),
      ...closedValueAverages.flatMap((va) => [va.inputMint, va.outputMint]),
      ...openValueAverages.flatMap((va) => [va.inputMint, va.outputMint]),
      ...limitOrders.flatMap((order) => [order.inputMint, order.outputMint]),
    ]),
  );

  const mints = await getMintData(uniqueMintAddresses);

  const dcaKeys = new Set(
    new URL(request.url).searchParams.getAll("dca") as Address[],
  );
  const valueAverageKeys = new Set(
    new URL(request.url).searchParams.getAll("va") as Address[],
  );
  const limitOrderKeys = new Set(
    new URL(request.url).searchParams.getAll("lo") as Address[],
  );
  return {
    dcas: [...closedDCAs, ...openDCAs],
    valueAverages: [...closedValueAverages, ...openValueAverages],
    limitOrders,
    selectedDcaKeys: dcaKeys,
    selectedValueAverageKeys: valueAverageKeys,
    selectedLimitOrderKeys: limitOrderKeys,
    mints,
  };
}

type AccountWithType =
  | { account: DCAFetchedAccount; type: "dca" }
  | { account: ValueAverageFetchedAccount; type: "va" }
  | { account: LimitOrderFetchedAccount; type: "lo" };

type AccountsWithType =
  | { accounts: DCAFetchedAccount[]; type: "dca" }
  | { accounts: ValueAverageFetchedAccount[]; type: "va" }
  | { accounts: LimitOrderFetchedAccount[]; type: "lo" };

function getKey(accountWithType: AccountWithType) {
  const { account, type } = accountWithType;
  if (type === "dca") {
    return account.dcaKey;
  }
  if (type === "va") {
    return account.valueAverageKey;
  }
  return account.orderKey;
}

function getInputAmountWithSymbol(
  accountWithType: AccountWithType,
  inputMintData: MintData | undefined,
): String {
  const { account, type } = accountWithType;

  if (type === "dca" || type === "va") {
    if (inputMintData) {
      return `${numberDisplay(account.inDeposited, inputMintData.decimals)} ${inputMintData.symbol}`;
    }
    return `Unknown Amount (${account.inputMint})`;
  }

  // limit order
  if (inputMintData) {
    // makingAmount is already adjusted for decimals, but is not optimal for display to users
    return `${numberDisplayAlreadyAdjustedForDecimals(account.makingAmount)} ${inputMintData.symbol}`;
  }
  return `${account.makingAmount} (Unknown (${account.inputMint}))`;
}

function getOutputDisplay(
  account: AccountWithType["account"],
  mints: MintData[],
): string {
  const outputMintData = mints.find(
    (mint) => mint.address === account.outputMint,
  );

  if (outputMintData) {
    return outputMintData.symbol;
  }
  return `Unknown (${account.outputMint})`;
}

function getIsOpen(
  accountWithType: Extract<AccountWithType, { type: "dca" | "va" }>,
): boolean {
  const { account, type } = accountWithType;
  if (type === "dca") {
    return account.status === DCAStatus.OPEN;
  }
  return account.status === ValueAverageStatus.OPEN;
}

function getLimitOrderStatusText(limitOrder: LimitOrderFetchedAccount) {
  const { status, trades } = limitOrder;

  if (status === "Completed") {
    if (trades.length === 0) {
      return "Completed with no trades";
    }
    if (trades.length === 1) {
      return "Completed after 1 trade";
    }
    return `Completed after ${trades.length} trades`;
  }

  if (status === "Cancelled") {
    if (trades.length === 0) {
      return "Cancelled with no trades";
    }
    if (trades.length === 1) {
      return "Cancelled after 1 trade";
    }
    return `Cancelled after ${trades.length} trades`;
  }

  // TODO: other status values
  return undefined;
}

function SingleItemCheckboxLabel({
  accountWithType,
  mints,
}: {
  accountWithType: AccountWithType;
  mints: MintData[];
}) {
  const { account, type } = accountWithType;

  const inputMintData = mints.find(
    (mint) => mint.address === account.inputMint,
  );

  const inputAmountWithSymbol = getInputAmountWithSymbol(
    accountWithType,
    inputMintData,
  );
  const outputDisplay = getOutputDisplay(account, mints);

  const createdAtDate = new Date(account.createdAt);
  const friendlyDate = createdAtDate.toLocaleDateString();
  const friendlyTime = createdAtDate.toLocaleTimeString();

  if (type === "dca" || type === "va") {
    const isOpen = getIsOpen(accountWithType);

    return (
      <Group>
        <Text size="sm">
          {inputAmountWithSymbol} {"->"} {outputDisplay} • Started{" "}
          {friendlyDate} {friendlyTime}
        </Text>
        {isOpen ? (
          <Badge size="xs" variant="outline" c="green.1">
            Open
          </Badge>
        ) : null}
      </Group>
    );
  }

  if (type === "lo") {
    const statusText = getLimitOrderStatusText(account);
    return (
      <Group>
        <Text size="sm">
          {inputAmountWithSymbol} {"->"} {outputDisplay} • Opened {friendlyDate}{" "}
          {friendlyTime} {statusText ? `• ${statusText}` : null}
        </Text>
      </Group>
    );
  }
}

type BaseCheckboxGroupProps = {
  selectedKeys: Set<Address>;
  mints: MintData[];
};

type SingleItemCheckboxGroupProps = BaseCheckboxGroupProps & {
  accountWithType: AccountWithType;
};

function SingleItemCheckboxGroup({
  selectedKeys,
  mints,
  accountWithType,
}: SingleItemCheckboxGroupProps) {
  const key = getKey(accountWithType);
  const defaultChecked = getDefaultChecked(selectedKeys, key);

  return (
    <Checkbox
      defaultChecked={defaultChecked}
      label={
        <SingleItemCheckboxLabel
          accountWithType={accountWithType}
          mints={mints}
        />
      }
      name={accountWithType.type}
      value={key}
    />
  );
}

function getGroupLabel(
  account: AccountsWithType["accounts"][0],
  inputMintData: MintData | undefined,
  outputMintData: MintData | undefined,
) {
  const { inputMint, outputMint } = account;
  return `${inputMintData?.symbol ?? `Unknown (${inputMint})`} -> ${outputMintData?.symbol ?? `Unknown (${outputMint})`}`;
}

function getFirstAccountWithType(
  accountsWithType: AccountsWithType,
): AccountWithType {
  if (accountsWithType.type === "dca") {
    return {
      account: accountsWithType.accounts[0],
      type: "dca",
    };
  }
  if (accountsWithType.type === "va") {
    return {
      account: accountsWithType.accounts[0],
      type: "va",
    };
  }
  return {
    account: accountsWithType.accounts[0],
    type: "lo",
  };
}

function CheckboxGroupItemLabel({
  accountWithType,
  inputMintData,
}: {
  accountWithType: AccountWithType;
  inputMintData: MintData | undefined;
}) {
  const { account, type } = accountWithType;

  const inputAmountWithSymbol = getInputAmountWithSymbol(
    accountWithType,
    inputMintData,
  );

  const date = new Date(account.createdAt);
  const friendlyDate = date.toLocaleDateString();
  const friendlyTime = date.toLocaleTimeString();

  if (type === "dca" || type === "va") {
    const isOpen = getIsOpen(accountWithType);

    return (
      <Group align="center">
        <Text size="sm">
          {inputAmountWithSymbol} • Started {friendlyDate} {friendlyTime}
        </Text>
        {isOpen ? (
          <Badge size="xs" variant="outline" c="green.1">
            Open
          </Badge>
        ) : null}
      </Group>
    );
  }

  if (type === "lo") {
    const statusText = getLimitOrderStatusText(account);
    return (
      <Group align="center">
        <Text size="sm">
          {inputAmountWithSymbol} • Opened {friendlyDate} {friendlyTime}{" "}
          {statusText ? `• ${statusText}` : null}
        </Text>
      </Group>
    );
  }
}

type MultipleItemCheckboxGroupProps = BaseCheckboxGroupProps & {
  accountsWithType: AccountsWithType;
};

function MultipleItemCheckboxGroup({
  selectedKeys,
  mints,
  accountsWithType,
}: MultipleItemCheckboxGroupProps) {
  const { accounts, type } = accountsWithType;

  const inputMintData = mints.find(
    (mint) => mint.address === accounts[0].inputMint,
  );
  const outputMintData = mints.find(
    (mint) => mint.address === accounts[0].outputMint,
  );

  const groupLabel = getGroupLabel(
    accountsWithType.accounts[0],
    inputMintData,
    outputMintData,
  );

  const initialValues = accounts
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((account) => {
      const accountWithType: AccountWithType = {
        account,
        type,
      } as AccountWithType;
      const inputMintData = mints.find(
        (mint) => mint.address === account.inputMint,
      );

      const key = getKey(accountWithType);

      return {
        label: (
          <CheckboxGroupItemLabel
            accountWithType={accountWithType}
            inputMintData={inputMintData}
          />
        ),
        checked: getDefaultChecked(selectedKeys, key),
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
      name={type}
      value={value.key}
      onChange={(event) =>
        handlers.setItemProp(index, "checked", event.currentTarget.checked)
      }
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
            current.map((value) => ({ ...value, checked: !allChecked })),
          )
        }
      />
      {items}
    </>
  );
}

type CheckboxGroupProps = BaseCheckboxGroupProps & {
  accountsWithType:
    | { accounts: DCAFetchedAccount[]; type: "dca" }
    | { accounts: ValueAverageFetchedAccount[]; type: "va" }
    | { accounts: LimitOrderFetchedAccount[]; type: "lo" };
};

function CheckboxGroup({
  accountsWithType,
  selectedKeys,
  mints,
}: CheckboxGroupProps) {
  if (accountsWithType.accounts.length === 0) {
    return null;
  }

  if (accountsWithType.accounts.length === 1) {
    return (
      <SingleItemCheckboxGroup
        selectedKeys={selectedKeys}
        mints={mints}
        accountWithType={getFirstAccountWithType(accountsWithType)}
      />
    );
  }

  return (
    <MultipleItemCheckboxGroup
      selectedKeys={selectedKeys}
      mints={mints}
      accountsWithType={accountsWithType}
    />
  );
}

function getDefaultChecked(selectedKeys: Set<Address>, key: Address) {
  // If no pre-selected keys then select all
  // Otherwise only select pre-selected keys
  return selectedKeys.size === 0 || selectedKeys.has(key);
}

function ChangeAddressButton() {
  return (
    <Button
      variant="subtle"
      leftSection={<IconArrowLeft size={14} />}
      component={Link}
      to={"/"}
    >
      Change Address
    </Button>
  );
}

export default function TradeGroups() {
  const params = useParams();
  const address = params.address as string;
  assertIsAddress(address);

  const {
    dcas,
    valueAverages,
    limitOrders,
    selectedDcaKeys,
    selectedValueAverageKeys,
    selectedLimitOrderKeys,
    mints,
  } = useLoaderData() as Awaited<ReturnType<typeof loader>>;

  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  // Group DCAs by input + output mint
  const groupedDCAs = dcas.reduce(
    (acc, dca) => {
      const key = `${dca.inputMint}-${dca.outputMint}`;
      acc[key] ??= [];
      acc[key].push(dca);
      return acc;
    },
    {} as Record<string, DCAFetchedAccount[]>,
  );

  const groupedValueAverages = valueAverages.reduce(
    (acc, va) => {
      const key = `${va.inputMint}-${va.outputMint}`;
      acc[key] ??= [];
      acc[key].push(va);
      return acc;
    },
    {} as Record<string, ValueAverageFetchedAccount[]>,
  );

  const groupedLimitOrders = limitOrders.reduce(
    (acc, lo) => {
      const key = `${lo.inputMint}-${lo.outputMint}`;
      acc[key] ??= [];
      acc[key].push(lo);
      return acc;
    },
    {} as Record<string, LimitOrderFetchedAccount[]>,
  );

  const allSelectedKeys = new Set([
    ...selectedDcaKeys,
    ...selectedValueAverageKeys,
    ...selectedLimitOrderKeys,
  ]);

  return (
    <Container size="sm">
      <Stack gap="xl" align="center">
        <Group gap="xl">
          <ChangeAddressButton />
          <Title order={3}>Select items to display</Title>
          <Space />
        </Group>

        <Form action="/trades">
          <Stack align="flex-start" gap="xl">
            <input type="hidden" name="userAddress" value={address} />

            {Object.keys(groupedDCAs).length > 0 ? (
              <Stack gap="sm">
                <Title order={4}>DCAs (Dollar-Cost Averages)</Title>
                {Object.entries(groupedDCAs).map(([key, dcas]) => (
                  <CheckboxGroup
                    key={key}
                    accountsWithType={{
                      accounts: dcas,
                      type: "dca",
                    }}
                    // Note: we pass allSelectedKeys so that if any trades in any groups are pre-selected, we only select them
                    selectedKeys={allSelectedKeys}
                    mints={mints}
                  />
                ))}
              </Stack>
            ) : (
              <Text fs="italic">No Jupiter DCAs found for {address}</Text>
            )}

            {Object.keys(groupedValueAverages).length > 0 ? (
              <Stack gap="sm">
                <Title order={4}>VAs (Value Averages)</Title>
                {Object.entries(groupedValueAverages).map(([key, vas]) => (
                  <CheckboxGroup
                    key={key}
                    accountsWithType={{
                      accounts: vas,
                      type: "va",
                    }}
                    selectedKeys={allSelectedKeys}
                    mints={mints}
                  />
                ))}
              </Stack>
            ) : (
              <Text fs="italic">No Jupiter VAs found for {address}</Text>
            )}

            {Object.keys(groupedLimitOrders).length > 0 ? (
              <Stack gap="sm">
                <Title order={4}>Limit Orders</Title>
                {Object.entries(groupedLimitOrders).map(([key, los]) => (
                  <CheckboxGroup
                    key={key}
                    accountsWithType={{
                      accounts: los,
                      type: "lo",
                    }}
                    selectedKeys={allSelectedKeys}
                    mints={mints}
                  />
                ))}
              </Stack>
            ) : (
              <Text fs="italic">
                No Jupiter Limit Orders found for {address}
              </Text>
            )}

            <Button type="submit" loading={isLoading}>
              Submit
            </Button>
          </Stack>
        </Form>
      </Stack>
    </Container>
  );
}
