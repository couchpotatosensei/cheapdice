// =============================================================================
// CHEAP DICE: D&D BEYOND GAME LOG LISTENER
// Bridges D&D Beyond campaign rolls into Foundry using Cheap Dice custom cards.
// =============================================================================

import { MODULE_ID, SETTINGS } from "../src/constants.js";

const DDB_WS_BASE_URL = "wss://game-log-api-live.dndbeyond.com/v1";

/**
 * Escapes HTML special characters to prevent markup injection.
 * @param {unknown} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Normalizes DDB rollType / rollKind strings into Cheap Dice categories.
 * @param {string} rawType
 * @returns {"attack" | "damage" | "save" | "check" | "initiative" | "spell" | "other"}
 */
export function normalizeDdbRollType(rawType) {
  const t = String(rawType || "").toLowerCase().trim();
  if (t === "to hit" || t === "attack") return "attack";
  if (t === "damage" || t === "heal" || t === "healing") return "damage";
  if (t === "save" || t === "saving throw") return "save";
  if (t === "check" || t === "skill" || t === "ability") return "check";
  if (t === "initiative") return "initiative";
  if (t === "spell") return "spell";
  return "other";
}

/**
 * Normalizes DDB rollKind strings into Cheap Dice roll modes.
 * @param {string} rawKind
 * @returns {"normal" | "advantage" | "disadvantage"}
 */
export function normalizeDdbRollMode(rawKind) {
  const k = String(rawKind || "").toLowerCase().trim();
  if (k === "advantage") return "advantage";
  if (k === "disadvantage") return "disadvantage";
  return "normal";
}

/**
 * Pure parser: converts a raw D&D Beyond Game Log WebSocket message into
 * an array of normalized Cheap Dice roll objects.
 *
 * @param {object|string} rawEvent
 * @returns {Array<object>}
 */
export function parseDdbGameLogEvent(rawEvent) {
  let evt = rawEvent;
  if (typeof evt === "string") {
    try {
      evt = JSON.parse(evt);
    } catch {
      return [];
    }
  }
  if (!evt || typeof evt !== "object") return [];

  // DDB wraps live messages under eventType === "dice/roll/fulfilled" (or similar)
  const eventType = String(evt.eventType || evt.type || "").toLowerCase();
  if (eventType && !eventType.includes("dice/roll") && !eventType.includes("roll/fulfilled")) {
    return [];
  }

  const data = evt.data || evt;
  const rolls = Array.isArray(data.rolls) ? data.rolls : [];
  if (rolls.length === 0) return [];

  const characterName = evt.context?.name || data.context?.name || data.characterName || "D&D Beyond Character";
  const ddbCharacterId = String(evt.entityId || data.entityId || "");
  const actionName = data.action || evt.context?.action || "Roll";
  const messageId = evt.id || evt.messageId || `${ddbCharacterId}-${Date.now()}`;

  return rolls.map((r, index) => {
    const rollType = normalizeDdbRollType(r.rollType);
    const rollMode = normalizeDdbRollMode(r.rollKind);
    const sets = Array.isArray(r.diceNotation?.set) ? r.diceNotation.set : [];
    const constant = Number(r.result?.constant ?? r.diceNotation?.constant ?? 0) || 0;

    const allDice = [];
    const d20Values = [];
    const formulaParts = [];

    for (const s of sets) {
      const dieType = String(s.dieType || "d20").toLowerCase();
      const count = Number(s.count || (Array.isArray(s.dice) ? s.dice.length : 1)) || 1;
      formulaParts.push(`${count}${dieType}`);

      const diceList = Array.isArray(s.dice) ? s.dice : [];
      for (const d of diceList) {
        const val = Number(d.dieValue ?? d.value ?? 0);
        allDice.push({
          dieType: String(d.dieType || dieType).toLowerCase(),
          dieValue: val
        });
        if (String(d.dieType || dieType).toLowerCase() === "d20") {
          d20Values.push(val);
        }
      }
    }

    const keptValues = Array.isArray(r.result?.values) ? r.result.values.map(Number) : [];
    const keptD20 = d20Values.length > 0
      ? (keptValues.length > 0 ? keptValues[0] : (rollMode === "disadvantage" ? Math.min(...d20Values) : Math.max(...d20Values)))
      : null;

    // Mark dropped dice for advantage/disadvantage display
    let keptUsed = false;
    const annotatedDice = allDice.map((d) => {
      if (d.dieType === "d20" && d20Values.length > 1 && keptD20 !== null) {
        if (!keptUsed && d.dieValue === keptD20) {
          keptUsed = true;
          return { ...d, dropped: false };
        }
        return { ...d, dropped: true };
      }
      return { ...d, dropped: false };
    });

    const isCrit = rollType === "attack" && keptD20 === 20;
    const isFumble = rollType === "attack" && keptD20 === 1;

    let total = Number(r.result?.total);
    if (!Number.isFinite(total)) {
      const diceSum = annotatedDice
        .filter((d) => !d.dropped)
        .reduce((sum, d) => sum + d.dieValue, 0);
      total = diceSum + constant;
    }

    const modStr = constant > 0 ? ` + ${constant}` : constant < 0 ? ` - ${Math.abs(constant)}` : "";
    const formula = `${formulaParts.join(" + ") || "1d20"}${modStr}`;

    return {
      id: `${messageId}-${index}`,
      messageId,
      characterName,
      ddbCharacterId,
      actionName,
      rollType,
      rollMode,
      dice: annotatedDice,
      d20Values,
      keptD20,
      isCrit,
      isFumble,
      modifier: constant,
      total,
      formula,
      resultText: r.result?.text || `${total}`,
      damageType: r.damageType || ""
    };
  });
}

