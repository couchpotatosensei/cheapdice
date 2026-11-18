// =============================================================================
// CHEAP DICE: DICE TRAY COPYCAT (DICE TRAY ARCHITECTURE)
// =============================================================================

import { MODULE_ID, SETTINGS } from "../src/constants.js";

export const DICE_DEFS = [
  { id: "d4", label: "d4", icon: "fas fa-dice-d4" },
  { id: "d6", label: "d6", icon: "fas fa-dice-d6" },
  { id: "d8", label: "d8", icon: "fas fa-dice-d8" },
  { id: "d10", label: "d10", icon: "fas fa-dice-d10" },
  { id: "d12", label: "d12", icon: "fas fa-dice-d12" },
  { id: "d20", label: "d20", icon: "fas fa-dice-d20" },
  {
    id: "d100",
    label: "d100",
    isCustomHtml: true,
    html: `<span class="gp-dt-twin-d10"><i class="fas fa-dice-d10"></i><i class="fas fa-dice-d10"></i></span>`
  }
];

export const DICE_TYPES = DICE_DEFS.map((d) => d.id);

/** @type {"norm" | "adv" | "dis"} */
let activeMode = "norm";

/**
 * Returns the currently active roll mode.
 * @returns {"norm" | "adv" | "dis"}
 */
export function getTrayMode() {
  return activeMode;
}

/**
 * Sets the tray roll mode.
 * @param {"norm" | "adv" | "dis"} mode
 */
export function setTrayMode(mode) {
  if (mode === "norm" || mode === "adv" || mode === "dis") {
    activeMode = mode;
  }
  return activeMode;
}

/**
 * Cycles the roll mode: norm -> adv -> dis -> norm.
 * @returns {"norm" | "adv" | "dis"}
 */
export function cycleTrayMode() {
  if (activeMode === "norm") activeMode = "adv";
  else if (activeMode === "adv") activeMode = "dis";
  else activeMode = "norm";
  return activeMode;
}

/**
 * Appends or increments a die in the chat text formula.
 * Combines identical dice into unified counts (e.g. 1d4 -> 2d4 -> 3d4).
 * @param {string} currentText
 * @param {string} die - e.g. "d4", "d6", "d20", "d100"
 * @param {"norm" | "adv" | "dis"} mode
 * @returns {string}
 */
export function appendDieToChatText(currentText, die, mode = "norm") {
  let raw = (currentText || "").trim();
  if (!raw || raw === "/r") {
    let initialDie = `1${die}`;
    if (die === "d20") {
      if (mode === "adv") initialDie = "2d20kh";
      else if (mode === "dis") initialDie = "2d20kl";
      else initialDie = "1d20";
    }
    return `/r ${initialDie}`;
  }

  if (!raw.startsWith("/r") && !raw.startsWith("/")) {
    raw = `/r ${raw}`;
  }

  // Handle d20 mode combinations
  if (die === "d20") {
    const d20AdvMatch = raw.match(/(\d*)d20kh/i);
    const d20DisMatch = raw.match(/(\d*)d20kl/i);
    const d20NormMatch = raw.match(/(?:^|[^\w])(\d*)d20\b(?!k[hl])/i);

    if (mode === "adv") {
      if (d20AdvMatch) {
        const count = parseInt(d20AdvMatch[1], 10) || 1;
        return raw.replace(/(\d*)d20kh/i, `${count + 1}d20kh`);
      } else if (d20NormMatch || d20DisMatch) {
        return raw.replace(/(\d*)d20(?:k[hl])?/i, "2d20kh");
      }
    } else if (mode === "dis") {
      if (d20DisMatch) {
        const count = parseInt(d20DisMatch[1], 10) || 1;
        return raw.replace(/(\d*)d20kl/i, `${count + 1}d20kl`);
      } else if (d20NormMatch || d20AdvMatch) {
        return raw.replace(/(\d*)d20(?:k[hl])?/i, "2d20kl");
      }
    } else {
      if (d20NormMatch) {
        const count = parseInt(d20NormMatch[1], 10) || 1;
        return raw.replace(/(?:^|([^\w]))(\d*)d20\b/i, (m, p1) => `${p1 || ""}${count + 1}d20`);
      } else if (d20AdvMatch || d20DisMatch) {
        return raw.replace(/(\d*)d20(?:k[hl])?/i, "1d20");
      }
    }
  } else {
    // Standard die combination e.g. 1d4 -> 2d4
    const dieRegex = new RegExp(`(?:^|([^\\w]))(\\d*)${die}\\b`, "i");
    const match = raw.match(dieRegex);
    if (match) {
      const count = parseInt(match[2], 10) || 1;
      return raw.replace(dieRegex, (m, p1) => `${p1 || ""}${count + 1}${die}`);
    }
  }

  // Not in formula yet: insert before trailing modifier if any
  let dieStr = `1${die}`;
  if (die === "d20") {
    if (mode === "adv") dieStr = "2d20kh";
    else if (mode === "dis") dieStr = "2d20kl";
  }

  const trailingModRegex = /(?:([+-])\s*(\d+)|\b(\d+))\s*$/;
  const modMatch = raw.match(trailingModRegex);
  if (modMatch && !/[dD]\d+$/i.test(raw)) {
    const base = raw.slice(0, modMatch.index).trim();
    let modPart = raw.slice(modMatch.index).trim();
    if (!/^[+-]/.test(modPart)) {
      modPart = `+ ${modPart}`;
    }
    const prefix = (base && base !== "/r") ? `${base} + ${dieStr}` : `/r ${dieStr}`;
    return `${prefix} ${modPart}`;
  }

  if (/[\+\-\*\/]\s*$/.test(raw)) {
    return `${raw} ${dieStr}`;
  }

  return `${raw} + ${dieStr}`;
}

