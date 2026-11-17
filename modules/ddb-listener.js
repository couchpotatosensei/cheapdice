// =============================================================================
// CHEAP DICE: D&D BEYOND GAME LOG LISTENER
// Bridges D&D Beyond campaign rolls into Foundry using Cheap Dice custom cards.
// =============================================================================

import { MODULE_ID, SETTINGS } from "../src/constants.js";
import { getCardDispositionWrapper } from "./socket-handlers.js";

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
  const rawId = data.id || data.rollId || evt.id || evt.messageId || `${ddbCharacterId}_${actionName}_${rolls[0]?.result?.total ?? ""}`;

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
      id: `${rawId}-${index}`,
      messageId: rawId,
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
/**
 * Safely extracts a damage formula from an actor item (modern dnd5e or legacy).
 * @param {object|null} item
 * @returns {string}
 */
export function getItemDamageFormula(item) {
  if (!item?.system) return "";
  // Check modern dnd5e activities
  const activities = item.system.activities;
  if (activities && typeof activities.values === "function") {
    for (const act of activities.values()) {
      if (Array.isArray(act.damage?.parts) && act.damage.parts.length > 0) {
        const parts = act.damage.parts.map((p) => p.formula || p[0] || "").filter(Boolean);
        if (parts.length > 0) return parts.join(" + ");
      }
    }
  }
  // Check classic dnd5e damage.parts
  const parts = item.system.damage?.parts;
  if (Array.isArray(parts) && parts.length > 0) {
    const fList = parts.map((p) => (Array.isArray(p) ? p[0] : (p.formula || String(p)))).filter(Boolean);
    if (fList.length > 0) return fList.join(" + ");
  }
  if (item.system.damage?.base?.formula) {
    return item.system.damage.base.formula;
  }
  return "";
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

  // Tags
  const tags = [];
  if (parsedRoll.rollType === "attack") {
    tags.push('<span style="background: rgba(114, 137, 218, 0.15); border: 1px solid rgba(114, 137, 218, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #4b5d88;">Attack Roll</span>');
  } else if (parsedRoll.rollType === "skill") {
    tags.push('<span style="background: rgba(114, 137, 218, 0.15); border: 1px solid rgba(114, 137, 218, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #4b5d88;">Skill Check</span>');
  } else if (parsedRoll.rollType === "check") {
    tags.push('<span style="background: rgba(40, 167, 69, 0.15); border: 1px solid rgba(40, 167, 69, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #28a745;">Ability Check</span>');
  } else if (parsedRoll.rollType === "save") {
    tags.push('<span style="background: rgba(220, 53, 69, 0.15); border: 1px solid rgba(220, 53, 69, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #dc3545;">Saving Throw</span>');
  } else if (parsedRoll.rollType === "damage") {
    tags.push('<span style="background: rgba(220, 53, 69, 0.15); border: 1px solid rgba(220, 53, 69, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #dc3545;">Damage</span>');
  } else if (parsedRoll.rollType === "initiative") {
    tags.push('<span style="background: rgba(43, 116, 137, 0.15); border: 1px solid rgba(43, 116, 137, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #235d6e;">Initiative</span>');
  }

  if (parsedRoll.rollMode === "advantage") {
    tags.push('<span style="background: rgba(40, 167, 69, 0.15); border: 1px solid rgba(40, 167, 69, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #28a745;">Advantage</span>');
  } else if (parsedRoll.rollMode === "disadvantage") {
    tags.push('<span style="background: rgba(220, 53, 69, 0.15); border: 1px solid rgba(220, 53, 69, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #dc3545;">Disadvantage</span>');
  }

  if (parsedRoll.isCrit) {
    tags.push('<span style="background: rgba(40, 167, 69, 0.2); border: 1px solid rgba(40, 167, 69, 0.5); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 700; color: #1e7e34;">Critical Hit!</span>');
  } else if (parsedRoll.isFumble) {
    tags.push('<span style="background: rgba(220, 53, 69, 0.2); border: 1px solid rgba(220, 53, 69, 0.5); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 700; color: #dc3545;">Critical Miss</span>');
  }

  tags.push('<span style="background: rgba(108, 117, 125, 0.15); border: 1px solid rgba(108, 117, 125, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #495057;">D&amp;D Beyond</span>');

  const tagsBlock = tags.length > 0
    ? `<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px;">${tags.join("")}</div>`
    : "";

  // Dual D20 rolls (Roll 1 from DDB, Roll 2 companion roll or second DDB die)
  const d20_1 = parsedRoll.keptD20 ?? parsedRoll.d20Values?.[0] ?? parsedRoll.total;
  const d20_2 = options.d20_2 ?? parsedRoll.d20Values?.[1] ?? (parsedRoll.rollMode === "advantage" ? 18 : 12);
  const total1 = Number(parsedRoll.total);
  const total2 = Number(options.total2 ?? (d20_2 + parsedRoll.modifier));

  const critClass1 = d20_1 === 20 ? " critical" : d20_1 === 1 ? " fumble" : "";
  const critClass2 = d20_2 === 20 ? " critical" : d20_2 === 1 ? " fumble" : "";

  const rollBox1 = `
    <div class="dice-roll">
      <div class="dice-result">
        <h4 class="dice-formula" style="display: none;">${escapeHtml(parsedRoll.formula)}</h4>
        <div class="dice-tooltip"></div>
        <h4 class="dice-total${critClass1}">${total1}</h4>
      </div>
    </div>
  `;

  const rollBox2 = `
    <div class="dice-roll">
      <div class="dice-result">
        <h4 class="dice-formula" style="display: none;">${escapeHtml(parsedRoll.formula)}</h4>
        <div class="dice-tooltip"></div>
        <h4 class="dice-total${critClass2}">${total2}</h4>
      </div>
    </div>
  `;

  const modDisplay = parsedRoll.modifier > 0
    ? `+ ${parsedRoll.modifier}`
    : parsedRoll.modifier < 0
      ? `- ${Math.abs(parsedRoll.modifier)}`
      : "0";

  // Damage block (auto-rolled or interactive button)
  let damageSectionHtml = "";
  if (options.damage) {
    const dmg = options.damage;
    const dmgCritClass = dmg.isCrit ? " critical" : "";
    damageSectionHtml = `
      <p style="text-align: center; font-weight: bold; margin: 5px 0;">Normal Damage: ${escapeHtml(dmg.formula)}</p>
      <div class="dice-roll">
        <div class="dice-result">
          <h4 class="dice-formula" style="display: none;">${escapeHtml(dmg.formula)}</h4>
          <div class="dice-tooltip"></div>
          <h4 class="dice-total${dmgCritClass}">${dmg.total}</h4>
        </div>
      </div>
    `;
  } else if (parsedRoll.rollType === "attack" && actor && options.matchingItem) {
    const itemId = escapeHtml(options.matchingItem.id);
    const actorId = escapeHtml(actor.id);
    const critAttr = parsedRoll.isCrit ? "true" : "false";
    damageSectionHtml = `
      <div style="display: flex; gap: 6px; margin: 6px 0;">
        <button type="button" class="cheapdice-ddb-roll-damage" data-actor-id="${actorId}" data-item-id="${itemId}" data-is-crit="${critAttr}"
          style="flex: 1; height: 28px; line-height: 26px; font-size: 0.82em; font-weight: 700; border-radius: 4px; border: 1px solid #7289da; background: #fff; color: #4b5d88; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px;">
          <i class="fas fa-burst" style="color: #7289da;"></i> ${parsedRoll.isCrit ? "Roll Crit Damage" : "Roll Damage"}
        </button>
      </div>`;
  }

  // Collapsible Modifier Breakdown
  const breakdownHtml = `
    <details style="margin-top: 6px; padding: 2px 4px;">
      <summary style="font-weight: 600; font-size: 0.82em; color: #666; cursor: pointer;">Modifier Breakdown</summary>
      <div style="padding-top: 4px; border-top: 1px solid #e0e0e0; font-size: 0.8em; color: #555; margin-top: 3px; line-height: 1.45;">
        <div><strong>Source:</strong> D&amp;D Beyond Game Log</div>
        <div><strong>Base Formula:</strong> <code>${escapeHtml(parsedRoll.formula)}</code></div>
        <div><strong>Modifier:</strong> ${modDisplay}</div>
        <div><strong>Raw Result:</strong> ${escapeHtml(parsedRoll.resultText)} = <strong>${parsedRoll.total}</strong></div>
      </div>
    </details>
  `;

  let innerCardHtml = "";

  if (parsedRoll.rollType === "attack") {
    // Attack Card Layout (Matches Cheap Dice runAttackRoll)
    innerCardHtml = `
      <p style="margin: 0 0 4px 0;"><strong>${actorName}: ${actionName}</strong></p>
      ${tagsBlock}
      <hr style="margin: 4px 0;">
      <div style="display: flex; justify-content: space-around; align-items: flex-start; gap: 10px;">
        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column;">
          <p style="margin: 0; text-align: center; font-size: 0.85em; color: #555;">Attack Roll</p>
          ${rollBox1}
        </div>
        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column;">
          <p style="margin: 0; text-align: center; font-size: 0.85em; color: #555;">+/- Adv.</p>
          ${rollBox2}
        </div>
      </div>
      <hr style="margin: 5px 0 5px; border-top: 2px solid #343a40;">
      ${damageSectionHtml}
      ${breakdownHtml}
    `;
  } else {
    // D20 Test Card Layout (Matches Cheap Dice runD20TestRoll)
    innerCardHtml = `
      <div style="font-family: inherit; color: #333;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #343a40; padding-bottom: 3px; margin-bottom: 6px;">
          <span style="font-size: 1.05em; font-weight: bold; color: #2b3a4a;">${actionName}</span>
          <span style="font-size: 0.8em; color: #777;">${actorName}</span>
        </div>
        ${tagsBlock}
        <div style="display: flex; justify-content: space-around; gap: 8px; margin-bottom: 6px;">
          <div style="flex: 1; text-align: center;">
            <div style="font-size: 0.75em; font-weight: 600; color: #777; margin-bottom: 2px;">NORMAL ROLL</div>
            <div style="transform: scale(0.96); margin: -2px 0;">${rollBox1}</div>
          </div>
          <div style="flex: 1; text-align: center;">
            <div style="font-size: 0.75em; font-weight: 600; color: #777; margin-bottom: 2px;">+/- ADV.</div>
            <div style="transform: scale(0.96); margin: -2px 0;">${rollBox2}</div>
          </div>
        </div>
        ${breakdownHtml}
      </div>
    `;
  }

  if (typeof getCardDispositionWrapper === "function") {
    return getCardDispositionWrapper(actor, options.token, options.userId, innerCardHtml);
  }
  return innerCardHtml;
}

