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
  MintData,
  ValueAverageFetchedAccount,
  ValueAverageStatus,
  RecurringOrderFetchedAccount,
  TriggerOrderFetchedAccount,
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
  getClosedTriggers,
  getOpenTriggers,
  getRecurringOrdersHistory,
  getRecurringOrdersActive,
  getTriggerOrdersHistory,
  getTriggerOrdersActive,
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
    closedTriggers,
    openTriggers,
  ] = await Promise.all([
    getClosedDCAs(address),
    getOpenDCAs(address),
    getClosedValueAverages(address),
    getOpenValueAverages(address),
    getClosedTriggers(address),
    getOpenTriggers(address),
  ]);

  // Fetch sequentially from Jupiter API to avoid rate limiting
  // Recurring covers both what was previously DCA (time) and value average (price)
  const recurringOrdersHistory = await getRecurringOrdersHistory(address);
  const recurringOrdersActive = await getRecurringOrdersActive(address);
  const triggerOrdersHistory = await getTriggerOrdersHistory(address);
  const triggerOrdersActive = await getTriggerOrdersActive(address);

  const uniqueMintAddresses: Address[] = Array.from(
    new Set<Address>([
      ...closedDCAs.flatMap((dca) => [dca.inputMint, dca.outputMint]),
      ...openDCAs.flatMap((dca) => [dca.inputMint, dca.outputMint]),
      ...closedValueAverages.flatMap((va) => [va.inputMint, va.outputMint]),
      ...openValueAverages.flatMap((va) => [va.inputMint, va.outputMint]),
      ...recurringOrdersHistory.flatMap((order) => [
        order.inputMint,
        order.outputMint,
      ]),
      ...recurringOrdersActive.flatMap((order) => [
        order.inputMint,
        order.outputMint,
      ]),
      ...closedTriggers.flatMap((order) => [order.inputMint, order.outputMint]),
      ...openTriggers.flatMap((order) => [order.inputMint, order.outputMint]),
      ...triggerOrdersHistory.flatMap((order) => [
        order.inputMint,
        order.outputMint,
      ]),
      ...triggerOrdersActive.flatMap((order) => [
        order.inputMint,
        order.outputMint,
      ]),
    ]),
  );

  const mints = await getMintData(uniqueMintAddresses);

  // TODO: rethink these query params? maybe just one param for all? since they're unique
  const dcaKeys = new Set(
    new URL(request.url).searchParams.getAll("dca") as Address[],
  );
  const valueAverageKeys = new Set(
    new URL(request.url).searchParams.getAll("va") as Address[],
  );
  const triggerKeys = new Set(
    new URL(request.url).searchParams.getAll("trigger") as Address[],
  );

  return {
    dcas: [...closedDCAs, ...openDCAs],
    recurringOrdersHistory,
    recurringOrdersActive,
    valueAverages: [...closedValueAverages, ...openValueAverages],
    triggers: [...closedTriggers, ...openTriggers],
    triggerOrdersHistory,
    triggerOrdersActive,
    selectedDcaKeys: dcaKeys,
    selectedValueAverageKeys: valueAverageKeys,
    selectedTriggerKeys: triggerKeys,
    mints,
  };
}

type AccountWithType =
  | { account: DCAFetchedAccount; type: "dca" }
  | { account: ValueAverageFetchedAccount; type: "va" }
  | { account: RecurringOrderWithOrderStatus; type: "recurring" }
  | { account: TriggerOrderWithOrderStatus; type: "trigger" };

