import { useState, useEffect } from "react";
import { Minus, Square, X, Settings } from "lucide-react";
import {
  minimizeWindow,
  maximizeWindow,
  closeWindow,
  isMaximized,
} from "../lib/tauri";
import { useAppStore } from "../store/useAppStore";
import BeaconLogo from "./BeaconLogo";

export default function TopBar() {
  const { view, previousView, setView, goBack, activeProject } = useAppStore();
  const [maximized, setMaximized] = useState(false);

  // Poll window state every second so the icon updates on OS-level maximize
  useEffect(() => {
    const check = async () => {
      setMaximized(await isMaximized());
    };
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, []);

  const handleMaximize = async () => {
    await maximizeWindow();
    setMaximized(await isMaximized());
  };

  const isInSettings = view === "settings";

  return (
    <header className="topbar" data-tauri-drag-region>
      {/* ── Left: Logo + app name ── */}
      <div
        className="topbar-nodrag flex items-center gap-2 cursor-pointer select-none"
        onClick={() => setView("home")}
        title="Back to home"
      >
        <BeaconLogo size={24} animated={false} />
        <span
          className="text-sm font-semibold tracking-wide"
          style={{ color: "var(--color-purple-300)" }}
        >
          Beacon
        </span>
      </div>

      {/* ── Center: Active project badge ── */}
      <div
        className="flex-1 flex justify-center pointer-events-none"
        data-tauri-drag-region
      >
        {activeProject && view === "chat" && (
          <span
            className="text-xs px-3 py-1 rounded-full"
            style={{
              background: "rgba(109,40,217,0.2)",
              border: "1px solid rgba(109,40,217,0.3)",
              color: "var(--color-purple-300)",
            }}
          >
            {activeProject.name}
          </span>
        )}
      </div>

      {/* ── Right: Controls ── */}
      <div className="topbar-nodrag flex items-center gap-1">
        {/* Settings */}
        <button
          className="win-btn"
          onClick={() => (isInSettings ? goBack() : setView("settings"))}
          title={isInSettings ? `Back to ${previousView}` : "Settings"}
          style={{
            color: isInSettings
              ? "var(--color-purple-400)"
              : "var(--color-text-secondary)",
            opacity: 1,
          }}
        >
          <Settings size={14} />
        </button>

        <div
          style={{
            width: 1,
            height: 16,
            background: "var(--color-border-dim)",
            margin: "0 4px",
          }}
        />

        {/* Minimize */}
        <button
          className="win-btn win-btn-minimize"
          onClick={() => minimizeWindow()}
          title="Minimize"
        >
          <Minus size={13} />
        </button>

        {/* Maximize */}
        <button
          className="win-btn win-btn-maximize"
          onClick={handleMaximize}
          title={maximized ? "Restore" : "Maximize"}
        >
          <Square size={12} />
        </button>

        {/* Close */}
        <button
          className="win-btn win-btn-close"
          onClick={() => closeWindow()}
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
