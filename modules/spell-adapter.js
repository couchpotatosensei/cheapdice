/**
 * @fileoverview Canonical normalization boundary for dnd5e spells (3.x / 4.x / 5.x+).
 * Converts legacy item.system fields, modern Activities, Set collections, and
 * DDB-imported quirks into a single flat, predictable structure.
 */

/**
 * Safely unwrap a Set, Array, Foundry Collection, or primitive into a string.
 * @param {*} val
 * @param {string} [fallback=""]
 * @returns {string}
 */
export function unwrapFirst(val, fallback = "") {
  if (val === null || val === undefined) return fallback;
  if (val instanceof Set) {
    const first = Array.from(val)[0];
    return first !== undefined && first !== null ? String(first) : fallback;
  }
  if (Array.isArray(val)) {
    const first = val[0];
    return first !== undefined && first !== null ? String(first) : fallback;
  }
  if (typeof val === "object" && typeof val.first === "function") {
    const first = val.first();
    return first !== undefined && first !== null ? String(first) : fallback;
  }
  return String(val) || fallback;
}

/**
 * Safely unwrap a Set, Array, Map, or single value into an Array.
 * @param {*} val
 * @returns {Array}
 */
export function unwrapArray(val) {
  if (val === null || val === undefined) return [];
  if (Array.isArray(val)) return val;
  if (val instanceof Set || val instanceof Map) return Array.from(val.values());
  if (typeof val === "object" && typeof val.values === "function") return Array.from(val.values());
  return [val];
}

/**
 * Safely extract items from a Foundry Collection, Map, Array, or plain object.
 * @param {*} collection
 * @returns {Array}
 */
export function unwrapCollection(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (collection instanceof Map) return Array.from(collection.values());
  if (typeof collection.values === "function") return Array.from(collection.values());
  if (typeof collection === "object") return Object.values(collection);
  return [];
}

/**
 * Safely check a Set-like or plain boolean-map object for a key.
 * @param {*} container
 * @param {string} key
 * @returns {boolean}
 */
export function hasProp(container, key) {
  if (!container) return false;
  if (typeof container.has === "function") return Boolean(container.has(key));
  return Boolean(container[key]);
}

/**
 * Determine whether a spell item is prepared / available to cast.
 * @param {object} item
 * @param {object|null} [actor=null]
 * @returns {boolean}
 */
export function isSpellPrepared(item, actor = null) {
  if (!item || item.type !== "spell") return false;
  const sys = item.system || {};
  if (Number(sys.level) === 0) return true;

  const prepMode = sys.method || sys.preparation?.mode || "prepared";
  if (["always", "innate", "atwill", "pact"].includes(prepMode)) return true;

  if (sys.prepared === true || sys.prepared === 1 || sys.preparation?.prepared === true) {
    return true;
  }

  const isRitual = hasProp(sys.properties, "ritual") || Boolean(sys.components?.ritual);
  if (isRitual && actor?.classes?.wizard) return true;

  return false;
}

/**
 * Parse a single modern or legacy damage/healing part into a normalized object.
 * @param {*} part
 * @param {string} [defaultType="fire"]
 * @returns {object}
 */
