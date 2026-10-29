import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiRequest = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

import { ENDPOINTS } from "@/lib/api";
import { useMedia, getMediaFallback, resetMediaRegistry } from "@/hooks/use-media";
import { MediaSlotPicker } from "@/components/admin/MediaSlotPicker";

const Img = ({ slot }: { slot: string }) => <img alt={slot} src={useMedia(slot)} />;

beforeEach(() => {
  apiRequest.mockReset();
  resetMediaRegistry();
  localStorage.clear();
});

describe("site images from the API (T-FE-13)", () => {
  it("shows the bundled image, then the admin's choice; never writes localStorage", async () => {
    apiRequest.mockResolvedValue({ data: { entries: { "hero-banner": "https://res.cloudinary.com/x/new-hero.png" } }, error: null });
    render(<><Img slot="hero-banner" /><Img slot="about-hero" /></>);
    expect(screen.getByAltText("about-hero")).toHaveAttribute("src", getMediaFallback("about-hero"));
    await waitFor(() => expect(screen.getByAltText("hero-banner")).toHaveAttribute("src", "https://res.cloudinary.com/x/new-hero.png"));
    expect(screen.getByAltText("about-hero")).toHaveAttribute("src", getMediaFallback("about-hero"));
    expect(apiRequest).toHaveBeenCalledTimes(1); // one shared fetch for every image on the page
    expect(localStorage.length).toBe(0);
  });

  it("keeps the bundled images when the API is unreachable", async () => {
    apiRequest.mockResolvedValue({ data: null, error: "Network error" });
    render(<Img slot="suntrix-logo" />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(screen.getByAltText("suntrix-logo")).toHaveAttribute("src", getMediaFallback("suntrix-logo"));
  });

  it("an admin can set an image as a slot and the page updates at once", async () => {
    apiRequest.mockImplementation(async (url: string, opts?: { method?: string }) =>
      url === ENDPOINTS.CMS_MEDIA_REGISTRY && opts?.method === "PUT" ? { data: {}, error: null } : { data: { entries: {} }, error: null }
    );
    render(<><MediaSlotPicker url="https://res.cloudinary.com/x/logo.png" /><Img slot="suntrix-logo" /></>);
    fireEvent.change(screen.getByLabelText("Use on the site as"), { target: { value: "suntrix-logo" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(ENDPOINTS.CMS_MEDIA_REGISTRY, { method: "PUT", body: { entries: { "suntrix-logo": "https://res.cloudinary.com/x/logo.png" } } })
    );
    await waitFor(() => expect(screen.getByAltText("suntrix-logo")).toHaveAttribute("src", "https://res.cloudinary.com/x/logo.png"));
    expect(screen.getByText("Used as Suntrix Logo")).toBeInTheDocument();
  });
});
