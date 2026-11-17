// =============================================================================
// CHEAP DICE: CHAT CONTROLS (IC / EM TOGGLES)
// =============================================================================

import { MODULE_ID, SETTINGS } from "../src/constants.js";

/** @type {"ic" | "em" | null} Currently active chat mode */
let activeChatMode = null;

/**
 * Returns the currently active chat mode.
 * @returns {"ic" | "em" | null}
 */
export function getActiveChatMode() {
  return activeChatMode;
}

/**
 * Sets the active chat mode.
 * @param {"ic" | "em" | null} mode
 * @returns {"ic" | "em" | null}
 */
export function setActiveChatMode(mode) {
  activeChatMode = (mode === "ic" || mode === "em") ? mode : null;
  updateChatModeUI();
  return activeChatMode;
}

/**
 * Toggles a chat mode on or off.
 * If the mode is already active, it toggles off (reverts to null).
 * @param {"ic" | "em"} mode
 * @returns {"ic" | "em" | null}
 */
export function toggleChatMode(mode) {
  if (activeChatMode === mode) {
    return setActiveChatMode(null);
  }
  return setActiveChatMode(mode);
}

/**
 * Pure function: formats a raw chat message string based on the active mode.
 * Leaves messages starting with "/" untouched (e.g. rolls, whispers, existing commands).
 * Also strips ProseMirror HTML wrapping tags (<p>...</p>) so slash commands are clean.
 * 
 * @param {string} message
 * @param {"ic" | "em" | null} mode
 * @returns {string}
 */
export function formatChatMessageWithMode(message, mode) {
  if (!message || typeof message !== "string") return message;
  const trimmed = message.trim();
  if (!trimmed) return message;

  // Preserve existing slash commands (e.g. /r, /roll, /w, /ic, /em, /ooc)
  if (!mode || trimmed.startsWith("/")) {
    return message;
  }

  // Strip leading/trailing <p> and </p> if ProseMirror wrapped the input
  let text = trimmed.replace(/^<p>\s*/i, "").replace(/\s*<\/p>$/i, "").trim();
  if (!text) return message;
  if (text.startsWith("/")) return text;

  return `/${mode} ${text}`;
}

/**
 * Updates button active states and textarea placeholder in the DOM.
 */