export function normalizeDamagePart(part, defaultType = "fire") {
  const result = {
    count: 0,
    die: "d6",
    formula: "",
    types: [],
    addMod: false,
    flatBonus: 0,
    scalingMode: "",
    scalingNumber: 0
  };

  if (!part) return result;

  if (Array.isArray(part)) {
    const formula = String(part[0] || "").trim();
    const type = String(part[1] || defaultType).toLowerCase();
    result.formula = formula;
    result.types = type ? [type] : [defaultType];
    if (/@mod/i.test(formula)) result.addMod = true;
    const diceMatch = formula.match(/(\d*)d(\d+)/i);
    if (diceMatch) {
      result.count = parseInt(diceMatch[1], 10) || 1;
      result.die = `d${diceMatch[2]}`;
    }
    return result;
  }

  if (typeof part === "object") {
    const rawTypes = unwrapArray(part.types ?? (part.type ? [part.type] : []));
    result.types = rawTypes.map(t => String(t).toLowerCase()).filter(Boolean);
    if (result.types.length === 0 && defaultType) result.types = [defaultType];

    result.scalingMode = unwrapFirst(part.scaling?.mode).toLowerCase();
    result.scalingNumber = Number(part.scaling?.number) || 0;

    if (part.custom?.enabled && part.custom?.formula) {
      const cForm = String(part.custom.formula).trim();
      result.formula = cForm;
      if (/@mod/i.test(cForm)) result.addMod = true;
      const diceMatch = cForm.match(/(\d*)d(\d+)/i);
      if (diceMatch) {
        result.count = parseInt(diceMatch[1], 10) || 1;
        result.die = `d${diceMatch[2]}`;
      }
      return result;
    }

    if (part.formula && !part.number && !part.denomination) {
      const f = String(part.formula).trim();
      result.formula = f;
      if (/@mod/i.test(f)) result.addMod = true;
      const diceMatch = f.match(/(\d*)d(\d+)/i);
      if (diceMatch) {
        result.count = parseInt(diceMatch[1], 10) || 1;
        result.die = `d${diceMatch[2]}`;
      }
      return result;
    }

    result.count = Number(part.number) || (part.denomination ? 1 : 0);
    result.die = part.denomination ? `d${part.denomination}` : "d6";

    const bonusStr = String(part.bonus ?? "").trim();
    if (/@mod/i.test(bonusStr)) {
      result.addMod = true;
    } else if (bonusStr !== "") {
      const parsedBonus = Number(bonusStr);
      if (Number.isFinite(parsedBonus) && parsedBonus !== 0) {
        result.flatBonus = parsedBonus;
      }
    }

    if (result.count > 0) {
      const bonusPart = result.addMod
        ? " + @mod"
        : (result.flatBonus ? ` + ${result.flatBonus}` : "");
      result.formula = `${result.count}${result.die}${bonusPart}`;
    } else if (result.flatBonus) {
      result.formula = String(result.flatBonus);
    }
  }

  return result;
}

/**
 * Normalize a single dnd5e Activity into one of the 4 action primitives:
 * "attack" | "save" | "roll" | "utility".
 * @param {object} act
 * @param {boolean} [allowFlatDC=false]
 * @returns {object}
 */
export function normalizeActivity(act, allowFlatDC = false) {
  const id = act?.id || act?._id || "activity";
  const name = act?.name || "";

  if (act?.type === "save" || act?.save) {
    const saveAbility = unwrapFirst(act.save?.ability, "dex").toLowerCase() || "dex";
    const saveSuccess = act.save?.scaling === "half" ? "half" : "none";
    const dcCalc = unwrapFirst(act.save?.dc?.calculation).toLowerCase();
    let dc = null;
    if (allowFlatDC && dcCalc === "flat") {
      const rawFlat = Number(act.save?.dc?.formula ?? act.save?.dc?.value);
      if (Number.isFinite(rawFlat) && rawFlat > 0) dc = rawFlat;
    }
    const rawParts = unwrapCollection(act.damage?.parts);
    const parts = rawParts.map(p => normalizeDamagePart(p, "fire"));
    return { id, name, kind: "save", saveAbility, saveSuccess, dcCalculation: dcCalc, dc, parts };
  }

  if (act?.type === "heal" || act?.healing) {
    const healObj = act.healing;
    let parts = [];
    if (healObj && !Array.isArray(healObj.parts)) {
      parts = [normalizeDamagePart(healObj, "healing")];
    } else {
      parts = unwrapCollection(healObj?.parts).map(p => normalizeDamagePart(p, "healing"));
    }
    const primaryType = parts[0]?.types?.[0] || "healing";
    const subtype = primaryType === "temphp" ? "temphp" : "heal";
    return { id, name, kind: "roll", subtype, parts };
  }

  if (act?.type === "attack" || act?.attack) {
    const attackType = unwrapFirst(act.attack?.type?.value || act.attack?.type, "spell").toLowerCase();
    const ability = unwrapFirst(act.attack?.ability).toLowerCase();
    const bonus = String(act.attack?.bonus ?? "").trim();
    const parts = unwrapCollection(act.damage?.parts).map(p => normalizeDamagePart(p, "fire"));
    return { id, name, kind: "attack", attackType, ability, bonus, parts };
  }

  if (act?.type === "damage" || (act?.damage?.parts && unwrapCollection(act.damage.parts).length > 0)) {
    const parts = unwrapCollection(act.damage?.parts).map(p => normalizeDamagePart(p, "fire"));
    return { id, name, kind: "roll", subtype: "damage", parts };
  }

  return { id, name, kind: "utility", parts: [] };
}

