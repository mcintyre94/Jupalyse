import { Container } from "@mantine/core";
import { Outlet } from "react-router-dom";

export default function Root() {
  return (
    <Container fluid py={20}>
      <Outlet />
    </Container>
  );
}
