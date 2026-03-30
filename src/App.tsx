import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import TopBar from "./components/TopBar";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import Settings from "./pages/Settings";
import { useAppStore } from "./store/useAppStore";
import { getApiKey } from "./lib/tauri";

export default function App() {
  const { view, setHasApiKey } = useAppStore();

  // Bootstrap: check if an API key is already stored in the keychain
  useEffect(() => {
    getApiKey()
      .then((k) => setHasApiKey(!!k))
      .catch(() => setHasApiKey(false));
  }, [setHasApiKey]);

  return (
    <div className="app-shell bg-cosmic">
      <TopBar />
      <AnimatePresence mode="wait">
        {view === "home" && (
          <motion.div
            key="home"
            className="flex-1 flex flex-col min-h-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <Home />
          </motion.div>
        )}
        {view === "chat" && (
          <motion.div
            key="chat"
            className="flex-1 flex flex-col min-h-0"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Chat />
          </motion.div>
        )}
        {view === "settings" && (
          <motion.div
            key="settings"
            className="flex-1 flex flex-col min-h-0"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Settings />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Version badge */}
      <div
        className="absolute bottom-2 right-3 text-xs pointer-events-none"
        style={{ color: "var(--color-text-dim)", zIndex: 10 }}
      >
        v1.0.0
      </div>
    </div>
  );
}