/**
 * Normalize any Foundry dnd5e spell Item into a flat, predictable object.
 * @param {object} item
 * @param {object|null} [actor=null]
 * @returns {object|null}
 */
export function normalizeSpell(item, actor = null) {
  if (!item || item.type !== "spell") return null;

  const sys = item.system || {};
  const level = Number(sys.level) || 0;
  const school = unwrapFirst(sys.school).toLowerCase();
  const spellcastingAbility = sys.ability || actor?.system?.attributes?.spellcasting || "int";

  const act = sys.activation;
  const castLabel = act?.cost ? `${act.cost} ${act.type || "Action"}` : "1 Action";

  const rng = sys.range;
  const rangeLabel = rng?.value ? `${rng.value} ${rng.units || "ft"}` : (rng?.units || "Touch");

  const dur = sys.duration;
  const durLabel = dur?.value ? `${dur.value} ${dur.units || ""}`.trim() : (dur?.units || "Instantaneous");

  const props = sys.properties;
  const comps = sys.components || {};
  const concentration = hasProp(props, "concentration") || Boolean(comps.concentration);
  const ritual = hasProp(props, "ritual") || Boolean(comps.ritual);
  const vocal = hasProp(props, "vocal") || Boolean(comps.vocal);
  const somatic = hasProp(props, "somatic") || Boolean(comps.somatic);
  const material = hasProp(props, "material") || Boolean(comps.material);
  const costly = Boolean(sys.materials?.cost || sys.materials?.consumed);
  const materialDesc = sys.materials?.value || "";

  let targetType = "creature";
  let areaShape = "cone";
  let areaSize = "";
  const targetUnits = sys.target?.units;
  const tType = sys.target?.type;
  if (["cone", "cube", "line", "sphere", "cylinder", "radius"].includes(tType) || ["cone", "cube", "line", "sphere"].includes(targetUnits)) {
    targetType = "area";
    areaShape = (tType === "cylinder" || tType === "radius") ? "sphere" : (tType || "cone");
    areaSize = sys.target?.value ? `${sys.target.value} ft` : "";
  } else if (tType === "self" || String(rangeLabel).toLowerCase() === "self") {
    targetType = "self";
  }

  const rawDesc = sys.description?.value || "";
  const summary = rawDesc.replace(/<[^>]*>?/gm, " ").replace(/\s+/g, " ").trim().slice(0, 180);

  const prepMode = sys.method || sys.preparation?.mode || "prepared";
  const isInnateOrAtWill = ["innate", "atwill"].includes(prepMode);
  const dndFlags = item.flags?.dnd5e || {};
  const hasSourceRef = Boolean(
    dndFlags.sourceItem ||
    dndFlags.cachedFor ||
    dndFlags.advancementOrigin ||
    item.flags?.magicitems?.sourceItem ||
    sys.sourceItem ||
    sys.source?.custom
  );

  const rawActivities = unwrapCollection(sys.activities);
  const hasActivityItemSource = rawActivities.some(
    a => (a?.consumption?.targets || []).some(t => t.type === "itemUses" && t.target)
  );
  const allowFlatDC = isInnateOrAtWill || hasSourceRef || hasActivityItemSource;

  let actions = [];
  if (rawActivities.length > 0) {
    actions = rawActivities.map(a => normalizeActivity(a, allowFlatDC));
  } else {
    // Legacy dnd5e fallback (pre-Activities)
    const actionType = String(sys.actionType || "").toLowerCase();
    const legacyParts = Array.isArray(sys.damage?.parts)
      ? sys.damage.parts.map(p => normalizeDamagePart(p, actionType === "heal" ? "healing" : "fire"))
      : [];

    if (actionType === "save" || sys.save?.ability) {
      const saveAbility = unwrapFirst(sys.save?.ability, "dex").toLowerCase() || "dex";
      const saveSuccess = sys.save?.scaling === "half" ? "half" : "none";
      const dcCalc = unwrapFirst(sys.save?.scaling).toLowerCase();
      let dc = null;
      if (allowFlatDC && dcCalc === "flat") {
        const rawFlat = Number(sys.save?.dc);
        if (Number.isFinite(rawFlat) && rawFlat > 0) dc = rawFlat;
      }
      actions.push({ id: "legacy", name: item.name || "", kind: "save", saveAbility, saveSuccess, dcCalculation: dcCalc, dc, parts: legacyParts });
    } else if (actionType === "heal") {
      const primaryType = legacyParts[0]?.types?.[0] || "healing";
      actions.push({ id: "legacy", name: item.name || "", kind: "roll", subtype: primaryType === "temphp" ? "temphp" : "heal", parts: legacyParts });
    } else if (["msak", "rsak", "mwak", "rwak"].includes(actionType) || item.hasAttack) {
      actions.push({ id: "legacy", name: item.name || "", kind: "attack", attackType: actionType || "rsak", ability: "", bonus: "", parts: legacyParts });
    } else if (legacyParts.length > 0) {
      actions.push({ id: "legacy", name: item.name || "", kind: "roll", subtype: "damage", parts: legacyParts });
    } else {
      actions.push({ id: "legacy", name: item.name || "", kind: "utility", parts: [] });
    }
  }

  return {
    id: item.id || item._id || "",
    uuid: item.uuid || "",
    name: item.name || "",
    img: item.img || "",
    level,
    school,
    spellcastingAbility,
    preparation: {
      mode: prepMode,
      prepared: Boolean(sys.prepared === true || sys.prepared === 1 || sys.preparation?.prepared === true),
      isPrepared: isSpellPrepared(item, actor)
    },
    components: { vocal, somatic, material, concentration, ritual, costly, materialDesc },
    castingTime: { cost: act?.cost ?? 1, type: act?.type || "action", label: castLabel },
    range: { value: rng?.value ?? null, units: rng?.units || "", label: rangeLabel },
    duration: { value: dur?.value ?? null, units: dur?.units || "", label: durLabel },
    target: { type: targetType, shape: areaShape, size: areaSize },
    summary,
    allowFlatDC,
    actions,
    primaryAction: actions[0] || { id: "default", name: item.name || "", kind: "utility", parts: [] }
  };
}