/**
 * Matches a D&D Beyond character name / ID to a Foundry Actor.
 * @param {string} characterName
 * @param {string} ddbCharacterId
 * @param {Iterable<object>} [actorsCollection]
 * @returns {object|null}
 */
export function matchDdbActor(characterName, ddbCharacterId, actorsCollection = null) {
  const actors = actorsCollection ?? (typeof game !== "undefined" ? game.actors : null);
  if (!actors) return null;

  const list = Array.from(actors);
  if (list.length === 0) return null;

  const cleanId = String(ddbCharacterId || "").trim();
  if (cleanId) {
    const byFlag = list.find((a) => {
      const flagId = a?.flags?.ddbimporter?.dndbeyond?.characterId
        ?? a?.flags?.[MODULE_ID]?.ddbCharacterId;
      return flagId && String(flagId) === cleanId;
    });
    if (byFlag) return byFlag;
  }

  const cleanName = String(characterName || "").trim().toLowerCase();
  if (!cleanName) return null;

  return list.find((a) => String(a?.name || "").trim().toLowerCase() === cleanName) || null;
}

/**
 * Builds the Cheap Dice custom chat card HTML + Audit breakdown for a parsed DDB roll.
 *
 * @param {object} parsedRoll
 * @param {object|null} actor
 * @param {object} [options]
 * @returns {string}
 */
