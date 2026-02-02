import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Separator from "@radix-ui/react-separator";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { FileContent, RepoInfo, ChatMessage, ChatSession, ChatSessionSummary } from "../types";
import { interpretCode, getChatSessions, getChatSession, saveChatSession, deleteChatSession } from "../api";

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  pinned?: boolean;
  onTogglePin?: () => void;
  filePath: string;
  fileContent: FileContent | null;
  repoInfo: RepoInfo | null;
  selectedText: string;
  apiKey: string | null;
  model: string;
}

function renderMarkdown(content: string): string {
  let result = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^######\s+(.*)$/gm, "<h6>$1</h6>")
    .replace(/^#####\s+(.*)$/gm, "<h5>$1</h5>")
    .replace(/^####\s+(.*)$/gm, "<h4>$1</h4>")
    .replace(/^###\s+(.*)$/gm, "<h3>$1</h3>")
    .replace(/^##\s+(.*)$/gm, "<h2>$1</h2>")
    .replace(/^#\s+(.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/^---$/gm, "<hr />")
    .replace(/^[\*\-]\s+(.*)$/gm, "<li>$1</li>")
    .replace(/^\d+\.\s+(.*)$/gm, "<li>$1</li>")
    .replace(/^>\s+(.*)$/gm, "<blockquote>$1</blockquote>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br />");

  result = result.replace(/(<li>.*<\/li>)(?=<li>|$)/gs, "<ul>$1</ul>");
  result = result.replace(/<\/ul><ul>/g, "");

  return `<p>${result}</p>`;
}

function getFirst100Lines(content: string): string {
  const lines = content.split("\n");
  if (lines.length <= 100) return content;
  return lines.slice(0, 100).join("\n") + "\n... (truncated)";
}

function getFileName(path: string): string {
  return path.split("/").pop() || path;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

type ViewMode = "chat" | "history";

export function ChatSidebar({
  isOpen,
  onClose,
  pinned = false,
  onTogglePin,
  filePath,
  fileContent,
  repoInfo,
  selectedText,
  apiKey,
  model,
}: ChatSidebarProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const repoUrl = repoInfo?.url || "";

  // Load sessions when repo changes
  useEffect(() => {
    if (repoUrl && isOpen) {
      loadSessions();
    }
  }, [repoUrl, isOpen]);

  // Reset to chat view when file changes
  useEffect(() => {
    setMessages([]);
    setCurrentSessionId(null);
    setShowQuickActions(true);
    setViewMode("chat");
  }, [filePath]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when in chat view
  useEffect(() => {
    if (isOpen && viewMode === "chat" && !showQuickActions) {
      inputRef.current?.focus();
    }
  }, [isOpen, viewMode, showQuickActions]);

  const loadSessions = useCallback(async () => {
    if (!repoUrl) return;
    try {
      const list = await getChatSessions(repoUrl);
      setSessions(list);
    } catch (err) {
      console.error("Failed to load chat sessions:", err);
    }
  }, [repoUrl]);

  const contextCode = useMemo(() => {
    if (selectedText.trim()) {
      return selectedText;
    }
    if (fileContent?.content) {
      return getFirst100Lines(fileContent.content);
    }
    return "";
  }, [selectedText, fileContent?.content]);

  const contextLabel = useMemo(() => {
    if (selectedText.trim()) {
      return "Selected code";
    }
    if (fileContent?.content) {
      const lines = fileContent.content.split("\n").length;
      if (lines > 100) {
        return `First 100 of ${lines} lines`;
      }
      return `${lines} lines`;
    }
    return "";
  }, [selectedText, fileContent?.content]);

  const saveCurrentSession = useCallback(async (msgs: ChatMessage[], sessionId: string | null) => {
    if (!repoUrl || msgs.length === 0) return;

    const now = new Date().toISOString();
    const title = msgs[0]?.content.slice(0, 50) || "New chat";

    const session: ChatSession = {
      id: sessionId || generateId(),
      title,
      file_path: filePath,
      messages: msgs,
      created_at: sessionId ? (sessions.find(s => s.id === sessionId)?.created_at || now) : now,
      updated_at: now,
    };

    try {
      await saveChatSession(repoUrl, session);
      setCurrentSessionId(session.id);
      await loadSessions();
    } catch (err) {
      console.error("Failed to save chat session:", err);
    }
  }, [repoUrl, filePath, sessions, loadSessions]);

  const sendMessage = async (userMessage: string) => {
    if (!apiKey) {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: userMessage },
        {
          role: "assistant",
          content: "Please set your OpenRouter API key in Settings first.",
        },
      ]);
      return;
    }

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: userMessage },
    ];
    setMessages(newMessages);
    setIsLoading(true);
    setShowQuickActions(false);

    try {
      const language = fileContent?.language || "unknown";
      const project = repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : "unknown";

      const contextInfo = `File: ${filePath}\nLanguage: ${language}\nProject: ${project}`;
      const codeContext = contextCode
        ? `\n\nCode:\n\`\`\`${language}\n${contextCode}\n\`\`\``
        : "";

      const conversationHistory = newMessages
        .slice(0, -1)
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");

      const fullPrompt = `${contextInfo}${codeContext}

${conversationHistory ? `Previous conversation:\n${conversationHistory}\n\n` : ""}User: ${userMessage}

Please respond concisely and helpfully. If discussing code, be specific and reference line numbers when relevant.`;

      const result = await interpretCode(
        apiKey,
        fullPrompt,
        "",
        language,
        project,
        model
      );

      const finalMessages: ChatMessage[] = [...newMessages, { role: "assistant", content: result }];
      setMessages(finalMessages);

      // Auto-save session
      await saveCurrentSession(finalMessages, currentSessionId);
    } catch (err) {
      const errorMessages: ChatMessage[] = [
        ...newMessages,
        { role: "assistant", content: `Error: ${String(err)}` },
      ];
      setMessages(errorMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (action: string) => {
    const fileName = getFileName(filePath);

    let prompt = "";
    switch (action) {
      case "what":
        prompt = `What is "${fileName}"? When do developers typically create files with this name? What is its common purpose?`;
        break;
      case "explain":
        prompt = "Explain this code. What does it do and how does it work?";
        break;
      case "summarize":
        prompt = "Give me a brief summary of this file in 2-3 sentences.";
        break;
      case "issues":
        prompt =
          "Review this code and identify any potential issues, bugs, or areas for improvement.";
        break;
      case "usage":
        prompt = "How would I use this code? Show me example usage if applicable.";
        break;
    }

    if (prompt) {
      sendMessage(prompt);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    sendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
    setShowQuickActions(true);
    setViewMode("chat");
  };

  const handleLoadSession = async (sessionId: string) => {
    if (!repoUrl) return;
    try {
      const session = await getChatSession(repoUrl, sessionId);
      if (session) {
        setMessages(session.messages);
        setCurrentSessionId(session.id);
        setShowQuickActions(false);
        setViewMode("chat");
      }
    } catch (err) {
      console.error("Failed to load session:", err);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!repoUrl) return;
    try {
      await deleteChatSession(repoUrl, sessionId);
      await loadSessions();
      if (currentSessionId === sessionId) {
        handleNewChat();
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  const hasFile = !!filePath && !!fileContent && !fileContent.is_binary;

  const quickActions = [
    { id: "what", label: "What is this file?", description: "Explain the file name and typical purpose" },
    { id: "explain", label: "Explain this code", description: "Detailed explanation of how the code works" },
    { id: "summarize", label: "Summarize", description: "Brief 2-3 sentence summary" },
    { id: "issues", label: "Find potential issues", description: "Code review and bug detection" },
    { id: "usage", label: "How to use this?", description: "Usage examples and patterns" },
  ];

  const content = (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-left">
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                className={`chat-icon-btn ${pinned ? "active" : ""}`}
                onClick={onTogglePin}
                disabled={!onTogglePin}
                aria-label={pinned ? "Unpin chat" : "Pin chat"}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M5 3h6l-1 4 2 2v2H4V9l2-2-1-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                  <path d="M8 11v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="TooltipContent" sideOffset={5}>
                {pinned ? "Unpin" : "Pin to right"}
                <Tooltip.Arrow className="TooltipArrow" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
          <div className="chat-title">
            {viewMode === "history" ? "History" : "Chat"}
          </div>
        </div>
        <div className="chat-header-actions">
          {viewMode === "chat" && messages.length > 0 && (
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  className="chat-icon-btn"
                  onClick={handleNewChat}
                  aria-label="New chat"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="TooltipContent" sideOffset={5}>
                  New chat
                  <Tooltip.Arrow className="TooltipArrow" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          )}
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                className={`chat-icon-btn ${viewMode === "history" ? "active" : ""}`}
                onClick={() => setViewMode(viewMode === "history" ? "chat" : "history")}
                aria-label="History"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 4v4l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="TooltipContent" sideOffset={5}>
                {viewMode === "history" ? "Back to chat" : "Chat history"}
                <Tooltip.Arrow className="TooltipArrow" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
          <button className="chat-icon-btn" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {viewMode === "chat" && hasFile && (
        <>
          <div className="chat-context">
            <span className="chat-context-file" title={filePath}>
              {getFileName(filePath)}
            </span>
            {contextLabel && (
              <span className="chat-context-info">{contextLabel}</span>
            )}
          </div>
          <Separator.Root className="chat-separator" />
        </>
      )}

      {viewMode === "history" ? (
        <ScrollArea.Root className="chat-scroll-root">
          <ScrollArea.Viewport className="chat-scroll-viewport">
            <div className="chat-history-list">
              {sessions.length === 0 ? (
                <div className="chat-empty-state">
                  <p>No chat history yet.</p>
                </div>
              ) : (
                sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`chat-history-item ${currentSessionId === session.id ? "active" : ""}`}
                    onClick={() => handleLoadSession(session.id)}
                  >
                    <div className="chat-history-item-content">
                      <div className="chat-history-item-title">{session.title}</div>
                      <div className="chat-history-item-meta">
                        <span>{getFileName(session.file_path)}</span>
                        <span>{session.message_count} messages</span>
                        <span>{formatTime(session.updated_at)}</span>
                      </div>
                    </div>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <button
                          className="chat-history-item-delete"
                          onClick={(e) => handleDeleteSession(session.id, e)}
                          aria-label="Delete"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content className="TooltipContent" sideOffset={5}>
                          Delete
                          <Tooltip.Arrow className="TooltipArrow" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </div>
                ))
              )}
            </div>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar className="chat-scrollbar" orientation="vertical">
            <ScrollArea.Thumb className="chat-scrollbar-thumb" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      ) : (
        <>
          <ScrollArea.Root className="chat-scroll-root">
            <ScrollArea.Viewport className="chat-scroll-viewport">
              <div className="chat-messages">
                {showQuickActions && hasFile && (
                  <div className="chat-quick-actions">
                    <p className="chat-quick-title">Quick actions</p>
                    {quickActions.map((action) => (
                      <Tooltip.Root key={action.id}>
                        <Tooltip.Trigger asChild>
                          <button
                            className="chat-quick-btn"
                            onClick={() => handleQuickAction(action.id)}
                            disabled={isLoading}
                          >
                            {action.label}
                          </button>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content className="TooltipContent" side="left" sideOffset={8}>
                            {action.description}
                            <Tooltip.Arrow className="TooltipArrow" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    ))}
                  </div>
                )}

                {showQuickActions && !hasFile && (
                  <div className="chat-empty-state">
                    <p>Select a file to start chatting about it.</p>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <div key={idx} className={`chat-message chat-message-${msg.role}`}>
                    <div className="chat-message-role">
                      {msg.role === "user" ? "You" : "AI"}
                    </div>
                    {msg.role === "assistant" ? (
                      <div
                        className="chat-message-content markdown-preview"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                      />
                    ) : (
                      <div className="chat-message-content">{msg.content}</div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="chat-message chat-message-assistant">
                    <div className="chat-message-role">AI</div>
                    <div className="chat-message-content chat-loading">
                      <span className="chat-typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar className="chat-scrollbar" orientation="vertical">
              <ScrollArea.Thumb className="chat-scrollbar-thumb" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>

          <Separator.Root className="chat-separator" />

          <form className="chat-input-form" onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder={hasFile ? "Ask about this code..." : "Select a file first..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!hasFile || isLoading}
              rows={1}
            />
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="submit"
                  className="chat-send-btn"
                  disabled={!hasFile || !input.trim() || isLoading}
                  aria-label="Send message"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="TooltipContent" sideOffset={5}>
                  Send (Enter)
                  <Tooltip.Arrow className="TooltipArrow" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </form>
        </>
      )}
    </div>
  );

  return (
    <Tooltip.Provider delayDuration={300}>
      {pinned ? (
        isOpen ? <div className="chat-sidebar pinned">{content}</div> : null
      ) : (
        <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
          <Dialog.Portal>
            <Dialog.Overlay className="chat-overlay" />
            <Dialog.Content className="chat-sidebar" onOpenAutoFocus={(e) => e.preventDefault()}>
              {content}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </Tooltip.Provider>
  );
}
