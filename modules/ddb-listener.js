// =============================================================================
// CHEAP DICE: D&D BEYOND GAME LOG LISTENER
// Bridges D&D Beyond campaign rolls into Foundry using Cheap Dice custom cards.
// =============================================================================

import { MODULE_ID, SETTINGS, FLAGS } from "../src/constants.js";
import { getCardDispositionWrapper } from "./socket-handlers.js";
import { buildSpellConfigFromItem } from "./custom-rolls.js";

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

const DND5E_SKILLS = new Set([
  "acrobatics", "animal handling", "arcana", "athletics", "deception",
  "history", "insight", "intimidation", "investigation", "medicine",
  "nature", "perception", "performance", "persuasion", "religion",
  "sleight of hand", "stealth", "survival"
]);

/**
 * Normalizes DDB rollType / rollKind strings into Cheap Dice categories.
 * @param {string} rawType
 * @returns {"attack" | "damage" | "heal" | "save" | "check" | "skill" | "initiative" | "spell" | "other"}
 */
export function normalizeDdbRollType(rawType) {
  const t = String(rawType || "").toLowerCase().trim();
  if (t === "to hit" || t === "attack") return "attack";
  if (t === "heal" || t === "healing") return "heal";
  if (t === "damage") return "damage";
  if (t === "save" || t === "saving throw") return "save";
  if (t === "skill") return "skill";
  if (t === "check" || t === "ability") return "check";
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
    let rollType = normalizeDdbRollType(r.rollType);
    const cleanAction = String(actionName || "").toLowerCase().trim();
    if (rollType === "check" && DND5E_SKILLS.has(cleanAction)) {
      rollType = "skill";
    } else if (cleanAction.includes("saving throw") || cleanAction.endsWith(" save")) {
      rollType = "save";
    } else if (cleanAction.includes("initiative")) {
      rollType = "initiative";
    } else if (cleanAction === "roll" || cleanAction === "manual roll" || cleanAction === "dice roll") {
      rollType = "other";
    }

    const rollMode = normalizeDdbRollMode(r.rollKind);
    const sets = Array.isArray(r.diceNotation?.set) ? r.diceNotation.set : [];
    const constant = Number(r.result?.constant ?? r.diceNotation?.constant ?? 0) || 0;

    const allDice = [];
    const d20Values = [];
    const formulaParts = [];

    for (const s of sets) {
      const dieStr = String(s.dieType || "d20").trim().toLowerCase();
      const numMatch = dieStr.match(/\d+/);
      const dieType = numMatch ? `d${numMatch[0]}` : "d20";
      const count = Number(s.count || (Array.isArray(s.dice) ? s.dice.length : 1)) || 1;
      formulaParts.push(`${count}${dieType}`);

      const diceList = Array.isArray(s.dice) ? s.dice : [];
      for (const d of diceList) {
        const dStr = String(d.dieType || dieType).trim().toLowerCase();
        const dMatch = dStr.match(/\d+/);
        const dDieType = dMatch ? `d${dMatch[0]}` : dieType;
        const val = Number(d.dieValue ?? d.value ?? 0);
        allDice.push({
          dieType: dDieType,
          dieValue: val
        });
        if (dDieType === "d20") {
          d20Values.push(val);
        }
      }
    }

    const keptValues = Array.isArray(r.result?.values) ? r.result.values.map(Number) : [];
    if (allDice.length === 0 && keptValues.length > 0) {
      const defaultDieType = formulaParts[0]?.replace(/^\d+/, "") || "d20";
      for (const val of keptValues) {
        allDice.push({ dieType: defaultDieType, dieValue: val });
        if (defaultDieType === "d20") d20Values.push(val);
      }
    }
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

    const rawCastLevel = Number(
      r.castLevel ?? r.spellLevel ?? r.castAtLevel ?? r.slotLevel ?? r.level
      ?? data.castLevel ?? data.spellLevel ?? data.castAtLevel ?? data.slotLevel ?? data.level
      ?? evt.context?.castLevel ?? evt.context?.spellLevel ?? 0
    ) || null;

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
      damageType: r.damageType || "",
      ...(rawCastLevel ? { castLevel: rawCastLevel } : {})
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

  const list = Array.isArray(actors)
    ? actors
    : Array.from(typeof actors?.values === "function" ? actors.values() : (actors || []));
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
 * Resolves the relevant ability score key (str, dex, int, etc.) for an item.
 * @param {object|null} item
 * @param {object|null} [actor]
 * @returns {string}
 */
export function resolveItemAbility(item, actor = null) {
  if (!item) return "str";
  const itemSys = item.system || {};
  let explicitAbility = item.abilityMod || itemSys.ability;

  // Check modern dnd5e activities
  if (itemSys.activities && typeof itemSys.activities.values === "function") {
    const activities = Array.from(itemSys.activities.values());
    const act = activities.find((a) => a.attack || a.damage);
    if (act?.ability && act.ability !== "default") {
      explicitAbility = act.ability;
    }
  }

  if (explicitAbility && explicitAbility !== "default" && explicitAbility !== "none") {
    return explicitAbility;
  }

  // Fallback heuristics: finesse, ranged, spell
  const actionType = itemSys.actionType || "";
  const isRanged = actionType === "rwak" || actionType === "rsak" || String(itemSys.type?.value || "").includes("R");
  const isSpell = ["msak", "rsak", "save"].includes(actionType) || item.type === "spell";

  const hasProperty = (prop) => {
    if (!itemSys.properties) return false;
    if (itemSys.properties instanceof Set) return itemSys.properties.has(prop);
    if (Array.isArray(itemSys.properties)) return itemSys.properties.includes(prop);
    if (typeof itemSys.properties === "object") return Boolean(itemSys.properties[prop]);
    return false;
  };

  if (isSpell) {
    return actor?.system?.attributes?.spellcasting || "int";
  }
  if (isRanged && !hasProperty("thr")) {
    return "dex";
  }
  if (hasProperty("fin") && actor?.system?.abilities) {
    const strMod = actor.system.abilities?.str?.mod ?? 0;
    const dexMod = actor.system.abilities?.dex?.mod ?? 0;
    return dexMod >= strMod ? "dex" : "str";
  }
  return "str";
}

/**
 * Parses maximum possible dice damage from a formula string (e.g. 1d8 -> 8, 2d6 -> 12).
 * Used for Cheap Dice maximized critical hits.
 * @param {string} formula
 * @returns {number}
 */
export function parseMaxDamageFromFormula(formula) {
  if (!formula || typeof formula !== "string") return 0;
  const diceMatches = formula.matchAll(/(\d*)d(\d+)/gi);
  let totalMaxDamage = 0;
  for (const match of diceMatches) {
    const count = parseInt(match[1], 10) || 1;
    const max = parseInt(match[2], 10);
    if (max > 0) totalMaxDamage += count * max;
  }
  return totalMaxDamage;
}

/**
 * Replaces @mod and @abilities references with their resolved numeric value in a damage formula.
 * @param {string} formula
 * @param {number} mod
 * @returns {string}
 */
export function formatNumericFormula(formula, mod = 0) {
  if (!formula || typeof formula !== "string") return "";
  const numMod = Number(mod) || 0;
  return formula
    .replace(/@mod\b/gi, String(numMod))
    .replace(/@abilities\.\w+\.mod\b/gi, String(numMod));
}

/**
 * Safely extracts a damage formula from an actor item (modern dnd5e or legacy),
 * including ability modifier (@mod) and magical bonuses if not already embedded.
 * @param {object|null} item
 * @param {object|null} [actor]
 * @returns {string}
 */
export function getItemDamageFormula(item, actor = null) {
  if (!item?.system) return "";
  let baseFormula = "";
  let includeBaseAbility = true;

  // Check modern dnd5e activities
  const activities = item.system.activities;
  if (activities && typeof activities.values === "function") {
    for (const act of activities.values()) {
      if (Array.isArray(act.damage?.parts) && act.damage.parts.length > 0) {
        const parts = act.damage.parts.map((p) => p.formula || p[0] || "").filter(Boolean);
        if (parts.length > 0) {
          baseFormula = parts.join(" + ");
          if (act.damage?.includeBaseAbility !== undefined) {
            includeBaseAbility = Boolean(act.damage.includeBaseAbility);
          }
          break;
        }
      }
    }
  }

  // Check classic dnd5e damage.parts
  if (!baseFormula) {
    const parts = item.system.damage?.parts;
    if (Array.isArray(parts) && parts.length > 0) {
      const fList = parts.map((p) => (Array.isArray(p) ? p[0] : (p.formula || String(p)))).filter(Boolean);
      if (fList.length > 0) baseFormula = fList.join(" + ");
    }
  }

  if (!baseFormula && item.system.damage?.base?.formula) {
    baseFormula = item.system.damage.base.formula;
  }

  if (!baseFormula) return "";

  // Cantrip scaling for 0-level spells based on actor level
  if (item.type === "spell" && Number(item.system.level ?? 0) === 0 && actor) {
    const charLevel = Number(actor.system.details?.level ?? 1);
    const multiplier = charLevel >= 17 ? 4 : charLevel >= 11 ? 3 : charLevel >= 5 ? 2 : 1;
    if (multiplier > 1) {
      baseFormula = baseFormula.replace(/^(\d*)d(\d+)/i, (match, countStr, die) => {
        const count = parseInt(countStr, 10) || 1;
        return `${count * multiplier}d${die}`;
      });
    }
  }

  // Append ability modifier (@mod) if not already present in the formula
  const isWeapon = item.type === "weapon" || ["mwak", "rwak"].includes(item.system.actionType);
  const isSpell = item.type === "spell" || ["msak", "rsak"].includes(item.system.actionType);
  const spellConfigAddMod = Boolean(item.flags?.[MODULE_ID]?.spellConfigs?.addAbilityModToValue);

  if (isWeapon && includeBaseAbility && !baseFormula.includes("@mod") && !baseFormula.includes("@abilities")) {
    baseFormula += " + @mod";
  } else if (isSpell && (spellConfigAddMod || (includeBaseAbility && baseFormula.includes("@mod")))) {
    if (!baseFormula.includes("@mod") && !baseFormula.includes("@abilities")) {
      baseFormula += " + @mod";
    }
  }

  // Append magical bonus if present on weapon
  const magicBonus = Number(item.system.magicalBonus ?? item.system.bonus?.damage ?? 0);
  if (magicBonus > 0) {
    baseFormula += ` + ${magicBonus}`;
  }

  return baseFormula;
}

/**
 * Safely unwraps dnd5e 3.x/4.x/5.x+ fields that may be a Set, Array, or primitive string.
 * @param {*} val
 * @param {string} [fallback=""]
 * @returns {string}
 */
export function unwrapDnd5eString(val, fallback = "") {
  if (val instanceof Set) {
    const first = Array.from(val)[0];
    return first != null ? String(first) : fallback;
  }
  if (Array.isArray(val)) {
    return val[0] != null ? String(val[0]) : fallback;
  }
  return val != null && val !== "" ? String(val) : fallback;
}

const SRD_SAVE_SPELLS = {
  "acid splash": { ability: "dex", success: "none" },
  "aganazzar's scorcher": { ability: "dex", success: "half" },
  "blade barrier": { ability: "dex", success: "half" },
  "blight": { ability: "con", success: "half" },
  "burning hands": { ability: "dex", success: "half" },
  "call lightning": { ability: "dex", success: "half" },
  "chain lightning": { ability: "dex", success: "half" },
  "circle of death": { ability: "con", success: "half" },
  "cloudkill": { ability: "con", success: "half" },
  "cone of cold": { ability: "con", success: "half" },
  "destructive wave": { ability: "con", success: "half" },
  "disintegrate": { ability: "dex", success: "none" },
  "dissonant whispers": { ability: "wis", success: "half" },
  "dragon's breath": { ability: "dex", success: "half" },
  "erupting earth": { ability: "dex", success: "half" },
  "finger of death": { ability: "con", success: "half" },
  "fire storm": { ability: "dex", success: "half" },
  "fireball": { ability: "dex", success: "half" },
  "flame strike": { ability: "dex", success: "half" },
  "frostbite": { ability: "con", success: "none" },
  "hellish rebuke": { ability: "dex", success: "half" },
  "ice knife": { ability: "dex", success: "none" },
  "ice storm": { ability: "dex", success: "half" },
  "insect plague": { ability: "con", success: "half" },
  "lightning bolt": { ability: "dex", success: "half" },
  "meteor swarm": { ability: "dex", success: "half" },
  "mind sliver": { ability: "int", success: "none" },
  "moonbeam": { ability: "con", success: "half" },
  "phantasmal killer": { ability: "wis", success: "half" },
  "poison spray": { ability: "con", success: "none" },
  "prismatic spray": { ability: "dex", success: "half" },
  "psychic scream": { ability: "int", success: "half" },
  "sacred flame": { ability: "dex", success: "none" },
  "shatter": { ability: "con", success: "half" },
  "spirit guardians": { ability: "wis", success: "half" },
  "storm sphere": { ability: "str", success: "half" },
  "sunburst": { ability: "con", success: "half" },
  "synaptic static": { ability: "int", success: "half" },
  "thunderwave": { ability: "con", success: "half" },
  "tidal wave": { ability: "dex", success: "half" },
  "toll the dead": { ability: "wis", success: "none" },
  "vicious mockery": { ability: "wis", success: "none" },
  "vitriolic sphere": { ability: "dex", success: "half" },
  "wall of fire": { ability: "dex", success: "half" },
  "word of radiance": { ability: "con", success: "none" }
};

/**
 * Inspects a Foundry spell item and actor to determine if it is a saving throw spell.
 * Supports both modern dnd5e activities (v3/v4/v5+) and legacy actionType,
 * with a fallback to standard 5e SRD save spells if not on the Foundry sheet.
 *
 * @param {object|null} matchingItem
 * @param {object|null} actor
 * @param {string} [actionName=""]
 * @returns {{ isSaveSpell: boolean, saveAbility: string, saveSuccess: string, spellAbility: string, spellDC: number }}
 */
export function resolveSpellSaveInfo(matchingItem, actor = null, actionName = "") {
  const sys = matchingItem?.system || {};
  const isSpell = matchingItem?.type === "spell";
  const spellAbility = unwrapDnd5eString(sys.ability, "") || actor?.system?.attributes?.spellcasting || "int";
  const abilityMod = actor?.system?.abilities?.[spellAbility]?.mod ?? 0;
  const prof = actor?.system?.attributes?.prof ?? 0;
  const baseDC = actor?.system?.attributes?.spell?.dc ?? actor?.system?.attributes?.spelldc ?? (8 + prof + abilityMod);
  const defaultResult = { isSaveSpell: false, saveAbility: "dex", saveSuccess: "half", spellAbility, spellDC: baseDC };

  if (matchingItem) {
    // Modern dnd5e activities
    const activities = sys.activities
      ? (typeof sys.activities.values === "function" ? Array.from(sys.activities.values()) : Object.values(sys.activities))
      : [];
    const saveAct = activities.find((a) => a && (a.type === "save" || a.save));
    if (saveAct) {
      const saveAbil = unwrapDnd5eString(saveAct.save?.ability, "dex").toLowerCase();
      const onSave = unwrapDnd5eString(saveAct.damage?.onSave || saveAct.save?.scaling, "half").toLowerCase();
      const saveSuccess = onSave === "none" ? "none" : "half";
      const dcFormulaVal = Number(saveAct.save?.dc?.formula);
      const spellDC = Number.isFinite(dcFormulaVal) && dcFormulaVal > 0 ? dcFormulaVal : baseDC;
      return { isSaveSpell: true, saveAbility: saveAbil, saveSuccess, spellAbility, spellDC };
    }

    // Legacy dnd5e actionType === "save"
    if (sys.actionType === "save" || (isSpell && sys.save?.ability)) {
      const saveAbil = unwrapDnd5eString(sys.save?.ability, "dex").toLowerCase();
      const scaling = unwrapDnd5eString(sys.save?.scaling, "half").toLowerCase();
      const saveSuccess = scaling === "none" ? "none" : "half";
      return { isSaveSpell: true, saveAbility: saveAbil, saveSuccess, spellAbility, spellDC: baseDC };
    }
  }

  // Fallback to known SRD save spells if not on sheet or missing save metadata
  const lookupName = String(matchingItem?.name || actionName || "")
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, "")
    .trim();
  const srdMatch = SRD_SAVE_SPELLS[lookupName];
  if (srdMatch) {
    return {
      isSaveSpell: true,
      saveAbility: srdMatch.ability,
      saveSuccess: srdMatch.success,
      spellAbility,
      spellDC: baseDC
    };
  }

  return defaultResult;
}