export function buildDdbCustomChatCardHtml(parsedRoll, actor = null, options = {}) {
  const actorName = escapeHtml(actor?.name || parsedRoll.characterName);
  const actionName = escapeHtml(parsedRoll.actionName);
  const rollTypeLabel = parsedRoll.rollType.toUpperCase();

  const tags = [
    `<span style="background: #2b3a4a; color: #fff; font-size: 0.72em; font-weight: 700; padding: 1px 6px; border-radius: 3px;">DDB</span>`,
    `<span style="background: #4b5d88; color: #fff; font-size: 0.72em; font-weight: 700; padding: 1px 6px; border-radius: 3px;">${rollTypeLabel}</span>`
  ];

  if (parsedRoll.rollMode === "advantage") {
    tags.push(`<span style="background: #1b5e20; color: #fff; font-size: 0.72em; font-weight: 700; padding: 1px 6px; border-radius: 3px;">ADVANTAGE</span>`);
  } else if (parsedRoll.rollMode === "disadvantage") {
    tags.push(`<span style="background: #b71c1c; color: #fff; font-size: 0.72em; font-weight: 700; padding: 1px 6px; border-radius: 3px;">DISADVANTAGE</span>`);
  }

  if (parsedRoll.isCrit) {
    tags.push(`<span style="background: #15803d; color: #fff; font-size: 0.72em; font-weight: 800; padding: 1px 6px; border-radius: 3px;">CRITICAL HIT!</span>`);
  } else if (parsedRoll.isFumble) {
    tags.push(`<span style="background: #991b1b; color: #fff; font-size: 0.72em; font-weight: 800; padding: 1px 6px; border-radius: 3px;">CRITICAL MISS</span>`);
  }

  const diceBadgesHtml = parsedRoll.dice.map((d) => {
    const isNat20 = d.dieType === "d20" && d.dieValue === 20 && !d.dropped;
    const isNat1 = d.dieType === "d20" && d.dieValue === 1 && !d.dropped;
    let bg = "#f1f5f9";
    let border = "#cbd5e1";
    let color = "#1e293b";
    let extraStyle = "";

    if (d.dropped) {
      bg = "#f8fafc";
      color = "#94a3b8";
      extraStyle = "text-decoration: line-through; opacity: 0.65;";
    } else if (isNat20) {
      bg = "#dcfce7";
      border = "#16a34a";
      color = "#15803d";
    } else if (isNat1) {
      bg = "#fee2e2";
      border = "#dc2626";
      color = "#b91c1c";
    }

    return `<span style="display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 4px; background: ${bg}; border: 1px solid ${border}; color: ${color}; font-size: 0.85em; font-weight: 700; ${extraStyle}">${escapeHtml(d.dieType)}: ${d.dieValue}</span>`;
  }).join(" ");

  const totalBorderColor = parsedRoll.isCrit
    ? "#16a34a"
    : parsedRoll.isFumble
      ? "#dc2626"
      : "#343a40";

  const totalBgColor = parsedRoll.isCrit
    ? "rgba(22, 163, 74, 0.1)"
    : parsedRoll.isFumble
      ? "rgba(220, 38, 38, 0.1)"
      : "rgba(52, 58, 64, 0.06)";

  // Quick Damage button when an attack matches an actor item
  let actionButtonsHtml = "";
  if (parsedRoll.rollType === "attack" && actor && options.matchingItem) {
    const itemId = escapeHtml(options.matchingItem.id);
    const actorId = escapeHtml(actor.id);
    const critAttr = parsedRoll.isCrit ? "true" : "false";
    actionButtonsHtml = `
      <div style="display: flex; gap: 6px; margin-top: 6px;">
        <button type="button" class="cheapdice-ddb-roll-damage" data-actor-id="${actorId}" data-item-id="${itemId}" data-is-crit="${critAttr}"
          style="flex: 1; height: 26px; font-size: 0.82em; font-weight: 700; border-radius: 4px; border: 1px solid #991b1b; background: ${parsedRoll.isCrit ? "#15803d" : "#b91c1c"}; color: #fff; cursor: pointer;">
          <i class="fas fa-burst"></i> ${parsedRoll.isCrit ? "Roll Crit Damage" : "Roll Damage"}
        </button>
      </div>`;
  }

  const modDisplay = parsedRoll.modifier > 0
    ? `+${parsedRoll.modifier}`
    : parsedRoll.modifier < 0
      ? `${parsedRoll.modifier}`
      : "0";

  return `
    <div class="cheapdice-ddb-card" style="font-family: inherit; color: #1e293b;">
      <p style="margin: 0 0 4px 0;"><strong>${actorName}: ${actionName}</strong></p>
      <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 5px;">
        ${tags.join("")}
      </div>
      <hr style="margin: 4px 0;">
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-radius: 5px; border: 1px solid ${totalBorderColor}; background: ${totalBgColor}; margin: 4px 0;">
        <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
          ${diceBadgesHtml || `<span style="font-size: 0.85em; color: #64748b;">${escapeHtml(parsedRoll.formula)}</span>`}
          ${parsedRoll.modifier !== 0 ? `<span style="font-size: 0.85em; font-weight: 700; color: #475569;">(${modDisplay})</span>` : ""}
        </div>
        <div style="font-size: 1.45em; font-weight: 900; color: ${totalBorderColor}; min-width: 34px; text-align: right;">
          ${parsedRoll.total}
        </div>
      </div>
      ${actionButtonsHtml}
      <details style="margin-top: 6px; padding: 2px 4px;">
        <summary style="font-weight: 600; font-size: 0.82em; color: #64748b; cursor: pointer;">Formula Breakdown &amp; Audit</summary>
        <div style="padding-top: 4px; border-top: 1px solid #e2e8f0; font-size: 0.8em; color: #475569; margin-top: 3px; line-height: 1.45;">
          <div><strong>Source:</strong> D&amp;D Beyond Game Log</div>
          <div><strong>Formula:</strong> ${escapeHtml(parsedRoll.formula)}</div>
          <div><strong>Modifier:</strong> ${modDisplay}</div>
          <div><strong>Raw Result:</strong> ${escapeHtml(parsedRoll.resultText)} = <strong>${parsedRoll.total}</strong></div>
        </div>
      </details>
    </div>
  `;
}