/**
 * Decrements or removes a die term from the chat text string.
 * e.g. 3d4 -> 2d4 -> 1d4 -> cleanly removed.
 * @param {string} currentText
 * @param {string} die - e.g. "d4", "d6", "d20"
 * @returns {string}
 */
export function removeDieFromChatText(currentText, die) {
  let raw = (currentText || "").trim();
  if (!raw) return "";

  function cleanRemoval(text) {
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^\/r\s*[\+\*\/]\s*/i, "/r ");
    cleaned = cleaned.replace(/\s*[\+\-\*\/]\s*$/, "");
    cleaned = cleaned.replace(/\s{2,}/g, " ");
    cleaned = cleaned.replace(/\+\s*\+/g, "+");
    cleaned = cleaned.trim();
    if (/^\/(r|roll|gmr|gmroll|b|blindroll|sr|selfroll)\s*$/i.test(cleaned)) {
      return "";
    }
    return cleaned;
  }

  if (die === "d20") {
    const advMatch = raw.match(/(\d+)d20kh/i);
    if (advMatch) {
      const count = parseInt(advMatch[1], 10);
      if (count > 2) return raw.replace(/(\d+)d20kh/i, `${count - 1}d20kh`);
      return cleanRemoval(raw.replace(/(?:\s*[\+\-\*\/]\s*)?\b\d*d20kh\b(?:\s*[\+\-\*\/]\s*)?/i, " "));
    }
    const disMatch = raw.match(/(\d+)d20kl/i);
    if (disMatch) {
      const count = parseInt(disMatch[1], 10);
      if (count > 2) return raw.replace(/(\d+)d20kl/i, `${count - 1}d20kl`);
      return cleanRemoval(raw.replace(/(?:\s*[\+\-\*\/]\s*)?\b\d*d20kl\b(?:\s*[\+\-\*\/]\s*)?/i, " "));
    }
    const normMatch = raw.match(/(?:^|[^\w])(\d*)d20\b/i);
    if (normMatch) {
      const count = parseInt(normMatch[1], 10) || 1;
      if (count > 1) {
        return raw.replace(/(?:^|([^\w]))(\d*)d20\b/i, (m, p1) => `${p1 || ""}${count - 1}d20`);
      }
      return cleanRemoval(raw.replace(/(?:\s*[\+\-\*\/]\s*)?\b(?:\d*)d20\b(?:\s*[\+\-\*\/]\s*)?/i, " "));
    }
  } else {
    const dieRegex = new RegExp(`(?:^|([^\\w]))(\\d*)${die}\\b`, "i");
    const match = raw.match(dieRegex);
    if (match) {
      const count = parseInt(match[2], 10) || 1;
      if (count > 1) {
        return raw.replace(dieRegex, (m, p1) => `${p1 || ""}${count - 1}${die}`);
      }
      return cleanRemoval(raw.replace(new RegExp(`(?:\\s*[\\+\\-\\*\\/]\\s*)?\\b(?:\\d*)${die}\\b(?:\\s*[\\+\\-\\*\\/]\\s*)?`, "i"), " "));
    }
  }

  return raw;
}

/**
 * Swaps d20 mode inside an existing chat text string.
 * @param {string} currentText
 * @param {"norm" | "adv" | "dis"} newMode
 * @returns {string}
 */
export function swapD20ModeInText(currentText, newMode) {
  const raw = (currentText || "").trim();
  if (!raw) return raw;

  const target = newMode === "adv" ? "2d20kh" : (newMode === "dis" ? "2d20kl" : "1d20");
  return raw.replace(/2d20kh|2d20kl|1d20/gi, target);
}

/**
 * Updates or adds/removes a trailing flat modifier inside a chat text formula.
 * @param {string} text
 * @param {number} mod
 * @returns {string}
 */
