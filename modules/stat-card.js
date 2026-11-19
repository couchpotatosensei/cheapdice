// =============================================================================
// STAT CARD MODULE
// Generates chat cards for selected tokens and handles custom attack rolls
// =============================================================================

import { MODULE_ID } from "../src/constants.js";

const FULL_ABILITY_NAMES = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma"
};

const SIZE_MAP = {
  tiny: "Tiny",
  sm: "Small",
  med: "Medium",
  lg: "Large",
  huge: "Huge",
  grg: "Gargantuan"
};

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const VISIBLE_ATTACK_LIMIT = 5;
const STYLE_ELEMENT_ID = "cd-stat-card-styles";

const STAT_CARD_CSS = `
.cd-stat-card {
  border: 1.5px solid var(--cd-border, #475569);
  border-radius: 6px;
  overflow: hidden;
  background: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  box-shadow: 0 0 8px 1px var(--cd-glow, rgba(71, 85, 105, 0.15)), 0 1px 3px rgba(0, 0, 0, 0.1);
}
.cd-sc-header {
  background: var(--cd-header-bg, #1e293b);
  color: #f8fafc;
  padding: 6px 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cd-sc-name {
  font-size: 1.05em;
  font-weight: bold;
  letter-spacing: 0.3px;
}
.cd-sc-subtitle {
  font-size: 0.75em;
  color: #cbd5e1;
  font-style: italic;
}
.cd-sc-meta {
  text-align: right;
  font-size: 0.75em;
  color: #cbd5e1;
  line-height: 1.3;
}
.cd-sc-vitals {
  display: grid;
  grid-template-columns: 0.9fr 1.2fr 1.1fr 0.8fr;
  gap: 4px;
  padding: 6px 8px;
  background: #e2e8f0;
  border-bottom: 1px solid #cbd5e1;
  text-align: center;
}
.cd-sc-vital-box {
  background: #fff;
  padding: 3px 2px;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
}
.cd-sc-vital-label {
  font-size: 0.62em;
  color: #64748b;
  display: block;
  font-weight: bold;
}
.cd-sc-vital-val {
  font-size: 1.05em;
  font-weight: bold;
  color: #0f172a;
}
.cd-sc-vital-val--sm {
  font-size: 0.85em;
}
.cd-sc-abilities {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 3px;
  padding: 6px 8px;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
}
.cd-sc-ability-box {
  text-align: center;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 3px 1px;
}
.cd-sc-ability-label {
  font-size: 0.7em;
  font-weight: bold;
  color: #344155;
  text-transform: uppercase;
}
.cd-sc-ability-score {
  font-size: 1.1em;
  font-weight: 800;
  color: #000;
  line-height: 1.15;
}
.cd-sc-ability-mod {
  font-size: 0.75em;
  font-weight: bold;
  margin-top: 2px;
  line-height: 1.2;
}
.cd-sc-body {
  padding: 6px 8px;
  font-size: 0.8em;
  line-height: 1.45;
  color: #334155;
}
.cd-sc-row {
  margin-bottom: 3px;
}
.cd-sc-muted {
  color: #888;
}
.cd-sc-trait {
  margin-top: 4px;
  padding: 2px 4px;
  border-radius: 2px;
}
.cd-sc-trait--dv { background: #fee2e2; border-left: 3px solid #ef4444; }
.cd-sc-trait--dr { background: #e0f2fe; border-left: 3px solid #0284c7; }
.cd-sc-trait--di { background: #f3e8ff; border-left: 3px solid #9333ea; }
.cd-sc-trait--ci { background: #ffedd5; border-left: 3px solid #f97316; }
.cd-sc-legendary {
  margin-top: 4px;
  padding: 3px 5px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 3px;
}
.cd-sc-section {
  border-top: 1px dashed #cbd5e1;
  margin-top: 5px;
  padding-top: 4px;
  color: #475569;
}
.cd-sc-section-title {
  font-weight: bold;
  margin-bottom: 3px;
  color: #475569;
}
.cd-sc-attack-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 3px;
  padding: 2px 4px;
  margin-bottom: 2px;
}
.cd-sc-attack-name {
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 110px;
}
.cd-sc-attack-btn {
  color: #0284c7;
  text-decoration: underline;
  cursor: pointer;
  font-weight: bold;
}
.cd-sc-more-attacks summary {
  cursor: pointer;
  font-size: 0.9em;
  font-weight: 600;
  color: #0284c7;
  margin-top: 3px;
}
.cd-sc-features summary {
  cursor: pointer;
  font-weight: bold;
  color: #475569;
}
.cd-sc-trait-item {
  margin: 3px 0;
  padding: 2px 4px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 3px;
}
.cd-sc-trait-item summary {
  font-weight: 600;
  color: #1e293b;
  font-size: 0.95em;
}
.cd-sc-trait-desc {
  margin-top: 3px;
  padding-top: 3px;
  border-top: 1px dashed #e2e8f0;
  font-size: 0.9em;
  color: #334155;
}
.cd-sc-trait-desc p {
  margin: 2px 0;
}
.cd-sc-roll-wrap {
  border: 1.5px solid var(--cd-border, #475569);
  border-radius: 6px;
  padding: 6px 8px;
  box-shadow: 0 0 8px 1px var(--cd-glow, rgba(71, 85, 105, 0.15)), inset 0 0 6px 0 var(--cd-glow, rgba(71, 85, 105, 0.15));
  background: linear-gradient(to bottom, var(--cd-glow, rgba(71, 85, 105, 0.15)) 0%, transparent 18%);
}
`;

/**
 * Injects stat card CSS once into document.head.
 */
export function ensureStatCardStyles() {
  if (typeof document === "undefined" || !document.head) return;
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = STAT_CARD_CSS;
  document.head.appendChild(style);
}

/**
 * Safely unwraps dnd5e Set/Array/primitive values to a single string.
 */
export function unwrapValue(val, fallback = "") {
  if (val instanceof Set) {
    const first = Array.from(val)[0];
    return first !== undefined && first !== null ? String(first) : fallback;
  }
  if (Array.isArray(val)) {
    const first = val[0];
    return first !== undefined && first !== null ? String(first) : fallback;
  }
  return val !== undefined && val !== null && val !== "" ? String(val) : fallback;
}

/**
 * Escapes HTML special characters for safe template interpolation.
 */
