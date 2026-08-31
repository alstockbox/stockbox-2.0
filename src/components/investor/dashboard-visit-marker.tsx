"use client";

import { useEffect } from "react";

export function DashboardVisitMarker() {
  useEffect(() => {
    void fetch("/api/investor/dashboard-visit", { method: "POST", credentials: "same-origin" });
  }, []);
  return null;
}
