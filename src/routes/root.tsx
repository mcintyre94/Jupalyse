import { Container } from "@mantine/core";
import React from "react";
import { Outlet } from "react-router-dom";

export default function Root() {
  return (
    <Container py={20}>
      <Outlet />
    </Container>
  );
}