// ---------------------------------------------------------------------------
// Phase 2: Dynamic Spell Lookup (Actor -> World Items -> Item Compendiums)
// ---------------------------------------------------------------------------

const _spellIndexCache = new Map();

/**
 * Clear the in-memory compendium spell index cache.
 */
export function clearSpellIndexCache() {
  _spellIndexCache.clear();
}

function normalizeLookupKey(str) {
  return String(str || "").trim().toLowerCase();
}

function matchItemInList(items, key) {
  for (const item of unwrapCollection(items)) {
    if (!item || item.type !== "spell") continue;
    if (
      item.id === key ||
      item._id === key ||
      item.uuid === key ||
      normalizeLookupKey(item.name) === key
    ) {
      return item;
    }
  }
  return null;
}

/**
 * Sort Item compendiums dynamically without hardcoding system pack IDs:
 * world packs first, then packs with "spell" in id/label, then remaining Item packs.
 * @param {*} packs
 * @returns {Array}
 */
export function getOrderedSpellPacks(packs) {
  const itemPacks = unwrapCollection(packs).filter(p => {
    const docType = p?.documentName || p?.metadata?.type;
    return docType === "Item";
  });

  return itemPacks.sort((a, b) => {
    const score = (p) => {
      let s = 0;
      if (p?.metadata?.packageType === "world") s += 4;
      const label = `${p?.collection || p?.metadata?.id || ""} ${p?.metadata?.label || p?.title || ""}`.toLowerCase();
      if (label.includes("spell")) s += 2;
      return s;
    };
    return score(b) - score(a);
  });
}

