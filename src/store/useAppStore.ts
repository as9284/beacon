import { create } from "zustand";
import { persist } from "zustand/middleware";

const DEFAULT_GEMINI_MODEL_ID = "gemini-3.1-pro-preview";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface Project {
  name: string;
  root: string;
  source: "local" | "github";
  githubUrl?: string;
  fileCount: number;
  indexedAt?: number;
  files?: FileEntry[];
}

export interface FileEntry {
  path: string;
  relativePath: string;
  size: number;
  isText: boolean;
}

export type GeminiModelId = string;

export interface AppSettings {
  selectedModel: GeminiModelId;
  streamingEnabled: boolean;
  maxContextFiles: number;
  githubToken?: string;
}

export type AppView = "home" | "chat" | "settings";
type NonSettingsView = Exclude<AppView, "settings">;

interface AppState {
  // Navigation
  view: AppView;
  previousView: NonSettingsView;
  setView: (v: AppView) => void;
  goBack: () => void;

  // API key (stored in OS keychain, this flag just tracks if one is saved)
  hasApiKey: boolean;
  setHasApiKey: (v: boolean) => void;

  // Settings (persisted to local store)
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;

  // Active project
  activeProject: Project | null;
  setActiveProject: (p: Project | null) => void;

  // Recent projects (persisted, no file contents)
  recentProjects: Project[];
  removeRecentProject: (root: string) => void;
  clearAllRecents: () => void;

  // Chat history
  messages: ChatMessage[];
  addMessage: (m: ChatMessage) => void;
  updateLastAssistantMessage: (text: string) => void;
  clearMessages: () => void;

  // UI state
  isIndexing: boolean;
  setIsIndexing: (v: boolean) => void;
  isStreaming: boolean;
  setIsStreaming: (v: boolean) => void;
  indexError: string | null;
  setIndexError: (e: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      view: "home",
      previousView: "home",
      setView: (v) =>
        set((state) => {
          if (v === "settings") {
            return {
              view: v,
              previousView:
                state.view === "settings" ? state.previousView : state.view,
            };
          }

          return { view: v };
        }),
      goBack: () =>
        set((state) => ({
          view: state.view === "settings" ? state.previousView : "home",
        })),

      hasApiKey: false,
      setHasApiKey: (v) => set({ hasApiKey: v }),

      settings: {
        selectedModel: DEFAULT_GEMINI_MODEL_ID,
        streamingEnabled: true,
        maxContextFiles: 40,
      },
      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      activeProject: null,
      setActiveProject: (p) =>
        set((s) => {
          if (!p) return { activeProject: null, messages: [] };
          const stripped: Project = { ...p, files: undefined };
          const recent: Project[] = [
            stripped,
            ...s.recentProjects.filter((r) => r.root !== p.root),
          ].slice(0, 6);
          return { activeProject: p, messages: [], recentProjects: recent };
        }),

      recentProjects: [],
      removeRecentProject: (root) =>
        set((s) => ({
          recentProjects: s.recentProjects.filter((p) => p.root !== root),
        })),
      clearAllRecents: () => set({ recentProjects: [] }),

      messages: [],
      addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
      updateLastAssistantMessage: (text) =>
        set((s) => {
          const msgs = [...s.messages];
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === "assistant") {
              msgs[i] = { ...msgs[i], content: text };
              break;
            }
          }
          return { messages: msgs };
        }),
      clearMessages: () => set({ messages: [] }),

      isIndexing: false,
      setIsIndexing: (v) => set({ isIndexing: v }),
      isStreaming: false,
      setIsStreaming: (v) => set({ isStreaming: v }),
      indexError: null,
      setIndexError: (e) => set({ indexError: e }),
    }),
    {
      name: "beacon-app-state",
      version: 2,
      migrate: (persistedState, _version) => {
        const state = (persistedState ?? {}) as {
          settings?: Partial<AppSettings>;
          activeProject?: Project | null;
        };
        const selectedModel = state.settings?.selectedModel;
        const usesLegacyModel =
          typeof selectedModel === "string" &&
          /^(gemini-(1\.5|2(\.\d+)?))/.test(selectedModel);

        return {
          settings: {
            selectedModel:
              usesLegacyModel || !selectedModel
                ? DEFAULT_GEMINI_MODEL_ID
                : selectedModel,
            streamingEnabled: state.settings?.streamingEnabled ?? true,
            maxContextFiles: state.settings?.maxContextFiles ?? 40,
            githubToken: state.settings?.githubToken,
          },
          activeProject: state.activeProject
            ? { ...state.activeProject, files: undefined }
            : null,
          recentProjects: [],
        };
      },
      partialize: (s) => ({
        settings: s.settings,
        activeProject: s.activeProject
          ? { ...s.activeProject, files: undefined }
          : null,
        recentProjects: s.recentProjects.map((p) => ({
          ...p,
          files: undefined,
        })),
      }),
    },
  ),
);