export function escapeHtml(value) {
  const str = String(value ?? "");
  if (typeof foundry !== "undefined" && foundry?.utils?.escapeHTML) {
    return foundry.utils.escapeHTML(str);
  }
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSigned(num) {
  const n = Number(num) || 0;
  return `${n >= 0 ? "+" : ""}${n}`;
}

function formatRollTerm(num) {
  const n = Number(num) || 0;
  if (n === 0) return "";
  return ` ${n > 0 ? "+" : "-"} ${Math.abs(n)}`;
}

function makeRollLink(formula, label) {
  return `[[/r ${formula}]]{${label}}`;
}

function parseNumericBonus(val) {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  const compact = String(val).replace(/\s+/g, "");
  if (!compact || !/^(?:[+-]?\d+(?:\.\d+)?)+$/.test(compact)) return 0;
  const terms = compact.match(/[+-]?\d+(?:\.\d+)?/g);
  return terms ? terms.reduce((sum, term) => sum + Number(term), 0) : 0;
}

/**
 * Returns border, glow, and header background styling matching the token's disposition.
 */
export function getDispositionTheme(actor, token) {
  const tok = token || actor?.getActiveTokens?.()[0];
  const disposition = tok?.document?.disposition ?? actor?.prototypeToken?.disposition;
  const disp = typeof CONST !== "undefined" && CONST.TOKEN_DISPOSITIONS
    ? CONST.TOKEN_DISPOSITIONS
    : { HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1, SECRET: -2 };

  if (disposition === disp.HOSTILE) {
    return { borderColor: "rgba(231, 33, 36, 0.85)", glowColor: "rgba(231, 33, 36, 0.22)", headerBg: "#7f1d1d" };
  }
  if (disposition === disp.NEUTRAL) {
    return { borderColor: "rgba(241, 216, 54, 0.85)", glowColor: "rgba(241, 216, 54, 0.22)", headerBg: "#78350f" };
  }
  if (disposition === disp.FRIENDLY) {
    return { borderColor: "rgba(67, 223, 223, 0.85)", glowColor: "rgba(67, 223, 223, 0.22)", headerBg: "#134e4a" };
  }
  if (disposition === disp.SECRET) {
    return { borderColor: "rgba(166, 18, 211, 0.85)", glowColor: "rgba(166, 18, 211, 0.22)", headerBg: "#581c87" };
  }
  return { borderColor: "#475569", glowColor: "rgba(71, 85, 105, 0.15)", headerBg: "#1e293b" };
}

function wrapWithDisposition(innerHtml, actor, token) {
  const { borderColor, glowColor } = getDispositionTheme(actor, token);
  return `<div class="cd-sc-roll-wrap" style="--cd-border: ${borderColor}; --cd-glow: ${glowColor};">${innerHtml}</div>`;
}

/**
 * Formats a dnd5e trait object (Set, Array, string, and custom) into a comma-separated string.
 */
export function formatTrait(traitObj) {
  if (!traitObj) return "";
  const values = [];
  if (traitObj.value instanceof Set) values.push(...Array.from(traitObj.value));
  else if (Array.isArray(traitObj.value)) values.push(...traitObj.value);
  else if (typeof traitObj.value === "string" && traitObj.value) values.push(traitObj.value);

  if (traitObj.custom) values.push(traitObj.custom);
  return values.filter(Boolean).join(", ");
}

async function evaluateBonus(bonusStr, abilityMod, pbVal) {
  const parsed = String(bonusStr || "0")
    .replace(/@mod/gi, String(abilityMod))
    .replace(/@prof/gi, String(pbVal))
    .trim();
  if (!parsed || parsed === "0") return 0;

  // Fast pure evaluation for simple numeric expressions (avoids Roll overhead and works in Node tests)
  const compact = parsed.replace(/\s+/g, "");
  if (/^(?:[+-]?\d+)+$/.test(compact)) {
    return parseNumericBonus(compact);
  }

  if (typeof Roll === "undefined") return 0;
  const signStr = /^[+\-]/.test(parsed) ? parsed : `+${parsed}`;
  try {
    const resultRoll = await new Roll(`0${signStr}`).evaluate();
    return resultRoll.total;
  } catch {
    return 0;
  }
}

function resolveItemAbility(item, itemSys, sys) {
  let resolved = itemSys.ability;
  if (itemSys.activities && itemSys.activities.size > 0) {
    const act = Array.from(itemSys.activities.values()).find((a) => a.attack || a.damage);
    if (act?.ability) resolved = act.ability;
  }
  if (!resolved || resolved === "default" || resolved === "none") {
    resolved = item.abilityMod;
  }
  if (resolved && resolved !== "default" && resolved !== "none") return resolved;

  const actionType = itemSys.actionType || "";
  const isRanged = actionType === "rwak" || actionType === "rsak" || String(itemSys.type?.value || "").includes("R");
  const isSpell = ["msak", "rsak", "save"].includes(actionType) || item.type === "spell";

  const hasProp = (prop) => {
    const props = itemSys.properties;
    if (!props) return false;
    if (props instanceof Set) return props.has(prop);
    if (Array.isArray(props)) return props.includes(prop);
    if (typeof props === "object") return Boolean(props[prop]);
    return false;
  };

  if (isSpell) return sys.attributes?.spellcasting || "int";
  if (isRanged && !hasProp("thr")) return "dex";
  if (hasProp("fin")) {
    return (sys.abilities?.dex?.mod ?? 0) >= (sys.abilities?.str?.mod ?? 0) ? "dex" : "str";
  }
  return "str";
}

async function extractAttackItem(item, actor, token, sys, pb) {
  const itemSys = item.system || {};
  const resolvedAbility = resolveItemAbility(item, itemSys, sys);
  const abilityMod = sys.abilities?.[resolvedAbility]?.mod ?? 0;

  let rawAttackBonus = "0";
  let isFlatAttack = false;
  const rawParts = [];

  if (itemSys.activities && itemSys.activities.size > 0) {
    const act = Array.from(itemSys.activities.values()).find((a) => a.attack || a.damage);
    if (act) {
      if (act.damage?.parts?.length > 0) {
        for (const part of act.damage.parts) {
          rawParts.push({
            count: part.number || 1,
            dieSize: part.denomination ? `d${part.denomination}` : "d4",
            type: unwrapValue(part.types, "slashing"),
            rawBonus: String(part.bonus || "0")
          });
        }
      }
      if (act.attack) {
        rawAttackBonus = String(act.attack.bonus || act.attack.flat || "0");
        if (act.attack.flat) isFlatAttack = true;
      }
    }
  } else {
    if (itemSys.damage?.parts?.length > 0) {
      for (const dmgPart of itemSys.damage.parts) {
        const formulaStr = String(dmgPart[0] || "");
        const match = formulaStr.match(/(\d+)d(\d+)/i);
        rawParts.push({
          count: match ? (parseInt(match[1], 10) || 1) : 1,
          dieSize: match ? `d${match[2]}` : "d4",
          type: unwrapValue(dmgPart[1], "slashing"),
          rawBonus: match ? formulaStr.replace(match[0], "") : (formulaStr || "0")
        });
      }
    }
    if (itemSys.attackBonus) {
      rawAttackBonus = String(itemSys.attackBonus || "0");
    }
  }

  if (rawParts.length === 0) {
    rawParts.push({ count: 1, dieSize: "d4", type: "slashing", rawBonus: "0" });
  }

  const damageParts = [];
  for (let i = 0; i < rawParts.length; i++) {
    const p = rawParts[i];
    const trimmed = p.rawBonus.trim();
    let mod = 0;
    if (/^[+\-]?\d+$/.test(trimmed)) {
      mod = parseInt(trimmed, 10);
    } else if (trimmed && trimmed !== "0") {
      mod = await evaluateBonus(trimmed, abilityMod, pb);
    } else if (i === 0) {
      mod = abilityMod;
    }
    damageParts.push({ count: p.count, dieSize: p.dieSize, mod, type: p.type });
  }

  const attackCircumstanceModifier = await evaluateBonus(rawAttackBonus, abilityMod, pb);
  let totalAttackModifier = isFlatAttack
    ? attackCircumstanceModifier
    : abilityMod + pb + attackCircumstanceModifier;

  if (item.labels?.toHit) {
    const toHitMatch = String(item.labels.toHit).match(/^[+\-]?\d+/);
    if (toHitMatch) totalAttackModifier = parseInt(toHitMatch[0], 10);
  }

  const dmgSummary = damageParts
    .map((p) => `${p.count}${p.dieSize}${p.mod !== 0 ? formatSigned(p.mod) : ""}`)
    .join(" + ");

  return {
    id: item.id,
    name: item.name,
    tokenId: token?.id || "",
    tokenUuid: token?.document?.uuid || "",
    actorUuid: actor?.uuid || "",
    atkMod: totalAttackModifier,
    dmgSummary,
    damageParts
  };
}

async function extractSaveItem(item, actor, token, sys, pb, spellcasting) {
  const itemSys = item.system || {};
  let saveAbility = "";
  let dc = null;
  const rawParts = [];

  if (itemSys.activities && itemSys.activities.size > 0) {
    const act = Array.from(itemSys.activities.values()).find((a) => a.type === "save" || a.save);
    if (act) {
      saveAbility = unwrapValue(act.save?.ability, "").toUpperCase();
      const rawDc = act.save?.dc?.value ?? act.save?.dc?.formula;
      if (rawDc !== undefined && rawDc !== null && /^\d+$/.test(String(rawDc).trim())) {
        dc = parseInt(String(rawDc).trim(), 10);
      } else if (act.save?.dc?.calculation === "spellcasting" && spellcasting) {
        dc = spellcasting.dc;
      } else if (act.save?.dc?.calculation && sys.abilities?.[act.save.dc.calculation]) {
        dc = 8 + pb + (sys.abilities[act.save.dc.calculation]?.mod ?? 0);
      }
      if (act.damage?.parts?.length > 0) {
        for (const part of act.damage.parts) {
          rawParts.push({
            count: part.number || 1,
            dieSize: part.denomination ? `d${part.denomination}` : "d6",
            type: unwrapValue(part.types, "damage"),
            rawBonus: String(part.bonus || "0")
          });
        }
      }
    }
  } else {
    saveAbility = unwrapValue(itemSys.save?.ability, "").toUpperCase();
    if (typeof itemSys.save?.dc === "number") dc = itemSys.save.dc;
    else if (itemSys.save?.scaling === "spell" && spellcasting) dc = spellcasting.dc;
    else if (itemSys.save?.scaling && sys.abilities?.[itemSys.save.scaling]) {
      dc = 8 + pb + (sys.abilities[itemSys.save.scaling]?.mod ?? 0);
    }

    if (itemSys.damage?.parts?.length > 0) {
      for (const dmgPart of itemSys.damage.parts) {
        const formulaStr = String(dmgPart[0] || "");
        const match = formulaStr.match(/(\d+)d(\d+)/i);
        rawParts.push({
          count: match ? (parseInt(match[1], 10) || 1) : 1,
          dieSize: match ? `d${match[2]}` : "d6",
          type: unwrapValue(dmgPart[1], "damage"),
          rawBonus: match ? formulaStr.replace(match[0], "") : (formulaStr || "0")
        });
      }
    }
  }

  if (dc === null && item.labels?.save) {
    const dcMatch = String(item.labels.save).match(/DC\s*(\d+)/i);
    if (dcMatch) dc = parseInt(dcMatch[1], 10);
    if (!saveAbility) {
      const abMatch = String(item.labels.save).match(/\b(STR|DEX|CON|INT|WIS|CHA)\b/i);
      if (abMatch) saveAbility = abMatch[1].toUpperCase();
    }
  }

  const abilityKey = resolveItemAbility(item, itemSys, sys);
  const abilityMod = sys.abilities?.[abilityKey]?.mod ?? 0;
  const damageParts = [];
  for (const p of rawParts) {
    const trimmed = p.rawBonus.trim();
    let mod = 0;
    if (/^[+\-]?\d+$/.test(trimmed)) mod = parseInt(trimmed, 10);
    else if (trimmed && trimmed !== "0") mod = await evaluateBonus(trimmed, abilityMod, pb);
    damageParts.push({ count: p.count, dieSize: p.dieSize, mod, type: p.type });
  }

  const dmgSummary = damageParts.length > 0
    ? damageParts.map((p) => `${p.count}${p.dieSize}${p.mod !== 0 ? formatSigned(p.mod) : ""}`).join(" + ")
    : "Effect";

  return {
    id: item.id,
    name: item.name,
    tokenId: token?.id || "",
    tokenUuid: token?.document?.uuid || "",
    actorUuid: actor?.uuid || "",
    saveAbility: saveAbility || "SAVE",
    dc: dc ?? "—",
    dmgSummary,
    damageParts
  };
}

/**
 * Extracts a normalized, testable view-model from an actor and token.
 */
export async function extractStatCardData(actor, token) {
  const sys = actor.system || {};
  const pb = sys.attributes?.prof ?? 0;
  const cr = sys.details?.cr ?? sys.details?.level ?? "—";
  const ac = sys.attributes?.ac?.value ?? 10;
  const initMod = sys.attributes?.init?.total ?? sys.abilities?.dex?.mod ?? 0;

  const abilities = ABILITIES.map((ab) => {
    const score = sys.abilities?.[ab]?.value ?? 10;
    const mod = sys.abilities?.[ab]?.mod ?? 0;
    return { key: ab, fullName: FULL_ABILITY_NAMES[ab], score, mod };
  });

  const rawSize = sys.traits?.size || "med";
  const sizeDisplay = SIZE_MAP[rawSize] || rawSize;

  let typeDisplay = "Unknown";
  if (typeof sys.details?.type === "string") {
    typeDisplay = sys.details.type;
  } else if (sys.details?.type?.value) {
    typeDisplay = sys.details.type.value;
    if (sys.details.type.subtype) typeDisplay += ` (${sys.details.type.subtype})`;
  }

  const sensesObj = sys.attributes?.senses || {};
  const sensesList = [];
  if (sensesObj.darkvision) sensesList.push(`Darkvision ${sensesObj.darkvision} ft`);
  if (sensesObj.blindsight) sensesList.push(`Blindsight ${sensesObj.blindsight} ft`);
  if (sensesObj.tremorsense) sensesList.push(`Tremorsense ${sensesObj.tremorsense} ft`);
  if (sensesObj.truesight) sensesList.push(`Truesight ${sensesObj.truesight} ft`);
  if (sensesObj.special) sensesList.push(sensesObj.special);

  const proficientSaves = [];
  for (const ab of ABILITIES) {
    const ability = sys.abilities?.[ab];
    const isProf = ability?.proficient || ability?.saveProf?.multiplier > 0;
    if (ability && isProf) {
      let saveBonus = ability.mod ?? 0;
      if (typeof ability.save === "number") saveBonus = ability.save;
      else if (typeof ability.save?.value === "number") saveBonus = ability.save.value;
      else saveBonus = (ability.mod ?? 0) + pb;
      proficientSaves.push({ key: ab, fullName: FULL_ABILITY_NAMES[ab], bonus: saveBonus });
    }
  }

  const trainedSkills = [];
  if (sys.skills) {
    const skillConfig = typeof CONFIG !== "undefined" ? CONFIG?.DND5E?.skills : null;
    for (const [key, skill] of Object.entries(sys.skills)) {
      if (skill.value && skill.value > 0) {
        const fullName = skillConfig?.[key]?.label ?? key;
        const total = skill.total ?? ((sys.abilities?.[skill.ability]?.mod ?? 0) + skill.value * pb);
        trainedSkills.push({ key, fullName, shortName: fullName.substring(0, 4), total });
      }
    }
  }

  const movementObj = sys.attributes?.movement || {};
  const speeds = [];
  if (movementObj.walk) speeds.push(`${movementObj.walk} ft`);
  if (movementObj.fly) speeds.push(`Fly ${movementObj.fly} ft${movementObj.hover ? " (H)" : ""}`);
  if (movementObj.swim) speeds.push(`Swim ${movementObj.swim} ft`);
  if (movementObj.burrow) speeds.push(`Burrow ${movementObj.burrow} ft`);
  if (movementObj.climb) speeds.push(`Climb ${movementObj.climb} ft`);

  const spellcastingAbility = sys.attributes?.spellcasting;
  let spellcasting = null;
  if (spellcastingAbility && spellcastingAbility !== "" && spellcastingAbility !== "none") {
    const spellMod = sys.abilities?.[spellcastingAbility]?.mod ?? 0;
    const baseSpellAtk = pb + spellMod;
    const rawAtk = sys.attributes?.spell?.attack;
    let spellAttackBonus = (rawAtk !== undefined && rawAtk !== null) ? Number(rawAtk) : baseSpellAtk;
    if (!Number.isFinite(spellAttackBonus)) spellAttackBonus = baseSpellAtk;

    const rsakBonus = parseNumericBonus(sys.rolls?.attack?.rsak?.bonus) || parseNumericBonus(sys.bonuses?.rsak?.attack);
    const msakBonus = parseNumericBonus(sys.rolls?.attack?.msak?.bonus) || parseNumericBonus(sys.bonuses?.msak?.attack);
    const globalSpellAtkBonus = parseNumericBonus(sys.rolls?.attack?.spell?.bonus) || parseNumericBonus(sys.bonuses?.spell?.attack);
    const rmakBonus = (rsakBonus !== 0 && rsakBonus === msakBonus) ? rsakBonus : (rsakBonus || msakBonus || 0);
    spellAttackBonus += rmakBonus;
    if (globalSpellAtkBonus !== 0 && (rawAtk === undefined || rawAtk === null || Number(rawAtk) === baseSpellAtk)) {
      spellAttackBonus += globalSpellAtkBonus;
    }

    const baseSpellDC = 8 + pb + spellMod;
    const rawDC = sys.attributes?.spell?.dc ?? sys.attributes?.spelldc;
    let spellDC = (rawDC !== undefined && rawDC !== null) ? Number(rawDC) : baseSpellDC;
    if (!Number.isFinite(spellDC)) spellDC = baseSpellDC;
    const spellBonusDC = parseNumericBonus(sys.bonuses?.spell?.dc);
    if (spellBonusDC !== 0 && (rawDC === undefined || rawDC === null || Number(rawDC) === baseSpellDC)) {
      spellDC += spellBonusDC;
    }

    const slots = [];
    if (sys.spells) {
      for (let i = 1; i <= 9; i++) {
        const slot = sys.spells[`spell${i}`];
        if (slot && slot.max > 0) slots.push(`L${i}: ${slot.value}/${slot.max}`);
      }
      if (sys.spells.pact && sys.spells.pact.max > 0) {
        slots.push(`Pact: ${sys.spells.pact.value}/${sys.spells.pact.max}`);
      }
    }

    spellcasting = {
      ability: spellcastingAbility.toUpperCase(),
      attackBonus: spellAttackBonus,
      dc: spellDC,
      slots
    };
  }

  const attackItems = (actor.items || []).filter((item) => {
    if (item.type === "weapon" || item.hasAttack) return true;
    const oldAction = item.system?.actionType;
    if (["mwak", "rwak", "msak", "rsak"].includes(oldAction)) return true;
    if (item.system?.activities) {
      return Array.from(item.system.activities.values()).some((act) => act.type === "attack" || act.attack);
    }
    return false;
  });

  const attacks = [];
  const attackIds = new Set();
  for (const item of attackItems) {
    try {
      attacks.push(await extractAttackItem(item, actor, token, sys, pb));
      attackIds.add(item.id);
    } catch (e) {
      console.error(`Skipped item ${item.name} due to structure format.`, e);
    }
  }

  const saveItems = (actor.items || []).filter((item) => {
    if (attackIds.has(item.id)) return false;
    if (item.system?.actionType === "save" || item.hasSave) return true;
    if (item.system?.activities) {
      return Array.from(item.system.activities.values()).some((act) => act.type === "save" || act.save);
    }
    return false;
  });

  const saveAbilities = [];
  const saveIds = new Set();
  for (const item of saveItems) {
    try {
      saveAbilities.push(await extractSaveItem(item, actor, token, sys, pb, spellcasting));
      saveIds.add(item.id);
    } catch (e) {
      console.error(`Skipped save item ${item.name} due to structure format.`, e);
    }
  }

  const features = (actor.items || [])
    .filter((item) => item.type === "feat" && !attackIds.has(item.id) && !saveIds.has(item.id) && item.system?.description?.value)
    .map((item) => ({
      id: item.id,
      name: item.name,
      description: String(item.system.description.value)
    }));

  return {
    name: token?.name || actor.name || "Unknown",
    sizeDisplay,
    typeDisplay,
    cr,
    pb,
    ac,
    initMod,
    hp: {
      current: sys.attributes?.hp?.value ?? 0,
      max: sys.attributes?.hp?.max ?? 0,
      temp: sys.attributes?.hp?.temp ?? 0,
      tempMax: sys.attributes?.hp?.tempmax ?? 0
    },
    movementDisplay: speeds.length > 0 ? speeds.join(", ") : "0 ft",
    abilities,
    proficientSaves,
    trainedSkills,
    passives: {
      prc: sys.skills?.prc?.passive ?? (10 + (sys.abilities?.wis?.mod ?? 0)),
      inv: sys.skills?.inv?.passive ?? (10 + (sys.abilities?.int?.mod ?? 0)),
      ins: sys.skills?.ins?.passive ?? (10 + (sys.abilities?.wis?.mod ?? 0))
    },
    sensesDisplay: sensesList.length > 0 ? sensesList.join(", ") : "Normal",
    languagesDisplay: formatTrait(sys.traits?.languages) || "None",
    traits: {
      dv: formatTrait(sys.traits?.dv),
      dr: formatTrait(sys.traits?.dr),
      di: formatTrait(sys.traits?.di),
      ci: formatTrait(sys.traits?.ci)
    },
    legendary: {
      actVal: sys.resources?.legact?.value ?? 0,
      actMax: sys.resources?.legact?.max ?? 0,
      resVal: sys.resources?.legres?.value ?? 0,
      resMax: sys.resources?.legres?.max ?? 0
    },
    spellcasting,
    attacks,
    saveAbilities,
    features,
    theme: getDispositionTheme(actor, token)
  };
}

function renderAttackRow(atk) {
  const firstPart = atk.damageParts[0] || { count: 1, dieSize: "d4", mod: 0, type: "slashing" };
  const partsJson = escapeHtml(JSON.stringify(atk.damageParts));
  return `
    <div class="cd-sc-attack-row">
      <span class="cd-sc-attack-name">${escapeHtml(atk.name)}</span>
      <span>Atk ${formatSigned(atk.atkMod)} &bull; Dmg ${escapeHtml(atk.dmgSummary)} &bull;
        <a class="gwa-attack-btn cd-sc-attack-btn"
           data-token-id="${escapeHtml(atk.tokenId)}"
           data-token-uuid="${escapeHtml(atk.tokenUuid)}"
           data-actor-uuid="${escapeHtml(atk.actorUuid)}"
           data-item-id="${escapeHtml(atk.id)}"
           data-atk-mod="${atk.atkMod}"
           data-dmg-count="${firstPart.count}"
           data-dmg-size="${escapeHtml(firstPart.dieSize)}"
           data-dmg-mod="${firstPart.mod}"
           data-dmg-type="${escapeHtml(firstPart.type)}"
           data-damage-parts="${partsJson}">Roll</a>
      </span>
    </div>`;
}

/**
 * Pure HTML renderer for a stat card view-model.
 */
export function renderStatCardHtml(data) {
  const { theme } = data;
  const abilityBoxes = data.abilities.map((ab) => {
    const rollLink = makeRollLink(`1d20${formatRollTerm(ab.mod)}[${ab.fullName} Check]`, formatSigned(ab.mod));
    return `
      <div class="cd-sc-ability-box">
        <div class="cd-sc-ability-label">${ab.key}</div>
        <div class="cd-sc-ability-score">${ab.score}</div>
        <div class="cd-sc-ability-mod">${rollLink}</div>
      </div>`;
  }).join("");

  const initLink = makeRollLink(`1d20${formatRollTerm(data.initMod)}[Initiative]`, formatSigned(data.initMod));

  let hpDisplay = `${data.hp.current}/${data.hp.max}`;
  if (data.hp.temp > 0) hpDisplay += ` <span style="color: #0284c7;">(+${data.hp.temp})</span>`;
  if (data.hp.tempMax !== 0) hpDisplay += ` <span style="color: #b45309;">(${formatSigned(data.hp.tempMax)})</span>`;

  const savesDisplay = data.proficientSaves.length > 0
    ? data.proficientSaves.map((s) => makeRollLink(`1d20${formatRollTerm(s.bonus)}[${s.fullName} Save]`, `${s.key.toUpperCase()} ${formatSigned(s.bonus)}`)).join(" ")
    : `<span class="cd-sc-muted">None</span>`;

  const skillsDisplay = data.trainedSkills.length > 0
    ? data.trainedSkills.map((s) => makeRollLink(`1d20${formatRollTerm(s.total)}[${escapeHtml(s.fullName)} Check]`, `${escapeHtml(s.shortName)} ${formatSigned(s.total)}`)).join(" ")
    : `<span class="cd-sc-muted">None</span>`;

  const { actVal, actMax, resVal, resMax } = data.legendary;
  const legendaryHtml = (actMax > 0 || resMax > 0) ? `
    <div class="cd-sc-legendary">
      ${actMax > 0 ? `<span><b>Legendary Actions:</b> ${actVal}/${actMax}</span>` : ""}
      ${actMax > 0 && resMax > 0 ? " &bull; " : ""}
      ${resMax > 0 ? `<span><b>Legendary Resistance:</b> ${resVal}/${resMax}</span>` : ""}
    </div>` : "";

  let spellHtml = "";
  if (data.spellcasting) {
    const sc = data.spellcasting;
    const spellAtkLink = makeRollLink(`1d20${formatRollTerm(sc.attackBonus)}[Spell Attack]`, formatSigned(sc.attackBonus));
    spellHtml = `
      <div class="cd-sc-section">
        <div><b>Spellcasting:</b> ${escapeHtml(sc.ability)} | Atk: <b>${spellAtkLink}</b> | DC: <b>${sc.dc}</b></div>
        ${sc.slots.length > 0 ? `<div style="font-size: 0.9em; margin-top: 2px; color: #334155;"><b>Slots:</b> ${escapeHtml(sc.slots.join(" \u2022 "))}</div>` : ""}
      </div>`;
  }

  let attacksHtml = "";
  if (data.attacks.length > 0) {
    const primary = data.attacks.slice(0, VISIBLE_ATTACK_LIMIT).map(renderAttackRow).join("");
    const overflow = data.attacks.slice(VISIBLE_ATTACK_LIMIT);
    const overflowHtml = overflow.length > 0
      ? `<details class="cd-sc-more-attacks"><summary>More Attacks (+${overflow.length})</summary>${overflow.map(renderAttackRow).join("")}</details>`
      : "";
    attacksHtml = `
      <div class="cd-sc-section">
        <div class="cd-sc-section-title">Attacks:</div>
        ${primary}
        ${overflowHtml}
      </div>`;
  }

  const renderSaveRow = (sav) => {
    const partsJson = escapeHtml(JSON.stringify(sav.damageParts));
    const hasDamage = sav.damageParts.length > 0;
    return `
      <div class="cd-sc-attack-row">
        <span class="cd-sc-attack-name">${escapeHtml(sav.name)}</span>
        <span>DC ${escapeHtml(sav.dc)} ${escapeHtml(sav.saveAbility)} &bull; ${escapeHtml(sav.dmgSummary)}${hasDamage ? ` &bull;
          <a class="gwa-save-btn cd-sc-attack-btn"
             data-token-id="${escapeHtml(sav.tokenId)}"
             data-token-uuid="${escapeHtml(sav.tokenUuid)}"
             data-actor-uuid="${escapeHtml(sav.actorUuid)}"
             data-item-id="${escapeHtml(sav.id)}"
             data-save-ability="${escapeHtml(sav.saveAbility)}"
             data-save-dc="${escapeHtml(sav.dc)}"
             data-damage-parts="${partsJson}">Roll</a>` : ""}
        </span>
      </div>`;
  };

  let saveAbilitiesHtml = "";
  if (data.saveAbilities?.length > 0) {
    const primarySaves = data.saveAbilities.slice(0, VISIBLE_ATTACK_LIMIT).map(renderSaveRow).join("");
    const overflowSaves = data.saveAbilities.slice(VISIBLE_ATTACK_LIMIT);
    const overflowSavesHtml = overflowSaves.length > 0
      ? `<details class="cd-sc-more-attacks"><summary>More Saves (+${overflowSaves.length})</summary>${overflowSaves.map(renderSaveRow).join("")}</details>`
      : "";
    saveAbilitiesHtml = `
      <div class="cd-sc-section">
        <div class="cd-sc-section-title">Save Abilities:</div>
        ${primarySaves}
        ${overflowSavesHtml}
      </div>`;
  }

  let featuresHtml = "";
  if (data.features?.length > 0) {
    const featureItems = data.features.map((feat) => `
      <details class="cd-sc-trait-item">
        <summary>${escapeHtml(feat.name)}</summary>
        <div class="cd-sc-trait-desc">${feat.description}</div>
      </details>`).join("");
    featuresHtml = `
      <div class="cd-sc-section">
        <details class="cd-sc-features">
          <summary>Traits &amp; Features (${data.features.length})</summary>
          ${featureItems}
        </details>
      </div>`;
  }

  return `
<div class="cd-stat-card" style="--cd-border: ${theme.borderColor}; --cd-glow: ${theme.glowColor}; --cd-header-bg: ${theme.headerBg};">
  <div class="cd-sc-header">
    <div>
      <div class="cd-sc-name">${escapeHtml(data.name)}</div>
      <div class="cd-sc-subtitle">${escapeHtml(data.sizeDisplay)} ${escapeHtml(data.typeDisplay)}</div>
    </div>
    <div class="cd-sc-meta">
      <div>CR/LEVEL <b>${escapeHtml(data.cr)}</b></div>
      <div style="margin-top: 2px;">PB <b>${formatSigned(data.pb)}</b></div>
    </div>
  </div>

  <div class="cd-sc-vitals">
    <div class="cd-sc-vital-box">
      <span class="cd-sc-vital-label">ARMOR</span>
      <span class="cd-sc-vital-val">${data.ac}</span>
    </div>
    <div class="cd-sc-vital-box">
      <span class="cd-sc-vital-label">HIT POINTS</span>
      <span class="cd-sc-vital-val">${hpDisplay}</span>
    </div>
    <div class="cd-sc-vital-box">
      <span class="cd-sc-vital-label">SPEED</span>
      <span class="cd-sc-vital-val cd-sc-vital-val--sm">${escapeHtml(data.movementDisplay)}</span>
    </div>
    <div class="cd-sc-vital-box">
      <span class="cd-sc-vital-label">INIT</span>
      <span class="cd-sc-vital-val">${initLink}</span>
    </div>
  </div>

  <div class="cd-sc-abilities">${abilityBoxes}</div>

  <div class="cd-sc-body">
    <div class="cd-sc-row"><b>Saves:</b> ${savesDisplay}</div>
    <div class="cd-sc-row"><b>Skills:</b> ${skillsDisplay}</div>
    <div class="cd-sc-row"><b>Passives:</b> Perc <b>${data.passives.prc}</b> &bull; Inv <b>${data.passives.inv}</b> &bull; Ins <b>${data.passives.ins}</b></div>
    <div class="cd-sc-row"><b>Senses:</b> ${escapeHtml(data.sensesDisplay)}</div>
    <div class="cd-sc-row"><b>Languages:</b> ${escapeHtml(data.languagesDisplay)}</div>

    ${data.traits.dv ? `<div class="cd-sc-trait cd-sc-trait--dv"><b>Vulnerabilities:</b> ${escapeHtml(data.traits.dv)}</div>` : ""}
    ${data.traits.dr ? `<div class="cd-sc-trait cd-sc-trait--dr"><b>Resistances:</b> ${escapeHtml(data.traits.dr)}</div>` : ""}
    ${data.traits.di ? `<div class="cd-sc-trait cd-sc-trait--di"><b>Damage Immunities:</b> ${escapeHtml(data.traits.di)}</div>` : ""}
    ${data.traits.ci ? `<div class="cd-sc-trait cd-sc-trait--ci"><b>Condition Immunities:</b> ${escapeHtml(data.traits.ci)}</div>` : ""}

    ${legendaryHtml}
    ${spellHtml}
    ${attacksHtml}
    ${saveAbilitiesHtml}
    ${featuresHtml}
  </div>
</div>`;
}

/**
 * Initialize event listeners for attack button clicks in chat messages.
 */
export function initStatCard() {
  ensureStatCardStyles();

  const hookName = (foundry?.utils?.isNewerVersion?.(game.version, "13") || Number(game.release?.generation ?? 12) >= 13)
    ? "renderChatMessageHTML"
    : "renderChatMessage";

  Hooks.on(hookName, (message, html) => {
    const root = html instanceof HTMLElement ? html : (html?.[0] || html);
    if (!root) return;

    root.querySelectorAll(".gwa-attack-btn").forEach((btn) => {
      if (btn.dataset.gwaBound) return;
      btn.dataset.gwaBound = "true";

      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        await handleAttackButtonClick(btn);
      });
    });

    root.querySelectorAll(".gwa-save-btn").forEach((btn) => {
      if (btn.dataset.gwaBound) return;
      btn.dataset.gwaBound = "true";

      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        await handleSaveButtonClick(btn);
      });
    });
  });
}

