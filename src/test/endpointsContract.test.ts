import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { ENDPOINTS } from "@/lib/api";

/**
 * Frontend ↔ backend path contract. Reads the backend's route definitions from
 * source and checks that every ENDPOINTS entry points at a real route — the
 * class of bug where the client pages called /proposals/:token while the API
 * served /proposals/view/:token.
 */
const BACKEND = path.resolve(__dirname, "../../backend/src");

function backendRoutes(): string[] {
  const app = fs.readFileSync(path.join(BACKEND, "app.ts"), "utf8");
  const importOf = new Map<string, string>();
  for (const m of app.matchAll(/import (\w+) from "\.\/routes\/([\w.]+)"/g)) importOf.set(m[1], m[2]);

  const routes: string[] = [];
  for (const m of app.matchAll(/app\.use\(`\$\{V1\}([^`]*)`,(?:[^,)]*,)*\s*(\w+)\)/g)) {
    const [, mount, routerName] = m;
    const file = importOf.get(routerName);
    if (!file) continue;
    const src = fs.readFileSync(path.join(BACKEND, "routes", `${file}.ts`), "utf8");
    for (const r of src.matchAll(/router\.(?:get|post|put|patch|delete)\(\s*"([^"]*)"/g)) {
      routes.push(`/v1${mount}${r[1] === "/" ? "" : r[1]}`);
    }
  }
  return routes;
}

const toPattern = (route: string) =>
  new RegExp("^" + route.replace(/:[A-Za-z]+/g, "[^/]+").replace(/\//g, "\\/") + "\\/?$");

// Entries with no backend route yet, each scheduled in PRODUCTION_PLAN.md. The
// test fails once one exists, so the list can only shrink.
const KNOWN_MISSING = new Set<string>([
]);

describe("frontend ENDPOINTS match backend routes", () => {
  const routes = backendRoutes().map(toPattern);

  it("discovers the backend routes", () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  const entries = Object.entries(ENDPOINTS).map(([name, value]) => {
    const url = typeof value === "function" ? (value as (...a: string[]) => string)("X1", "X2") : value;
    return [name, new URL(url).pathname.split("?")[0]] as const;
  });

  it.each(entries)("%s → %s", (name, pathname) => {
    const exists = routes.some((r) => r.test(pathname));
    if (KNOWN_MISSING.has(name)) expect(exists, `${name} now exists — remove it from KNOWN_MISSING`).toBe(false);
    else expect(exists, `${name} (${pathname}) has no backend route`).toBe(true);
  });
});
