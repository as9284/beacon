import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderOpen,
  GitBranch,
  ArrowRight,
  AlertCircle,
  Loader2,
  Clock,
  X,
} from "lucide-react";
import { pickProjectFolder, indexLocalProject } from "../lib/tauri";
import { useAppStore, Project } from "../store/useAppStore";
import BeaconLogo from "../components/BeaconLogo";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: number | undefined): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

// ── Recent project card ───────────────────────────────────────────────────────

interface RecentCardProps {
  project: Project;
  onOpen: (p: Project) => void;
  onRemove: (root: string) => void;
  loading: boolean;
}

function RecentCard({ project, onOpen, onRemove, loading }: RecentCardProps) {
  const isLocal = project.source === "local";
  const Icon = isLocal ? FolderOpen : GitBranch;
  const pathLabel = isLocal
    ? project.root
    : (project.githubUrl ?? project.root);

  return (
    <div
      className="card-project group"
      onClick={() => !loading && onOpen(project)}
      style={{ cursor: loading ? "default" : "pointer" }}
    >
      {/* Remove button — shown on hover */}
      <button
        className="card-project-remove"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(project.root);
        }}
        title="Remove from recents"
      >
        <X size={11} />
      </button>
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: isLocal
              ? "rgba(124,58,237,0.18)"
              : "rgba(34,211,238,0.12)",
            border: isLocal
              ? "1px solid rgba(124,58,237,0.3)"
              : "1px solid rgba(34,211,238,0.25)",
          }}
        >
          {loading ? (
            <Loader2
              size={14}
              className="animate-spin"
              style={{ color: "var(--color-purple-400)" }}
            />
          ) : (
            <Icon
              size={14}
              style={{
                color: isLocal
                  ? "var(--color-purple-400)"
                  : "var(--color-cyan-400)",
              }}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold truncate leading-tight"
            style={{ color: "var(--color-text-primary)" }}
          >
            {project.name}
          </p>
          <p
            className="text-xs truncate mt-0.5 font-mono"
            style={{ color: "var(--color-text-dim)", fontSize: "0.68rem" }}
          >
            {pathLabel}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        <span
          className="text-xs px-1.5 py-0.5 rounded font-medium"
          style={{
            background: isLocal
              ? "rgba(109,40,217,0.15)"
              : "rgba(34,211,238,0.1)",
            color: isLocal
              ? "var(--color-purple-400)"
              : "var(--color-cyan-400)",
            fontSize: "0.68rem",
          }}
        >
          {isLocal ? "local" : "github"}
        </span>

        {isLocal && project.fileCount > 0 && (
          <span
            className="text-xs"
            style={{ color: "var(--color-text-dim)", fontSize: "0.7rem" }}
          >
            {project.fileCount} files
          </span>
        )}

        <span
          className="text-xs ml-auto flex items-center gap-1"
          style={{ color: "var(--color-text-dim)", fontSize: "0.7rem" }}
        >
          <Clock size={9} />
          {timeAgo(project.indexedAt)}
        </span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const {
    hasApiKey,
    setView,
    setActiveProject,
    setIsIndexing,
    isIndexing,
    indexError,
    setIndexError,
    recentProjects,
    removeRecentProject,
    clearAllRecents,
  } = useAppStore();

  const [githubUrl, setGithubUrl] = useState("");
  const [mode, setMode] = useState<"none" | "github">("none");
  const [loadingRoot, setLoadingRoot] = useState<string | null>(null);

  const hasRecent = recentProjects.length > 0;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handlePickFolder = async () => {
    if (!hasApiKey) {
      setIndexError("Enter your Gemini API key in Settings first.");
      return;
    }
    setIndexError(null);
    setIsIndexing(true);
    try {
      const folder = await pickProjectFolder();
      if (!folder) return;

      const files = await indexLocalProject(folder);
      const name = folder.split(/[\\/]/).filter(Boolean).pop() ?? "Project";

      setActiveProject({
        name,
        root: folder,
        source: "local",
        fileCount: files.length,
        indexedAt: Date.now(),
        files: files.map((f) => ({
          path: f.path,
          relativePath: f.relative_path,
          size: f.size,
          isText: f.is_text,
        })),
      });
      setView("chat");
    } catch (e) {
      setIndexError(String(e));
    } finally {
      setIsIndexing(false);
    }
  };

  const handleGithubImport = async () => {
    if (!hasApiKey) {
      setIndexError("Enter your Gemini API key in Settings first.");
      return;
    }
    if (!githubUrl.trim()) {
      setIndexError("Enter a GitHub repository URL.");
      return;
    }
    setIndexError(null);
    const match = githubUrl.match(/github\.com\/[^/]+\/([^/]+)/);
    const name = match?.[1]?.replace(/\.git$/, "") ?? "Repo";
    setActiveProject({
      name,
      root: githubUrl,
      source: "github",
      githubUrl,
      fileCount: 0,
      indexedAt: Date.now(),
    });
    setView("chat");
  };

  const handleOpenRecent = async (project: Project) => {
    if (!hasApiKey) {
      setIndexError("Enter your Gemini API key in Settings first.");
      return;
    }
    setIndexError(null);

    if (project.source === "local") {
      setLoadingRoot(project.root);
      setIsIndexing(true);
      try {
        const files = await indexLocalProject(project.root);
        setActiveProject({
          ...project,
          fileCount: files.length,
          indexedAt: Date.now(),
          files: files.map((f) => ({
            path: f.path,
            relativePath: f.relative_path,
            size: f.size,
            isText: f.is_text,
          })),
        });
        setView("chat");
      } catch (e) {
        setIndexError(String(e));
      } finally {
        setIsIndexing(false);
        setLoadingRoot(null);
      }
    } else {
      setActiveProject({ ...project });
      setView("chat");
    }
  };

  // ── Layout ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex relative overflow-hidden">
      {/* Radial background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 40% 60%, rgba(109,40,217,0.11) 0%, transparent 60%)",
        }}
      />

      {/* ── Left / center panel ── */}
      <motion.div
        className="flex flex-col items-center justify-center relative z-10 shrink-0"
        style={{
          width: hasRecent ? 320 : "100%",
          padding: hasRecent ? "2rem 2rem" : "0 1rem",
          borderRight: hasRecent ? "1px solid var(--color-border-dim)" : "none",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        {/* Logo + wordmark */}
        <motion.div
          className="flex flex-col items-center gap-2 mb-8"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <BeaconLogo size={hasRecent ? 68 : 92} animated />
          <h1
            className="text-2xl font-bold tracking-tight text-glow-purple"
            style={{ color: "var(--color-text-primary)" }}
          >
            Beacon
          </h1>
          <p
            className="text-sm text-center"
            style={{ color: "var(--color-text-muted)", maxWidth: 220 }}
          >
            Point Luna at a project. Ask anything.
          </p>
        </motion.div>

        {/* Action cards */}
        <motion.div
          className="flex flex-col gap-2.5 w-full"
          style={{ maxWidth: hasRecent ? undefined : 360 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12, ease: "easeOut" }}
        >
          {/* Open local folder */}
          <button
            className="glass flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-left transition-all duration-200 group hover:border-purple-600/50"
            style={{
              borderColor:
                isIndexing && !loadingRoot ? "rgba(109,40,217,0.4)" : undefined,
            }}
            onClick={handlePickFolder}
            disabled={isIndexing}
          >
            {isIndexing && !loadingRoot ? (
              <Loader2
                size={19}
                className="shrink-0 animate-spin"
                style={{ color: "var(--color-purple-400)" }}
              />
            ) : (
              <FolderOpen
                size={19}
                className="shrink-0"
                style={{ color: "var(--color-purple-400)" }}
              />
            )}
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                Open local project
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--color-text-muted)" }}
              >
                Choose a folder from your filesystem
              </p>
            </div>
            <ArrowRight
              size={14}
              className="shrink-0 opacity-0 group-hover:opacity-50 transition-opacity"
              style={{ color: "var(--color-purple-400)" }}
            />
          </button>

          {/* Import GitHub repository */}
          <div className="glass rounded-xl overflow-hidden">
            <button
              className="flex items-center gap-3.5 px-4 py-3.5 text-left w-full transition-colors duration-200 group"
              onClick={() => setMode(mode === "github" ? "none" : "github")}
              disabled={isIndexing}
            >
              <GitBranch
                size={19}
                className="shrink-0"
                style={{ color: "var(--color-purple-400)" }}
              />
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Import GitHub repository
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Paste a public or private repo URL
                </p>
              </div>
              <ArrowRight
                size={14}
                className={`shrink-0 transition-all ${
                  mode === "github"
                    ? "opacity-50 rotate-90"
                    : "opacity-0 group-hover:opacity-50"
                }`}
                style={{ color: "var(--color-purple-400)" }}
              />
            </button>

            {mode === "github" && (
              <motion.div
                className="px-4 pb-4"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex gap-2">
                  <input
                    className="settings-input"
                    placeholder="https://github.com/owner/repo"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleGithubImport();
                    }}
                    autoFocus
                  />
                  <button
                    onClick={handleGithubImport}
                    disabled={isIndexing || !githubUrl.trim()}
                    className="btn-send"
                    style={{
                      position: "static",
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                    }}
                  >
                    <ArrowRight size={15} />
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Error banner */}
        {indexError && (
          <motion.div
            className="flex items-center gap-2 mt-4 text-sm px-4 py-2.5 rounded-lg w-full"
            style={{
              maxWidth: hasRecent ? undefined : 360,
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#fca5a5",
            }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <AlertCircle size={14} className="shrink-0" />
            <span>{indexError}</span>
          </motion.div>
        )}

        {/* No API key nudge */}
        {!hasApiKey && (
          <motion.p
            className="text-xs mt-5"
            style={{ color: "var(--color-text-muted)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            No API key configured —{" "}
            <button
              className="underline underline-offset-2"
              style={{ color: "var(--color-purple-400)" }}
              onClick={() => setView("settings")}
            >
              open Settings
            </button>{" "}
            to add one.
          </motion.p>
        )}
      </motion.div>

      {/* ── Right panel: recent projects ── */}
      {hasRecent && (
        <motion.div
          className="flex-1 flex flex-col overflow-y-auto relative z-10"
          style={{ padding: "2rem 2rem 2rem 2.5rem" }}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
        >
          {/* Section heading */}
          <div className="flex items-center gap-2.5 mb-5">
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{
                color: "var(--color-text-secondary)",
                letterSpacing: "0.11em",
              }}
            >
              Recent
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded font-medium"
              style={{
                background: "rgba(124,58,237,0.15)",
                color: "var(--color-purple-400)",
                fontSize: "0.68rem",
              }}
            >
              {recentProjects.length}
            </span>

            <button
              className="ml-auto text-xs transition-colors duration-150"
              style={{ color: "var(--color-text-dim)" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.color = "#f87171")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.color =
                  "var(--color-text-dim)")
              }
              onClick={clearAllRecents}
              title="Clear all recent projects"
            >
              Clear all
            </button>
          </div>

          {/* Project grid: 2 columns when 3+ projects, else single column */}
          <AnimatePresence>
            <div
              className={`grid gap-3 ${recentProjects.length >= 3 ? "grid-cols-2" : "grid-cols-1"}`}
              style={{ maxWidth: recentProjects.length < 3 ? 420 : undefined }}
            >
              {recentProjects.map((p, i) => (
                <motion.div
                  key={p.root}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3, delay: 0.05 * i }}
                >
                  <RecentCard
                    project={p}
                    onOpen={handleOpenRecent}
                    onRemove={removeRecentProject}
                    loading={loadingRoot === p.root}
                  />
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