/**
 * Deduces the effective spell cast level from a DDB roll payload and base spell config.
 * Supports cantrips (0), base-level casts, and upcasting inferred from rolled dice counts.
 *
 * @param {object} parsedRoll
 * @param {object} config
 * @param {object|null} [matchingItem=null]
 * @returns {number}
 */
export function resolveDdbCastLevel(parsedRoll, config = {}, matchingItem = null) {
  const baseLevel = Number(config?.baseLevel ?? matchingItem?.system?.level ?? 0) || 0;
  if (baseLevel <= 0) return 0;

  // Check if DDB payload explicitly carried a cast level
  let explicitLevel = Number(parsedRoll?.castLevel ?? parsedRoll?.spellLevel ?? 0);
  if (!explicitLevel && parsedRoll?.actionName) {
    // Parse upcast level from action strings like "Scorching Ray (3rd Level)", "Scorching Ray (Level 3)", etc.
    const lvlMatch = String(parsedRoll.actionName).match(/(?:\(|\[|\b)(\d+)(?:st|nd|rd|th)?\s+level(?:\)|\]|\b)|\blevel\s+(\d+)\b/i);
    if (lvlMatch) {
      explicitLevel = Number(lvlMatch[1] || lvlMatch[2]) || 0;
    }
  }
  if (explicitLevel >= baseLevel && explicitLevel <= 9) {
    return explicitLevel;
  }

  // Deduce upcast level from rolled damage/heal dice count vs base dice count
  if (parsedRoll?.rollType === "damage" || parsedRoll?.rollType === "heal") {
    const baseDiceCount = Number(config?.damageDiceCount) || 0;
    const ddbDiceCount = Array.isArray(parsedRoll.dice)
      ? parsedRoll.dice.filter((d) => !d.dropped).length
      : 0;
    if (baseDiceCount > 0 && ddbDiceCount > baseDiceCount) {
      let stepDice = 1;
      if (config?.upcastDiceFormula) {
        const stepMatch = String(config.upcastDiceFormula).match(/(\d*)d\d+/i);
        if (stepMatch) stepDice = Math.max(1, parseInt(stepMatch[1]) || 1);
      }
      const extraLevels = Math.floor((ddbDiceCount - baseDiceCount) / stepDice);
      if (extraLevels > 0) {
        return Math.min(9, baseLevel + extraLevels);
      }
    }
  }

  return baseLevel;
}

/**
 * Prompts for cast level when DDB triggers a leveled spell attack roll without explicit level metadata
 * and the actor has higher-level spell slots available.
 *
 * @param {object} actor
 * @param {object} config
 * @param {number} baseLevel
 * @returns {Promise<number>}
 */
export async function promptDdbAttackCastLevel(actor, config, baseLevel) {
  if (typeof Dialog === "undefined" || !actor || baseLevel <= 0) return baseLevel;

  const spells = actor.system?.spells || {};
  const higherLevels = [];
  for (let lvl = baseLevel + 1; lvl <= 9; lvl++) {
    const slot = spells[`spell${lvl}`];
    if (Number(slot?.value) > 0) {
      higherLevels.push(lvl);
    }
  }
  if (higherLevels.length === 0) return baseLevel;

  const normSpell = String(config?.spellName || "").toLowerCase().replace(/\s*\([^)]*\)/g, "").trim();
  const isRaySpell = Boolean(config?.isMultiAttack) || normSpell === "scorching ray" || normSpell === "jim's magic missile";
  const baseRays = (normSpell === "scorching ray" || normSpell === "jim's magic missile")
    ? (Number(config?.attackCount) || 3)
    : (Number(config?.attackCount) || 1);
  const upcastRays = (normSpell === "scorching ray" || normSpell === "jim's magic missile")
    ? (Number(config?.upcastAttacks) || 1)
    : (Number(config?.upcastAttacks) || 0);

  const levels = [baseLevel, ...higherLevels];
  return new Promise((resolve) => {
    let resolved = false;
    const buttons = {};
    for (const lvl of levels) {
      const slot = spells[`spell${lvl}`] || {};
      const cur = Number(slot.value) || 0;
      const max = Number(slot.max) || 0;
      const extra = lvl - baseLevel;
      const rayInfo = isRaySpell && upcastRays > 0 ? ` (${baseRays + extra * upcastRays} rays)` : "";
      buttons[`lvl_${lvl}`] = {
        label: `Lvl ${lvl}${rayInfo} <span style="opacity:0.75;font-size:0.85em;">[${cur}/${max}]</span>`,
        callback: () => {
          resolved = true;
          resolve(lvl);
        }
      };
    }

    new Dialog({
      title: `${actor.name}: ${config.spellName || "Spell"} Cast Level`,
      content: `<p style="margin: 0 0 8px;">D&amp;D Beyond did not include the cast level for <strong>${escapeHtml(config.spellName || "this spell")}</strong>. Select the slot level to cast:</p>`,
      buttons,
      default: `lvl_${baseLevel}`,
      close: () => {
        if (!resolved) resolve(baseLevel);
      }
    }, { width: 420 }).render(true);
  });
}

/**
 * Builds a Dice Stuff native 1:1 spell attack card.
 * Matches runSpellAttackRoll layout from socket-handlers.js.
 *
 * @param {object} parsedRoll
 * @param {object|null} actor
 * @param {object} matchingItem
 * @param {object} [options]
 * @returns {string}
 */
