"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../lib/admin-client";

type DriverSession = { authenticated: true; driver: { id: number; name: string; phone: string } } | { authenticated: false };

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<DriverSession>({ authenticated: false });

  useEffect(() => {
    if (pathname === "/dashboard/drivers/login" || pathname === "/dashboard/drivers/manage") return;
    api<DriverSession>("/api/admin/drivers/me")
      .then((me) => {
        if (!me.authenticated) {
          router.replace("/dashboard/drivers/login");
        } else {
          setSession(me);
        }
      })
      .catch(() => router.replace("/dashboard/drivers/login"));
  }, [router, pathname]);

  if (pathname === "/dashboard/drivers/login" || pathname === "/dashboard/drivers/manage") return <>{children}</>;
  if (session.authenticated !== true) return null;

  return <>{children}</>;
}