async function evaluateDamageParts(damageParts) {
  const evaluatedParts = [];
  let grandTotal = 0;
  let totalCritBonus = 0;

  for (const part of damageParts) {
    const count = parseInt(part.count, 10) || 1;
    const dieSize = part.dieSize || "d4";
    const mod = parseInt(part.mod, 10) || 0;
    const type = String(part.type || "slashing");
    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
    const maxDie = parseInt(dieSize.replace(/d/i, ""), 10) || 4;
    const critBonus = count * maxDie;

    const modStr = mod !== 0 ? (mod > 0 ? ` + ${mod}` : ` - ${Math.abs(mod)}`) : "";
    const formula = `${count}${dieSize}${modStr}`;
    const dmgRoll = await new Roll(formula).evaluate();

    grandTotal += dmgRoll.total;
    totalCritBonus += critBonus;
    evaluatedParts.push({ count, dieSize, mod, typeLabel, formula, roll: dmgRoll, total: dmgRoll.total, critBonus });
  }

  return { evaluatedParts, grandTotal, totalCritBonus };
}

function parseDamagePartsFromBtn(btn) {
  if (btn.dataset.damageParts) {
    try {
      const parsed = JSON.parse(btn.dataset.damageParts);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* fallback below */ }
  }
  return [{
    count: parseInt(btn.dataset.dmgCount, 10) || 1,
    dieSize: btn.dataset.dmgSize || "d4",
    mod: parseInt(btn.dataset.dmgMod, 10) || 0,
    type: btn.dataset.dmgType || "slashing"
  }];
}