export function updateFlatModifierInChatText(text, mod) {
  let trimmed = (text || "").trim();
  if (!trimmed || trimmed === "/r") {
    return mod !== 0 ? `/r ${mod}` : "";
  }

  // Handle flavor suffix e.g. {{message}}
  const flavorMatch = trimmed.match(/\s*(\{\{[^}]*\}\})\s*$/);
  let flavorSuffix = "";
  if (flavorMatch) {
    flavorSuffix = ` ${flavorMatch[1]}`;
    trimmed = trimmed.slice(0, flavorMatch.index).trim();
  }

  // Handle inline roll wrapper e.g. [[ ... ]]
  const isInline = /^\[\[(.*)\]\]$/.test(trimmed);
  if (isInline) {
    trimmed = trimmed.replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
  }

  if (!trimmed.startsWith("/r") && !trimmed.startsWith("/") && !isInline) {
    trimmed = `/r ${trimmed}`;
  }

  // Matches trailing signed modifier (+ 5, - 2) or pure number (/r 5)
  // Ensuring it is not a die term (e.g. 1d20 or d100)
  const trailingModRegex = /(?:([+-])\s*(\d+)|\b(\d+))\s*$/;
  const match = trimmed.match(trailingModRegex);

  let result = "";
  if (match && !/[dD]\d+$/i.test(trimmed)) {
    const base = trimmed.slice(0, match.index).trim();
    if (mod === 0) {
      result = base === "/r" || !base ? "" : base;
    } else {
      const sign = mod > 0 ? "+" : "-";
      const absVal = Math.abs(mod);
      result = base === "/r" || !base ? (isInline ? `${mod}` : `/r ${mod}`) : `${base} ${sign} ${absVal}`;
    }
  } else {
    if (mod === 0) {
      result = trimmed;
    } else {
      const sign = mod > 0 ? "+" : "-";
      const absVal = Math.abs(mod);
      result = trimmed ? `${trimmed} ${sign} ${absVal}` : (isInline ? `${mod}` : `/r ${mod}`);
    }
  }

  if (isInline) {
    return result ? `[[${result}]]${flavorSuffix}` : flavorSuffix.trim();
  }
  return `${result}${flavorSuffix}`;
}

/**
 * Parses current counts, rollMode, and flat modifier from chat text formula.
 * @param {string} text
 * @returns {{ counts: Record<string, number>, rollMode: "norm"|"adv"|"dis", modifier: number }}
 */
export function parseFormulaStateFromChatText(text) {
  const counts = { d4: 0, d6: 0, d8: 0, d10: 0, d12: 0, d20: 0, d100: 0 };
  let rollMode = "norm";
  let modifier = 0;

  let cleanText = (text || "").trim();
  if (!cleanText) return { counts, rollMode, modifier };

  // Strip trailing flavor e.g. {{message}} and outer [[ ... ]]
  cleanText = cleanText.replace(/\{\{[^}]*\}\}\s*$/, "").replace(/^\[\[/, "").replace(/\]\]\s*$/, "").trim();
  if (!cleanText) return { counts, rollMode, modifier };

  // Detect mode
  if (/2d20kh/i.test(cleanText)) rollMode = "adv";
  else if (/2d20kl/i.test(cleanText)) rollMode = "dis";

  // Parse dice terms: e.g. (\d*)d(\d+)
  const dieRegex = /(\d*)d(\d+)/gi;
  let m;
  while ((m = dieRegex.exec(cleanText)) !== null) {
    const num = parseInt(m[1], 10) || 1;
    const die = `d${m[2]}`;
    if (die === "d20" && (rollMode === "adv" || rollMode === "dis")) {
      counts.d20 = (counts.d20 || 0) + (num >= 2 ? Math.floor(num / 2) : num);
    } else if (die in counts) {
      counts[die] = (counts[die] || 0) + num;
    }
  }

  // Parse trailing modifier
  const trailingModRegex = /(?:([+-])\s*(\d+)|\b(\d+))\s*$/;
  const modMatch = cleanText.trim().match(trailingModRegex);
  if (modMatch && !/[dD]\d+$/i.test(cleanText.trim())) {
    const sign = modMatch[1] === "-" ? -1 : 1;
    const val = parseInt(modMatch[2] || modMatch[3], 10) || 0;
    modifier = sign * val;
  }

  return { counts, rollMode, modifier };
}

let chatEditorView = null;

export function getChatEditorView() {
  return chatEditorView;
}

export function setChatEditorView(view) {
  chatEditorView = view;
}

/**
 * Resolves the chat input elements (the container and the actual editable element).
 * @returns {{ container: HTMLElement, editable: HTMLElement, isProseMirror: boolean } | null}
 */