export function updateChatModeUI() {
  if (typeof document === "undefined") return;

  const buttons = document.querySelectorAll(".gp-chat-mode-btn");
  buttons.forEach((btn) => {
    const btnMode = btn.dataset.mode;
    if (btnMode === activeChatMode) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  const textarea = document.querySelector("#chat-message");
  if (textarea) {
    if (!textarea.dataset.gpOriginalPlaceholder) {
      textarea.dataset.gpOriginalPlaceholder = textarea.placeholder || "";
    }

    const basePlaceholder = textarea.dataset.gpOriginalPlaceholder;
    if (activeChatMode === "ic") {
      textarea.placeholder = `[In Character] ${basePlaceholder}`.trim();
    } else if (activeChatMode === "em") {
      textarea.placeholder = `[Emote] ${basePlaceholder}`.trim();
    } else {
      textarea.placeholder = basePlaceholder;
    }
  }
}

/**
 * Injects styling rules for the chat mode buttons into the document head.
 */
function injectChatStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("gp-chat-controls-style")) return;

  const style = document.createElement("style");
  style.id = "gp-chat-controls-style";
  style.textContent = `
    #chat #chat-controls {
      display: flex !important;
      align-items: center !important;
      flex-wrap: nowrap !important;
      gap: 3px !important;
      padding: 0 4px !important;
      overflow: visible !important;
    }
    #chat #chat-controls label,
    #chat #chat-controls .chat-control-icon:not(.export-log):not(.clear-log) {
      order: 1 !important;
      flex: 0 0 auto !important;
    }
    #chat #chat-controls select[name="rollMode"] {
      order: 2 !important;
      flex: 1 1 auto !important;
      min-width: 0 !important;
      height: 24px !important;
      margin-right: 2px !important;
    }
    #chat #chat-controls .gp-chat-mode-group {
      order: 3 !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 3px !important;
      flex: 0 0 auto !important;
      margin: 0 2px !important;
      padding: 0 !important;
    }
    #chat #chat-controls .control-tools,
    #chat #chat-controls .export-log,
    #chat #chat-controls .clear-log,
    #chat #chat-controls a:has(.fa-save),
    #chat #chat-controls a:has(.fa-trash) {
      order: 4 !important;
      flex: 0 0 auto !important;
      margin-left: 2px !important;
    }
    .gp-chat-mode-btn {
      flex: 0 0 auto !important;
      height: 22px !important;
      line-height: 20px !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      padding: 0 6px !important;
      border-radius: 3px !important;
      cursor: pointer !important;
      background: rgba(0, 0, 0, 0.4) !important;
      border: 1px solid rgba(255, 255, 255, 0.25) !important;
      color: #c9c7b8 !important;
      transition: all 0.15s ease-in-out !important;
    }
    .gp-chat-mode-btn:hover {
      background: rgba(255, 255, 255, 0.12) !important;
      color: #ffffff !important;
      border-color: rgba(255, 255, 255, 0.4) !important;
    }
    .gp-chat-mode-btn.active[data-mode="ic"] {
      background: rgba(30, 110, 175, 0.85) !important;
      border-color: #3ba3ec !important;
      color: #ffffff !important;
      box-shadow: 0 0 5px rgba(59, 163, 236, 0.6) !important;
    }
    .gp-chat-mode-btn.active[data-mode="em"] {
      background: rgba(190, 80, 10, 0.85) !important;
      border-color: #f39c12 !important;
      color: #ffffff !important;
      box-shadow: 0 0 5px rgba(243, 156, 18, 0.6) !important;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Renders the toggle buttons into the ChatLog sidebar.
 * @param {Application} app
 * @param {JQuery|HTMLElement} html
 */
export function renderChatControls(app, html) {
  const root = html?.[0] ?? (html instanceof HTMLElement ? html : document.getElementById("chat"));
  if (!root) return;

  injectChatStyles();

  // Remove any pre-existing instance in the document to prevent duplicates
  if (typeof document !== "undefined") {
    document.querySelectorAll(".gp-chat-mode-group").forEach((el) => el.remove());
  }

  const container = document.createElement("div");
  container.className = "gp-chat-mode-group";

  const icBtn = document.createElement("button");
  icBtn.type = "button";
  icBtn.className = "gp-chat-mode-btn";
  icBtn.dataset.mode = "ic";
  icBtn.title = "Toggle In-Character Mode (/ic)";
  icBtn.textContent = "IC";
  icBtn.addEventListener("click", (e) => {
    e.preventDefault();
    toggleChatMode("ic");
    root.querySelector("#chat-message")?.focus();
  });

  const emBtn = document.createElement("button");
  emBtn.type = "button";
  emBtn.className = "gp-chat-mode-btn";
  emBtn.dataset.mode = "em";
  emBtn.title = "Toggle Emote Mode (/em)";
  emBtn.textContent = "EM";
  emBtn.addEventListener("click", (e) => {
    e.preventDefault();
    toggleChatMode("em");
    root.querySelector("#chat-message")?.focus();
  });

  container.appendChild(icBtn);
  container.appendChild(emBtn);

  // Mount cleanly into #chat-controls:
  // For GM: placed between rollMode select and the save/trash action buttons.
  // For Players: placed next in line right after rollMode select.
  const chatControls = root.querySelector("#chat-controls") || document.querySelector("#chat-controls");

  if (chatControls) {
    let gmAnchor = chatControls.querySelector(".export-log, [data-action='export']");
    if (!gmAnchor) {
      const saveIcon = chatControls.querySelector(".fa-save, .fa-floppy-disk");
      if (saveIcon) gmAnchor = saveIcon.closest("a, button");
    }

    if (gmAnchor && gmAnchor.parentNode === chatControls) {
      chatControls.insertBefore(container, gmAnchor);
    } else {
      chatControls.appendChild(container);
    }
  } else {
    const chatForm = root.querySelector("#chat-form") || document.querySelector("#chat-form");
    if (chatForm && chatForm.parentNode) {
      chatForm.parentNode.insertBefore(container, chatForm);
    }
  }

  updateChatModeUI();
}

/**
 * Wraps ChatLog.prototype.processMessage to prepend /ic or /em when active.
 */
export function wrapChatLogProcessMessage() {
  const candidates = [
    globalThis.ChatLog?.prototype,
    globalThis.CONFIG?.ui?.chat?.prototype,
    foundry?.applications?.sidebar?.tabs?.ChatLog?.prototype,
    typeof ui !== "undefined" ? ui.chat : null
  ].filter((c) => c && typeof c.processMessage === "function");

  for (const target of candidates) {
    if (target._gpChatModeWrapped) continue;
    const originalProcessMessage = target.processMessage;
    target.processMessage = async function(message, ...args) {
      const formatted = formatChatMessageWithMode(message, activeChatMode);
      return originalProcessMessage.call(this, formatted, ...args);
    };
    target._gpChatModeWrapped = true;
  }
}

let isProcessingModeMessage = false;

/**
 * Hook handler for Foundry's native 'chatMessage' hook.
 * Intercepts raw text entered into the chat input and converts it to /ic or /em.
 * Returns false to abort Foundry's default un-prefixed message creation.
 * 
 * @param {ChatLog} chatLog
 * @param {string} message
 * @param {object} chatData
 * @returns {boolean|void}
 */
export function handleChatMessageHook(chatLog, message, chatData) {
  if (isProcessingModeMessage || !activeChatMode) return true;
  const formatted = formatChatMessageWithMode(message, activeChatMode);
  if (formatted === message) return true;

  isProcessingModeMessage = true;
  try {
    chatLog.processMessage(formatted);
  } finally {
    isProcessingModeMessage = false;
  }
  return false;
}

/**
 * Initializes the Chat Controls module.
 */
export function initChatControls() {
  wrapChatLogProcessMessage();

  // Register native Foundry chatMessage hook interceptor
  Hooks.on("chatMessage", handleChatMessageHook);

  Hooks.on("renderChatLog", (app, html) => {
    wrapChatLogProcessMessage();
    try {
      renderChatControls(app, html);
    } catch (err) {
      console.error(`${MODULE_ID} | Error rendering Chat Controls:`, err);
    }
  });

  // Mount when game is ready if not already rendered
  if (typeof game !== "undefined") {
    if (game.ready) {
      wrapChatLogProcessMessage();
      const chatEl = ui.chat?.element?.[0] ?? (ui.chat?.element instanceof HTMLElement ? ui.chat.element : document.getElementById("chat"));
      if (chatEl) renderChatControls(ui.chat, chatEl);
    } else {
      Hooks.once("ready", () => {
        wrapChatLogProcessMessage();
        const chatEl = ui.chat?.element?.[0] ?? (ui.chat?.element instanceof HTMLElement ? ui.chat.element : document.getElementById("chat"));
        if (chatEl) renderChatControls(ui.chat, chatEl);
      });
    }
  }
}
