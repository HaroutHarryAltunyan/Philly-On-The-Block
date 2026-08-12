"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import SiteHeader from "../../components/site-header";
import LiveMap, { MapMarker } from "../../components/live-map";
import { api, ORDER_STATUS_LABELS } from "../../../lib/admin-client";
import { milesBetween, STORE_LOCATION, geocodeAddress, parseCoordinatePair } from "@/lib/tracking";

type DriverSession = { authenticated: true; driver: { id: number; name: string; phone: string } } | { authenticated: false };
type AdminSession = { authenticated: boolean };

type AuthenticatedDriver = DriverSession & { authenticated: true };

function isAuthenticatedDriver(session: DriverSession): session is AuthenticatedDriver {
  return session.authenticated === true;
}

type OrderInfo = {
  id: number;
  orderNumber: string;
  name: string;
  phone: string;
  address: string;
  destLat: string;
  destLng: string;
  driverId: number | null;
  driverLat: string;
  driverLng: string;
  driverUpdatedAt: string | null;
  status: string;
};

export default function DrivingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get("order");
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [driver, setDriver] = useState<DriverSession>({ authenticated: false });
  const [error, setError] = useState("");
  const [geoError, setGeoError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [currentLat, setCurrentLat] = useState<number | null>(null);
  const [currentLng, setCurrentLng] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [geocodedDest, setGeocodedDest] = useState<{
    orderId: number;
    latitude: number;
    longitude: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const watchIdRef = useRef<number | null>(null);
  const lastPostRef = useRef(0);
  const lastPosRef = useRef({ lat: 0, lng: 0 });

  const knownDest = useMemo(
    () => (order ? parseCoordinatePair(order.destLat, order.destLng) : null),
    [order],
  );
  const destCoords = useMemo(
    () =>
      knownDest ??
      (geocodedDest && order && geocodedDest.orderId === order.id
        ? { latitude: geocodedDest.latitude, longitude: geocodedDest.longitude }
        : null),
    [knownDest, geocodedDest, order],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<DriverSession>("/api/admin/drivers/me").catch(() => ({ authenticated: false } as DriverSession)),
      api<AdminSession>("/api/admin/me").catch(() => ({ authenticated: false } as AdminSession)),
    ]).then(([driverResult, adminResult]) => {
      if (cancelled) return;
      const isDriver = driverResult.authenticated === true;
      const isAdmin = adminResult.authenticated === true;
      if (!isDriver && !isAdmin) {
        setDriver({ authenticated: false });
      } else {
        if (isDriver && isAuthenticatedDriver(driverResult)) setDriver(driverResult);
      }
      if (!orderId) return;
      api<{ orders: OrderInfo[] }>(`/api/admin/orders`)
        .then((data) => {
          const found = data.orders.find((o) => String(o.id) === orderId);
          if (!found) {
            setError("Order not found");
            setLoading(false);
            return;
          }
          if (isDriver && isAuthenticatedDriver(driverResult) && found.driverId !== driverResult.driver.id) {
            setError("This order is not assigned to you");
            setLoading(false);
            return;
          }
          setOrder(found);
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Failed to load order");
          setLoading(false);
        });
    });
    return () => { cancelled = true; };
  }, [orderId, router]);

  const distance = useMemo(() => {
    if (!order || !destCoords || currentLat === null || currentLng === null) return "";
    const dist = milesBetween(
      { latitude: currentLat, longitude: currentLng },
      { latitude: destCoords.latitude, longitude: destCoords.longitude },
    );
    return dist < 1
      ? "Less than 1 mile from delivery"
      : `${Math.round(dist)} miles from delivery`;
  }, [order, destCoords, currentLat, currentLng]);

  useEffect(() => {
    if (!order || knownDest || !order.address) return;
    let cancelled = false;
    geocodeAddress(order.address).then((coords) => {
      if (!cancelled && coords) setGeocodedDest({ orderId: order.id, ...coords });
    });
    return () => {
      cancelled = true;
    };
  }, [order, knownDest]);

  useEffect(() => {
    if (!order) return;
    const timer = window.setInterval(() => {
      api<{ orders: OrderInfo[] }>(`/api/admin/orders`)
        .then((data) => {
          const updated = data.orders.find((o) => String(o.id) === orderId);
          if (updated) setOrder(updated);
        })
        .catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [order, orderId, driver]);

  function stopSharing() {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharing(false);
    setCurrentLat(null);
    setCurrentLng(null);
  }

  function geolocationErrorMessage(err: GeolocationPositionError) {
    switch (err.code) {
      case err.PERMISSION_DENIED:
        return "Location permission was denied. When your browser asks for access, tap \"Allow\", or enable location for this site in your browser settings, then try again.";
      case err.POSITION_UNAVAILABLE:
        return "Your location is currently unavailable. Make sure GPS or wifi is turned on and you have reception, then try again.";
      default:
        return `Geolocation error: ${err.message}`;
    }
  }

  async function startSharing() {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser");
      return;
    }

    setSharing(true);
    setGeoError("");
    setError("");

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCurrentLat(lat);
        setCurrentLng(lng);

        const now = Date.now();
        const minTime = 3000;
        const minDist = 50;
        const dist = milesBetween(
          { latitude: lastPosRef.current.lat, longitude: lastPosRef.current.lng },
          { latitude: lat, longitude: lng },
        ) * 1609.34;

        if (now - lastPostRef.current >= minTime || dist >= minDist) {
          lastPostRef.current = now;
          lastPosRef.current = { lat, lng };
          if (orderId) {
            fetch(`/api/admin/orders/${orderId}/location`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ latitude: String(lat), longitude: String(lng) }),
            })
              .then((res) => {
                if (res.ok) {
                  setLastUpdate(new Date().toLocaleTimeString());
                  setGeoError("");
                  return;
                }
                return res
                  .json()
                  .then((body) => {
                    const message =
                      body && typeof body.error === "string"
                        ? body.error
                        : `Location update failed (${res.status})`;
                    setGeoError(`Location sharing issue: ${message}`);
                  })
                  .catch(() => {
                    setGeoError(`Location update failed (${res.status})`);
                  });
              })
              .catch(() => {
                setGeoError("Could not reach the server to share your location. Check your connection.");
              });
          }
        }
      },
      (err) => {
        stopSharing();
        setGeoError(geolocationErrorMessage(err));
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 },
    );

    watchIdRef.current = id;
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  async function markDelivered() {
    if (!orderId) return;
    stopSharing();
    try {
      await api<{ order: OrderInfo }>(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      });
      router.push(driver.authenticated === true ? "/dashboard/drivers" : "/dashboard/orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark delivered");
    }
  }

  const markers: MapMarker[] = [
    { lat: STORE_LOCATION.latitude, lng: STORE_LOCATION.longitude, kind: "store", label: "Philly on the Block" },
    ...(destCoords
      ? [{ lat: destCoords.latitude, lng: destCoords.longitude, kind: "destination" as const, label: order?.address || "Delivery address" }]
      : []),
    ...(currentLat !== null && currentLng !== null ? [{ lat: currentLat, lng: currentLng, kind: "rider" as const }] : []),
  ];

  if (loading) {
    return (
      <>
        <SiteHeader />
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 1.25rem", fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)" }}>
          <p>Loading…</p>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <SiteHeader />
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 1.25rem", fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)" }}>
          <div style={{ border: "2px solid #0b0b0d", background: "#f8d7da", borderRadius: 8, padding: "1rem", fontWeight: 600, marginBottom: "1rem" }}>{error}</div>
          <Link href={driver.authenticated === true ? "/dashboard/drivers" : "/dashboard/orders"} style={{ color: "#3a6ea5" }}>← Back to dashboard</Link>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem 1.25rem 3rem", fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
          <div>
            <Link
              href={driver.authenticated === true ? "/dashboard/drivers" : "/dashboard/orders"}
              style={{ color: "#3a6ea5", fontSize: "0.85rem", textDecoration: "underline" }}
            >
              ← Back to dashboard
            </Link>
            <h1 style={{ fontSize: "1.6rem", margin: "0.3rem 0 0" }}>
              Delivery GPS — {order?.orderNumber || "Loading..."}
            </h1>
            {order && (
              <p style={{ color: "#5c6b7a", margin: "0.25rem 0 0", fontSize: "0.9rem" }}>
                Customer: {order.name} · {order.phone} · {order.address}
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {order && order.status !== "completed" && order.status !== "cancelled" && (
              <span style={{
                fontWeight: 700,
                fontSize: "0.78rem",
                letterSpacing: "0.08em",
                padding: "0.25rem 0.7rem",
                borderRadius: 999,
                border: "2px solid #0b0b0d",
                background: "#badaff",
                textTransform: "uppercase",
              }}>
                {ORDER_STATUS_LABELS[order.status as "new" | "preparing" | "ready" | "delivering" | "completed" | "cancelled"] || order.status}
              </span>
            )}
            {!sharing ? (
              <button
                onClick={startSharing}
                disabled={sharing}
                style={{ border: "2px solid #0b0b0d", background: "#badaff", color: "#0b0b0d", fontWeight: 800, padding: "0.5rem 1rem", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}
              >
                Start sharing location
              </button>
            ) : (
              <button
                onClick={stopSharing}
                style={{ border: "2px solid #0b0b0d", background: "#f8d7da", color: "#0b0b0d", fontWeight: 800, padding: "0.5rem 1rem", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}
              >
                Stop sharing
              </button>
            )}
            {order && order.status === "delivering" && (
              <button
                onClick={markDelivered}
                style={{ border: "2px solid #0b0b0d", background: "#d4edda", color: "#0b0b0d", fontWeight: 800, padding: "0.5rem 1rem", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}
              >
                Mark delivered
              </button>
            )}
          </div>
        </div>

        {geoError && (
          <div style={{ border: "2px solid #0b0b0d", background: "#f8d7da", borderRadius: 8, padding: "0.7rem 0.9rem", fontWeight: 600, marginBottom: "1rem" }}>
            {geoError}
          </div>
        )}

        {order && (
          <div style={{ border: "2px solid #0b0b0d", borderRadius: 12, padding: "0.9rem 1rem", background: "#fff", marginBottom: "1rem", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>🏠 Delivering to</div>
              <div style={{ fontSize: "0.9rem", marginTop: "0.15rem" }}>{order.address}</div>
              <div style={{ fontSize: "0.78rem", color: "#5c6b7a" }}>
                {order.name} · {order.phone}
              </div>
            </div>
            {distance && (
              <div style={{ fontWeight: 700, fontSize: "0.9rem", alignSelf: "center", color: "#3a6ea5" }}>{distance}</div>
            )}
          </div>
        )}

        {order && order.status === "completed" && (
          <div style={{ border: "2px solid #0b0b0d", background: "#d4edda", borderRadius: 8, padding: "1rem", marginBottom: "1rem", fontWeight: 600 }}>
            ✅ This order has been marked as delivered.
          </div>
        )}

        {sharing && lastUpdate && (
          <div style={{ fontSize: "0.82rem", color: "#5c6b7a", marginBottom: "0.5rem" }}>
            Last updated: {lastUpdate}
            {distance && ` · ${distance}`}
          </div>
        )}

        <LiveMap markers={markers} height="500px" />

        <div style={{ marginTop: "1.5rem", fontSize: "0.85rem", color: "#5c6b7a" }}>
          <p><strong>How it works:</strong></p>
          <ol style={{ paddingLeft: "1.5rem" }}>
            <li>When your browser asks for location access, tap &quot;Allow&quot; — without it the map can&apos;t track you</li>
            <li>Click &quot;Start sharing location&quot; to begin sending your GPS position</li>
            <li>Your location updates every 3 seconds (or when you move 50m+)</li>
            <li>Customers tracking their order will see your position on their map</li>
            <li>Click &quot;Mark delivered&quot; when the order is dropped off</li>
          </ol>
        </div>
      </main>
    </>
  );
}