export function getChatInputElement() {
  if (typeof document === "undefined") return null;

  // 1. ProseMirror Custom Element (Foundry v13+)
  const pm = document.querySelector("#chat-message, prose-mirror");
  if (pm) {
    const editable = pm.querySelector('[contenteditable="true"], .ProseMirror') || pm;
    return { container: pm, editable, isProseMirror: true };
  }

  // 2. Standard Textarea (Foundry v12 or legacy)
  const textarea = document.querySelector("#chat-form textarea, #chat textarea, textarea[name='content']");
  if (textarea) {
    return { container: textarea, editable: textarea, isProseMirror: false };
  }

  return null;
}

/**
 * Gets all relevant chat input elements in the DOM (for fallback and legacy detection).
 * @returns {HTMLElement[]}
 */
export function getAllChatTextareas() {
  const resolved = getChatInputElement();
  if (resolved) return [resolved.container];
  return [];
}

/**
 * Returns the current text value of the active/visible chat input.
 * Strips any HTML tags so operations always work with clean dice formulas.
 * @returns {string}
 */
export function getChatTextareaValue() {
  if (chatEditorView?.state?.doc) {
    return (chatEditorView.state.doc.textContent || "").trim();
  }

  const resolved = getChatInputElement();
  if (!resolved) return "";

  const { container, editable, isProseMirror } = resolved;
  let raw = "";

  if (isProseMirror) {
    // In Foundry v13, container.value returns serialized HTML e.g. "<p>/r 1d6</p>"
    raw = container.value || editable.innerText || editable.textContent || "";
  } else if ("value" in editable && typeof editable.value === "string") {
    raw = editable.value;
  } else {
    raw = editable.innerText || editable.textContent || "";
  }

  // Strip HTML tags and normalize
  return raw.replace(/<[^>]+>/g, "").trim();
}

/**
 * Writes text into the chat input cleanly and safely without corrupting ProseMirror DOM.
 * @param {string} newText
 */
