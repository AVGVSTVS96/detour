import { ImageResponse } from "next/og";

export const size = { height: 180, width: 180 };

export const contentType = "image/png";

const AppleIcon = () =>
  new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#0a0a0a",
        color: "#ffe94d",
        display: "flex",
        fontSize: 132,
        fontWeight: 900,
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      d
    </div>,
    size
  );

export default AppleIcon;
