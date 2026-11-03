"use client";

import LiveMap from "../../components/live-map";
import { STORE_LOCATION } from "../../../lib/tracking";

// OpenStreetMap tiles via the existing Leaflet map (already allowed by the
// CSP; no API key). The address and directions links beside it are the
// accessible, text-based alternative.
export default function VisitMap() {
  return (
    <figure className="visit-map">
      <LiveMap markers={[{ lat: STORE_LOCATION.latitude, lng: STORE_LOCATION.longitude, kind: "store", label: "Philly on the Block" }]} height="420px" />
      <figcaption className="sr-only">Map of Philly on the Block at 2600 W Victory Blvd, Burbank, CA 91505.</figcaption>
    </figure>
  );
}