export function buildDdbSpellAttackCardHtml(parsedRoll, actor, matchingItem, options = {}) {
  const actorName = escapeHtml(actor?.name || parsedRoll.characterName);
  const spellName = escapeHtml(matchingItem?.name || parsedRoll.actionName);

  const sys = matchingItem?.system || {};
  const isCantrip = Number(sys.level ?? 0) === 0;
  const levelTag = isCantrip ? "Cantrip" : `Level ${sys.level}`;

  const tags = [];
  tags.push(levelTag);

  let targetLabel = "Creature(s)";
  const tType = sys.target?.type;
  if (tType === "self") targetLabel = "Self";
  else if (tType === "point") targetLabel = "Point in Space";
  else if (tType === "object") targetLabel = "Object(s)";
  else if (tType === "area") {
    const shape = sys.target?.units ? `Area (${sys.target.value} ${sys.target.units})` : "Area";
    targetLabel = shape;
  }
  tags.push(`Target: ${targetLabel}`);

  const dur = sys.duration;
  const durStr = dur?.value ? `${dur.value} ${dur.units || ""}`.trim() : (dur?.units || "Instantaneous");
  tags.push(`Dur: ${durStr}`);

  const isConc = Boolean(sys.properties?.has?.("concentration") || sys.components?.concentration);
  if (isConc) tags.push("Concentration");

  const comps = sys.properties || sys.components || {};
  const compList = [];
  if (comps.has ? comps.has("vocal") : comps.vocal) compList.push("V");
  if (comps.has ? comps.has("somatic") : comps.somatic) compList.push("S");
  if (comps.has ? comps.has("material") : comps.material) compList.push(sys.materials?.cost ? "M*" : "M");
  if (compList.length > 0) tags.push(`Comp: ${compList.join(",")}`);

  tags.push("DDB");

  const tagsHtml = tags.map((t) => {
    const isDdb = t === "DDB";
    const isConcentration = t === "Concentration";
    const bg = isDdb ? "rgba(108, 117, 125, 0.15)" : (isConcentration ? "rgba(163, 72, 72, 0.15)" : "rgba(114, 137, 218, 0.18)");
    const border = isDdb ? "rgba(108, 117, 125, 0.4)" : (isConcentration ? "rgba(163, 72, 72, 0.4)" : "rgba(114, 137, 218, 0.4)");
    const color = isDdb ? "#495057" : (isConcentration ? "#a34848" : "#4b5d88");
    return `<span style="display: inline-block; background: ${bg}; border: 1px solid ${border}; border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: ${color};">${escapeHtml(t)}</span>`;
  }).join(" ");

  const fullSpellDesc = (sys.description?.value || "").trim();
  const descBlock = fullSpellDesc ? `
    <details style="margin-bottom: 6px; border: 1px solid rgba(75, 93, 136, 0.3); border-radius: 4px; padding: 5px 8px; background: rgba(75, 93, 136, 0.05);">
      <summary style="font-weight: 700; font-size: 0.9em; color: #4b5d88; cursor: pointer; user-select: none; text-transform: uppercase; letter-spacing: 0.5px;">
        <i class="fas fa-sparkles" style="margin-right: 4px;"></i> Spell Description
      </summary>
      <div class="spell-description-content" style="margin-top: 6px; font-size: 0.9em; line-height: 1.45; color: #2b3a4a; border-top: 1px solid rgba(75, 93, 136, 0.15); padding-top: 4px;">
        ${fullSpellDesc}
      </div>
    </details>
  ` : "";

  const d20_1 = Number(parsedRoll.keptD20 ?? parsedRoll.d20Values?.[0] ?? (parsedRoll.total - parsedRoll.modifier));
  const d20_2 = Number(options.d20_2 ?? 12);
  const total1 = Number(options.total1 ?? parsedRoll.total);
  const total2 = Number(options.total2 ?? (d20_2 + parsedRoll.modifier));

  const isCrit = Boolean(options.isCrit ?? (d20_1 === 20 || d20_2 === 20));
  const isFumble1 = d20_1 === 1;
  const isFumble2 = d20_2 === 1;

  let atk1Style = "color: #2b3a4a;";
  if (d20_1 === 20) atk1Style = "color: #18521e; font-weight: bold;";
  else if (isFumble1) atk1Style = "color: #a33; font-weight: bold;";

  let atk2Style = "color: #666;";
  if (d20_2 === 20) atk2Style = "color: #18521e; font-weight: bold;";
  else if (isFumble2) atk2Style = "color: #a33; font-weight: bold;";

  const dmg = options.damage || {};
  const baseDmg = dmg.normalTotal ?? dmg.total ?? 0;
  const maxCritBonus = dmg.critBonus ?? 0;
  const criticalTotal = dmg.criticalTotal ?? (baseDmg + maxCritBonus);

  let damageType = (dmg.damageType || sys.damage?.parts?.[0]?.[1] || "fire").toLowerCase();
  const typeDisplay = damageType.toUpperCase();

  const dmgDisplayHtml = isCrit
    ? `<strong style="font-size: 1.05em; color: #2b3a4a;">${baseDmg}</strong> <span style="font-size: 0.85em; color: #18521e; font-weight: bold;">(+${maxCritBonus} crit)</span>`
    : `<strong style="font-size: 1.05em; color: #2b3a4a;">${baseDmg}</strong>`;

  const summaryRow = `
    <div style="display: grid; grid-template-columns: 1fr 1.2fr 1.2fr; align-items: center; padding: 4px 2px; border-bottom: 1px dotted #ccc; font-size: 0.85em;">
      <div><strong style="color: #4b5d88;">Attack</strong></div>
      <div style="text-align: center;">
        <span style="${atk1Style}"><strong>${total1}</strong></span>
        <span style="font-size: 0.85em; ${atk2Style}"> (${total2})</span>
      </div>
      <div style="text-align: right;">
        ${dmgDisplayHtml}
      </div>
    </div>
  `;

  const modDisplay = parsedRoll.modifier >= 0 ? `+${parsedRoll.modifier}` : `${parsedRoll.modifier}`;
  const displayFormula = dmg.numericFormula || dmg.formula || "";

  return `
    <div style="font-family: inherit; color: #333;">
      <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #343a40; padding-bottom: 3px; margin-bottom: 6px;">
        <span style="font-size: 1.05em; font-weight: bold; color: #2b3a4a;">${spellName}</span>
        <span style="font-size: 0.8em; color: #777;">${actorName}</span>
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 6px;">
        ${tagsHtml}
      </div>

      ${descBlock}

      <div style="background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
        <div style="display: grid; grid-template-columns: 1fr 1.2fr 1.2fr; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-bottom: 3px; font-size: 0.75em; font-weight: bold; color: #777;">
          <div>TARGET</div>
          <div style="text-align: center;">ATK (ADV)</div>
          <div style="text-align: right;">DMG</div>
        </div>
        ${summaryRow}
      </div>

      <div style="display: flex; justify-content: space-around; background: rgba(0,0,0,0.04); border-radius: 4px; padding: 6px 4px; text-align: center;">
        <div style="flex: 1; ${isCrit ? "border-right: 1px solid rgba(0,0,0,0.1);" : ""} padding: 0 4px;">
          <div style="font-size: 0.75em; font-weight: 600; color: #777;">DAMAGE TOTAL</div>
          <div style="font-size: 1.25em; font-weight: bold; color: #2b3a4a;">${baseDmg}</div>
        </div>
        ${isCrit ? `
        <div style="flex: 1; border-right: 1px solid rgba(0,0,0,0.1); padding: 0 4px;">
          <div style="font-size: 0.75em; font-weight: 600; color: #18520b;">CRITICAL TOTAL</div>
          <div style="font-size: 1.25em; font-weight: bold; color: #18520b;">${criticalTotal}</div>
        </div>` : ""}
        <div style="flex: 1; padding: 0 4px;">
          <div style="font-size: 0.75em; font-weight: 600; color: #777;">DAMAGE TYPE</div>
          <div style="font-size: 1.1em; font-weight: bold; color: #2b3a4a;">${typeDisplay}</div>
        </div>
      </div>

      <details style="margin-top: 6px; padding: 2px 4px;">
        <summary style="font-weight: 600; font-size: 0.82em; color: #666; cursor: pointer;">Dice Roll Audits &amp; Formula</summary>
        <div style="padding-top: 4px; border-top: 1px solid #e0e0e0; font-size: 0.8em; color: #555; margin-top: 3px;">
          <div><strong>Attack Mod:</strong> ${modDisplay}</div>
          <div><strong>Damage Formula:</strong> ${escapeHtml(displayFormula)} (${typeDisplay})</div>
          ${isCrit ? `<div><strong>Crunchy Crit Extra:</strong> +${maxCritBonus} (Max Dice)</div>` : ""}
          <div style="margin-top: 6px; padding: 4px; background: rgba(0,0,0,0.02); border-radius: 4px; border: 1px solid #eee;">
            <div style="font-weight: bold; font-size: 0.82em; color: #4b5d88; margin-bottom: 3px;">Attack Audit</div>
            <div style="display: flex; gap: 6px;">
              <div style="flex: 1; text-align: center;">
                <div style="font-size: 0.75em; color: #777;">Roll</div>
                <div style="transform: scale(0.9); margin: -4px 0;">${options.rollHtml1 || total1}</div>
              </div>
              <div style="flex: 1; text-align: center;">
                <div style="font-size: 0.75em; color: #777;">Adv/Dis</div>
                <div style="transform: scale(0.9); margin: -4px 0;">${options.rollHtml2 || total2}</div>
              </div>
            </div>
            ${dmg.renderHtml ? `
            <div style="margin-top: 4px;">
              <div style="font-size: 0.75em; color: #777; text-align: center;">Base Damage</div>
              <div style="transform: scale(0.9); margin: -4px 0;">${dmg.renderHtml}</div>
              ${isCrit ? `<div style="text-align: center; font-size: 0.78em; color: #18521e; font-weight: bold; margin-top: 2px;">+${maxCritBonus} Max Crit Added =${criticalTotal}</div>` : ""}
            </div>` : ""}
          </div>
        </div>
      </details>
    </div>
  `;
}

/**
 * Builds a Dice Stuff native 1:1 spell save card for fallback DDB damage rolls.
 * Matches the Save Branch layout from socket-handlers.js.
 *
 * @param {object} parsedRoll
 * @param {object|null} actor
 * @param {object} matchingItem
 * @param {object} saveInfo
 * @param {object} [options]
 * @returns {string}
 */
export function buildDdbSpellSaveCardHtml(parsedRoll, actor, matchingItem, saveInfo, options = {}) {
  const actorName = escapeHtml(actor?.name || parsedRoll.characterName);
  const spellName = escapeHtml(matchingItem?.name || parsedRoll.actionName);
  const sys = matchingItem?.system || {};

  const spellLvl = Number(sys.level ?? 0);
  const tags = [];
  tags.push(spellLvl === 0 ? "Cantrip" : `Level ${spellLvl}`);

  const rng = sys.range;
  const rangeStr = rng?.value ? `${rng.value} ${rng.units || "ft"}` : (rng?.units || "Touch");
  const targetType = sys.target?.type || sys.target?.template?.type;
  let targetLabel = "Creature(s)";
  if (targetType === "self" || String(rangeStr).toLowerCase() === "self") targetLabel = "Self";
  else if (["cone", "cube", "line", "sphere", "cylinder", "radius"].includes(targetType)) {
    const size = sys.target?.value || sys.target?.template?.size;
    const shape = targetType === "cylinder" || targetType === "radius" ? "Sphere" : (targetType.charAt(0).toUpperCase() + targetType.slice(1));
    targetLabel = size ? `${shape} (${size} ft)` : shape;
  }
  tags.push(`Target: ${targetLabel}`);

  const dur = sys.duration;
  const durStr = dur?.value ? `${dur.value} ${dur.units || ""}`.trim() : (dur?.units || "Instantaneous");
  tags.push(`Dur: ${durStr}`);

  const isConc = Boolean(sys.properties?.has?.("concentration") || sys.components?.concentration);
  if (isConc) tags.push("Concentration");

  const comps = sys.properties || sys.components || {};
  const compList = [];
  if (comps.has ? comps.has("vocal") : comps.vocal) compList.push("V");
  if (comps.has ? comps.has("somatic") : comps.somatic) compList.push("S");
  if (comps.has ? comps.has("material") : comps.material) compList.push((sys.materials?.cost || sys.materials?.consumed) ? "M*" : "M");
  if (compList.length > 0) tags.push(`Comp: ${compList.join(",")}`);
  tags.push("DDB");

  const tagsHtml = tags.map((t) => {
    const isDdb = t === "DDB";
    const isC = t === "Concentration";
    const bg = isDdb ? "rgba(108, 117, 125, 0.15)" : (isC ? "rgba(163, 72, 72, 0.15)" : "rgba(114, 137, 218, 0.18)");
    const border = isDdb ? "rgba(108, 117, 125, 0.4)" : (isC ? "rgba(163, 72, 72, 0.4)" : "rgba(114, 137, 218, 0.4)");
    const color = isDdb ? "#495057" : (isC ? "#a34848" : "#4b5d88");
    return `<span style="display: inline-block; background: ${bg}; border: 1px solid ${border}; border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: ${color};">${escapeHtml(t)}</span>`;
  }).join("");

  const saveLabel = escapeHtml((saveInfo?.saveAbility || "dex").toUpperCase());
  const spellDC = Number(saveInfo?.spellDC) || 10;
  const saveSuccess = saveInfo?.saveSuccess || "half";
  const normalDamageTotal = Number(parsedRoll.total) || 0;
  const halfDamage = Math.floor(normalDamageTotal / 2);

  const activities = sys.activities
    ? (typeof sys.activities.values === "function" ? Array.from(sys.activities.values()) : Object.values(sys.activities))
    : [];
  const actWithDmg = activities.find((a) => a?.damage?.parts?.length > 0);
  const rawDmgType = unwrapDnd5eString(actWithDmg?.damage?.parts?.[0]?.types, "")
    || unwrapDnd5eString(sys.damage?.parts?.[0]?.[1], "")
    || "fire";
  const typeDisplay = escapeHtml(rawDmgType.toUpperCase());

  const diceRollBlock = options.rollHtml1
    ? `<div style="transform: scale(0.96); margin: -2px 0;">${options.rollHtml1}</div>`
    : "";

  const damageTotalDisplay = saveSuccess === "half"
    ? `
      <div style="display: flex; justify-content: space-around; background: rgba(0,0,0,0.04); border-radius: 4px; padding: 6px 4px; margin-top: 6px; text-align: center;">
        <div style="flex: 1; border-right: 1px solid rgba(0,0,0,0.1);">
          <div style="font-size: 0.75em; font-weight: 600; color: #a34848;">FAILED SAVE</div>
          <div style="font-size: 1.25em; font-weight: bold; color: #2b3a4a;">${normalDamageTotal}</div>
        </div>
        <div style="flex: 1;">
          <div style="font-size: 0.75em; font-weight: 600; color: #4b5d88;">SUCCESSFUL SAVE</div>
          <div style="font-size: 1.25em; font-weight: bold; color: #555;">${halfDamage}</div>
        </div>
      </div>
    `
    : `
      <div style="display: flex; justify-content: space-around; background: rgba(0,0,0,0.04); border-radius: 4px; padding: 6px 4px; margin-top: 6px; text-align: center;">
        <div>
          <div style="font-size: 0.75em; font-weight: 600; color: #777;">DAMAGE TOTAL</div>
          <div style="font-size: 1.25em; font-weight: bold; color: #2b3a4a;">${normalDamageTotal}</div>
        </div>
        <div style="border-left: 1px solid rgba(0,0,0,0.1); padding-left: 14px;">
          <div style="font-size: 0.75em; font-weight: 600; color: #777;">DAMAGE TYPE</div>
          <div style="font-size: 1.1em; font-weight: bold; color: #2b3a4a;">${typeDisplay}</div>
        </div>
      </div>
    `;

  const spellAbil = (saveInfo?.spellAbility || "int").toUpperCase();
  const prof = actor?.system?.attributes?.prof ?? 0;
  const abilMod = actor?.system?.abilities?.[(saveInfo?.spellAbility || "int").toLowerCase()]?.mod ?? 0;

  const fullSpellDesc = (sys.description?.value || "").trim();
  const descriptionHtmlBlock = fullSpellDesc ? `
    <details style="margin-bottom: 6px; border: 1px solid rgba(75, 93, 136, 0.3); border-radius: 4px; padding: 5px 8px; background: rgba(75, 93, 136, 0.05);">
      <summary style="font-weight: 700; font-size: 0.9em; color: #4b5d88; cursor: pointer; user-select: none; text-transform: uppercase; letter-spacing: 0.5px;">
        <i class="fas fa-sparkles" style="margin-right: 4px;"></i> Spell Description
      </summary>
      <div class="spell-description-content" style="margin-top: 6px; font-size: 0.9em; line-height: 1.45; color: #2b3a4a; border-top: 1px solid rgba(75, 93, 136, 0.15); padding-top: 4px;">
        ${fullSpellDesc}
      </div>
    </details>
  ` : "";

  const isCostly = Boolean(sys.materials?.cost || sys.materials?.consumed);
  const matDesc = (sys.materials?.value || "").trim();
  const costlyBlock = isCostly && matDesc ? `
    <div style="font-size: 0.78em; color: #b35900; background: rgba(179, 89, 0, 0.08); padding: 3px 6px; border-radius: 3px; margin-bottom: 6px;">
      <i class="fas fa-coins"></i> <strong>Requires:</strong> ${escapeHtml(matDesc)}
    </div>
  ` : "";

  return `
    <div style="font-family: inherit; color: #333;">
      <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #343a40; padding-bottom: 3px; margin-bottom: 6px;">
        <span style="font-size: 1.05em; font-weight: bold; color: #2b3a4a;">${spellName}</span>
        <span style="font-size: 0.8em; color: #777;">${actorName}</span>
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 6px;">
        ${tagsHtml}
      </div>

      ${descriptionHtmlBlock}

      ${costlyBlock}

      <div style="background: rgba(43, 116, 137, 0.1); border: 1px solid rgba(43, 116, 137, 0.35); border-radius: 4px; padding: 6px; text-align: center; margin-bottom: 6px;">
        <div style="font-size: 1.05em; font-weight: bold; color: #235d6e;">DC ${spellDC} ${saveLabel} Saving Throw</div>
      </div>

      ${diceRollBlock}

      ${damageTotalDisplay}

      <details style="margin-top: 6px; padding: 2px 4px;">
        <summary style="font-weight: 600; font-size: 0.82em; color: #666; cursor: pointer;">Formula Breakdown</summary>
        <div style="padding-top: 4px; border-top: 1px solid #e0e0e0; font-size: 0.8em; color: #555; margin-top: 3px;">
          <div><strong>Spell Save DC:</strong> 8 + PB (${prof}) + ${escapeHtml(spellAbil)} (${abilMod}) = DC ${spellDC}</div>
          <div><strong>Damage:</strong> ${escapeHtml(parsedRoll.formula || "")} (${typeDisplay})</div>
        </div>
      </details>
    </div>
  `;
}

