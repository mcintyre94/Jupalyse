import { Container, Stack } from "@mantine/core";
import { Outlet } from "react-router-dom";

import { Anchor, Group, Text } from "@mantine/core";

export default function Root() {
  return (
    <Container
      fluid
      py={20}
      mih="100vh"
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <Stack justify="space-between" mih="100%" style={{ flex: 1 }}>
        <Outlet />

        <Group justify="space-evenly" mt="xl">
          <Text c="dimmed">
            Built by{" "}
            <Anchor href="https://twitter.com/callum_codes" c="dimmed">
              @callum_codes
            </Anchor>
          </Text>
          <Anchor c="dimmed" href="https://github.com/mcintyre94/jupalyse">
            View source
          </Anchor>
          <Text c="dimmed">Not associated with Jupiter</Text>
        </Group>
      </Stack>
    </Container>
  );
}