export function writeToChatTextarea(newText) {
  // Strategy A: Native ProseMirror transaction if active view is captured
  if (chatEditorView && chatEditorView.state) {
    try {
      const parseString = foundry?.prosemirror?.dom?.parseString ?? globalThis.ProseMirror?.dom?.parseString;
      if (typeof parseString === "function") {
        const doc = parseString(newText, chatEditorView.state.schema);
        const tr = chatEditorView.state.tr.replaceWith(0, chatEditorView.state.doc.content.size, doc.content);
        chatEditorView.dispatch(tr);
        chatEditorView.focus();
        return;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | Error dispatching ProseMirror transaction:`, err);
    }
  }

  const resolved = getChatInputElement();
  if (!resolved) {
    console.warn(`${MODULE_ID} | Dice Tray: No chat input found.`);
    return;
  }

  const { container, editable, isProseMirror } = resolved;

  try {
    editable.focus();
  } catch {}

  // Strategy B: Contenteditable typing via document.execCommand
  if (isProseMirror || editable.isContentEditable || editable.getAttribute?.("contenteditable") === "true") {
    try {
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(editable);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch {}

    let executed = false;
    try {
      executed = document.execCommand("insertText", false, newText);
    } catch {
      executed = false;
    }

    if (!executed) {
      try {
        const inputEvt = new InputEvent("beforeinput", {
          inputType: "insertText",
          data: newText,
          bubbles: true,
          cancelable: true
        });
        editable.dispatchEvent(inputEvt);
      } catch {}
    }
    return;
  }

  // Strategy C: Standard HTML textarea (v12 / fallback)
  if ("value" in editable) {
    editable.value = newText;
    editable.dispatchEvent(new Event("input", { bubbles: true }));
    editable.dispatchEvent(new Event("change", { bubbles: true }));

    if (typeof $ !== "undefined") {
      try {
        $(editable).val(newText).trigger("input").trigger("change");
      } catch {}
    }
  }

  try {
    editable.focus();
    if ("selectionStart" in editable) {
      editable.selectionStart = editable.selectionEnd = editable.value.length;
    }
  } catch {}
}

let trayDiceCounts = { d4: 0, d6: 0, d8: 0, d10: 0, d12: 0, d20: 0, d100: 0 };

export function getTrayDiceCounts() {
  return trayDiceCounts;
}

export function resetTrayDiceCounts() {
  trayDiceCounts = { d4: 0, d6: 0, d8: 0, d10: 0, d12: 0, d20: 0, d100: 0 };
}

/**
 * Updates DOM elements inside the Dice Tray with current state values.
 */
export function updateTrayUI(skipModSync = false) {
  if (typeof document === "undefined") return;

  const tray = document.querySelector("#gp-dice-tray-copycat");
  if (!tray) return;

  // Update mode cycle button
  const modeBtn = tray.querySelector(".gp-dt-mode-cycle-btn");
  if (modeBtn) {
    const labels = { norm: "NORM", adv: "ADV", dis: "DIS" };
    modeBtn.textContent = labels[activeMode] || "NORM";
    modeBtn.classList.remove("mode-adv", "mode-dis");
    if (activeMode === "adv") modeBtn.classList.add("mode-adv");
    else if (activeMode === "dis") modeBtn.classList.add("mode-dis");
  }

  // Update modifier input
  const modInput = tray.querySelector(".gp-dt-mod-input");
  if (!skipModSync && modInput && document.activeElement !== modInput) {
    const current = getChatTextareaValue();
    const parsed = parseFormulaStateFromChatText(current);
    modInput.value = parsed.modifier !== 0 ? parsed.modifier : "";
  }

  // Update red circle badges on dice buttons (based strictly on tray's local counts)
  tray.querySelectorAll(".gp-dt-die-btn").forEach((btn) => {
    const die = btn.dataset.die;
    const count = trayDiceCounts[die] || 0;
    let badge = btn.querySelector(".gp-dt-badge");
    if (count > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "gp-dt-badge";
        btn.appendChild(badge);
      }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  });
}

/**
 * Injects styling rules for the dice tray using native Foundry styling.
 */
function injectTrayStyles() {
  if (typeof document === "undefined") return;
  const existing = document.getElementById("gp-dice-tray-styles");
  if (existing) existing.remove();

  const style = document.createElement("style");
  style.id = "gp-dice-tray-styles";
  style.textContent = `
    #chat.active,
    .chat-popout #chat {
      display: flex !important;
      flex-direction: column !important;
      height: 100% !important;
      overflow: hidden !important;
    }
    #sidebar:not(.collapsed) #chat:not(.active) {
      display: none !important;
    }
    #chat #chat-log {
      flex: 1 1 0 !important;
      min-height: 0 !important;
      overflow-y: auto !important;
    }
    #chat #chat-form {
      flex: 0 0 auto !important;
      margin: 0 !important;
    }
    #gp-dice-tray-copycat {
      display: flex !important;
      flex-direction: column !important;
      gap: 3px !important;
      padding: 4px 6px 6px 6px !important;
      margin: 0 !important;
      width: 100% !important;
      box-sizing: border-box !important;
      position: relative !important;
      z-index: 10 !important;
      pointer-events: auto !important;
      background: rgba(0, 0, 0, 0.25) !important;
      border-top: 1px solid var(--color-border-dark-tertiary, rgba(255, 255, 255, 0.15)) !important;
      user-select: none !important;
      flex: 0 0 auto !important;
    }
    .gp-dt-dice-grid {
      display: grid !important;
      grid-template-columns: repeat(7, 1fr) !important;
      gap: 3px !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .gp-dt-die-btn {
      position: relative !important;
      width: 100% !important;
      height: 26px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      font-size: 13px !important;
      background: rgba(0, 0, 0, 0.2) !important;
      border: 1px solid var(--color-border-dark-tertiary, rgba(255, 255, 255, 0.2)) !important;
      border-radius: 3px !important;
      color: var(--color-text-light-highlight, #f0f0e0) !important;
      cursor: pointer !important;
      text-align: center !important;
      transition: background 0.1s ease !important;
      box-sizing: border-box !important;
      pointer-events: auto !important;
      overflow: visible !important;
    }
    .gp-dt-die-btn:hover {
      background: rgba(255, 255, 255, 0.15) !important;
      color: #ffffff !important;
    }
    .gp-dt-die-btn * {
      pointer-events: none !important;
    }
    .gp-dt-badge {
      position: absolute !important;
      top: -4px !important;
      right: -4px !important;
      background: #e03e3e !important;
      color: #ffffff !important;
      font-size: 9px !important;
      font-weight: 800 !important;
      min-width: 14px !important;
      height: 14px !important;
      line-height: 14px !important;
      border-radius: 7px !important;
      padding: 0 2px !important;
      text-align: center !important;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4) !important;
      pointer-events: none !important;
      z-index: 2 !important;
    }
    .gp-dt-die-btn:hover {
      background: rgba(255, 255, 255, 0.15) !important;
      color: #ffffff !important;
    }
    .gp-dt-die-btn * {
      pointer-events: none !important;
    }
    .gp-dt-twin-d10 {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 1px !important;
      font-size: 10px !important;
      pointer-events: none !important;
    }
    .gp-dt-twin-d10 i {
      font-size: 10px !important;
    }
    .gp-dt-controls-row {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      width: 100% !important;
      gap: 3px !important;
      box-sizing: border-box !important;
    }
    .gp-dt-mode-cycle-btn {
      height: 22px !important;
      line-height: 20px !important;
      font-size: 10px !important;
      font-weight: 800 !important;
      padding: 0 8px !important;
      min-width: 48px !important;
      text-align: center !important;
      border-radius: 3px !important;
      cursor: pointer !important;
      background: rgba(0, 0, 0, 0.2) !important;
      border: 1px solid var(--color-border-dark-tertiary, rgba(255, 255, 255, 0.2)) !important;
      color: var(--color-text-light-highlight, #e0e0d0) !important;
      pointer-events: auto !important;
      transition: all 0.12s ease !important;
      box-sizing: border-box !important;
    }
    .gp-dt-mode-cycle-btn:hover {
      background: rgba(255, 255, 255, 0.15) !important;
      color: #ffffff !important;
    }
    .gp-dt-mode-cycle-btn.mode-adv {
      background: rgba(20, 110, 50, 0.8) !important;
      border-color: #2ecc71 !important;
      color: #ffffff !important;
      box-shadow: 0 0 4px rgba(46, 204, 113, 0.4) !important;
    }
    .gp-dt-mode-cycle-btn.mode-dis {
      background: rgba(160, 30, 30, 0.8) !important;
      border-color: #e74c3c !important;
      color: #ffffff !important;
      box-shadow: 0 0 4px rgba(231, 76, 60, 0.4) !important;
    }
    .gp-dt-mod-wrapper {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      height: 22px !important;
      max-height: 22px !important;
      min-height: 22px !important;
      line-height: 20px !important;
      padding: 0 4px !important;
      background: rgba(0, 0, 0, 0.2) !important;
      border: 1px solid var(--color-border-dark-tertiary, rgba(255, 255, 255, 0.2)) !important;
      border-radius: 3px !important;
      box-sizing: border-box !important;
      gap: 2px !important;
      overflow: hidden !important;
    }
    .gp-dt-mod-label {
      font-size: 11px !important;
      font-weight: 700 !important;
      color: var(--color-text-light-highlight, #ccc) !important;
      user-select: none !important;
      pointer-events: none !important;
    }
    .gp-dt-mod-input {
      width: 28px !important;
      height: 20px !important;
      max-height: 20px !important;
      min-height: 0 !important;
      line-height: 20px !important;
      background: transparent !important;
      border: none !important;
      color: var(--color-text-light-highlight, #f0f0e0) !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      text-align: center !important;
      padding: 0 !important;
      margin: 0 !important;
      outline: none !important;
      box-shadow: none !important;
      box-sizing: border-box !important;
      -moz-appearance: textfield !important;
    }
    .gp-dt-mod-input::-webkit-outer-spin-button,
    .gp-dt-mod-input::-webkit-inner-spin-button {
      -webkit-appearance: none !important;
      margin: 0 !important;
    }
    .gp-dt-clear-btn {
      height: 22px !important;
      width: 22px !important;
      min-width: 22px !important;
      line-height: 20px !important;
      font-size: 11px !important;
      padding: 0 !important;
      border-radius: 3px !important;
      cursor: pointer !important;
      background: rgba(0, 0, 0, 0.2) !important;
      border: 1px solid var(--color-border-dark-tertiary, rgba(255, 255, 255, 0.2)) !important;
      color: var(--color-text-light-highlight, #e0e0d0) !important;
      pointer-events: auto !important;
      transition: background 0.1s ease !important;
      box-sizing: border-box !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
    .gp-dt-clear-btn:hover {
      background: rgba(180, 40, 40, 0.7) !important;
      border-color: #e57373 !important;
      color: #ffffff !important;
    }
    .gp-dt-roll-btn {
      height: 22px !important;
      line-height: 20px !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      padding: 0 10px !important;
      flex: 1 !important;
      border-radius: 3px !important;
      cursor: pointer !important;
      background: rgba(45, 90, 145, 0.5) !important;
      border: 1px solid var(--color-border-dark-tertiary, rgba(255, 255, 255, 0.25)) !important;
      color: var(--color-text-light-highlight, #f0f0e8) !important;
      pointer-events: auto !important;
      transition: all 0.12s ease !important;
      box-sizing: border-box !important;
      text-align: center !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 4px !important;
    }
    .gp-dt-roll-btn:hover {
      background: rgba(55, 120, 195, 0.8) !important;
      border-color: #64b5f6 !important;
      color: #ffffff !important;
      box-shadow: 0 0 5px rgba(100, 181, 246, 0.4) !important;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Builds the Dice Tray DOM element using delegated event handling.
 * @returns {HTMLElement}
 */
export function buildDiceTrayElement() {
  const tray = document.createElement("div");
  tray.id = "gp-dice-tray-copycat";

  // Row 1: Dice buttons (grid of 7)
  const diceRow = document.createElement("div");
  diceRow.className = "gp-dt-dice-grid";

  for (const d of DICE_DEFS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gp-dt-die-btn";
    btn.dataset.die = d.id;
    btn.title = `${d.label} (Left-click: +1 | Right-click: -1)`;

    if (d.isCustomHtml) {
      btn.innerHTML = d.html;
    } else {
      btn.innerHTML = `<i class="${d.icon}"></i>`;
    }

    diceRow.appendChild(btn);
  }
  tray.appendChild(diceRow);

  // Row 2: Controls (Advantage Mode, Flat Mod, Clear & Roll)
  const controlsRow = document.createElement("div");
  controlsRow.className = "gp-dt-controls-row";

  // 1. Mode Toggle Button (NORM -> ADV -> DIS -> NORM)
  const modeBtn = document.createElement("button");
  modeBtn.type = "button";
  modeBtn.className = "gp-dt-mode-cycle-btn";
  modeBtn.textContent = "NORM";
  modeBtn.title = "Click to cycle: Normal ➔ Advantage ➔ Disadvantage";
  controlsRow.appendChild(modeBtn);

  // 2. Flat Modifier Control (± [input])
  const modWrapper = document.createElement("div");
  modWrapper.className = "gp-dt-mod-wrapper";
  modWrapper.title = "Flat Modifier (type or mouse-wheel scroll)";
  modWrapper.innerHTML = `
    <span class="gp-dt-mod-label">±</span>
    <input type="number" class="gp-dt-mod-input" placeholder="0" />
  `;
  const modInput = modWrapper.querySelector(".gp-dt-mod-input");
  modInput.addEventListener("input", (e) => {
    const val = parseInt(e.target.value, 10);
    const newMod = isNaN(val) ? 0 : val;
    const current = getChatTextareaValue();
    const updated = updateFlatModifierInChatText(current, newMod);
    writeToChatTextarea(updated);
    if (typeof Hooks !== "undefined") Hooks.callAll("gpDiceFormulaSync");
  });
  modInput.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1 : -1;
    const current = getChatTextareaValue();
    const parsed = parseFormulaStateFromChatText(current);
    const newMod = parsed.modifier + delta;
    const updated = updateFlatModifierInChatText(current, newMod);
    writeToChatTextarea(updated);
    modInput.value = newMod !== 0 ? newMod : "";
    if (typeof Hooks !== "undefined") Hooks.callAll("gpDiceFormulaSync");
  });
  modInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      rollBtn.click();
    }
  });
  controlsRow.appendChild(modWrapper);

  // 3. Square Clear button (icon only)
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "gp-dt-clear-btn";
  clearBtn.innerHTML = '<i class="fas fa-undo"></i>';
  clearBtn.title = "Clear Chat Box";
  controlsRow.appendChild(clearBtn);

  // 4. Roll button
  const rollBtn = document.createElement("button");
  rollBtn.type = "button";
  rollBtn.className = "gp-dt-roll-btn";
  rollBtn.innerHTML = '<i class="fas fa-dice-d20"></i> Roll';
  rollBtn.title = "Roll Formula (or press Enter)";
  controlsRow.appendChild(rollBtn);

  tray.appendChild(controlsRow);

  // ---------------------------------------------------------------------------
  // Event Delegation: Container-level handling guarantees all clicks work
  // ---------------------------------------------------------------------------
  tray.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    // 1. Die Click: Append to chat input
    if (btn.dataset.die) {
      const die = btn.dataset.die;
      trayDiceCounts[die] = (trayDiceCounts[die] || 0) + 1;
      const current = getChatTextareaValue();
      const updated = appendDieToChatText(current, die, activeMode);
      writeToChatTextarea(updated);
      updateTrayUI();
      return;
    }

    // 2. Mode Click: Cycle NORM -> ADV -> DIS
    if (btn.classList.contains("gp-dt-mode-cycle-btn")) {
      const newMode = cycleTrayMode();
      const current = getChatTextareaValue();
      if (current) {
        const swapped = swapD20ModeInText(current, newMode);
        writeToChatTextarea(swapped);
      }
      updateTrayUI();
      return;
    }

    // 5. Roll Click: Send formula into chat
    if (btn.classList.contains("gp-dt-roll-btn")) {
      const formula = getChatTextareaValue();
      if (!formula || !formula.trim()) return;

      resetTrayDiceCounts();
      writeToChatTextarea("");
      activeMode = "norm";
      const rolledModInput = tray.querySelector(".gp-dt-mod-input");
      if (rolledModInput) rolledModInput.value = "";
      updateTrayUI();

      if (typeof Hooks !== "undefined") {
        Hooks.callAll("gpDiceResetAll");
      }

      if (typeof ui !== "undefined" && ui.chat?.processMessage) {
        ui.chat.processMessage(formula).catch((err) => {
          console.error(`${MODULE_ID} | Error rolling formula from tray:`, err);
        });
      }
      return;
    }

    // 4. Clear Click: Empty chat box
    if (btn.classList.contains("gp-dt-clear-btn")) {
      resetTrayDiceCounts();
      writeToChatTextarea("");
      updateTrayUI();

      if (typeof Hooks !== "undefined") {
        Hooks.callAll("gpDiceResetAll");
      }
      return;
    }
  });

  tray.addEventListener("contextmenu", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    // Die Right-Click: Remove last occurrence of that die
    if (btn.dataset.die) {
      const die = btn.dataset.die;
      if ((trayDiceCounts[die] || 0) > 0) {
        trayDiceCounts[die] -= 1;
      }
      const current = getChatTextareaValue();
      const updated = removeDieFromChatText(current, die);
      writeToChatTextarea(updated);
      updateTrayUI();
    }
  });

  return tray;
}