/**
 * Manages the live WebSocket connection to D&D Beyond's Game Log.
 */
export class DdbGameLogClient {
  constructor(options = {}) {
    this.ws = null;
    this.seenMessageIds = new Set();
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectDelayMs = 30000;
    this.onRollCallback = options.onRoll || null;
  }

  /**
   * Builds the WebSocket URL from campaign configuration.
   * @param {object} config
   * @returns {string|null}
   */
  buildSocketUrl(config) {
    const campaignId = String(config?.campaignId || "").trim();
    const token = String(config?.token || "").trim();
    const userId = String(config?.userId || "").trim();
    if (!campaignId || !token) return null;

    const params = new URLSearchParams({
      gameId: campaignId,
      stt: token
    });
    if (userId) params.set("userId", userId);
    return `${DDB_WS_BASE_URL}?${params.toString()}`;
  }

  /**
   * Resolves a short-term token via optional proxy URL if configured,
   * otherwise returns the raw token directly.
   */
  async resolveToken(rawToken, proxyUrl) {
    const cleanToken = String(rawToken || "").trim();
    const cleanProxy = String(proxyUrl || "").trim();
    if (!cleanToken) return "";
    if (!cleanProxy) return cleanToken;

    try {
      const response = await fetch(cleanProxy, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cobaltSession: cleanToken })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      return json.token || json.stt || cleanToken;
    } catch (err) {
      console.warn(`[${MODULE_ID}] DDB Auth Proxy failed, using raw token:`, err);
      return cleanToken;
    }
  }

  async connect(config) {
    this.disconnect();

    const token = await this.resolveToken(config?.token, config?.proxyUrl);
    const url = this.buildSocketUrl({
      campaignId: config?.campaignId,
      userId: config?.userId,
      token
    });
    if (!url) return false;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        console.log(`[${MODULE_ID}] Connected to D&D Beyond Game Log (Campaign ${config.campaignId}).`);
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        this.handleRawMessage(event.data);
      };

      this.ws.onerror = (err) => {
        console.warn(`[${MODULE_ID}] DDB Game Log WebSocket error:`, err);
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.scheduleReconnect(config);
      };

      return true;
    } catch (err) {
      console.error(`[${MODULE_ID}] Failed to open DDB Game Log WebSocket:`, err);
      return false;
    }
  }

  handleRawMessage(rawData) {
    const parsedRolls = parseDdbGameLogEvent(rawData);
    for (const roll of parsedRolls) {
      if (this.seenMessageIds.has(roll.id)) continue;
      this.seenMessageIds.add(roll.id);
      if (this.seenMessageIds.size > 500) {
        const first = this.seenMessageIds.values().next().value;
        this.seenMessageIds.delete(first);
      }
      if (typeof this.onRollCallback === "function") {
        this.onRollCallback(roll);
      }
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: "ping" }));
      }
    }, 45000);
  }

  stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  scheduleReconnect(config) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelayMs);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.connect(config);
    }, delay);
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}

/**
 * Posts a normalized DDB roll to Foundry Chat using Cheap Dice styling.
 * @param {object} parsedRoll
 */
export async function postDdbRollToFoundry(parsedRoll) {
  const actor = matchDdbActor(parsedRoll.characterName, parsedRoll.ddbCharacterId);
  const matchingItem = actor?.items?.find(
    (i) => String(i.name || "").trim().toLowerCase() === String(parsedRoll.actionName || "").trim().toLowerCase()
  ) || null;

  const content = buildDdbCustomChatCardHtml(parsedRoll, actor, { matchingItem });
  const speaker = actor
    ? ChatMessage.getSpeaker({ actor })
    : { alias: parsedRoll.characterName };

  await ChatMessage.create({
    user: game.user.id,
    speaker,
    content,
    sound: CONFIG.sounds?.dice
  });

  // Optional auto-damage roll when enabled
  const autoDamage = game.settings.get(MODULE_ID, SETTINGS.DDB_AUTO_DAMAGE);
  if (autoDamage && parsedRoll.rollType === "attack" && matchingItem && typeof matchingItem.rollDamage === "function") {
    await matchingItem.rollDamage({ critical: parsedRoll.isCrit });
  }
}

