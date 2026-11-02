import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "../../lib/site";

export const metadata: Metadata = {
  title: { absolute: `Cheesesteak Catering & Events in Burbank, CA | ${SITE_NAME}` },
  description:
    "Book Philly on the Block for cheesesteak catering, birthdays, office lunches, studio sets, and private parties in Burbank, Glendale, North Hollywood, and the San Fernando Valley.",
  alternates: { canonical: "/reserve" },
  openGraph: {
    title: `Cheesesteak Catering & Events in Burbank | ${SITE_NAME}`,
    description:
      "Book Philly on the Block for cheesesteak catering and private events in Burbank, CA.",
    url: `${SITE_URL}/reserve`,
    type: "website",
  },
};
