import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "detour",
  },
  description:
    "The best drives near you: twisty, scenic, smooth and quiet roads.",
  title: "detour",
};

export const viewport: Viewport = {
  themeColor: [
    { color: "#ffffff", media: "(prefers-color-scheme: light)" },
    { color: "#0b0b0b", media: "(prefers-color-scheme: dark)" },
  ],
  viewportFit: "cover",
  width: "device-width",
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <body className="font-sans antialiased">{children}</body>
  </html>
);

export default RootLayout;