let activeClient = null;

/**
 * Initializes the DDB Game Log listener on GM login and exposes testing helpers.
 */
export function initDdbListener() {
  activeClient = new DdbGameLogClient({
    onRoll: (parsedRoll) => {
      postDdbRollToFoundry(parsedRoll).catch((err) => {
        console.error(`[${MODULE_ID}] Failed to post DDB roll:`, err);
      });
    }
  });

  // Expose API on window.CustomRolls.ddb for testing & diagnostics
  window.CustomRolls = window.CustomRolls || {};
  window.CustomRolls.ddb = {
    connect: () => {
      if (!game.user?.isGM) return false;
      return activeClient.connect({
        campaignId: game.settings.get(MODULE_ID, SETTINGS.DDB_CAMPAIGN_ID),
        userId: game.settings.get(MODULE_ID, SETTINGS.DDB_USER_ID),
        token: game.settings.get(MODULE_ID, SETTINGS.DDB_COBALT_TOKEN),
        proxyUrl: game.settings.get(MODULE_ID, SETTINGS.DDB_PROXY_URL)
      });
    },
    disconnect: () => activeClient.disconnect(),
    ingestEvent: (rawEvent) => activeClient.handleRawMessage(rawEvent),
    simulateRoll: (actionName = "Longsword", rollType = "to hit", rollKind = "advantage") => {
      const sampleActor = canvas?.tokens?.controlled?.[0]?.actor || game.actors?.contents?.[0];
      const d1 = Math.floor(Math.random() * 20) + 1;
      const d2 = Math.floor(Math.random() * 20) + 1;
      const kept = rollKind === "disadvantage" ? Math.min(d1, d2) : Math.max(d1, d2);
      const mod = 7;
      const mockEvent = {
        id: `sim-${Date.now()}`,
        eventType: "dice/roll/fulfilled",
        entityId: "sim-char-1",
        context: { name: sampleActor?.name || "Test Hero" },
        data: {
          action: actionName,
          rolls: [
            {
              rollType,
              rollKind,
              diceNotation: {
                set: [{
                  count: rollKind === "normal" ? 1 : 2,
                  dieType: "d20",
                  dice: rollKind === "normal"
                    ? [{ dieType: "d20", dieValue: d1 }]
                    : [{ dieType: "d20", dieValue: d1 }, { dieType: "d20", dieValue: d2 }]
                }],
                constant: mod
              },
              result: {
                constant: mod,
                values: [rollKind === "normal" ? d1 : kept],
                total: (rollKind === "normal" ? d1 : kept) + mod,
                text: `${rollKind === "normal" ? d1 : kept} + ${mod}`
              }
            }
          ]
        }
      };
      activeClient.handleRawMessage(mockEvent);
      return mockEvent;
    }
  };

  // Delegated click handler for interactive Damage button on DDB cards
  Hooks.on("renderChatLog", (app, html) => {
    const root = html?.[0] ?? html;
    if (!root || root._gpDdbDamageBound) return;
    root._gpDdbDamageBound = true;

    root.addEventListener("click", async (e) => {
      const btn = e.target?.closest?.(".cheapdice-ddb-roll-damage");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      const actorId = btn.dataset.actorId;
      const itemId = btn.dataset.itemId;
      const isCrit = btn.dataset.isCrit === "true";

      const actor = game.actors?.get(actorId);
      const item = actor?.items?.get(itemId);
      if (!item) {
        ui.notifications?.warn?.("Matching Foundry item not found on actor.");
        return;
      }

      if (typeof item.rollDamage === "function") {
        await item.rollDamage({ critical: isCrit });
      } else if (typeof item.use === "function") {
        await item.use();
      }
    });
  });

  Hooks.once("ready", () => {
    if (!game.user?.isGM) return;
    const campaignId = game.settings.get(MODULE_ID, SETTINGS.DDB_CAMPAIGN_ID);
    const token = game.settings.get(MODULE_ID, SETTINGS.DDB_COBALT_TOKEN);
    if (campaignId && token) {
      window.CustomRolls.ddb.connect();
    }
  });
}
