import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import PwaSetup from "./components/pwa-setup";

const title = "Philly on the Block | Cheesesteaks with attitude";
const description =
  "Cheesesteaks, loaded OTB Fries, and cold Cokes at 2600 W Victory Blvd in Burbank, California.";

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
      description: "Cheesesteaks, loaded OTB Fries, and cold Cokes in Burbank, California.",
      type: "website",
      images: [{ url: socialImage, width: 1733, height: 909, alt: "Philly on the Block in Burbank" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Philly on the Block",
      description: "Cheesesteaks, loaded OTB Fries, and cold Cokes in Burbank, California.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="theme-color" content="#007404" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Philly OTB" />
      </head>
      <body>
        <PwaSetup />
        {children}
      </body>
    </html>
  );
}