/**
 * Manages the live WebSocket connection to D&D Beyond's Game Log.
 */
export class DdbGameLogClient {
  constructor(options = {}) {
    this.ws = null;
    this.seenMessageIds = new Map();
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
    const now = Date.now();
    for (const roll of parsedRolls) {
      const footprint = `${roll.characterName}_${roll.actionName}_${roll.total}_${roll.formula}`;
      const lastSeenId = this.seenMessageIds.get(roll.id);
      const lastSeenFootprint = this.seenMessageIds.get(footprint);
      if ((lastSeenId && (now - lastSeenId) < 5000) || (lastSeenFootprint && (now - lastSeenFootprint) < 5000)) {
        continue;
      }
      this.seenMessageIds.set(roll.id, now);
      this.seenMessageIds.set(footprint, now);

      if (this.seenMessageIds.size > 300) {
        for (const [k, time] of this.seenMessageIds.entries()) {
          if (now - time > 15000) this.seenMessageIds.delete(k);
        }
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
  const token = actor?.getActiveTokens?.()[0] || null;
  const matchingItem = actor?.items?.find(
    (i) => String(i.name || "").trim().toLowerCase() === String(parsedRoll.actionName || "").trim().toLowerCase()
  ) || null;

  // Generate companion d20 roll for dual-roll box
  let d20_2 = Math.floor(Math.random() * 20) + 1;
  if (parsedRoll.d20Values?.length > 1) {
    d20_2 = parsedRoll.d20Values[1];
  }
  const total2 = d20_2 + parsedRoll.modifier;

  // Auto-roll damage for attacks if matching item exists
  let damageData = null;
  const finalRolls = [];

  let evaluatedRoll1 = null;
  try {
    if (typeof Roll !== "undefined") {
      evaluatedRoll1 = await new Roll(parsedRoll.formula).evaluate();
      finalRolls.push(evaluatedRoll1);
      if (game.dice3d) {
        await game.dice3d.showForRoll(evaluatedRoll1, game.user, true);
      }
    }
  } catch (err) {
    console.warn(`[${MODULE_ID}] Could not render primary 3D roll for DDB:`, err);
  }

  if (parsedRoll.rollType === "attack" && matchingItem) {
    const rawDmgFormula = getItemDamageFormula(matchingItem);
    if (rawDmgFormula) {
      try {
        const rollData = typeof actor?.getRollData === "function" ? actor.getRollData() : {};
        let evalFormula = rawDmgFormula;
        if (parsedRoll.isCrit) {
          evalFormula = evalFormula.replace(/(\d+)d(\d+)/gi, (m, c, s) => `${Number(c) * 2}d${s}`);
        }
        const dmgRoll = await new Roll(evalFormula, rollData).evaluate();
        finalRolls.push(dmgRoll);
        damageData = {
          formula: rawDmgFormula,
          total: dmgRoll.total,
          isCrit: parsedRoll.isCrit
        };
        if (game.dice3d) {
          await game.dice3d.showForRoll(dmgRoll, game.user, true);
        }
      } catch (err) {
        console.warn(`[${MODULE_ID}] Could not evaluate attack damage:`, err);
      }
    }
  }

  const content = buildDdbCustomChatCardHtml(parsedRoll, actor, {
    matchingItem,
    token,
    userId: game.user?.id,
    d20_2,
    total2,
    damage: damageData
  });

  const speaker = actor
    ? ChatMessage.getSpeaker({ actor, token })
    : { alias: parsedRoll.characterName };

  await ChatMessage.create({
    user: game.user.id,
    speaker,
    content,
    rolls: finalRolls,
    sound: CONFIG.sounds?.dice
  });
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
    syncFromClipboard: async () => {
      if (!game.user?.isGM) return false;
      try {
        const text = await navigator.clipboard.readText();
        const clean = String(text || "").trim();
        if (!clean) {
          ui.notifications?.warn?.("Clipboard is empty. Click 'Sync DDB Token' on D&D Beyond first.");
          return false;
        }
        await game.settings.set(MODULE_ID, SETTINGS.DDB_COBALT_TOKEN, clean);
        ui.notifications?.info?.("DDB Token updated from clipboard! Connecting...");
        return await window.CustomRolls.ddb.connect();
      } catch (err) {
        ui.notifications?.error?.("Failed to read clipboard: " + (err?.message || err));
        return false;
      }
    },
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