type AccountsWithType = {
  [K in AccountWithType["type"]]: Extract<
    AccountWithType,
    { type: K }
  > extends { account: infer A }
    ? { accounts: A[]; type: K }
    : never;
}[AccountWithType["type"]];

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

  if (type === "recurring") {
    const inputAmountDisplay = numberDisplayAlreadyAdjustedForDecimals(
      account.inDeposited,
    );
    if (inputMintData) {
      return `${inputAmountDisplay} ${inputMintData.symbol}`;
    }
    return `${inputAmountDisplay} (Unknown (${account.inputMint}))`;
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

// TODO: also add trigger here - we have history and active there too
function getIsOpen(
  accountWithType: Extract<
    AccountWithType,
    { type: "dca" | "va" | "recurring" }
  >,
): boolean {
  const { account, type } = accountWithType;
  if (type === "dca") {
    return account.status === DCAStatus.OPEN;
  }
  if (type === "recurring") {
    return account.orderStatus === "active";
  }
  return account.status === ValueAverageStatus.OPEN;
}

function getTriggerStatusText(trigger: TriggerOrderFetchedAccount) {
  const { status, trades } = trigger;

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

  if (status === "Open") {
    if (trades.length === 0) {
      return "Open with no trades";
    }
    if (trades.length === 1) {
      return "Open with 1 trade so far";
    }
    return `Open with ${trades.length} trades so far`;
  }

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

  if (type === "recurring") {
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

  if (type === "trigger") {
    const statusText = getTriggerStatusText(account);
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
  if (accountsWithType.type === "recurring") {
    return {
      account: accountsWithType.accounts[0],
      type: "recurring",
    };
  }
  return {
    account: accountsWithType.accounts[0],
    type: "trigger",
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

  if (type === "recurring") {
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

  if (type === "trigger") {
    const statusText = getTriggerStatusText(account);
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
    | AccountsWithType
    | { accounts: DCAFetchedAccount[]; type: "dca" }
    | { accounts: ValueAverageFetchedAccount[]; type: "va" }
    | { accounts: RecurringOrderWithOrderStatus[]; type: "recurring" }
    | { accounts: TriggerOrderWithOrderStatus[]; type: "trigger" };
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

type RecurringOrderWithOrderStatus = RecurringOrderFetchedAccount & {
  orderStatus: "history" | "active";
};

type TriggerOrderWithOrderStatus = TriggerOrderFetchedAccount & {
  orderStatus: "history" | "active";
};

export default function Strategies() {
  const params = useParams();
  const address = params.address as string;
  assertIsAddress(address);

  const {
    recurringOrdersHistory,
    recurringOrdersActive,
    triggerOrdersHistory,
    triggerOrdersActive,
    selectedDcaKeys,
    selectedValueAverageKeys,
    selectedTriggerKeys,
    mints,
  } = useLoaderData() as Awaited<ReturnType<typeof loader>>;

  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  const recurringOrders: RecurringOrderWithOrderStatus[] = [
    ...recurringOrdersHistory.map((order) => ({
      ...order,
      orderStatus: "history" as const,
    })),
    ...recurringOrdersActive.map((order) => ({
      ...order,
      orderStatus: "active" as const,
    })),
  ];

  const triggerOrders: TriggerOrderWithOrderStatus[] = [
    ...triggerOrdersHistory.map((order) => ({
      ...order,
      orderStatus: "history" as const,
    })),
    ...triggerOrdersActive.map((order) => ({
      ...order,
      orderStatus: "active" as const,
    })),
  ];

  const recurringOrdersTime = recurringOrders.filter(
    (order) => order.recurringType === "time",
  );
  const recurringOrdersPrice = recurringOrders.filter(
    (order) => order.recurringType === "price",
  );

  // Group recurring time orders by input + output mint
  const groupedRecurringOrdersTime = recurringOrdersTime.reduce(
    (acc, order) => {
      const key = `${order.inputMint}-${order.outputMint}`;
      acc[key] ??= [];
      acc[key].push(order);
      return acc;
    },
    {} as Record<string, RecurringOrderWithOrderStatus[]>,
  );

  // Group recurring price orders by input + output mint
  const groupedRecurringOrdersPrice = recurringOrdersPrice.reduce(
    (acc, order) => {
      const key = `${order.inputMint}-${order.outputMint}`;
      acc[key] ??= [];
      acc[key].push(order);
      return acc;
    },
    {} as Record<string, RecurringOrderWithOrderStatus[]>,
  );

  // Group triggers by input + output mint
  const groupedTriggers = triggerOrders.reduce(
    (acc, trigger) => {
      const key = `${trigger.inputMint}-${trigger.outputMint}`;
      acc[key] ??= [];
      acc[key].push(trigger);
      return acc;
    },
    {} as Record<string, TriggerOrderWithOrderStatus[]>,
  );

  const allSelectedKeys = new Set([
    ...selectedDcaKeys,
    ...selectedValueAverageKeys,
    ...selectedTriggerKeys,
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

            {recurringOrders.length === 0 ? (
              <Text fs="italic">No recurring orders found for {address}</Text>
            ) : null}

            {Object.keys(groupedRecurringOrdersTime).length > 0 ? (
              <Stack gap="sm">
                <Title order={4}>Recurring (Time)</Title>
                {Object.entries(groupedRecurringOrdersTime).map(
                  ([key, orders]) => (
                    <CheckboxGroup
                      key={key}
                      accountsWithType={{
                        accounts: orders,
                        type: "recurring",
                      }}
                      // Note: we pass allSelectedKeys so that if any trades in any strategies are pre-selected, we only select them
                      selectedKeys={allSelectedKeys}
                      mints={mints}
                    />
                  ),
                )}
              </Stack>
            ) : null}

            {Object.keys(groupedRecurringOrdersPrice).length > 0 ? (
              <Stack gap="sm">
                <Title order={4}>Recurring (Price)</Title>
                {Object.entries(groupedRecurringOrdersPrice).map(
                  ([key, orders]) => (
                    <CheckboxGroup
                      key={key}
                      accountsWithType={{
                        accounts: orders,
                        type: "recurring",
                      }}
                      selectedKeys={allSelectedKeys}
                      mints={mints}
                    />
                  ),
                )}
              </Stack>
            ) : null}

            {Object.keys(groupedTriggers).length > 0 ? (
              <Stack gap="sm">
                <Title order={4}>Triggers</Title>
                {Object.entries(groupedTriggers).map(([key, triggers]) => (
                  <CheckboxGroup
                    key={key}
                    accountsWithType={{
                      accounts: triggers,
                      type: "trigger",
                    }}
                    selectedKeys={allSelectedKeys}
                    mints={mints}
                  />
                ))}
              </Stack>
            ) : (
              <Text fs="italic">
                No Jupiter Trigger orders found for {address}
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
