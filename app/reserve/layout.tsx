import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "../../lib/site";

export const metadata: Metadata = {
  title: `Cheesesteak Catering & Events in Burbank | ${SITE_NAME}`,
  description:
    "Book Philly on the Block for cheesesteak catering, birthdays, corporate lunches, and private parties in Burbank, CA. Tell us about your event and we’ll confirm the details.",
  alternates: { canonical: "/reserve" },
  openGraph: {
    title: `Cheesesteak Catering & Events in Burbank | ${SITE_NAME}`,
    description:
      "Book Philly on the Block for cheesesteak catering and private events in Burbank, CA.",
    url: `${SITE_URL}/reserve`,
    type: "website",
  },
};