/**
 * Build or retrieve a cached lightweight index of spells across all Item compendiums.
 * @param {object} [options]
 * @param {*} [options.packs]
 * @param {boolean} [options.useCache=true]
 * @returns {Promise<Array<{ _id: string, uuid: string, name: string, key: string, level: number, pack: object, packId: string }>>}
 */
export async function getSpellCompendiumIndex({ packs = null, useCache = true } = {}) {
  const sourcePacks = packs ?? globalThis.game?.packs;
  const orderedPacks = getOrderedSpellPacks(sourcePacks);
  const allEntries = [];

  for (const pack of orderedPacks) {
    const packId = pack.collection || pack.metadata?.id || pack.title || "unknown";
    if (useCache && _spellIndexCache.has(packId)) {
      allEntries.push(..._spellIndexCache.get(packId));
      continue;
    }

    let rawIndex = [];
    if (typeof pack.getIndex === "function") {
      rawIndex = await pack.getIndex({ fields: ["type", "name", "img", "system.level"] });
    } else if (pack.index) {
      rawIndex = pack.index;
    }

    const spellEntries = [];
    for (const entry of unwrapCollection(rawIndex)) {
      if (!entry || entry.type !== "spell") continue;
      spellEntries.push({
        _id: entry._id || entry.id || "",
        uuid: entry.uuid || `Compendium.${packId}.Item.${entry._id || entry.id}`,
        name: entry.name || "",
        key: normalizeLookupKey(entry.name),
        level: Number(entry.system?.level) || 0,
        pack,
        packId
      });
    }

    if (useCache) _spellIndexCache.set(packId, spellEntries);
    allEntries.push(...spellEntries);
  }

  return allEntries;
}

/**
 * Dynamically resolve a spell by name, ID, or UUID:
 * 1. Actor's owned spells
 * 2. World Items
 * 3. Discovered Item compendiums (via cached index)
 *
 * @param {string} query
 * @param {object} [options]
 * @param {object|null} [options.actor=null]
 * @param {*} [options.packs=null]
 * @param {*} [options.worldItems=null]
 * @param {boolean} [options.useCache=true]
 * @returns {Promise<{ item: object, source: "actor"|"world"|"compendium", packId: string|null }|null>}
 */
