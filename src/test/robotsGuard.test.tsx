import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RobotsGuard } from "@/components/RobotsGuard";

const robots = () => document.querySelector<HTMLMetaElement>('meta[name="robots"][data-guard]')?.content;

describe("RobotsGuard (T-OPB-19)", () => {
  it("marks admin and capability-link pages noindex, leaves public pages indexable", () => {
    for (const path of ["/proposal/prop_x", "/invoice/inv_x", "/admin/tasks", "/client/project/trk", "/track/tr_x"]) {
      const { unmount } = render(<MemoryRouter initialEntries={[path]}><RobotsGuard /></MemoryRouter>);
      expect(robots(), path).toBe("noindex, nofollow");
      unmount();
    }
    render(<MemoryRouter initialEntries={["/blog/hello"]}><RobotsGuard /></MemoryRouter>);
    expect(robots()).toBeUndefined();
  });
});