function renderDamagePartBlocks(evaluatedParts) {
  return evaluatedParts.map((p) => `
    <p style="text-align: center; font-weight: bold; margin: 5px 0;">${escapeHtml(p.typeLabel)} Damage (${escapeHtml(p.formula)})</p>
    <div style="display: flex; justify-content: center; text-align: center; font-size: 0.9em; margin-top: 3px;">
      <div style="padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; background-color: #f8f9fa;">
        <p style="margin: 0; font-weight: 600; font-size: 0.85em;">Result</p>
        <span style="font-weight: bold; font-size: 1.4em;">${p.total}</span>
      </div>
    </div>
  `).join("");
}

async function handleSaveButtonClick(btn) {
  const { tokenObj, tokenDoc, actorObj } = await resolveTokenAndActor(btn);
  const itemObj = actorObj?.items?.get(btn.dataset.itemId);
  if (!actorObj || !itemObj) {
    return ui.notifications.warn("Actor or Item not found.");
  }

  const saveAbility = btn.dataset.saveAbility || "SAVE";
  const saveDc = btn.dataset.saveDc || "—";
  const damageParts = parseDamagePartsFromBtn(btn);
  const { evaluatedParts, grandTotal } = await evaluateDamageParts(damageParts);

  if (game.dice3d) {
    await Promise.all(evaluatedParts.map((p) => game.dice3d.showForRoll(p.roll, game.user, true)));
  }

  const chatContent = `
    <p><strong>${escapeHtml(actorObj.name)}: ${escapeHtml(itemObj.name)}</strong></p>
    <div style="text-align: center; font-weight: bold; padding: 4px; background: rgba(0,0,0,0.05); border-radius: 4px; margin: 4px 0;">
      DC ${escapeHtml(saveDc)} ${escapeHtml(saveAbility)} Save
    </div>
    <hr style="margin: 5px 0; border-top: 2px solid #343a40;">
    ${renderDamagePartBlocks(evaluatedParts)}
    <hr style="margin: 3px 0 5px; border-top: 1px solid #ddd;">
    <div style="text-align: center; font-weight: bold; font-size: 1em;">
      Damage Total: <span style="font-size: 1.2em;">${grandTotal}</span>
    </div>
  `;

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: tokenDoc }),
    content: wrapWithDisposition(chatContent, actorObj, tokenObj),
    sound: CONFIG.sounds.dice
  });
}