export async function resolveSpell(query, { actor = null, packs = null, worldItems = null, useCache = true } = {}) {
  const rawQuery = String(query || "").trim();
  if (!rawQuery) return null;
  const key = normalizeLookupKey(rawQuery);

  // 1. Actor items
  if (actor?.items) {
    const actorMatch = matchItemInList(actor.items, key) || matchItemInList(actor.items, rawQuery);
    if (actorMatch) return { item: actorMatch, source: "actor", packId: null };
  }

  // 2. World items
  const wItems = worldItems ?? globalThis.game?.items;
  if (wItems) {
    const worldMatch = matchItemInList(wItems, key) || matchItemInList(wItems, rawQuery);
    if (worldMatch) return { item: worldMatch, source: "world", packId: null };
  }

  // 3. Dynamic compendium lookup
  const entries = await getSpellCompendiumIndex({ packs, useCache });
  const entry = entries.find(e => e._id === rawQuery || e.uuid === rawQuery || e.key === key);
  if (!entry) return null;

  let doc = null;
  if (typeof entry.pack?.getDocument === "function") {
    doc = await entry.pack.getDocument(entry._id);
  } else if (typeof globalThis.fromUuid === "function") {
    doc = await globalThis.fromUuid(entry.uuid);
  }

  if (!doc || doc.type !== "spell") return null;
  return { item: doc, source: "compendium", packId: entry.packId };
}

/**
 * Resolve a spell and immediately return its normalized Phase 1 shape.
 * @param {string} query
 * @param {object} [options]
 * @returns {Promise<object|null>}
 */
export async function resolveNormalizedSpell(query, options = {}) {
  const found = await resolveSpell(query, options);
  if (!found?.item) return null;
  return {
    ...normalizeSpell(found.item, options.actor || null),
    _source: found.source,
    _packId: found.packId
  };
}

// ---------------------------------------------------------------------------
// Phase 3: Hybrid Execution, Upcast Scaling & Slot Helpers
// ---------------------------------------------------------------------------

/**
 * List available spell slots on an actor at or above minLevel.
 * @param {object} actor
 * @param {number} [minLevel=1]
 * @returns {Array<{ key: string, level: number, isPact: boolean, value: number, max: number }>}
 */
export function getAvailableSpellSlots(actor, minLevel = 1) {
  const spells = actor?.system?.spells;
  if (!spells || typeof spells !== "object") return [];

  const slots = [];
  for (let lvl = Math.max(1, Number(minLevel) || 1); lvl <= 9; lvl++) {
    const key = `spell${lvl}`;
    const entry = spells[key];
    const value = Number(entry?.value) || 0;
    const max = Number(entry?.max) || 0;
    if (value > 0) {
      slots.push({ key, level: lvl, isPact: false, value, max });
    }
  }

  const pact = spells.pact;
  const pactValue = Number(pact?.value) || 0;
  const pactLevel = Number(pact?.level) || 0;
  if (pactValue > 0 && pactLevel >= minLevel) {
    slots.push({
      key: "pact",
      level: pactLevel,
      isPact: true,
      value: pactValue,
      max: Number(pact?.max) || pactValue
    });
  }

  return slots.sort((a, b) => a.level - b.level);
}

/**
 * Compute upcasted or cantrip-scaled dice count and formula for a normalized damage/heal part.
 * @param {object} part - Normalized part from normalizeDamagePart
 * @param {number} baseLevel - Spell's base level (0 for cantrip)
 * @param {number} castLevel - Slot level cast at
 * @param {number} [actorLevel=1] - Character/CR level for cantrip scaling
 * @returns {{ count: number, die: string, formula: string, bonusDice: number }}
 */
export function computeUpcastFormula(part, baseLevel, castLevel, actorLevel = 1) {
  if (!part) return { count: 0, die: "d6", formula: "", bonusDice: 0 };

  let bonusDice = 0;
  const baseCount = Number(part.count) || 0;

  if (Number(baseLevel) === 0) {
    // 5e cantrip scaling tiers: 5 (+1), 11 (+2), 17 (+3)
    const lvl = Number(actorLevel) || 1;
    const tier = lvl >= 17 ? 3 : (lvl >= 11 ? 2 : (lvl >= 5 ? 1 : 0));
    if (tier > 0 && (part.scalingMode === "whole" || part.scalingMode === "cantrip" || part.scalingNumber > 0)) {
      bonusDice = tier * (part.scalingNumber || 1);
    }
  } else {
    const diff = Math.max(0, (Number(castLevel) || baseLevel) - (Number(baseLevel) || 0));
    if (diff > 0 && (part.scalingMode === "whole" || part.scalingNumber > 0)) {
      bonusDice = diff * (part.scalingNumber || 1);
    }
  }

  const count = baseCount + bonusDice;
  let formula = part.formula || "";
  if (count > 0 && part.die) {
    const bonusPart = part.addMod
      ? " + @mod"
      : (part.flatBonus ? ` + ${part.flatBonus}` : "");
    formula = `${count}${part.die}${bonusPart}`;
  }

  return { count, die: part.die || "d6", formula, bonusDice };
}

