import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Key,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Trash2,
  ChevronRight,
  Zap,
  FileText,
  RefreshCw,
  Loader2,
  ChevronLeft,
  GitBranch,
} from "lucide-react";
import {
  saveApiKey,
  getApiKey,
  deleteApiKey,
  listGeminiModels,
  GeminiModelInfo,
} from "../lib/tauri";
import { useAppStore } from "../store/useAppStore";

export default function Settings() {
  const {
    hasApiKey,
    previousView,
    setHasApiKey,
    settings,
    updateSettings,
    goBack,
  } = useAppStore();

  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [keyError, setKeyError] = useState("");
  const [models, setModels] = useState<GeminiModelInfo[]>([]);
  const [modelCatalogSource, setModelCatalogSource] = useState<
    "live" | "fallback"
  >("fallback");
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [modelsError, setModelsError] = useState("");
  const [activeSection, setActiveSection] = useState<
    "api" | "model" | "project"
  >("api");
  const [githubTokenDraft, setGithubTokenDraft] = useState("");
  const [showGithubToken, setShowGithubToken] = useState(false);

  async function loadModels() {
    setIsLoadingModels(true);
    setModelsError("");

    try {
      const catalog = await listGeminiModels();
      setModels(catalog.models);
      setModelCatalogSource(catalog.source);

      if (
        catalog.models.length > 0 &&
        !catalog.models.some((model) => model.id === settings.selectedModel)
      ) {
        updateSettings({ selectedModel: catalog.models[0].id });
      }
    } catch (error) {
      setModels([]);
      setModelCatalogSource("fallback");
      setModelsError(String(error));
    } finally {
      setIsLoadingModels(false);
    }
  }

  useEffect(() => {
    void loadModels();
  }, []);

  const handleSaveKey = async () => {
    const trimmed = apiKeyDraft.trim();
    if (!trimmed) {
      setKeyError("API key cannot be empty.");
      return;
    }
    // Basic format check — Gemini keys start with "AIza"
    if (!trimmed.startsWith("AIza")) {
      setKeyError(
        'That doesn\'t look like a valid Gemini API key (should start with "AIza").',
      );
      return;
    }
    setKeyStatus("saving");
    setKeyError("");
    try {
      await saveApiKey(trimmed);
      setHasApiKey(true);
      await loadModels();
      setKeyStatus("saved");
      setApiKeyDraft("");
      setTimeout(() => setKeyStatus("idle"), 2500);
    } catch (e) {
      setKeyError(String(e));
      setKeyStatus("error");
    }
  };

  const handleDeleteKey = async () => {
    try {
      await deleteApiKey();
      setHasApiKey(false);
      await loadModels();
      setKeyStatus("idle");
      setKeyError("");
    } catch (e) {
      setKeyError(String(e));
    }
  };

  // Load current masked key state on mount
  useEffect(() => {
    getApiKey()
      .then((k) => setHasApiKey(!!k))
      .catch(() => {});
  }, [setHasApiKey]);

  const sections = [
    { id: "api" as const, label: "API Key", icon: Key },
    { id: "model" as const, label: "Model", icon: Zap },
    { id: "project" as const, label: "Project", icon: FileText },
  ];

  return (
    <div className="flex-1 flex min-h-0 flex-col">
      {/* ── Back nav header ── */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: "var(--color-border-dim)" }}
      >
        <button
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-all duration-150"
          style={{
            color: "var(--color-text-secondary)",
            border: "1px solid transparent",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "rgba(124,58,237,0.1)";
            (e.currentTarget as HTMLButtonElement).style.borderColor =
              "rgba(124,58,237,0.25)";
            (e.currentTarget as HTMLButtonElement).style.color =
              "var(--color-purple-300)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
            (e.currentTarget as HTMLButtonElement).style.borderColor =
              "transparent";
            (e.currentTarget as HTMLButtonElement).style.color =
              "var(--color-text-secondary)";
          }}
          onClick={goBack}
          title={`Back to ${previousView}`}
        >
          <ChevronLeft size={13} />
          <span className="capitalize">{previousView}</span>
        </button>

        <div
          style={{
            width: 1,
            height: 14,
            background: "var(--color-border-dim)",
          }}
        />

        <p
          className="text-sm font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Settings
        </p>

        <p
          className="text-xs ml-auto"
          style={{ color: "var(--color-text-dim)" }}
        >
          Changes save automatically.
        </p>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* ── Sidebar ── */}
        <nav
          className="w-48 flex-shrink-0 py-4 px-2 flex flex-col gap-1"
          style={{ borderRight: "1px solid var(--color-border-dim)" }}
        >
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left transition-all duration-150"
              style={{
                background:
                  activeSection === id
                    ? "rgba(124,58,237,0.16)"
                    : "transparent",
                color:
                  activeSection === id
                    ? "var(--color-purple-300)"
                    : "var(--color-text-muted)",
                border:
                  activeSection === id
                    ? "1px solid rgba(124,58,237,0.22)"
                    : "1px solid transparent",
                fontWeight: activeSection === id ? 500 : 400,
              }}
              onClick={() => setActiveSection(id)}
            >
              <Icon size={14} />
              {label}
              {activeSection === id && (
                <ChevronRight size={12} className="ml-auto opacity-40" />
              )}
            </button>
          ))}
        </nav>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-6 min-w-0">
          <AnimatePresence mode="wait">
            {activeSection === "api" && (
              <motion.div
                key="api"
                className="max-w-lg space-y-5"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div>
                  <h2
                    className="text-base font-semibold mb-1"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Gemini API Key
                  </h2>
                  <p
                    className="text-xs"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Stored securely in your OS keychain — never written to disk
                    in plain text.
                  </p>
                </div>

                {/* Current key status */}
                {hasApiKey && (
                  <div
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm"
                    style={{
                      background: "rgba(34,197,94,0.10)",
                      border: "1px solid rgba(34,197,94,0.25)",
                      color: "#86efac",
                    }}
                  >
                    <Check size={14} />
                    API key is configured and stored in your keychain.
                    <button
                      className="ml-auto flex items-center gap-1 text-xs opacity-60 hover:opacity-100 transition-opacity"
                      style={{ color: "#f87171" }}
                      onClick={handleDeleteKey}
                    >
                      <Trash2 size={12} />
                      Remove
                    </button>
                  </div>
                )}

                {/* Input for a new key */}
                <div className="space-y-2">
                  <label
                    className="text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {hasApiKey ? "Replace API key" : "Enter API key"}
                  </label>
                  <div className="relative">
                    <input
                      className="settings-input pr-10"
                      type={showKey ? "text" : "password"}
                      placeholder="AIza..."
                      value={apiKeyDraft}
                      onChange={(e) => setApiKeyDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveKey();
                      }}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80"
                      style={{ color: "var(--color-text-secondary)" }}
                      onClick={() => setShowKey((v) => !v)}
                      tabIndex={-1}
                      type="button"
                    >
                      {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>

                  {keyError && (
                    <p
                      className="flex items-center gap-1.5 text-xs"
                      style={{ color: "#fca5a5" }}
                    >
                      <AlertCircle size={12} />
                      {keyError}
                    </p>
                  )}

                  <button
                    disabled={keyStatus === "saving" || !apiKeyDraft.trim()}
                    onClick={handleSaveKey}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 flex items-center gap-2"
                    style={{
                      background:
                        keyStatus === "saved"
                          ? "rgba(34,197,94,0.2)"
                          : "rgba(124,58,237,0.25)",
                      border:
                        keyStatus === "saved"
                          ? "1px solid rgba(34,197,94,0.35)"
                          : "1px solid rgba(124,58,237,0.4)",
                      color:
                        keyStatus === "saved"
                          ? "#86efac"
                          : "var(--color-purple-300)",
                      opacity: !apiKeyDraft.trim() ? 0.5 : 1,
                      cursor: !apiKeyDraft.trim() ? "not-allowed" : "pointer",
                    }}
                  >
                    {keyStatus === "saved" && <Check size={14} />}
                    {keyStatus === "saving"
                      ? "Saving…"
                      : keyStatus === "saved"
                        ? "Saved"
                        : "Save key"}
                  </button>
                </div>

                <p
                  className="text-xs"
                  style={{ color: "var(--color-text-dim)" }}
                >
                  Get a Gemini API key at{" "}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--color-cyan-400)" }}
                  >
                    aistudio.google.com
                  </a>
                  . The free tier is quite generous — you can probably afford
                  it.
                </p>
              </motion.div>
            )}

            {activeSection === "model" && (
              <motion.div
                key="model"
                className="max-w-lg space-y-5"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2
                        className="text-base font-semibold mb-1"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        Gemini Model
                      </h2>
                      <p
                        className="text-xs"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Beacon refreshes the Gemini 3.1 catalog from the API
                        when your key is available, then falls back to a bundled
                        list if Gemini refuses to cooperate.
                      </p>
                    </div>

                    <button
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all duration-150"
                      style={{
                        background: "rgba(124,58,237,0.16)",
                        border: "1px solid rgba(124,58,237,0.3)",
                        color: "var(--color-purple-300)",
                        opacity: isLoadingModels ? 0.8 : 1,
                      }}
                      onClick={() => void loadModels()}
                      disabled={isLoadingModels}
                    >
                      {isLoadingModels ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <RefreshCw size={13} />
                      )}
                      Refresh
                    </button>
                  </div>

                  <p
                    className="text-xs"
                    style={{ color: "var(--color-text-dim)" }}
                  >
                    {modelCatalogSource === "live"
                      ? "Live Gemini catalog loaded from the API."
                      : hasApiKey
                        ? "Using the bundled Gemini 3.1 fallback catalog because the live request failed."
                        : "Add an API key to load the live Gemini 3.1 catalog."}
                  </p>

                  {modelsError && (
                    <p
                      className="flex items-center gap-1.5 text-xs"
                      style={{ color: "#fca5a5" }}
                    >
                      <AlertCircle size={12} />
                      {modelsError}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  {!isLoadingModels && models.length === 0 && (
                    <div
                      className="px-4 py-3 rounded-xl text-sm"
                      style={{
                        background: "rgba(18,16,40,0.5)",
                        border: "1px solid var(--color-border-dim)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      Gemini didn't return any usable 3.1 chat models. Very
                      considerate of it.
                    </div>
                  )}

                  {models.map((m) => {
                    const selected = settings.selectedModel === m.id;
                    return (
                      <button
                        key={m.id}
                        className="w-full text-left px-4 py-3 rounded-xl transition-all duration-150"
                        style={{
                          background: selected
                            ? "rgba(124,58,237,0.2)"
                            : "rgba(18,16,40,0.5)",
                          border: selected
                            ? "1px solid rgba(124,58,237,0.45)"
                            : "1px solid var(--color-border-dim)",
                        }}
                        onClick={() => updateSettings({ selectedModel: m.id })}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className="text-sm font-medium"
                            style={{
                              color: selected
                                ? "var(--color-purple-300)"
                                : "var(--color-text-primary)",
                            }}
                          >
                            {m.display_name}
                          </span>
                          <div className="flex items-center gap-2">
                            {m.supports_vision && (
                              <span
                                className="text-xs px-2 py-0.5 rounded-full"
                                style={{
                                  background: "rgba(34,211,238,0.12)",
                                  border: "1px solid rgba(34,211,238,0.25)",
                                  color: "var(--color-cyan-300)",
                                }}
                              >
                                vision
                              </span>
                            )}
                            {selected && (
                              <Check
                                size={14}
                                style={{ color: "var(--color-purple-400)" }}
                              />
                            )}
                          </div>
                        </div>
                        <p
                          className="text-xs mt-0.5"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {m.description}
                        </p>
                        <p
                          className="text-xs mt-1"
                          style={{ color: "var(--color-text-dim)" }}
                        >
                          {(m.context_window / 1000).toFixed(0)}K context window
                        </p>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {activeSection === "project" && (
              <motion.div
                key="project"
                className="max-w-lg space-y-5"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div>
                  <h2
                    className="text-base font-semibold mb-1"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Project Settings
                  </h2>
                  <p
                    className="text-xs"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Control how many files are included in the context sent to
                    Luna.
                  </p>
                </div>

                <div className="space-y-3">
                  <label
                    className="text-xs font-medium"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Max files in context:{" "}
                    <span style={{ color: "var(--color-purple-300)" }}>
                      {settings.maxContextFiles}
                    </span>
                  </label>
                  <input
                    type="range"
                    min={5}
                    max={200}
                    step={5}
                    value={settings.maxContextFiles}
                    onChange={(e) =>
                      updateSettings({
                        maxContextFiles: Number(e.target.value),
                      })
                    }
                    className="w-full"
                    style={{ accentColor: "var(--color-purple-600)" }}
                  />
                  <div
                    className="flex justify-between text-xs"
                    style={{ color: "var(--color-text-dim)" }}
                  >
                    <span>5 (minimal)</span>
                    <span>200 (maximum)</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    className="relative w-10 h-5 rounded-full transition-all duration-200"
                    style={{
                      background: settings.streamingEnabled
                        ? "var(--color-purple-600)"
                        : "var(--color-surface-700)",
                    }}
                    onClick={() =>
                      updateSettings({
                        streamingEnabled: !settings.streamingEnabled,
                      })
                    }
                  >
                    <span
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200"
                      style={{
                        left: settings.streamingEnabled
                          ? "calc(100% - 18px)"
                          : "2px",
                      }}
                    />
                  </button>
                  <span
                    className="text-sm"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    Streaming responses
                  </span>
                </div>

                {/* ── GitHub personal access token ── */}
                <div
                  className="pt-3 mt-1"
                  style={{ borderTop: "1px solid var(--color-border-dim)" }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <GitBranch
                      size={14}
                      style={{ color: "var(--color-text-secondary)" }}
                    />
                    <h3
                      className="text-sm font-semibold"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      GitHub Access Token
                    </h3>
                  </div>
                  <p
                    className="text-xs mb-3"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Required for private repos. Also raises the rate limit for
                    public repos. Generate one at{" "}
                    <a
                      href="https://github.com/settings/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--color-cyan-400)" }}
                    >
                      github.com/settings/tokens
                    </a>{" "}
                    — read-only repo scope is enough.
                  </p>

                  {settings.githubToken && (
                    <div
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm mb-3"
                      style={{
                        background: "rgba(34,197,94,0.10)",
                        border: "1px solid rgba(34,197,94,0.25)",
                        color: "#86efac",
                      }}
                    >
                      <Check size={14} />
                      Token configured.
                      <button
                        className="ml-auto flex items-center gap-1 text-xs opacity-60 hover:opacity-100 transition-opacity"
                        style={{ color: "#f87171" }}
                        onClick={() =>
                          updateSettings({ githubToken: undefined })
                        }
                      >
                        <Trash2 size={12} />
                        Remove
                      </button>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        className="settings-input pr-10"
                        type={showGithubToken ? "text" : "password"}
                        placeholder={
                          settings.githubToken
                            ? "Replace existing token…"
                            : "ghp_…"
                        }
                        value={githubTokenDraft}
                        onChange={(e) => setGithubTokenDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && githubTokenDraft.trim()) {
                            updateSettings({
                              githubToken: githubTokenDraft.trim(),
                            });
                            setGithubTokenDraft("");
                          }
                        }}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80"
                        style={{ color: "var(--color-text-secondary)" }}
                        onClick={() => setShowGithubToken((v) => !v)}
                        tabIndex={-1}
                        type="button"
                      >
                        {showGithubToken ? (
                          <EyeOff size={15} />
                        ) : (
                          <Eye size={15} />
                        )}
                      </button>
                    </div>
                    <button
                      disabled={!githubTokenDraft.trim()}
                      onClick={() => {
                        updateSettings({
                          githubToken: githubTokenDraft.trim(),
                        });
                        setGithubTokenDraft("");
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150"
                      style={{
                        background: "rgba(124,58,237,0.25)",
                        border: "1px solid rgba(124,58,237,0.4)",
                        color: "var(--color-purple-300)",
                        opacity: !githubTokenDraft.trim() ? 0.5 : 1,
                        cursor: !githubTokenDraft.trim()
                          ? "not-allowed"
                          : "pointer",
                      }}
                    >
                      Save token
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
