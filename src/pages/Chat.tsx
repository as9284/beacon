import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import TextareaAutosize from "react-textarea-autosize";
import {
  Send,
  FolderOpen,
  Trash2,
  RefreshCw,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { getApiKey, streamChat, indexLocalProject } from "../lib/tauri";
import { useAppStore, ChatMessage } from "../store/useAppStore";
import BeaconLogo from "../components/BeaconLogo";

// ── Luna persona ─────────────────────────────────────────────────────────────

function buildSystemPrompt(projectName: string, fileTree: string): string {
  return `You are Luna — a dry-witted, lightly sarcastic AI assistant embedded in Beacon. \
Think Ada from Satisfactory crossed with JARVIS from Iron Man: sharp, deadpan, never gushing, genuinely helpful. \
You have deeply analyzed the project "${projectName}" and know it better than most of the people who wrote it.

When answering questions:
- Be specific and cite file paths when relevant (e.g. \`src/lib/tauri.ts\`).
- Be concise unless depth is warranted. Don't pad answers.
- If something is ambiguous in the code, say so instead of guessing.
- Use a touch of dry humour when it fits. Not every reply needs a joke — restraint is funnier.
- Never use phrases like "Certainly!", "Great question!", or "Of course!" — they are banned.

Project file tree (partial):
\`\`\`
${fileTree}
\`\`\``;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

function buildFileTree(files: { relativePath: string }[]): string {
  return files
    .slice(0, 300)
    .map((f) => f.relativePath)
    .join("\n");
}

function buildContextBlock(
  files: { relativePath: string; path: string; isText: boolean }[],
  maxFiles: number,
): string {
  const textFiles = files.filter((f) => f.isText).slice(0, maxFiles);
  return textFiles
    .map((f) => `// File: ${f.relativePath}\n[content loaded on demand]`)
    .join("\n\n");
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Chat() {
  const {
    activeProject,
    messages,
    addMessage,
    updateLastAssistantMessage,
    clearMessages,
    settings,
    isStreaming,
    setIsStreaming,
    isIndexing,
    setIsIndexing,
    setView,
    setActiveProject,
    setIndexError,
  } = useAppStore();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamBufferRef = useRef("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleReindex = useCallback(async () => {
    if (!activeProject || activeProject.source !== "local") return;
    setIsIndexing(true);
    setIndexError(null);
    try {
      const files = await indexLocalProject(activeProject.root);
      setActiveProject({
        ...activeProject,
        fileCount: files.length,
        indexedAt: Date.now(),
        files: files.map((f) => ({
          path: f.path,
          relativePath: f.relative_path,
          size: f.size,
          isText: f.is_text,
        })),
      });
    } catch (e) {
      setIndexError(String(e));
    } finally {
      setIsIndexing(false);
    }
  }, [activeProject, setActiveProject, setIsIndexing, setIndexError]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming || isIndexing) return;

    const apiKey = await getApiKey();
    if (!apiKey) {
      addMessage({
        id: uid(),
        role: "assistant",
        content:
          "I'd love to help, but you haven't given me an API key yet. Head to Settings and fix that.",
        timestamp: Date.now(),
      });
      return;
    }

    setInput("");

    // Add user message
    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    addMessage(userMsg);

    // Placeholder for streaming
    const assistantMsg: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };
    addMessage(assistantMsg);
    setIsStreaming(true);
    streamBufferRef.current = "";

    try {
      const fileTree = activeProject?.files
        ? buildFileTree(activeProject.files)
        : "";
      const contextBlock = activeProject?.files
        ? buildContextBlock(activeProject.files, settings.maxContextFiles)
        : "";

      const systemPrompt = activeProject
        ? buildSystemPrompt(activeProject.name, fileTree)
        : "You are Luna, a dry-witted AI assistant built into Beacon. No project is loaded yet — let the user know they should pick one from the home screen.";

      const history = messages
        .filter((m) => m.id !== assistantMsg.id)
        .slice(-20)
        .map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("model" as const),
          content: m.content,
        }));

      // Append context to final user message
      const finalUserContent = contextBlock
        ? `${text}\n\n---\nProject context (file listing):\n${contextBlock}`
        : text;

      const fullHistory = [
        ...history.slice(0, -1),
        { role: "user" as const, content: finalUserContent },
      ];

      await streamChat(
        apiKey,
        settings.selectedModel,
        fullHistory,
        systemPrompt,
        (event) => {
          if (event.type === "chunk") {
            streamBufferRef.current += event.text;
            updateLastAssistantMessage(streamBufferRef.current);
          } else if (event.type === "done") {
            setIsStreaming(false);
          } else if (event.type === "error") {
            updateLastAssistantMessage(
              `**Error:** ${event.message}\n\nSomething went wrong. Probably not my fault, but check your API key just in case.`,
            );
            setIsStreaming(false);
          }
        },
      );
    } catch (e) {
      updateLastAssistantMessage(
        `**Error:** ${String(e)}\n\nWell, that didn't work. Classic.`,
      );
      setIsStreaming(false);
    }
  }, [
    input,
    isStreaming,
    isIndexing,
    messages,
    addMessage,
    updateLastAssistantMessage,
    settings,
    activeProject,
    setIsStreaming,
  ]);

  if (!activeProject) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <BeaconLogo size={72} animated />
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
          No project loaded.
        </p>
        <button
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg"
          style={{
            background: "rgba(124,58,237,0.2)",
            border: "1px solid rgba(124,58,237,0.35)",
            color: "var(--color-purple-300)",
          }}
          onClick={() => setView("home")}
        >
          <FolderOpen size={15} />
          Pick a project
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ── Project header ── */}
      <div
        className="flex items-center gap-2.5 px-4 py-2 border-b shrink-0"
        style={{ borderColor: "var(--color-border-dim)" }}
      >
        <button
          className="win-btn shrink-0"
          onClick={() => setView("home")}
          title="Back to home"
          style={{ opacity: 0.45 }}
        >
          <ChevronLeft size={14} />
        </button>

        <div className="flex-1 flex items-center gap-2.5 min-w-0">
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-semibold truncate leading-tight"
              style={{ color: "var(--color-text-primary)" }}
            >
              {activeProject.name}
            </p>
            <p
              className="text-xs truncate"
              style={{ color: "var(--color-text-muted)", marginTop: 1 }}
            >
              {activeProject.source === "local"
                ? `${activeProject.fileCount} files · ${activeProject.root}`
                : activeProject.githubUrl}
            </p>
          </div>

          {/* Active model badge */}
          <span
            className="text-xs px-2 py-0.5 rounded-full shrink-0 font-mono"
            style={{
              background: "rgba(109,40,217,0.15)",
              border: "1px solid rgba(109,40,217,0.25)",
              color: "var(--color-purple-400)",
              fontSize: "0.68rem",
            }}
          >
            {settings.selectedModel
              .replace(/^models\//, "")
              .replace(/^gemini-/, "")}
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {activeProject.source === "local" && (
            <button
              className="win-btn"
              onClick={handleReindex}
              disabled={isIndexing}
              title="Re-index project"
            >
              <RefreshCw
                size={13}
                className={isIndexing ? "animate-spin" : ""}
              />
            </button>
          )}
          <button
            className="win-btn"
            onClick={clearMessages}
            title="Clear chat history"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <motion.div
            className="flex flex-col items-center gap-4 mt-14"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <BeaconLogo size={52} animated />
            <div className="text-center space-y-1.5" style={{ maxWidth: 320 }}>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {activeProject.name}
              </p>
              <p
                className="text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                Luna has reviewed{" "}
                {activeProject.fileCount > 0
                  ? `${activeProject.fileCount} files`
                  : "the project"}{" "}
                and has opinions. Ask away.
              </p>
            </div>

            {/* Suggested prompt chips */}
            <div className="flex flex-wrap gap-2 justify-center mt-1">
              {[
                "Give me an overview of this codebase",
                "What are the main entry points?",
                "Any obvious issues or improvements?",
              ].map((prompt) => (
                <button
                  key={prompt}
                  className="text-xs px-3 py-1.5 rounded-full transition-all duration-150"
                  style={{
                    background: "rgba(18,16,40,0.7)",
                    border: "1px solid var(--color-border-dim)",
                    color: "var(--color-text-secondary)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "rgba(124,58,237,0.4)";
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "var(--color-purple-300)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "var(--color-border-dim)";
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "var(--color-text-secondary)";
                  }}
                  onClick={() => setInput(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {msg.role === "assistant" && (
                <div className="shrink-0 mr-3 mt-1">
                  <BeaconLogo size={28} animated={false} />
                </div>
              )}
              <div
                className={`max-w-[75%] px-4 py-3 text-sm ${
                  msg.role === "user" ? "msg-user" : "msg-assistant"
                }`}
              >
                {msg.role === "assistant" ? (
                  msg.content === "" ? (
                    <span className="flex gap-1.5 items-center py-0.5">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </span>
                  ) : (
                    <div className="prose-beacon">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )
                ) : (
                  <p
                    style={{
                      color: "var(--color-text-primary)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {msg.content}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* ── Chat input ── */}
      <div
        className="px-4 pb-3.5 pt-2.5"
        style={{ borderTop: "1px solid var(--color-border-dim)" }}
      >
        <div className="flex items-center gap-2.5">
          <TextareaAutosize
            className="chat-input"
            minRows={1}
            maxRows={8}
            placeholder="Ask Luna about the project…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            disabled={isStreaming}
          />
          <button
            className="btn-send-row"
            onClick={sendMessage}
            disabled={isStreaming || !input.trim()}
            title="Send (Enter)"
          >
            {isStreaming ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
        <p
          className="text-center text-xs mt-1.5"
          style={{ color: "var(--color-text-dim)" }}
        >
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
