import { Tooltip, rem } from "@mantine/core";
import { IconCircleCheckFilled } from "@tabler/icons-react";

export function VerifiedIcon() {
  return (
    <Tooltip label="Verified by Jupiter" withArrow position="top">
      <span style={{ display: "flex", marginLeft: 2 }}>
        <IconCircleCheckFilled
          style={{
            width: rem(12),
            height: rem(12),
          }}
          color="var(--mantine-color-gray-6)"
        />
      </span>
    </Tooltip>
  );
}
