import type { Metadata } from "next";
import AccountView from "./account-view";
import { SITE_NAME } from "../../../lib/site";

export const metadata: Metadata = {
  title: { absolute: `Your account | ${SITE_NAME}` },
  robots: { index: false, follow: false },
  alternates: { canonical: "/account" },
};

export default function AccountPage() {
  return <AccountView />;
}
