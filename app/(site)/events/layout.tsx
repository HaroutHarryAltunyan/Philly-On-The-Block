import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "../../../lib/site";

export const metadata: Metadata = {
  title: { absolute: `Cheesesteak Catering in Burbank | ${SITE_NAME}` },
  description:
    "Book Philly on the Block for cheesesteak catering, birthdays, office lunches, film and studio sets, and private parties in Burbank, Glendale, North Hollywood, and the San Fernando Valley.",
  alternates: { canonical: "/events" },
  openGraph: {
    title: `Cheesesteak Catering & Events in Burbank | ${SITE_NAME}`,
    description: "Book Philly on the Block for cheesesteak catering and private events in Burbank, CA.",
    url: `${SITE_URL}/events`,
    type: "website",
  },
};

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