async function resolveTokenAndActor(btn) {
  const { tokenUuid, actorUuid, tokenId } = btn.dataset;
  let tokenDoc = null;
  let actorObj = null;

  if (tokenUuid && typeof fromUuid === "function") {
    tokenDoc = await fromUuid(tokenUuid).catch(() => null);
    actorObj = tokenDoc?.actor || null;
  }
  if (!actorObj && actorUuid && typeof fromUuid === "function") {
    actorObj = await fromUuid(actorUuid).catch(() => null);
  }

  const tokenObj = tokenDoc?.object || canvas.tokens.get(tokenId) || actorObj?.getActiveTokens?.()?.[0];
  actorObj = actorObj || tokenObj?.actor || game.actors.get(tokenId);
  return { tokenObj, tokenDoc: tokenDoc || tokenObj?.document, actorObj };
}

/**
 * Handles attack execution when a stat card button is clicked.
 * Evaluates dual d20 attack rolls and multi-part damage rolls with critical bonus dice.
 */
async function handleAttackButtonClick(btn) {
  const { tokenObj, tokenDoc, actorObj } = await resolveTokenAndActor(btn);
  const itemObj = actorObj?.items?.get(btn.dataset.itemId);

  if (!actorObj || !itemObj) {
    return ui.notifications.warn("Actor or Item not found.");
  }

  const totalAttackModifier = parseInt(btn.dataset.atkMod, 10) || 0;
  const damageParts = parseDamagePartsFromBtn(btn);

  const CRIT_THRESHOLD = 20;
  const roll1 = await new Roll(`1d20 + ${totalAttackModifier}`).evaluate();
  let rollHtml1 = await roll1.render();
  const d20_1 = roll1.dice[0].total;
  if (d20_1 >= CRIT_THRESHOLD) rollHtml1 = rollHtml1.replace("dice-total", "dice-total critical");
  else if (d20_1 === 1) rollHtml1 = rollHtml1.replace("dice-total", "dice-total fumble");

  const roll2 = await new Roll(`1d20 + ${totalAttackModifier}`).evaluate();
  let rollHtml2 = await roll2.render();
  const d20_2 = roll2.dice[0].total;
  if (d20_2 >= CRIT_THRESHOLD) rollHtml2 = rollHtml2.replace("dice-total", "dice-total critical");
  else if (d20_2 === 1) rollHtml2 = rollHtml2.replace("dice-total", "dice-total fumble");

  const isCritical = d20_1 >= CRIT_THRESHOLD || d20_2 >= CRIT_THRESHOLD;

  const { evaluatedParts, grandTotal, totalCritBonus } = await evaluateDamageParts(damageParts);

  if (game.dice3d) {
    await Promise.all([roll1, roll2, ...evaluatedParts.map((p) => p.roll)]
      .map((r) => game.dice3d.showForRoll(r, game.user, true)));
  }

  const criticalTotal = grandTotal + totalCritBonus;
  const damageBlocksHtml = renderDamagePartBlocks(evaluatedParts);

  let totalBlocks = `
    <p style="margin: 0; flex: 1; ${isCritical ? "border-right: 1px solid #ddd;" : ""} padding: 0 5px;">
      Damage Total: <span style="font-size: 1.2em; font-weight: bold;">${grandTotal}</span>
    </p>`;

  if (isCritical) {
    totalBlocks += `
      <p style="margin: 0; flex: 1; padding: 0 5px;">
        Critical Total: <span class="dice-total critical" style="font-size: 1.2em;">${criticalTotal}</span>
      </p>`;
  }

  const criticalBonusHTML = isCritical ? `
    <p style="font-weight: 500; font-size: 0.95em; margin: 5px 0;"><strong>Critical Bonus: +${totalCritBonus}</strong></p>
    <ul style="margin: 0 0 5px; padding-left: 15px; list-style-type: disc; font-size: 0.9em; line-height: 1.4;">
      ${evaluatedParts.map((p) => `<li>${escapeHtml(p.typeLabel)} (${p.count}${p.dieSize} Max): <b>+${p.critBonus}</b></li>`).join("")}
    </ul>` : "";

  const chatContent = `
    <p><strong>${escapeHtml(actorObj.name)}: ${escapeHtml(itemObj.name)}</strong></p>
    <hr>
    <div style="display: flex; justify-content: space-around; gap: 10px;">
      <div style="flex: 1; min-width: 0;">
        <p style="margin: 0; text-align: center;">Attack Roll</p>
        ${rollHtml1}
      </div>
      <div style="flex: 1; min-width: 0;">
        <p style="margin: 0; text-align: center;">+/- Adv.</p>
        ${rollHtml2}
      </div>
    </div>
    <hr style="margin: 5px 0 5px; border-top: 2px solid #343a40;">
    ${damageBlocksHtml}
    <hr style="margin: 3px 0 5px; border-top: 1px solid #ddd;">
    <div style="display: flex; justify-content: space-around; text-align: center; font-weight: bold; font-size: 1em;">
      ${totalBlocks}
    </div>
    <hr style="margin: 5px 0 0; border-top: 2px solid #343a40;">
    <details style="padding: 0 5px;">
      <summary style="font-weight: 600; font-size: 1em; text-decoration: underline; margin: 5px 0; cursor: pointer;">
        <strong>Attack/Damage Breakdown</strong>
      </summary>
      <div style="padding-top: 5px; border-top: 1px solid #ccc;">
        <p style="font-weight: 500; font-size: 0.95em; margin: 5px 0;"><strong>Attack: ${formatSigned(totalAttackModifier)}</strong></p>
        ${evaluatedParts.map((p) => `<p style="font-weight: 500; font-size: 0.95em; margin: 4px 0;"><strong>Damage: ${escapeHtml(p.formula)} (${escapeHtml(p.typeLabel)})</strong></p>`).join("")}
        ${criticalBonusHTML}
      </div>
    </details>
  `;

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: tokenDoc }),
    content: wrapWithDisposition(chatContent, actorObj, tokenObj),
    sound: CONFIG.sounds.dice
  });
}