/**
 * Builds a Dice Stuff native 1:1 spell healing card for fallback DDB heal rolls.
 * Matches the Healing Branch layout from socket-handlers.js.
 *
 * @param {object} parsedRoll
 * @param {object|null} actor
 * @param {object|null} matchingItem
 * @param {object} [options]
 * @returns {string}
 */
export function buildDdbSpellHealCardHtml(parsedRoll, actor = null, matchingItem = null, options = {}) {
  const actorName = escapeHtml(actor?.name || parsedRoll.characterName);
  const spellName = escapeHtml(matchingItem?.name || parsedRoll.actionName);
  const sys = matchingItem?.system || {};

  const tags = [];
  if (matchingItem?.type === "spell") {
    const spellLvl = Number(sys.level ?? 0);
    tags.push(spellLvl === 0 ? "Cantrip" : `Level ${spellLvl}`);

    const rng = sys.range;
    const rangeStr = rng?.value ? `${rng.value} ${rng.units || "ft"}` : (rng?.units || "Touch");
    const targetType = sys.target?.type || sys.target?.template?.type;
    const targetLabel = (targetType === "self" || String(rangeStr).toLowerCase() === "self") ? "Self" : "Creature(s)";
    tags.push(`Target: ${targetLabel}`);

    const dur = sys.duration;
    const durStr = dur?.value ? `${dur.value} ${dur.units || ""}`.trim() : (dur?.units || "Instantaneous");
    tags.push(`Dur: ${durStr}`);

    const isConc = Boolean(sys.properties?.has?.("concentration") || sys.components?.concentration);
    if (isConc) tags.push("Concentration");

    const comps = sys.properties || sys.components || {};
    const compList = [];
    if (comps.has ? comps.has("vocal") : comps.vocal) compList.push("V");
    if (comps.has ? comps.has("somatic") : comps.somatic) compList.push("S");
    if (comps.has ? comps.has("material") : comps.material) compList.push((sys.materials?.cost || sys.materials?.consumed) ? "M*" : "M");
    if (compList.length > 0) tags.push(`Comp: ${compList.join(",")}`);
  } else {
    tags.push("Healing");
  }
  tags.push("DDB");

  const tagsHtml = tags.map((t) => {
    const isDdb = t === "DDB";
    const isC = t === "Concentration";
    const bg = isDdb ? "rgba(108, 117, 125, 0.15)" : (isC ? "rgba(163, 72, 72, 0.15)" : "rgba(114, 137, 218, 0.18)");
    const border = isDdb ? "rgba(108, 117, 125, 0.4)" : (isC ? "rgba(163, 72, 72, 0.4)" : "rgba(114, 137, 218, 0.4)");
    const color = isDdb ? "#495057" : (isC ? "#a34848" : "#4b5d88");
    return `<span style="display: inline-block; background: ${bg}; border: 1px solid ${border}; border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: ${color};">${escapeHtml(t)}</span>`;
  }).join("");

  const fullSpellDesc = (sys.description?.value || "").trim();
  const descriptionHtmlBlock = fullSpellDesc ? `
    <details style="margin-bottom: 6px; border: 1px solid rgba(75, 93, 136, 0.3); border-radius: 4px; padding: 5px 8px; background: rgba(75, 93, 136, 0.05);">
      <summary style="font-weight: 700; font-size: 0.9em; color: #4b5d88; cursor: pointer; user-select: none; text-transform: uppercase; letter-spacing: 0.5px;">
        <i class="fas fa-sparkles" style="margin-right: 4px;"></i> Spell Description
      </summary>
      <div class="spell-description-content" style="margin-top: 6px; font-size: 0.9em; line-height: 1.45; color: #2b3a4a; border-top: 1px solid rgba(75, 93, 136, 0.15); padding-top: 4px;">
        ${fullSpellDesc}
      </div>
    </details>
  ` : "";

  const totalValue = Number(parsedRoll.total) || 0;
  const rollRender = options.rollHtml1
    ? `<div style="transform: scale(0.96); margin: -2px 0;">${options.rollHtml1}</div>`
    : "";

  const spellAbil = unwrapDnd5eString(sys.ability, "") || actor?.system?.attributes?.spellcasting || "";
  const abilMod = spellAbil ? (actor?.system?.abilities?.[spellAbil.toLowerCase()]?.mod ?? 0) : 0;

  return `
    <div style="font-family: inherit; color: #333;">
      <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #343a40; padding-bottom: 3px; margin-bottom: 6px;">
        <span style="font-size: 1.05em; font-weight: bold; color: #2b3a4a;">${spellName}</span>
        <span style="font-size: 0.8em; color: #777;">${actorName}</span>
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 6px;">
        ${tagsHtml}
      </div>

      ${descriptionHtmlBlock}

      <div style="background: rgba(40, 167, 69, 0.1); border: 1px solid rgba(40, 167, 69, 0.35); border-radius: 4px; padding: 5px; text-align: center; margin-bottom: 6px;">
        <span style="font-weight: bold; font-size: 0.9em; color: #28a745;"><i class="fas fa-heart"></i> HIT POINTS RESTORED</span>
      </div>

      ${rollRender}

      <div style="display: flex; justify-content: space-around; background: rgba(0,0,0,0.04); border-radius: 4px; padding: 6px 4px; text-align: center; margin-top: 6px;">
        <div>
          <div style="font-size: 0.75em; font-weight: 600; color: #777;">HEALING TOTAL</div>
          <div style="font-size: 1.3em; font-weight: bold; color: #28a745;">+${totalValue}</div>
        </div>
      </div>

      <details style="margin-top: 6px; padding: 2px 4px;">
        <summary style="font-weight: 600; font-size: 0.82em; color: #666; cursor: pointer;">Formula Breakdown</summary>
        <div style="padding-top: 4px; border-top: 1px solid #e0e0e0; font-size: 0.8em; color: #555; margin-top: 3px;">
          <div><strong>Formula:</strong> ${escapeHtml(parsedRoll.formula || "")}</div>
          ${spellAbil ? `<div><strong>Spellcasting Mod:</strong> ${abilMod >= 0 ? "+" : ""}${abilMod} (${escapeHtml(spellAbil.toUpperCase())})</div>` : ""}
        </div>
      </details>
    </div>
  `;
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
  // If this roll is an attack from a spell, render Dice Stuff's exact spell attack layout
  if (parsedRoll.rollType === "attack" && options.matchingItem?.type === "spell") {
    const spellHtml = buildDdbSpellAttackCardHtml(parsedRoll, actor, options.matchingItem, options);
    if (typeof getCardDispositionWrapper === "function") {
      return getCardDispositionWrapper(actor, options.token, options.userId, spellHtml);
    }
    return spellHtml;
  }

  // If this roll is damage from a save spell, render Dice Stuff's exact spell save layout
  if (parsedRoll.rollType === "damage" && options.saveInfo?.isSaveSpell) {
    const saveHtml = buildDdbSpellSaveCardHtml(parsedRoll, actor, options.matchingItem, options.saveInfo, options);
    if (typeof getCardDispositionWrapper === "function") {
      return getCardDispositionWrapper(actor, options.token, options.userId, saveHtml);
    }
    return saveHtml;
  }

  // If this roll is healing, render Dice Stuff's exact green healing card layout
  if (parsedRoll.rollType === "heal") {
    const healHtml = buildDdbSpellHealCardHtml(parsedRoll, actor, options.matchingItem, options);
    if (typeof getCardDispositionWrapper === "function") {
      return getCardDispositionWrapper(actor, options.token, options.userId, healHtml);
    }
    return healHtml;
  }

  const actorName = escapeHtml(actor?.name || parsedRoll.characterName);
  const actionName = escapeHtml(parsedRoll.actionName);

  // Tags
  const tags = [];
  const isSpellItem = options.matchingItem?.type === "spell";
  if (parsedRoll.rollType === "attack") {
    if (isSpellItem) {
      tags.push('<span style="background: rgba(147, 51, 234, 0.15); border: 1px solid rgba(147, 51, 234, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #7c3aed;">Spell Attack</span>');
      const spellLvl = Number(options.matchingItem.system?.level ?? 0);
      const lvlStr = spellLvl === 0 ? "Cantrip" : `${spellLvl}${spellLvl === 1 ? "st" : spellLvl === 2 ? "nd" : spellLvl === 3 ? "rd" : "th"}-Level`;
      const school = options.matchingItem.system?.school;
      const schoolStr = typeof CONFIG !== "undefined" && CONFIG?.DND5E?.spellSchools?.[school]?.label
        ? CONFIG.DND5E.spellSchools[school].label
        : (school ? school.charAt(0).toUpperCase() + school.slice(1) : "");
      tags.push(`<span style="background: rgba(108, 117, 125, 0.15); border: 1px solid rgba(108, 117, 125, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #495057;">${escapeHtml(lvlStr + (schoolStr ? ` ${schoolStr}` : ""))}</span>`);
    } else {
      tags.push('<span style="background: rgba(114, 137, 218, 0.15); border: 1px solid rgba(114, 137, 218, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #4b5d88;">Attack Roll</span>');
    }
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
  } else if (parsedRoll.rollType === "other") {
    tags.push('<span style="background: rgba(108, 117, 125, 0.15); border: 1px solid rgba(108, 117, 125, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #495057;">Dice Roll</span>');
  }

  if (parsedRoll.rollMode === "advantage") {
    tags.push('<span style="background: rgba(40, 167, 69, 0.15); border: 1px solid rgba(40, 167, 69, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #28a745;">Advantage</span>');
  } else if (parsedRoll.rollMode === "disadvantage") {
    tags.push('<span style="background: rgba(220, 53, 69, 0.15); border: 1px solid rgba(220, 53, 69, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #dc3545;">Disadvantage</span>');
  }

  // Dual D20 rolls (Roll 1 from DDB, Roll 2 companion roll or second DDB die)
  const d20_1 = Number(parsedRoll.keptD20 ?? parsedRoll.d20Values?.[0] ?? parsedRoll.total);
  const d20_2 = Number(options.d20_2 ?? parsedRoll.d20Values?.[1] ?? (parsedRoll.rollMode === "advantage" ? 18 : 12));
  const total1 = Number(options.total1 ?? parsedRoll.total);
  const total2 = Number(options.total2 ?? (d20_2 + parsedRoll.modifier));

  const isAttack = parsedRoll.rollType === "attack";
  const isCrit = Boolean(options.isCrit ?? parsedRoll.isCrit ?? (isAttack && (d20_1 === 20 || d20_2 === 20)));
  const isFumble = Boolean(parsedRoll.isFumble ?? (isAttack && d20_1 === 1 && d20_2 === 1));

  if (isCrit) {
    tags.push('<span style="background: rgba(40, 167, 69, 0.2); border: 1px solid rgba(40, 167, 69, 0.5); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 700; color: #1e7e34;">Critical Hit!</span>');
  } else if (isFumble) {
    tags.push('<span style="background: rgba(220, 53, 69, 0.2); border: 1px solid rgba(220, 53, 69, 0.5); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 700; color: #dc3545;">Critical Miss</span>');
  }

  tags.push('<span style="background: rgba(108, 117, 125, 0.15); border: 1px solid rgba(108, 117, 125, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #495057;">DDB</span>');

  const tagsBlock = tags.length > 0
    ? `<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px;">${tags.join("")}</div>`
    : "";

  const critClass1 = d20_1 === 20 ? " critical" : d20_1 === 1 ? " fumble" : "";
  const critClass2 = d20_2 === 20 ? " critical" : d20_2 === 1 ? " fumble" : "";

  const rollBox1 = options.rollHtml1 || `
    <div class="dice-roll">
      <div class="dice-result">
        <div class="dice-formula">${escapeHtml(parsedRoll.formula)}</div>
        <div class="dice-tooltip">
          <section class="tooltip-part">
            <div class="dice">
              <header class="part-header flexrow">
                <span class="part-formula">${escapeHtml(parsedRoll.formula.replace(/\s*[+-].*$/, "").trim())}</span>
                <span class="part-total">${d20_1}</span>
              </header>
              <ol class="dice-rolls">
                <li class="roll die d20${critClass1}">${d20_1}</li>
              </ol>
            </div>
          </section>
        </div>
        <h4 class="dice-total${critClass1}">${total1}</h4>
      </div>
    </div>
  `;

  const rollBox2 = options.rollHtml2 || `
    <div class="dice-roll">
      <div class="dice-result">
        <div class="dice-formula">${escapeHtml(parsedRoll.formula)}</div>
        <div class="dice-tooltip">
          <section class="tooltip-part">
            <div class="dice">
              <header class="part-header flexrow">
                <span class="part-formula">${escapeHtml(parsedRoll.formula.replace(/\s*[+-].*$/, "").trim())}</span>
                <span class="part-total">${d20_2}</span>
              </header>
              <ol class="dice-rolls">
                <li class="roll die d20${critClass2}">${d20_2}</li>
              </ol>
            </div>
          </section>
        </div>
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
    const diceList = Array.isArray(dmg.diceResults) && dmg.diceResults.length > 0 ? dmg.diceResults : [];
    const baseDieTotal = dmg.baseDiceTotal ?? dmg.total;
    const mod = dmg.damageMod ?? 0;
    const modSign = mod >= 0 ? "+" : "";
    const dicePart = (dmg.evalFormula || dmg.formula).replace(/\s*[+-].*$/, "").trim();
    const displayDmgHeader = dmg.numericFormula || formatNumericFormula(dmg.formula, mod);

    damageSectionHtml = `
      <p style="text-align: center; font-weight: bold; margin: 5px 0;">Normal Damage (${escapeHtml(displayDmgHeader)})</p>
      <div style="display: flex; justify-content: center; text-align: center; font-size: 0.9em; margin-top: 5px;">
        <div style="padding: 5px; border: 1px solid #ccc; border-radius: 4px; background-color: #f8f9fa; min-width: 140px;">
          <p style="margin: 0; font-weight: 600; font-size: 0.9em;">Results (${escapeHtml(dicePart)})</p>
          <span style="font-weight: bold; font-size: 1.5em;">${baseDieTotal}</span>
          ${diceList.length > 0 ? `<p style="margin: 2px 0 0; font-size: 0.8em; color: #555;">Dice: [${diceList.join(", ")}]</p>` : ""}
        </div>
      </div>
      <p style="text-align: center; font-weight: 500; font-size: 0.9em; margin: 5px 0 0;">Damage Mods = ${modSign}${mod}</p>
      <hr style="margin: 5px 0 5px; border-top: 1px solid #ddd;">
      <div style="display: flex; justify-content: space-around; text-align: center; font-weight: bold; font-size: 1em;">
        <p style="margin: 0; flex: 1; ${isCrit ? "border-right: 1px solid #ddd;" : ""} padding: 0 5px;">Damage Total: <span style="font-size: 1.2em; font-weight: bold;">${dmg.normalTotal ?? dmg.total}</span></p>
        ${isCrit ? `<p style="margin: 0; flex: 1; padding: 0 5px;">Critical Total: <span style="font-size: 1.2em; font-weight: bold; color: #18520b;">${dmg.criticalTotal ?? dmg.total}</span></p>` : ""}
      </div>
      <hr style="margin: 5px 0 0; border-top: 2px solid #343a40;">
    `;
  } else if (parsedRoll.rollType === "attack" && actor && options.matchingItem) {
    const itemId = escapeHtml(options.matchingItem.id);
    const actorId = escapeHtml(actor.id);
    const critAttr = isCrit ? "true" : "false";
    damageSectionHtml = `
      <div style="display: flex; gap: 6px; margin: 6px 0;">
        <button type="button" class="cheapdice-ddb-roll-damage" data-actor-id="${actorId}" data-item-id="${itemId}" data-is-crit="${critAttr}"
          style="flex: 1; height: 28px; line-height: 26px; font-size: 0.82em; font-weight: 700; border-radius: 4px; border: 1px solid #7289da; background: #fff; color: #4b5d88; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px;">
          <i class="fas fa-burst" style="color: #7289da;"></i> ${isCrit ? "Roll Crit Damage" : "Roll Damage"}
        </button>
      </div>`;
  }

  // Collapsible Modifier Breakdown
  let breakdownHtml = "";
  if (parsedRoll.rollType === "attack") {
    breakdownHtml = `
      <details style="padding: 0 5px; margin-top: 6px;">
        <summary style="font-weight: 600; font-size: 1em; text-decoration: underline; margin: 5px 0; cursor: pointer;">
          <strong>Attack/Damage Breakdown</strong>
        </summary>
        <div style="padding-top: 5px; border-top: 1px solid #ccc; font-size: 0.95em; line-height: 1.4;">
          <p style="font-weight: 500; font-size: 0.95em; margin: 5px 0;"><strong>Attack: ${modDisplay}</strong></p>
          <ul style="margin: 0 0 5px; padding-left: 15px; font-size: 0.95em; line-height: 1.4;">
            <li style="list-style-type: disc;">Source: <strong>D&amp;D Beyond Game Log</strong></li>
            <li style="list-style-type: disc;">DDB Formula: <strong><code>${escapeHtml(parsedRoll.formula)}</code></strong></li>
            <li style="list-style-type: disc;">Modifier: <strong>${modDisplay}</strong></li>
            <li style="list-style-type: disc;">DDB Result: <strong>${escapeHtml(parsedRoll.resultText)}</strong> = <strong>${parsedRoll.total}</strong></li>
          </ul>
          ${options.damage ? `
          <p style="font-weight: 500; font-size: 0.95em; margin: 5px 0;"><strong>${isSpellItem ? "Spell" : "Damage"} Formula: ${escapeHtml(options.damage.formula)}</strong></p>
          <ul style="margin: 0 0 5px; padding-left: 15px; font-size: 0.95em; line-height: 1.4;">
            <li style="list-style-type: disc;">Base ${isSpellItem ? "Spell" : "Damage"} Dice: <strong>${escapeHtml(options.damage.numericFormula || formatNumericFormula(options.damage.formula, options.damage.damageMod))}</strong></li>
            <li style="list-style-type: disc;">Damage Mods: <strong>${options.damage.damageMod >= 0 ? "+" : ""}${options.damage.damageMod ?? 0}</strong></li>
            <li style="list-style-type: disc;">Damage Total: <strong>${options.damage.normalTotal ?? options.damage.total}</strong></li>
          </ul>
          ${(options.damage.isCrit || isCrit) ? `
          <p style="font-weight: 500; font-size: 0.95em; margin: 5px 0;"><strong>Critical Bonus: +${options.damage.critBonus ?? 0}</strong></p>
          <ul style="margin: 0 0 5px; padding-left: 15px; list-style-type: disc; font-size: 0.9em; line-height: 1.4;">
            <li style="list-style-type: disc;">${isSpellItem ? "Spell" : "Weapon"} Dice (${escapeHtml(options.damage.formula.replace(/\s*[+-].*$/, "").trim())} Max): <strong>+${options.damage.critBonus ?? 0}</strong></li>
            <li style="list-style-type: disc;">Critical Total: <strong style="color: #18520b;">${options.damage.criticalTotal ?? options.damage.total}</strong></li>
          </ul>` : ""}` : ""}
        </div>
      </details>
    `;
  } else if (parsedRoll.rollType === "damage") {
    // Damage-only breakdown
    breakdownHtml = `
      <details style="margin-top: 6px; padding: 2px 4px;">
        <summary style="font-weight: 600; font-size: 0.82em; color: #666; cursor: pointer;">Damage Breakdown</summary>
        <div style="padding-top: 4px; border-top: 1px solid #e0e0e0; font-size: 0.8em; color: #555; margin-top: 3px; line-height: 1.45;">
          <div><strong>Base Formula:</strong> <code>${escapeHtml(parsedRoll.formula)}</code></div>
          <div><strong>Modifier:</strong> ${modDisplay}</div>
          <div><strong>Raw Result:</strong> ${escapeHtml(parsedRoll.resultText)} = <strong>${parsedRoll.total}</strong></div>
        </div>
      </details>
    `;
  } else {
    // Matches Dice Stuff runD20TestRoll modifier breakdown
    breakdownHtml = `
      <details style="margin-top: 6px; padding: 2px 4px;">
        <summary style="font-weight: 600; font-size: 0.82em; color: #666; cursor: pointer;">Modifier Breakdown</summary>
        <div style="padding-top: 4px; border-top: 1px solid #e0e0e0; font-size: 0.8em; color: #555; margin-top: 3px; line-height: 1.45;">
          <div><strong>Base Modifier:</strong> ${modDisplay}</div>
          <div><strong>Base Formula:</strong> <code>${escapeHtml(parsedRoll.formula)}</code></div>
          <div><strong>DDB Result:</strong> ${escapeHtml(parsedRoll.resultText)} = <strong>${parsedRoll.total}</strong></div>
        </div>
      </details>
    `;
  }

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
  } else if (parsedRoll.rollType === "damage") {
    // Dedicated Damage-Only Card Layout (Single damage roll box, no D20s)
    innerCardHtml = `
      <div style="font-family: inherit; color: #333;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #343a40; padding-bottom: 3px; margin-bottom: 6px;">
          <span style="font-size: 1.05em; font-weight: bold; color: #2b3a4a;">${actionName}</span>
          <span style="font-size: 0.8em; color: #777;">${actorName}</span>
        </div>
        ${tagsBlock}
        <div style="margin: 6px 0; text-align: center;">
          <div style="transform: scale(0.96); margin: -2px 0;">${rollBox1}</div>
        </div>
        <div style="display: flex; justify-content: space-around; text-align: center; font-weight: bold; font-size: 1em; margin: 4px 0 6px;">
          <p style="margin: 0; flex: 1; padding: 0 5px;">Damage Total: <span style="font-size: 1.25em; font-weight: bold;">${total1}</span></p>
        </div>
        ${breakdownHtml}
      </div>
    `;
  } else if (parsedRoll.rollType === "other") {
    // Dedicated Single-Roll Card Layout for manual dice tray rolls (No companion d20)
    innerCardHtml = `
      <div style="font-family: inherit; color: #333;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #343a40; padding-bottom: 3px; margin-bottom: 6px;">
          <span style="font-size: 1.05em; font-weight: bold; color: #2b3a4a;">${actionName}</span>
          <span style="font-size: 0.8em; color: #777;">${actorName}</span>
        </div>
        ${tagsBlock}
        <div style="margin: 6px 0; text-align: center;">
          <div style="transform: scale(0.96); margin: -2px 0;">${rollBox1}</div>
        </div>
        <div style="display: flex; justify-content: space-around; text-align: center; font-weight: bold; font-size: 1em; margin: 4px 0 6px;">
          <p style="margin: 0; flex: 1; padding: 0 5px;">Total: <span style="font-size: 1.25em; font-weight: bold;">${total1}</span></p>
        </div>
        ${breakdownHtml}
      </div>
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
    if (cleanProxy) {
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

    // If running in browser and token is not already a JWT (CobaltSession is not a JWT),
    // request an STT from the local Tampermonkey userscript bridge if installed.
    const isJwt = cleanToken.split(".").length === 3;
    if (!isJwt && typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
      try {
        const bridgedToken = await new Promise((resolve) => {
          let timer = null;
          const handler = (e) => {
            if (timer) clearTimeout(timer);
            window.removeEventListener("ddb:response-stt", handler);
            if (e?.detail?.success && e?.detail?.stt) {
              resolve(e.detail.stt);
            } else {
              resolve(null);
            }
          };
          window.addEventListener("ddb:response-stt", handler);
          window.dispatchEvent(new CustomEvent("ddb:request-stt", {
            detail: { cobaltSession: cleanToken }
          }));
          timer = setTimeout(() => {
            window.removeEventListener("ddb:response-stt", handler);
            resolve(null);
          }, 3000);
        });

        if (bridgedToken) {
          return bridgedToken;
        }
      } catch (err) {
        console.warn(`[${MODULE_ID}] Tampermonkey bridge attempt failed:`, err);
      }
    }

    return cleanToken;
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
        console.log(`[${MODULE_ID}] DDB WebSocket packet received:`, event.data);
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
    try {
      const parsed = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
      if (parsed?.eventType === "character-sheet/character-update/fulfilled" && (parsed.entityId || parsed.data?.characterId)) {
        const charId = String(parsed.entityId || parsed.data?.characterId);
        const now = Date.now();
        this._lastAutoSync = this._lastAutoSync || new Map();
        const prev = this._lastAutoSync.get(charId) || 0;
        if (verifiedDdbSyncChars.has(charId)) {
          const matchingActor = matchDdbActor("", charId);
          const syncSlots = Boolean(matchingActor?.getFlag?.(MODULE_ID, FLAGS.DDB_SPELL_SLOTS_ENABLED));
          const syncHp = Boolean(matchingActor?.getFlag?.(MODULE_ID, FLAGS.DDB_HP_ENABLED));
          if (syncSlots || syncHp) {
            this._autoSyncTimers = this._autoSyncTimers || new Map();
            const existingTimer = this._autoSyncTimers.get(charId);
            if (existingTimer) clearTimeout(existingTimer);
            const timer = setTimeout(() => {
              this._autoSyncTimers.delete(charId);
              console.log(`[${MODULE_ID}] Live DDB character update received for ${matchingActor.name} (${charId}) -> auto-syncing (slots=${syncSlots}, hp=${syncHp}).`);
              syncDdbCharacter(matchingActor, { syncSlots, syncHp, silent: true }).catch((e) => console.warn(`[${MODULE_ID}] Auto-sync on character update failed:`, e));
            }, 2500);
            this._autoSyncTimers.set(charId, timer);
          }
        }
      }
    } catch (_err) { /* ignore non-JSON or unrelated packets */ }

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

  let requireImported = false;
  try {
    if (typeof game !== "undefined" && game.settings) {
      requireImported = Boolean(game.settings.get(MODULE_ID, SETTINGS.DDB_REQUIRE_DDB_IMPORTER));
    }
  } catch (e) {
    requireImported = false;
  }

  const isImported = Boolean(
    actor?.flags?.ddbimporter?.dndbeyond?.characterId ||
    actor?.flags?.[MODULE_ID]?.ddbCharacterId
  );

  if (requireImported && (!actor || !isImported)) {
    return null;
  }
  const token = actor?.getActiveTokens?.()[0] || null;
  const stripParens = (s) => String(s || "").replace(/\s*\([^)]*\)/g, "").trim();
  const cleanAction = String(parsedRoll.actionName || "").trim().toLowerCase();
  const cleanActionNoSpace = cleanAction.replace(/[\s\-_']/g, "");
  const cleanActionNoParen = stripParens(cleanAction);
  const cleanActionNoParenNoSpace = cleanActionNoParen.replace(/[\s\-_']/g, "");
  const isNameMatch = (candidate, allowParenFallback = true) => {
    const c = String(candidate || "").trim().toLowerCase();
    if (!c) return false;
    if (c === cleanAction || c.replace(/[\s\-_']/g, "") === cleanActionNoSpace) return true;
    if (!allowParenFallback) return false;
    const cNoParen = stripParens(c);
    return cNoParen === cleanActionNoParen || cNoParen.replace(/[\s\-_']/g, "") === cleanActionNoParenNoSpace;
  };
  const matchingItem = actor?.items?.find((i) => isNameMatch(i.name, false))
    || actor?.items?.find((i) => isNameMatch(i.name, true))
    || null;

  const isManualTrayRoll = parsedRoll.rollType === "other"
    || ["roll", "manual roll", "dice roll"].includes(String(parsedRoll.actionName || "").toLowerCase().trim());
  const isDamageOnly = parsedRoll.rollType === "damage" || parsedRoll.rollType === "heal";
  const isSingleRoll = isManualTrayRoll || isDamageOnly;

  // Resolve d20 values for dual-box layout
  const d20_1 = Number(parsedRoll.keptD20 ?? parsedRoll.d20Values?.[0] ?? (parsedRoll.total - parsedRoll.modifier));
  let d20_2 = Math.floor(Math.random() * 20) + 1;
  if (parsedRoll.d20Values?.length > 1) {
    // When DDB rolls multiple d20s (advantage / disadvantage), find the non-kept die for d20_2
    const keptIdx = parsedRoll.d20Values.indexOf(d20_1);
    let otherIdx = -1;
    if (keptIdx !== -1) {
      otherIdx = parsedRoll.d20Values.findIndex((v, idx) => idx !== keptIdx);
    }
    d20_2 = otherIdx !== -1 ? parsedRoll.d20Values[otherIdx] : parsedRoll.d20Values[1];
  }

  const total1 = isSingleRoll ? Number(parsedRoll.total) : (d20_1 + parsedRoll.modifier);
  const total2 = d20_2 + parsedRoll.modifier;
  const isAttackCrit = parsedRoll.rollType === "attack" && (Boolean(parsedRoll.isCrit) || d20_1 === 20 || d20_2 === 20);

  // Hijack DDB attack, spell, heal, and save-spell damage rolls into Dice Stuff's full execution engine if a matching config or quick macro exists
  if ((parsedRoll.rollType === "attack" || parsedRoll.rollType === "spell" || parsedRoll.rollType === "damage" || parsedRoll.rollType === "heal") && actor && cleanAction && typeof globalThis !== "undefined" && globalThis.attackSocket) {
    const quickMacroProfiles = (typeof window !== "undefined" && window.CustomRolls?.getProfileData?.(actor, "quickMacroProfiles"))
      || actor?.getFlag?.("world", "quickMacroProfiles")
      || {};
    const attackConfigs = (typeof window !== "undefined" && window.CustomRolls?.getProfileData?.(actor, "attackConfigs"))
      || actor?.getFlag?.("world", "attackConfigs")
      || {};
    const spellConfigs = (typeof window !== "undefined" && window.CustomRolls?.getProfileData?.(actor, "spellConfigs"))
      || actor?.getFlag?.("world", "spellConfigs")
      || {};

    const actorIdPrefix = `${actor.id}_`.toLowerCase();
    const actorNamePrefix = `${String(actor.name || "").trim().toLowerCase()}:`;
    const findConfigMatch = (configsObj, stripActorPrefix = false) => {
      if (!configsObj || typeof configsObj !== "object") return null;
      const entries = Object.entries(configsObj);
      for (const allowParenFallback of [false, true]) {
        for (const [key, cfg] of entries) {
          if (!cfg || typeof cfg !== "object") continue;
          let kLower = String(key || "").trim().toLowerCase();
          if (stripActorPrefix && kLower.startsWith(actorIdPrefix)) {
            kLower = kLower.slice(actorIdPrefix.length);
          }
          const tLower = String(cfg.chatCardTitle || cfg.macroName || cfg.spellName || "").trim().toLowerCase();
          if (isNameMatch(kLower, allowParenFallback) || isNameMatch(tLower, allowParenFallback)) {
            return cfg;
          }
        }
      }
      return null;
    };

    // 1. Check quickMacroProfiles directly on this actor
    let matchedQuickMacro = findConfigMatch(quickMacroProfiles, true);

    // 2. Also check Foundry game.macros owned/named for this actor & action (e.g. "Longsword Everything" or "Actor: Longsword Everything")
    if (!matchedQuickMacro && typeof game !== "undefined" && game.macros) {
      const macroList = Array.from(typeof game.macros.values === "function" ? game.macros.values() : game.macros);
      const findMacro = (allowParen) => macroList.find((m) => {
        const mName = String(m?.name || "").trim().toLowerCase();
        const mStripped = mName.startsWith(actorNamePrefix) ? mName.slice(actorNamePrefix.length).trim() : mName;
        return isNameMatch(mName, allowParen) || isNameMatch(mStripped, allowParen);
      });
      const matchingMacro = findMacro(false) || findMacro(true);
      if (matchingMacro?.command) {
        const profileMatch = matchingMacro.command.match(/profiles\[["']([^"']+)["']\]/);
        if (profileMatch && quickMacroProfiles[profileMatch[1]]) {
          matchedQuickMacro = quickMacroProfiles[profileMatch[1]];
        }
      }
    }

    const matchedAttack = !matchedQuickMacro && parsedRoll.rollType !== "damage" && parsedRoll.rollType !== "heal" ? findConfigMatch(attackConfigs) : null;
    const matchedSpell = (!matchedQuickMacro && !matchedAttack) ? findConfigMatch(spellConfigs) : null;
    let matchedConfig = matchedQuickMacro || matchedAttack || matchedSpell;

    // For damage-only DDB rolls, only hijack if the matched config is a save spell (leave weapon/rider damage alone)
    if (parsedRoll.rollType === "damage" && matchedConfig && matchedConfig.resolutionMethod !== "save") {
      matchedConfig = null;
    }
    // For heal DDB rolls, only hijack if the matched config is a healing/temp_hp/max_hp spell
    if (parsedRoll.rollType === "heal" && matchedConfig && !["heal", "temp_hp", "max_hp"].includes(matchedConfig.resolutionMethod)) {
      matchedConfig = null;
    }

    // Auto-synthesize a spell config from the actor's Foundry sheet spell if not yet configured in Dice Stuff
    let matchedSheetSpell = null;
    if (!matchedConfig && matchingItem?.type === "spell") {
      const synthesized = buildSpellConfigFromItem(matchingItem, actor);
      const matchesType =
        ((parsedRoll.rollType === "attack" || parsedRoll.rollType === "spell") && synthesized.resolutionMethod === "attack")
        || (parsedRoll.rollType === "damage" && synthesized.resolutionMethod === "save")
        || (parsedRoll.rollType === "heal" && ["heal", "temp_hp", "max_hp"].includes(synthesized.resolutionMethod));
      if (matchesType) {
        matchedSheetSpell = synthesized;
        matchedConfig = synthesized;
      }
    }

    if (matchedConfig) {
      const isSpellConfig = Boolean(matchedSpell || matchedSheetSpell || (matchedQuickMacro && (matchedQuickMacro.spellName || matchedQuickMacro.resolutionMethod)));
      const handlerName = isSpellConfig ? "runSpellAttackRoll" : "runAttackRoll";
      const hijackConfig = typeof foundry !== "undefined" && foundry.utils?.deepClone
        ? foundry.utils.deepClone(matchedConfig)
        : JSON.parse(JSON.stringify(matchedConfig));
      hijackConfig.isDdbHijacked = true;

      if (isSpellConfig) {
        const baseLevel = Number(hijackConfig.baseLevel ?? matchingItem?.system?.level ?? 0) || 0;
        let resolvedCastLevel = resolveDdbCastLevel(parsedRoll, hijackConfig, matchingItem);
        if (
          (parsedRoll.rollType === "attack" || parsedRoll.rollType === "spell")
          && baseLevel > 0
          && resolvedCastLevel === baseLevel
          && !parsedRoll.castLevel
          && !parsedRoll.spellLevel
        ) {
          resolvedCastLevel = await promptDdbAttackCastLevel(actor, hijackConfig, baseLevel);
        }
        hijackConfig.castLevel = resolvedCastLevel;
        if (resolvedCastLevel > baseLevel) {
          delete hijackConfig.effectiveAttacks;
        }
        if (
          (parsedRoll.rollType === "damage" || parsedRoll.rollType === "heal")
          && resolvedCastLevel > baseLevel
        ) {
          const ddbDiceCount = Array.isArray(parsedRoll.dice)
            ? parsedRoll.dice.filter((d) => !d.dropped).length
            : 0;
          if (ddbDiceCount > (Number(hijackConfig.damageDiceCount) || 0)) {
            hijackConfig.damageDiceCount = ddbDiceCount;
          }
        }
      }

      if (parsedRoll.rollType === "damage" || parsedRoll.rollType === "heal") {
        if (Array.isArray(parsedRoll.dice) && parsedRoll.dice.length > 0) {
          hijackConfig.injectedDamageDice = parsedRoll.dice;
        }
        if (Number.isFinite(Number(parsedRoll.total))) {
          hijackConfig.injectedDamageTotal = Number(parsedRoll.total);
        }
      } else {
        if (Number.isFinite(d20_1) && d20_1 >= 1 && d20_1 <= 20) {
          hijackConfig.injectedD20_1 = d20_1;
        }
        if (parsedRoll.d20Values?.length > 1 && Number.isFinite(d20_2) && d20_2 >= 1 && d20_2 <= 20) {
          hijackConfig.injectedD20_2 = d20_2;
        }
      }

      const ownerUser = typeof game !== "undefined" && game.users?.find?.(
        (u) => !u.isGM && u.active && actor.testUserPermission?.(u, "OWNER")
      );
      const rollUserId = (ownerUser?.targets?.size > 0 ? ownerUser.id : null)
        || (typeof game !== "undefined" ? game.user?.id : null);

      // For base attackConfigs (not pre-baked quickMacroProfiles), activate saved bells & whistles
      if (matchedAttack) {
        if (Array.isArray(hijackConfig.additionalDamageComponents)) {
          hijackConfig.additionalDamageComponents = hijackConfig.additionalDamageComponents.map((comp) =>
            comp && comp.formula ? { ...comp, isActive: true } : comp
          );
        }
        if (hijackConfig.isVersatile) {
          const vDie = hijackConfig.versatileDie || "10";
          hijackConfig.damageDieSize = `d${vDie}`;
        }
        if (hijackConfig.hasGWM) {
          hijackConfig.attackCircumstanceModifier = (Number(hijackConfig.attackCircumstanceModifier) || 0) - 5;
          hijackConfig.damageModifier = (Number(hijackConfig.damageModifier) || 0) + 10;
        }
        if (hijackConfig.hasSavageAttacker) {
          hijackConfig.isSavageAttackerActive = true;
        }
        if (hijackConfig.hasPiercer) {
          hijackConfig.isPiercerActive = true;
        }
        if (hijackConfig.hasSaveRider) {
          hijackConfig.isSaveRiderActive = true;
        }
        if (hijackConfig.hasExtraAttackAbility && hijackConfig.extraAttackAbility) {
          const abil = hijackConfig.extraAttackAbility;
          hijackConfig.secondaryAbilityMod = Number(actor.system?.abilities?.[abil]?.mod) || 0;
          hijackConfig.secondaryAbilityKey = abil;
          hijackConfig.secondaryAbilityLabel = hijackConfig.extraAttackAbilityLabel;
        }
        if (hijackConfig.hasExtraDamageAbility && hijackConfig.extraDamageAbility) {
          const abil = hijackConfig.extraDamageAbility;
          hijackConfig.secondaryDamageAbilityMod = Number(actor.system?.abilities?.[abil]?.mod) || 0;
          hijackConfig.secondaryDamageAbilityKey = abil;
          hijackConfig.secondaryDamageAbilityLabel = hijackConfig.extraDamageAbilityLabel;
        }
      }

      console.log(`[${MODULE_ID}] Hijacking DDB attack "${parsedRoll.actionName}" -> ${handlerName} (d20: ${d20_1}${hijackConfig.injectedD20_2 ? `, ${hijackConfig.injectedD20_2}` : ""})`);
      await globalThis.attackSocket.executeAsGM(handlerName, hijackConfig, actor.id, rollUserId);
      return { hijacked: true, handler: handlerName, actorId: actor.id, actionName: parsedRoll.actionName };
    }
  }

  // Auto-roll damage for attacks if matching item exists (for card display, without pushing to 3D dice)
  let damageData = null;
  const finalRolls = [];

  let evaluatedRoll1 = null;
  let evaluatedRoll2 = null;
  try {
    if (typeof Roll !== "undefined") {
      if (isSingleRoll) {
        // Single roll mode: Damage or Manual Dice Tray
        evaluatedRoll1 = await new Roll(parsedRoll.formula).evaluate();
        let dieIndex = 0;
        for (const term of evaluatedRoll1.terms || []) {
          if (Array.isArray(term.results)) {
            for (const res of term.results) {
              if (parsedRoll.dice && parsedRoll.dice[dieIndex] !== undefined) {
                const ddbDie = parsedRoll.dice[dieIndex];
                res.result = Number(ddbDie.dieValue);
                if (ddbDie.dropped !== undefined) {
                  res.active = !ddbDie.dropped;
                }
                dieIndex++;
              }
            }
          }
        }
        evaluatedRoll1._total = Number(parsedRoll.total);
        finalRolls.push(evaluatedRoll1);
      } else {
        // D20 Test Mode (Attack, Check, Skill, Save, Initiative)
        // Each box in the card represents a single 1d20 test roll
        const modStr = parsedRoll.modifier > 0
          ? ` + ${parsedRoll.modifier}`
          : parsedRoll.modifier < 0
            ? ` - ${Math.abs(parsedRoll.modifier)}`
            : "";
        const singleD20Formula = `1d20${modStr}`;

        // Primary roll (Box 1)
        evaluatedRoll1 = await new Roll(singleD20Formula).evaluate();
        const d20Term1 = evaluatedRoll1.terms?.find(
          (t) => t.faces === 20 || (typeof Die !== "undefined" && t instanceof Die)
        );
        if (d20Term1 && Array.isArray(d20Term1.results) && d20Term1.results.length > 0) {
          d20Term1.results[0].result = d20_1;
        }
        evaluatedRoll1._total = total1;
        finalRolls.push(evaluatedRoll1);

        // Companion roll (Box 2: +/- Adv)
        evaluatedRoll2 = await new Roll(singleD20Formula).evaluate();
        const d20Term2 = evaluatedRoll2.terms?.find(
          (t) => t.faces === 20 || (typeof Die !== "undefined" && t instanceof Die)
        );
        if (d20Term2 && Array.isArray(d20Term2.results) && d20Term2.results.length > 0) {
          d20Term2.results[0].result = d20_2;
        }
        evaluatedRoll2._total = total2;
        finalRolls.push(evaluatedRoll2);
      }
    }
  } catch (err) {
    console.warn(`[${MODULE_ID}] Could not render 3D rolls for DDB:`, err);
  }

  if (parsedRoll.rollType === "attack" && matchingItem) {
    const rawDmgFormula = getItemDamageFormula(matchingItem, actor);
    if (rawDmgFormula) {
      try {
        const abilityKey = resolveItemAbility(matchingItem, actor);
        const abilityMod = actor?.system?.abilities?.[abilityKey]?.mod ?? 0;
        const rollData = typeof matchingItem.getRollData === "function"
          ? matchingItem.getRollData()
          : (typeof actor?.getRollData === "function" ? actor.getRollData() : {});
        if (rollData.mod === undefined) rollData.mod = abilityMod;

        // Evaluate base damage roll
        const dmgRoll = await new Roll(rawDmgFormula, rollData).evaluate();
        finalRolls.push(dmgRoll);

        const diceResults = dmgRoll.dice?.flatMap((d) => d.results.map((r) => r.result)) || [];
        const baseDiceTotal = dmgRoll.dice?.reduce((acc, d) => acc + d.total, 0) || dmgRoll.total;
        const damageMod = dmgRoll.total - baseDiceTotal;
        const normalTotal = dmgRoll.total;

        let criticalTotal = normalTotal;
        let critBonus = 0;
        if (isAttackCrit) {
          critBonus = parseMaxDamageFromFormula(rawDmgFormula);
          criticalTotal = normalTotal + critBonus;
        }

        let dmgRenderHtml = "";
        try {
          if (typeof dmgRoll.render === "function") {
            dmgRenderHtml = await dmgRoll.render();
          }
        } catch (e) {}

        const itemDamageType = matchingItem.system?.damage?.parts?.[0]?.[1]
          || matchingItem.system?.activities?.values?.()?.next?.()?.value?.damage?.parts?.[0]?.types?.[0]
          || "fire";

        damageData = {
          formula: rawDmgFormula,
          evalFormula: rawDmgFormula,
          numericFormula: formatNumericFormula(rawDmgFormula, abilityMod),
          total: normalTotal,
          normalTotal,
          criticalTotal,
          critBonus,
          isCrit: isAttackCrit,
          diceResults,
          baseDiceTotal,
          damageMod,
          damageType: itemDamageType,
          renderHtml: dmgRenderHtml
        };
      } catch (err) {
        console.warn(`[${MODULE_ID}] Could not evaluate attack damage:`, err);
      }
    }
  }

  let rollHtml1 = "";
  let rollHtml2 = "";
  const critClass1 = d20_1 === 20 ? " critical" : d20_1 === 1 ? " fumble" : "";
  const critClass2 = d20_2 === 20 ? " critical" : d20_2 === 1 ? " fumble" : "";

  if (evaluatedRoll1 && typeof evaluatedRoll1.render === "function") {
    try {
      rollHtml1 = await evaluatedRoll1.render();
      if (critClass1) rollHtml1 = rollHtml1.replace("dice-total", `dice-total${critClass1}`);
    } catch (e) {
      console.warn(`[${MODULE_ID}] Could not render roll 1 HTML:`, e);
    }
  }

  if (evaluatedRoll2 && typeof evaluatedRoll2.render === "function") {
    try {
      rollHtml2 = await evaluatedRoll2.render();
      if (critClass2) rollHtml2 = rollHtml2.replace("dice-total", `dice-total${critClass2}`);
    } catch (e) {
      console.warn(`[${MODULE_ID}] Could not render roll 2 HTML:`, e);
    }
  }

  const saveInfo = parsedRoll.rollType === "damage"
    ? resolveSpellSaveInfo(matchingItem, actor, parsedRoll.actionName)
    : null;

  const content = buildDdbCustomChatCardHtml(parsedRoll, actor, {
    matchingItem,
    saveInfo,
    token,
    userId: game.user?.id,
    d20_2,
    total1,
    total2,
    isCrit: isAttackCrit,
    rollHtml1,
    rollHtml2,
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

/**
 * Extracts a numeric D&D Beyond character ID from a character URL or raw ID string.
 * @param {string} urlOrId
 * @returns {string}
 */
export function extractDdbCharacterId(urlOrId) {
  const raw = String(urlOrId || "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw;
  const match = raw.match(/\/characters\/(\d+)/i);
  return match ? match[1] : "";
}

/**
 * Resolves the D&D Beyond character URL for an actor, auto-populating from DDB Importer flags if present.
 * @param {Actor} actor
 * @returns {string}
 */
export function getActorDdbCharacterUrl(actor) {
  if (!actor) return "";
  const customUrl = actor.getFlag?.(MODULE_ID, FLAGS.DDB_CHARACTER_URL);
  if (customUrl) return String(customUrl).trim();
  const ddbImporterUrl = actor.flags?.ddbimporter?.dndbeyond?.url;
  if (ddbImporterUrl) return String(ddbImporterUrl).trim();
  const ddbImporterId = actor.flags?.ddbimporter?.dndbeyond?.characterId
    || actor.flags?.[MODULE_ID]?.ddbCharacterId;
  if (ddbImporterId) return `https://www.dndbeyond.com/characters/${ddbImporterId}`;
  return "";
}

/**
 * Maps D&D Beyond character spellSlots & pactMagic data into Foundry actor.update() payload.
 * @param {Actor} actor
 * @param {object} charData
 * @returns {Record<string, number>}
 */
export function computeDdbSpellSlotUpdates(actor, charData) {
  const updates = {};
  const spells = actor?.system?.spells || {};
  const ddbSlots = Array.isArray(charData?.spellSlots) ? charData.spellSlots : [];

  for (const slot of ddbSlots) {
    const lvl = Number(slot?.level);
    if (!Number.isInteger(lvl) || lvl < 1 || lvl > 9) continue;
    const key = `spell${lvl}`;
    const existingMax = Number(spells[key]?.max) || 0;
    const ddbAvail = Number(slot?.available) || 0;
    const max = ddbAvail > 0 ? ddbAvail : existingMax;
    const used = Math.max(0, Number(slot?.used) || 0);
    const remaining = Math.max(0, max - used);
    if (ddbAvail > 0 && ddbAvail !== existingMax) {
      updates[`system.spells.${key}.max`] = ddbAvail;
    }
    updates[`system.spells.${key}.value`] = remaining;
  }

  const pactList = Array.isArray(charData?.pactMagic) ? charData.pactMagic : [];
  if (pactList.length > 0) {
    const pact = pactList.find((p) => Number(p?.available) > 0 || Number(p?.used) > 0) || pactList[0];
    if (pact) {
      const existingPactMax = Number(spells.pact?.max) || 0;
      const ddbPactAvail = Number(pact.available) || 0;
      const pactMax = ddbPactAvail > 0 ? ddbPactAvail : existingPactMax;
      const pactUsed = Math.max(0, Number(pact.used) || 0);
      const pactRemaining = Math.max(0, pactMax - pactUsed);
      if (ddbPactAvail > 0 && ddbPactAvail !== existingPactMax) {
        updates["system.spells.pact.max"] = ddbPactAvail;
      }
      updates["system.spells.pact.value"] = pactRemaining;
    }
  }

  return updates;
}

/**
 * Maps D&D Beyond character HP fields into Foundry actor.update() payload.
 * Uses Foundry's existing max HP unless DDB has overrideHitPoints set.
 * @param {Actor} actor
 * @param {object} charData
 * @returns {Record<string, number>}
 */
export function computeDdbHpUpdates(actor, charData) {
  const updates = {};
  if (!actor || !charData || typeof charData !== "object") return updates;

  const hp = actor.system?.attributes?.hp || {};
  const existingMax = Number(hp.effectiveMax ?? hp.max) || 0;
  const overrideHp = Number(charData.overrideHitPoints) || 0;
  const effectiveMax = overrideHp > 0 ? overrideHp : existingMax;

  const removed = Math.max(0, Number(charData.removedHitPoints) || 0);
  const tempHp = Math.max(0, Number(charData.temporaryHitPoints) || 0);
  const nextHp = Math.max(0, effectiveMax - removed);

  if (overrideHp > 0 && overrideHp !== Number(hp.max)) {
    updates["system.attributes.hp.max"] = overrideHp;
  }
  if (nextHp !== Number(hp.value)) {
    updates["system.attributes.hp.value"] = nextHp;
  }
  if (tempHp !== Number(hp.temp || 0)) {
    updates["system.attributes.hp.temp"] = tempHp;
  }

  return updates;
}

const verifiedDdbSyncChars = new Set();

/**
 * Fetches live character JSON from D&D Beyond for an actor using DDB Importer, proxy, or direct fetch.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {boolean} [options.silent=false]
 * @returns {Promise<object|null>}
 */
async function fetchDdbCharacterData(actor, { silent = false } = {}) {
  if (!actor) return null;
  const charUrl = getActorDdbCharacterUrl(actor);
  const characterId = extractDdbCharacterId(charUrl);
  if (!characterId) {
    if (!silent) {
      ui.notifications?.warn?.(`No D&D Beyond character URL/ID found for ${actor.name}. Configure it in GM Tools.`);
    }
    return null;
  }

  // For DDB character proxy, prefer dedicated CobaltSession cookie, then ddb-importer's cookie, then non-JWT Dice Stuff token
  let cobalt = "";
  try {
    cobalt = String(game.settings.get(MODULE_ID, SETTINGS.DDB_COBALT_COOKIE) || "").trim();
  } catch (e) { /* ignore */ }
  if (!cobalt) {
    try {
      cobalt = String(game.settings.get("ddb-importer", "cobalt-cookie") || "").trim();
    } catch (e) { /* ignore */ }
  }
  if (!cobalt) {
    try {
      const dsToken = String(game.settings.get(MODULE_ID, SETTINGS.DDB_COBALT_TOKEN) || "").trim();
      // Only use Dice Stuff token as CobaltSession if it is not a short-term JWT (eyJ...)
      if (dsToken && !dsToken.startsWith("eyJ")) {
        cobalt = dsToken;
      }
    } catch (e) { /* ignore */ }
  }
  // Strip "CobaltSession=" prefix or surrounding quotes if pasted with key
  cobalt = cobalt.replace(/^["']|["']$/g, "");
  if (cobalt.toLowerCase().startsWith("cobaltsession=")) {
    cobalt = cobalt.slice(14).trim();
  }
  console.log(`[${MODULE_ID}] Syncing DDB character ${characterId} (cobalt present: ${Boolean(cobalt)}, length: ${cobalt.length})`);

  let customProxy = "";
  try {
    customProxy = String(game.settings.get(MODULE_ID, SETTINGS.DDB_PROXY_URL) || "").trim();
  } catch (e) { /* ignore */ }

  const proxyCandidates = [];
  if (customProxy) {
    proxyCandidates.push(customProxy.replace(/\/+$/, ""));
  }

  try {
    if (game.modules.get("ddb-importer")?.active) {
      const isCustomProxy = Boolean(game.settings.get("ddb-importer", "custom-proxy"));
      const importerEndpoint = String(game.settings.get("ddb-importer", "api-endpoint") || "").trim().replace(/\/+$/, "");
      if (isCustomProxy && importerEndpoint) {
        proxyCandidates.push(importerEndpoint);
      }
      proxyCandidates.push("https://proxy.ddb.mrprimate.co.uk");
    }
  } catch (e) { /* ignore */ }

  // Generic fallback public proxy candidate if not already present
  if (!proxyCandidates.includes("https://proxy.ddb.mrprimate.co.uk")) {
    proxyCandidates.push("https://proxy.ddb.mrprimate.co.uk");
  }

  let charJson = null;
  let lastError = null;

  const extractCharData = (payload) => {
    if (!payload || typeof payload !== "object") return null;
    if (Array.isArray(payload.spellSlots)) return payload;
    if (payload.data && Array.isArray(payload.data.spellSlots)) return payload.data;
    if (payload.character && Array.isArray(payload.character.spellSlots)) return payload.character;
    if (payload.data?.character && Array.isArray(payload.data.character.spellSlots)) return payload.data.character;
    return null;
  };

  // Strategy 0: Use installed ddb-importer's native DDBCharacter fetcher (handles proxy & auth natively)
  try {
    const ddbiLib = game.modules?.get?.("ddb-importer")?.api?.lib;
    if (ddbiLib?.DDBCharacter) {
      const ddbChar = new ddbiLib.DDBCharacter({ currentActor: actor, characterId });
      let fetched = null;
      if (typeof ddbChar.getCharacterData === "function") {
        try {
          fetched = await ddbChar.getCharacterData({ syncId: Date.now() });
        } catch (_e) {
          fetched = await ddbChar.getCharacterData();
        }
      }
      const candidate = ddbChar?.source?.ddb || fetched;
      const extracted = extractCharData(candidate);
      if (extracted) {
        charJson = extracted;
      }
    }
  } catch (err) {
    console.warn(`[${MODULE_ID}] ddb-importer DDBCharacter fetch failed:`, err);
    lastError = err;
  }

  // Strategy 1: Iterate proxy candidates
  if (!charJson) {
    for (const base of proxyCandidates) {
    if (charJson) break;
    try {
      const payload = { characterId: Number(characterId) || characterId };
      if (cobalt) payload.cobalt = cobalt;
      const res = await fetch(`${base}/proxy/character`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        const extracted = extractCharData(json);
        if (extracted) {
          charJson = extracted;
          break;
        }
        console.warn(`[${MODULE_ID}] Proxy ${base} returned 200 without character spellSlots:`, json);
        lastError = new Error(json?.message || json?.error || `${base} returned unexpected payload`);
      } else {
        console.warn(`[${MODULE_ID}] Proxy ${base} returned HTTP ${res.status}:`, json);
        lastError = new Error(json?.message || `${base} returned HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn(`[${MODULE_ID}] Proxy ${base} fetch error:`, err);
      lastError = err;
    }
    }
  }

  // Strategy 2: Direct fetch fallback (works in Electron / Foundry Desktop app without browser CORS)
  if (!charJson) {
    try {
      const res = await fetch(`https://character-service.dndbeyond.com/character/v5/character/${characterId}`);
      if (res.ok) {
        const json = await res.json();
        const extracted = extractCharData(json);
        if (extracted) {
          charJson = extracted;
        }
      }
    } catch (err) {
      if (!lastError) lastError = err;
    }
  }

  if (!charJson) {
    console.warn(`[${MODULE_ID}] Failed to sync DDB character for ${actor.name}:`, lastError);
    if (!silent) {
      const msg = String(lastError?.message || "");
      ui.notifications?.error?.(`Failed to sync D&D Beyond data for ${actor.name}: ${msg || "Check DDB proxy / Cobalt cookie."}`);
    }
    return null;
  }

  verifiedDdbSyncChars.add(String(characterId));
  return charJson;
}

/**
 * Fetches live character data from D&D Beyond and updates spell slots and/or HP on the Foundry actor.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {boolean} [options.syncSlots=false]
 * @param {boolean} [options.syncHp=false]
 * @param {boolean} [options.silent=false]
 * @returns {Promise<boolean>}
 */
export async function syncDdbCharacter(actor, { syncSlots = false, syncHp = false, silent = false } = {}) {
  const charJson = await fetchDdbCharacterData(actor, { silent });
  if (!charJson) return false;

  const updates = {};
  if (syncSlots) {
    Object.assign(updates, computeDdbSpellSlotUpdates(actor, charJson));
  }
  if (syncHp) {
    Object.assign(updates, computeDdbHpUpdates(actor, charJson));
  }

  console.log(`[${MODULE_ID}] DDB updates for ${actor.name}:`, updates);
  if (Object.keys(updates).length > 0) {
    await actor.update(updates);
  }
  if (!silent) {
    const label = syncSlots && syncHp ? "character data" : (syncHp ? "HP" : "spell slots");
    ui.notifications?.info?.(`Synced ${label} from D&D Beyond for ${actor.name}.`);
  }
  return true;
}

/**
 * Fetches live spell slot usage from D&D Beyond for an actor and updates the Foundry actor sheet.
 * @param {Actor} actor
 * @param {object} [options]
 * @returns {Promise<boolean>}
 */
export async function syncDdbSpellSlots(actor, { silent = false } = {}) {
  return syncDdbCharacter(actor, { syncSlots: true, syncHp: false, silent });
}

/**
 * Fetches live HP & Temp HP from D&D Beyond for an actor and updates the Foundry actor sheet.
 * @param {Actor} actor
 * @param {object} [options]
 * @returns {Promise<boolean>}
 */
export async function syncDdbHp(actor, { silent = false } = {}) {
  return syncDdbCharacter(actor, { syncSlots: false, syncHp: true, silent });
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
    syncSpellSlots: (actor) => syncDdbSpellSlots(actor),
    syncHp: (actor) => syncDdbHp(actor),
    syncCharacter: (actor, opts) => syncDdbCharacter(actor, opts),
    getActorDdbUrl: (actor) => getActorDdbCharacterUrl(actor),
    extractCharacterId: (urlOrId) => extractDdbCharacterId(urlOrId),
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
