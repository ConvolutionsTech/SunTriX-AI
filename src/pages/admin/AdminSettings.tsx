import { useState, useEffect, useCallback } from "react";
import { ENDPOINTS, apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  Bot, Mail, HardDrive, Building2, MessageSquare,
  Newspaper, Shield, Eye, EyeOff, Save, RefreshCw, CheckCircle2,
  AlertCircle, ChevronRight, Loader2, ToggleLeft, ToggleRight,
  Settings2, Lock, Info, Sparkles,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────
interface Setting {
  _id: string;
  key: string;
  value: string;
  section: string;
  label: string;
  description?: string;
  type: "text" | "password" | "toggle" | "number" | "textarea" | "url" | "select";
  options?: string[];
  isSecret: boolean;
}

interface DiscoveredModel {
  id: string;
  name: string;
  ownedBy: string;
  active: boolean;
  capabilities: string[];
  planEligibility: string;
}

type SectionId = "ai" | "email" | "storage" | "brand" | "chatbot" | "newsletter" | "security";

// ─── Section metadata ─────────────────────────────────────────────────────
const SECTIONS: {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  description: string;
}[] = [
  { id: "ai",         label: "AI & Groq",       icon: Bot,          color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/30", description: "Dynamic Groq models discovery and AI behaviour" },
  { id: "chatbot",    label: "Chatbot",          icon: MessageSquare,color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/30",   description: "Website chatbot prompt, links and toggles" },
  { id: "email",      label: "Email",            icon: Mail,         color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", description: "Sender address and notification toggles" },
  { id: "storage",    label: "File Storage",     icon: HardDrive,    color: "text-cyan-400",   bg: "bg-cyan-500/10",   border: "border-cyan-500/30",   description: "Upload folder and size limits" },
  { id: "brand",      label: "Brand & Identity", icon: Building2,    color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/30",  description: "Company name, links and brand copy" },
  { id: "newsletter", label: "Newsletter",       icon: Newspaper,    color: "text-pink-400",   bg: "bg-pink-500/10",   border: "border-pink-500/30",   description: "Batch size, opt-in and footer text" },
  { id: "security",   label: "Security & Ops",   icon: Shield,       color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30",    description: "Maintenance mode, rate limits and audit retention" },
];

// ─── Individual field component ────────────────────────────────────────────
function SettingField({
  setting,
  localValue,
  onChange,
  discoveredModels,
}: {
  setting: Setting;
  localValue: string;
  onChange: (key: string, value: string) => void;
  discoveredModels: DiscoveredModel[];
}) {
  const [showSecret, setShowSecret] = useState(false);
  const isModified = localValue !== setting.value;

  const baseInput =
    "w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/20 transition-all";

  if (setting.type === "toggle") {
    const isOn = localValue === "true";
    return (
      <button
        type="button"
        onClick={() => onChange(setting.key, isOn ? "false" : "true")}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-sm font-medium ${
          isOn
            ? "bg-green-500/10 border-green-500/40 text-green-400"
            : "bg-zinc-800/50 border-zinc-700 text-zinc-500"
        }`}
      >
        {isOn ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
        {isOn ? "Enabled" : "Disabled"}
      </button>
    );
  }

  if (setting.type === "select") {
    const isModelSetting = setting.key === "GROQ_CHAT_MODEL" || setting.key === "GROQ_EXTRACT_MODEL";
    const availableOptions = isModelSetting && discoveredModels.length > 0
      ? discoveredModels.map((m) => m.id)
      : setting.options || [];

    const activeModel = discoveredModels.find((m) => m.id === localValue);

    return (
      <div className="flex flex-col gap-2 w-full">
        <select
          value={localValue}
          onChange={(e) => onChange(setting.key, e.target.value)}
          className={baseInput + " cursor-pointer font-mono text-xs"}
        >
          {availableOptions.map((opt) => {
            const m = discoveredModels.find((dm) => dm.id === opt);
            return (
              <option key={opt} value={opt} className="bg-zinc-900">
                {m ? `${m.name} (${m.id})` : opt}
              </option>
            );
          })}
        </select>
        {isModelSetting && (
          <div className="flex items-center justify-between gap-2 text-xs pt-1">
            {activeModel ? (
              <span className="text-green-400 flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> ✅ Available on Groq API — Capabilities: {activeModel.capabilities.join(", ")}
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1.5 font-medium">
                <AlertCircle className="h-3.5 w-3.5" /> ⚠️ Selected model ID is unverified or restricted for this API key
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  if (setting.type === "textarea") {
    return (
      <textarea
        value={localValue}
        onChange={(e) => onChange(setting.key, e.target.value)}
        rows={5}
        className={baseInput + " resize-y font-mono text-xs leading-relaxed"}
        placeholder={setting.isSecret ? "Enter value…" : `Enter ${setting.label.toLowerCase()}…`}
      />
    );
  }

  if (setting.type === "password") {
    return (
      <div className="relative w-full">
        <input
          type={showSecret ? "text" : "password"}
          value={localValue === "••••••••••••" ? "" : localValue}
          onChange={(e) => onChange(setting.key, e.target.value)}
          placeholder={localValue === "••••••••••••" ? "Leave blank to keep current value" : "Enter new value…"}
          className={baseInput + " pr-10 font-mono"}
        />
        <button
          type="button"
          onClick={() => setShowSecret(!showSecret)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        {isModified && localValue !== "" && (
          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-orange-500" />
        )}
      </div>
    );
  }

  // text / url / number
  return (
    <div className="relative w-full">
      <input
        type={setting.type === "number" ? "number" : "text"}
        value={localValue}
        onChange={(e) => onChange(setting.key, e.target.value)}
        placeholder={`Enter ${setting.label.toLowerCase()}…`}
        step={setting.type === "number" ? "0.1" : undefined}
        className={baseInput + (isModified ? " border-orange-500/50" : "")}
      />
      {isModified && (
        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-orange-500" />
      )}
    </div>
  );
}

// ─── Section panel ─────────────────────────────────────────────────────────
function SectionPanel({
  section,
  settings,
  localValues,
  onChange,
  onSave,
  saving,
  savedKeys,
  discoveredModels,
  onRefreshModels,
  refreshingModels,
}: {
  section: typeof SECTIONS[0];
  settings: Setting[];
  localValues: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onSave: (sectionId: string) => void;
  saving: string | null;
  savedKeys: Set<string>;
  discoveredModels: DiscoveredModel[];
  onRefreshModels: () => void;
  refreshingModels: boolean;
}) {
  const Icon = section.icon;
  const isSaving = saving === section.id;
  const hasChanges = settings.some((s) => {
    const lv = localValues[s.key] ?? s.value;
    if (s.isSecret) return lv !== "" && lv !== "••••••••••••" && lv !== s.value;
    return lv !== s.value;
  });

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-xs overflow-hidden">
      {/* Section Header */}
      <div className="px-6 py-4 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">{section.label}</h2>
            {hasChanges && (
              <span className="text-[10px] font-mono text-primary font-bold px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">
                Unsaved Changes
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
        </div>

        <div className="flex items-center gap-2">
          {section.id === "ai" && (
            <button
              onClick={onRefreshModels}
              disabled={refreshingModels}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-background hover:bg-muted text-foreground border border-border/60 transition-all shrink-0"
              title="Refresh models catalog directly from Groq API"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshingModels ? "animate-spin text-primary" : ""}`} />
              {refreshingModels ? "Discovering…" : "Refresh Models"}
            </button>
          )}

          <button
            onClick={() => onSave(section.id)}
            disabled={isSaving || !hasChanges}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              isSaving
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : hasChanges
                ? "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            {isSaving ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
            ) : (
              <><Save className="h-3.5 w-3.5" /> Save Section</>
            )}
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="divide-y divide-[#1a1a1a]">
        {settings.map((setting) => {
          const lv = localValues[setting.key] ?? setting.value;
          const justSaved = savedKeys.has(setting.key);
          return (
            <div key={setting.key} className="px-6 py-4 flex flex-col sm:flex-row sm:items-start gap-4">
              {/* Label */}
              <div className="sm:w-64 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-200">{setting.label}</span>
                  {setting.isSecret && <Lock className="h-3 w-3 text-zinc-600" />}
                  {justSaved && (
                    <span className="flex items-center gap-1 text-[11px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20">
                      <CheckCircle2 className="h-3 w-3" /> Saved
                    </span>
                  )}
                </div>
                {setting.description && (
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{setting.description}</p>
                )}
                <code className="text-[10px] text-zinc-600 font-mono mt-1 inline-block">{setting.key}</code>
              </div>

              {/* Input */}
              <div className="flex-1">
                <SettingField
                  setting={setting}
                  localValue={lv}
                  onChange={onChange}
                  discoveredModels={discoveredModels}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────
const AdminSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState<SectionId>("ai");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [refreshingModels, setRefreshingModels] = useState(false);

  // ── Fetch dynamic Groq models from backend ──────────────────────────────
  const fetchModels = useCallback(async (refresh = false) => {
    setRefreshingModels(true);
    const { data, error } = await apiRequest<{ models: DiscoveredModel[] }>(
      ENDPOINTS.SETTINGS_AI_MODELS(refresh)
    );
    if (data?.models) {
      setDiscoveredModels(data.models);
      if (refresh) showToast("success", `Discovered ${data.models.length} active models from Groq API`);
    } else if (error) {
      showToast("error", "Could not fetch dynamic Groq models list.");
    }
    setRefreshingModels(false);
  }, []);

  // ── Fetch all settings ──────────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await apiRequest<{ settings: Setting[] }>(
      ENDPOINTS.SETTINGS_LIST
    );
    if (error || !data) {
      showToast("error", error || "Failed to load settings");
    } else {
      setSettings(data.settings);
      const vals: Record<string, string> = {};
      for (const s of data.settings) vals[s.key] = s.value;
      setLocalValues(vals);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchModels(false);
  }, [fetchSettings, fetchModels]);

  // ── Toast helper ────────────────────────────────────────────────────────
  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Handle field change ─────────────────────────────────────────────────
  const handleChange = (key: string, value: string) => {
    setLocalValues((prev) => ({ ...prev, [key]: value }));
  };

  // ── Save an entire section ──────────────────────────────────────────────
  const handleSave = async (sectionId: string) => {
    setSaving(sectionId);
    const sectionSettings = settings.filter((s) => s.section === sectionId);

    const updates = sectionSettings
      .map((s) => ({ key: s.key, value: localValues[s.key] ?? s.value }))
      .filter(({ key, value }) => {
        const setting = sectionSettings.find((s) => s.key === key);
        if (setting?.isSecret && (value === "••••••••••••" || value === "")) return false;
        return true;
      });

    if (updates.length === 0) {
      setSaving(null);
      return;
    }

    const { data, error } = await apiRequest<{ saved: number; errors?: string[]; warnings?: string[] }>(
      ENDPOINTS.SETTINGS_BULK,
      { method: "PATCH", body: { updates } }
    );

    setSaving(null);

    if (error || (data && data.errors && data.errors.length > 0)) {
      showToast("error", error || (data?.errors ? data.errors.join(", ") : "Failed to save settings"));
    } else {
      showToast("success", data?.warnings?.length ? data.warnings.join(" ") : `Saved ${sectionId.toUpperCase()} settings successfully`);
      const keys = new Set(updates.map((u) => u.key));
      setSavedKeys(keys);
      setTimeout(() => setSavedKeys(new Set()), 3000);
      fetchSettings();
    }
  };

  const activeSectionData = SECTIONS.find((s) => s.id === activeSection)!;
  const sectionSettings = settings.filter((s) => s.section === activeSection);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Toast alert */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl transition-all animate-in fade-in slide-in-from-top-3 ${
            toast.type === "success"
              ? "bg-green-950/90 border-green-500/40 text-green-300"
              : "bg-red-950/90 border-red-500/40 text-red-300"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          )}
          <span className="text-sm font-medium">{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <AdminPageHeader
        title="System Settings & AI Configuration"
        description="Dynamic Groq AI model discovery, vendor credentials, chatbot prompts, and system configurations."
      />

      {/* Main layout */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
          <p className="text-xs text-zinc-500 font-mono">Loading system settings…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar navigation */}
          <div className="space-y-1">
            {SECTIONS.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              const count = settings.filter((s) => s.section === sec.id).length;

              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? "bg-zinc-800 text-white font-semibold shadow-inner border border-zinc-700/60"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-[#161616]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`h-4 w-4 ${sec.color}`} />
                    <span>{sec.label}</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-500 border border-zinc-800">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active section settings panel */}
          <div className="lg:col-span-3 space-y-4">
            <p className="text-xs text-muted-foreground">
              API keys and secrets (Stripe, Resend, Cloudinary, Groq, JWT) are set in the server environment and are not editable here.
            </p>
            <SectionPanel
              section={activeSectionData}
              settings={sectionSettings}
              localValues={localValues}
              onChange={handleChange}
              onSave={handleSave}
              saving={saving}
              savedKeys={savedKeys}
              discoveredModels={discoveredModels}
              onRefreshModels={() => fetchModels(true)}
              refreshingModels={refreshingModels}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSettings;
