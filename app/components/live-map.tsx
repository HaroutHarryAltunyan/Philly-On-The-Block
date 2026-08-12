"use client";

import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap, Marker as LeafletMarker } from "leaflet";

import "leaflet/dist/leaflet.css";

type Leaflet = typeof import("leaflet");

export type MapMarker = {
  lat: number;
  lng: number;
  kind: "destination" | "rider" | "store";
  label?: string;
};

export type LiveMapProps = {
  markers: MapMarker[];
  height?: string;
  className?: string;
};

let leaflet: Leaflet | null = null;

export default function LiveMap({ markers, height = "400px", className = "" }: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ map: LeafletMap; markerLayers: LayerGroup } | null>(null);
  const markersRef = useRef<Map<string, LeafletMarker>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let disposed = false;

    import("leaflet").then((mod) => {
      leaflet = (mod as { default: Leaflet }).default;
      if (disposed || !containerRef.current || !leaflet) return;

      const map = leaflet.map(containerRef.current);
      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        })
        .addTo(map);

      const markerLayers = leaflet.layerGroup().addTo(map);
      mapRef.current = { map, markerLayers };
      setLoaded(true);
    });

    return () => {
      disposed = true;
      if (mapRef.current) {
        mapRef.current.map.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !loaded || !leaflet) return;

    const { map, markerLayers } = mapRef.current;
    const L = leaflet;

    markerLayers.clearLayers();
    markersRef.current.clear();

    markers.forEach((marker) => {
      const emoji = marker.kind === "destination" ? "🏠" : marker.kind === "rider" ? "🛵" : "📍";
      const color = marker.kind === "destination" ? "#e74c3c" : marker.kind === "rider" ? "#3498db" : "#95a5a6";

      const icon = L.divIcon({
        className: "otb-map-marker",
        html: `<div style="
          background: ${color};
          color: white;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        ">${emoji}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const leafletMarker = L.marker([marker.lat, marker.lng], { icon }).addTo(markerLayers);
      if (marker.label) {
        leafletMarker.bindPopup(marker.label);
      }
      markersRef.current.set(`${marker.kind}-${marker.lat}-${marker.lng}`, leafletMarker);
    });

    if (markers.length > 1) {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (markers.length === 1) {
      map.setView([markers[0].lat, markers[0].lng], 16);
    }
  }, [markers, loaded]);

  if (!loaded) {
    return (
      <div
        ref={containerRef}
        style={{
          height,
          width: "100%",
          background: "#f0f4f8",
          display: "grid",
          placeItems: "center",
          borderRadius: 12,
          overflow: "hidden",
        }}
        className={className}
      >
        <span style={{ color: "#5c6b7a", fontSize: "0.9rem" }}>Loading map...</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        height,
        width: "100%",
        borderRadius: 12,
        overflow: "hidden",
        position: "relative",
      }}
      className={className}
    />
  );
}