/**
 * Compute the Foundry actor.update() payload to deduct one spell slot.
 * Returns null for cantrips (castLevel <= 0) or if no matching slot is available.
 * @param {object} actor
 * @param {number} castLevel
 * @param {object} [options]
 * @param {boolean} [options.preferPact=false]
 * @returns {Record<string, number>|null}
 */
export function computeSlotConsumptionUpdate(actor, castLevel, { preferPact = false } = {}) {
  const lvl = Number(castLevel) || 0;
  if (lvl <= 0 || !actor?.system?.spells) return null;

  const available = getAvailableSpellSlots(actor, lvl);
  const exactMatches = available.filter(s => s.level === lvl);
  let chosen = null;

  if (preferPact) {
    chosen = exactMatches.find(s => s.isPact) || exactMatches[0] || available.find(s => s.isPact) || available[0];
  } else {
    chosen = exactMatches.find(s => !s.isPact) || exactMatches[0] || available[0];
  }

  if (!chosen) return null;
  return { [`system.spells.${chosen.key}.value`]: Math.max(0, chosen.value - 1) };
}

/**
 * Hybrid spell execution:
 * - mode: "delegate" invokes native dnd5e activity.use() / item.use() (for templates, concentration, etc.)
 * - mode: "custom" normalizes, scales parts for castLevel, optionally deducts a slot, and returns data for custom cards.
 *
 * @param {object} item
 * @param {object} [options]
 * @param {object|null} [options.actor=null]
 * @param {number|null} [options.castLevel=null]
 * @param {"custom"|"delegate"} [options.mode="custom"]
 * @param {boolean} [options.consumeSlot=false]
 * @param {boolean} [options.preferPact=false]
 * @param {string|null} [options.activityId=null]
 * @param {object} [options.useConfig={}]
 * @returns {Promise<object|null>}
 */
export async function castSpellHybrid(item, {
  actor = null,
  castLevel = null,
  mode = "custom",
  consumeSlot = false,
  preferPact = false,
  activityId = null,
  useConfig = {}
} = {}) {
  if (!item || item.type !== "spell") return null;

  const normalized = normalizeSpell(item, actor);
  const effectiveLevel = castLevel !== null && castLevel !== undefined
    ? Number(castLevel)
    : normalized.level;

  if (mode === "delegate") {
    const activities = unwrapCollection(item.system?.activities);
    const targetAct = activityId
      ? activities.find(a => (a.id || a._id) === activityId)
      : activities[0];

    if (targetAct && typeof targetAct.use === "function") {
      const result = await targetAct.use({ ...useConfig, spell: { slot: effectiveLevel } });
      return { delegated: true, normalized, castLevel: effectiveLevel, result };
    }
    if (typeof item.use === "function") {
      const result = await item.use({ ...useConfig, slotLevel: effectiveLevel });
      return { delegated: true, normalized, castLevel: effectiveLevel, result };
    }
  }

  const actorLevel = Number(actor?.system?.details?.level ?? actor?.system?.details?.cr ?? 1) || 1;
  const targetAction = (activityId
    ? normalized.actions.find(a => a.id === activityId)
    : null) || normalized.primaryAction;

  const scaledParts = (targetAction?.parts || []).map(p => ({
    ...p,
    ...computeUpcastFormula(p, normalized.level, effectiveLevel, actorLevel)
  }));

  let slotUpdate = null;
  if (consumeSlot && actor && effectiveLevel > 0) {
    slotUpdate = computeSlotConsumptionUpdate(actor, effectiveLevel, { preferPact });
    if (slotUpdate && typeof actor.update === "function") {
      await actor.update(slotUpdate);
    }
  }

  return {
    delegated: false,
    normalized,
    action: targetAction,
    castLevel: effectiveLevel,
    scaledParts,
    slotUpdate
  };
}

