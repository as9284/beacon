import { invoke, Channel } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Returns the live Tauri window handle. */
export const win = () => getCurrentWindow();

// ── Keychain ──────────────────────────────────────────────────────────────

export const saveApiKey = (key: string) =>
  invoke<void>("save_api_key", { key });

export const getApiKey = () => invoke<string | null>("get_api_key");

export const deleteApiKey = () => invoke<void>("delete_api_key");

// ── Gemini models ─────────────────────────────────────────────────────────

export interface GeminiModelInfo {
  id: string;
  display_name: string;
  description: string;
  supports_vision: boolean;
  context_window: number;
}

export interface GeminiModelCatalog {
  source: "live" | "fallback";
  models: GeminiModelInfo[];
}

export const listGeminiModels = () =>
  invoke<GeminiModelCatalog>("list_gemini_models");

// ── Project ───────────────────────────────────────────────────────────────

export interface RustFileEntry {
  path: string;
  relative_path: string;
  size: number;
  is_text: boolean;
  content?: string;
}

export const pickProjectFolder = () =>
  invoke<string | null>("pick_project_folder");

export const indexLocalProject = (root: string) =>
  invoke<RustFileEntry[]>("index_local_project", { root });

export const fetchGithubRepo = (githubUrl: string, token?: string) =>
  invoke<RustFileEntry[]>("fetch_github_repo", {
    githubUrl,
    token: token ?? null,
  });

export const readFileContent = (path: string) =>
  invoke<string>("read_file_content", { path });

// ── Streaming chat ────────────────────────────────────────────────────────

export interface ChatMessagePayload {
  role: "user" | "model";
  content: string;
}

export type StreamEvent =
  | { type: "chunk"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export const streamChat = (
  apiKey: string,
  modelId: string,
  messages: ChatMessagePayload[],
  systemPrompt: string,
  onEvent: (e: StreamEvent) => void,
) => {
  const channel = new Channel<StreamEvent>();
  channel.onmessage = onEvent;
  return invoke<void>("stream_chat", {
    apiKey,
    modelId,
    messages,
    systemPrompt,
    channel,
  });
};

// ── Window controls ───────────────────────────────────────────────────────

export const minimizeWindow = () => win().minimize();
export const maximizeWindow = () => win().toggleMaximize();
export const closeWindow = () => win().close();
export const toggleFullscreen = async () => {
  const isFull = await win().isFullscreen();
  await win().setFullscreen(!isFull);
};
export const isMaximized = () => win().isMaximized();
export const isFullscreen = () => win().isFullscreen();