/**
 * Mounts the Dice Tray statically below the chat form.
 * @param {Application} app
 * @param {JQuery|HTMLElement} html
 */
export function renderDiceTrayCopycat(app, html) {
  const root = html?.[0] ?? (html instanceof HTMLElement ? html : document.getElementById("chat"));
  if (!root) return;

  injectTrayStyles();

  // Deduplicate
  if (typeof document !== "undefined") {
    document.querySelectorAll("#gp-dice-tray-copycat").forEach((el) => el.remove());
    document.querySelectorAll(".gp-dice-tray-toggle-btn").forEach((el) => el.remove());
  }

  // Mount directly below #chat-form (as a direct child of #chat)
  const chatForm = root.querySelector("#chat-form") || document.querySelector("#chat-form");
  const tray = buildDiceTrayElement();

  if (chatForm && chatForm.parentNode) {
    if (chatForm.nextSibling) {
      chatForm.parentNode.insertBefore(tray, chatForm.nextSibling);
    } else {
      chatForm.parentNode.appendChild(tray);
    }
  } else {
    root.appendChild(tray);
  }

  updateTrayUI();
}

/**
 * Initializes the Dice Tray Copycat module.
 */
export function initDiceTrayCopycat() {
  // Capture ProseMirror EditorView on creation (Foundry v13+)
  Hooks.on("createProseMirrorEditor", (uuid, plugins, options) => {
    try {
      const PluginClass = foundry?.prosemirror?.Plugin ?? globalThis.ProseMirror?.Plugin;
      if (PluginClass) {
        plugins.gpDiceTray = new PluginClass({
          view(view) {
            if (view.dom?.closest("#chat-message, #chat, #chat-notifications, .chat-input")) {
              setChatEditorView(view);
            }
            return {
              destroy() {
                if (getChatEditorView() === view) setChatEditorView(null);
              }
            };
          }
        });
      }
    } catch {}
  });

  // Also listen for ProseMirror "plugins" event on custom elements
  if (typeof document !== "undefined") {
    document.addEventListener("plugins", (event) => {
      try {
        if (event.target?.closest?.("#chat-message, .chat-input") && event.plugins) {
          const PluginClass = foundry?.prosemirror?.Plugin ?? globalThis.ProseMirror?.Plugin;
          if (PluginClass) {
            event.plugins.gpDiceTray = new PluginClass({
              view(view) {
                setChatEditorView(view);
                return {
                  destroy() {
                    if (getChatEditorView() === view) setChatEditorView(null);
                  }
                };
              }
            });
          }
        }
      } catch {}
    }, { capture: true });
  }

  // When Enter is pressed in chat or message is processed, reset both badge sets
  Hooks.on("chatMessage", () => {
    Hooks.callAll("gpDiceResetAll");
  });

  // Reset tray badges and modifier when reset is triggered from flyout or chat
  Hooks.on("gpDiceResetAll", () => {
    resetTrayDiceCounts();
    const trayModInput = typeof document !== "undefined" ? document.querySelector("#gp-dice-tray-copycat .gp-dt-mod-input") : null;
    if (trayModInput) trayModInput.value = "";
    updateTrayUI(true);
  });

  Hooks.on("gpDiceFormulaSync", () => {
    updateTrayUI();
  });

  Hooks.on("renderChatLog", (app, html) => {
    try {
      renderDiceTrayCopycat(app, html);
    } catch (err) {
      console.error(`${MODULE_ID} | Error rendering Dice Tray Copycat:`, err);
    }
  });

  if (typeof game !== "undefined") {
    if (game.ready) {
      const chatEl = ui.chat?.element?.[0] ?? (ui.chat?.element instanceof HTMLElement ? ui.chat.element : document.getElementById("chat"));
      if (chatEl) renderDiceTrayCopycat(ui.chat, chatEl);
    } else {
      Hooks.once("ready", () => {
        const chatEl = ui.chat?.element?.[0] ?? (ui.chat?.element instanceof HTMLElement ? ui.chat.element : document.getElementById("chat"));
        if (chatEl) renderDiceTrayCopycat(ui.chat, chatEl);
      });
    }
  }
}
