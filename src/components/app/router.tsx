"use client";

// CineFlow AI — hash router. The product runs as a single-route SPA; views are
// addressable as #/dashboard, #/agent, #/incidents/INC-1042, #/demo, etc.

import { useEffect, useState } from "react";

export type View =
  | "landing"
  | "dashboard"
  | "agent"
  | "incidents"
  | "incident"
  | "compare"
  | "workflows"
  | "infra"
  | "recommendations"
  | "analytics"
  | "reports"
  | "integrations"
  | "audit"
  | "settings"
  | "architecture"
  | "demo";

export interface Route {
  view: View;
  id?: string;
  /** Second path segment (e.g. incident B of #/compare/{idA}/{idB}). */
  id2?: string;
  /** Query params parsed from the hash (e.g. `#/agent?run=x` → `{ run: "x" }`). */
  query?: Record<string, string>;
}

const VIEWS: View[] = [
  "landing", "dashboard", "agent", "incidents", "incident", "compare", "workflows",
  "infra", "recommendations", "analytics", "reports", "integrations",
  "audit", "settings", "architecture", "demo",
];

export function parseHash(hash: string): Route {
  // Split the path from an optional query string (#/agent?run=…).
  const [pathPart, queryPart] = hash.replace(/^#\/?/, "").split("?");
  const parts = pathPart.split("/").filter(Boolean);
  if (parts.length === 0) return { view: "landing" };
  // #/compare/{idA}/{idB} carries two ids; every other view keeps using the
  // first segment only (id2 stays undefined).
  const [view, id, id2] = parts;
  let query: Record<string, string> | undefined;
  if (queryPart) {
    const params = [...new URLSearchParams(queryPart).entries()].filter(([k]) => k.length > 0);
    if (params.length > 0) query = Object.fromEntries(params);
  }
  if (VIEWS.includes(view as View)) return { view: view as View, id, id2, query };
  return { view: "landing" };
}

export function navigate(path: string) {
  const target = path.startsWith("#") ? path : `#${path.startsWith("/") ? path : `/${path}`}`;
  if (window.location.hash === target) return;
  window.location.hash = target;
}

export function useRoute(): Route {
  // Always render "landing" for the first (hydration) paint so SSR markup and
  // the client's first render match even when a deep link like #/dashboard is
  // loaded directly. The real hash route is adopted in a post-mount effect —
  // one frame later, with zero hydration warnings.
  const [route, setRoute] = useState<Route>({ view: "landing" });
  useEffect(() => {
    const apply = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);
  return route;
}
