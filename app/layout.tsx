import type { Metadata } from "next";
import "./globals.css";
import PwaSetup from "./components/pwa-setup";
import MetaPixel from "./components/meta-pixel";
import { getMetaPixelId } from "../lib/meta-pixel";
import { SITE_NAME, SITE_URL, SEO_KEYWORDS, GOOGLE_SITE_VERIFICATION } from "../lib/site";

const title = "Best Philly Cheesesteaks in Burbank, CA | Philly on the Block";
const description =
  "Burbank's Philly cheesesteak spot: hand-chopped cheesesteaks on freshly baked bread, loaded OTB Fries, and cold Cokes at 2600 W Victory Blvd. Order pickup or delivery online.";

// Always point canonicals, Open Graph URLs, and images at the public domain.
// The same Worker also answers on admin./driver. subdomains; deriving these
// from the request host made those hosts look like duplicate copies of the
// site to search engines.
const socialImage = `${SITE_URL}/og.png`;
const socialDescription =
  "Hand-chopped Philly cheesesteaks, loaded OTB Fries, and cold Cokes in Burbank, CA. Pickup or delivery near Glendale, North Hollywood, and Toluca Lake.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: `%s | ${SITE_NAME}` },
  description,
  applicationName: SITE_NAME,
  keywords: SEO_KEYWORDS,
  category: "restaurant",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: { telephone: false },
  ...(GOOGLE_SITE_VERIFICATION ? { verification: { google: GOOGLE_SITE_VERIFICATION } } : {}),
  openGraph: {
    title,
    description: socialDescription,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
    images: [{ url: socialImage, width: 1733, height: 909, alt: "Philly on the Block cheesesteaks in Burbank, CA" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: socialDescription,
    images: [socialImage],
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pixelId = await getMetaPixelId();

  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icons/favicon-48.png" sizes="48x48" />
        <link rel="icon" href="/images/Philly_On_The_Block_Logo.png" sizes="1230x1278" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="theme-color" content="#007404" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Philly OTB" />
        <meta name="geo.region" content="US-CA" />
        <meta name="geo.placename" content="Burbank" />
        <meta name="geo.position" content="34.1841;-118.3396" />
        <meta name="ICBM" content="34.1841, -118.3396" />
        {pixelId && (
          <script
            dangerouslySetInnerHTML={{
              __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`,
            }}
          />
        )}
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "@id": `${SITE_URL}/#website`,
              name: SITE_NAME,
              alternateName: ["Philly OTB", "Philly on the Block Burbank"],
              url: SITE_URL,
              description,
              inLanguage: "en-US",
              publisher: { "@id": `${SITE_URL}/#restaurant` },
            }),
          }}
        />
        <MetaPixel pixelId={pixelId} />
        <PwaSetup />
        {children}
      </body>
    </html>
  );
}
