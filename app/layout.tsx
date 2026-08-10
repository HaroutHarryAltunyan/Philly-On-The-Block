import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "Philly on the Block | Cheesesteaks with attitude";
const description =
  "Philly-born cheesesteaks, chopped fresh and built to order at 2600 W Victory Blvd in Burbank, California.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = host
    ? `${protocol}://${host}`
    : "https://philly-on-the-block.altunyanharoutyunh93.chatgpt.site";
  const socialImage = `${origin}/og.png`;

  return {
    title,
    description,
    openGraph: {
      title: "Philly on the Block",
      description: "Big flavor. No shortcuts. Cheesesteaks built on the block in Burbank, California.",
      type: "website",
      images: [{ url: socialImage, width: 1733, height: 909, alt: "Philly on the Block in Burbank" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Philly on the Block",
      description: "Cheesesteaks built on the block in Burbank, California.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
