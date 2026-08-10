import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Philly on the Block | Cheesesteaks with attitude",
  description:
    "Philly-born cheesesteaks, chopped fresh and built to order. Pickup and delivery from Philly on the Block.",
  openGraph: {
    title: "Philly on the Block",
    description: "Big flavor. No shortcuts. Cheesesteaks built on the block.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