// ---------------------------------------------------------------------------
// Phase 5: Spell Quirks JSON Registry & Export Helpers
// ---------------------------------------------------------------------------

let _spellQuirks = {};
let _spellQuirksLoaded = false;

function normalizeQuirkKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, "")
    .trim();
}

/**
 * Set or merge spell quirks in memory (useful for tests or world overrides).
 * @param {Record<string, object>} map
 * @param {boolean} [merge=false]
 */
export function setSpellQuirks(map, merge = false) {
  const next = {};
  for (const [k, v] of Object.entries(map || {})) {
    if (v && typeof v === "object") {
      next[normalizeQuirkKey(k)] = v;
    }
  }
  _spellQuirks = merge ? { ..._spellQuirks, ...next } : next;
  _spellQuirksLoaded = true;
}

/**
 * Fetch and cache data/spell-quirks.json in Foundry browser environments.
 * @param {string} [url]
 * @returns {Promise<Record<string, object>>}
 */
export async function loadSpellQuirks(url) {
  if (_spellQuirksLoaded && !url) return _spellQuirks;
  const targetUrl = url || new URL("../data/spell-quirks.json", import.meta.url).href;
  try {
    if (typeof globalThis.fetch === "function") {
      const res = await globalThis.fetch(targetUrl);
      if (res.ok) {
        const json = await res.json();
        setSpellQuirks(json, false);
      }
    }
  } catch {
    // Non-fatal: fall back to empty quirks map if fetch is unavailable
  }
  return _spellQuirks;
}

/**
 * Look up a spell's quirk entry by exact normalized name or alias.
 * @param {string} spellName
 * @returns {object|null}
 */
export function getSpellQuirk(spellName) {
  const key = normalizeQuirkKey(spellName);
  if (!key) return null;
  if (_spellQuirks[key]) return _spellQuirks[key];

  for (const entry of Object.values(_spellQuirks)) {
    if (Array.isArray(entry?.aliases)) {
      const matched = entry.aliases.some(a => normalizeQuirkKey(a) === key);
      if (matched) return entry;
    }
  }
  return null;
}

/**
 * Strip actor-specific IDs from a spell config and format a clean JSON snippet
 * ready to paste into data/spell-quirks.json.
 * @param {string} spellName
 * @param {object} config
 * @returns {string}
 */
export function buildQuirkJsonSnippet(spellName, config = {}) {
  const key = normalizeQuirkKey(spellName) || "custom spell";
  const quirk = {};
  const copyKeys = [
    "isMultiAttack",
    "attackCount",
    "upcastAttacks",
    "cantripAttackScaling",
    "isCantripScale",
    "projectileCount",
    "upcastProjectiles",
    "upcastMode",
    "projectileLabel",
    "autoHit",
    "ddbDicePerUnit",
    "executionMode",
    "aliases",
    "chaosJump",
    "bounceOnDoubles",
    "damageTypeChoices",
    "conditionalDie",
    "rider"
  ];
  for (const k of copyKeys) {
    if (config[k] !== undefined && config[k] !== "" && config[k] !== null) {
      if (Array.isArray(config[k]) && config[k].length === 0) continue;
      quirk[k] = config[k];
    }
  }
  return JSON.stringify({ [key]: quirk }, null, 2);
}



