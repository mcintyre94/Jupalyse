import {
  Button,
  Container,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { isAddress } from "@solana/web3.js";
import { useState } from "react";
import { Form, redirect, useNavigation } from "react-router-dom";

export async function action({ request }: { request: Request }) {
  const formData = await request.formData();
  const address = formData.get("address")?.toString();

  if (!address || !isAddress(address)) {
    throw new Error("Invalid address");
  }

  return redirect(`/strategies/${address}`);
}

export default function Home() {
  const [validAddress, setValidAddress] = useState<boolean | undefined>(
    undefined,
  );
  const addressColor =
    validAddress === false
      ? "red"
      : validAddress === true
        ? "green"
        : undefined;

  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  return (
    <Container size="xs">
      <Stack gap="xl">
        <Stack gap="xs">
          <Text
            ta="center"
            component="h1"
            variant="gradient"
            gradient={{
              from: "rgb(28, 197, 225) 0.21%",
              to: "rgb(199, 242, 132) 115.96%",
              deg: 89,
            }}
            style={{ fontSize: "5rem" }}
            fw="bolder"
          >
            Jupalyse
          </Text>

          <Title ta="center" order={3}>
            View and download your Jupiter orders
          </Title>
        </Stack>

        <Form method="POST">
          <Stack gap="md" align="flex-start">
            <TextInput
              miw="100%"
              required
              size="lg"
              label="Your Solana Address"
              name="address"
              onChange={(e) => setValidAddress(isAddress(e.target.value))}
              // error={validAddress === false}
              styles={{
                input: {
                  outline: addressColor
                    ? `3px solid ${addressColor}`
                    : undefined,
                },
              }}
            />

            <Button
              type="submit"
              size="md"
              disabled={validAddress !== true}
              loading={isLoading}
            >
              Fetch
            </Button>
          </Stack>
        </Form>
      </Stack>
    </Container>
  );
}