async function enrichCardHtml(html) {
  const enricher = foundry?.applications?.ux?.TextEditor?.implementation?.enrichHTML
    || (typeof TextEditor !== "undefined" ? TextEditor.enrichHTML : null);
  if (!enricher) return html;
  return enricher(html, { async: true });
}

/**
 * Renders and sends the stat card for the given token(s) or all controlled tokens.
 */
export async function postStatCard(targetToken = null, options = {}) {
  ensureStatCardStyles();

  const tokens = targetToken
    ? (Array.isArray(targetToken) ? targetToken : [targetToken])
    : (canvas.tokens?.controlled || []);

  if (tokens.length === 0) {
    return ui.notifications.warn("Please select a token first.");
  }

  const whisper = options.whisper !== false;
  const createdMessages = [];

  for (const token of tokens) {
    const actor = token?.actor;
    if (!actor) {
      ui.notifications.warn(`No actor data found for token "${token?.name || "Unknown"}".`);
      continue;
    }

    const data = await extractStatCardData(actor, token);
    const statCardHtml = renderStatCardHtml(data);
    const enrichedContent = await enrichCardHtml(statCardHtml);

    const msgData = {
      speaker: ChatMessage.getSpeaker({ token: token.document }),
      content: enrichedContent
    };
    if (whisper) msgData.whisper = ChatMessage.getWhisperRecipients("GM");

    createdMessages.push(await ChatMessage.create(msgData));
  }

  return createdMessages.length === 1 ? createdMessages[0] : createdMessages;
}
