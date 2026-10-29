import { useEffect, useState } from "react";
import { apiRequest, ENDPOINTS } from "@/lib/api";
import { MEDIA_SLOTS, setMediaRegistry } from "@/hooks/use-media";

const label = (slot: string) => slot.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** "Use as": point a site image slot (hero banner, logo, …) at this uploaded image. */
export function MediaSlotPicker({ url }: { url: string }) {
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [slot, setSlot] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest<{ entries?: Record<string, string> }>(ENDPOINTS.CMS_MEDIA_REGISTRY).then(({ data }) => setEntries(data?.entries ?? {}));
  }, []);

  const usedFor = Object.entries(entries).filter(([, u]) => u === url).map(([s]) => s);

  const save = async (next: Record<string, string>, message: string) => {
    setSaving(true);
    const { error } = await apiRequest(ENDPOINTS.CMS_MEDIA_REGISTRY, { method: "PUT", body: { entries: next } });
    setSaving(false);
    if (error) {
      setStatus(error);
      return;
    }
    setEntries(next);
    setMediaRegistry(next);
    setStatus(message);
  };

  return (
    <div className="space-y-2 pt-4 border-t border-border text-xs">
      <label htmlFor="media-slot" className="font-semibold text-foreground">Use on the site as</label>
      <div className="flex gap-2">
        <select id="media-slot" value={slot} onChange={(e) => setSlot(e.target.value)} className="flex-1 rounded-md border border-border bg-background px-2 py-1.5">
          <option value="">Choose an image slot…</option>
          {MEDIA_SLOTS.map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
        <button
          disabled={!slot || saving}
          onClick={() => save({ ...entries, [slot]: url }, `Now used as ${label(slot)}. Visitors see it within 2 minutes.`)}
          className="rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-50"
        >
          Apply
        </button>
      </div>
      {usedFor.length > 0 && (
        <ul className="space-y-1">
          {usedFor.map((s) => (
            <li key={s} className="flex items-center justify-between">
              <span>Used as {label(s)}</span>
              <button
                disabled={saving}
                onClick={() => {
                  const next = { ...entries };
                  delete next[s];
                  save(next, `${label(s)} is back to the default image.`);
                }}
                className="text-red-500 hover:underline"
              >
                Reset
              </button>
            </li>
          ))}
        </ul>
      )}
      {status && <p role="status" className="text-muted-foreground">{status}</p>}
    </div>
  );
}
