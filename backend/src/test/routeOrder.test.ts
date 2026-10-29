import { describe, it, expect } from "vitest";
import app from "../app";

/**
 * Express matches routes in registration order, so `DELETE /:id` registered
 * before `DELETE /bulk` swallows "bulk" as an id (M16). Fails if any literal
 * route is shadowed by an earlier parameterised route with the same method.
 */
interface Entry { method: string; path: string }

function shadows(earlier: string, later: string): boolean {
  const a = earlier.split("/");
  const b = later.split("/");
  if (a.length !== b.length) return false;
  return a.every((seg, i) => seg === b[i] || seg.startsWith(":"));
}

describe("route order", () => {
  it("no literal route is shadowed by an earlier :param route", () => {
    const problems: string[] = [];
    for (const layer of (app as any)._router.stack) {
      if (layer.name !== "router") continue;
      const entries: Entry[] = [];
      for (const sub of layer.handle.stack) {
        if (!sub.route) continue;
        for (const method of Object.keys(sub.route.methods)) entries.push({ method, path: sub.route.path });
      }
      entries.forEach((later, i) => {
        for (const earlier of entries.slice(0, i)) {
          if (earlier.method === later.method && earlier.path !== later.path && shadows(earlier.path, later.path)) {
            problems.push(`${layer.regexp.source}: ${later.method.toUpperCase()} ${later.path} is shadowed by ${earlier.path}`);
          }
        }
      });
    }
    expect(problems).toEqual([]);
  });
});
