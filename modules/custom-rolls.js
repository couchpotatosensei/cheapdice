import { MODULE_ID, SETTINGS } from "../src/constants.js";
import { getButtonInfo, runHudButtonSlot } from "./token-hud.js";

// Helper: Resolve Module Socket
export function getSocket() {
  return game.modules.get(MODULE_ID)?.api?.socket || globalThis.attackSocket || null;
}

function getSetting(key, fallback = true) {
  if (game.settings.settings.has(`${MODULE_ID}.${key}`)) {
    return game.settings.get(MODULE_ID, key);
  }
  if (game.settings.settings.has(`cheapdice.${key}`)) {
    return game.settings.get("cheapdice", key);
  }
  return fallback;
}

// --- Persistent Profile Storage Helpers ---
export function getProfileData(actor, category) {
  if (!actor) return null;
  const store = (game.settings.settings.has("world.customRollProfiles") ? game.settings.get("world", "customRollProfiles") : null)
    || (game.settings.settings.has(`${MODULE_ID}.${SETTINGS.CUSTOM_ROLL_PROFILES}`) ? game.settings.get(MODULE_ID, SETTINGS.CUSTOM_ROLL_PROFILES) : null)
    || {};
  const actorStore = store[actor.id] || store[actor.name] || {};
  return actorStore[category] ?? null;
}

export async function setProfileData(actor, category, data) {
  if (!actor) return;
  if (!game.user.isGM) {
    const ALLOWED_CATEGORIES = new Set(["hudAssignedSlots", "attackConfigs", "spellConfigs"]);
    if (ALLOWED_CATEGORIES.has(category) && globalThis.attackSocket?.executeAsGM) {
      return await globalThis.attackSocket.executeAsGM("saveProfileDataAsGM", actor.id, category, data, game.user.id);
    }
    return await actor.setFlag?.("world", category, data, { recursive: false });
  }
  const isWorldSetting = game.settings.settings.has("world.customRollProfiles");
  const scope = isWorldSetting ? "world" : MODULE_ID;
  const key = isWorldSetting ? "customRollProfiles" : SETTINGS.CUSTOM_ROLL_PROFILES;
  const store = foundry.utils.deepClone(game.settings.get(scope, key) || {});
  if (!store[actor.id]) store[actor.id] = {};
  store[actor.id][category] = data;
  store[actor.id]._actorName = actor.name;
  return await game.settings.set(scope, key, store);
}

export async function ensureStandardAttacks(actor, attacks = null) {
  if (!actor) return attacks || {};
  let currentAttacks = attacks ? foundry.utils.deepClone(attacks) : (
    getProfileData(actor, "attackConfigs") ||
    actor.getFlag?.("world", "attackConfigs") || {}
  );
  currentAttacks = foundry.utils.deepClone(currentAttacks || {});

  let modified = false;

  // Feat & Class checks
  const hasTavernBrawler = actor.items?.some(i => (i.name || "").toLowerCase().includes("tavern brawler")) ?? false;
  const monkClass = actor.items?.find(i => i.type === "class" && (i.name || "").toLowerCase().includes("monk")) || actor.classes?.monk;
  const isMonk = Boolean(monkClass);
  const monkLvl = monkClass?.system?.levels || 0;
  const strMod = actor.system?.abilities?.str?.mod ?? 0;
  const dexMod = actor.system?.abilities?.dex?.mod ?? 0;

  // Monk Martial Arts scale die
  let monkDie = null;
  const scale = actor.system?.scale?.monk?.["martial-arts"] || actor.system?.scale?.["monk"]?.["martial-arts"];
  if (scale) {
    if (scale.faces) monkDie = String(scale.faces);
    else if (scale.die) monkDie = String(scale.die).replace(/^d/i, "");
    else if (scale.formula) {
      const m = String(scale.formula).match(/d(\d+)/i);
      if (m) monkDie = m[1];
    }
  }
  if (!monkDie && isMonk) {
    if (monkLvl >= 17) monkDie = "10";
    else if (monkLvl >= 11) monkDie = "8";
    else if (monkLvl >= 5) monkDie = "6";
    else monkDie = "4";
  }

  // Two-Weapon Fighting style check
  const hasTWF = actor.items?.some(i => {
    const n = (i.name || "").toLowerCase();
    return n.includes("two-weapon fighting") || n.includes("two weapon fighting") || n.includes("twf");
  }) ?? false;

  // 1. Unarmed Strike
  if (!currentAttacks["Unarmed Strike"]) {
    const unarmedAbility = (isMonk && dexMod > strMod) ? "dex" : "str";
    const unarmedDie = isMonk ? (monkDie || "4") : (hasTavernBrawler ? "4" : "none");
    const unarmedDiceCount = (isMonk || hasTavernBrawler) ? 1 : 0;
    const unarmedFlatMod = (isMonk || hasTavernBrawler) ? 0 : 1;

    currentAttacks["Unarmed Strike"] = {
      macroName: "Unarmed Strike",
      chatCardTitle: "Unarmed Strike",
      abilityScore: unarmedAbility,
      isProficient: true,
      damageDiceCount: unarmedDiceCount,
      damageDieSize: unarmedDie === "none" ? "none" : `d${unarmedDie}`,
      damageType: "bludgeoning",
      weaponModifier: 0,
      attackCircumstanceModifier: 0,
      damageModifier: unarmedFlatMod,
      CRIT_THRESHOLD: 20,
      extraCriticalBonus: "",
      GWF_REROLL_THRESHOLD: 0,
      HAS_HALFLING_LUCKY: false,
      HALFLING_LUCKY_REROLL_THRESHOLD: 1,
      superAdv: false,
      hasGWM: false,
      additionalDamageComponents: []
    };
    modified = true;
  }

  // 2. Improvised Weapon
  if (!currentAttacks["Improvised Weapon"]) {
    currentAttacks["Improvised Weapon"] = {
      macroName: "Improvised Weapon",
      chatCardTitle: "Improvised Weapon",
      abilityScore: "str",
      isProficient: hasTavernBrawler,
      damageDiceCount: 1,
      damageDieSize: "d4",
      damageType: "bludgeoning",
      weaponModifier: 0,
      attackCircumstanceModifier: 0,
      damageModifier: 0,
      CRIT_THRESHOLD: 20,
      extraCriticalBonus: "",
      GWF_REROLL_THRESHOLD: 0,
      HAS_HALFLING_LUCKY: false,
      HALFLING_LUCKY_REROLL_THRESHOLD: 1,
      superAdv: false,
      hasGWM: false,
      additionalDamageComponents: []
    };
    modified = true;
  }

  // 3. Off-Hand Attack
  if (!currentAttacks["Off-Hand Attack"]) {
    const offhandAbility = dexMod > strMod ? "dex" : "str";
    const offhandAbilityMod = actor.system?.abilities?.[offhandAbility]?.mod ?? 0;
    const offhandDmgMod = hasTWF ? 0 : (offhandAbilityMod > 0 ? -offhandAbilityMod : 0);

    currentAttacks["Off-Hand Attack"] = {
      macroName: "Off-Hand Attack",
      chatCardTitle: "Off-Hand Attack",
      abilityScore: offhandAbility,
      isProficient: true,
      damageDiceCount: 1,
      damageDieSize: "d6",
      damageType: "slashing",
      weaponModifier: 0,
      attackCircumstanceModifier: 0,
      damageModifier: offhandDmgMod,
      CRIT_THRESHOLD: 20,
      extraCriticalBonus: "",
      GWF_REROLL_THRESHOLD: 0,
      HAS_HALFLING_LUCKY: false,
      HALFLING_LUCKY_REROLL_THRESHOLD: 1,
      superAdv: false,
      hasGWM: false,
      additionalDamageComponents: []
    };
    modified = true;
  }

  if (modified) {
    if (typeof setProfileData === "function") {
      await setProfileData(actor, "attackConfigs", currentAttacks);
    }
    if (actor.setFlag) {
      await actor.setFlag("world", "attackConfigs", currentAttacks, { recursive: false });
    }
  }

  return currentAttacks;
}

/**
 * Builds a default spell config object by parsing a Foundry dnd5e spell item.
 * @param {object} item - The Foundry spell item document
 * @param {object} actor - The owning actor
 * @returns {object} The configured spell object
 */
export function buildSpellConfigFromItem(item, actor) {
  if (!item || item.type !== "spell") return null;

  const sys = item.system || {};
  const sheetSpellAbil = sys.ability || actor.system?.attributes?.spellcasting || "int";

  const act = sys.activation;
  const castStr = act?.cost ? `${act.cost} ${act.type || 'Action'}` : "1 Action";

  const rng = sys.range;
  const rangeStr = rng?.value ? `${rng.value} ${rng.units || 'ft'}` : (rng?.units || "Touch");

  const dur = sys.duration;
  const durStr = dur?.value ? `${dur.value} ${dur.units || ''}` : (dur?.units || "Instantaneous");

  const isConc = Boolean(sys.properties?.has?.("concentration") || sys.components?.concentration);

  const comps = sys.properties || sys.components || {};
  const hasV = Boolean(comps.has ? comps.has("vocal") : comps.vocal);
  const hasS = Boolean(comps.has ? comps.has("somatic") : comps.somatic);
  const hasM = Boolean(comps.has ? comps.has("material") : comps.material);
  const isCostly = Boolean(sys.materials?.cost || sys.materials?.consumed);
  const matDesc = sys.materials?.value || "";

  let targetType = "creature";
  let areaShape = "cone";
  let areaSize = "";
  const targetUnits = sys.target?.units;
  const tType = sys.target?.type;
  if (["cone", "cube", "line", "sphere", "cylinder", "radius"].includes(tType) || ["cone", "cube", "line", "sphere"].includes(targetUnits)) {
    targetType = "area";
    areaShape = (tType === "cylinder" || tType === "radius") ? "sphere" : (tType || "cone");
    areaSize = sys.target?.value ? `${sys.target.value} ft` : "";
  } else if (tType === "self" || rangeStr.toLowerCase() === "self") {
    targetType = "self";
  }

  const rawDesc = sys.description?.value || "";
  const cleanSummary = rawDesc.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);

  let resolutionMethod = "attack";
  let saveAbility = "dex";
  let saveSuccess = "half";
  let damageDiceCount = 0;
  let damageDieSize = "d6";
  let damageType = "fire";

  // Check modern dnd5e Activities (v3 / v4) or item attack flags
  const isAttackItem = Boolean(
    item.hasAttack ||
    ["msak", "rsak", "mwak", "rwak"].includes(sys.actionType)
  );

  if (sys.activities && (sys.activities.size > 0 || (typeof sys.activities.values === "function" && Array.from(sys.activities.values()).length > 0))) {
    const activities = Array.from(sys.activities.values());
    const saveAct = activities.find(a => a.type === "save" || a.save);
    const healAct = activities.find(a => a.type === "heal" || a.healing);
    const attackAct = activities.find(a => a.type === "attack" || a.attack);
    const damageAct = activities.find(a => a.type === "damage" || (a.damage?.parts && a.damage.parts.length > 0));

    if (saveAct) {
      resolutionMethod = "save";
      let rawSaveAbil = saveAct.save?.ability;
      if (rawSaveAbil instanceof Set) {
        rawSaveAbil = Array.from(rawSaveAbil)[0];
      } else if (Array.isArray(rawSaveAbil)) {
        rawSaveAbil = rawSaveAbil[0];
      } else if (typeof rawSaveAbil === "object" && rawSaveAbil?.first) {
        rawSaveAbil = rawSaveAbil.first();
      }
      saveAbility = typeof rawSaveAbil === "string" && rawSaveAbil ? rawSaveAbil : "dex";
      saveSuccess = saveAct.save?.scaling === "half" ? "half" : "none";
    } else if (healAct) {
      resolutionMethod = "heal";
    } else if (attackAct || isAttackItem) {
      resolutionMethod = "attack";
    } else if (damageAct) {
      resolutionMethod = "other";
    } else {
      resolutionMethod = "other";
    }

    // Parse damage / healing from activities
    const primaryDmgAct = damageAct || saveAct || attackAct || healAct;
    const parts = primaryDmgAct?.damage?.parts || primaryDmgAct?.healing?.parts || [];
    if (parts.length > 0) {
      const firstPart = parts[0];
      if (typeof firstPart === "object" && (firstPart.number || firstPart.denomination || firstPart.formula)) {
        damageDiceCount = Number(firstPart.number) || 1;
        damageDieSize = firstPart.denomination ? `d${firstPart.denomination}` : "d6";
        if (firstPart.types && firstPart.types.size > 0) {
          damageType = Array.from(firstPart.types)[0].toLowerCase();
        } else if (firstPart.types?.[0]) {
          damageType = String(firstPart.types[0]).toLowerCase();
        } else if (primaryDmgAct === healAct) {
          damageType = "healing";
        }
      } else if (Array.isArray(firstPart)) {
        const formula = firstPart[0] || "";
        damageType = (firstPart[1] || (primaryDmgAct === healAct ? "healing" : "fire")).toLowerCase();
        const diceMatch = String(formula).match(/(\d*)d(\d+)/i);
        if (diceMatch) {
          damageDiceCount = parseInt(diceMatch[1]) || 1;
          damageDieSize = `d${diceMatch[2]}`;
        }
      }
    }
  } else {
    // Legacy actionType / damage.parts fallback
    const actionType = sys.actionType;
    if (actionType === "save") {
      resolutionMethod = "save";
      saveAbility = sys.save?.ability || "dex";
      saveSuccess = sys.save?.scaling === "half" ? "half" : "none";
    } else if (actionType === "heal") {
      resolutionMethod = "heal";
      damageType = "healing";
    } else if (actionType === "rsak" || actionType === "msak" || item.hasAttack) {
      resolutionMethod = "attack";
    } else if (actionType === "util" || !actionType) {
      resolutionMethod = "other";
    }

    const parts = sys.damage?.parts || [];
    if (parts.length > 0) {
      const firstPart = parts[0];
      const formula = firstPart[0] || "";
      damageType = (firstPart[1] || (actionType === "heal" ? "healing" : "fire")).toLowerCase();
      const diceMatch = String(formula).match(/(\d*)d(\d+)/i);
      if (diceMatch) {
        damageDiceCount = parseInt(diceMatch[1]) || 1;
        damageDieSize = `d${diceMatch[2]}`;
      }
    }
  }

  const isCantrip = Number(sys.level ?? 0) === 0;
  const isCantripScale = isCantrip && sys.scaling?.mode === "cantrip";

  let upcastDiceFormula = "";
  if (!isCantrip && sys.scaling?.formula) {
    upcastDiceFormula = sys.scaling.formula;
  }

  return {
    itemId: item.id,
    spellName: item.name,
    spellAbility: sheetSpellAbil,
    baseLevel: Number(sys.level ?? 0),
    resolutionMethod,
    saveAbility,
    saveSuccess,
    isMultiAttack: false,
    attackCount: 1,
    upcastAttacks: 0,
    cantripAttackScaling: false,
    projectileCount: 3,
    upcastProjectiles: 1,
    addAbilityModToValue: false,
    castingTime: castStr,
    range: rangeStr,
    duration: durStr,
    concentration: isConc,
    targetType,
    areaShape,
    areaSize,
    description: rawDesc,
    summary: cleanSummary,
    damageDiceCount,
    damageDieSize,
    extraDiceFormula: "",
    upcastDiceFormula,
    damageMode: "static",
    damageType,
    flatDamageBonus: 0,
    explodeCondition: "",
    chaosJump: false,
    CRIT_THRESHOLD: 20,
    attackModifier: 0,
    isCantripScale,
    superAdv: false,
    components: {
      v: hasV,
      s: hasS,
      m: hasM,
      costly: isCostly,
      description: matDesc
    }
  };
}

/**
 * Evaluates whether a spell item is actively prepared, always available,
 * or castable as an unprepared ritual (e.g. Wizards / Ritual Casters in 2024 rules).
 * @param {object} item - The Foundry spell item document
 * @param {object} actor - The owning actor
 * @returns {boolean} True if the spell should be available in Dice Stuff
 */
export function isSpellPrepared(item, actor) {
  if (!item || item.type !== "spell") return false;

  const sys = item.system || {};
  const lvl = Number(sys.level ?? 0);

  // 1. Cantrips (Level 0) are always prepared
  if (lvl === 0) return true;

  // Modern dnd5e 5.1+ uses sys.method / sys.prepared, older uses sys.preparation
  const mode = sys.method || sys.preparation?.mode || "prepared";
  const isPrep = sys.prepared !== undefined ? Boolean(sys.prepared) : Boolean(sys.preparation?.prepared);

  // 2. Modes always castable without daily preparation: always, innate, atwill, pact
  if (["always", "innate", "atwill", "pact"].includes(mode)) return true;

  // 3. Actively prepared on the character sheet
  if (isPrep) return true;

  // 4. Wizard Ritual Exception (2024 Rules / Ritual Caster / Book of Ancient Secrets):
  // Wizards can ritual cast any ritual spell from their spellbook even if unprepared.
  const isRitual = Boolean(
    sys.properties?.has?.("ritual") ||
    sys.properties?.has?.("rit") ||
    sys.properties?.rit ||
    sys.components?.ritual
  );

  if (isRitual && actor) {
    const isWizard = Boolean(
      actor.classes?.wizard ||
      actor.itemTypes?.class?.some(c => (c.name || "").toLowerCase().includes("wizard"))
    );
    const hasRitualFeat = Boolean(
      actor.itemTypes?.feat?.some(f => {
        const n = (f.name || "").toLowerCase();
        return n.includes("ritual caster") || n.includes("book of ancient secrets");
      })
    );

    if (isWizard || hasRitualFeat) return true;
  }

  return false;
}

/**
 * Synchronizes actor's configured spells with the spell items on their sheet.
 * Only syncs prepared spells, always-available spells, cantrips, or wizard rituals.
 * Prompts user with a confirmation dialog when differences are detected.
 * @param {object} actor - The Foundry actor
 * @param {object} options
 * @param {boolean} [options.promptUser=true] - Whether to show confirmation dialog
 * @returns {Promise<boolean>} True if changes were applied
 */
export async function syncSpellsWithSheet(actor, { promptUser = true } = {}) {
  if (!actor) return false;

  const currentSpells = foundry.utils.deepClone(
    getProfileData(actor, "spellConfigs") ||
    actor.getFlag?.("world", "spellConfigs") || {}
  );

  // Filter to spells that are prepared or always available for this actor
  const sheetSpells = (actor.itemTypes?.spell || [])
    .filter(sp => isSpellPrepared(sp, actor))
    .sort((a, b) => a.name.localeCompare(b.name));

  const sheetSpellNames = new Set(sheetSpells.map(s => s.name));
  const sheetSpellIds = new Set(sheetSpells.map(s => s.id));

  // Determine spells to add or update
  const toAdd = [];
  const toUpdate = [];

  for (const spItem of sheetSpells) {
    const existingKey = Object.keys(currentSpells).find(k => k === spItem.name || currentSpells[k]?.itemId === spItem.id);
    if (!existingKey) {
      toAdd.push(spItem);
    } else {
      toUpdate.push({ item: spItem, key: existingKey });
    }
  }

  // Determine spells to remove (in spellConfigs, originated from sheet, but no longer on sheet)
  const toRemove = [];
  for (const [key, cfg] of Object.entries(currentSpells)) {
    // Only auto-prune if config was linked to a sheet item or matched a sheet spell name
    if (cfg?.itemId && !sheetSpellIds.has(cfg.itemId) && !sheetSpellNames.has(key)) {
      toRemove.push(key);
    }
  }

  if (toAdd.length === 0 && toRemove.length === 0) {
    // Refresh definitions for all existing sheet spells without altering custom favorites/HUD slots
    let updatedAny = false;
    for (const { item: spItem, key } of toUpdate) {
      const freshCfg = buildSpellConfigFromItem(spItem, actor);
      if (freshCfg) {
        // Preserve user state (favorites, custom assignments)
        freshCfg.isFavorite = currentSpells[key]?.isFavorite ?? false;
        currentSpells[key] = freshCfg;
        updatedAny = true;
      }
    }

    if (updatedAny) {
      await setProfileData(actor, "spellConfigs", currentSpells);
      if (game.user.isGM) {
        await actor.setFlag("world", "spellConfigs", currentSpells, { recursive: false });
      }
    }
    return updatedAny;
  }

  if (promptUser) {
    const addListHtml = toAdd.length > 0
      ? `<div style="margin-bottom: 8px;">
          <div style="font-weight: bold; font-size: 0.85em; color: #2e7d32; margin-bottom: 4px;">
            <i class="fas fa-plus-circle"></i> Spells to Add (${toAdd.length}):
          </div>
          <ul style="margin: 0; padding-left: 18px; font-size: 0.82em; color: #333;">
            ${toAdd.map(s => `<li><strong>${s.name}</strong> <span style="color: #666;">(Level ${s.system.level ?? 0})</span></li>`).join("")}
          </ul>
        </div>`
      : "";

    const removeListHtml = toRemove.length > 0
      ? `<div style="margin-bottom: 8px;">
          <div style="font-weight: bold; font-size: 0.85em; color: #c62828; margin-bottom: 4px;">
            <i class="fas fa-minus-circle"></i> Spells to Remove (${toRemove.length}):
          </div>
          <ul style="margin: 0; padding-left: 18px; font-size: 0.82em; color: #333;">
            ${toRemove.map(name => `<li><strong>${name}</strong> <span style="color: #888;">(no longer on sheet)</span></li>`).join("")}
          </ul>
          <div style="font-size: 0.72em; color: #888; font-style: italic; margin-top: 2px;">
            Note: Removing these will also unassign them from any HUD slots.
          </div>
        </div>`
      : "";

    const content = `
      <div style="padding: 6px; font-family: inherit;">
        <p style="margin: 0 0 8px 0; font-size: 0.88em; color: #333;">
          Differences were detected between the character sheet and Dice Stuff spell configurations:
        </p>
        ${addListHtml}
        ${removeListHtml}
        <p style="margin: 8px 0 0 0; font-size: 0.85em; font-weight: bold; color: #4b5d88;">
          Apply these changes now?
        </p>
      </div>
    `;

    const confirmed = await new Promise(resolve => {
      new Dialog({
        title: `Sync Spells: ${actor.name}`,
        content,
        buttons: {
          confirm: {
            icon: '<i class="fas fa-sync-alt"></i>',
            label: "Sync Changes",
            callback: () => resolve(true)
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => resolve(false)
          }
        },
        default: "confirm",
        close: () => resolve(false)
      }, { width: 380 }).render(true);
    });

    if (!confirmed) return false;
  }

  // Apply additions
  for (const spItem of toAdd) {
    const cfg = buildSpellConfigFromItem(spItem, actor);
    if (cfg) {
      currentSpells[spItem.name] = cfg;
    }
  }

  // Also refresh definitions for existing spells while preserving favorite status
  for (const { item: spItem, key } of toUpdate) {
    const freshCfg = buildSpellConfigFromItem(spItem, actor);
    if (freshCfg) {
      freshCfg.isFavorite = currentSpells[key]?.isFavorite ?? false;
      currentSpells[key] = freshCfg;
    }
  }

  // Apply removals
  let assignedSlots = foundry.utils.deepClone(
    getProfileData(actor, "hudAssignedSlots") ||
    actor.getFlag?.("world", "hudAssignedSlots") || {}
  );
  let hudModified = false;

  for (const remKey of toRemove) {
    delete currentSpells[remKey];
    for (const [slotNum, slotData] of Object.entries(assignedSlots)) {
      if (slotData?.category === "spells" && slotData?.name === remKey) {
        delete assignedSlots[slotNum];
        hudModified = true;
      }
    }
  }

  // Sort alphabetically by spell name before persisting
  const sortedSpells = {};
  for (const k of Object.keys(currentSpells).sort((a, b) => a.localeCompare(b))) {
    sortedSpells[k] = currentSpells[k];
  }
  currentSpells = sortedSpells;

  // Save updated spell configs
  await setProfileData(actor, "spellConfigs", currentSpells);
  if (game.user.isGM) {
    await actor.setFlag("world", "spellConfigs", currentSpells, { recursive: false });
  }

  if (hudModified) {
    await setProfileData(actor, "hudAssignedSlots", assignedSlots);
    if (game.user.isGM) {
      await actor.setFlag("world", "hudAssignedSlots", assignedSlots, { recursive: false });
    }
    canvas.tokens?.controlled?.forEach(t => t.hud?.render());
  }

  const changeMsg = [];
  if (toAdd.length > 0) changeMsg.push(`added ${toAdd.length} spell${toAdd.length === 1 ? '' : 's'}`);
  if (toRemove.length > 0) changeMsg.push(`removed ${toRemove.length} spell${toRemove.length === 1 ? '' : 's'}`);
  ui.notifications.info(`Spells synced with character sheet: ${changeMsg.join(", ")}.`);

  return true;
}

export function initCustomRolls() {
  if (!game.settings.get(MODULE_ID, SETTINGS.FEATURES.CUSTOM_ROLLS)) return;

  window.CustomRolls = window.CustomRolls || {};
  window.CustomRolls.getProfileData = getProfileData;
  window.CustomRolls.setProfileData = setProfileData;
  window.CustomRolls.ensureStandardAttacks = ensureStandardAttacks;
  window.CustomRolls.syncSpellsWithSheet = syncSpellsWithSheet;
  window.CustomRolls.buildSpellConfigFromItem = buildSpellConfigFromItem;

  const mod = game.modules.get(MODULE_ID);
  if (mod?.api) {
    mod.api.getProfileData = getProfileData;
    mod.api.setProfileData = setProfileData;
    mod.api.ensureStandardAttacks = ensureStandardAttacks;
    mod.api.syncSpellsWithSheet = syncSpellsWithSheet;
    mod.api.buildSpellConfigFromItem = buildSpellConfigFromItem;
  }

  // Hook into D&D 5e rest completion to auto-recharge tracking stuff
  Hooks.on("dnd5e.restCompleted", async (actor, data) => {
    if (!actor || !actor.isOwner) return;
    const restType = (data?.longRest || data?.restType === "long") ? "lr" : "sr";
    if (typeof window.CustomRolls?.rechargeActorTrackers === "function") {
      await window.CustomRolls.rechargeActorTrackers(actor, restType);
    }
  });

  // Support interactive click buttons on Spell Save DC cards (works across v12/v13/v14)
  const hookName = (foundry.utils.isNewerVersion?.(game.version, "13") || Number(game.release?.generation ?? 12) >= 13)
    ? "renderChatMessageHTML"
    : "renderChatMessage";

  Hooks.on(hookName, (message, html) => {
    const root = html instanceof HTMLElement ? html : html[0];
    if (!root) return;

    root.querySelectorAll(".cheapdice-dc-save-btn").forEach((btn) => {
      if (btn.dataset.cheapdiceBound) return;
      btn.dataset.cheapdiceBound = "true";

      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const abil = btn.dataset.ability;
        if (!abil) return;

        // Determine rolling actor: controlled token -> targeted token -> user's assigned character
        const controlledToken = canvas?.tokens?.controlled?.[0];
        const assignedActor = controlledToken?.actor || game.user?.character || null;

        if (!assignedActor) {
          return ui.notifications.warn("Please select your token to roll a saving throw.");
        }

        if (typeof assignedActor.rollSavingThrow === "function") {
          return assignedActor.rollSavingThrow({ ability: abil });
        }
        if (typeof assignedActor.rollAbilitySave === "function") {
          return assignedActor.rollAbilitySave(abil);
        }

        // Fallback to socket handler if standard sheet roll is unavailable
        if (globalThis.attackSocket) {
          await globalThis.attackSocket.executeAsGM("runD20TestRoll", {
            rollType: "save",
            key: `save_${abil}`,
            isReliableTalent: false,
            isHalflingLuck: false,
            otherModString: ""
          }, assignedActor.id, game.user.id);
        }
      });
    });
  });

  // --- 3.1 D20 Test Client-Side Dialog Launcher ---
  window.CustomRolls.openD20Dialog = function () {
    if (!getSetting("featureCustomRolls")) return;

    const token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;

    if (!token) {
      return ui.notifications.warn("Please select your token first.");
    }

    const actor = token.actor;
    if (!actor || !actor.isOwner) {
      return ui.notifications.warn("You don't have permissions to use this token.");
    }

    function getNumericValue(val, fallback = 0) {
      if (typeof val === "number" && !isNaN(val)) return val;
      if (val && typeof val === "object" && typeof val.value === "number") return val.value;
      const parsed = Number(val);
      return isNaN(parsed) ? fallback : parsed;
    }

    function formatSign(num) {
      return num >= 0 ? `+${num}` : `${num}`;
    }

    const storedProfiles = window.CustomRolls.getProfileData(actor, "d20Profiles") || actor.getFlag("world", "d20Profiles") || {};

    const TOOLS = {
      alchemist: { name: "Alchemist Supplies", ability: "int", desc: "Utilize: Identify a substance (DC 15), or start a fire (DC 15)\n\nCraft: Acid, Alchemist’s Fire, Component Pouch, Oil, Paper, Perfume" },
      brewer: { name: "Brewer's Supplies", ability: "int", desc: "Utilize: Detect poisoned drink (DC 15), or identify alcohol (DC 10)\n\nCraft: Antitoxin" },
      calligrapher: { name: "Calligrapher's Supplies", ability: "dex", desc: "Utilize: Write text with impressive flourishes that guard against forgery (DC 15)\n\nCraft: Ink, Spell Scroll" },
      carpenter: { name: "Carpenter's Tools", ability: "str", desc: "Utilize: Seal or pry open a door or container (DC 20)\n\nCraft: Club, Greatclub, Quarterstaff, Barrel, Chest, Ladder, Pole, Portable Ram, Torch" },
      cartographer: { name: "Cartographer's Tools", ability: "wis", desc: "Utilize: Draft a map of a small area (DC 15)\n\nCraft: Map" },
      cobbler: { name: "Cobbler's Tools", ability: "dex", desc: "Utilize: Modify footwear to give Advantage on the wearer’s next Dexterity (Acrobatics) check (DC 10)\n\nCraft: Climber’s Kit" },
      cook: { name: "Cook's Utensils", ability: "wis", desc: "Utilize: Improve food’s flavor (DC 10), or detect spoiled or poisoned food (DC 15)\n\nCraft: Rations" },
      disguise: { name: "Disguise Kit", ability: "cha", desc: "Utilize: Apply makeup (DC 10)\n\nCraft: Costume" },
      forgery: { name: "Forgery Kit", ability: "dex", desc: "Utilize: Mimic 10 or fewer words of someone else’s handwriting (DC 15), or duplicate a wax seal (DC 20)" },
      gaming: { name: "Gaming Set", ability: "wis", desc: "Utilize: Discern whether someone is cheating (DC 10), or win the game (DC 20)" },
      glassblower: { name: "Glassblower's Tools", ability: "int", desc: "Utilize: Discern what a glass object held in the past 24 hours (DC 15)\n\nCraft: Glass Bottle, Magnifying Glass, Spyglass, Vial" },
      herbalism: { name: "Herbalism Kit", ability: "int", desc: "Utilize: Identify a plant (DC 10)\n\nCraft: Antitoxin, Candle, Healer’s Kit, Potion of Healing" },
      jeweler: { name: "Jeweler's Tools", ability: "int", desc: "Utilize: Discern a gem’s value (DC 15)\n\nCraft: Arcane Focus, Holy Symbol" },
      leatherworker: { name: "Leatherworker's Tools", ability: "dex", desc: "Utilize: Add a design to a leather item (DC 10)\n\nCraft: Sling, Whip, Hide Armor, Leather Armor, Studded Leather Armor, Backpack, Crossbow Bolt Case, Map or Scroll Case, Parchment, Pouch, Quiver, Waterskin" },
      mason: { name: "Mason's Tools", ability: "str", desc: "Utilize: Chisel a symbol or hole in stone (DC 10)\n\nCraft: Block and Tackle" },
      musical: { name: "Musical Instrument", ability: "cha", desc: "Utilize: Play a known tune (DC 10), or improvise a song (DC 15)" },
      navigator: { name: "Navigator's Tools", ability: "wis", desc: "Utilize: Plot a course (DC 10), or determine position by stargazing (DC 15)" },
      painter: { name: "Painter's Supplies", ability: "wis", desc: "Utilize: Paint a recognizable image of something you’ve seen (DC 10)\n\nCraft: Druidic Focus, Holy Symbol" },
      poisoner: { name: "Poisoner's Kit", ability: "int", desc: "Utilize: Detect a poisoned object (DC 10)" },
      potter: { name: "Potter's Tools", ability: "int", desc: "Utilize: Discern what a ceramic object held in the past 24 hours (DC 15)\n\nCraft: Jug, Lamp" },
      smith: { name: "Smith's Tools", ability: "str", desc: "Utilize: Pry open a door or container (DC 20)\n\nCraft: Any Melee weapon (except Club, Greatclub, Quarterstaff, and Whip), Medium armor (except Hide), Heavy armor, Ball Bearings, Bucket, Caltrops, Chain, Crowbar, Firearm Bullets, Grappling Hook, Iron Pot, Iron Spikes, Sling Bullets" },
      thieves: { name: "Thieves' Tools", ability: "dex", desc: "Utilize: Pick a lock (DC 15), or disarm a trap (DC 15)" },
      tinker: { name: "Tinker's Tools", ability: "dex", desc: "Utilize: Assemble a Tiny item composed of scrap, which falls apart in 1 minute (DC 20)\n\nCraft: Musket, Pistol, Bell, Bullseye Lantern, Flask, Hooded Lantern, Hunting Trap, Lock, Manacles, Mirror, Shovel, Signal Whistle, Tinderbox" },
      weaver: { name: "Weaver's Tools", ability: "dex", desc: "Utilize: Mend a tear in clothing (DC 10), or sew a Tiny design (DC 10)\n\nCraft: Padded Armor, Basket, Bedroll, Blanket, Fine Clothes, Net, Robe, Rope, Sack, String, Tent, Traveler's Clothes" },
      woodcarver: { name: "Woodcarver's Tools", ability: "dex", desc: "Utilize: Carve a pattern in wood (DC 10)\n\nCraft: Club, Greatclub, Quarterstaff, Ranged weapons (except Pistol, Musket, and Sling), Arcane Focus, Arrows, Bolts, Druidic Focus, Ink Pen, Needles" }
    };

    const DESCRIPTIONS = {
      acr: "Stay on your feet in a tricky situation, or perform an acrobatic stunt.",
      ani: "Calm or train an animal, or get an animal to behave in a certain way.",
      arc: "Recall lore about spells, magic items, and the planes of existence.",
      ath: "Jump farther than normal, stay afloat in rough water, or break something.",
      dec: "Tell a convincing lie, or wear a disguise convincingly.",
      his: "Recall lore about historical events, people, nations, and cultures.",
      ins: "Discern a person’s mood and intentions.",
      itm: "Awe or threaten someone into doing what you want.",
      inv: "Find obscure information in books, or deduce how something works.",
      med: "Diagnose an illness, or determine what killed the recently slain.",
      nat: "Recall lore about terrain, plants, animals, and weather.",
      prc: "Using a combination of senses, notice something that’s easy to miss.",
      prf: "Act, tell a story, perform music, or dance.",
      per: "Honestly and graciously convince someone of something.",
      rel: "Recall lore about gods, religious rituals, and holy symbols.",
      slt: "Pick a pocket, conceal a handheld object, or perform legerdemain.",
      ste: "Escape notice by moving quietly and hiding behind things.",
      sur: "Follow tracks, forage, find a trail, or avoid natural hazards.",

      check_str: "Measures bodily power, athletic training, and the extent to which you can exert raw physical force.\n\nUse to lift, push, pull, or break something.",
      check_dex: "Measures agility, reflexes, balance, fine motor control, and swift movement.\n\nUse to move nimbly, quickly, or quietly.",
      check_con: "Measures health, stamina, vital force, and bodily endurance under strain.\n\nUse to push your body beyond normal limits.",
      check_int: "Measures mental acuity, accuracy of recall, and the ability to reason logically.\n\nUse to reason or remember.",
      check_wis: "Reflects how attuned you are to your surroundings and represents perceptiveness, intuition, and willpower.\n\nUse to notice things in the environment or in creature's behavior.",
      check_cha: "Measures your ability to interact effectively with others, confidence, eloquence, and forceful personality.\n\nUse to influence, entertain or deceive.",

      save_str: "Resisting effects that physically push, knock down, restrain, or crush you.",
      save_dex: "Dodging out of harm's way, avoiding area-of-effect spells like Fireball, or evading sudden hazards and traps.",
      save_con: "Withstanding poisons, diseases, toxic gases, extreme exhaustion, or cold and heat hazards.",
      save_int: "Resisting psychic incursions or illusions that challenge logic.",
      save_wis: "Resisting charm effects, fright, mind control, or magical influence aimed at your willpower.",
      save_cha: "Resisting effects that banish you to other planes, override your self-identity, or possess your spirit.",

      concentration: "Maintaining focus on an ongoing spell when you take damage. The DC is 10 or half the damage taken, whichever is higher.",
      init: "Determines turn order at the start of combat. Tied rolls are broken by the higher raw Dexterity score."
    };

    const ABILITIES = {
      str: "Strength",
      dex: "Dexterity",
      con: "Constitution",
      int: "Intelligence",
      wis: "Wisdom",
      cha: "Charisma"
    };

    const SKILLS = {
      acr: "Acrobatics (DEX)",
      ani: "Animal Handling (WIS)",
      arc: "Arcana (INT)",
      ath: "Athletics (STR)",
      dec: "Deception (CHA)",
      his: "History (INT)",
      ins: "Insight (WIS)",
      itm: "Intimidation (CHA)",
      inv: "Investigation (INT)",
      med: "Medicine (WIS)",
      nat: "Nature (INT)",
      prc: "Perception (WIS)",
      prf: "Performance (CHA)",
      per: "Persuasion (CHA)",
      rel: "Religion (INT)",
      slt: "Sleight of Hand (DEX)",
      ste: "Stealth (DEX)",
      sur: "Survival (WIS)"
    };

    const pb = getNumericValue(actor.system.attributes?.prof, 2);

    const customTests = {};
    Object.entries(storedProfiles).forEach(([k, val]) => {
      if (k.startsWith("custom_")) {
        const abil = val.ability || "int";
        const abilMod = getNumericValue(actor.system.abilities?.[abil]?.mod, 0);
        const cat = val.category || "skill";
        const optHtml = `<option value="${k}" data-custom="true" data-abil="${abil}">${val.name} (${abil.toUpperCase()}) ${formatSign(abilMod)}</option>`;
        if (!customTests[cat]) customTests[cat] = [];
        customTests[cat].push(optHtml);
      }
    });

    const toolEntries = Object.entries(TOOLS).sort((a, b) => a[1].name.localeCompare(b[1].name));
    const toolOptionsHtml = [
      ...toolEntries.map(([k, t]) => {
        const abilMod = getNumericValue(actor.system.abilities?.[t.ability]?.mod, 0);
        const toolItem = actor.items.find(i => i.type === "tool" && i.name.toLowerCase().includes(t.name.toLowerCase().split("'")[0]));
        const isProf = actor.system.tools?.[k]?.proficient || toolItem?.system?.proficient || 0;
        const bonus = abilMod + (isProf ? pb * (isProf === 2 ? 2 : 1) : 0);
        return `<option value="${k}">${t.name} (${t.ability.toUpperCase()}) ${formatSign(bonus)}</option>`;
      }),
      ...(customTests["tool"] || [])
    ].join('');

    const standardSkillOptions = Object.keys(SKILLS).map(k => {
      const mod = getNumericValue(actor.system.skills?.[k]?.total, 0);
      return `<option value="${k}">${SKILLS[k]} ${formatSign(mod)}</option>`;
    });
    const skillOptionsHtml = [...standardSkillOptions, ...(customTests["skill"] || [])].join('');

    const checkOptionsHtml = [
      ...Object.keys(ABILITIES).map(k => {
        const mod = getNumericValue(actor.system.abilities?.[k]?.mod, 0);
        return `<option value="${k}">${ABILITIES[k]} Check ${formatSign(mod)}</option>`;
      }),
      ...(customTests["check"] || [])
    ].join('');

    const saveOptionsHtml = Object.keys(ABILITIES).map(k => {
      const saveObj = actor.system.abilities?.[k]?.save;
      const modObj = actor.system.abilities?.[k]?.mod;
      const mod = getNumericValue(saveObj, getNumericValue(modObj, 0));
      return `<option value="${k}">${ABILITIES[k]} Save ${formatSign(mod)}</option>`;
    }).join('');

    const conMod = getNumericValue(actor.system.abilities?.con?.mod, 0);
    const rawConSave = getNumericValue(actor.system.abilities?.con?.save, null);
    let conSaveTotal = conMod;
    if (rawConSave !== null) {
      conSaveTotal = rawConSave;
    } else {
      const isProf = actor.system.abilities?.con?.proficient || actor.system.abilities?.con?.prof;
      conSaveTotal = conMod + (isProf ? pb : 0);
    }

    const dexMod = getNumericValue(actor.system.abilities?.dex?.mod, 0);
    const dexScore = getNumericValue(actor.system.abilities?.dex?.value, 10);
    const initBonus = getNumericValue(actor.system.attributes?.init?.bonus, 0);
    const alertBonus = actor.items.some(i => i.name?.toLowerCase().includes("alert")) ? 5 : 0;
    const totalInitMod = dexMod + initBonus + alertBonus;

    const content = `
    <div style="display: flex; gap: 12px; font-family: inherit; min-height: 270px;">
      <div style="flex: 1.2; display: flex; flex-direction: column; gap: 8px; border-right: 1px solid #d2d7df; padding-right: 10px;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 4px;">
          <span style="font-weight: 600; font-size: 0.95em; color: #2b3a4a;">D20 Test Roll</span>
          <span style="font-size: 0.8em; color: #777;">${actor.name}</span>
        </div>

        <div>
          <label style="font-weight: 700; font-size: 0.75em; color: #4b5d88; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">ROLL TYPE</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85em; cursor: pointer; padding: 4px 6px; background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px;">
              <input type="radio" name="roll-type" value="skill" checked style="margin: 0;"> Skill Check
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85em; cursor: pointer; padding: 4px 6px; background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px;">
              <input type="radio" name="roll-type" value="check" style="margin: 0;"> Ability Check
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85em; cursor: pointer; padding: 4px 6px; background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px;">
              <input type="radio" name="roll-type" value="save" style="margin: 0;"> Saving Throw
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85em; cursor: pointer; padding: 4px 6px; background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px;">
              <input type="radio" name="roll-type" value="tool" style="margin: 0;"> Tool Check
            </label>
            <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer; padding: 4px 6px; background: rgba(163, 72, 72, 0.08); border: 1px solid rgba(163, 72, 72, 0.35); border-radius: 4px;">
              <span style="display: flex; align-items: center; gap: 6px;">
                <input type="radio" name="roll-type" value="concentration" style="margin: 0;"> Concentration
              </span>
              <span style="font-size: 0.78em; font-weight: 700; color: #a34848;">${formatSign(conSaveTotal)}</span>
            </label>
            <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer; padding: 4px 6px; background: rgba(43, 116, 137, 0.08); border: 1px solid rgba(43, 116, 137, 0.35); border-radius: 4px;">
              <span style="display: flex; align-items: center; gap: 6px;">
                <input type="radio" name="roll-type" value="init" style="margin: 0;"> Initiative
              </span>
              <span style="font-size: 0.78em; font-weight: 700; color: #235d6e;">${formatSign(totalInitMod)} .${dexScore}</span>
            </label>
          </div>
        </div>

        <div id="roll-options-section">
          <label id="options-label" style="font-weight: 700; font-size: 0.75em; color: #4b5d88; letter-spacing: 0.5px; display: block; margin-bottom: 3px;">SELECT SKILL</label>
          <select id="roll-choice" name="roll-choice" style="width: 100%; height: 30px; border-radius: 4px; border: 1px solid #7289da; padding: 2px 6px; font-size: 0.9em;">
            ${skillOptionsHtml}
          </select>
        </div>

        <div id="preset-modifiers-section" style="display: none; flex-direction: column; gap: 3px; background: rgba(0,0,0,0.02); border: 1px dashed #c0c6ce; border-radius: 4px; padding: 4px 6px;">
          <label style="font-weight: 700; font-size: 0.72em; color: #4b5d88; letter-spacing: 0.5px;">PRESET MODIFIERS</label>
          <div id="preset-list" style="display: flex; flex-direction: column; gap: 3px;"></div>
        </div>

        <div>
          <label for="other-modifier" style="font-weight: 700; font-size: 0.75em; color: #4b5d88; letter-spacing: 0.5px; display: block; margin-bottom: 3px;">EXTRA MODIFIER</label>
          <input type="text" id="other-modifier" name="other-modifier" value="" placeholder="e.g. 1d4, +2, or leave blank" style="width: 100%; height: 28px; border-radius: 4px; border: 1px solid #ccc; padding: 2px 6px; font-size: 0.85em;" />
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px; border-top: 1px solid #e0e0e0; padding-top: 6px; margin-top: 2px;">
          <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82em; cursor: pointer; padding: 2px 4px; color: #333;">
            <span>Reliable Talent (Min 10)</span>
            <input type="checkbox" id="reliable-talent" name="reliable-talent" style="margin: 0;">
          </label>
          <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82em; cursor: pointer; padding: 2px 4px; color: #333;">
            <span>Halfling Luck (Reroll 1s)</span>
            <input type="checkbox" id="halfling-luck" name="halfling-luck" style="margin: 0;">
          </label>
        </div>
      </div>

      <div style="flex: 1; display: flex; flex-direction: column; background: rgba(0,0,0,0.02); border-radius: 4px; padding: 8px 10px; border: 1px solid #e2e6ea;">
        <div style="border-bottom: 1px solid #d2d7df; padding-bottom: 4px; margin-bottom: 8px;">
          <div id="desc-title" style="font-weight: 700; font-size: 0.85em; color: #2b3a4a; text-transform: uppercase; letter-spacing: 0.5px;">Acrobatics</div>
          <div id="desc-subtitle" style="font-size: 0.75em; color: #777;">Skill Check</div>
        </div>
        <div id="desc-body" style="font-size: 0.82em; line-height: 1.45; color: #444; overflow-y: auto; flex: 1; white-space: pre-wrap;">
          ${DESCRIPTIONS.acr}
        </div>
      </div>
    </div>
  `;

    let performRoll = false;

    new Dialog({
      title: `${actor.name}: D20 Test`,
      content: content,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d20" style="margin-right: 4px;"></i>',
          label: "Roll",
          callback: () => { performRoll = true; }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll",
      render: (html) => {
        const rollChoiceSelect = html.find('#roll-choice');
        const optionsSection = html.find('#roll-options-section');
        const optionsLabel = html.find('#options-label');
        const presetSection = html.find('#preset-modifiers-section');
        const presetList = html.find('#preset-list');
        const reliableTalentCheckbox = html.find('#reliable-talent');
        const halflingLuckCheckbox = html.find('#halfling-luck');
        const descTitle = html.find('#desc-title');
        const descSubtitle = html.find('#desc-subtitle');
        const descBody = html.find('#desc-body');

        const updatePresets = () => {
          const choice = rollChoiceSelect.val();
          const profileObj = storedProfiles[choice];
          const activePresets = Array.isArray(profileObj) ? profileObj : (profileObj?.modifiers || []);

          if (activePresets.length > 0) {
            const listHtml = activePresets.map((p, idx) => `
            <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8em; cursor: pointer; padding: 2px 4px; background: #fff; border: 1px solid #d2d7df; border-radius: 3px;">
              <span>${p.label} <b style="color: #4b5d88;">(${p.formula})</b></span>
              <input type="checkbox" class="preset-mod-toggle" data-formula="${p.formula}" ${p.enabled ? 'checked' : ''} style="margin: 0;">
            </label>
          `).join('');
            presetList.html(listHtml);
            presetSection.css('display', 'flex');
          } else {
            presetSection.hide();
            presetList.empty();
          }
        };

        const updateDescription = () => {
          const selectedType = html.find('input[name="roll-type"]:checked').val();
          const choice = rollChoiceSelect.val();

          if (choice && choice.startsWith("custom_")) {
            const customData = storedProfiles[choice];
            const name = customData?.name || "Custom Test";
            const abil = (customData?.ability || "int").toUpperCase();
            descTitle.text(name);
            descSubtitle.text(`Custom ${abil} Test`);
            descBody.text(`Custom D20 check governed by ${actor.name}'s ${abil} modifier.`);
          } else if (selectedType === 'skill') {
            const selectedText = rollChoiceSelect.find('option:selected').text();
            descTitle.text(selectedText.split(' (')[0] || "Skill");
            descSubtitle.text("Skill Check");
            descBody.text(DESCRIPTIONS[choice] || "No description available.");
          } else if (selectedType === 'tool') {
            const tool = TOOLS[choice];
            descTitle.text(tool?.name || "Tool");
            descSubtitle.text(`${tool?.ability.toUpperCase()} Tool Check`);
            descBody.text(tool?.desc || "No description available.");
          } else if (selectedType === 'save') {
            const abilName = ABILITIES[choice] || choice?.toUpperCase();
            descTitle.text(`${abilName} Save`);
            descSubtitle.text("Saving Throw");
            descBody.text(DESCRIPTIONS[`save_${choice}`] || "No description available.");
          } else if (selectedType === 'check') {
            const abilName = ABILITIES[choice] || choice?.toUpperCase();
            descTitle.text(`${abilName} Check`);
            descSubtitle.text("Ability Check");
            descBody.text(DESCRIPTIONS[`check_${choice}`] || "No description available.");
          } else if (selectedType === 'concentration') {
            descTitle.text("Concentration");
            descSubtitle.text("Constitution Check");
            descBody.text(DESCRIPTIONS.concentration);
          } else if (selectedType === 'init') {
            descTitle.text("Initiative");
            descSubtitle.text("Dexterity Check");
            descBody.text(DESCRIPTIONS.init);
          }

          updatePresets();
        };

        const updateOptions = () => {
          const selectedType = html.find('input[name="roll-type"]:checked').val();

          if (selectedType === 'skill') {
            optionsSection.show();
            optionsLabel.text('SELECT SKILL');
            rollChoiceSelect.html(skillOptionsHtml);
            reliableTalentCheckbox.prop('disabled', false).parent().css('opacity', 1);
            halflingLuckCheckbox.prop('disabled', false).parent().css('opacity', 1);
          } else if (selectedType === 'check') {
            optionsSection.show();
            optionsLabel.text('SELECT ABILITY CHECK');
            rollChoiceSelect.html(checkOptionsHtml);
            reliableTalentCheckbox.prop('disabled', true).prop('checked', false).parent().css('opacity', 0.5);
            halflingLuckCheckbox.prop('disabled', false).parent().css('opacity', 1);
          } else if (selectedType === 'save') {
            optionsSection.show();
            optionsLabel.text('SELECT SAVING THROW');
            rollChoiceSelect.html(saveOptionsHtml);
            reliableTalentCheckbox.prop('disabled', true).prop('checked', false).parent().css('opacity', 0.5);
            halflingLuckCheckbox.prop('disabled', false).parent().css('opacity', 1);
          } else if (selectedType === 'tool') {
            optionsSection.show();
            optionsLabel.text('SELECT TOOL');
            rollChoiceSelect.html(toolOptionsHtml);
            reliableTalentCheckbox.prop('disabled', false).parent().css('opacity', 1);
            halflingLuckCheckbox.prop('disabled', false).parent().css('opacity', 1);
          } else {
            optionsSection.hide();
            presetSection.hide();
            reliableTalentCheckbox.prop('disabled', true).prop('checked', false).parent().css('opacity', 0.5);
            halflingLuckCheckbox.prop('disabled', false).parent().css('opacity', 1);
          }

          updateDescription();
        };

        updateOptions();
        html.find('input[name="roll-type"]').on('change', updateOptions);
        rollChoiceSelect.on('change', updateDescription);
      },
      close: async (html) => {
        if (!performRoll) return;

        const rollType = html.find('input[name="roll-type"]:checked').val();
        const key = html.find('#roll-choice').val();
        const isReliableTalent = html.find('#reliable-talent').is(':checked');
        const isHalflingLuck = html.find('#halfling-luck').is(':checked');

        const activePresetFormulas = [];
        html.find('.preset-mod-toggle:checked').each((_, el) => {
          const form = $(el).data('formula');
          if (form) activePresetFormulas.push(form);
        });

        const manualMod = html.find('#other-modifier').val()?.trim() || "";
        if (manualMod) activePresetFormulas.push(manualMod);

        const otherModString = activePresetFormulas.join(" + ");

        if (!globalThis.attackSocket) {
          return ui.notifications.error("SocketLib attack handler is not initialized. Please refresh the page.");
        }

        await globalThis.attackSocket.executeAsGM("runD20TestRoll", {
          rollType,
          key,
          isReliableTalent,
          isHalflingLuck,
          otherModString
        }, actor.id, game.user.id);
      }
    }, { width: 560, height: 'auto' }).render(true);
  };

  // =========================================================================
  // VERSION 2: D20 TEST MINI CHARACTER SHEET DATA & VIEW BUILDER
  // =========================================================================
  function getD20V2Data(actor) {

    function getNumericValue(val, fallback = 0) {
      if (typeof val === "number" && !isNaN(val)) return val;
      if (val && typeof val === "object" && typeof val.value === "number") return val.value;
      const parsed = Number(val);
      return isNaN(parsed) ? fallback : parsed;
    }

    function formatSign(num) {
      return num >= 0 ? `+${num}` : `${num}`;
    }

    const storedProfiles = window.CustomRolls.getProfileData?.(actor, "d20ProfilesV2") || actor.getFlag("world", "d20ProfilesV2") || {};

    const TOOLS = {
      alchemist: { name: "Alchemist Supplies", ability: "int", desc: "Utilize: Identify a substance (DC 15), or start a fire (DC 15)\n\nCraft: Acid, Alchemist’s Fire, Component Pouch, Oil, Paper, Perfume" },
      brewer: { name: "Brewer's Supplies", ability: "int", desc: "Utilize: Detect poisoned drink (DC 15), or identify alcohol (DC 10)\n\nCraft: Antitoxin" },
      calligrapher: { name: "Calligrapher's Supplies", ability: "dex", desc: "Utilize: Write text with impressive flourishes that guard against forgery (DC 15)\n\nCraft: Ink, Spell Scroll" },
      carpenter: { name: "Carpenter's Tools", ability: "str", desc: "Utilize: Seal or pry open a door or container (DC 20)\n\nCraft: Club, Greatclub, Quarterstaff, Barrel, Chest, Ladder, Pole, Portable Ram, Torch" },
      cartographer: { name: "Cartographer's Tools", ability: "wis", desc: "Utilize: Draft a map of a small area (DC 15)\n\nCraft: Map" },
      cobbler: { name: "Cobbler's Tools", ability: "dex", desc: "Utilize: Modify footwear to give Advantage on the wearer’s next Dexterity (Acrobatics) check (DC 10)\n\nCraft: Climber’s Kit" },
      cook: { name: "Cook's Utensils", ability: "wis", desc: "Utilize: Improve food’s flavor (DC 10), or detect spoiled or poisoned food (DC 15)\n\nCraft: Rations" },
      disguise: { name: "Disguise Kit", ability: "cha", desc: "Utilize: Apply makeup (DC 10)\n\nCraft: Costume" },
      forgery: { name: "Forgery Kit", ability: "dex", desc: "Utilize: Mimic 10 or fewer words of someone else’s handwriting (DC 15), or duplicate a wax seal (DC 20)" },
      gaming: { name: "Gaming Set", ability: "wis", desc: "Utilize: Discern whether someone is cheating (DC 10), or win the game (DC 20)" },
      glassblower: { name: "Glassblower's Tools", ability: "int", desc: "Utilize: Discern what a glass object held in the past 24 hours (DC 15)\n\nCraft: Glass Bottle, Magnifying Glass, Spyglass, Vial" },
      herbalism: { name: "Herbalism Kit", ability: "int", desc: "Utilize: Identify a plant (DC 10)\n\nCraft: Antitoxin, Candle, Healer’s Kit, Potion of Healing" },
      jeweler: { name: "Jeweler's Tools", ability: "int", desc: "Utilize: Discern a gem’s value (DC 15)\n\nCraft: Arcane Focus, Holy Symbol" },
      leatherworker: { name: "Leatherworker's Tools", ability: "dex", desc: "Utilize: Add a design to a leather item (DC 10)\n\nCraft: Sling, Whip, Hide Armor, Leather Armor, Studded Leather Armor, Backpack, Crossbow Bolt Case, Map or Scroll Case, Parchment, Pouch, Quiver, Waterskin" },
      mason: { name: "Mason's Tools", ability: "str", desc: "Utilize: Chisel a symbol or hole in stone (DC 10)\n\nCraft: Block and Tackle" },
      musical: { name: "Musical Instrument", ability: "cha", desc: "Utilize: Play a known tune (DC 10), or improvise a song (DC 15)" },
      navigator: { name: "Navigator's Tools", ability: "wis", desc: "Utilize: Plot a course (DC 10), or determine position by stargazing (DC 15)" },
      painter: { name: "Painter's Supplies", ability: "wis", desc: "Utilize: Paint a recognizable image of something you’ve seen (DC 10)\n\nCraft: Druidic Focus, Holy Symbol" },
      poisoner: { name: "Poisoner's Kit", ability: "int", desc: "Utilize: Detect a poisoned object (DC 10)" },
      potter: { name: "Potter's Tools", ability: "int", desc: "Utilize: Discern what a ceramic object held in the past 24 hours (DC 15)\n\nCraft: Jug, Lamp" },
      smith: { name: "Smith's Tools", ability: "str", desc: "Utilize: Pry open a door or container (DC 20)\n\nCraft: Any Melee weapon (except Club, Greatclub, Quarterstaff, and Whip), Medium armor (except Hide), Heavy armor, Ball Bearings, Bucket, Caltrops, Chain, Crowbar, Firearm Bullets, Grappling Hook, Iron Pot, Iron Spikes, Sling Bullets" },
      thieves: { name: "Thieves' Tools", ability: "dex", desc: "Utilize: Pick a lock (DC 15), or disarm a trap (DC 15)" },
      tinker: { name: "Tinker's Tools", ability: "dex", desc: "Utilize: Assemble a Tiny item composed of scrap, which falls apart in 1 minute (DC 20)\n\nCraft: Musket, Pistol, Bell, Bullseye Lantern, Flask, Hooded Lantern, Hunting Trap, Lock, Manacles, Mirror, Shovel, Signal Whistle, Tinderbox" },
      weaver: { name: "Weaver's Tools", ability: "dex", desc: "Utilize: Mend a tear in clothing (DC 10), or sew a Tiny design (DC 10)\n\nCraft: Padded Armor, Basket, Bedroll, Blanket, Fine Clothes, Net, Robe, Rope, Sack, String, Tent, Traveler's Clothes" },
      woodcarver: { name: "Woodcarver's Tools", ability: "dex", desc: "Utilize: Carve a pattern in wood (DC 10)\n\nCraft: Club, Greatclub, Quarterstaff, Ranged weapons (except Pistol, Musket, and Sling), Arcane Focus, Arrows, Bolts, Druidic Focus, Ink Pen, Needles" }
    };

    const DESCRIPTIONS = {
      acr: "Stay on your feet in a tricky situation, or perform an acrobatic stunt.",
      ani: "Calm or train an animal, or get an animal to behave in a certain way.",
      arc: "Recall lore about spells, magic items, and the planes of existence.",
      ath: "Jump farther than normal, stay afloat in rough water, or break something.",
      dec: "Tell a convincing lie, or wear a disguise convincingly.",
      his: "Recall lore about historical events, people, nations, and cultures.",
      ins: "Discern a person’s mood and intentions.",
      itm: "Awe or threaten someone into doing what you want.",
      inv: "Find obscure information in books, or deduce how something works.",
      med: "Diagnose an illness, or determine what killed the recently slain.",
      nat: "Recall lore about terrain, plants, animals, and weather.",
      prc: "Using a combination of senses, notice something that’s easy to miss.",
      prf: "Act, tell a story, perform music, or dance.",
      per: "Honestly and graciously convince someone of something.",
      rel: "Recall lore about gods, religious rituals, and holy symbols.",
      slt: "Pick a pocket, conceal a handheld object, or perform legerdemain.",
      ste: "Escape notice by moving quietly and hiding behind things.",
      sur: "Follow tracks, forage, find a trail, or avoid natural hazards.",

      check_str: "Measures bodily power, athletic training, and the extent to which you can exert raw physical force.\n\nUse to lift, push, pull, or break something.",
      check_dex: "Measures agility, reflexes, balance, fine motor control, and swift movement.\n\nUse to move nimbly, quickly, or quietly.",
      check_con: "Measures health, stamina, vital force, and bodily endurance under strain.\n\nUse to push your body beyond normal limits.",
      check_int: "Measures mental acuity, accuracy of recall, and the ability to reason logically.\n\nUse to reason or remember.",
      check_wis: "Reflects how attuned you are to your surroundings and represents perceptiveness, intuition, and willpower.\n\nUse to notice things in the environment or in creature's behavior.",
      check_cha: "Measures your ability to interact effectively with others, confidence, eloquence, and forceful personality.\n\nUse to influence, entertain or deceive.",

      save_str: "Resisting effects that physically push, knock down, restrain, or crush you.",
      save_dex: "Dodging out of harm's way, avoiding area-of-effect spells like Fireball, or evading sudden hazards and traps.",
      save_con: "Withstanding poisons, diseases, toxic gases, extreme exhaustion, or cold and heat hazards.",
      save_int: "Resisting psychic incursions or illusions that challenge logic.",
      save_wis: "Resisting charm effects, fright, mind control, or magical influence aimed at your willpower.",
      save_cha: "Resisting effects that banish you to other planes, override your self-identity, or possess your spirit.",

      concentration: "Maintaining focus on an ongoing spell when you take damage. The DC is 10 or half the damage taken, whichever is higher.",
      init: "Determines turn order at the start of combat. Tied rolls are broken by the higher raw Dexterity score."
    };

    const ABILITIES = {
      str: "Strength",
      dex: "Dexterity",
      con: "Constitution",
      int: "Intelligence",
      wis: "Wisdom",
      cha: "Charisma"
    };

    const SKILLS = {
      acr: { label: "Acrobatics", ability: "dex" },
      ani: { label: "Animal Handling", ability: "wis" },
      arc: { label: "Arcana", ability: "int" },
      ath: { label: "Athletics", ability: "str" },
      dec: { label: "Deception", ability: "cha" },
      his: { label: "History", ability: "int" },
      ins: { label: "Insight", ability: "wis" },
      itm: { label: "Intimidation", ability: "cha" },
      inv: { label: "Investigation", ability: "int" },
      med: { label: "Medicine", ability: "wis" },
      nat: { label: "Nature", ability: "int" },
      prc: { label: "Perception", ability: "wis" },
      prf: { label: "Performance", ability: "cha" },
      per: { label: "Persuasion", ability: "cha" },
      rel: { label: "Religion", ability: "int" },
      slt: { label: "Sleight of Hand", ability: "dex" },
      ste: { label: "Stealth", ability: "dex" },
      sur: { label: "Survival", ability: "wis" }
    };

    const pb = getNumericValue(actor.system.attributes?.prof, 2);

    const getProfMarker = (level) => {
      if (level === 2) {
        return `<i class="fas fa-star" style="color: #d4af37; font-size: 0.75em; margin-right: 4px; width: 10px; text-align: center;"></i>`;
      }
      if (level === 1) {
        return `<i class="fas fa-circle" style="color: #2b7489; font-size: 0.72em; margin-right: 4px; width: 10px; text-align: center;"></i>`;
      }
      if (level === 0.5) {
        return `<i class="fas fa-circle-half-stroke" style="color: #2b7489; font-size: 0.72em; margin-right: 4px; width: 10px; text-align: center;"></i>`;
      }
      return `<i class="far fa-circle" style="color: #b0b5bc; font-size: 0.72em; margin-right: 4px; width: 10px; text-align: center;"></i>`;
    };

    // Top Ability Scores Row
    const abilityCardsHtml = Object.entries(ABILITIES).map(([key, name]) => {
      const score = getNumericValue(actor.system.abilities?.[key]?.value, 10);
      const mod = getNumericValue(actor.system.abilities?.[key]?.mod, 0);
      return `
      <div class="ability-card" data-key="${key}" data-type="check" style="flex: 1; min-width: 38px; background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px; padding: 3px 1px; text-align: center; cursor: pointer;">
        <div style="font-size: 0.68em; font-weight: 700; color: #4b5d88; text-transform: uppercase;">${key}</div>
        <div style="font-size: 0.95em; font-weight: 700; color: #222; margin: 1px 0;">${score}</div>
        <button type="button" class="roll-btn-v2" data-type="check" data-key="${key}" title="Roll ${name} Check" style="width: 32px; height: 20px; font-weight: 700; font-size: 0.8em; padding: 0; border-radius: 3px; border: 1px solid #c0c6ce; background: #fff; cursor: pointer; color: #2b3a4a; margin: 0 auto; display: inline-flex; align-items: center; justify-content: center; text-align: center;">
          ${formatSign(mod)}
        </button>
      </div>
    `;
    }).join('');

    const renderSidebarAbilityCol = (keys) => {
      const header = `
        <div style="display: flex; justify-content: flex-end; gap: 2px; padding-right: 1px; margin-bottom: 2px; font-size: 0.72em; font-weight: 700; color: #777;">
          <span style="width: 26px; text-align: center;">Mod</span>
          <span style="width: 26px; text-align: center;">Save</span>
        </div>
      `;
      const rows = keys.map(key => {
        const score = getNumericValue(actor.system.abilities?.[key]?.value, 10);
        const mod = getNumericValue(actor.system.abilities?.[key]?.mod, 0);
        const saveObj = actor.system.abilities?.[key]?.save;
        const modObj = actor.system.abilities?.[key]?.mod;
        const saveMod = getNumericValue(saveObj, getNumericValue(modObj, 0));
        const isProf = Boolean(actor.system.abilities?.[key]?.proficient || actor.system.abilities?.[key]?.prof);
        const profMarker = getProfMarker(isProf ? 1 : 0);
        const name = ABILITIES[key];
        return `
          <div class="ability-card" data-key="${key}" data-type="check" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 3px; background: rgba(0,0,0,0.02); border: 1px solid #d2d7df; border-radius: 3px; margin-bottom: 2px; cursor: pointer;">
            <span style="font-size: 0.85em; font-weight: 700; color: #4b5d88; display: flex; align-items: center; white-space: nowrap;">
              ${profMarker}${key.toUpperCase()}&nbsp;<span style="color: #666; font-weight: 600;">${score}</span>
            </span>
            <div style="display: flex; gap: 2px; align-items: center;">
              <button type="button" class="roll-btn-v2" data-type="check" data-key="${key}" title="Roll ${name} Check" style="width: 26px; height: 19px; font-weight: 700; font-size: 0.78em; padding: 0; border-radius: 2px; border: 1px solid #c0c6ce; background: #fff; cursor: pointer; color: #2b3a4a; display: inline-flex; align-items: center; justify-content: center; text-align: center;">
                ${formatSign(mod)}
              </button>
              <button type="button" class="roll-btn-v2" data-type="save" data-key="${key}" title="Roll ${name} Save" style="width: 26px; height: 19px; font-weight: 700; font-size: 0.78em; padding: 0; border-radius: 2px; border: 1px solid ${isProf ? '#2b7489' : '#c0c6ce'}; background: ${isProf ? '#f0f8fa' : '#fff'}; cursor: pointer; color: ${isProf ? '#2b7489' : '#2b3a4a'}; display: inline-flex; align-items: center; justify-content: center; text-align: center;">
                ${formatSign(saveMod)}
              </button>
            </div>
          </div>
        `;
      }).join('');
      return `${header}${rows}`;
    };

    const sidebarAbilitiesHtml = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
        <div style="display: flex; flex-direction: column;">
          ${renderSidebarAbilityCol(["str", "dex", "con"])}
        </div>
        <div style="display: flex; flex-direction: column;">
          ${renderSidebarAbilityCol(["int", "wis", "cha"])}
        </div>
      </div>
    `;

    // Initiative and Concentration values
    const conMod = getNumericValue(actor.system.abilities?.con?.mod, 0);
    const rawConSave = getNumericValue(actor.system.abilities?.con?.save, null);
    let conSaveTotal = conMod;
    if (rawConSave !== null) {
      conSaveTotal = rawConSave;
    } else {
      const isProf = actor.system.abilities?.con?.proficient || actor.system.abilities?.con?.prof;
      conSaveTotal = conMod + (isProf ? pb : 0);
    }

    const dexMod = getNumericValue(actor.system.abilities?.dex?.mod, 0);
    const dexScore = getNumericValue(actor.system.abilities?.dex?.value, 10);
    const initBonus = getNumericValue(actor.system.attributes?.init?.bonus, 0);
    const alertBonus = actor.items.some(i => i.name?.toLowerCase().includes("alert")) ? 5 : 0;
    const totalInitMod = dexMod + initBonus + alertBonus;

    // Skills List
    const standardSkillsHtml = Object.entries(SKILLS).map(([key, s]) => {
      const mod = getNumericValue(actor.system.skills?.[key]?.total, 0);
      const profLevel = actor.system.skills?.[key]?.value ?? 0;
      const profMarker = getProfMarker(profLevel);

      return `
      <div class="sheet-entry-row" data-key="${key}" data-type="skill" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 2px; border-bottom: 1px solid #f0f0f0; cursor: pointer;">
        <span class="entry-label" style="font-size: 1.05em; color: #2b3a4a; display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${profMarker}${s.label} <small style="color: #888; margin-left: 2px; font-size: 0.8em;">(${s.ability.toUpperCase()})</small>
        </span>
        <button type="button" class="roll-btn-v2" data-type="skill" data-key="${key}" style="width: 34px; height: 20px; font-size: 0.82em; font-weight: 700; padding: 0; border: 1px solid #c0c6ce; background: #fff; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-align: center; flex-shrink: 0; margin-left: 4px;">
          ${formatSign(mod)}
        </button>
      </div>
    `;
    }).join('');

    // Separate Custom Tools vs Custom Skills/Checks
    const customProfToolsHtml = [];
    const customOtherToolsHtml = [];
    const customSkillsList = [];

    Object.entries(storedProfiles).forEach(([k, val]) => {
      if (k.startsWith("custom_")) {
        const abil = val.ability || "int";
        const isProf = Boolean(val.proficient);
        const profBonus = isProf ? pb : 0;
        const totalBonus = getNumericValue(actor.system.abilities?.[abil]?.mod, 0) + profBonus;
        const cat = val.category || "skill";
        const displayName = val.name || k.replace("custom_", "").replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
        const profMarker = isProf ? getProfMarker(1) : `<i class="fas fa-diamond" style="color: #c5a059; font-size: 0.7em; margin-right: 4px; width: 10px; text-align: center;"></i>`;

        if (cat === "tool") {
          const toolRowHtml = `
          <div class="sheet-entry-row" data-key="${k}" data-type="tool" data-custom="true" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 2px; border-bottom: 1px solid #f0f0f0; cursor: pointer; background: #fdfaf3;">
            <span class="entry-label" style="font-size: 1.05em; color: #6d5b1f; display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${displayName} (${abil.toUpperCase()})">
              ${profMarker}
              ${displayName} <small style="color: #888; margin-left: 2px; font-size: 0.8em;">(${abil.toUpperCase()})</small>
            </span>
            <button type="button" class="roll-btn-v2" data-type="tool" data-key="${k}" title="Roll ${displayName}" style="width: 34px; height: 20px; font-size: 0.82em; font-weight: 700; padding: 0; border: 1px solid #d5c898; background: #fff; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-align: center; flex-shrink: 0; margin-left: 4px;">
              ${formatSign(totalBonus)}
            </button>
          </div>
        `;
          if (isProf) {
            customProfToolsHtml.push(toolRowHtml);
          } else {
            customOtherToolsHtml.push(toolRowHtml);
          }
        } else {
          customSkillsList.push(`
          <div class="sheet-entry-row" data-key="${k}" data-type="${cat}" data-custom="true" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 2px; border-bottom: 1px solid #f0f0f0; cursor: pointer; background: #fdfaf3;">
            <span class="entry-label" style="font-size: 1.05em; color: #6d5b1f; display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${displayName} (${abil.toUpperCase()})">
              ${profMarker}
              ${displayName} <small style="color: #888; margin-left: 2px; font-size: 0.8em;">(${abil.toUpperCase()})</small>
            </span>
            <button type="button" class="roll-btn-v2" data-type="${cat}" data-key="${k}" title="Roll ${displayName}" style="width: 34px; height: 20px; font-size: 0.82em; font-weight: 700; padding: 0; border: 1px solid #d5c898; background: #fff; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-align: center; flex-shrink: 0; margin-left: 4px;">
              ${formatSign(totalBonus)}
            </button>
          </div>
        `);
        }
      }
    });

    // Tools Division
    const proficientToolsHtml = [];
    const nonProficientToolsHtml = [];

    Object.entries(TOOLS).sort((a, b) => a[1].name.localeCompare(b[1].name)).forEach(([k, t]) => {
      const abilMod = getNumericValue(actor.system.abilities?.[t.ability]?.mod, 0);
      const toolItem = actor.items.find(i => i.type === "tool" && i.name.toLowerCase().includes(t.name.toLowerCase().split("'")[0]));
      const isProf = actor.system.tools?.[k]?.proficient || toolItem?.system?.proficient || 0;
      const bonus = abilMod + (isProf ? pb * (isProf === 2 ? 2 : 1) : 0);

      if (isProf) {
        const profMarker = getProfMarker(isProf === 2 ? 2 : (isProf === 0.5 ? 0.5 : 1));
        proficientToolsHtml.push(`
        <div class="sheet-entry-row" data-key="${k}" data-type="tool" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 2px; border-bottom: 1px solid #f0f0f0; cursor: pointer;">
          <span class="entry-label" style="font-size: 1.05em; color: #2b3a4a; display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${profMarker}${t.name} <small style="color: #888; margin-left: 2px; font-size: 0.8em;">(${t.ability.toUpperCase()})</small>
          </span>
          <button type="button" class="roll-btn-v2" data-type="tool" data-key="${k}" style="width: 34px; height: 20px; font-size: 0.82em; font-weight: 700; padding: 0; border: 1px solid #c0c6ce; background: #fff; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-align: center; flex-shrink: 0; margin-left: 4px;">
            ${formatSign(bonus)}
          </button>
        </div>
      `);
      } else {
        nonProficientToolsHtml.push(`<option value="${k}">${t.name} (${t.ability.toUpperCase()}) ${formatSign(bonus)}</option>`);
      }
    });

    const skillsToolsHtml = `
      <!-- Skills Section Card -->
      <div id="skills-card-v2" style="flex: 1; min-height: 32px; display: flex; flex-direction: column; background: #f8fafc; border: 1px solid #bcc5d3; border-radius: 5px; padding: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: flex 0.2s ease;">
        <div style="font-weight: 700; font-size: 0.85em; color: #4b5d88; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 3px; border-bottom: 1px solid #e0e6ed; padding-bottom: 2px; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center;">
          <span>Skills</span>
          <button type="button" id="skills-collapse-toggle-v2" title="Toggle Skills" style="background: none; border: none; cursor: pointer; color: #64748b; padding: 0 4px; font-size: 0.85em; line-height: 1; display: inline-flex; align-items: center; justify-content: center;">
            <i class="fas fa-chevron-up"></i>
          </button>
        </div>
        <div id="skills-content-v2" style="background: #fff; border: 1px solid #d8dee6; border-radius: 4px; padding: 1px 3px; flex: 1; min-height: 0; overflow-y: auto;">
          ${standardSkillsHtml}
          ${customSkillsList.join('')}
        </div>
      </div>

      <!-- Tools Section Card (Expands up to 50% max by default, full if skills collapsed, shrinks if fewer tools) -->
      <div id="tools-card-v2" style="max-height: 50%; min-height: 32px; display: flex; flex-direction: column; background: #f8fafc; border: 1px solid #bcc5d3; border-radius: 5px; padding: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); flex-shrink: 0; transition: max-height 0.2s ease, flex 0.2s ease;">
        <div style="font-weight: 700; font-size: 0.85em; color: #4b5d88; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 3px; border-bottom: 1px solid #e0e6ed; padding-bottom: 2px; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center;">
          <span>Tools</span>
          <button type="button" id="tools-collapse-toggle-v2" title="Toggle Tools" style="background: none; border: none; cursor: pointer; color: #64748b; padding: 0 4px; font-size: 0.85em; line-height: 1; display: inline-flex; align-items: center; justify-content: center;">
            <i class="fas fa-chevron-down"></i>
          </button>
        </div>
        <div id="tools-content-v2" style="display: flex; flex-direction: column; min-height: 0; flex: 1; overflow: hidden;">
          <div id="tools-list-container-v2" style="background: #fff; border: 1px solid #d8dee6; border-radius: 4px; padding: 2px 3px; margin-bottom: 4px; flex: 1; min-height: 0; max-height: 100%; overflow-y: auto;">
            ${(proficientToolsHtml.length > 0 || customProfToolsHtml.length > 0 || customOtherToolsHtml.length > 0)
        ? `${proficientToolsHtml.join('')}${customProfToolsHtml.join('')}${customOtherToolsHtml.join('')}`
        : '<span style="font-size: 0.85em; color: #999; padding: 2px; display: block;">No proficient or custom tools.</span>'}
          </div>

          <div id="other-tools-container-v2" style="flex-shrink: 0;">
            <div style="font-weight: 700; font-size: 0.72em; color: #777; margin-bottom: 2px;">OTHER TOOLS</div>
            <div style="display: flex; flex-direction: column; gap: 3px;">
              <select id="other-tools-select-v2" style="width: 100%; height: 28px; font-size: 1.05em; border-radius: 3px; border: 1px solid #c0c6ce; padding: 0 4px; box-sizing: border-box; background: #fff;">
                <option value="">-- Choose Tool --</option>
                ${nonProficientToolsHtml.join('')}
              </select>
              <button type="button" id="roll-other-tool-btn-v2" style="width: 100%; height: 22px; font-size: 0.85em; font-weight: 700; cursor: pointer; border-radius: 3px; border: 1px solid #c0c6ce; background: #fff; display: inline-flex; align-items: center; justify-content: center; text-align: center;">
                Roll Selected Tool
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const inspectorHtml = `
      <!-- Live Description Box Card -->
      <div style="flex: 1; display: flex; flex-direction: column; background: #f8fafc; border-radius: 5px; padding: 8px 10px; border: 1px solid #bcc5d3; box-shadow: 0 1px 3px rgba(0,0,0,0.05); min-height: 150px;">
        <div style="border-bottom: 1px solid #e0e6ed; padding-bottom: 4px; margin-bottom: 6px;">
          <div id="desc-title-v2" style="font-weight: 800; font-size: 1.15em; color: #2b3a4a; text-transform: uppercase; letter-spacing: 0.5px;">D20 Test Overview</div>
          <div id="desc-subtitle-v2" style="font-size: 0.85em; color: #666; font-weight: 600;">Information Pane</div>
        </div>
        <div id="desc-body-v2" style="font-size: 1.05em; line-height: 1.5; color: #333; overflow-y: auto; flex: 1; white-space: pre-wrap;">Select any ability, saving throw, skill, or tool name to inspect its details and usage rules here.

Click a numbered modifier badge to execute a roll.</div>
      </div>

      <!-- Modifiers Card -->
      <div style="background: #f8fafc; border: 1px solid #bcc5d3; border-radius: 5px; padding: 6px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; flex-direction: column; gap: 5px; flex-shrink: 0;">
        <!-- Presets Section -->
        <div id="preset-modifiers-section-v2" style="display: none; flex-direction: column; gap: 2px; background: #fff; border: 1px dashed #c0c6ce; border-radius: 4px; padding: 3px 5px;">
          <label style="font-weight: 700; font-size: 0.68em; color: #4b5d88; letter-spacing: 0.5px;">PRESET MODIFIERS (V2)</label>
          <div id="preset-list-v2" style="display: flex; flex-direction: column; gap: 2px;"></div>
        </div>

        <div>
          <label for="other-modifier-v2" style="font-weight: 700; font-size: 0.7em; color: #4b5d88; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">EXTRA MODIFIER</label>
          <input type="text" id="other-modifier-v2" name="other-modifier-v2" value="" placeholder="e.g. 1d4, +2" style="width: 100%; height: 24px; border-radius: 4px; border: 1px solid #ccc; padding: 1px 4px; font-size: 0.8em; background: #fff;" />
        </div>

        <div style="display: flex; flex-direction: column; gap: 3px; border-top: 1px solid #e0e6ed; padding-top: 4px;">
          <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.74em; cursor: pointer; padding: 1px; color: #1e7e34; font-weight: 600;">
            <span>Super Advantage</span>
            <input type="checkbox" id="super-advantage-v2" name="super-advantage-v2" style="margin: 0;">
          </label>
          <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.74em; cursor: pointer; padding: 1px; color: #333;">
            <span>Reliable Talent (Min 10)</span>
            <input type="checkbox" id="reliable-talent-v2" name="reliable-talent-v2" style="margin: 0;">
          </label>
          <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.74em; cursor: pointer; padding: 1px; color: #333;">
            <span>Halfling Luck (Reroll 1s)</span>
            <input type="checkbox" id="halfling-luck-v2" name="halfling-luck-v2" style="margin: 0;">
          </label>
        </div>
      </div>
    `;

    return {
      skillsToolsHtml,
      inspectorHtml,
      sidebarAbilitiesHtml: sidebarAbilitiesHtml,
      totalInitMod,
      dexScore,
      conSaveTotal,
      formattedInit: `${totalInitMod >= 0 ? '+' : ''}${totalInitMod} .${dexScore}`,
      formattedConc: `${conSaveTotal >= 0 ? '+' : ''}${conSaveTotal}`,
      setupEvents: (html) => {
        const descTitle = html.find('#desc-title-v2');
        const descSubtitle = html.find('#desc-subtitle-v2');
        const descBody = html.find('#desc-body-v2');
        const presetSection = html.find('#preset-modifiers-section-v2');
        const presetList = html.find('#preset-list-v2');
        let currentActiveKey = null;

        const getProfileForChoice = (choiceKey, type) => {
          if (!choiceKey) return null;
          if (storedProfiles[choiceKey]) return storedProfiles[choiceKey];
          if (type === "check") {
            return storedProfiles[`check_${choiceKey}`]
              || (choiceKey.startsWith("check_") ? storedProfiles[choiceKey.replace("check_", "")] : null);
          }
          if (type === "save") {
            return storedProfiles[`save_${choiceKey}`]
              || (choiceKey.startsWith("save_") ? storedProfiles[choiceKey.replace("save_", "")] : null);
          }
          return null;
        };

        const updatePresets = (choiceKey, type) => {
          currentActiveKey = choiceKey;
          const profileObj = getProfileForChoice(choiceKey, type);
          const activePresets = Array.isArray(profileObj) ? profileObj : (profileObj?.modifiers || []);

          if (activePresets.length > 0) {
            const listHtml = activePresets.map(p => `
            <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75em; cursor: pointer; padding: 2px 4px; background: #fff; border: 1px solid #d2d7df; border-radius: 3px;">
              <span>${p.label} <b style="color: #4b5d88;">(${p.formula})</b></span>
              <input type="checkbox" class="preset-mod-toggle-v2" data-formula="${p.formula}" ${p.enabled ? 'checked' : ''} style="margin: 0;">
            </label>
          `).join('');
            presetList.html(listHtml);
            presetSection.css('display', 'flex');
          } else {
            presetSection.hide();
            presetList.empty();
          }
        };

        const setInfo = (type, key, preservePresets = false) => {
          if (key && key.startsWith("custom_")) {
            const customData = storedProfiles[key];
            const name = customData?.name || "Custom Test";
            const abil = (customData?.ability || "int").toUpperCase();
            const cat = customData?.category || type || "skill";
            const catName = cat === 'tool' ? 'Tool' : (cat === 'check' ? 'Ability' : 'Skill');
            descTitle.text(name);
            descSubtitle.text(`Custom ${abil} ${catName} Check`);
            descBody.text(customData?.desc || `Custom D20 ${catName.toLowerCase()} check governed by ${actor.name}'s ${abil} modifier.`);
          } else if (type === "skill") {
            descTitle.text(SKILLS[key]?.label || key);
            descSubtitle.text("Skill Check");
            descBody.text(DESCRIPTIONS[key] || "No description available.");
          } else if (type === "tool") {
            const tool = TOOLS[key];
            descTitle.text(tool?.name || "Tool");
            descSubtitle.text(`${tool?.ability?.toUpperCase()} Tool Check`);
            descBody.text(tool?.desc || "No description available.");
          } else if (type === "save") {
            const abilKey = key.replace("save_", "");
            const abilName = ABILITIES[abilKey] || abilKey?.toUpperCase();
            descTitle.text(`${abilName} Save`);
            descSubtitle.text("Saving Throw");
            descBody.text(DESCRIPTIONS[`save_${abilKey}`] || "No description available.");
          } else if (type === "check") {
            const abilKey = key.replace("check_", "");
            const abilName = ABILITIES[abilKey] || abilKey?.toUpperCase();
            descTitle.text(`${abilName} Check`);
            descSubtitle.text("Ability Check");
            descBody.text(DESCRIPTIONS[`check_${abilKey}`] || "No description available.");
          } else if (type === "concentration") {
            descTitle.text("Concentration");
            descSubtitle.text("Constitution Check");
            descBody.text(DESCRIPTIONS.concentration);
          } else if (type === "init") {
            descTitle.text("Initiative");
            descSubtitle.text("Dexterity Check");
            descBody.text(DESCRIPTIONS.init);
          }

          if (!preservePresets || currentActiveKey !== key) {
            updatePresets(key, type);
          }
        };

        html.find('.ability-card, .save-row, .sheet-entry-row').on('click', function (e) {
          if ($(e.target).closest('.roll-btn-v2').length) return;
          const type = $(this).data('type');
          const key = $(this).data('key');
          setInfo(type, key);
        });

        html.find('#other-tools-select-v2').on('change input', function () {
          const key = $(this).val();
          if (key) {
            setInfo('tool', key);
          } else {
            presetSection.hide();
            presetList.empty();
          }
        });

        // Toggle collapse/expand for Skills and Tools lists
        let skillsCollapsed = false;
        let toolsCollapsed = false;

        const updateColumnLayout = () => {
          const skillsCard = html.find('#skills-card-v2');
          const skillsContent = html.find('#skills-content-v2');
          const skillsBtn = html.find('#skills-collapse-toggle-v2 i');

          const toolsCard = html.find('#tools-card-v2');
          const toolsContent = html.find('#tools-content-v2');
          const toolsBtn = html.find('#tools-collapse-toggle-v2 i');

          if (skillsCollapsed) {
            skillsContent.css("display", "none");
            skillsCard.css({ flex: '0 0 auto', minHeight: 'auto' });
            skillsBtn.removeClass('fa-chevron-up').addClass('fa-chevron-down');
          } else {
            skillsContent.css("display", "block");
            skillsCard.css({ flex: '1 1 auto', minHeight: '32px' });
            skillsBtn.removeClass('fa-chevron-down').addClass('fa-chevron-up');
          }

          if (toolsCollapsed) {
            toolsContent.css("display", "none");
            toolsCard.css({ flex: '0 0 auto', maxHeight: 'none', minHeight: 'auto', marginTop: 'auto' });
            toolsBtn.removeClass('fa-chevron-down').addClass('fa-chevron-up');
          } else {
            toolsContent.css("display", "flex");
            toolsBtn.removeClass('fa-chevron-up').addClass('fa-chevron-down');
            if (skillsCollapsed) {
              // Tools expands to take all remaining space
              toolsCard.css({ flex: '1 1 auto', maxHeight: 'none', minHeight: '32px', marginTop: '0' });
            } else {
              // Both expanded: Tools capped at 50%
              toolsCard.css({ flex: '0 0 auto', maxHeight: '50%', minHeight: '32px', marginTop: '0' });
            }
          }
        };

        html.find('#skills-collapse-toggle-v2').on('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          skillsCollapsed = !skillsCollapsed;
          updateColumnLayout();
        });

        html.find('#tools-collapse-toggle-v2').on('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          toolsCollapsed = !toolsCollapsed;
          updateColumnLayout();
        });

        const executeRoll = async (rollType, key) => {
          const isSuperAdvantage = html.find('#super-advantage-v2').is(':checked');
          const isReliableTalent = html.find('#reliable-talent-v2').is(':checked');
          const isHalflingLuck = html.find('#halfling-luck-v2').is(':checked');

          const activePresetFormulas = [];
          html.find('.preset-mod-toggle-v2:checked').each((_, el) => {
            const form = $(el).data('formula');
            if (form) activePresetFormulas.push(form);
          });

          const manualMod = html.find('#other-modifier-v2').val()?.trim() || "";
          if (manualMod) activePresetFormulas.push(manualMod);

          const otherModString = activePresetFormulas.join(" + ");

          if (!globalThis.attackSocket) {
            return ui.notifications.error("SocketLib attack handler is not initialized. Please refresh the page.");
          }

          await globalThis.attackSocket.executeAsGM("runD20TestRoll", {
            rollType,
            key,
            isReliableTalent,
            isHalflingLuck,
            isSuperAdvantage,
            otherModString
          }, actor.id, game.user.id);
        };

        html.find('.roll-btn-v2').on('click', function (e) {
          e.stopPropagation();
          const type = $(this).data('type');
          const key = $(this).data('key');
          setInfo(type, key, true);
          executeRoll(type, key);
        });

        html.find('#roll-other-tool-btn-v2').on('click', function (e) {
          e.stopPropagation();
          const key = html.find('#other-tools-select-v2').val();
          if (!key) return ui.notifications.warn("Please select a tool first.");
          setInfo('tool', key, true);
          executeRoll('tool', key);
        });
      }
    };
  }

  // Backwards-compatible launcher that delegates to unified Combat Remote dialog
  window.CustomRolls.openD20DialogV2 = function () {
    return window.CustomRolls.openActionDialog("d20");
  };


  // --- 3.2 Weapon Attack Client-Side Dialog Launcher ---
  window.CustomRolls.openAttackDialog = function () {
    if (!getSetting("featureCustomRolls")) return;

    const token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;

    if (!token) {
      return ui.notifications.warn("Please select your token first.");
    }

    const actor = token.actor;
    if (!actor || !actor.isOwner) {
      return ui.notifications.warn("You don't have permissions to use this token.");
    }

    const attacks = window.CustomRolls.getProfileData(actor, "attackConfigs") || actor.getFlag("world", "attackConfigs") || {};
    const names = Object.keys(attacks);

    if (names.length === 0) {
      return ui.notifications.warn(`No stored attacks found for ${actor.name}.`);
    }

    function getSummaryHtml(config) {
      if (!config) return "";

      const abilityMod = actor.system.abilities[config.abilityScore]?.mod || 0;
      const isProf = config.isProficient !== undefined ? (String(config.isProficient) === "true" || config.isProficient === true) : true;
      const prof = isProf ? (actor.system.attributes.prof || 0) : 0;
      const wepMod = Number(config.weaponModifier) || 0;
      const circMod = Number(config.attackCircumstanceModifier) || 0;
      const totalAtk = abilityMod + prof + wepMod + circMod;
      const atkSign = totalAtk >= 0 ? `+${totalAtk}` : `${totalAtk}`;

      const diceCount = Math.max(0, Number(config.damageDiceCount) || 0);
      const isNoneDie = String(config.damageDieSize || "").toLowerCase() === "none";
      const dieSize = isNoneDie ? "" : String(config.damageDieSize || "6").replace(/^d/i, "");
      const dmgMod = abilityMod + wepMod + (Number(config.damageModifier) || 0);
      const dmgModSign = dmgMod >= 0 ? `+${dmgMod}` : `${dmgMod}`;
      const dmgFormula = diceCount > 0 && dieSize
        ? `${diceCount}d${dieSize} ${dmgMod !== 0 ? dmgModSign : ""}`.trim()
        : `${dmgMod}`;
      const dmgType = (config.damageType || "slashing").toUpperCase();

      const tags = [];
      tags.push(`Crit: ${config.CRIT_THRESHOLD || 20}+`);
      if (config.superAdv) tags.push("Super Adv");
      if (config.HAS_HALFLING_LUCKY) tags.push("Halfling Lucky");
      if (Number(config.GWF_REROLL_THRESHOLD) > 0) tags.push(`GWF (≤${config.GWF_REROLL_THRESHOLD})`);

      const activeExtras = (config.additionalDamageComponents || []).filter(c => c.isActive);
      if (activeExtras.length > 0) {
        tags.push(`+${activeExtras.length} Extra Dmg`);
      }

      const tagsHtml = tags.map(t => `
      <span style="display: inline-block; background: rgba(114, 137, 218, 0.18); border: 1px solid rgba(114, 137, 218, 0.4); border-radius: 3px; padding: 2px 6px; font-size: 0.75em; font-weight: 600; color: #4b5d88;">${t}</span>
    `).join("");

      let gwmHtml = "";
      if (config.hasGWM) {
        gwmHtml = `
        <div style="border-top: 1px solid #e0e0e0; padding-top: 6px; margin-top: 6px;">
          <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; font-weight: bold; color: #a34848; cursor: pointer; padding: 2px 4px; background: rgba(163, 72, 72, 0.08); border-radius: 3px;">
            <span>Great Weapon Master / Sharpshooter (-5 / +10)</span>
            <input type="checkbox" id="gwm-toggle">
          </label>
        </div>
      `;
      }

      const extras = config.additionalDamageComponents || [];
      let extrasHtml = "";
      if (extras.length > 0) {
        extrasHtml = `
        <div style="margin-top: 6px; border-top: 1px solid #e0e0e0; padding-top: 6px;">
          <div style="font-size: 0.75em; font-weight: 600; color: #666; margin-bottom: 4px;">EXTRA DAMAGE SOURCES:</div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            ${extras.map((ex, i) => `
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer; padding: 2px 4px; background: rgba(0,0,0,0.02); border-radius: 3px;">
                <span><strong>${ex.label}</strong> <small style="color: #777;">(${ex.formula})</small></span>
                <input type="checkbox" class="extra-dmg-toggle" data-index="${i}">
              </label>
            `).join("")}
          </div>
        </div>
      `;
      }

      return `
      <div style="display: flex; justify-content: space-around; background: rgba(0,0,0,0.04); border-radius: 4px; padding: 6px 4px; margin-bottom: 6px; text-align: center;">
        <div>
          <div style="font-size: 0.75em; font-weight: 600; color: #777;">ATTACK</div>
          <div style="font-size: 1.1em; font-weight: bold; color: #2b3a4a;">${atkSign}</div>
        </div>
        <div style="border-left: 1px solid rgba(0,0,0,0.1); border-right: 1px solid rgba(0,0,0,0.1); padding: 0 12px;">
          <div style="font-size: 0.75em; font-weight: 600; color: #777;">DAMAGE</div>
          <div style="font-size: 1.1em; font-weight: bold; color: #2b3a4a;">${dmgFormula}</div>
        </div>
        <div>
          <div style="font-size: 0.75em; font-weight: 600; color: #777;">TYPE</div>
          <div style="font-size: 1.1em; font-weight: bold; color: #2b3a4a;">${dmgType}</div>
        </div>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-bottom: 6px;">
        ${tagsHtml}
      </div>
      ${gwmHtml}
      ${extrasHtml}
    `;
    }

    const optionsHtml = names.map(name => `<option value="${name}">${name}</option>`).join("");
    const initialSummary = getSummaryHtml(attacks[names[0]]);

    const content = `
    <div style="display: flex; flex-direction: column; gap: 10px; padding: 6px 4px;">
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 4px;">
        <span style="font-weight: 600; font-size: 1em; color: #333;">Select Action</span>
        <span style="font-size: 0.85em; color: #777;">${actor.name}</span>
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <select id="attack-selection" style="width: 100%; height: 32px; padding: 2px 6px; font-size: 0.95em; border-radius: 4px; border: 1px solid #7289da;">
          ${optionsHtml}
        </select>
      </div>

      <div id="attack-preview-box" style="border: 1px solid #d2d7df; border-radius: 5px; padding: 8px; background: #fafbfc;">
        ${initialSummary}
      </div>
    </div>
  `;

    new Dialog({
      title: `${actor.name}: Attack`,
      content: content,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d20" style="margin-right: 6px;"></i>',
          label: "Roll Attack",
          callback: async (html) => {
            const choice = html.find("#attack-selection").val();
            const rawConfig = attacks[choice];
            if (!rawConfig) return;

            const config = foundry.utils.duplicate(rawConfig);

            if (config.hasGWM && html.find("#gwm-toggle").is(":checked")) {
              config.attackCircumstanceModifier = (Number(config.attackCircumstanceModifier) || 0) - 5;
              config.damageModifier = (Number(config.damageModifier) || 0) + 10;
              config.chatCardTitle = `${config.chatCardTitle || choice} [GWM/SS -5/+10]`;
            }

            if (config.additionalDamageComponents) {
              html.find(".extra-dmg-toggle").each(function () {
                const idx = $(this).data("index");
                if (config.additionalDamageComponents[idx]) {
                  config.additionalDamageComponents[idx].isActive = $(this).is(":checked");
                }
              });
            }

            if (!globalThis.attackSocket) {
              return ui.notifications.error("SocketLib attack handler is not initialized. Please refresh the page.");
            }

            config.targetIds = Array.from(game.user.targets).map(t => t.id);
            await globalThis.attackSocket.executeAsGM("runAttackRoll", config, actor.id, game.user.id);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll",
      render: (html) => {
        html.find("#attack-selection").on("change", (event) => {
          const selectedName = event.target.value;
          const selectedConfig = attacks[selectedName];
          html.find("#attack-preview-box").html(getSummaryHtml(selectedConfig));
        });
      }
    }, { width: 400 }).render(true);
  };

  // --- 3.3 Spell Attack Client-Side Dialog Launcher ---
  window.CustomRolls.openSpellDialog = async function () {
    if (!getSetting("featureCustomRolls")) return;

    const token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;

    if (!token) {
      return ui.notifications.warn("Please select your token first.");
    }

    const actor = token.actor;
    if (!actor || !actor.isOwner) {
      return ui.notifications.warn("You don't have permissions to use this token.");
    }

    const spellConfigs = window.CustomRolls.getProfileData(actor, "spellConfigs") || actor.getFlag("world", "spellConfigs") || {};
    let spellKeys = Object.keys(spellConfigs);

    if (spellKeys.length === 0) {
      return ui.notifications.warn(`No spells configured for ${actor.name}. Run the Spell Generator first.`);
    }

    const groupedSpells = {};
    for (const key of spellKeys) {
      const lvl = Number(spellConfigs[key].baseLevel) || 0;
      if (!groupedSpells[lvl]) groupedSpells[lvl] = [];
      groupedSpells[lvl].push(key);
    }

    const sortedLevels = Object.keys(groupedSpells).map(Number).sort((a, b) => a - b);
    let optionsHtml = "";
    for (const lvl of sortedLevels) {
      const groupLabel = lvl === 0 ? "Cantrips" : `Level ${lvl} Spells`;
      optionsHtml += `<optgroup label="${groupLabel}">`;
      for (const key of groupedSpells[lvl]) {
        optionsHtml += `<option value="${key}">${key}</option>`;
      }
      optionsHtml += `</optgroup>`;
    }

    function getSlotInfo(lvl) {
      if (lvl === 0) return { current: Infinity, max: Infinity, label: "Infinite (Cantrip)" };
      const spells = actor.system.spells || {};
      const key = `spell${lvl}`;
      const slot = spells[key];
      if (!slot) return { current: 0, max: 0, label: "0/0" };
      return {
        current: Number(slot.value) || 0,
        max: Number(slot.max) || 0,
        label: `${slot.value ?? 0}/${slot.max ?? 0}`
      };
    }

    function getUpcastOptionsHtml(spell) {
      const baseLevel = Number(spell?.baseLevel) || 0;
      if (baseLevel === 0) {
        return `
        <div style="border-top: 1px solid #e0e0e0; padding-top: 6px; margin-top: 6px; font-size: 0.85em; color: #555;">
          <strong>Slot:</strong> Cantrip (No slot cost)
          <input type="hidden" id="castLevelSelect" value="0" />
        </div>
      `;
      }

      const isAuto = spell.resolutionMethod === "auto";
      const isMultiAtk = spell.resolutionMethod === "attack" && spell.isMultiAttack;

      let upcastLabel = "";
      if (isAuto) {
        const pCount = spell.upcastProjectiles ?? 1;
        upcastLabel = `${pCount} Projectile${pCount > 1 ? "s" : ""}`;
      } else if (isMultiAtk && Number(spell.upcastAttacks) > 0) {
        const aCount = spell.upcastAttacks;
        upcastLabel = `${aCount} Ray${aCount > 1 ? "s" : ""}`;
      } else {
        upcastLabel = spell.upcastDiceFormula ? spell.upcastDiceFormula : `1${spell.damageDieSize}`;
      }

      let html = `
      <div style="border-top: 1px solid #e0e0e0; padding-top: 6px; margin-top: 6px;">
        <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; font-weight: bold; color: #4b5d88; margin-bottom: 4px;">
          <span>CAST AT LEVEL:</span>
        </label>
        <select id="castLevelSelect" style="width: 100%; height: 30px; font-size: 0.9em; border-radius: 4px; border: 1px solid #7289da; padding: 2px 6px;">
    `;
      for (let lvl = baseLevel; lvl <= 9; lvl++) {
        const slotInfo = getSlotInfo(lvl);
        const extraLevels = lvl - baseLevel;
        const extraText = extraLevels > 0 ? ` (+${extraLevels}x ${upcastLabel})` : "";
        html += `<option value="${lvl}" ${lvl === baseLevel ? 'selected' : ''}>Level ${lvl} [${slotInfo.label} slots]${extraText}</option>`;
      }
      html += `
        </select>
        <div style="margin-top: 6px;">
          <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer; padding: 3px 6px; background: rgba(0,0,0,0.03); border-radius: 4px; border: 1px solid #e0e0e0;">
            <span style="font-weight: 600; color: #4b5d88;">Deduct slot from Foundry sheet</span>
            <input type="checkbox" id="deductSlotToggle" style="margin: 0;" />
          </label>
        </div>
      </div>
    `;
      return html;
    }

    function scaleDiceFormula(formula, factor) {
      if (!formula) return "";
      const cleaned = String(formula).replace(/[()]/g, "").trim();
      if (!isNaN(Number(cleaned))) {
        return String(Number(cleaned) * factor);
      }
      return cleaned.replace(/(\d*)([dD]\d+)/g, (match, count, die) => {
        const c = parseInt(count) || 1;
        return `${c * factor}${die}`;
      });
    }

    function getEffectiveConfig(baseConfig, castLevel) {
      const cfg = foundry.utils.duplicate(baseConfig);
      const baseLvl = Number(cfg.baseLevel) || 0;
      const currentCastLvl = castLevel !== undefined ? Number(castLevel) : baseLvl;
      const extraLevels = (baseLvl > 0 && currentCastLvl > baseLvl) ? (currentCastLvl - baseLvl) : 0;
      cfg.castLevel = currentCastLvl;

      if (cfg.resolutionMethod === "auto") {
        const baseProjectiles = Number(cfg.projectileCount) || 3;
        const upcastStep = Number(cfg.upcastProjectiles) || 1;
        cfg.effectiveProjectiles = baseProjectiles + (extraLevels * upcastStep);
      } else if (cfg.resolutionMethod === "attack" && cfg.isMultiAttack) {
        let baseCount = Number(cfg.attackCount) || 1;
        if (cfg.cantripAttackScaling && baseLvl === 0) {
          const charLvl = actor.system.details?.level ?? 1;
          if (charLvl >= 17) baseCount = 4;
          else if (charLvl >= 11) baseCount = 3;
          else if (charLvl >= 5) baseCount = 2;
          else baseCount = 1;
        }
        const upcastAtkStep = Number(cfg.upcastAttacks) || 0;
        cfg.effectiveAttacks = baseCount + (extraLevels * upcastAtkStep);
      } else if (extraLevels > 0) {
        if (cfg.upcastDiceFormula) {
          const scaledUpcast = scaleDiceFormula(cfg.upcastDiceFormula, extraLevels);
          if (!isNaN(Number(scaledUpcast))) {
            cfg.flatDamageBonus = (Number(cfg.flatDamageBonus) || 0) + Number(scaledUpcast);
          } else if (cfg.extraDiceFormula) {
            cfg.extraDiceFormula = `${cfg.extraDiceFormula} + ${scaledUpcast}`;
          } else {
            cfg.extraDiceFormula = scaledUpcast;
          }
        } else if (Number(cfg.damageDiceCount) > 0) {
          cfg.damageDiceCount = Number(cfg.damageDiceCount) + extraLevels;
        }
      }

      return { cfg, extraLevels };
    }

    function formatTargetDisplay(cfg) {
      const type = cfg.targetType || "creature";
      if (type === "creature") return "Creature(s)";
      if (type === "object") return "Object(s)";
      if (type === "creature_object") return "Creature / Object";
      if (type === "self") return "Self";
      if (type === "point") return "Point";
      if (type === "area") {
        const shape = cfg.areaShape ? cfg.areaShape.charAt(0).toUpperCase() + cfg.areaShape.slice(1) : "Area";
        const size = cfg.areaSize ? ` (${cfg.areaSize})` : "";
        return `${shape}${size}`;
      }
      return "Creature(s)";
    }

    function getSummaryHtml(spell, castLevel) {
      if (!spell) return "";

      const { cfg, extraLevels } = getEffectiveConfig(spell, castLevel);

      const abilityMod = actor.system.abilities[cfg.spellAbility]?.mod || 0;
      const prof = actor.system.attributes.prof || 0;
      const atkMod = Number(cfg.attackModifier) || 0;
      const totalAtk = abilityMod + prof + atkMod;
      const atkSign = totalAtk >= 0 ? `+${totalAtk}` : `${totalAtk}`;
      const spellDC = 8 + prof + abilityMod;

      const isHealing = ["heal", "temp_hp", "max_hp"].includes(cfg.resolutionMethod);
      let effectiveFlat = Number(cfg.flatDamageBonus) || 0;
      if (isHealing && cfg.addAbilityModToValue) {
        effectiveFlat += abilityMod;
      }

      const diceCount = Number(cfg.damageDiceCount) || 0;
      let valFormula = "";
      if (diceCount > 0) {
        valFormula = `${diceCount}${cfg.damageDieSize}`;
        if (cfg.extraDiceFormula) valFormula += ` + ${cfg.extraDiceFormula}`;
        if (effectiveFlat !== 0) valFormula += ` + ${effectiveFlat}`;
      } else {
        valFormula = effectiveFlat !== 0 ? `${effectiveFlat}` : "0";
      }

      let actionHeader = "ATTACK";
      let actionVal = atkSign;
      let typeLabel = (cfg.damageType || "fire").toUpperCase();

      if (cfg.resolutionMethod === "attack" && cfg.isMultiAttack) {
        actionHeader = "ATTACKS";
        actionVal = `${cfg.effectiveAttacks || cfg.attackCount || 1}x (${atkSign})`;
      } else if (cfg.resolutionMethod === "save") {
        actionHeader = "SAVE DC";
        actionVal = `DC ${spellDC} ${(cfg.saveAbility || 'dex').toUpperCase()}`;
      } else if (cfg.resolutionMethod === "auto") {
        actionHeader = "HITS";
        actionVal = `${cfg.effectiveProjectiles || cfg.projectileCount || 3} Darts`;
      } else if (cfg.resolutionMethod === "heal") {
        actionHeader = "TYPE";
        actionVal = "HEALING";
        typeLabel = "HP RECOVERY";
      } else if (cfg.resolutionMethod === "temp_hp") {
        actionHeader = "TYPE";
        actionVal = "TEMP HP";
        typeLabel = "TEMP HP";
      } else if (cfg.resolutionMethod === "max_hp") {
        actionHeader = "TYPE";
        actionVal = "MAX HP";
        typeLabel = "AID / MAX HP";
      }

      if (cfg.damageMode === "chaos" && !isHealing) typeLabel = "CHAOS";
      if (cfg.damageMode === "choice" && !isHealing) typeLabel = "CHOICE";

      const tags = [];
      tags.push(cfg.castingTime || "1 Action");
      tags.push(cfg.range || "Touch");
      tags.push(`Target: ${formatTargetDisplay(cfg)}`);
      tags.push(`Dur: ${cfg.duration || "Instant"}`);
      if (cfg.concentration) tags.push("Concentration");

      let compList = [];
      if (cfg.components?.v) compList.push("V");
      if (cfg.components?.s) compList.push("S");
      if (cfg.components?.m) compList.push(cfg.components?.costly ? "M*" : "M");
      if (compList.length > 0) tags.push(`Comp: ${compList.join(",")}`);

      const explodeCond = (cfg.explodeCondition || (cfg.explodingDice ? "x" : "")).trim();
      if (explodeCond && !isHealing && cfg.resolutionMethod !== "auto") tags.push(`Explode [${explodeCond}]`);
      if (cfg.chaosJump && !isHealing) tags.push("Chaos Jump");
      if (cfg.superAdv && cfg.resolutionMethod === "attack") tags.push("Super Adv");
      if (cfg.isCantripScale && !cfg.isMultiAttack) tags.push("Cantrip Scale");

      const tagsHtml = tags.map(t => {
        const isConc = t === "Concentration";
        const bg = isConc ? "rgba(163, 72, 72, 0.15)" : "rgba(114, 137, 218, 0.18)";
        const border = isConc ? "rgba(163, 72, 72, 0.4)" : "rgba(114, 137, 218, 0.4)";
        const color = isConc ? "#a34848" : "#4b5d88";
        return `<span style="display: inline-block; background: ${bg}; border: 1px solid ${border}; border-radius: 3px; padding: 2px 6px; font-size: 0.75em; font-weight: 600; color: ${color};">${t}</span>`;
      }).join("");

      return `
      <div style="display: flex; justify-content: space-around; background: rgba(0,0,0,0.04); border-radius: 4px; padding: 6px 4px; margin-bottom: 6px; text-align: center;">
        <div>
          <div style="font-size: 0.75em; font-weight: 600; color: #777;">${actionHeader}</div>
          <div style="font-size: 1.1em; font-weight: bold; color: #2b3a4a;">${actionVal}</div>
        </div>
        <div style="border-left: 1px solid rgba(0,0,0,0.1); border-right: 1px solid rgba(0,0,0,0.1); padding: 0 12px;">
          <div style="font-size: 0.75em; font-weight: 600; color: #777;">${cfg.isMultiAttack ? "PER RAY" : (isHealing ? "VALUE" : "DAMAGE")}</div>
          <div style="font-size: 1.1em; font-weight: bold; color: #2b3a4a;">${valFormula}</div>
        </div>
        <div>
          <div style="font-size: 0.75em; font-weight: 600; color: #777;">EFFECT</div>
          <div style="font-size: 1.1em; font-weight: bold; color: #2b3a4a;">${typeLabel}</div>
        </div>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-bottom: 6px;">
        ${tagsHtml}
      </div>
      ${cfg.components?.costly && cfg.components?.description ? `
        <div style="font-size: 0.78em; color: #b35900; background: rgba(179, 89, 0, 0.08); padding: 3px 6px; border-radius: 3px; margin-bottom: 4px;">
          <i class="fas fa-coins"></i> <strong>Cost:</strong> ${cfg.components.description}
        </div>
      ` : ''}
      ${cfg.summary ? `
        <div style="font-size: 0.82em; color: #555; font-style: italic; border-top: 1px solid #e0e0e0; padding-top: 4px; margin-top: 4px;">
          ${cfg.summary}
        </div>
      ` : ''}
    `;
    }

    const firstKey = spellKeys[0];
    const initialSpell = spellConfigs[firstKey];

    const content = `
    <div style="display: flex; flex-direction: column; gap: 10px; padding: 6px 4px;">
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 4px;">
        <span style="font-weight: 600; font-size: 1em; color: #333;">Select Spell</span>
        <span style="font-size: 0.85em; color: #777;">${actor.name}</span>
      </div>

      <div style="display: flex; flex-direction: column; gap: 4px;">
        <select id="spellChoice" style="width: 100%; height: 32px; padding: 2px 6px; font-size: 0.95em; border-radius: 4px; border: 1px solid #7289da;">
          ${optionsHtml}
        </select>
      </div>

      <div id="upcastContainer">
        ${getUpcastOptionsHtml(initialSpell)}
      </div>

      <div id="spell-preview-box" style="border: 1px solid #d2d7df; border-radius: 5px; padding: 8px; background: #fafbfc;">
        ${getSummaryHtml(initialSpell, initialSpell.baseLevel)}
      </div>
    </div>
  `;

    let performCast = false;

    new Dialog({
      title: `${actor.name}: Cast Spell`,
      content: content,
      buttons: {
        cast: {
          icon: '<i class="fas fa-magic" style="margin-right: 6px;"></i>',
          label: "Cast Spell",
          callback: () => { performCast = true; }
        },
        cancel: { label: "Cancel" }
      },
      default: "cast",
      render: (html) => {
        const spellSelect = html.find("#spellChoice");
        const upcastContainer = html.find("#upcastContainer");
        const previewBox = html.find("#spell-preview-box");

        function updateUI() {
          const chosenKey = spellSelect.val();
          const chosen = spellConfigs[chosenKey];
          const castLvl = html.find("#castLevelSelect").val() ?? chosen.baseLevel;
          previewBox.html(getSummaryHtml(chosen, castLvl));
        }

        function rebuildUpcastAndPreview() {
          const chosenKey = spellSelect.val();
          const chosen = spellConfigs[chosenKey];
          upcastContainer.html(getUpcastOptionsHtml(chosen));

          html.find("#castLevelSelect").on("change", () => {
            updateUI();
          });

          updateUI();
        }

        spellSelect.on("change", rebuildUpcastAndPreview);
        html.find("#castLevelSelect").on("change", updateUI);
      },
      close: async (html) => {
        if (!performCast) return;

        const chosenKey = html.find("#spellChoice").val();
        const rawConfig = spellConfigs[chosenKey];

        if (!rawConfig) return;
        if (!globalThis.attackSocket) {
          return ui.notifications.error("SocketLib handler is not initialized. Please refresh the page.");
        }

        const castLvl = Number(html.find("#castLevelSelect").val()) ?? Number(rawConfig.baseLevel) ?? 0;
        const { cfg: config } = getEffectiveConfig(rawConfig, castLvl);

        const shouldDeduct = html.find("#deductSlotToggle").is(":checked");
        if (!shouldDeduct || castLvl === 0) {
          config.skipSlotDeduction = true;
        } else {
          const slotKey = `spell${castLvl}`;
          const currentSlotVal = Number(actor.system.spells?.[slotKey]?.value) || 0;
          if (currentSlotVal <= 0) {
            const proceed = await Dialog.confirm({
              title: "No Spell Slots Remaining",
              content: `<p><strong>${actor.name}</strong> has <strong>0</strong> Level ${castLvl} spell slots remaining on their Foundry sheet. Cast anyway?</p>`
            });
            if (!proceed) return;
            config.skipSlotDeduction = true;
          }
        }

        if (config.damageMode === "choice" && !["heal", "temp_hp", "max_hp"].includes(config.resolutionMethod)) {
          const choiceOptions = [
            "acid", "cold", "fire", "force", "lightning",
            "necrotic", "poison", "psychic", "radiant", "thunder"
          ].map(t => `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('');

          const promptContent = `
          <div style="padding: 6px 4px;">
            <label style="font-weight: 600; font-size: 0.9em; display: block; margin-bottom: 5px;">Choose Damage Type:</label>
            <select id="chosenType" style="width: 100%; height: 30px; font-size: 0.9em; border-radius: 4px; border: 1px solid #7289da;">
              ${choiceOptions}
            </select>
          </div>
        `;

          let choiceConfirmed = false;
          await new Promise((resolve) => {
            new Dialog({
              title: `${config.spellName}: Damage Type`,
              content: promptContent,
              buttons: {
                ok: {
                  label: "Confirm",
                  callback: (choiceHtml) => {
                    choiceConfirmed = true;
                    config.damageType = choiceHtml.find("#chosenType").val();
                  }
                },
                cancel: { label: "Cancel" }
              },
              default: "ok",
              close: () => resolve()
            }, { width: 280 }).render(true);
          });

          if (!choiceConfirmed) return;
        }

        config.targetIds = Array.from(game.user.targets).map(t => t.id);
        await globalThis.attackSocket.executeAsGM("runSpellAttackRoll", config, actor.id, game.user.id);
      }
    }, { width: 400 }).render(true);
  };

  // =========================================================================
  // TRACKING STUFF: RECHARGE & RESOURCE ENGINE
  // =========================================================================
  async function rechargeActorTrackers(actor, restType = "lr") {
    if (!actor) return [];
    const isLR = restType === "lr";
    const isSR = restType === "sr";
    const isDawn = restType === "dawn";

    const updates = {};
    const itemUpdates = [];
    const rechargeChatLines = [];

    const trackers = actor.getFlag("world", "trackingStuff") || [];
    let trackersModified = false;
    const handledItemIds = new Set();
    const handledResourceSlots = new Set();

    // 1. Process all active Trackers configured in trackingStuff
    for (const t of trackers) {
      const reset = String(t.resetOn || "lr").toLowerCase();
      let shouldRecharge = false;
      const isReset1 = reset.includes("reset_1");
      const isReset0 = reset.includes("reset_0");

      if (isLR) {
        shouldRecharge = (reset.startsWith("lr") || reset.startsWith("sr") || reset.startsWith("dawn") || reset === "day");
      } else if (isSR) {
        shouldRecharge = reset.startsWith("sr");
      } else if (isDawn) {
        shouldRecharge = (reset.startsWith("dawn") || reset === "day");
      }

      if (!shouldRecharge) continue;

      const trackerLabel = t.label || t.name || (t.resourceSlot ? `Resource: ${t.resourceSlot}` : "Tracker");

      if (t.type === "item" && t.itemRefId) {
        handledItemIds.add(t.itemRefId);
        const item = actor.items.get(t.itemRefId);
        if (item) {
          const uses = item.system.uses;
          const max = Number(uses?.max ?? t.max ?? 0);
          const cur = uses?.spent !== undefined ? Math.max(0, max - Number(uses.spent)) : Number(uses?.value ?? t.value ?? 0);
          if (isReset1 || isReset0) {
            const targetVal = isReset1 ? 1 : 0;
            if (cur !== targetVal) {
              itemUpdates.push({
                _id: item.id,
                "system.uses.spent": Math.max(0, max - targetVal),
                "system.uses.value": targetVal
              });
              t.value = targetVal;
              trackersModified = true;
              rechargeChatLines.push(`• <strong>${item.name}</strong>: Reset to ${targetVal}/${max}`);
            }
          } else if (cur < max) {
            const formula = (t.rechargeFormula || "").trim();
            if (formula) {
              try {
                const roll = new Roll(formula);
                await roll.evaluate();
                const newVal = Math.min(max, cur + roll.total);
                itemUpdates.push({
                  _id: item.id,
                  "system.uses.spent": Math.max(0, max - newVal),
                  "system.uses.value": newVal
                });
                t.value = newVal;
                trackersModified = true;
                rechargeChatLines.push(`• <strong>${item.name}</strong>: Regained ${roll.total} charges via <code>${formula}</code> (now ${newVal}/${max})`);
              } catch (err) {
                console.error("Recharge formula error", err);
              }
            } else {
              itemUpdates.push({
                _id: item.id,
                "system.uses.spent": 0,
                "system.uses.value": max
              });
              t.value = max;
              trackersModified = true;
              rechargeChatLines.push(`• <strong>${item.name}</strong>: Restored to ${max}/${max}`);
            }
          }
        }
      } else if (t.type === "resource" && t.resourceSlot) {
        handledResourceSlots.add(t.resourceSlot);
        const res = actor.system.resources?.[t.resourceSlot];
        const cur = Number(res?.value ?? t.value ?? 0);
        const max = Number(res?.max ?? t.max ?? 0);
        if (isReset1 || isReset0) {
          const targetVal = isReset1 ? 1 : 0;
          if (cur !== targetVal) {
            updates[`system.resources.${t.resourceSlot}.value`] = targetVal;
            t.value = targetVal;
            trackersModified = true;
            rechargeChatLines.push(`• <strong>${trackerLabel}</strong>: Reset to ${targetVal}/${max}`);
          }
        } else if (cur < max) {
          const formula = (t.rechargeFormula || "").trim();
          if (formula) {
            try {
              const roll = new Roll(formula);
              await roll.evaluate();
              const newVal = Math.min(max, cur + roll.total);
              updates[`system.resources.${t.resourceSlot}.value`] = newVal;
              t.value = newVal;
              trackersModified = true;
              rechargeChatLines.push(`• <strong>${trackerLabel}</strong>: Regained ${roll.total} charges via <code>${formula}</code> (now ${newVal}/${max})`);
            } catch (e) {}
          } else {
            updates[`system.resources.${t.resourceSlot}.value`] = max;
            t.value = max;
            trackersModified = true;
            rechargeChatLines.push(`• <strong>${trackerLabel}</strong>: Restored to ${max}/${max}`);
          }
        }
      } else if (t.type === "custom") {
        const cur = Number(t.value ?? 0);
        const max = Number(t.max ?? 0);
        if (isReset1 || isReset0) {
          const targetVal = isReset1 ? 1 : 0;
          if (cur !== targetVal) {
            t.value = targetVal;
            trackersModified = true;
            rechargeChatLines.push(`• <strong>${trackerLabel}</strong>: Reset to ${targetVal}/${max}`);
          }
        } else if (cur < max) {
          const formula = (t.rechargeFormula || "").trim();
          if (formula) {
            try {
              const roll = new Roll(formula);
              await roll.evaluate();
              const newVal = Math.min(max, cur + roll.total);
              t.value = newVal;
              trackersModified = true;
              rechargeChatLines.push(`• <strong>${trackerLabel}</strong>: Regained ${roll.total} charges via <code>${formula}</code> (now ${newVal}/${max})`);
            } catch (e) {}
          } else {
            t.value = max;
            trackersModified = true;
            rechargeChatLines.push(`• <strong>${trackerLabel}</strong>: Restored to ${max}/${max}`);
          }
        }
      }
    }

    // 2. Also check any actor items not explicitly in trackers
    for (const item of actor.items) {
      if (handledItemIds.has(item.id)) continue;
      const uses = item.system.uses;
      if (uses && typeof uses.max === "number" && uses.max > 0) {
        const per = String(uses.per || "").toLowerCase();
        let shouldRecharge = false;
        if (isLR) {
          shouldRecharge = (per === "lr" || per === "sr" || per === "day" || per === "dawn" || per === "charges");
        } else if (isSR) {
          shouldRecharge = (per === "sr");
        } else if (isDawn) {
          shouldRecharge = (per === "day" || per === "dawn" || per === "charges");
        }
        const max = Number(uses.max) || 0;
        const cur = uses.spent !== undefined ? Math.max(0, max - Number(uses.spent)) : Number(uses.value ?? 0);
        if (shouldRecharge && cur < max) {
          let formula = "";
          if (uses.recovery && Array.isArray(uses.recovery)) {
            const formRec = uses.recovery.find(r => r.formula);
            if (formRec) formula = formRec.formula;
          }
          if (!formula && item.system.description?.value) {
            const m = item.system.description.value.match(/regains?\s+(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+expended\s+charges/i);
            if (m) formula = m[1].trim();
          }
          if (formula) {
            try {
              const roll = new Roll(formula);
              await roll.evaluate();
              const newVal = Math.min(max, cur + roll.total);
              itemUpdates.push({
                _id: item.id,
                "system.uses.spent": Math.max(0, max - newVal),
                "system.uses.value": newVal
              });
              rechargeChatLines.push(`• <strong>${item.name}</strong>: Regained ${roll.total} charges via <code>${formula}</code> (now ${newVal}/${max})`);
            } catch (err) {}
          } else {
            itemUpdates.push({
              _id: item.id,
              "system.uses.spent": 0,
              "system.uses.value": max
            });
            rechargeChatLines.push(`• <strong>${item.name}</strong>: Restored to ${max}/${max}`);
          }
        }
      }
    }

    // 3. Class resources not explicitly in trackers
    for (const slot of ["primary", "secondary", "tertiary"]) {
      if (handledResourceSlots.has(slot)) continue;
      const res = actor.system.resources?.[slot];
      if (res && res.label && typeof res.max === "number" && res.max > 0) {
        let shouldReset = false;
        if (isLR) shouldReset = (res.lr || res.sr || (!res.lr && !res.sr));
        else if (isSR) shouldReset = Boolean(res.sr);
        if (shouldReset && res.value < res.max) {
          updates[`system.resources.${slot}.value`] = res.max;
          rechargeChatLines.push(`• <strong>${res.label}</strong>: Reset to ${res.max}/${res.max}`);
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await actor.update(updates);
    }
    if (itemUpdates.length > 0) {
      await actor.updateEmbeddedDocuments("Item", itemUpdates);
    }
    if (trackersModified) {
      await actor.setFlag("world", "trackingStuff", trackers);
    }

    return rechargeChatLines;
  }
  window.CustomRolls.rechargeActorTrackers = rechargeActorTrackers;

  function getTrackingStuffHelper(actor) {
    let trackers = actor.getFlag("world", "trackingStuff");
    if (!Array.isArray(trackers)) {
      trackers = [];
      const res = actor.system.resources || {};
      for (const slot of ["primary", "secondary", "tertiary"]) {
        const r = res[slot];
        if (r && r.label && typeof r.max === "number" && r.max > 0) {
          trackers.push({
            id: `resource_${slot}`,
            type: "resource",
            resourceSlot: slot,
            label: r.label,
            value: r.value ?? r.max,
            max: r.max,
            resetOn: r.sr ? "sr" : (r.lr ? "lr" : "none")
          });
        }
      }
    }

    function getLiveTracker(t) {
      if (t.type === "item" && t.itemRefId) {
        const it = actor.items.get(t.itemRefId);
        const name = it?.name || t.label || t.name || "Item";
        const max = Number(it?.system?.uses?.max ?? t.max ?? 0);
        let val;
        if (it?.system?.uses?.spent !== undefined) {
          val = Math.max(0, max - Number(it.system.uses.spent));
        } else {
          val = Number(it?.system?.uses?.value ?? t.value ?? 0);
        }
        return {
          label: name,
          value: val,
          max: max,
          rechargeFormula: t.rechargeFormula
        };
      } else if (t.type === "resource" && t.resourceSlot) {
        const r = actor.system.resources?.[t.resourceSlot];
        const resLabel = r?.label?.trim() || t.label?.trim() || t.name?.trim() || (t.resourceSlot.charAt(0).toUpperCase() + t.resourceSlot.slice(1) + " Resource");
        return {
          label: resLabel,
          value: r?.value ?? t.value ?? 0,
          max: r?.max ?? t.max ?? 0,
          rechargeFormula: t.rechargeFormula
        };
      }
      return {
        label: t.label || t.name || "Custom Tracker",
        value: t.value ?? 0,
        max: t.max ?? 0,
        rechargeFormula: t.rechargeFormula
      };
    }

    function renderChips() {
      if (!trackers || trackers.length === 0) {
        return `<span style="font-size: 0.72em; color: #4b5d88; font-style: italic; padding: 4px 2px;">No active trackers. Click <strong style="color: #4b5d88 !important;">Manage</strong> to track abilities, charges, and other resources.</span>`;
      }

      return trackers.map(t => {
        const live = getLiveTracker(t);
        return `
          <div class="tracking-chip" data-id="${t.id}" style="display: flex; align-items: center; justify-content: space-between; background: #fff; border: 1px solid #c0c6ce; border-radius: 4px; padding: 3px 6px; min-height: 24px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); width: 100%; box-sizing: border-box; gap: 6px;">
            <span style="font-weight: 600; font-size: 0.80em; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; line-height: 18px;" title="${live.label}">${live.label}</span>
            <div style="display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0;">
              <input type="number" class="chip-val-input" data-id="${t.id}" min="0" max="${live.max}" value="${live.value}" style="width: 28px; height: 18px; line-height: 16px; text-align: center; font-size: 0.80em; font-weight: 700; padding: 0; border: 1px solid #c0c6ce; border-radius: 2px; background: #fafbfc; color: #1e293b; margin: 0;" />
              <span style="font-size: 0.78em; font-weight: 600; color: #475569; line-height: 18px; margin-right: 2px;">/${live.max}</span>
              <button type="button" class="btn-chip-dec" data-id="${t.id}" title="Decrease" style="width: 20px; height: 18px; line-height: 16px; font-weight: 700; font-size: 0.85em; padding: 0; border: 1px solid #c0c6ce; background: #fff; border-radius: 2px; cursor: pointer; color: #2b3a4a; display: inline-flex; align-items: center; justify-content: center; text-align: center;">-</button>
              <button type="button" class="btn-chip-inc" data-id="${t.id}" title="Increase" style="width: 20px; height: 18px; line-height: 16px; font-weight: 700; font-size: 0.85em; padding: 0; border: 1px solid #c0c6ce; background: #fff; border-radius: 2px; cursor: pointer; color: #2b3a4a; display: inline-flex; align-items: center; justify-content: center; text-align: center;">+</button>
            </div>
          </div>
        `;
      }).join('');
    }

    const htmlContent = `
      <div id="tracking-stuff-wrapper" style="display: flex; flex-direction: column; gap: 4px; background: #f8fafc; border: 1px solid #bcc5d3; border-radius: 5px; padding: 5px; height: 100%; box-sizing: border-box; min-height: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e0e6ed; padding-bottom: 3px;">
          <span style="font-weight: 700; font-size: 0.68em; color: #4b5d88; letter-spacing: 0.5px; text-transform: uppercase;">
            Tracking Stuff
          </span>
        </div>
        <div style="display: flex; gap: 3px; width: 100%;">
          <button type="button" id="btn-recharge-sr" title="Short Rest Recharge" style="flex: 1; font-size: 0.68em; font-weight: 700; height: 20px; padding: 0 2px; border: 1px solid #2b7489; background: #eef7fa; color: #1e5a6a; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 2px;">
            <i class="fas fa-rotate"></i> SR
          </button>
          <button type="button" id="btn-recharge-lr" title="Long Rest Recharge" style="flex: 1; font-size: 0.68em; font-weight: 700; height: 20px; padding: 0 2px; border: 1px solid #388e3c; background: #f1f8f2; color: #256029; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 2px;">
            <i class="fas fa-rotate"></i> LR
          </button>
          <button type="button" id="btn-recharge-dawn-all" title="Roll recharge for all Daily/Dawn items" style="flex: 1.1; font-size: 0.68em; font-weight: 700; height: 20px; padding: 0 2px; border: 1px solid #e5a50a; background: #fffbe6; color: #9c6c03; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 2px;">
            <i class="fas fa-sun"></i> Dawn
          </button>
          <button type="button" id="btn-open-add-tracker" title="Manage active trackers or add new ones" style="flex: 1.2; font-size: 0.68em; font-weight: 700; height: 20px; padding: 0 2px; border: 1px solid #7289da; background: #f0f4ff; color: #4054b2; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;">
            Manage
          </button>
        </div>
        <div id="tracking-chips-container" style="display: flex; flex-direction: column; gap: 3px; max-height: 340px; overflow-y: auto; padding-right: 2px; min-height: 0; flex: 1;">
          ${renderChips()}
        </div>
      </div>
    `;

    return {
      html: htmlContent,
      setupEvents: (containerHtml) => {
        const refreshChips = () => {
          trackers = actor.getFlag("world", "trackingStuff") || [];
          containerHtml.find('#tracking-chips-container').html(renderChips());
          bindChipEvents();
        };
        window.CustomRolls._refreshTrackingChips = refreshChips;

        const updateVal = async (t, delta, directValue = null) => {
          const live = getLiveTracker(t);
          const targetVal = directValue !== null ? directValue : (live.value + delta);
          const newVal = Math.clamp(targetVal, 0, live.max);
          if (newVal === live.value && directValue === null) return;

          // Optimistic local UI update (zero visual delay!)
          t.value = newVal;
          containerHtml.find(`.chip-val-input[data-id="${t.id}"]`).val(newVal);
          containerHtml.find(`.tracker-val-display[data-id="${t.id}"], .chip-val-display[data-id="${t.id}"]`).text(`${newVal} / ${live.max}`);

          // Persist update via GM socket so player clients reliably update embedded items
          if (globalThis.attackSocket?.executeAsGM) {
            await globalThis.attackSocket.executeAsGM("updateActorTrackerValueAsGM", actor.id, t.id, t.type, t.itemRefId, t.resourceSlot, newVal, game.user.id);
          } else {
            if (t.type === "item" && t.itemRefId) {
              const item = actor.items.get(t.itemRefId);
              if (item) {
                const max = Number(item.system?.uses?.max || 0);
                const newSpent = Math.max(0, max - newVal);
                await item.update({
                  "system.uses.spent": newSpent,
                  "system.uses.value": newVal
                });
              }
            } else if (t.type === "resource" && t.resourceSlot) {
              await actor.update({ [`system.resources.${t.resourceSlot}.value`]: newVal });
            }
            await actor.setFlag("world", "trackingStuff", trackers);
          }
        };

        const bindChipEvents = () => {
          containerHtml.find('.btn-chip-dec').off('click').on('click', function (e) {
            e.stopPropagation();
            const id = $(this).data('id');
            const t = trackers.find(x => x.id === id);
            if (t) updateVal(t, -1);
          });

          containerHtml.find('.btn-chip-inc').off('click').on('click', function (e) {
            e.stopPropagation();
            const id = $(this).data('id');
            const t = trackers.find(x => x.id === id);
            if (t) updateVal(t, 1);
          });

          containerHtml.find('.chip-val-input').off('change').on('change', function (e) {
            e.stopPropagation();
            const id = $(this).data('id');
            const t = trackers.find(x => x.id === id);
            if (t) {
              const parsed = parseInt($(this).val(), 10);
              const val = isNaN(parsed) ? 0 : parsed;
              updateVal(t, 0, val);
            }
          });

          containerHtml.find('.chip-val-input').off('keydown').on('keydown', function (e) {
            if (e.key === "Enter") {
              e.preventDefault();
              $(this).trigger("change");
            }
          });
        };

        bindChipEvents();

        // Short Rest button handler
        containerHtml.find('#btn-recharge-sr').off('click').on('click', async function () {
          let lines = [];
          if (globalThis.attackSocket?.executeAsGM) {
            lines = await globalThis.attackSocket.executeAsGM("rechargeActorTrackersAsGM", actor.id, "sr", game.user.id);
          } else {
            lines = await rechargeActorTrackers(actor, "sr");
          }
          refreshChips();
          if (lines && lines.length > 0) {
            await ChatMessage.create({
              user: game.user.id,
              speaker: ChatMessage.getSpeaker({ actor }),
              content: `<div style="font-size: 1.05em; line-height: 1.45; padding: 8px 10px; border-left: 4px solid #2b7489; background: #eef7fa; border-radius: 4px; color: #1a2d36;">
                <div style="font-weight: 700; font-size: 1.1em; margin-bottom: 4px; color: #1e5a6a;">
                  <i class="fas fa-rotate"></i> ${actor.name}: Short Rest Recharge Completed
                </div>
                <div style="margin-top: 4px;">
                  ${lines.join("<br>")}
                </div>
              </div>`
            });
          } else {
            ui.notifications.info(`${actor.name}: No Short Rest items needed recharging.`);
          }
        });

        // Long Rest button handler
        containerHtml.find('#btn-recharge-lr').off('click').on('click', async function () {
          let lines = [];
          if (globalThis.attackSocket?.executeAsGM) {
            lines = await globalThis.attackSocket.executeAsGM("rechargeActorTrackersAsGM", actor.id, "lr", game.user.id);
          } else {
            lines = await rechargeActorTrackers(actor, "lr");
          }
          refreshChips();
          if (lines && lines.length > 0) {
            await ChatMessage.create({
              user: game.user.id,
              speaker: ChatMessage.getSpeaker({ actor }),
              content: `<div style="font-size: 1.05em; line-height: 1.45; padding: 8px 10px; border-left: 4px solid #388e3c; background: #f1f8f2; border-radius: 4px; color: #1d331f;">
                <div style="font-weight: 700; font-size: 1.1em; margin-bottom: 4px; color: #256029;">
                  <i class="fas fa-rotate"></i> ${actor.name}: Long Rest Recharge Completed
                </div>
                <div style="margin-top: 4px;">
                  ${lines.join("<br>")}
                </div>
              </div>`
            });
          } else {
            ui.notifications.info(`${actor.name}: No Long Rest items needed recharging.`);
          }
        });

        // Dawn button handler
        containerHtml.find('#btn-recharge-dawn-all').off('click').on('click', async function () {
          let lines = [];
          if (globalThis.attackSocket?.executeAsGM) {
            lines = await globalThis.attackSocket.executeAsGM("rechargeActorTrackersAsGM", actor.id, "dawn", game.user.id);
          } else {
            lines = await rechargeActorTrackers(actor, "dawn");
          }
          refreshChips();
          if (lines && lines.length > 0) {
            await ChatMessage.create({
              user: game.user.id,
              speaker: ChatMessage.getSpeaker({ actor }),
              content: `<div style="font-size: 1.05em; line-height: 1.45; padding: 8px 10px; border-left: 4px solid #e5a50a; background: #fffbe6; border-radius: 4px; color: #3b2c05;">
                <div style="font-weight: 700; font-size: 1.1em; margin-bottom: 4px; color: #9c6c03;">
                  <i class="fas fa-sun"></i> ${actor.name}: Dawn Recharge Completed
                </div>
                <div style="margin-top: 4px;">
                  ${lines.join("<br>")}
                </div>
              </div>`
            });
          } else {
            ui.notifications.info(`${actor.name}: No daily items needed recharging.`);
          }
        });

        // Manage Tracking Stuff Modal
        containerHtml.find('#btn-open-add-tracker').off('click').on('click', function () {
          const available = [];

          // 1. Resources
          const resources = actor.system.resources || {};
          for (const slot of ["primary", "secondary", "tertiary"]) {
            const r = resources[slot];
            if (r && r.label && typeof r.max === "number" && r.max > 0) {
              const id = `resource_${slot}`;
              const isAdded = trackers.some(x => x.id === id || (x.type === "resource" && x.resourceSlot === slot));
              available.push({
                id,
                type: "resource",
                resourceSlot: slot,
                label: r.label,
                value: r.value ?? r.max,
                max: r.max,
                isAdded,
                resetOn: r.sr ? "sr" : (r.lr ? "lr" : "none")
              });
            }
          }

          // 2. Items with uses
          for (const it of actor.items) {
            const u = it.system.uses;
            if (u && typeof u.max === "number" && u.max > 0) {
              const id = `item_${it.id}`;
              const isAdded = trackers.some(x => x.id === id || (x.type === "item" && x.itemRefId === it.id));

              let formula = "";
              if (u.recovery && Array.isArray(u.recovery)) {
                const fr = u.recovery.find(r => r.formula);
                if (fr) formula = fr.formula;
              }
              if (!formula && it.system.description?.value) {
                const m = it.system.description.value.match(/regains?\s+(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+expended\s+charges/i);
                if (m) formula = m[1].trim();
              }

              const per = String(u.per || "").toLowerCase();
              const resetOn = per === "sr" ? "sr" : (per === "lr" ? "lr" : (formula || per === "day" || per === "dawn" || per === "charges" ? "dawn" : "none"));

              const curItemUses = u.spent !== undefined ? Math.max(0, Number(u.max) - Number(u.spent)) : Number(u.value ?? u.max);
              available.push({
                id,
                type: "item",
                itemRefId: it.id,
                label: it.name,
                value: curItemUses,
                max: u.max,
                rechargeFormula: formula,
                resetOn,
                isAdded
              });
            }
          }

          const syncResources = async () => {
            const slots = ["primary", "secondary", "tertiary"];
            const prevSlots = new Set(trackers.filter(t => t.type === "resource" && t.resourceSlot).map(t => t.resourceSlot));
            const nonItemTrackers = trackers.filter(t => t.type !== "item");
            const updateData = {};
            const newOccupiedSlots = new Set();

            for (let i = 0; i < slots.length; i++) {
              const slot = slots[i];
              const cand = nonItemTrackers[i];
              if (cand) {
                cand.type = "resource";
                cand.resourceSlot = slot;
                newOccupiedSlots.add(slot);
                updateData[`system.resources.${slot}.label`] = cand.label || "";
                updateData[`system.resources.${slot}.value`] = Number(cand.value) || 0;
                updateData[`system.resources.${slot}.max`] = Number(cand.max) || 1;
                updateData[`system.resources.${slot}.sr`] = (cand.resetOn || "").startsWith("sr");
                updateData[`system.resources.${slot}.lr`] = (cand.resetOn || "").startsWith("lr");
              }
            }

            for (const prevSlot of prevSlots) {
              if (!newOccupiedSlots.has(prevSlot)) {
                updateData[`system.resources.${prevSlot}.label`] = "";
                updateData[`system.resources.${prevSlot}.value`] = 0;
                updateData[`system.resources.${prevSlot}.max`] = 0;
                updateData[`system.resources.${prevSlot}.sr`] = false;
                updateData[`system.resources.${prevSlot}.lr`] = false;
              }
            }

            for (let i = slots.length; i < nonItemTrackers.length; i++) {
              nonItemTrackers[i].type = "custom";
              nonItemTrackers[i].resourceSlot = null;
            }

            if (Object.keys(updateData).length > 0) {
              await actor.update(updateData);
            }
          };

          function renderActiveTrackersList() {
            if (!trackers || trackers.length === 0) {
              return `<div style="font-size: 0.82em; color: #888; font-style: italic; padding: 8px;">No active trackers. Add one below.</div>`;
            }
            return trackers.map((t, idx) => {
              const live = getLiveTracker(t);
              const label = live.label || t.label || t.name || (t.resourceSlot ? `Resource: ${t.resourceSlot}` : "Tracker");
              let slotBadge = "";
              if (t.type === "resource" && t.resourceSlot) {
                const sName = t.resourceSlot.charAt(0).toUpperCase() + t.resourceSlot.slice(1);
                slotBadge = `<span style="font-size: 0.70em; color: #2e6b35; background: #e8f5e9; border: 1px solid #c8e6c9; border-radius: 3px; padding: 1px 5px; font-weight: 600;">Sheet: ${sName}</span>`;
              } else if (t.type === "item") {
                slotBadge = `<span style="font-size: 0.70em; color: #1e5a6a; background: #eef7fa; border: 1px solid #bce1ec; border-radius: 3px; padding: 1px 5px; font-weight: 600;">Sheet: Feature</span>`;
              } else {
                slotBadge = `<span style="font-size: 0.70em; color: #777; background: #f0f0f0; border: 1px solid #ddd; border-radius: 3px; padding: 1px 5px; font-weight: 500;">Tracker only</span>`;
              }

              return `
                <div class="manage-tracker-row" data-id="${t.id}" style="border: 1px solid #d2d7df; border-radius: 4px; padding: 6px 8px; background: #fafbfc; margin-bottom: 6px;">
                  <div style="margin-bottom: 5px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                      <label style="font-size: 0.70em; color: #666; font-weight: 600;">NAME</label>
                      ${slotBadge}
                    </div>
                    <input type="text" class="manage-input-name" data-id="${t.id}" value="${label}" style="height: 24px; font-size: 0.82em; font-weight: 600; padding: 2px 6px; border: 1px solid #ccc; border-radius: 3px; width: 100%; box-sizing: border-box; color: #2b3a4a;" />
                  </div>
                  <div style="display: grid; grid-template-columns: 75px 1fr 1fr; gap: 6px; align-items: center;">
                    <div>
                      <label style="font-size: 0.70em; color: #666; font-weight: 600; display: block; margin-bottom: 2px;">MAX</label>
                      <input type="number" class="manage-input-max" data-id="${t.id}" min="1" value="${live.max}" style="height: 24px; font-size: 0.82em; padding: 2px 5px; border: 1px solid #ccc; border-radius: 3px; width: 100%; box-sizing: border-box;" />
                    </div>
                    <div>
                      <label style="font-size: 0.70em; color: #666; font-weight: 600; display: block; margin-bottom: 2px;">FORMULA</label>
                      <input type="text" class="manage-input-recharge" data-id="${t.id}" placeholder="e.g. 1d6+1" value="${t.rechargeFormula || ''}" style="height: 24px; font-size: 0.82em; padding: 2px 5px; border: 1px solid #ccc; border-radius: 3px; width: 100%; box-sizing: border-box;" />
                    </div>
                    <div>
                      <label style="font-size: 0.70em; color: #666; font-weight: 600; display: block; margin-bottom: 2px;">RECHARGE / RESET</label>
                      <select class="manage-select-reset" data-id="${t.id}" style="height: 24px; font-size: 0.78em; border: 1px solid #ccc; border-radius: 3px; width: 100%; box-sizing: border-box;">
                        <optgroup label="Recharge (to Max)">
                          <option value="lr" ${(t.resetOn || 'lr') === 'lr' ? 'selected' : ''}>Recharge: Long Rest</option>
                          <option value="sr" ${t.resetOn === 'sr' ? 'selected' : ''}>Recharge: Short Rest</option>
                          <option value="dawn" ${t.resetOn === 'dawn' ? 'selected' : ''}>Recharge: Dawn</option>
                        </optgroup>
                        <optgroup label="Reset (Count Up)">
                          <option value="lr_reset_1" ${t.resetOn === 'lr_reset_1' ? 'selected' : ''}>Reset to 1 (Long Rest)</option>
                          <option value="lr_reset_0" ${t.resetOn === 'lr_reset_0' ? 'selected' : ''}>Reset to 0 (Long Rest)</option>
                          <option value="sr_reset_1" ${t.resetOn === 'sr_reset_1' ? 'selected' : ''}>Reset to 1 (Short Rest)</option>
                          <option value="sr_reset_0" ${t.resetOn === 'sr_reset_0' ? 'selected' : ''}>Reset to 0 (Short Rest)</option>
                          <option value="dawn_reset_1" ${t.resetOn === 'dawn_reset_1' ? 'selected' : ''}>Reset to 1 (Dawn)</option>
                          <option value="dawn_reset_0" ${t.resetOn === 'dawn_reset_0' ? 'selected' : ''}>Reset to 0 (Dawn)</option>
                        </optgroup>
                        <optgroup label="Manual">
                          <option value="none" ${t.resetOn === 'none' ? 'selected' : ''}>Manual Only</option>
                        </optgroup>
                      </select>
                    </div>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px;">
                    <div style="display: flex; gap: 4px; width: auto; flex: 0 0 auto;">
                      <button type="button" class="btn-manage-move-up" data-id="${t.id}" ${idx === 0 ? 'disabled style="opacity:0.3; cursor:default;' : 'style="cursor:pointer;'} width: 28px; min-width: 28px; max-width: 28px; height: 20px; line-height: 18px; font-size: 0.72em; font-weight: 600; padding: 0 4px; border: 1px solid #b0b8c4; background: #fff; color: #333; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; margin: 0; flex: 0 0 auto;" title="Move Up">▲</button>
                      <button type="button" class="btn-manage-move-down" data-id="${t.id}" ${idx === trackers.length - 1 ? 'disabled style="opacity:0.3; cursor:default;' : 'style="cursor:pointer;'} width: 28px; min-width: 28px; max-width: 28px; height: 20px; line-height: 18px; font-size: 0.72em; font-weight: 600; padding: 0 4px; border: 1px solid #b0b8c4; background: #fff; color: #333; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; margin: 0; flex: 0 0 auto;" title="Move Down">▼</button>
                    </div>
                    <button type="button" class="btn-manage-remove" data-id="${t.id}" title="Remove Tracker" style="width: auto; min-width: 70px; max-width: 20%; flex: 0 0 auto; margin: 0; height: 20px; line-height: 18px; font-size: 0.72em; font-weight: 600; padding: 0 8px; border: 1px solid #e07a7a; background: #fff5f5; color: #c82333; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;">
                      Remove
                    </button>
                  </div>
                </div>
              `;
            }).join('');
          }

          const availableRowsHtml = available.length === 0
            ? `<div style="font-size: 0.82em; color: #888; font-style: italic; padding: 8px;">No trackable abilities found on your character sheet.</div>`
            : available.map(a => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; border-bottom: 1px solid #f0f0f0;">
                <div style="font-size: 0.84em; color: #2b3a4a;">
                  <strong>${a.label}</strong> <small style="color: #666;">(${a.value}/${a.max}${a.rechargeFormula ? ` • 🔄 ${a.rechargeFormula}` : ''})</small>
                </div>
                <button type="button" class="btn-add-trackable-item" data-id="${a.id}" ${a.isAdded ? 'disabled style="opacity:0.5; font-size: 0.74em; font-weight: 600; height: 20px; line-height: 18px; padding: 0 8px; border-radius: 3px; border: 1px solid #ccc; background: #eee; color: #777; width: 60px; min-width: 60px; max-width: 60px; flex: 0 0 60px; margin: 0; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;"' : 'style="cursor:pointer; font-size: 0.74em; font-weight: 600; height: 20px; line-height: 18px; padding: 0 8px; border-radius: 3px; border: 1px solid #4a6fa5; background: #4a6fa5; color: #fff; width: 60px; min-width: 60px; max-width: 60px; flex: 0 0 60px; margin: 0; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;"'}>
                  ${a.isAdded ? 'Added' : 'Add'}
                </button>
              </div>
            `).join('');

          const modalContent = `
            <div style="display: flex; flex-direction: column; gap: 10px; font-family: inherit; max-height: 640px; overflow-y: auto; padding-right: 2px;">
              <div>
                <label style="font-weight: 700; font-size: 0.78em; color: #3b4d6b; display: block; margin-bottom: 4px; letter-spacing: 0.3px;">
                  FROM YOUR CHARACTER SHEET
                </label>
                <div style="max-height: 180px; overflow-y: auto; background: #fff; border: 1px solid #d2d7df; border-radius: 4px;">
                  ${availableRowsHtml}
                </div>
              </div>

              <div style="border-top: 1px solid #e0e0e0; padding-top: 8px;">
                <label style="font-weight: 700; font-size: 0.78em; color: #3b4d6b; display: block; margin-bottom: 6px; letter-spacing: 0.3px;">
                  CREATE CUSTOM COUNTER
                </label>
                <div style="border: 1px solid #d2d7df; border-radius: 4px; padding: 6px 8px; background: #fafbfc;">
                  <div style="margin-bottom: 5px;">
                    <label style="font-size: 0.70em; color: #666; font-weight: 600; display: block; margin-bottom: 2px;">NAME</label>
                    <input type="text" id="new-custom-name" placeholder="Counter Name (e.g. Grit, Torches)" style="height: 24px; font-size: 0.82em; font-weight: 600; padding: 2px 6px; border: 1px solid #ccc; border-radius: 3px; width: 100%; box-sizing: border-box; color: #2b3a4a;" />
                  </div>
                  <div style="display: grid; grid-template-columns: 75px 1fr 1fr; gap: 6px; align-items: center;">
                    <div>
                      <label style="font-size: 0.70em; color: #666; font-weight: 600; display: block; margin-bottom: 2px;">MAX</label>
                      <input type="number" id="new-custom-max" placeholder="Max" value="3" min="1" style="height: 24px; font-size: 0.82em; padding: 2px 5px; border: 1px solid #ccc; border-radius: 3px; width: 100%; box-sizing: border-box;" />
                    </div>
                    <div>
                      <label style="font-size: 0.70em; color: #666; font-weight: 600; display: block; margin-bottom: 2px;">FORMULA</label>
                      <input type="text" id="new-custom-formula" placeholder="e.g. 1d6+1" style="height: 24px; font-size: 0.82em; padding: 2px 5px; border: 1px solid #ccc; border-radius: 3px; width: 100%; box-sizing: border-box;" />
                    </div>
                    <div>
                      <label style="font-size: 0.70em; color: #666; font-weight: 600; display: block; margin-bottom: 2px;">RECHARGE / RESET</label>
                      <select id="new-custom-reset" style="height: 24px; font-size: 0.78em; border: 1px solid #ccc; border-radius: 3px; width: 100%; box-sizing: border-box;">
                        <optgroup label="Recharge (to Max)">
                          <option value="lr">Recharge: Long Rest</option>
                          <option value="sr">Recharge: Short Rest</option>
                          <option value="dawn">Recharge: Dawn</option>
                        </optgroup>
                        <optgroup label="Reset (Count Up)">
                          <option value="lr_reset_1">Reset to 1 (Long Rest)</option>
                          <option value="lr_reset_0">Reset to 0 (Long Rest)</option>
                          <option value="sr_reset_1">Reset to 1 (Short Rest)</option>
                          <option value="sr_reset_0">Reset to 0 (Short Rest)</option>
                          <option value="dawn_reset_1">Reset to 1 (Dawn)</option>
                          <option value="dawn_reset_0">Reset to 0 (Dawn)</option>
                        </optgroup>
                        <optgroup label="Manual">
                          <option value="none">Manual Only</option>
                        </optgroup>
                      </select>
                    </div>
                  </div>
                  <div style="display: flex; justify-content: flex-end; align-items: center; margin-top: 5px;">
                    <button type="button" id="btn-submit-new-custom" style="width: auto; min-width: 100px; max-width: 25%; flex: 0 0 auto; margin: 0; height: 22px; line-height: 20px; font-weight: 600; font-size: 0.76em; padding: 0 10px; background: #28a745; color: #fff; border: 1px solid #218838; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;">
                      Create Tracker
                    </button>
                  </div>
                </div>
              </div>

              <div style="border-top: 1px solid #e0e0e0; padding-top: 8px;">
                <label style="font-weight: 700; font-size: 0.78em; color: #3b4d6b; display: block; margin-bottom: 4px; letter-spacing: 0.3px;">
                  ACTIVE TRACKERS (EDIT & REMOVE)
                </label>
                <div id="manage-active-trackers-container" style="max-height: 250px; overflow-y: auto; background: #fff; border: 1px solid #d2d7df; border-radius: 4px; padding: 6px;">
                  ${renderActiveTrackersList()}
                </div>
              </div>
            </div>
          `;

          const addDialog = new Dialog({
            title: `${actor.name}: Manage Tracking Stuff`,
            content: modalContent,
            buttons: {
              close: { label: "Done" }
            },
            default: "close",
            render: (modalHtml) => {
              const bindActiveTrackerEvents = () => {
                modalHtml.find('.manage-input-name').off('change').on('change', async function () {
                  const id = $(this).data('id');
                  const t = trackers.find(x => x.id === id);
                  if (!t) return;
                  const newName = $(this).val()?.trim() || "Tracker";
                  t.label = newName;
                  if (t.type === "item" && t.itemRefId) {
                    const it = actor.items.get(t.itemRefId);
                    if (it) await it.update({ name: newName });
                  } else if (t.type === "resource" && t.resourceSlot) {
                    await actor.update({ [`system.resources.${t.resourceSlot}.label`]: newName });
                  }
                  await actor.setFlag("world", "trackingStuff", trackers);
                  refreshChips();
                });

                modalHtml.find('.manage-input-max').off('change').on('change', async function () {
                  const id = $(this).data('id');
                  const t = trackers.find(x => x.id === id);
                  if (!t) return;
                  const newMax = Math.max(1, Number($(this).val()) || 1);
                  t.max = newMax;
                  if (t.type === "item" && t.itemRefId) {
                    const it = actor.items.get(t.itemRefId);
                    if (it) await it.update({ "system.uses.max": newMax });
                  } else if (t.type === "resource" && t.resourceSlot) {
                    await actor.update({ [`system.resources.${t.resourceSlot}.max`]: newMax });
                  }
                  await actor.setFlag("world", "trackingStuff", trackers);
                  refreshChips();
                });

                modalHtml.find('.manage-input-recharge').off('change').on('change', async function () {
                  const id = $(this).data('id');
                  const t = trackers.find(x => x.id === id);
                  if (!t) return;
                  t.rechargeFormula = $(this).val()?.trim() || "";
                  await actor.setFlag("world", "trackingStuff", trackers);
                  refreshChips();
                });

                modalHtml.find('.manage-select-reset').off('change').on('change', async function () {
                  const id = $(this).data('id');
                  const t = trackers.find(x => x.id === id);
                  if (!t) return;
                  t.resetOn = $(this).val();
                  if (t.type === "resource" && t.resourceSlot) {
                    await actor.update({
                      [`system.resources.${t.resourceSlot}.sr`]: t.resetOn.startsWith("sr"),
                      [`system.resources.${t.resourceSlot}.lr`]: t.resetOn.startsWith("lr")
                    });
                  }
                  await actor.setFlag("world", "trackingStuff", trackers);
                  refreshChips();
                });

                modalHtml.find('.btn-manage-move-up').off('click').on('click', async function () {
                  const id = $(this).data('id');
                  const idx = trackers.findIndex(x => x.id === id);
                  if (idx > 0) {
                    const temp = trackers[idx];
                    trackers[idx] = trackers[idx - 1];
                    trackers[idx - 1] = temp;
                    await syncResources();
                    await actor.setFlag("world", "trackingStuff", trackers);
                    refreshChips();
                    modalHtml.find('#manage-active-trackers-container').html(renderActiveTrackersList());
                    bindActiveTrackerEvents();
                  }
                });

                modalHtml.find('.btn-manage-move-down').off('click').on('click', async function () {
                  const id = $(this).data('id');
                  const idx = trackers.findIndex(x => x.id === id);
                  if (idx !== -1 && idx < trackers.length - 1) {
                    const temp = trackers[idx];
                    trackers[idx] = trackers[idx + 1];
                    trackers[idx + 1] = temp;
                    await syncResources();
                    await actor.setFlag("world", "trackingStuff", trackers);
                    refreshChips();
                    modalHtml.find('#manage-active-trackers-container').html(renderActiveTrackersList());
                    bindActiveTrackerEvents();
                  }
                });

                modalHtml.find('.btn-manage-remove').off('click').on('click', async function () {
                  const id = $(this).data('id');
                  const t = trackers.find(x => x.id === id);
                  if (!t) return;

                  trackers = trackers.filter(x => x.id !== id);
                  await syncResources();
                  await actor.setFlag("world", "trackingStuff", trackers);
                  refreshChips();

                  modalHtml.find('#manage-active-trackers-container').html(renderActiveTrackersList());
                  bindActiveTrackerEvents();

                  const addBtn = modalHtml.find(`.btn-add-trackable-item[data-id="${id}"], .btn-add-trackable-item[data-id="resource_${t.resourceSlot}"]`);
                  if (addBtn.length) {
                    addBtn.prop('disabled', false).attr('style', 'cursor:pointer; font-size: 0.74em; font-weight: 600; height: 20px; line-height: 18px; padding: 0 8px; border-radius: 3px; border: 1px solid #4a6fa5; background: #4a6fa5; color: #fff; width: 60px; min-width: 60px; max-width: 60px; flex: 0 0 60px; margin: 0; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;').text('Add');
                  }
                });
              };

              bindActiveTrackerEvents();

              modalHtml.find('.btn-add-trackable-item').on('click', async function () {
                const id = $(this).data('id');
                const itemData = available.find(x => x.id === id);
                if (!itemData || trackers.some(x => x.id === id || (itemData.resourceSlot && x.resourceSlot === itemData.resourceSlot) || (itemData.itemRefId && x.itemRefId === itemData.itemRefId))) return;

                trackers.push({
                  id: itemData.id,
                  type: itemData.type,
                  itemRefId: itemData.itemRefId,
                  resourceSlot: itemData.resourceSlot,
                  label: itemData.label,
                  value: itemData.value,
                  max: itemData.max,
                  rechargeFormula: itemData.rechargeFormula || "",
                  resetOn: itemData.resetOn || "lr"
                });

                await syncResources();
                await actor.setFlag("world", "trackingStuff", trackers);
                $(this).prop('disabled', true).attr('style', 'opacity:0.5; font-size: 0.74em; font-weight: 600; height: 20px; line-height: 18px; padding: 0 8px; border-radius: 3px; border: 1px solid #ccc; background: #eee; color: #777; width: 60px; min-width: 60px; max-width: 60px; flex: 0 0 60px; margin: 0; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;').text('Added');
                refreshChips();
                modalHtml.find('#manage-active-trackers-container').html(renderActiveTrackersList());
                bindActiveTrackerEvents();
              });

              modalHtml.find('#btn-submit-new-custom').on('click', async function () {
                const name = modalHtml.find('#new-custom-name').val()?.trim();
                const max = Number(modalHtml.find('#new-custom-max').val()) || 1;
                const resetOn = modalHtml.find('#new-custom-reset').val() || "lr";
                const formula = modalHtml.find('#new-custom-formula').val()?.trim() || "";

                if (!name) return ui.notifications.warn("Please enter a counter name.");

                const isReset1 = resetOn.endsWith("_reset_1");
                const isReset0 = resetOn.endsWith("_reset_0");
                const startVal = isReset1 ? 1 : (isReset0 ? 0 : max);

                const newId = `custom_${Date.now()}`;
                trackers.push({
                  id: newId,
                  type: "custom",
                  isCustom: true,
                  label: name,
                  value: startVal,
                  max: max,
                  rechargeFormula: formula,
                  resetOn
                });

                await syncResources();
                await actor.setFlag("world", "trackingStuff", trackers);
                refreshChips();
                modalHtml.find('#new-custom-name').val('');
                modalHtml.find('#new-custom-formula').val('');
                modalHtml.find('#manage-active-trackers-container').html(renderActiveTrackersList());
                bindActiveTrackerEvents();
                ui.notifications.info(`Added "${name}" to Tracking Stuff!`);
              });
            }
          }, { width: 540 }).render(true);
        });
      }
    };
  }

  // --- 3.4 Unified Action Client-Side Dialog Launcher (Card/List View) ---
  window.CustomRolls.openActionDialog = async function (initialMode = "d20", explicitActor = null) {
    if (!getSetting("featureCustomRolls")) return;

    let token = null;
    let actor = explicitActor;
    if (!actor) {
      token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;
      if (!token) {
        return ui.notifications.warn("Please select your token first.");
      }
      actor = token.actor;
    } else {
      token = actor.token?.object || canvas.tokens?.placeables?.find(t => t.actor?.id === actor.id) || null;
    }

    if (!actor || !actor.isOwner) {
      return ui.notifications.warn("You don't have permissions to use this token.");
    }

    let attacks = window.CustomRolls.getProfileData(actor, "attackConfigs") || actor.getFlag("world", "attackConfigs") || {};
    attacks = await ensureStandardAttacks(actor, attacks);
    let spellConfigs = window.CustomRolls.getProfileData(actor, "spellConfigs") || actor.getFlag("world", "spellConfigs") || {};

    let attackNames = Object.keys(attacks);
    let spellKeys = Object.keys(spellConfigs);

    let currentMode = initialMode;
    if (currentMode === "weapon" && attackNames.length === 0) {
      currentMode = spellKeys.length > 0 ? "spell" : "d20";
    }
    if (currentMode === "spell" && spellKeys.length === 0) {
      currentMode = attackNames.length > 0 ? "weapon" : "d20";
    }

    const STANDARD_KEYS = ["Unarmed Strike", "Improvised Weapon", "Off-Hand Attack"];
    const customAttackNames = attackNames.filter(k => !STANDARD_KEYS.includes(k));
    let selectedWeaponKey = customAttackNames[0] || attackNames[0] || null;
    let selectedSpellKey = spellKeys[0] || null;

    const d20Data = getD20V2Data(actor);
    const trackingHelper = getTrackingStuffHelper(actor);

    // Portrait for Persistent Sidebar
    const portraitSrc = token?.document?.texture?.src || actor.img || "icons/svg/mystery-man.svg";

    // --- Helper Calculations ---
    function getWeaponDetails(config) {
      if (!config) return { atkSign: "+0", dmgFormula: "1d6", dmgType: "SLASHING", tags: [], totalAtk: 0, dmgMod: 0, diceCount: 1, dieSize: "6" };
      const abilityMod = actor.system.abilities[config.abilityScore]?.mod || 0;
      const prof = actor.system.attributes.prof || 0;
      const wepMod = Number(config.weaponModifier) || 0;
      const circMod = Number(config.attackCircumstanceModifier) || 0;
      const totalAtk = abilityMod + prof + wepMod + circMod;
      const atkSign = totalAtk >= 0 ? `+${totalAtk}` : `${totalAtk}`;

      const diceCount = Math.max(0, Number(config.damageDiceCount) || 0);
      const isNoneDie = String(config.damageDieSize || "").toLowerCase() === "none";
      const dieSize = isNoneDie ? "" : String(config.damageDieSize || "6").replace(/^d/i, "");
      const dmgMod = abilityMod + wepMod + (Number(config.damageModifier) || 0);
      const dmgModSign = dmgMod >= 0 ? `+${dmgMod}` : `${dmgMod}`;
      const dmgFormula = diceCount > 0 && dieSize
        ? `${diceCount}d${dieSize} ${dmgMod !== 0 ? dmgModSign : ""}`.trim()
        : `${dmgMod}`;
      const dmgType = (config.damageType || "slashing").toUpperCase();

      const tags = [];
      if (config.CRIT_THRESHOLD && config.CRIT_THRESHOLD < 20) tags.push(`Crit ${config.CRIT_THRESHOLD}+`);
      if (config.superAdv) tags.push("Super Adv");
      if (config.HAS_HALFLING_LUCKY) tags.push("Lucky");
      if (Number(config.GWF_REROLL_THRESHOLD) > 0) tags.push(`GWF ≤${config.GWF_REROLL_THRESHOLD}`);
      if (config.extraCriticalBonus && String(config.extraCriticalBonus).trim() !== "") tags.push("Crit Bonus Dmg");

      return { atkSign, dmgFormula, dmgType, tags, totalAtk, dmgMod, diceCount, dieSize };
    }

    function getSlotInfo(lvl) {
      if (lvl === 0) return { current: Infinity, max: Infinity, label: "Cantrip" };
      const sp = actor.system.spells || {};
      const key = `spell${lvl}`;
      const slot = sp[key];
      if (!slot) return { current: 0, max: 0, label: "0/0" };
      return {
        current: Number(slot.value) || 0,
        max: Number(slot.max) || 0,
        label: `${slot.value ?? 0}/${slot.max ?? 0}`
      };
    }

    function scaleDiceFormula(formula, factor) {
      if (!formula) return "";
      const cleaned = String(formula).replace(/[()]/g, "").trim();
      if (!isNaN(Number(cleaned))) return String(Number(cleaned) * factor);
      return cleaned.replace(/(\d*)([dD]\d+)/g, (match, count, die) => {
        const c = parseInt(count) || 1;
        return `${c * factor}${die}`;
      });
    }

    function getEffectiveSpellConfig(baseConfig, castLevel) {
      const cfg = foundry.utils.duplicate(baseConfig);
      const baseLvl = Number(cfg.baseLevel) || 0;
      const currentCastLvl = castLevel !== undefined ? Number(castLevel) : baseLvl;
      const extraLevels = (baseLvl > 0 && currentCastLvl > baseLvl) ? (currentCastLvl - baseLvl) : 0;
      cfg.castLevel = currentCastLvl;

      if (cfg.resolutionMethod === "auto") {
        const baseProjectiles = Number(cfg.projectileCount) || 3;
        const upcastStep = Number(cfg.upcastProjectiles) || 1;
        cfg.effectiveProjectiles = baseProjectiles + (extraLevels * upcastStep);
      } else if (cfg.resolutionMethod === "attack" && cfg.isMultiAttack) {
        let baseCount = Number(cfg.attackCount) || 1;
        if (cfg.cantripAttackScaling && baseLvl === 0) {
          const charLvl = actor.system.details?.level ?? 1;
          if (charLvl >= 17) baseCount = 4;
          else if (charLvl >= 11) baseCount = 3;
          else if (charLvl >= 5) baseCount = 2;
          else baseCount = 1;
        }
        const upcastAtkStep = Number(cfg.upcastAttacks) || 0;
        cfg.effectiveAttacks = baseCount + (extraLevels * upcastAtkStep);
      } else if (extraLevels > 0) {
        if (cfg.upcastDiceFormula) {
          const scaledUpcast = scaleDiceFormula(cfg.upcastDiceFormula, extraLevels);
          if (!isNaN(Number(scaledUpcast))) {
            cfg.flatDamageBonus = (Number(cfg.flatDamageBonus) || 0) + Number(scaledUpcast);
          } else if (cfg.extraDiceFormula) {
            cfg.extraDiceFormula = `${cfg.extraDiceFormula} + ${scaledUpcast}`;
          } else {
            cfg.extraDiceFormula = scaledUpcast;
          }
        } else if (Number(cfg.damageDiceCount) > 0) {
          cfg.damageDiceCount = Number(cfg.damageDiceCount) + extraLevels;
        }
      }
      return { cfg, extraLevels };
    }

    function getSpellDetails(spell, castLevel) {
      if (!spell) return { actionVal: "+0", valFormula: "0", typeLabel: "FIRE", tags: [] };
      const { cfg } = getEffectiveSpellConfig(spell, castLevel);
      const abilityMod = actor.system.abilities[cfg.spellAbility]?.mod || 0;
      const prof = actor.system.attributes.prof || 0;
      const atkMod = Number(cfg.attackModifier) || 0;
      const totalAtk = abilityMod + prof + atkMod;
      const atkSign = totalAtk >= 0 ? `+${totalAtk}` : `${totalAtk}`;
      const spellDC = 8 + prof + abilityMod;

      const isHealing = ["heal", "temp_hp", "max_hp"].includes(cfg.resolutionMethod);
      let effectiveFlat = Number(cfg.flatDamageBonus) || 0;
      if (isHealing && cfg.addAbilityModToValue) effectiveFlat += abilityMod;

      const diceCount = Number(cfg.damageDiceCount) || 0;
      let valFormula = "";
      if (diceCount > 0) {
        valFormula = `${diceCount}${cfg.damageDieSize}`;
        if (cfg.extraDiceFormula) valFormula += `+${cfg.extraDiceFormula}`;
        if (effectiveFlat !== 0) valFormula += `${effectiveFlat >= 0 ? '+' : ''}${effectiveFlat}`;
      } else {
        valFormula = effectiveFlat !== 0 ? `${effectiveFlat}` : "-";
      }

      let actionVal = atkSign;
      let typeLabel = (cfg.damageType || "fire").toUpperCase();

      if (cfg.resolutionMethod === "attack" && cfg.isMultiAttack) {
        actionVal = `${cfg.effectiveAttacks || cfg.attackCount || 1}x (${atkSign})`;
      } else if (cfg.resolutionMethod === "save") {
        let saveAbilStr = cfg.saveAbility;
        if (saveAbilStr instanceof Set) saveAbilStr = Array.from(saveAbilStr)[0];
        else if (Array.isArray(saveAbilStr)) saveAbilStr = saveAbilStr[0];
        else if (typeof saveAbilStr !== "string") saveAbilStr = "dex";
        actionVal = `DC ${spellDC} ${(saveAbilStr || 'dex').toUpperCase()}`;
      } else if (cfg.resolutionMethod === "auto") {
        actionVal = `${cfg.effectiveProjectiles || cfg.projectileCount || 3} Darts`;
      } else if (isHealing) {
        actionVal = "HEAL";
        typeLabel = "RECOVERY";
      } else if (cfg.resolutionMethod === "other") {
        actionVal = "Cast";
        typeLabel = "UTILITY";
      }

      const tags = [];
      if (cfg.castingTime) tags.push(cfg.castingTime);
      if (cfg.range) tags.push(cfg.range);
      if (cfg.concentration) tags.push("Conc.");

      return { actionVal, valFormula, typeLabel, tags };
    }

    function getSpellItemSourceInfo(spell) {
      if (!spell || !actor) return null;
      let it = (spell.itemId ? actor.items?.get(spell.itemId) : null)
        || actor.items?.getName(spell.spellName);
      if (!it) return null;

      // Check if this spell originates from a parent item (e.g. Staff of the Magi, Wand)
      let sourceItem = null;
      const flags = it.flags || {};
      const dndFlags = flags.dnd5e || {};
      const parentId = dndFlags.sourceItem || dndFlags.cachedFor || flags.magicitems?.sourceItem || it.system?.sourceItem;
      if (parentId && actor.items?.get(parentId)) {
        sourceItem = actor.items.get(parentId);
      } else if (it.system?.activities) {
        // Modern dnd5e activities checking consumption targets pointing to an item
        const acts = it.system.activities instanceof Map ? Array.from(it.system.activities.values()) : Object.values(it.system.activities || {});
        for (const act of acts) {
          const targets = act.consumption?.targets || [];
          for (const target of targets) {
            if (target.type === "itemUses" && target.target && actor.items?.get(target.target)) {
              sourceItem = actor.items.get(target.target);
              break;
            }
          }
          if (sourceItem) break;
        }
      }

      // If no explicit parent ID, check if an equipment/weapon/feat with the same or related name exists with charges
      if (!sourceItem && it.type === "spell") {
        const customSrc = it.system?.source?.custom || it.system?.source?.rules || "";
        if (customSrc) {
          const match = actor.items?.find(i => i.type !== "spell" && (i.name.toLowerCase() === customSrc.toLowerCase() || customSrc.toLowerCase().includes(i.name.toLowerCase())));
          if (match && Number(match.system?.uses?.max) > 0) {
            sourceItem = match;
          }
        }
      }

      // Target item holding the uses (either the parent staff/wand or the spell/feat itself)
      const targetItem = sourceItem || it;
      const isNonSpellType = targetItem.type !== "spell";
      // Modern dnd5e 5.1+ uses sys.method, older uses sys.preparation.mode
      const prepMode = it.system?.method || it.system?.preparation?.mode;
      const hasItemUses = Boolean(targetItem.system?.uses && Number(targetItem.system.uses.max) > 0);
      const isInnateOrAtWill = ["innate", "atwill"].includes(prepMode);

      if (!isNonSpellType && !hasItemUses && !isInnateOrAtWill && !sourceItem) {
        return null;
      }

      // Detect explicit charge cost from dnd5e activities if present
      let detectedCost = null;
      if (it.system?.activities) {
        const acts = it.system.activities instanceof Map ? Array.from(it.system.activities.values()) : Object.values(it.system.activities || {});
        for (const act of acts) {
          const targets = act.consumption?.targets || [];
          for (const target of targets) {
            if (target.type === "itemUses" && typeof target.value !== "undefined") {
              detectedCost = Number(target.value);
              break;
            }
          }
          if (detectedCost !== null) break;
        }
      }

      // If atwill or innate with 0 consumption, chargeCost is 0
      let chargeCost = detectedCost !== null ? detectedCost : (prepMode === "atwill" ? 0 : 1);

      const maxUses = Number(targetItem.system?.uses?.max ?? 0);
      const curUses = targetItem.system?.uses?.spent !== undefined
        ? Math.max(0, maxUses - Number(targetItem.system.uses.spent))
        : Number(targetItem.system?.uses?.value ?? 0);
      const actorHasSpellSlots = Object.values(actor.system?.spells || {}).some(s => Number(s?.max) > 0);
      const isEquipmentItem = ["equipment", "weapon", "consumable", "loot", "container", "tool"].includes(targetItem.type);
      const isPureItem = (Boolean(sourceItem) && isEquipmentItem) || (!actorHasSpellSlots && isNonSpellType);

      return {
        item: targetItem,
        itemId: targetItem.id,
        name: targetItem.name,
        type: targetItem.type,
        prepMode,
        hasItemUses,
        curUses,
        maxUses,
        isPureItem,
        chargeCost,
        label: hasItemUses ? `${curUses}/${maxUses} charges` : (isInnateOrAtWill ? (prepMode === "atwill" ? "At-Will" : "Innate") : targetItem.name)
      };
    }

    function getUpcastOptionsHtml(spell) {
      const baseLevel = Number(spell?.baseLevel) || 0;
      const srcInfo = getSpellItemSourceInfo(spell);

      if (baseLevel === 0) {
        return `
        <div style="font-size: 0.82em; color: #555; padding: 4px 6px; background: rgba(0,0,0,0.02); border-radius: 4px; border: 1px solid #e0e0e0;">
          <strong>Slot:</strong> Cantrip (No slot cost)
          <input type="hidden" id="castLevelSelect" value="0" />
        </div>
      `;
      }

      let resourceSelectorHtml = "";
      let slotDeductDisabled = false;
      let slotDeductChecked = true;
      let chargeDeductChecked = false;
      let chargeDeductDisabled = false;

      if (srcInfo) {
        const hasEnoughCharges = srcInfo.hasItemUses ? (srcInfo.curUses >= (srcInfo.chargeCost || 1)) : true;
        if (!hasEnoughCharges && srcInfo.hasItemUses) {
          chargeDeductDisabled = true;
        }

        if (srcInfo.isPureItem) {
          // Pure item/feat without normal slot casting (e.g. Wand, Staff)
          slotDeductDisabled = true;
          slotDeductChecked = false;
          chargeDeductChecked = srcInfo.hasItemUses && hasEnoughCharges;
          resourceSelectorHtml = `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 3px 6px; background: #eef4ff; border-radius: 3px; border: 1px solid #c8d8f4; margin-bottom: 5px; font-size: 0.8em;">
              <span style="font-weight: 700; color: #3b5998;"><i class="fas fa-wand-magic-sparkles" style="margin-right: 4px;"></i> Source: ${srcInfo.name}</span>
              <span style="font-weight: 700; color: ${hasEnoughCharges ? '#4b5d88' : '#c62828'}; font-family: monospace;">${srcInfo.label}</span>
            </div>
          `;
        } else if (srcInfo.hasItemUses && srcInfo.maxUses > 0) {
          // Dual-cast spell (e.g. Magic Initiate, Fey Touched: 1 free feat use OR standard spell slots)
          const featHasCharges = srcInfo.curUses >= (srcInfo.chargeCost || 1);
          chargeDeductChecked = featHasCharges;
          slotDeductChecked = !featHasCharges;

          resourceSelectorHtml = `
            <div style="display: flex; gap: 4px; margin-bottom: 5px; border-bottom: 1px dashed #d2d7df; padding-bottom: 5px;">
              <label style="flex: 1; display: flex; align-items: center; gap: 4px; font-size: 0.78em; font-weight: 700; color: ${featHasCharges ? '#3b5998' : '#888'}; cursor: ${featHasCharges ? 'pointer' : 'not-allowed'}; opacity: ${featHasCharges ? '1' : '0.5'}; background: #fff; padding: 2px 4px; border-radius: 3px; border: 1px solid #c8d8f4;">
                <input type="radio" name="spellCastResourceMode" value="charge" ${featHasCharges ? 'checked' : ''} ${!featHasCharges ? 'disabled' : ''} style="margin: 0;" />
                Free/Feat (${srcInfo.curUses}/${srcInfo.maxUses})
              </label>
              <label style="flex: 1; display: flex; align-items: center; gap: 4px; font-size: 0.78em; font-weight: 700; color: #4b5d88; cursor: pointer; background: #fff; padding: 2px 4px; border-radius: 3px; border: 1px solid #d2d7df;">
                <input type="radio" name="spellCastResourceMode" value="slot" ${!featHasCharges ? 'checked' : ''} style="margin: 0;" />
                Spell Slot
              </label>
            </div>
          `;
        }
      }

      let html = `
      <div style="background: rgba(0,0,0,0.02); border: 1px solid #d2d7df; border-radius: 4px; padding: 6px;">
        ${resourceSelectorHtml}
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 0.8em; font-weight: bold; color: #4b5d88;">CAST AT LEVEL:</span>
          <select id="castLevelSelect" style="height: 26px; font-size: 0.85em; border-radius: 4px; border: 1px solid #7289da; padding: 0 4px;">
    `;
      for (let lvl = baseLevel; lvl <= 9; lvl++) {
        const slotInfo = getSlotInfo(lvl);
        html += `<option value="${lvl}" ${lvl === baseLevel ? 'selected' : ''}>Level ${lvl} (${slotInfo.label} slots)</option>`;
      }
      html += `
          </select>
        </div>
        <div style="display: flex; flex-direction: column; gap: 3px; margin-top: 4px;">
          <div id="slot-deduct-row" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 4px; background: #fff; border-radius: 3px; border: 1px solid #e0e6ed; font-size: 0.8em; opacity: ${slotDeductDisabled ? '0.6' : '1'};">
            <label style="display: flex; align-items: center; gap: 4px; cursor: ${slotDeductDisabled ? 'not-allowed' : 'pointer'}; flex: 1; min-width: 0;" title="${slotDeductDisabled ? 'Spell is cast using item charges or feat uses rather than spell slots' : 'Deduct spell slot from sheet'}">
              <input type="checkbox" id="deductSlotToggle" ${slotDeductChecked ? 'checked' : ''} ${slotDeductDisabled ? 'disabled' : ''} style="margin: 0;" />
              <span style="font-weight: 600; color: #4b5d88; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Deduct slot from sheet</span>
            </label>
            <div style="display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0;" title="Spell slot cost">
              <input type="number" min="1" max="1" value="1" disabled style="width: 32px; height: 18px; line-height: 16px; text-align: center; font-size: 0.82em; font-weight: 700; border: 1px solid #ccc; border-radius: 2px; padding: 0; background: #fafbfc; color: #1e293b; margin: 0; opacity: 0.85;" />
              <span style="font-size: 0.72em; color: #666; font-weight: 600;">slot</span>
            </div>
          </div>
          ${srcInfo && srcInfo.hasItemUses ? (
            srcInfo.chargeCost > 0 ? `
              <div id="charge-deduct-row" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 4px; background: #fff; border-radius: 3px; border: 1px solid #e0e6ed; font-size: 0.8em; opacity: ${chargeDeductDisabled ? '0.5' : '1'};">
                <label style="display: flex; align-items: center; gap: 4px; cursor: ${chargeDeductDisabled ? 'not-allowed' : 'pointer'}; flex: 1; min-width: 0;" title="${chargeDeductDisabled ? 'No charges remaining on item' : 'Deduct charge/use from item on character sheet'}">
                  <input type="checkbox" id="deductChargeToggle" data-item-id="${srcInfo.itemId}" ${chargeDeductChecked ? 'checked' : ''} ${chargeDeductDisabled ? 'disabled' : ''} style="margin: 0;" />
                  <span style="font-weight: 600; color: ${chargeDeductDisabled ? '#888' : '#3b5998'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Deduct charge from ${srcInfo.name}${chargeDeductDisabled ? ' (0 charges left)' : ''}</span>
                </label>
                <div style="display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0;" title="Number of charges to expend for this cast">
                  <input type="number" id="deductChargeCostInput" min="1" max="${srcInfo.maxUses}" value="${srcInfo.chargeCost}" ${chargeDeductDisabled ? 'disabled' : ''} style="width: 32px; height: 18px; line-height: 16px; text-align: center; font-size: 0.82em; font-weight: 700; border: 1px solid #ccc; border-radius: 2px; padding: 0; background: #fafbfc; color: #1e293b; margin: 0;" />
                  <span style="font-size: 0.72em; color: #666; font-weight: 600;">charges</span>
                </div>
              </div>
            ` : `
              <div style="font-size: 0.75em; color: #2e6b35; background: #e8f5e9; border: 1px solid #c8e6c9; border-radius: 3px; padding: 2px 6px; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                <i class="fas fa-check-circle"></i> Cast at will via ${srcInfo.name} (0 charge cost)
              </div>
            `
          ) : ''}
        </div>
      </div>
    `;
      return html;
    }

    function renderCustomWeaponCards() {
      const STANDARD_KEYS = ["Unarmed Strike", "Improvised Weapon", "Off-Hand Attack"];
      const customNames = attackNames.filter(k => !STANDARD_KEYS.includes(k));
      const assignedSlots = window.CustomRolls?.getProfileData?.(actor, "hudAssignedSlots")
        || actor.getFlag("world", "hudAssignedSlots")
        || {};

      if (customNames.length === 0) {
        return `
          <div style="color: #888; font-size: 0.8em; font-style: italic; text-align: center; padding: 16px 8px;">
            No custom weapons configured.<br><small style="color: #aaa;">Click GM Tools &gt; Generate Actions to generate from inventory.</small>
          </div>
        `;
      }

      return customNames.map(name => {
        const conf = attacks[name];
        const isSel = name === selectedWeaponKey;
        const d = getWeaponDetails(conf);
        const tagsHtml = d.tags.map(t => `<span style="background: rgba(114, 137, 218, 0.15); border: 1px solid rgba(114, 137, 218, 0.3); border-radius: 2px; padding: 1px 4px; font-size: 0.7em; color: #4b5d88;">${t}</span>`).join(" ");

        const assignedSlot = Object.entries(assignedSlots).find(([sNum, data]) => data?.category === "weapons" && data?.name === name)?.[0];
        const hudBadge = assignedSlot
          ? `<span style="font-size: 0.70em; font-weight: 700; color: #1e5a6a; background: #eef7fa; border: 1px solid #bce1ec; border-radius: 3px; padding: 1px 4px; display: inline-flex; align-items: center; gap: 3px;" title="Assigned to HUD Button ${assignedSlot}">HUD <i class="fas fa-square-${assignedSlot}"></i></span>`
          : "";

        return `
        <div class="action-card weapon-card custom-weapon-card" data-key="${name}" draggable="true" style="border: 2px solid ${isSel ? '#7289da' : '#e0e0e0'}; background: ${isSel ? '#f0f4ff' : '#fff'}; border-radius: 5px; padding: 6px 8px; cursor: grab; transition: border-color 0.15s, background-color 0.15s; margin-bottom: 5px; user-select: none;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
            <div style="display: flex; align-items: center; gap: 5px; overflow: hidden; min-width: 0;">
              <i class="fas fa-grip-vertical" style="color: #aaa; font-size: 0.75em; cursor: grab;"></i>
              <span style="font-weight: bold; font-size: 0.9em; color: #2b3a4a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
              ${hudBadge}
              <span style="font-size: 0.75em; font-weight: bold; color: #555;">${d.dmgType}</span>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82em; color: #333;">
            <span class="weapon-card-atk-line" style="display: inline-flex; align-items: center; gap: 4px;">
              Atk: 
              <button type="button" class="quick-roll-weapon-btn" data-key="${name}" title="Click to Quick Roll Attack" style="cursor: pointer; font-size: 0.9em; font-weight: 800; color: #235d6e; background: #eef7fa; border: 1px solid #bce1ec; border-radius: 3px; padding: 1px 6px; line-height: 1.2;">
                ${d.atkSign}
              </button>
            </span>
            <span class="weapon-card-dmg-line">Dmg: <strong class="weapon-card-dmg-val" style="color: #2b3a4a;">${d.dmgFormula}</strong></span>
          </div>
          ${d.tags.length > 0 ? `<div style="display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px;">${tagsHtml}</div>` : ""}
        </div>
      `;
      }).join("");
    }

    function renderWeaponCards() {
      const STANDARD_KEYS = ["Unarmed Strike", "Improvised Weapon", "Off-Hand Attack"];
      const standardNames = STANDARD_KEYS.filter(k => attacks[k]);

      let standardRowHtml = "";
      if (standardNames.length > 0) {
        const miniCards = standardNames.map(name => {
          const conf = attacks[name];
          const isSel = name === selectedWeaponKey;
          const d = getWeaponDetails(conf);
          let shortTitle = name;
          if (name === "Unarmed Strike") {
            shortTitle = "Unarmed";
          } else if (name === "Improvised Weapon") {
            shortTitle = "Improvised";
          } else if (name === "Off-Hand Attack") {
            shortTitle = "Light/TWF";
          }

          return `
            <div class="action-card weapon-card standard-weapon-card" data-key="${name}" style="flex: 1; min-width: 0; border: 2px solid ${isSel ? '#7289da' : '#bcc5d3'}; background: ${isSel ? '#f0f4ff' : '#f8fafc'}; border-radius: 5px; padding: 4px 3px; cursor: pointer; transition: border-color 0.15s, background-color 0.15s; display: flex; flex-direction: column; justify-content: space-between; align-items: center; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
              <div style="display: flex; align-items: center; justify-content: center; max-width: 100%;">
                <span style="font-weight: 700; font-size: 0.78em; color: #2b3a4a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${name}">${shortTitle}</span>
              </div>
              <button type="button" class="quick-roll-weapon-btn weapon-card-atk-val" data-key="${name}" title="Click to Quick Roll Attack" style="cursor: pointer; font-size: 0.82em; font-weight: 800; color: #235d6e; background: #eef7fa; border: 1px solid #bce1ec; border-radius: 3px; padding: 0 4px; margin: 1px 0; line-height: 1.2;">
                ${d.atkSign}
              </button>
              <div class="weapon-card-dmg-val" style="font-size: 0.72em; color: #555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; font-family: monospace;" title="${d.dmgFormula} (${d.dmgType})">
                ${d.dmgFormula}
              </div>
            </div>
          `;
        }).join("");

        standardRowHtml = `
          <div style="display: flex; flex-direction: column; gap: 3px; flex-shrink: 0; margin-bottom: 6px; padding-bottom: 5px; border-bottom: 1px dashed #bcc5d3;">
            <div style="font-weight: 700; font-size: 0.65em; color: #4b5d88; text-transform: uppercase; letter-spacing: 0.5px;">Standard Attacks</div>
            <div style="display: flex; gap: 4px; width: 100%;">
              ${miniCards}
            </div>
          </div>
        `;
      }

      return `
        ${standardRowHtml}
        <div id="custom-weapons-list" style="flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; padding-right: 2px;">
          ${renderCustomWeaponCards()}
        </div>
        <div id="weapon-trash-zone" style="display: none; height: 32px; border: 2px dashed #e57373; background: #ffebee; color: #c62828; border-radius: 4px; font-size: 0.8em; font-weight: 700; align-items: center; justify-content: center; gap: 6px; margin-top: 4px; flex-shrink: 0; transition: background 0.15s;">
          <i class="fas fa-trash-alt"></i> Drop here to remove
        </div>
      `;
    }

    // In-memory collapsed state for spell level groups across dialog refreshes
    window.CustomRolls._collapsedSpellLevels = window.CustomRolls._collapsedSpellLevels || {};
    // In-memory active spell level/favorite filters (Set of strings: 'fav', '0', '1', etc.)
    window.CustomRolls._activeSpellFilters = window.CustomRolls._activeSpellFilters || new Set();

    function renderSpellFilterBar(availableLevels, favCount) {
      const activeFilters = window.CustomRolls._activeSpellFilters;
      const isFavActive = activeFilters.has("fav");

      const favBtn = `
        <button type="button" class="btn-spell-filter" data-filter="fav" title="Filter Favorites (${favCount})" style="cursor: pointer; height: 22px; flex: 1 1 auto; min-width: 0; padding: 0 4px; border-radius: 4px; font-weight: 700; font-size: 0.80em; display: inline-flex; align-items: center; justify-content: center; gap: 3px; border: 1px solid ${isFavActive ? '#d97706' : '#cbd5e1'}; background: ${isFavActive ? '#fef3c7' : '#f8fafc'}; color: ${isFavActive ? '#b45309' : '#64748b'}; box-shadow: ${isFavActive ? '0 0 4px rgba(217, 119, 6, 0.35)' : 'none'};">
          <i class="fas fa-star" style="color: ${isFavActive ? '#d97706' : '#cbd5e1'}; font-size: 0.85em;"></i>
          ${favCount > 0 ? `<span style="font-size: 0.85em;">${favCount}</span>` : ''}
        </button>
      `;

      const levelBtns = availableLevels.map(lvl => {
        const isActive = activeFilters.has(String(lvl));
        const label = String(lvl);
        const title = lvl === 0 ? "Cantrips (Level 0)" : `Level ${lvl}`;
        return `
          <button type="button" class="btn-spell-filter" data-filter="${lvl}" title="${title}" style="cursor: pointer; height: 22px; flex: 1 1 auto; min-width: 0; padding: 0 2px; border-radius: 4px; font-weight: 700; font-size: 0.80em; display: inline-flex; align-items: center; justify-content: center; border: 1px solid ${isActive ? '#7289da' : '#cbd5e1'}; background: ${isActive ? '#e0e7ff' : '#f8fafc'}; color: ${isActive ? '#3730a3' : '#64748b'}; box-shadow: ${isActive ? '0 0 4px rgba(114, 137, 218, 0.35)' : 'none'};">
            ${label}
          </button>
        `;
      }).join("");

      return `
        <div id="spell-filter-bar" style="display: flex; align-items: center; gap: 3px; width: 100%; box-sizing: border-box; flex-wrap: nowrap; overflow-x: auto; padding: 2px 0 5px 0; border-bottom: 1px solid #e2e8f0; margin-bottom: 4px; flex-shrink: 0;">
          ${favBtn}
          ${levelBtns}
        </div>
      `;
    }

    function renderSpellCards() {
      const assignedSlots = window.CustomRolls?.getProfileData?.(actor, "hudAssignedSlots")
        || actor.getFlag("world", "hudAssignedSlots")
        || {};

      if (spellKeys.length === 0) {
        return `
          <div style="color: #888; font-size: 0.8em; font-style: italic; text-align: center; padding: 16px 8px;">
            No spells configured.<br><small style="color: #aaa;">Click Refresh in the header to sync prepared spells from sheet.</small>
          </div>
        `;
      }

      // Group spells into Favorites and Levels (0-9)
      const favorites = [];
      const levels = {}; // 0 through 9

      for (const key of spellKeys) {
        const sp = spellConfigs[key];
        if (!sp) continue;
        if (sp.isFavorite) {
          favorites.push(key);
        }
        const lvl = Math.clamp(Number(sp.baseLevel) || 0, 0, 9);
        if (!levels[lvl]) levels[lvl] = [];
        levels[lvl].push(key);
      }

      // Sort favorites and each spell level alphabetically
      favorites.sort((a, b) => a.localeCompare(b));
      for (const lvl of Object.keys(levels)) {
        levels[lvl].sort((a, b) => a.localeCompare(b));
      }

      const collapsedState = window.CustomRolls._collapsedSpellLevels;
      const activeFilters = window.CustomRolls._activeSpellFilters;
      const hasActiveFilters = activeFilters && activeFilters.size > 0;

      // Available levels present on the actor
      const availableLevels = Object.keys(levels).map(Number).sort((a, b) => a - b);
      if (availableLevels.length === 0) availableLevels.push(0);

      const filterBarHtml = renderSpellFilterBar(availableLevels, favorites.length);

      const renderCard = (key, scope = "level") => {
        const sp = spellConfigs[key];
        if (!sp) return "";
        const isSel = key === selectedSpellKey;
        const d = getSpellDetails(sp, sp.baseLevel);
        const lvlLabel = Number(sp.baseLevel) === 0 ? "Cantrip" : `Lvl ${sp.baseLevel}`;
        const tagsHtml = d.tags.map(t => `<span style="background: rgba(114, 137, 218, 0.15); border: 1px solid rgba(114, 137, 218, 0.3); border-radius: 2px; padding: 1px 4px; font-size: 0.7em; color: #4b5d88;">${t}</span>`).join(" ");

        const assignedSlot = Object.entries(assignedSlots).find(([sNum, data]) => data?.category === "spells" && data?.name === key)?.[0];
        const hudBadge = assignedSlot
          ? `<span style="font-size: 0.70em; font-weight: 700; color: #1e5a6a; background: #eef7fa; border: 1px solid #bce1ec; border-radius: 3px; padding: 1px 4px; display: inline-flex; align-items: center; gap: 3px;" title="Assigned to HUD Button ${assignedSlot}">HUD <i class="fas fa-square-${assignedSlot}"></i></span>`
          : "";

        const isFav = Boolean(sp.isFavorite);
        const starIcon = isFav
          ? `<i class="fas fa-star btn-toggle-spell-favorite" data-key="${key}" title="Remove from Favorites" style="cursor: pointer; color: #f1c40f; font-size: 0.85em; padding: 2px;"></i>`
          : `<i class="far fa-star btn-toggle-spell-favorite" data-key="${key}" title="Add to Favorites" style="cursor: pointer; color: #aaa; font-size: 0.85em; padding: 2px;"></i>`;

        const isHealing = ["heal", "temp_hp", "max_hp"].includes(sp.resolutionMethod);
        const isUtility = sp.resolutionMethod === "other";

        let atkLabel = "Atk:";
        if (sp.resolutionMethod === "save") atkLabel = "Save:";
        else if (isHealing) atkLabel = "Heal:";
        else if (isUtility) atkLabel = "Cast:";

        let rightSideHtml = "";
        if (isHealing) {
          rightSideHtml = `<span class="weapon-card-dmg-line">Heal: <strong class="weapon-card-dmg-val" style="color: #2e7d32;">${d.valFormula}</strong></span>`;
        } else if (isUtility) {
          rightSideHtml = `<span class="weapon-card-dmg-line" style="color: #64748b; font-weight: 600;">Utility</span>`;
        } else {
          rightSideHtml = `<span class="weapon-card-dmg-line">Dmg: <strong class="weapon-card-dmg-val" style="color: #2b3a4a;">${d.valFormula}</strong></span>`;
        }

        return `
        <div class="action-card spell-card custom-spell-card" data-key="${key}" data-level="${sp.baseLevel ?? 0}" data-scope="${scope}" style="border: 2px solid ${isSel ? '#7289da' : '#e0e0e0'}; background: ${isSel ? '#f0f4ff' : '#fff'}; border-radius: 5px; padding: 6px 8px; cursor: pointer; transition: border-color 0.15s, background-color 0.15s; margin-bottom: 5px; user-select: none;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
            <div style="display: flex; align-items: center; gap: 5px; overflow: hidden; min-width: 0;">
              ${starIcon}
              <span class="spell-card-title" style="font-weight: bold; font-size: 0.9em; color: #2b3a4a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${key}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
              ${hudBadge}
              <span class="spell-card-level-label" style="font-size: 0.75em; font-weight: bold; color: #555;">${lvlLabel}</span>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82em; color: #333;">
            <span class="weapon-card-atk-line" style="display: inline-flex; align-items: center; gap: 4px;">
              ${atkLabel} 
              <button type="button" class="quick-roll-spell-btn" data-key="${key}" title="Click to Quick Cast / Roll" style="cursor: pointer; font-size: 0.9em; font-weight: 800; color: #235d6e; background: #eef7fa; border: 1px solid #bce1ec; border-radius: 3px; padding: 1px 6px; line-height: 1.2;">
                ${d.actionVal}
              </button>
            </span>
            ${rightSideHtml}
          </div>
          ${d.tags.length > 0 ? `<div style="display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px;">${tagsHtml}</div>` : ""}
        </div>
      `;
      };

      let outputHtml = filterBarHtml;

      // Section: Favorites (shown if no filters active OR if 'fav' filter is explicitly active)
      const showFavSection = favorites.length > 0 && (!hasActiveFilters || activeFilters.has("fav"));
      if (showFavSection) {
        outputHtml += `
          <div class="spell-group-section" style="margin-bottom: 6px;">
            <div class="spell-group-header" data-group="fav" style="display: flex; align-items: center; justify-content: space-between; background: rgba(241, 196, 15, 0.12); border: 1px solid rgba(241, 196, 15, 0.35); border-radius: 4px; padding: 3px 6px; margin-bottom: 4px; user-select: none;">
              <span style="font-weight: 700; font-size: 0.75em; color: #b78103; display: flex; align-items: center; gap: 5px;">
                <i class="fas fa-star" style="color: #f1c40f;"></i> FAVORITES (${favorites.length})
              </span>
            </div>
            <div class="spell-group-cards" data-group="fav" style="display: flex; flex-direction: column; gap: 3px;">
              ${favorites.map(k => renderCard(k, "fav")).join("")}
            </div>
          </div>
        `;
      }

      // Sections: Spell Levels (0 through 9)
      const sortedLevels = Object.keys(levels).map(Number).sort((a, b) => a - b);
      let renderedLevelGroups = 0;
      for (const lvl of sortedLevels) {
        const groupKeys = levels[lvl] || [];
        if (groupKeys.length === 0) continue;

        // Skip if active filters exist and this level is not active
        if (hasActiveFilters && !activeFilters.has(String(lvl))) continue;

        renderedLevelGroups++;
        const groupTitle = lvl === 0 ? "CANTRIPS" : `LEVEL ${lvl}`;
        const slotInfo = getSlotInfo(lvl);
        const slotLabel = lvl === 0 ? "" : ` • Slots: ${slotInfo.label}`;

        outputHtml += `
          <div class="spell-group-section" style="margin-bottom: 6px;">
            <div class="spell-group-header" data-group="lvl_${lvl}" style="display: flex; align-items: center; justify-content: space-between; background: rgba(114, 137, 218, 0.08); border: 1px solid rgba(114, 137, 218, 0.25); border-radius: 4px; padding: 3px 6px; margin-bottom: 4px; user-select: none;">
              <span style="font-weight: 700; font-size: 0.74em; color: #4b5d88; display: flex; align-items: center; gap: 5px;">
                ${groupTitle} (${groupKeys.length}${slotLabel})
              </span>
            </div>
            <div class="spell-group-cards" data-group="lvl_${lvl}" style="display: flex; flex-direction: column; gap: 3px;">
              ${groupKeys.map(k => renderCard(k, "level")).join("")}
            </div>
          </div>
        `;
      }

      if (hasActiveFilters && !showFavSection && renderedLevelGroups === 0) {
        outputHtml += `
          <div style="color: #888; font-size: 0.8em; font-style: italic; text-align: center; padding: 16px 8px;">
            No spells match the selected filters.
          </div>
        `;
      }

      return outputHtml;
    }

    function getSelectedWeaponInspectorHtml() {
      const config = attacks[selectedWeaponKey];
      const d = config ? getWeaponDetails(config) : null;
      const tagsHtml = d ? d.tags.map(t => `<span style="background: rgba(114, 137, 218, 0.15); border: 1px solid rgba(114, 137, 218, 0.3); border-radius: 2px; padding: 1px 4px; font-size: 0.7em; color: #4b5d88;">${t}</span>`).join(" ") : "";

      const assignedSlots = window.CustomRolls?.getProfileData?.(actor, "hudAssignedSlots")
        || actor.getFlag("world", "hudAssignedSlots")
        || {};
      const curSlot = Object.entries(assignedSlots).find(([sNum, data]) => data?.category === "weapons" && data?.name === selectedWeaponKey)?.[0] || "";

      let gwmHtml = "";
      if (config?.hasGWM) {
        gwmHtml = `
          <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.78em; font-weight: bold; color: #a34848; cursor: pointer; padding: 3px 6px; background: rgba(163, 72, 72, 0.08); border-radius: 3px; border: 1px solid rgba(163, 72, 72, 0.25);">
            <span>GWM / Sharpshooter (-5 / +10)</span>
            <input type="checkbox" id="gwm-toggle" style="margin: 0;">
          </label>
        `;
      }

      let versatileHtml = "";
      if (config?.isVersatile) {
        const vDie = config.versatileDie || "10";
        versatileHtml = `
          <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.78em; font-weight: bold; color: #2b7489; cursor: pointer; padding: 3px 6px; background: rgba(43, 116, 137, 0.08); border-radius: 3px; border: 1px solid rgba(43, 116, 137, 0.25);">
            <span>Two-Handed / Versatile (d${vDie})</span>
            <input type="checkbox" id="versatile-toggle" style="margin: 0;">
          </label>
        `;
      }

      const extras = config?.additionalDamageComponents || [];
      let extrasHtml = "";
      if (extras.length > 0) {
        extrasHtml = `
          <div style="background: #f8fafc; border: 1px solid #bcc5d3; border-radius: 5px; padding: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; flex-direction: column;">
            <div style="font-weight: 700; font-size: 0.68em; color: #4b5d88; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 3px; border-bottom: 1px solid #e0e6ed; padding-bottom: 2px;">
              Optional Damage
            </div>
            <div id="weapon-extras-scroll" style="max-height: 122px; overflow-y: auto; display: flex; flex-direction: column; gap: 3px;">
              ${extras.map((ex, i) => `
                <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.78em; cursor: pointer; padding: 3px 5px; background: #fff; border: 1px solid #d8dee6; border-radius: 3px;">
                  <span><strong>${ex.label}</strong> <small style="color: #666;">(${ex.formula})</small></span>
                  <input type="checkbox" class="extra-dmg-toggle" data-index="${i}" style="margin: 0;">
                </label>
              `).join("")}
            </div>
          </div>
        `;
      }

      const hudSlotControls = config ? `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #d8dee6;">
          <span style="font-size: 0.82em; font-weight: 700; color: #4b5d88; letter-spacing: 0.3px;">HUD ACTION:</span>
          <div style="display: inline-flex; gap: 4px;">
            <button type="button" class="btn-assign-hud-slot ${!curSlot ? 'active' : ''}" data-category="weapons" data-slot="" title="Unassign from HUD" style="height: 26px; line-height: 24px; font-size: 0.80em; font-weight: 700; padding: 0 8px; border-radius: 4px; border: 1px solid ${!curSlot ? '#2b7489' : '#ccc'}; background: ${!curSlot ? '#2b7489' : '#fff'}; color: ${!curSlot ? '#fff' : '#555'}; cursor: pointer;">None</button>
            <button type="button" class="btn-assign-hud-slot ${curSlot === '1' ? 'active' : ''}" data-category="weapons" data-slot="1" title="Assign to HUD Button 1 (Slot 47)" style="height: 26px; line-height: 24px; font-size: 1.15em; font-weight: 700; padding: 0 7px; border-radius: 4px; border: 1px solid ${curSlot === '1' ? '#2b7489' : '#ccc'}; background: ${curSlot === '1' ? '#2b7489' : '#fff'}; color: ${curSlot === '1' ? '#fff' : '#555'}; cursor: pointer;"><i class="fas fa-square-1"></i></button>
            <button type="button" class="btn-assign-hud-slot ${curSlot === '2' ? 'active' : ''}" data-category="weapons" data-slot="2" title="Assign to HUD Button 2 (Slot 48)" style="height: 26px; line-height: 24px; font-size: 1.15em; font-weight: 700; padding: 0 7px; border-radius: 4px; border: 1px solid ${curSlot === '2' ? '#2b7489' : '#ccc'}; background: ${curSlot === '2' ? '#2b7489' : '#fff'}; color: ${curSlot === '2' ? '#fff' : '#555'}; cursor: pointer;"><i class="fas fa-square-2"></i></button>
            <button type="button" class="btn-assign-hud-slot ${curSlot === '3' ? 'active' : ''}" data-category="weapons" data-slot="3" title="Assign to HUD Button 3 (Slot 49)" style="height: 26px; line-height: 24px; font-size: 1.15em; font-weight: 700; padding: 0 7px; border-radius: 4px; border: 1px solid ${curSlot === '3' ? '#2b7489' : '#ccc'}; background: ${curSlot === '3' ? '#2b7489' : '#fff'}; color: ${curSlot === '3' ? '#fff' : '#555'}; cursor: pointer;"><i class="fas fa-square-3"></i></button>
            <button type="button" class="btn-assign-hud-slot ${curSlot === '4' ? 'active' : ''}" data-category="weapons" data-slot="4" title="Assign to HUD Button 4 (Slot 50)" style="height: 26px; line-height: 24px; font-size: 1.15em; font-weight: 700; padding: 0 7px; border-radius: 4px; border: 1px solid ${curSlot === '4' ? '#2b7489' : '#ccc'}; background: ${curSlot === '4' ? '#2b7489' : '#fff'}; color: ${curSlot === '4' ? '#fff' : '#555'}; cursor: pointer;"><i class="fas fa-square-4"></i></button>
          </div>
        </div>
      ` : "";

      return `
        <!-- Weapon Overview Card (Static space taking remainder) -->
        <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; background: #f8fafc; border-radius: 5px; padding: 8px 10px; border: 1px solid #bcc5d3; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="border-bottom: 1px solid #e0e6ed; padding-bottom: 4px; margin-bottom: 6px; flex-shrink: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 800; font-size: 1.15em; color: #2b3a4a; text-transform: uppercase; letter-spacing: 0.5px;">${selectedWeaponKey || "Weapon Overview"}</span>
              ${config ? `<span style="font-size: 0.85em; font-weight: 700; color: #7289da; background: rgba(114, 137, 218, 0.12); padding: 2px 7px; border-radius: 4px; border: 1px solid rgba(114, 137, 218, 0.3);">${d.dmgType}</span>` : ""}
            </div>
            <div style="font-size: 0.82em; color: #666; font-weight: 600;">${config ? "Attack & Damage Overview" : "Information Pane"}</div>
          </div>
          <div style="font-size: 0.95em; line-height: 1.45; color: #444; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 6px;">
            ${config ? `
              <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 2px;">
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                  <span style="color: #555; font-size: 0.95em; font-weight: 600;">Attack:</span>
                  <span style="color: #2b3a4a; font-family: monospace; font-size: 1.1em; font-weight: 500;">1d20 ${d.atkSign}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                  <span style="color: #555; font-size: 0.95em; font-weight: 600;">Damage:</span>
                  <span style="color: #2b3a4a; font-family: monospace; font-size: 1.1em; font-weight: 500;">${d.dmgFormula} <small style="font-weight: 500; font-size: 0.8em; color: #666;">(${d.dmgType.toLowerCase()})</small></span>
                </div>
              </div>
              ${d.tags.length > 0 ? `<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">${tagsHtml}</div>` : ""}
              ${hudSlotControls}

              <!-- Live Estimated Formula Totals (Expanded & Larger Font) -->
              <div id="weapon-live-formula-section" style="margin-top: auto; padding-top: 6px; border-top: 1px dashed #bcc5d3; display: flex; flex-direction: column; gap: 4px;">
                <div style="font-weight: 700; font-size: 0.78em; color: #4b5d88; text-transform: uppercase; letter-spacing: 0.5px;">
                  Estimated Roll Formula
                </div>
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                  <span style="color: #555; font-size: 0.92em; font-weight: 700;">Total Atk:</span>
                  <span id="preview-total-atk" style="color: #2b3a4a; font-family: monospace; font-size: 1.1em; font-weight: 500;">1d20 ${d.atkSign}</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <span style="color: #555; font-size: 0.92em; font-weight: 700;">Total Dmg:</span>
                  <div id="preview-total-dmg" style="color: #2b3a4a; font-family: monospace; font-size: 1.1em; font-weight: 500; line-height: 1.4; word-break: break-word; background: #fff; border: 1px solid #d8dee6; border-radius: 4px; padding: 4px 8px;">
                    ${d.dmgFormula} ${d.dmgType.toLowerCase()}
                  </div>
                </div>
              </div>
            ` : `
              <div style="color: #888; font-style: italic; margin-top: 6px; font-size: 0.95em;">
                Select a weapon from the list to inspect its attack notation, modifiers, and optional damage components.
              </div>
            `}
          </div>
        </div>

        <!-- Extra Modifiers Card (Side-by-Side) -->
        <div style="background: #f8fafc; border: 1px solid #bcc5d3; border-radius: 5px; padding: 5px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); flex-shrink: 0;">
          <div style="display: flex; gap: 6px;">
            <div style="flex: 1;">
              <label for="weapon-extra-atk" style="font-weight: 700; font-size: 0.68em; color: #4b5d88; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">EXTRA ATK MOD</label>
              <input type="text" id="weapon-extra-atk" placeholder="e.g. 1d4, +2" style="width: 100%; height: 24px; font-size: 0.78em; border-radius: 3px; border: 1px solid #ccc; padding: 1px 4px; background: #fff;" />
            </div>
            <div style="flex: 1;">
              <label for="weapon-extra-dmg" style="font-weight: 700; font-size: 0.68em; color: #4b5d88; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">EXTRA DMG MOD</label>
              <input type="text" id="weapon-extra-dmg" placeholder="e.g. 1d6, +3" style="width: 100%; height: 24px; font-size: 0.78em; border-radius: 3px; border: 1px solid #ccc; padding: 1px 4px; background: #fff;" />
            </div>
          </div>
        </div>

        <!-- Optional Damage & GWM / Versatile Card -->
        ${(gwmHtml || versatileHtml || extrasHtml) ? `
          <div style="display: flex; flex-direction: column; gap: 4px; flex-shrink: 0;">
            ${versatileHtml}
            ${gwmHtml}
            ${extrasHtml}
          </div>
        ` : ''}

        <!-- Pinned Roll Attack Button -->
        <div style="margin-top: auto; padding-top: 4px; flex-shrink: 0;">
          <button type="button" id="btn-roll-weapon-now" ${!config ? 'disabled' : ''} style="width: 100%; height: 32px; font-weight: 700; font-size: 0.88em; background: #7289da; color: #fff; border: 1px solid #5b6eae; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <i class="fas fa-dice-d20"></i> Roll Attack
          </button>
        </div>
      `;
    }

    function getSpellcastingSummaryHtml() {
      const sys = actor?.system || {};
      const pb = Number(sys.attributes?.prof ?? 0);
      const spellcastingAbility = sys.attributes?.spellcasting;
      const hasSpellcasting = Boolean(spellcastingAbility && spellcastingAbility !== "" && spellcastingAbility !== "none");
      
      const abilLabel = hasSpellcasting ? String(spellcastingAbility).toUpperCase() : "—";
      const abilModVal = hasSpellcasting ? Number(sys.abilities?.[spellcastingAbility]?.mod ?? 0) : null;
      const abilModDisplay = abilModVal !== null ? (abilModVal >= 0 ? `+${abilModVal}` : `${abilModVal}`) : "—";
      const abilFullDisplay = hasSpellcasting ? `${abilLabel} (${abilModDisplay})` : "—";

      const rawAtk = sys.attributes?.spell?.attack;
      const spellAtkVal = rawAtk !== undefined ? Number(rawAtk) : (hasSpellcasting ? (pb + (abilModVal ?? 0)) : null);
      const spellAtkDisplay = spellAtkVal !== null ? (spellAtkVal >= 0 ? `+${spellAtkVal}` : `${spellAtkVal}`) : "—";

      const rawDC = sys.attributes?.spell?.dc ?? sys.attributes?.spelldc;
      const spellDCVal = rawDC !== undefined ? Number(rawDC) : (hasSpellcasting ? (8 + pb + (abilModVal ?? 0)) : null);
      const spellDCDisplay = spellDCVal !== null ? String(spellDCVal) : "—";

      return `
        <!-- Static Spellcasting Summary Bar -->
        <div style="background: #f8fafc; border: 1px solid #bcc5d3; border-radius: 5px; padding: 4px 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; gap: 4px;">
          <div style="display: flex; flex-direction: column; align-items: center; flex: 1.1; border-right: 1px solid #e0e6ed; padding: 0 3px;">
            <span style="font-size: 0.65em; font-weight: 700; color: #4b5d88; letter-spacing: 0.4px; text-transform: uppercase;">Ability</span>
            <span style="font-size: 0.88em; font-weight: 800; color: #2b3a4a; white-space: nowrap;">${abilFullDisplay}</span>
          </div>
          <div style="display: flex; flex-direction: column; align-items: center; flex: 1; border-right: 1px solid #e0e6ed; padding: 0 3px;">
            <button type="button" class="btn-spell-atk-roll" data-atk-bonus="${spellAtkVal ?? 0}" title="Roll Generic Spell Attack (${spellAtkDisplay})" style="width: 100%; height: 26px; padding: 0 4px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; background: #fff; border: 1px solid #7289da; border-radius: 4px; cursor: pointer; color: #2b3a4a; white-space: nowrap;">
              <span style="font-size: 0.80em; font-weight: 700; color: #4b5d88; letter-spacing: 0.3px; text-transform: uppercase;">Spell Atk</span>
              <span style="font-size: 0.95em; font-weight: 800; color: #7289da;">${spellAtkDisplay}</span>
            </button>
          </div>
          <div style="display: flex; flex-direction: column; align-items: center; flex: 1; padding: 0 3px;">
            <button type="button" class="btn-spell-dc-card" data-save-dc="${spellDCVal ?? 10}" title="Post Generic Save DC Card (DC ${spellDCDisplay})" style="width: 100%; height: 26px; padding: 0 4px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; background: #fff; border: 1px solid #7289da; border-radius: 4px; cursor: pointer; color: #2b3a4a; white-space: nowrap;">
              <span style="font-size: 0.80em; font-weight: 700; color: #4b5d88; letter-spacing: 0.3px; text-transform: uppercase;">Spell DC</span>
              <span style="font-size: 0.95em; font-weight: 800; color: #7289da;">${spellDCDisplay}</span>
            </button>
          </div>
        </div>
      `;
    }

    let inspectorSpellSubTab = "details"; // "details" | "slots"
    const SPELL_SLOT_MODE_STORAGE_KEY = "cheapdice_spell_slot_mode";
    let spellSlotDisplayMode = localStorage.getItem(SPELL_SLOT_MODE_STORAGE_KEY) || "available"; // "available" | "spent"

    function getSpellSlotsTrackerHtml() {
      const spells = actor?.system?.spells || {};
      const slotEntries = [];

      for (let lvl = 1; lvl <= 9; lvl++) {
        const slot = spells[`spell${lvl}`];
        const max = Number(slot?.max) || 0;
        if (max > 0) {
          slotEntries.push({
            label: `Lvl ${lvl}`,
            current: Math.max(0, Number(slot?.value) || 0),
            max
          });
        }
      }

      if (spells.pact) {
        const pactMax = Number(spells.pact.max) || 0;
        if (pactMax > 0) {
          slotEntries.push({
            label: "Pact",
            current: Math.max(0, Number(spells.pact.value) || 0),
            max: pactMax
          });
        }
      }

      const isAvailMode = spellSlotDisplayMode === "available";

      if (slotEntries.length === 0) {
        return `
          <div style="background: #f8fafc; border: 1px solid #bcc5d3; border-radius: 5px; padding: 6px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); flex-shrink: 0;">
            <div style="font-weight: 700; font-size: 0.68em; color: #4b5d88; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 3px; border-bottom: 1px solid #e0e6ed; padding-bottom: 2px;">
              Spell Slot Tracker
            </div>
            <div style="font-size: 0.80em; color: #888; font-style: italic; text-align: center; padding: 6px 0;">
              No spell slots configured on character sheet.
            </div>
          </div>
        `;
      }

      const rowsHtml = slotEntries.map(entry => {
        const available = Math.min(entry.current, entry.max);
        const spent = Math.max(0, entry.max - available);

        // Circular pips: in "available" mode, filled = available; in "spent" mode, filled = spent
        const pips = [];
        for (let i = 0; i < entry.max; i++) {
          const isFilled = isAvailMode ? (i < available) : (i < spent);
          if (isFilled) {
            pips.push(`<i class="fas fa-circle" style="color: #7289da; font-size: 0.85em;"></i>`);
          } else {
            pips.push(`<i class="far fa-circle" style="color: #bcc5d3; font-size: 0.85em;"></i>`);
          }
        }

        const countText = isAvailMode
          ? `${available}/${entry.max}`
          : `${spent}/${entry.max}`;

        return `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 3px 6px; background: rgba(0,0,0,0.02); border-radius: 4px; border: 1px solid #e0e6ed; font-size: 0.82em;">
            <span style="font-weight: 700; color: #4b5d88; width: 44px; flex-shrink: 0;">${entry.label}</span>
            <div style="display: flex; gap: 4px; align-items: center; flex: 1; margin: 0 8px; flex-wrap: wrap;">
              ${pips.join("")}
            </div>
            <span style="font-family: monospace; font-size: 0.9em; font-weight: 700; color: #2b3a4a; flex-shrink: 0;">${countText}</span>
          </div>
        `;
      }).join("");

      return `
        <div style="background: #f8fafc; border: 1px solid #bcc5d3; border-radius: 5px; padding: 6px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); flex-shrink: 0; display: flex; flex-direction: column; gap: 5px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e0e6ed; padding-bottom: 3px;">
            <span style="font-weight: 700; font-size: 0.68em; color: #4b5d88; letter-spacing: 0.5px; text-transform: uppercase;">
              <i class="fas fa-circle-notch" style="margin-right: 3px;"></i> Spell Slots Tracker
            </span>
            <div style="display: inline-flex; border: 1px solid #7289da; border-radius: 3px; overflow: hidden; height: 19px;">
              <button type="button" class="btn-toggle-slot-mode ${isAvailMode ? 'active-slot-mode' : ''}" data-mode="available" title="Display slots currently available to cast" style="border: none; padding: 0 6px; font-size: 0.68em; font-weight: 700; cursor: pointer; background: ${isAvailMode ? '#7289da' : '#fff'}; color: ${isAvailMode ? '#fff' : '#4b5d88'}; line-height: 19px;">Available</button>
              <button type="button" class="btn-toggle-slot-mode ${!isAvailMode ? 'active-slot-mode' : ''}" data-mode="spent" title="Display slots expended/used" style="border: none; padding: 0 6px; font-size: 0.68em; font-weight: 700; cursor: pointer; background: ${!isAvailMode ? '#7289da' : '#fff'}; color: ${!isAvailMode ? '#fff' : '#4b5d88'}; line-height: 19px; border-left: 1px solid #7289da;">Spent</button>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            ${rowsHtml}
          </div>
        </div>
      `;
    }

    function getSelectedSpellInspectorHtml() {
      const summaryHtml = getSpellcastingSummaryHtml();
      const sp = spellConfigs[selectedSpellKey];
      if (!sp) {
        return `
          ${summaryHtml}
          <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: #888; font-size: 0.85em; font-style: italic;">
            Select a spell from the list.
          </div>
        `;
      }
      const d = getSpellDetails(sp, sp.baseLevel);
      const lvlLabel = Number(sp.baseLevel) === 0 ? "Cantrip" : `Level ${sp.baseLevel}`;
      const tagsHtml = d.tags.map(t => `<span style="background: rgba(114, 137, 218, 0.15); border: 1px solid rgba(114, 137, 218, 0.3); border-radius: 2px; padding: 1px 4px; font-size: 0.7em; color: #4b5d88;">${t}</span>`).join(" ");

      const assignedSlots = window.CustomRolls?.getProfileData?.(actor, "hudAssignedSlots")
        || actor.getFlag("world", "hudAssignedSlots")
        || {};
      const curSlot = Object.entries(assignedSlots).find(([sNum, data]) => data?.category === "spells" && data?.name === selectedSpellKey)?.[0] || "";

      const fullSpellDesc = (sp.description || sp.summary || "").trim();
      const descHtmlBlock = fullSpellDesc ? `
        <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; margin-top: 6px; border: 1px solid rgba(75, 93, 136, 0.25); border-radius: 4px; padding: 5px 7px; background: rgba(75, 93, 136, 0.04);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; border-bottom: 1px solid rgba(75, 93, 136, 0.15); padding-bottom: 2px; flex-shrink: 0;">
            <span style="font-weight: 700; font-size: 0.68em; color: #4b5d88; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;">
              <i class="fas fa-sparkles" style="margin-right: 3px;"></i> Spell Description
            </span>
            <button type="button" class="btn-send-spell-desc-chat" title="Send description to chat" style="width: auto !important; max-width: 58px; height: 18px; line-height: 16px; font-size: 0.70em; font-weight: 700; padding: 0 5px; margin: 0 0 0 auto; border-radius: 3px; border: 1px solid #7289da; background: #fff; color: #4b5d88; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 3px; white-space: nowrap; flex: 0 0 auto;">
              Chat <i class="fas fa-arrow-right" style="font-size: 0.85em;"></i>
            </button>
          </div>
          <div class="spell-description-content" style="flex: 1; min-height: 0; overflow-y: auto; font-size: 0.82em; line-height: 1.45; color: #2b3a4a;">
            ${fullSpellDesc}
          </div>
        </div>
      ` : "";

      const hudSlotControls = sp ? `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #d8dee6; flex-shrink: 0;">
          <span style="font-size: 0.82em; font-weight: 700; color: #4b5d88; letter-spacing: 0.3px;">HUD ACTION:</span>
          <div style="display: inline-flex; gap: 4px;">
            <button type="button" class="btn-assign-hud-slot ${!curSlot ? 'active' : ''}" data-category="spells" data-slot="" title="Unassign from HUD" style="height: 26px; line-height: 24px; font-size: 0.80em; font-weight: 700; padding: 0 8px; border-radius: 4px; border: 1px solid ${!curSlot ? '#2b7489' : '#ccc'}; background: ${!curSlot ? '#2b7489' : '#fff'}; color: ${!curSlot ? '#fff' : '#555'}; cursor: pointer;">None</button>
            <button type="button" class="btn-assign-hud-slot ${curSlot === '1' ? 'active' : ''}" data-category="spells" data-slot="1" title="Assign to HUD Button 1 (Slot 47)" style="height: 26px; line-height: 24px; font-size: 1.15em; font-weight: 700; padding: 0 7px; border-radius: 4px; border: 1px solid ${curSlot === '1' ? '#2b7489' : '#ccc'}; background: ${curSlot === '1' ? '#2b7489' : '#fff'}; color: ${curSlot === '1' ? '#fff' : '#555'}; cursor: pointer;"><i class="fas fa-square-1"></i></button>
            <button type="button" class="btn-assign-hud-slot ${curSlot === '2' ? 'active' : ''}" data-category="spells" data-slot="2" title="Assign to HUD Button 2 (Slot 48)" style="height: 26px; line-height: 24px; font-size: 1.15em; font-weight: 700; padding: 0 7px; border-radius: 4px; border: 1px solid ${curSlot === '2' ? '#2b7489' : '#ccc'}; background: ${curSlot === '2' ? '#2b7489' : '#fff'}; color: ${curSlot === '2' ? '#fff' : '#555'}; cursor: pointer;"><i class="fas fa-square-2"></i></button>
            <button type="button" class="btn-assign-hud-slot ${curSlot === '3' ? 'active' : ''}" data-category="spells" data-slot="3" title="Assign to HUD Button 3 (Slot 49)" style="height: 26px; line-height: 24px; font-size: 1.15em; font-weight: 700; padding: 0 7px; border-radius: 4px; border: 1px solid ${curSlot === '3' ? '#2b7489' : '#ccc'}; background: ${curSlot === '3' ? '#2b7489' : '#fff'}; color: ${curSlot === '3' ? '#fff' : '#555'}; cursor: pointer;"><i class="fas fa-square-3"></i></button>
            <button type="button" class="btn-assign-hud-slot ${curSlot === '4' ? 'active' : ''}" data-category="spells" data-slot="4" title="Assign to HUD Button 4 (Slot 50)" style="height: 26px; line-height: 24px; font-size: 1.15em; font-weight: 700; padding: 0 7px; border-radius: 4px; border: 1px solid ${curSlot === '4' ? '#2b7489' : '#ccc'}; background: ${curSlot === '4' ? '#2b7489' : '#fff'}; color: ${curSlot === '4' ? '#fff' : '#555'}; cursor: pointer;"><i class="fas fa-square-4"></i></button>
          </div>
        </div>
      ` : "";

      const resMethod = sp.resolutionMethod || "attack";
      const isSave = resMethod === "save";
      const isHeal = ["heal", "temp_hp", "max_hp"].includes(resMethod);
      const isAtk = resMethod === "attack";

      const leftModLabel = isAtk ? "EXTRA ATK MOD" : (isSave ? "EXTRA DC MOD" : "EXTRA ACC/DC MOD");
      const leftModPlaceholder = isAtk ? "e.g. 1d4, +2" : (isSave ? "e.g. +1, +2" : "e.g. +1");
      const rightModLabel = isHeal ? "EXTRA HEAL MOD" : "EXTRA DMG MOD";
      const rightModPlaceholder = isHeal ? "e.g. 1d4, +3" : "e.g. 1d6, +2";

      return `
        ${summaryHtml}

        <!-- Sub-Tabs Navigation (Details vs Slots) -->
        <div style="display: flex; gap: 4px; border-bottom: 2px solid #7289da; padding-bottom: 4px; flex-shrink: 0;">
          <button type="button" class="btn-spell-subtab ${inspectorSpellSubTab === 'details' ? 'active-subtab' : ''}" data-subtab="details" style="flex: 1; height: 26px; font-size: 0.82em; font-weight: bold; border-radius: 4px 4px 0 0; border: 1px solid #7289da; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; background: ${inspectorSpellSubTab === 'details' ? '#7289da' : '#f0f2f5'}; color: ${inspectorSpellSubTab === 'details' ? '#fff' : '#555'};">
            <i class="fas fa-book-open"></i> Spell Details
          </button>
          <button type="button" class="btn-spell-subtab ${inspectorSpellSubTab === 'slots' ? 'active-subtab' : ''}" data-subtab="slots" style="flex: 1; height: 26px; font-size: 0.82em; font-weight: bold; border-radius: 4px 4px 0 0; border: 1px solid #7289da; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; background: ${inspectorSpellSubTab === 'slots' ? '#7289da' : '#f0f2f5'}; color: ${inspectorSpellSubTab === 'slots' ? '#fff' : '#555'};">
            <i class="fas fa-bolt"></i> Spell Slots
          </button>
        </div>

        <!-- Scrollable Tab Content Container -->
        <div style="flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column;">

          <!-- TAB 1: Spell Details -->
          <div id="spell-subtab-details" style="display: ${inspectorSpellSubTab === 'details' ? 'flex' : 'none'}; flex: 1; min-height: 0; flex-direction: column;">
            <!-- Spell Overview Card (Fills height down to modifiers) -->
            <div style="background: #f8fafc; border: 1px solid #bcc5d3; border-radius: 5px; padding: 6px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); flex: 1; min-height: 0; display: flex; flex-direction: column;">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e0e6ed; padding-bottom: 4px; margin-bottom: 5px; flex-shrink: 0;">
                <span style="font-weight: 800; font-size: 1.15em; color: #2b3a4a;">${selectedSpellKey}</span>
                <span style="font-size: 0.85em; font-weight: 700; color: #7289da; background: rgba(114, 137, 218, 0.12); padding: 2px 7px; border-radius: 4px; border: 1px solid rgba(114, 137, 218, 0.3);">${lvlLabel}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 0.95em; color: #444; margin-bottom: 3px; flex-shrink: 0;">
                <span>${sp.resolutionMethod === 'save' ? 'Save' : (['heal', 'temp_hp', 'max_hp'].includes(sp.resolutionMethod) ? 'Heal' : (sp.resolutionMethod === 'other' ? 'Action' : 'Roll'))}: <strong style="color: #2b3a4a; font-family: monospace; font-size: 1.1em; font-weight: 700;">${d.actionVal}</strong></span>
                <span>Effect: <strong style="color: #2b3a4a; font-family: monospace; font-size: 1.1em; font-weight: 700;">${d.valFormula}</strong> <small style="color: #666; font-size: 0.85em; font-weight: 600;">${d.typeLabel}</small></span>
              </div>
              ${d.tags.length > 0 ? `<div style="display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; flex-shrink: 0;">${tagsHtml}</div>` : ""}
              ${descHtmlBlock}
              ${hudSlotControls}
            </div>
          </div>

          <!-- TAB 2: Spell Slots & Cast Options -->
          <div id="spell-subtab-slots" style="display: ${inspectorSpellSubTab === 'slots' ? 'flex' : 'none'}; flex-direction: column; gap: 6px;">
            <!-- Upcast & Slot Options Card -->
            <div style="background: #f8fafc; border: 1px solid #bcc5d3; border-radius: 5px; padding: 6px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); flex-shrink: 0;">
              <div style="font-weight: 700; font-size: 0.68em; color: #4b5d88; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 3px; border-bottom: 1px solid #e0e6ed; padding-bottom: 2px;">
                Cast Options
              </div>
              <div id="spell-options-container">
                ${getUpcastOptionsHtml(sp)}
              </div>
            </div>

            <!-- Spell Slots Tracker Card -->
            ${getSpellSlotsTrackerHtml()}
          </div>

        </div>

        <!-- Extra Modifiers Card (Dynamic ATK/DC & DMG/HEAL, pinned above Cast button) -->
        <div style="background: #f8fafc; border: 1px solid #bcc5d3; border-radius: 5px; padding: 5px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); flex-shrink: 0;">
          <div style="display: flex; gap: 6px;">
            <div style="flex: 1;">
              <label for="spell-extra-atk" style="font-weight: 700; font-size: 0.68em; color: #4b5d88; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">${leftModLabel}</label>
              <input type="text" id="spell-extra-atk" placeholder="${leftModPlaceholder}" style="width: 100%; height: 24px; font-size: 0.78em; border-radius: 3px; border: 1px solid #ccc; padding: 1px 4px; background: #fff;" />
            </div>
            <div style="flex: 1;">
              <label for="spell-extra-dmg" style="font-weight: 700; font-size: 0.68em; color: #4b5d88; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">${rightModLabel}</label>
              <input type="text" id="spell-extra-dmg" placeholder="${rightModPlaceholder}" style="width: 100%; height: 24px; font-size: 0.78em; border-radius: 3px; border: 1px solid #ccc; padding: 1px 4px; background: #fff;" />
            </div>
          </div>
        </div>

        <!-- Pinned Cast Spell Button -->
        <div style="margin-top: auto; padding-top: 4px; flex-shrink: 0;">
          <button type="button" id="btn-cast-spell-now" style="width: 100%; height: 32px; font-weight: 700; font-size: 0.88em; background: #7289da; color: #fff; border: 1px solid #5b6eae; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <i class="fas fa-magic"></i> Cast Spell
          </button>
        </div>
      `;
    }

    const COMPACT_STORAGE_KEY = "cheapdice_dice_stuff_compact";
    const COMPACT_TAB_STORAGE_KEY = "cheapdice_dice_stuff_compact_tab";
    const isInitiallyCompact = localStorage.getItem(COMPACT_STORAGE_KEY) === "true";
    let compactTab = localStorage.getItem(COMPACT_TAB_STORAGE_KEY) || "abilities";

    const content = `
    <!-- Top Compact Navigation Bar (Visible only in Compact Mode - Icons Only) -->
    <div id="dice-stuff-compact-nav" style="display: ${isInitiallyCompact ? 'flex' : 'none'}; gap: 4px; border-bottom: 2px solid #7289da; padding-bottom: 5px; margin-bottom: 6px; flex-shrink: 0;">
      <button type="button" class="compact-nav-btn ${compactTab === 'abilities' ? 'active-compact-tab' : ''}" data-tab="abilities" title="Abilities & Scores" style="flex: 1; height: 28px; padding: 2px; font-weight: bold; border-radius: 4px; border: 1px solid #7289da; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.95em; background: ${compactTab === 'abilities' ? '#7289da' : '#f0f2f5'}; color: ${compactTab === 'abilities' ? '#fff' : '#555'};">
        <i class="fas fa-user-shield"></i>
      </button>
      <button type="button" class="compact-nav-btn ${compactTab === 'd20' ? 'active-compact-tab' : ''}" data-tab="d20" title="Skills & Tools" style="flex: 1; height: 28px; padding: 2px; font-weight: bold; border-radius: 4px; border: 1px solid #7289da; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.95em; background: ${compactTab === 'd20' ? '#7289da' : '#f0f2f5'}; color: ${compactTab === 'd20' ? '#fff' : '#555'};">
        <i class="fas fa-dice-d20"></i>
      </button>
      <button type="button" class="compact-nav-btn ${compactTab === 'weapon' ? 'active-compact-tab' : ''}" data-tab="weapon" title="Weapons & Attacks" style="flex: 1; height: 28px; padding: 2px; font-weight: bold; border-radius: 4px; border: 1px solid #7289da; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.95em; background: ${compactTab === 'weapon' ? '#7289da' : '#f0f2f5'}; color: ${compactTab === 'weapon' ? '#fff' : '#555'};">
        <i class="fas fa-sword"></i>
      </button>
      <button type="button" class="compact-nav-btn ${compactTab === 'spell' ? 'active-compact-tab' : ''}" data-tab="spell" title="Spells & Slots" style="flex: 1; height: 28px; padding: 2px; font-weight: bold; border-radius: 4px; border: 1px solid #7289da; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.95em; background: ${compactTab === 'spell' ? '#7289da' : '#f0f2f5'}; color: ${compactTab === 'spell' ? '#fff' : '#555'};">
        <i class="fas fa-magic"></i>
      </button>
    </div>

    <div id="dice-stuff-main-container" style="display: flex; gap: 10px; font-family: inherit; height: 520px; box-sizing: border-box; padding: 2px;">
      
      <!-- COLUMN 1: LEFT SIDEBAR: Persistent (~275px) -->
      <div id="dialog-sidebar-left" style="width: 275px; min-width: 275px; display: flex; flex-direction: column; gap: 6px; border-right: 1px solid #bcc5d3; padding-right: 8px; height: 100%;">
        
        <!-- Actor Portrait (Left) & Stacked Init/Conc (Right) -->
        <div style="display: flex; gap: 8px; align-items: center; background: #f8fafc; border: 1px solid #bcc5d3; border-radius: 5px; padding: 6px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); flex-shrink: 0;">
          <img src="${portraitSrc}" alt="${actor.name}" style="width: 58px; height: 58px; border-radius: 6px; border: 1px solid #aeb7c4; object-fit: cover; object-position: top; box-shadow: 0 1px 2px rgba(0,0,0,0.1); flex-shrink: 0;" />
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;">
            <div class="sheet-entry-row" data-key="init" data-type="init" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 4px; background: rgba(43, 116, 137, 0.08); border: 1px solid rgba(43, 116, 137, 0.35); border-radius: 3px; cursor: pointer;" title="Roll Initiative">
              <span class="entry-label" style="font-size: 1.05em; font-weight: 700; color: #235d6e; white-space: nowrap;">Initiative</span>
              <button type="button" class="roll-btn-v2" data-type="init" data-key="init" style="width: 52px; height: 20px; font-size: 0.80em; font-weight: 700; padding: 0; border: 1px solid #235d6e; background: #fff; border-radius: 2px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-align: center;">
                ${d20Data.formattedInit}
              </button>
            </div>
            <div class="sheet-entry-row" data-key="concentration" data-type="concentration" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 4px; background: rgba(163, 72, 72, 0.08); border: 1px solid rgba(163, 72, 72, 0.35); border-radius: 3px; cursor: pointer;" title="Roll Concentration">
              <span class="entry-label" style="font-size: 1.05em; font-weight: 700; color: #a34848; white-space: nowrap;">Concentration</span>
              <button type="button" class="roll-btn-v2" data-type="concentration" data-key="concentration" style="width: 34px; height: 20px; font-size: 0.80em; font-weight: 700; padding: 0; border: 1px solid #a34848; background: #fff; border-radius: 2px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-align: center;">
                ${d20Data.formattedConc}
              </button>
            </div>
          </div>
        </div>

        <!-- Ability Scores & Saves (2-Col Grid) -->
        <div style="background: #f8fafc; border: 1px solid #bcc5d3; border-radius: 5px; padding: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); flex-shrink: 0;">
          <div style="font-weight: 700; font-size: 0.78em; color: #4b5d88; letter-spacing: 0.5px; margin-bottom: 3px; text-transform: uppercase;">
            Ability Scores & Saves
          </div>
          ${d20Data.sidebarAbilitiesHtml}
        </div>

        <!-- Tracking Stuff Container -->
        <div style="flex: 1; min-height: 0; display: flex; flex-direction: column;">
          ${trackingHelper.html}
        </div>

      </div>

      <!-- COLUMN 2: CENTER PANEL: Tabs & Active List (~345px) -->
      <div id="dialog-panel-center" style="flex: 1; min-width: 300px; display: flex; flex-direction: column; gap: 6px; border-right: 1px solid #bcc5d3; padding-right: 8px; height: 100%;">
        
        <!-- Tabs Header -->
        <div style="display: flex; gap: 4px; border-bottom: 2px solid #7289da; padding-bottom: 6px; flex-shrink: 0;">
          <button type="button" id="tab-btn-d20" style="flex: 1; padding: 6px 2px; font-weight: bold; border-radius: 4px 4px 0 0; border: 1px solid #7289da; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 0.92em;">
            <i class="fas fa-dice-d20"></i> Skills & Tools
          </button>
          <button type="button" id="tab-btn-weapon" style="flex: 1; padding: 6px 2px; font-weight: bold; border-radius: 4px 4px 0 0; border: 1px solid #7289da; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 0.92em;">
            <i class="fas fa-sword"></i> Weapons (${attackNames.length})
          </button>
          <button type="button" id="tab-btn-spell" style="flex: 1; padding: 6px 2px; font-weight: bold; border-radius: 4px 4px 0 0; border: 1px solid #7289da; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 0.92em;">
            <i class="fas fa-magic"></i> Spells (${spellKeys.length})
          </button>
        </div>

        <!-- Active List Container -->
        <div style="flex: 1; min-height: 0; display: flex; flex-direction: column;">
          <!-- Tab 1: Skills & Tools Stack -->
          <div id="section-d20" style="display: ${currentMode === 'd20' ? 'flex' : 'none'}; flex-direction: column; gap: 6px; height: 100%; box-sizing: border-box; overflow-y: auto;">
            ${d20Data.skillsToolsHtml}
          </div>

          <!-- Tab 2: Weapons List -->
          <div id="section-weapon" style="display: ${currentMode === 'weapon' ? 'flex' : 'none'}; flex-direction: column; height: 100%; box-sizing: border-box; min-height: 0;">
            ${renderWeaponCards()}
          </div>

          <!-- Tab 3: Spells List -->
          <div id="section-spell" style="display: ${currentMode === 'spell' ? 'flex' : 'none'}; flex-direction: column; gap: 4px; height: 100%; box-sizing: border-box; overflow-y: auto;">
            ${renderSpellCards()}
          </div>
        </div>

      </div>

      <!-- COLUMN 3: PERSISTENT RIGHT INSPECTOR (~340px) -->
      <div id="dialog-panel-right" style="width: 340px; min-width: 340px; display: flex; flex-direction: column; gap: 6px; height: 100%;">
        <!-- Inspector for Skills & Tools -->
        <div id="inspector-d20" style="display: ${currentMode === 'd20' ? 'flex' : 'none'}; flex-direction: column; gap: 6px; height: 100%;">
          ${d20Data.inspectorHtml}
        </div>

        <!-- Inspector for Weapons -->
        <div id="inspector-weapon" style="display: ${currentMode === 'weapon' ? 'flex' : 'none'}; flex-direction: column; gap: 6px; height: 100%;">
          ${getSelectedWeaponInspectorHtml()}
        </div>

        <!-- Inspector for Spells -->
        <div id="inspector-spell" style="display: ${currentMode === 'spell' ? 'flex' : 'none'}; flex-direction: column; gap: 6px; height: 100%;">
          ${getSelectedSpellInspectorHtml()}
        </div>
      </div>

    </div>
  `;

    const dlg = new Dialog({
      title: `Dice Stuff: ${actor.name}`,
      content: content,
      buttons: {},
      render: (html) => {
        html.closest(".dialog").find(".dialog-buttons").remove();

        const dialogApp = html.closest(".app.dialog");

        // Set initial window width based on saved compact state
        if (isInitiallyCompact) {
          dialogApp.css({ width: "310px", "min-width": "310px" });
        }

        // --- Theme Engine Setup ---
        const THEME_STORAGE_KEY = "cheapdice_dice_stuff_theme";
        const THEMES = [
          { key: "default", label: "Default" },
          { key: "slate", label: "Slate & Obsidian" },
          { key: "arcane", label: "Arcane Midnight" },
          { key: "glass", label: "Tactical Glass" }
        ];

        function applyTheme(themeKey) {
          THEMES.forEach(t => dialogApp.removeClass(`cheapdice-theme-${t.key}`));
          if (themeKey && themeKey !== "default") {
            dialogApp.addClass(`cheapdice-theme-${themeKey}`);
          }
          try {
            localStorage.setItem(THEME_STORAGE_KEY, themeKey);
          } catch (e) {}
        }

        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || "default";
        applyTheme(savedTheme);

        // Inject Stylesheet if not already loaded
        if (!document.getElementById("cheapdice-theme-styles")) {
          const styleTag = document.createElement("style");
          styleTag.id = "cheapdice-theme-styles";
          styleTag.textContent = `
            /* Dice Stuff Theme Engine Styles */
            /* Theme Selector in Window Header */
            .dice-stuff-theme-select {
              background: rgba(0, 0, 0, 0.45);
              color: #f1f5f9;
              border: 1px solid rgba(255, 255, 255, 0.25);
              border-radius: 3px;
              font-size: 0.72em;
              font-weight: 600;
              height: 20px;
              padding: 0 4px;
              cursor: pointer;
              margin-right: 6px;
              outline: none;
            }
            .dice-stuff-theme-select option {
              background: #1e293b;
              color: #f1f5f9;
            }

            /* ========================================================= */
            /* 1. SLATE & OBSIDIAN THEME                                 */
            /* ========================================================= */
            .app.dialog.cheapdice-theme-slate {
              background: #131722 !important;
              border: 1px solid #334155 !important;
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.75) !important;
              color: #e2e8f0;
              transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
            }
            .app.dialog.cheapdice-theme-slate .sheet-entry-row[data-key="init"] {
              background: rgba(56, 189, 248, 0.15) !important;
              border-color: rgba(56, 189, 248, 0.4) !important;
            }
            .app.dialog.cheapdice-theme-slate .sheet-entry-row[data-key="init"] .entry-label {
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-slate .sheet-entry-row[data-key="concentration"] {
              background: rgba(244, 63, 94, 0.15) !important;
              border-color: rgba(244, 63, 94, 0.4) !important;
            }
            .app.dialog.cheapdice-theme-slate .sheet-entry-row[data-key="concentration"] .entry-label {
              color: #fb7185 !important;
            }
            .app.dialog.cheapdice-theme-slate .tracking-chip {
              background: rgba(0, 0, 0, 0.3) !important;
              border-color: rgba(255, 255, 255, 0.15) !important;
            }
            .app.dialog.cheapdice-theme-slate .tracking-chip span {
              color: #f1f5f9 !important;
            }
            .app.dialog.cheapdice-theme-slate .chip-val-input {
              background: rgba(0, 0, 0, 0.5) !important;
              color: #38bdf8 !important;
              border-color: rgba(255, 255, 255, 0.2) !important;
            }
            .app.dialog.cheapdice-theme-slate .btn-chip-dec,
            .app.dialog.cheapdice-theme-slate .btn-chip-inc {
              background: #252f42 !important;
              border: 1px solid #38bdf8 !important;
              color: #38bdf8 !important;
              font-weight: 800 !important;
            }
            .app.dialog.cheapdice-theme-slate #inspector-d20 label,
            .app.dialog.cheapdice-theme-slate #inspector-d20 label span {
              color: #e2e8f0 !important;
            }
            .app.dialog.cheapdice-theme-slate .window-header {
              background: #1e2536 !important;
              border-bottom: 1px solid #334155 !important;
              color: #f8fafc !important;
            }
            .app.dialog.cheapdice-theme-slate .window-content {
              background: #131722 !important;
              color: #cbd5e1 !important;
            }
            .app.dialog.cheapdice-theme-slate #dialog-panel-left,
            .app.dialog.cheapdice-theme-slate #dialog-panel-center {
              border-right-color: #273142 !important;
            }
            .app.dialog.cheapdice-theme-slate #tracking-stuff-wrapper,
            .app.dialog.cheapdice-theme-slate .custom-weapon-card,
            .app.dialog.cheapdice-theme-slate .custom-spell-card,
            .app.dialog.cheapdice-theme-slate .standard-weapon-card,
            .app.dialog.cheapdice-theme-slate #section-d20 > div {
              background: #1b212f !important;
              border-color: #2e3b52 !important;
              color: #e2e8f0 !important;
            }
            .app.dialog.cheapdice-theme-slate #tracking-stuff-wrapper span[style*="Tracking Stuff"],
            .app.dialog.cheapdice-theme-slate #tracking-stuff-wrapper div[style*="Tracking Stuff"],
            .app.dialog.cheapdice-theme-slate #tracking-stuff-wrapper span[style*="color: #4b5d88"],
            .app.dialog.cheapdice-theme-slate #tracking-stuff-wrapper strong[style*="color: #4b5d88"] {
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-slate #skills-card-v2 > div:first-child span,
            .app.dialog.cheapdice-theme-slate #tools-card-v2 > div:first-child span,
            .app.dialog.cheapdice-theme-slate #section-d20 div[style*="letter-spacing: 0.5px"] {
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-slate #skills-content-v2,
            .app.dialog.cheapdice-theme-slate #tools-list-container-v2,
            .app.dialog.cheapdice-theme-slate #section-d20 > div > div[style*="background: #fff"],
            .app.dialog.cheapdice-theme-slate #section-d20 > div > div[style*="background:#fff"] {
              background: #141924 !important;
              border-color: #273142 !important;
            }
            .app.dialog.cheapdice-theme-slate .sheet-entry-row {
              border-bottom-color: #222b3a !important;
            }
            .app.dialog.cheapdice-theme-slate .sheet-entry-row .entry-label,
            .app.dialog.cheapdice-theme-slate .entry-label {
              color: #f1f5f9 !important;
            }
            .app.dialog.cheapdice-theme-slate .roll-btn-v2 {
              background: #252f42 !important;
              border-color: #38bdf8 !important;
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-slate .standard-weapon-card {
              background: #1e2536 !important;
              border-color: #334155 !important;
            }
            .app.dialog.cheapdice-theme-slate .standard-weapon-card span,
            .app.dialog.cheapdice-theme-slate .standard-weapon-card div {
              color: #f1f5f9 !important;
            }
            /* Weapon & Spell Pane Badges & Damage Types */
            .app.dialog.cheapdice-theme-slate .custom-weapon-card span[style*="font-weight: bold; color: #555"],
            .app.dialog.cheapdice-theme-slate .standard-weapon-card div[title*="("],
            .app.dialog.cheapdice-theme-slate .spell-card-type-label,
            .app.dialog.cheapdice-theme-slate .spell-card-level-label {
              color: #93c5fd !important;
            }
            .app.dialog.cheapdice-theme-slate .spell-card-title {
              color: #f1f5f9 !important;
            }
            .app.dialog.cheapdice-theme-slate .spell-group-header span {
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-slate .spell-group-header[data-group="fav"] span {
              color: #fbbf24 !important;
            }
            .app.dialog.cheapdice-theme-slate .quick-roll-spell-btn {
              color: #38bdf8 !important;
              border-color: #38bdf8 !important;
              background: #252f42 !important;
            }
            .app.dialog.cheapdice-theme-slate .weapon-card-atk-line,
            .app.dialog.cheapdice-theme-slate .weapon-card-atk-line *,
            .app.dialog.cheapdice-theme-slate .weapon-card-atk-val {
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-slate .weapon-card-dmg-line,
            .app.dialog.cheapdice-theme-slate .weapon-card-dmg-line *,
            .app.dialog.cheapdice-theme-slate .weapon-card-dmg-val {
              color: #93c5fd !important;
            }
            .app.dialog.cheapdice-theme-slate span[style*="background: rgba(114, 137, 218"],
            .app.dialog.cheapdice-theme-slate span[title*="Assigned to HUD"] {
              color: #7dd3fc !important;
              background: rgba(56, 189, 248, 0.12) !important;
              border-color: rgba(56, 189, 248, 0.3) !important;
            }
            .app.dialog.cheapdice-theme-slate .standard-weapon-card.selected,
            .app.dialog.cheapdice-theme-slate .custom-weapon-card.selected,
            .app.dialog.cheapdice-theme-slate .custom-spell-card.selected {
              background: #1e293b !important;
              border-color: #38bdf8 !important;
              box-shadow: 0 0 8px rgba(56, 189, 248, 0.25) !important;
            }
            /* Weapon Overview Headers & Labels */
            .app.dialog.cheapdice-theme-slate #dialog-panel-right > div,
            .app.dialog.cheapdice-theme-slate #dialog-panel-right div[style*="background: #f8fafc"],
            .app.dialog.cheapdice-theme-slate #dialog-panel-right div[style*="background:#f8fafc"] {
              background: #1b212f !important;
              border-color: #2e3b52 !important;
              color: #e2e8f0 !important;
            }
            .app.dialog.cheapdice-theme-slate #dialog-panel-right div[style*="Attack & Damage Overview"] {
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-slate #dialog-panel-right div[style*="font-weight: 700; font-size: 0.68em"],
            .app.dialog.cheapdice-theme-slate #dialog-panel-right div[style*="font-weight: 700; font-size: 0.78em"],
            .app.dialog.cheapdice-theme-slate #dialog-panel-right span[style*="HUD ACTION"],
            .app.dialog.cheapdice-theme-slate #dialog-panel-right label[for^="weapon-extra"],
            .app.dialog.cheapdice-theme-slate #dialog-panel-right label[for^="spell-extra"] {
              color: #7dd3fc !important;
            }
            .app.dialog.cheapdice-theme-slate .btn-spell-subtab {
              background: #1b212f !important;
              color: #94a3b8 !important;
              border-color: #334155 !important;
            }
            .app.dialog.cheapdice-theme-slate .btn-spell-subtab.active-subtab {
              background: #252f42 !important;
              color: #38bdf8 !important;
              border-color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-slate .btn-toggle-slot-mode {
              background: #1b212f !important;
              color: #94a3b8 !important;
              border-color: #334155 !important;
            }
            .app.dialog.cheapdice-theme-slate .btn-toggle-slot-mode.active-slot-mode {
              background: #252f42 !important;
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-slate #dialog-panel-right span[style*="color: #555"] {
              color: #94a3b8 !important;
            }
            /* Optional Damage Components Card */
            .app.dialog.cheapdice-theme-slate #weapon-extras-scroll label {
              background: #0f131c !important;
              border-color: #334155 !important;
              color: #f1f5f9 !important;
            }
            .app.dialog.cheapdice-theme-slate #weapon-extras-scroll label span,
            .app.dialog.cheapdice-theme-slate #weapon-extras-scroll label strong {
              color: #f1f5f9 !important;
            }
            .app.dialog.cheapdice-theme-slate #weapon-extras-scroll label small {
              color: #94a3b8 !important;
            }
            .app.dialog.cheapdice-theme-slate #desc-title-v2 {
              color: #f8fafc !important;
            }
            .app.dialog.cheapdice-theme-slate #desc-subtitle-v2 {
              color: #94a3b8 !important;
            }
            .app.dialog.cheapdice-theme-slate #desc-body-v2 {
              color: #e2e8f0 !important;
            }
            /* Slate: Spell Description Content (Inspector right-panel only) */
            .app.dialog.cheapdice-theme-slate #dialog-panel-right .spell-description-content,
            .app.dialog.cheapdice-theme-slate #dialog-panel-right .spell-description-content * {
              color: #f8fafc !important;
            }
            .app.dialog.cheapdice-theme-slate #dialog-panel-right .btn-send-spell-desc-chat {
              background: #1e293b !important;
              border-color: #3b4b66 !important;
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-slate input,
            .app.dialog.cheapdice-theme-slate select,
            .app.dialog.cheapdice-theme-slate textarea {
              background: #0f131c !important;
              color: #f8fafc !important;
              border: 1px solid #334155 !important;
            }
            .app.dialog.cheapdice-theme-slate button {
              background: #232c3d !important;
              color: #f1f5f9 !important;
              border-color: #3b4b66 !important;
            }
            .app.dialog.cheapdice-theme-slate button:hover {
              background: #2e3a50 !important;
              border-color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-slate strong,
            .app.dialog.cheapdice-theme-slate span[style*="color: #2b3a4a"],
            .app.dialog.cheapdice-theme-slate span[style*="color:#2b3a4a"] {
              color: #f1f5f9 !important;
            }

            /* ========================================================= */
            /* 2. ARCANE MIDNIGHT THEME                                  */
            /* ========================================================= */
            .app.dialog.cheapdice-theme-arcane {
              background: #121216 !important;
              border: 1px solid #854d0e !important;
              box-shadow: 0 10px 30px rgba(0, 0, 0, 0.85), 0 0 10px rgba(217, 119, 6, 0.15) !important;
              color: #e5e5e5;
              transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
            }
            .app.dialog.cheapdice-theme-arcane .sheet-entry-row[data-key="init"] {
              background: rgba(217, 119, 6, 0.15) !important;
              border-color: rgba(217, 119, 6, 0.4) !important;
            }
            .app.dialog.cheapdice-theme-arcane .sheet-entry-row[data-key="init"] .entry-label {
              color: #fbbf24 !important;
            }
            .app.dialog.cheapdice-theme-arcane .sheet-entry-row[data-key="concentration"] {
              background: rgba(185, 28, 28, 0.18) !important;
              border-color: rgba(185, 28, 28, 0.45) !important;
            }
            .app.dialog.cheapdice-theme-arcane .sheet-entry-row[data-key="concentration"] .entry-label {
              color: #f87171 !important;
            }
            .app.dialog.cheapdice-theme-arcane .tracking-chip {
              background: rgba(0, 0, 0, 0.4) !important;
              border-color: rgba(120, 53, 15, 0.4) !important;
            }
            .app.dialog.cheapdice-theme-arcane .tracking-chip span {
              color: #fef3c7 !important;
            }
            .app.dialog.cheapdice-theme-arcane .chip-val-input {
              background: #0d0c0f !important;
              color: #fbbf24 !important;
              border-color: #78350f !important;
            }
            .app.dialog.cheapdice-theme-arcane .btn-chip-dec,
            .app.dialog.cheapdice-theme-arcane .btn-chip-inc {
              background: #252026 !important;
              border: 1px solid #d97706 !important;
              color: #fbbf24 !important;
              font-weight: 800 !important;
            }
            .app.dialog.cheapdice-theme-arcane #inspector-d20 label,
            .app.dialog.cheapdice-theme-arcane #inspector-d20 label span {
              color: #fef3c7 !important;
            }
            .app.dialog.cheapdice-theme-arcane .window-header {
              background: #1b171f !important;
              border-bottom: 1px solid #78350f !important;
              color: #fef3c7 !important;
            }
            .app.dialog.cheapdice-theme-arcane .window-content {
              background: #121216 !important;
              color: #e5e5e5 !important;
            }
            .app.dialog.cheapdice-theme-arcane #dialog-panel-left,
            .app.dialog.cheapdice-theme-arcane #dialog-panel-center {
              border-right-color: #2e2624 !important;
            }
            .app.dialog.cheapdice-theme-arcane #tracking-stuff-wrapper,
            .app.dialog.cheapdice-theme-arcane .custom-weapon-card,
            .app.dialog.cheapdice-theme-arcane .custom-spell-card,
            .app.dialog.cheapdice-theme-arcane .standard-weapon-card,
            .app.dialog.cheapdice-theme-arcane #section-d20 > div {
              background: #1c1a21 !important;
              border-color: #38312e !important;
              color: #fef3c7 !important;
            }
            .app.dialog.cheapdice-theme-arcane #tracking-stuff-wrapper span[style*="Tracking Stuff"],
            .app.dialog.cheapdice-theme-arcane #tracking-stuff-wrapper div[style*="Tracking Stuff"] {
              color: #fbbf24 !important;
            }
            .app.dialog.cheapdice-theme-arcane #tracking-stuff-wrapper span[style*="color: #4b5d88"],
            .app.dialog.cheapdice-theme-arcane #tracking-stuff-wrapper strong[style*="color: #4b5d88"] {
              color: #fef3c7 !important;
            }
            .app.dialog.cheapdice-theme-arcane #skills-card-v2 > div:first-child span,
            .app.dialog.cheapdice-theme-arcane #tools-card-v2 > div:first-child span,
            .app.dialog.cheapdice-theme-arcane #section-d20 div[style*="letter-spacing: 0.5px"] {
              color: #fbbf24 !important;
            }
            .app.dialog.cheapdice-theme-arcane #skills-content-v2,
            .app.dialog.cheapdice-theme-arcane #tools-list-container-v2,
            .app.dialog.cheapdice-theme-arcane #section-d20 > div > div[style*="background: #fff"],
            .app.dialog.cheapdice-theme-arcane #section-d20 > div > div[style*="background:#fff"] {
              background: #141318 !important;
              border-color: #38312e !important;
            }
            .app.dialog.cheapdice-theme-arcane .sheet-entry-row {
              border-bottom-color: #28242c !important;
            }
            .app.dialog.cheapdice-theme-arcane .sheet-entry-row .entry-label,
            .app.dialog.cheapdice-theme-arcane .entry-label {
              color: #fef3c7 !important;
            }
            .app.dialog.cheapdice-theme-arcane .roll-btn-v2 {
              background: #252026 !important;
              border-color: #d97706 !important;
              color: #fbbf24 !important;
            }
            .app.dialog.cheapdice-theme-arcane .standard-weapon-card {
              background: #1f1b24 !important;
              border-color: #78350f !important;
            }
            .app.dialog.cheapdice-theme-arcane .standard-weapon-card span,
            .app.dialog.cheapdice-theme-arcane .standard-weapon-card div {
              color: #fef3c7 !important;
            }
            /* Arcane Weapon & Spell Selector Atk, Dmg, and Badges */
            .app.dialog.cheapdice-theme-arcane .spell-card-title {
              color: #fef3c7 !important;
            }
            .app.dialog.cheapdice-theme-arcane .spell-card-type-label,
            .app.dialog.cheapdice-theme-arcane .spell-card-level-label {
              color: #fbbf24 !important;
            }
            .app.dialog.cheapdice-theme-arcane .spell-group-header span {
              color: #fbbf24 !important;
            }
            .app.dialog.cheapdice-theme-arcane .spell-group-header[data-group="fav"] span {
              color: #f59e0b !important;
            }
            .app.dialog.cheapdice-theme-arcane .weapon-card-atk-line,
            .app.dialog.cheapdice-theme-arcane .weapon-card-atk-line *,
            .app.dialog.cheapdice-theme-arcane .weapon-card-atk-val,
            .app.dialog.cheapdice-theme-arcane .quick-roll-weapon-btn {
              color: #fbbf24 !important;
              border-color: #d97706 !important;
              background: #252026 !important;
            }
            .app.dialog.cheapdice-theme-arcane .weapon-card-dmg-line,
            .app.dialog.cheapdice-theme-arcane .weapon-card-dmg-line *,
            .app.dialog.cheapdice-theme-arcane .weapon-card-dmg-val {
              color: #f87171 !important;
            }
            .app.dialog.cheapdice-theme-arcane span[style*="background: rgba(114, 137, 218"],
            .app.dialog.cheapdice-theme-arcane span[title*="Assigned to HUD"] {
              color: #fef3c7 !important;
              background: rgba(120, 53, 15, 0.4) !important;
              border-color: rgba(217, 119, 6, 0.35) !important;
            }
            .app.dialog.cheapdice-theme-arcane .quick-roll-spell-btn {
              color: #fbbf24 !important;
              border-color: #d97706 !important;
              background: #252026 !important;
            }
            .app.dialog.cheapdice-theme-arcane .standard-weapon-card.selected,
            .app.dialog.cheapdice-theme-arcane .custom-weapon-card.selected,
            .app.dialog.cheapdice-theme-arcane .custom-spell-card.selected {
              background: #252026 !important;
              border-color: #d97706 !important;
              box-shadow: 0 0 8px rgba(217, 119, 6, 0.3) !important;
            }
            .app.dialog.cheapdice-theme-arcane #dialog-panel-right > div,
            .app.dialog.cheapdice-theme-arcane #dialog-panel-right div[style*="background: #f8fafc"],
            .app.dialog.cheapdice-theme-arcane #dialog-panel-right div[style*="background:#f8fafc"] {
              background: #1c1a21 !important;
              border-color: #38312e !important;
              color: #fef3c7 !important;
            }
            .app.dialog.cheapdice-theme-arcane #dialog-panel-right div[style*="Attack & Damage Overview"],
            .app.dialog.cheapdice-theme-arcane #dialog-panel-right div[style*="letter-spacing: 0.5px"],
            .app.dialog.cheapdice-theme-arcane #dialog-panel-right div[style*="font-weight: 700; font-size: 0.68em"],
            .app.dialog.cheapdice-theme-arcane #dialog-panel-right div[style*="font-weight: 700; font-size: 0.78em"],
            .app.dialog.cheapdice-theme-arcane #dialog-panel-right span[style*="font-weight: 700; font-size: 0.68em"],
            .app.dialog.cheapdice-theme-arcane #dialog-panel-right label[for^="spell-extra"] {
              color: #d97706 !important;
            }
            .app.dialog.cheapdice-theme-arcane .btn-spell-subtab {
              background: #141318 !important;
              color: #a8a29e !important;
              border-color: #78350f !important;
            }
            .app.dialog.cheapdice-theme-arcane .btn-spell-subtab.active-subtab {
              background: #252026 !important;
              color: #fbbf24 !important;
              border-color: #d97706 !important;
            }
            .app.dialog.cheapdice-theme-arcane .btn-toggle-slot-mode {
              background: #141318 !important;
              color: #a8a29e !important;
              border-color: #78350f !important;
            }
            .app.dialog.cheapdice-theme-arcane .btn-toggle-slot-mode.active-slot-mode {
              background: #252026 !important;
              color: #fbbf24 !important;
            }
            .app.dialog.cheapdice-theme-arcane #dialog-panel-right span[style*="color: #666"],
            .app.dialog.cheapdice-theme-arcane #dialog-panel-right small[style*="color: #666"],
            .app.dialog.cheapdice-theme-arcane #dialog-panel-right span[style*="color: #555"],
            .app.dialog.cheapdice-theme-arcane #dialog-panel-right label span {
              color: #d4cfc5 !important;
            }
            /* Optional Damage Components in Arcane */
            .app.dialog.cheapdice-theme-arcane #weapon-extras-scroll label {
              background: #141318 !important;
              border-color: #78350f !important;
              color: #fbbf24 !important;
            }
            .app.dialog.cheapdice-theme-arcane #weapon-extras-scroll label span,
            .app.dialog.cheapdice-theme-arcane #weapon-extras-scroll label strong {
              color: #fbbf24 !important;
            }
            .app.dialog.cheapdice-theme-arcane #weapon-extras-scroll label small {
              color: #d4cfc5 !important;
            }
            .app.dialog.cheapdice-theme-arcane #desc-title-v2 {
              color: #fbbf24 !important;
            }
            .app.dialog.cheapdice-theme-arcane #desc-subtitle-v2 {
              color: #d97706 !important;
            }
            .app.dialog.cheapdice-theme-arcane #desc-body-v2 {
              color: #fef3c7 !important;
            }
            /* Arcane Midnight: Spell Description Content (Inspector right-panel only) */
            .app.dialog.cheapdice-theme-arcane #dialog-panel-right .spell-description-content,
            .app.dialog.cheapdice-theme-arcane #dialog-panel-right .spell-description-content * {
              color: #fef3c7 !important;
            }
            .app.dialog.cheapdice-theme-arcane #dialog-panel-right .btn-send-spell-desc-chat {
              background: #1c1a21 !important;
              border-color: #78350f !important;
              color: #fbbf24 !important;
            }
            .app.dialog.cheapdice-theme-arcane input,
            .app.dialog.cheapdice-theme-arcane select,
            .app.dialog.cheapdice-theme-arcane textarea {
              background: #0d0c0f !important;
              color: #fef3c7 !important;
              border: 1px solid #78350f !important;
            }
            .app.dialog.cheapdice-theme-arcane button {
              background: #282124 !important;
              color: #fef3c7 !important;
              border-color: #78350f !important;
            }
            .app.dialog.cheapdice-theme-arcane button:hover {
              background: #36292b !important;
              border-color: #d97706 !important;
            }
            .app.dialog.cheapdice-theme-arcane strong,
            .app.dialog.cheapdice-theme-arcane span[style*="color: #2b3a4a"],
            .app.dialog.cheapdice-theme-arcane span[style*="color:#2b3a4a"] {
              color: #fbbf24 !important;
            }

            /* ========================================================= */
            /* 3. TACTICAL GLASS THEME                                   */
            /* ========================================================= */
            .app.dialog.cheapdice-theme-glass {
              background: rgba(15, 23, 42, 0.72) !important;
              backdrop-filter: blur(16px) !important;
              -webkit-backdrop-filter: blur(16px) !important;
              border: 1px solid rgba(255, 255, 255, 0.18) !important;
              box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5) !important;
              color: #f1f5f9;
              transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
            }
            .app.dialog.cheapdice-theme-glass .sheet-entry-row[data-key="init"] {
              background: rgba(56, 189, 248, 0.15) !important;
              border-color: rgba(56, 189, 248, 0.4) !important;
            }
            .app.dialog.cheapdice-theme-glass .sheet-entry-row[data-key="init"] .entry-label {
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-glass .sheet-entry-row[data-key="concentration"] {
              background: rgba(244, 63, 94, 0.15) !important;
              border-color: rgba(244, 63, 94, 0.4) !important;
            }
            .app.dialog.cheapdice-theme-glass .sheet-entry-row[data-key="concentration"] .entry-label {
              color: #fb7185 !important;
            }
            .app.dialog.cheapdice-theme-glass .tracking-chip {
              background: rgba(0, 0, 0, 0.3) !important;
              border-color: rgba(255, 255, 255, 0.15) !important;
            }
            .app.dialog.cheapdice-theme-glass .tracking-chip span {
              color: #ffffff !important;
            }
            .app.dialog.cheapdice-theme-glass .chip-val-input {
              background: rgba(0, 0, 0, 0.5) !important;
              color: #38bdf8 !important;
              border-color: rgba(255, 255, 255, 0.2) !important;
            }
            .app.dialog.cheapdice-theme-glass .btn-chip-dec,
            .app.dialog.cheapdice-theme-glass .btn-chip-inc {
              background: rgba(56, 189, 248, 0.25) !important;
              border: 1px solid #38bdf8 !important;
              color: #ffffff !important;
              font-weight: 800 !important;
            }
            .app.dialog.cheapdice-theme-glass #inspector-d20 label,
            .app.dialog.cheapdice-theme-glass #inspector-d20 label span {
              color: #ffffff !important;
            }
            .app.dialog.cheapdice-theme-glass #dialog-panel-right span,
            .app.dialog.cheapdice-theme-glass #dialog-panel-right strong,
            .app.dialog.cheapdice-theme-glass #dialog-panel-right div {
              color: #f1f5f9;
            }
            .app.dialog.cheapdice-theme-glass #dialog-panel-right span[style*="color: #666"],
            .app.dialog.cheapdice-theme-glass #dialog-panel-right small[style*="color: #666"] {
              color: #94a3b8 !important;
            }
            .app.dialog.cheapdice-theme-glass .window-header {
              background: rgba(15, 23, 42, 0.55) !important;
              border-bottom: 1px solid rgba(255, 255, 255, 0.12) !important;
              color: #ffffff !important;
            }
            .app.dialog.cheapdice-theme-glass .window-content {
              background: transparent !important;
              color: #f1f5f9 !important;
            }
            .app.dialog.cheapdice-theme-glass #dialog-panel-left,
            .app.dialog.cheapdice-theme-glass #dialog-panel-center {
              border-right-color: rgba(255, 255, 255, 0.12) !important;
            }
            .app.dialog.cheapdice-theme-glass #tracking-stuff-wrapper,
            .app.dialog.cheapdice-theme-glass .custom-weapon-card,
            .app.dialog.cheapdice-theme-glass .custom-spell-card,
            .app.dialog.cheapdice-theme-glass .standard-weapon-card,
            .app.dialog.cheapdice-theme-glass #section-d20 > div {
              background: rgba(255, 255, 255, 0.05) !important;
              border-color: rgba(255, 255, 255, 0.12) !important;
              color: #ffffff !important;
            }
            .app.dialog.cheapdice-theme-glass #tracking-stuff-wrapper span[style*="Tracking Stuff"],
            .app.dialog.cheapdice-theme-glass #tracking-stuff-wrapper div[style*="Tracking Stuff"] {
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-glass #tracking-stuff-wrapper span[style*="color: #4b5d88"],
            .app.dialog.cheapdice-theme-glass #tracking-stuff-wrapper strong[style*="color: #4b5d88"] {
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-glass #skills-card-v2 > div:first-child span,
            .app.dialog.cheapdice-theme-glass #tools-card-v2 > div:first-child span,
            .app.dialog.cheapdice-theme-glass #section-d20 div[style*="letter-spacing: 0.5px"] {
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-glass #skills-content-v2,
            .app.dialog.cheapdice-theme-glass #tools-list-container-v2,
            .app.dialog.cheapdice-theme-glass #section-d20 > div > div[style*="background: #fff"],
            .app.dialog.cheapdice-theme-glass #section-d20 > div > div[style*="background:#fff"] {
              background: rgba(0, 0, 0, 0.25) !important;
              border-color: rgba(255, 255, 255, 0.1) !important;
            }
            .app.dialog.cheapdice-theme-glass .sheet-entry-row {
              border-bottom-color: rgba(255, 255, 255, 0.08) !important;
            }
            .app.dialog.cheapdice-theme-glass .sheet-entry-row .entry-label,
            .app.dialog.cheapdice-theme-glass .entry-label {
              color: #ffffff !important;
            }
            .app.dialog.cheapdice-theme-glass #dialog-sidebar-left .roll-btn-v2 {
              background: rgba(56, 189, 248, 0.45) !important;
              border-color: #38bdf8 !important;
              color: #000000 !important;
              font-weight: 800 !important;
            }
            .app.dialog.cheapdice-theme-glass .roll-btn-v2 {
              background: rgba(56, 189, 248, 0.18) !important;
              border-color: #38bdf8 !important;
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-glass .standard-weapon-card {
              background: rgba(255, 255, 255, 0.06) !important;
              border-color: rgba(255, 255, 255, 0.15) !important;
            }
            .app.dialog.cheapdice-theme-glass .standard-weapon-card span,
            .app.dialog.cheapdice-theme-glass .standard-weapon-card div,
            .app.dialog.cheapdice-theme-glass #section-weapon,
            .app.dialog.cheapdice-theme-glass #section-weapon div,
            .app.dialog.cheapdice-theme-glass #section-weapon span,
            .app.dialog.cheapdice-theme-glass #section-weapon strong,
            .app.dialog.cheapdice-theme-glass #section-spell,
            .app.dialog.cheapdice-theme-glass #section-spell div,
            .app.dialog.cheapdice-theme-glass #section-spell span,
            .app.dialog.cheapdice-theme-glass #section-spell strong {
              color: #ffffff !important;
            }
            .app.dialog.cheapdice-theme-glass .spell-card-type-label,
            .app.dialog.cheapdice-theme-glass .spell-card-level-label {
              color: #93c5fd !important;
            }
            .app.dialog.cheapdice-theme-glass .spell-group-header span {
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-glass .spell-group-header[data-group="fav"] span {
              color: #fde047 !important;
            }
            .app.dialog.cheapdice-theme-glass .quick-roll-spell-btn {
              background: rgba(56, 189, 248, 0.25) !important;
              border-color: #38bdf8 !important;
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-glass #section-weapon .weapon-card-atk-line,
            .app.dialog.cheapdice-theme-glass #section-weapon .weapon-card-atk-line *,
            .app.dialog.cheapdice-theme-glass #section-weapon .weapon-card-atk-val,
            .app.dialog.cheapdice-theme-glass #section-spell .weapon-card-atk-line,
            .app.dialog.cheapdice-theme-glass #section-spell .weapon-card-atk-line * {
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-glass #section-weapon .weapon-card-dmg-line,
            .app.dialog.cheapdice-theme-glass #section-weapon .weapon-card-dmg-line *,
            .app.dialog.cheapdice-theme-glass #section-weapon .weapon-card-dmg-val,
            .app.dialog.cheapdice-theme-glass #section-spell .weapon-card-dmg-line,
            .app.dialog.cheapdice-theme-glass #section-spell .weapon-card-dmg-line *,
            .app.dialog.cheapdice-theme-glass #section-spell .weapon-card-dmg-val {
              color: #93c5fd !important;
            }
            .app.dialog.cheapdice-theme-glass .custom-weapon-card,
            .app.dialog.cheapdice-theme-glass .custom-spell-card {
              background: rgba(255, 255, 255, 0.06) !important;
              border-color: rgba(255, 255, 255, 0.15) !important;
            }
            .app.dialog.cheapdice-theme-glass .custom-weapon-card span,
            .app.dialog.cheapdice-theme-glass .custom-weapon-card div,
            .app.dialog.cheapdice-theme-glass .custom-weapon-card strong,
            .app.dialog.cheapdice-theme-glass .custom-spell-card span,
            .app.dialog.cheapdice-theme-glass .custom-spell-card div,
            .app.dialog.cheapdice-theme-glass .custom-spell-card strong {
              color: #ffffff !important;
            }
            .app.dialog.cheapdice-theme-glass .standard-weapon-card.selected,
            .app.dialog.cheapdice-theme-glass .custom-weapon-card.selected,
            .app.dialog.cheapdice-theme-glass .custom-spell-card.selected {
              background: rgba(56, 189, 248, 0.18) !important;
              border-color: #38bdf8 !important;
              box-shadow: 0 0 12px rgba(56, 189, 248, 0.3) !important;
            }
            .app.dialog.cheapdice-theme-glass #dialog-panel-right > div,
            .app.dialog.cheapdice-theme-glass #dialog-panel-right div[style*="background: #f8fafc"],
            .app.dialog.cheapdice-theme-glass #dialog-panel-right div[style*="background:#f8fafc"] {
              background: rgba(255, 255, 255, 0.05) !important;
              border-color: rgba(255, 255, 255, 0.12) !important;
              color: #93c5fd !important;
            }
            .app.dialog.cheapdice-theme-glass #dialog-panel-right span,
            .app.dialog.cheapdice-theme-glass #dialog-panel-right div,
            .app.dialog.cheapdice-theme-glass #dialog-panel-right label {
              color: #93c5fd !important;
            }
            .app.dialog.cheapdice-theme-glass #dialog-panel-right strong,
            .app.dialog.cheapdice-theme-glass #preview-total-atk,
            .app.dialog.cheapdice-theme-glass #preview-total-dmg {
              color: #ffffff !important;
            }
            .app.dialog.cheapdice-theme-glass #preview-total-dmg {
              background: rgba(0, 0, 0, 0.35) !important;
              border-color: rgba(255, 255, 255, 0.18) !important;
            }
            .app.dialog.cheapdice-theme-glass #desc-title-v2 {
              color: #ffffff !important;
            }
            .app.dialog.cheapdice-theme-glass #desc-subtitle-v2 {
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-glass #desc-body-v2 {
              color: #f1f5f9 !important;
            }
            .app.dialog.cheapdice-theme-glass input,
            .app.dialog.cheapdice-theme-glass select,
            .app.dialog.cheapdice-theme-glass textarea {
              background: rgba(0, 0, 0, 0.4) !important;
              color: #ffffff !important;
              border: 1px solid rgba(255, 255, 255, 0.2) !important;
            }
            .app.dialog.cheapdice-theme-glass button {
              background: rgba(255, 255, 255, 0.08) !important;
              color: #ffffff !important;
              border-color: rgba(255, 255, 255, 0.18) !important;
            }
            .app.dialog.cheapdice-theme-glass button:hover {
              background: rgba(56, 189, 248, 0.25) !important;
              border-color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-glass .btn-spell-subtab {
              background: rgba(255, 255, 255, 0.06) !important;
              color: #94a3b8 !important;
              border-color: rgba(255, 255, 255, 0.15) !important;
            }
            .app.dialog.cheapdice-theme-glass .btn-spell-subtab.active-subtab {
              background: rgba(56, 189, 248, 0.22) !important;
              color: #38bdf8 !important;
              border: 1px solid #38bdf8 !important;
              border-bottom: 2px solid #38bdf8 !important;
              box-shadow: 0 0 10px rgba(56, 189, 248, 0.35) !important;
            }
            .app.dialog.cheapdice-theme-glass .btn-spell-subtab.active-subtab i {
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-glass .btn-toggle-slot-mode {
              background: rgba(255, 255, 255, 0.06) !important;
              color: #94a3b8 !important;
              border-color: rgba(255, 255, 255, 0.15) !important;
            }
            .app.dialog.cheapdice-theme-glass .btn-toggle-slot-mode.active-slot-mode {
              background: rgba(56, 189, 248, 0.25) !important;
              color: #38bdf8 !important;
              box-shadow: 0 0 8px rgba(56, 189, 248, 0.35) !important;
            }
            .app.dialog.cheapdice-theme-glass span[style*="background: rgba(114, 137, 218"] {
              color: #38bdf8 !important;
              background: rgba(56, 189, 248, 0.15) !important;
              border-color: rgba(56, 189, 248, 0.35) !important;
            }
            .app.dialog.cheapdice-theme-glass span[title*="Assigned to HUD"] {
              color: #38bdf8 !important;
              background: rgba(15, 23, 42, 0.75) !important;
              border: 1px solid rgba(56, 189, 248, 0.6) !important;
            }
            .app.dialog.cheapdice-theme-glass span[title*="Assigned to HUD"] i {
              color: #ffffff !important;
            }
            .app.dialog.cheapdice-theme-glass #weapon-extras-scroll label {
              background: rgba(0, 0, 0, 0.35) !important;
              border-color: rgba(255, 255, 255, 0.15) !important;
              color: #ffffff !important;
            }
            .app.dialog.cheapdice-theme-glass #weapon-extras-scroll label span,
            .app.dialog.cheapdice-theme-glass #weapon-extras-scroll label strong {
              color: #ffffff !important;
            }
            .app.dialog.cheapdice-theme-glass #weapon-extras-scroll label small {
              color: #94a3b8 !important;
            }
            .app.dialog.cheapdice-theme-glass strong,
            .app.dialog.cheapdice-theme-glass span[style*="color: #2b3a4a"],
            .app.dialog.cheapdice-theme-glass span[style*="color:#2b3a4a"] {
              color: #ffffff !important;
            }

            /* --- Right-Side Action Tabs Styles --- */
            .app.dialog.minimized .dice-stuff-side-tabs {
              display: none !important;
            }
            .app.dialog .dice-stuff-side-tab-btn {
              width: 34px;
              height: 34px;
              padding: 0;
              margin: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              border: 1px solid #c0c6ce;
              border-left: none;
              border-radius: 0 6px 6px 0;
              background: url("/ui/parchment.jpg") repeat, #fbf7ef;
              color: #2b3a4a;
              cursor: pointer;
              box-shadow: 2px 2px 5px rgba(0,0,0,0.2);
              font-size: 15px;
              transition: transform 0.1s ease, background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
            }
            .app.dialog .dice-stuff-side-tab-btn.tab-empty {
              color: #8c97a7;
              opacity: 0.85;
            }
            .app.dialog .dice-stuff-side-tab-btn:hover {
              background: #f0f4ff;
              color: #7289da;
              border-color: #7289da;
              transform: translateX(2px);
              opacity: 1;
            }

            /* Tactical Glass Side Tabs */
            .app.dialog.cheapdice-theme-glass .dice-stuff-side-tab-btn {
              background: rgba(15, 23, 42, 0.72) !important;
              backdrop-filter: blur(16px) !important;
              -webkit-backdrop-filter: blur(16px) !important;
              border: 1px solid rgba(255, 255, 255, 0.18) !important;
              border-left: none !important;
              color: #e0e7ff !important;
              box-shadow: 2px 4px 12px rgba(0, 0, 0, 0.5) !important;
            }
            .app.dialog.cheapdice-theme-glass .dice-stuff-side-tab-btn.tab-empty {
              color: #64748b !important;
              opacity: 0.75;
            }
            .app.dialog.cheapdice-theme-glass .dice-stuff-side-tab-btn:hover {
              background: rgba(56, 189, 248, 0.25) !important;
              border-color: #38bdf8 !important;
              color: #38bdf8 !important;
              transform: translateX(2px);
              opacity: 1;
            }

            /* Slate & Obsidian Side Tabs */
            .app.dialog.cheapdice-theme-slate .dice-stuff-side-tab-btn {
              background: #1e293b !important;
              border: 1px solid #334155 !important;
              border-left: none !important;
              color: #e2e8f0 !important;
            }
            .app.dialog.cheapdice-theme-slate .dice-stuff-side-tab-btn.tab-empty {
              color: #64748b !important;
            }
            .app.dialog.cheapdice-theme-slate .dice-stuff-side-tab-btn:hover {
              background: #334155 !important;
              color: #38bdf8 !important;
              border-color: #38bdf8 !important;
            }

            /* Arcane Midnight Side Tabs */
            .app.dialog.cheapdice-theme-arcane .dice-stuff-side-tab-btn {
              background: #18152e !important;
              border: 1px solid #4a3e75 !important;
              border-left: none !important;
              color: #e0d8f7 !important;
            }
            .app.dialog.cheapdice-theme-arcane .dice-stuff-side-tab-btn.tab-empty {
              color: #7c729c !important;
            }
            .app.dialog.cheapdice-theme-arcane .dice-stuff-side-tab-btn:hover {
              background: #2a2347 !important;
              color: #a78bfa !important;
              border-color: #a78bfa !important;
            }

            /* --- Side Dice Tray Flyout Styles --- */
            .app.dialog .dice-stuff-flyout-tray {
              position: absolute;
              top: 0;
              left: 40px;
              width: 58px;
              background: url("/ui/parchment.jpg") repeat, #fbf7ef;
              border: 1px solid #c0c6ce;
              border-radius: 6px;
              box-shadow: 3px 4px 12px rgba(0,0,0,0.3);
              padding: 5px 4px;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 4px;
              z-index: 105;
              box-sizing: border-box;
            }
            .app.dialog .dice-stuff-flyout-tray button {
              margin: 0;
              padding: 0;
              cursor: pointer;
              box-sizing: border-box;
            }
            .app.dialog .dice-stuff-flyout-die-btn {
              position: relative;
              width: 44px;
              height: 28px;
              font-size: 0.82em;
              font-weight: 700;
              background: #fff;
              border: 1px solid #b0b8c4;
              border-radius: 4px;
              color: #2b3a4a;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: background 0.1s ease, border-color 0.1s ease;
            }
            .app.dialog .dice-stuff-flyout-die-btn:hover {
              background: #f0f4ff;
              border-color: #7289da;
              color: #7289da;
            }
            .app.dialog .dice-stuff-flyout-badge {
              position: absolute;
              top: -4px;
              right: -4px;
              background: #e03e3e;
              color: #fff;
              font-size: 0.72em;
              font-weight: 800;
              min-width: 15px;
              height: 15px;
              line-height: 15px;
              border-radius: 8px;
              padding: 0 2px;
              text-align: center;
              box-shadow: 0 1px 3px rgba(0,0,0,0.3);
              pointer-events: none;
            }
            .app.dialog .dice-stuff-flyout-mode-btn {
              width: 46px;
              height: 22px;
              font-size: 0.72em;
              font-weight: 800;
              border-radius: 3px;
              border: 1px solid #7289da;
              background: #eef2ff;
              color: #4338ca;
              display: flex;
              align-items: center;
              justify-content: center;
              text-transform: uppercase;
              letter-spacing: 0.3px;
            }
            .app.dialog .dice-stuff-flyout-mode-btn.mode-adv {
              background: #ecfdf5;
              border-color: #059669;
              color: #047857;
            }
            .app.dialog .dice-stuff-flyout-mode-btn.mode-dis {
              background: #fef2f2;
              border-color: #dc2626;
              color: #b91c1c;
            }
            .app.dialog .dice-stuff-flyout-roll-btn {
              width: 46px;
              height: 26px;
              font-size: 0.78em;
              font-weight: 800;
              background: #2563eb;
              border: 1px solid #1d4ed8;
              color: #fff;
              border-radius: 4px;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 3px;
              box-shadow: 0 1px 2px rgba(0,0,0,0.15);
            }
            .app.dialog .dice-stuff-flyout-roll-btn:hover {
              background: #1d4ed8;
            }
            .app.dialog .dice-stuff-flyout-clear-btn {
              width: 46px;
              height: 20px;
              font-size: 0.75em;
              font-weight: 700;
              background: #f1f5f9;
              border: 1px solid #cbd5e1;
              color: #64748b;
              border-radius: 3px;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .app.dialog .dice-stuff-flyout-clear-btn:hover {
              background: #fee2e2;
              border-color: #f87171;
              color: #dc2626;
            }

            /* Tactical Glass Flyout */
            .app.dialog.cheapdice-theme-glass .dice-stuff-flyout-tray {
              background: rgba(15, 23, 42, 0.88) !important;
              backdrop-filter: blur(16px) !important;
              -webkit-backdrop-filter: blur(16px) !important;
              border: 1px solid rgba(255, 255, 255, 0.18) !important;
              box-shadow: 4px 6px 18px rgba(0, 0, 0, 0.6) !important;
            }
            .app.dialog.cheapdice-theme-glass .dice-stuff-flyout-die-btn {
              background: rgba(255, 255, 255, 0.08) !important;
              border: 1px solid rgba(255, 255, 255, 0.15) !important;
              color: #e0e7ff !important;
            }
            .app.dialog.cheapdice-theme-glass .dice-stuff-flyout-die-btn:hover {
              background: rgba(56, 189, 248, 0.25) !important;
              border-color: #38bdf8 !important;
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-glass .dice-stuff-flyout-clear-btn {
              background: rgba(255, 255, 255, 0.05) !important;
              border-color: rgba(255, 255, 255, 0.15) !important;
              color: #94a3b8 !important;
            }

            /* Slate Flyout */
            .app.dialog.cheapdice-theme-slate .dice-stuff-flyout-tray {
              background: #1e293b !important;
              border: 1px solid #334155 !important;
            }
            .app.dialog.cheapdice-theme-slate .dice-stuff-flyout-die-btn {
              background: #0f172a !important;
              border: 1px solid #334155 !important;
              color: #e2e8f0 !important;
            }
            .app.dialog.cheapdice-theme-slate .dice-stuff-flyout-die-btn:hover {
              background: #1e293b !important;
              border-color: #38bdf8 !important;
              color: #38bdf8 !important;
            }
            .app.dialog.cheapdice-theme-slate .dice-stuff-flyout-clear-btn {
              background: #0f172a !important;
              border-color: #334155 !important;
              color: #94a3b8 !important;
            }

            /* Arcane Midnight Flyout */
            .app.dialog.cheapdice-theme-arcane .dice-stuff-flyout-tray {
              background: #18152e !important;
              border: 1px solid #4a3e75 !important;
            }
            .app.dialog.cheapdice-theme-arcane .dice-stuff-flyout-die-btn {
              background: #100d20 !important;
              border: 1px solid #3b3060 !important;
              color: #e0d8f7 !important;
            }
            .app.dialog.cheapdice-theme-arcane .dice-stuff-flyout-die-btn:hover {
              background: #231c3e !important;
              border-color: #a78bfa !important;
              color: #a78bfa !important;
            }
            .app.dialog.cheapdice-theme-arcane .dice-stuff-flyout-clear-btn {
              background: #100d20 !important;
              border-color: #3b3060 !important;
              color: #7c729c !important;
            }

            /* Spell Filter Bar Themes */
            .app.dialog.cheapdice-theme-arcane #spell-filter-bar {
              border-bottom-color: #38312e !important;
            }
            .app.dialog.cheapdice-theme-arcane .btn-spell-filter {
              background: #1c1a21 !important;
              border-color: #38312e !important;
              color: #fef3c7 !important;
            }
            .app.dialog.cheapdice-theme-arcane .btn-spell-filter[data-filter="fav"] i {
              color: #7c729c !important;
            }
            .app.dialog.cheapdice-theme-arcane .btn-spell-filter[data-filter="fav"][style*="box-shadow: 0 0 4px"] {
              background: #2d2417 !important;
              border-color: #d97706 !important;
              color: #fbbf24 !important;
            }
            .app.dialog.cheapdice-theme-arcane .btn-spell-filter[data-filter="fav"][style*="box-shadow: 0 0 4px"] i {
              color: #f59e0b !important;
            }
            .app.dialog.cheapdice-theme-arcane .btn-spell-filter[style*="box-shadow: 0 0 4px rgba(114"] {
              background: #2a2347 !important;
              border-color: #a78bfa !important;
              color: #e0d8f7 !important;
            }

            .app.dialog.cheapdice-theme-glass #spell-filter-bar {
              border-bottom-color: rgba(255, 255, 255, 0.12) !important;
            }
            .app.dialog.cheapdice-theme-glass .btn-spell-filter {
              background: rgba(255, 255, 255, 0.06) !important;
              border-color: rgba(255, 255, 255, 0.15) !important;
              color: #ffffff !important;
            }
            .app.dialog.cheapdice-theme-glass .btn-spell-filter[data-filter="fav"] i {
              color: #94a3b8 !important;
            }
            .app.dialog.cheapdice-theme-glass .btn-spell-filter[data-filter="fav"][style*="box-shadow: 0 0 4px"] {
              background: rgba(245, 158, 11, 0.25) !important;
              border-color: #f59e0b !important;
              color: #fef3c7 !important;
            }
            .app.dialog.cheapdice-theme-glass .btn-spell-filter[data-filter="fav"][style*="box-shadow: 0 0 4px"] i {
              color: #fbbf24 !important;
            }
            .app.dialog.cheapdice-theme-glass .btn-spell-filter[style*="box-shadow: 0 0 4px rgba(114"] {
              background: rgba(56, 189, 248, 0.25) !important;
              border-color: #38bdf8 !important;
              color: #38bdf8 !important;
            }

            .app.dialog.cheapdice-theme-slate .btn-spell-filter,
            .app.dialog.cheapdice-theme-obsidian .btn-spell-filter {
              background: #1e293b !important;
              border-color: #334155 !important;
              color: #e2e8f0 !important;
            }
            .app.dialog.cheapdice-theme-slate .btn-spell-filter[data-filter="fav"][style*="box-shadow: 0 0 4px"],
            .app.dialog.cheapdice-theme-obsidian .btn-spell-filter[data-filter="fav"][style*="box-shadow: 0 0 4px"] {
              background: #451a03 !important;
              border-color: #d97706 !important;
              color: #fbbf24 !important;
            }
            .app.dialog.cheapdice-theme-slate .btn-spell-filter[style*="box-shadow: 0 0 4px rgba(114"],
            .app.dialog.cheapdice-theme-obsidian .btn-spell-filter[style*="box-shadow: 0 0 4px rgba(114"] {
              background: #1e3a8a !important;
              border-color: #60a5fa !important;
              color: #93c5fd !important;
            }
          `;
          document.head.appendChild(styleTag);
        }

        // Header Theme Button Injection (Works reliably with window dragging)
        const header = dialogApp.find(".window-header");
        let themeBtnElem = null;
        if (header.find(".dice-stuff-theme-btn").length === 0) {
          const currentThemeObj = THEMES.find(t => t.key === savedTheme) || THEMES[0];
          themeBtnElem = $(`
            <a class="header-button dice-stuff-theme-btn" title="Current Theme: ${currentThemeObj.label} (Click to switch)" style="cursor: pointer; margin-right: 4px;">
              <i class="fas fa-palette"></i> <span class="theme-label-text">${currentThemeObj.label}</span>
            </a>
          `);

          themeBtnElem.on("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const cur = localStorage.getItem(THEME_STORAGE_KEY) || "default";
            new Dialog({
              title: "Choose Dice Stuff Theme",
              content: `
                <div style="display: flex; flex-direction: column; gap: 6px; padding: 6px 2px;">
                  <button type="button" class="btn-select-theme ${cur === 'default' ? 'active-theme' : ''}" data-theme="default" style="height: 32px; font-weight: 700; font-size: 0.85em; border: 1px solid #c0c6ce; background: ${cur === 'default' ? '#e2e8f0' : '#fff'}; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: flex-start; padding: 0 12px;">
                    Default (Foundry Standard)
                  </button>
                  <button type="button" class="btn-select-theme ${cur === 'slate' ? 'active-theme' : ''}" data-theme="slate" style="height: 32px; font-weight: 700; font-size: 0.85em; border: 1px solid #334155; background: ${cur === 'slate' ? '#1e293b' : '#0f172a'}; color: #f8fafc; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: flex-start; padding: 0 12px;">
                    Slate & Obsidian
                  </button>
                  <button type="button" class="btn-select-theme ${cur === 'arcane' ? 'active-theme' : ''}" data-theme="arcane" style="height: 32px; font-weight: 700; font-size: 0.85em; border: 1px solid #78350f; background: ${cur === 'arcane' ? '#252026' : '#121216'}; color: #fef3c7; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: flex-start; padding: 0 12px;">
                    Arcane Midnight
                  </button>
                  <button type="button" class="btn-select-theme ${cur === 'glass' ? 'active-theme' : ''}" data-theme="glass" style="height: 32px; font-weight: 700; font-size: 0.85em; border: 1px solid rgba(255,255,255,0.2); background: ${cur === 'glass' ? 'rgba(56,189,248,0.2)' : 'rgba(15,23,42,0.9)'}; color: #ffffff; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: flex-start; padding: 0 12px;">
                    Tactical Glass
                  </button>
                </div>
              `,
              buttons: {
                close: { label: "Cancel" }
              },
              default: "close",
              render: (themeHtml) => {
                themeHtml.find(".btn-select-theme").on("click", function() {
                  const selectedKey = $(this).data("theme");
                  applyTheme(selectedKey);
                  const matched = THEMES.find(t => t.key === selectedKey) || THEMES[0];
                  themeBtnElem.find(".theme-label-text").text(matched.label);
                  themeBtnElem.attr("title", `Current Theme: ${matched.label} (Click to switch)`);
                  themeHtml.closest(".dialog").find(".dialog-buttons button").trigger("click");
                });
              }
            }, { width: 260 }).render(true);
          });
        }

        // Header Refresh Button Injection (Directly before Close button)
        let refreshBtnElem = null;
        if (header.find(".dice-stuff-refresh-btn").length === 0) {
          refreshBtnElem = $(`
            <a class="header-button dice-stuff-refresh-btn" title="Refresh Dice Stuff" style="cursor: pointer; margin-right: 4px;">
              <i class="fas fa-sync-alt"></i> <span class="refresh-label-text">Refresh</span>
            </a>
          `);

          refreshBtnElem.on("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Run spell synchronization check with confirmation dialog
            try {
              await syncSpellsWithSheet(actor, { promptUser: true });
            } catch (err) {
              console.error("[Dice Stuff] Error during spell synchronization:", err);
            }

            dlg.close();
            await window.CustomRolls.openActionDialog(currentMode, actor);
          });
        }

        // Header Compact Mode Toggle Button Injection
        let collapseBtnElem = null;
        if (header.find(".dice-stuff-collapse-btn").length === 0) {
          collapseBtnElem = $(`
            <a class="header-button dice-stuff-collapse-btn" title="${isInitiallyCompact ? 'Expand to Full View' : 'Collapse to Compact View'}" style="cursor: pointer; margin-right: 4px;">
              <i class="fas ${isInitiallyCompact ? 'fa-expand-alt' : 'fa-compress-alt'}"></i> <span class="collapse-label-text">${isInitiallyCompact ? 'Expand' : 'Compact'}</span>
            </a>
          `);

          collapseBtnElem.on("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleCompactMode();
          });
        }

        // GM Tools Header Button in Dialog Title Bar
        let gmBtnElem = null;
        if (game.user.isGM && header.find(".gm-tools-header-btn").length === 0) {
          gmBtnElem = $(`
            <a class="header-button gm-tools-header-btn" title="GM Tools" style="cursor: pointer; margin-right: 4px;">
              <i class="fas fa-crown" style="color: #d97706;"></i> <span class="gm-label-text">GM Tools</span>
            </a>
          `);
          gmBtnElem.on("click", (ev) => {
            ev.preventDefault();
            new Dialog({
              title: `Dice Stuff: GM Tools (${actor.name})`,
              content: `
                <div style="display: flex; flex-direction: column; gap: 6px; padding: 6px 2px;">
                  <button type="button" id="gm-menu-presets" style="height: 30px; font-weight: 700; font-size: 0.82em; border: 1px solid #c0c6ce; background: #fff; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding: 0 10px;">
                    <i class="fas fa-sliders" style="color: #4b5d88; width: 16px;"></i> Presets
                  </button>
                  <button type="button" id="gm-menu-actions" style="height: 30px; font-weight: 700; font-size: 0.82em; border: 1px solid #c0c6ce; background: #fff; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding: 0 10px;">
                    <i class="fas fa-pen-to-square" style="color: #2b7489; width: 16px;"></i> Action Editor
                  </button>
                  <button type="button" id="gm-menu-generator" style="height: 30px; font-weight: 700; font-size: 0.82em; border: 1px solid #c0c6ce; background: #fff; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding: 0 10px;">
                    <i class="fas fa-wand-magic-sparkles" style="color: #7289da; width: 16px;"></i> Generate Actions
                  </button>
                  <button type="button" id="gm-menu-storage" style="height: 30px; font-weight: 700; font-size: 0.82em; border: 1px solid #c0c6ce; background: #fff; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding: 0 10px;">
                    <i class="fas fa-database" style="color: #d97706; width: 16px;"></i> Storage Inspector
                  </button>
                </div>
              `,
              buttons: {
                close: { label: "Close" }
              },
              default: "close",
              render: (subHtml) => {
                subHtml.find("#gm-menu-presets").on("click", () => window.CustomRolls?.openD20PresetEditorV2?.(actor));
                subHtml.find("#gm-menu-actions").on("click", () => window.CustomRolls?.openActionEditor?.("weapons", actor));
                subHtml.find("#gm-menu-generator").on("click", () => window.CustomRolls?.openActionGenerator?.(actor));
                subHtml.find("#gm-menu-storage").on("click", () => window.CustomRolls?.openStorageInspector?.());
              }
            }, { width: 260 }).render(true);
          });
        }

        // Ordered Header Button Injection:
        // Left-to-right order: [GM Tools] [Compact/Expand] [Theme] [Refresh] [Close]
        // Inserted backwards before .close:
        // 1. refreshBtn before close
        // 2. themeBtn before refreshBtn
        // 3. collapseBtn before themeBtn
        // 4. gmBtn before collapseBtn
        const closeBtnElem = header.find(".close");
        if (refreshBtnElem) closeBtnElem.before(refreshBtnElem);
        if (themeBtnElem) (header.find(".dice-stuff-refresh-btn").length ? header.find(".dice-stuff-refresh-btn") : closeBtnElem).before(themeBtnElem);
        if (collapseBtnElem) (header.find(".dice-stuff-theme-btn").length ? header.find(".dice-stuff-theme-btn") : closeBtnElem).before(collapseBtnElem);
        if (gmBtnElem) (header.find(".dice-stuff-collapse-btn").length ? header.find(".dice-stuff-collapse-btn") : closeBtnElem).before(gmBtnElem);

        const btnWeapon = html.find("#tab-btn-weapon");
        const btnSpell = html.find("#tab-btn-spell");
        const btnD20 = html.find("#tab-btn-d20");
        const secWeapon = html.find("#section-weapon");
        const secSpell = html.find("#section-spell");
        const secD20 = html.find("#section-d20");
        const inspectorD20 = html.find("#inspector-d20");
        const inspectorWeapon = html.find("#inspector-weapon");
        const inspectorSpell = html.find("#inspector-spell");

        // Initialize D20 event handlers and Tracking Stuff
        d20Data.setupEvents(html);
        trackingHelper.setupEvents(html);

        // Persistent Weapon Roll Handler (Keeps dialog open)
        html.on("click", "#btn-roll-weapon-now", async () => {
          const rawConfig = attacks[selectedWeaponKey];
          if (!rawConfig) return;
          const config = foundry.utils.duplicate(rawConfig);

          if (config.hasGWM && html.find("#gwm-toggle").is(":checked")) {
            config.attackCircumstanceModifier = (Number(config.attackCircumstanceModifier) || 0) - 5;
            config.damageModifier = (Number(config.damageModifier) || 0) + 10;
            config.chatCardTitle = `${config.chatCardTitle || selectedWeaponKey} [GWM/SS -5/+10]`;
          }

          if (config.isVersatile && html.find("#versatile-toggle").is(":checked")) {
            const vDie = config.versatileDie || "10";
            config.damageDieSize = `d${vDie}`;
            config.chatCardTitle = `${config.chatCardTitle || selectedWeaponKey} [Two-Handed 2H]`;
          }

          if (config.additionalDamageComponents) {
            html.find(".extra-dmg-toggle").each(function () {
              const idx = $(this).data("index");
              if (config.additionalDamageComponents[idx]) {
                config.additionalDamageComponents[idx].isActive = $(this).is(":checked");
              }
            });
          }

          // Pass extra attack & damage modifiers from inspector inputs
          config.extraAttackModifier = html.find("#weapon-extra-atk").val() || "";
          config.extraDamageModifier = html.find("#weapon-extra-dmg").val() || "";

          if (!globalThis.attackSocket) {
            return ui.notifications.error("SocketLib attack handler is not initialized. Please refresh the page.");
          }

          config.targetIds = Array.from(game.user.targets).map(t => t.id);

          const isUnarmed = (selectedWeaponKey || "").toLowerCase().includes("unarmed");
          if (isUnarmed) {
            const abilityMod = actor.system.abilities[config.abilityScore]?.mod || 0;
            const prof = actor.system.attributes.prof || 0;
            const wepMod = Number(config.weaponModifier) || 0;
            const circMod = Number(config.attackCircumstanceModifier) || 0;
            const saveDC = 8 + prof + abilityMod + wepMod + circMod;
            const d = getWeaponDetails(config);

            new Dialog({
              title: "Unarmed Strike (5.5e Options)",
              content: `
                <div style="padding: 6px 4px; text-align: center; font-size: 0.85em;">
                  <div style="font-weight: 700; color: #2b3a4a; margin-bottom: 6px;">Choose an option for your Unarmed Strike:</div>
                  <div style="display: flex; flex-direction: column; gap: 6px;">
                    <button type="button" id="unarmed-choice-damage" style="height: 32px; font-weight: 700; font-size: 0.85em; background: #7289da; color: #fff; border: 1px solid #5b6eae; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                      <i class="fas fa-hand-fist"></i> Damage (${d.atkSign} to hit • ${d.dmgFormula} ${d.dmgType.toLowerCase()})
                    </button>
                    <button type="button" id="unarmed-choice-grapple" style="height: 32px; font-weight: 700; font-size: 0.85em; background: #2b7489; color: #fff; border: 1px solid #1f5564; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                      <i class="fas fa-hand-holding-hand"></i> Grapple (DC ${saveDC} STR/DEX Save)
                    </button>
                    <button type="button" id="unarmed-choice-shove" style="height: 32px; font-weight: 700; font-size: 0.85em; background: #a34848; color: #fff; border: 1px solid #7c3535; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                      <i class="fas fa-person-falling"></i> Shove (DC ${saveDC} STR/DEX Save)
                    </button>
                  </div>
                  <div style="margin-top: 6px; font-size: 0.75em; color: #777;">Under 5.5e rules, target chooses Strength or Dexterity saving throw.</div>
                </div>
              `,
              buttons: {
                cancel: { label: "Cancel" }
              },
              default: "cancel",
              render: (dlgHtml) => {
                dlgHtml.find("#unarmed-choice-damage").on("click", async () => {
                  dlgHtml.closest(".dialog").find(".close").trigger("click");
                  await globalThis.attackSocket.executeAsGM("runAttackRoll", config, actor.id, game.user.id);
                });
                dlgHtml.find("#unarmed-choice-grapple").on("click", async () => {
                  dlgHtml.closest(".dialog").find(".close").trigger("click");
                  await globalThis.attackSocket.executeAsGM("runUnarmedManeuver", "grapple", config, actor.id, game.user.id);
                });
                dlgHtml.find("#unarmed-choice-shove").on("click", async () => {
                  dlgHtml.closest(".dialog").find(".close").trigger("click");
                  await globalThis.attackSocket.executeAsGM("runUnarmedManeuver", "shove", config, actor.id, game.user.id);
                });
              }
            }, { width: 320 }).render(true);
          } else {
            await globalThis.attackSocket.executeAsGM("runAttackRoll", config, actor.id, game.user.id);
          }
        });

        // Persistent Spell Cast Handler (Keeps dialog open)
        html.on("click", "#btn-cast-spell-now", async () => {
          const rawConfig = spellConfigs[selectedSpellKey];
          if (!rawConfig) return;

          const castLvl = Number(html.find("#castLevelSelect").val()) ?? Number(rawConfig.baseLevel) ?? 0;
          const { cfg: config } = getEffectiveSpellConfig(rawConfig, castLvl);

          const shouldDeduct = html.find("#deductSlotToggle").is(":checked");
          if (!shouldDeduct || castLvl === 0) {
            config.skipSlotDeduction = true;
          } else {
            const slotKey = `spell${castLvl}`;
            const currentSlotVal = Number(actor.system.spells?.[slotKey]?.value) || 0;
            if (currentSlotVal <= 0) {
              const proceed = await Dialog.confirm({
                title: "No Spell Slots Remaining",
                content: `<p><strong>${actor.name}</strong> has <strong>0</strong> Level ${castLvl} spell slots remaining. Cast anyway?</p>`
              });
              if (!proceed) return;
              config.skipSlotDeduction = true;
            }
          }

          // Handle Item / Feat charge deduction
          const chargeToggle = html.find("#deductChargeToggle");
          if (chargeToggle.length > 0 && chargeToggle.is(":checked")) {
            const chargeItemId = chargeToggle.attr("data-item-id") || chargeToggle.data("item-id") || rawConfig.itemId;
            const chargeItem = chargeItemId ? actor.items.get(chargeItemId) : null;
            const costVal = Number(html.find("#deductChargeCostInput").val());
            const chargeCost = !isNaN(costVal) && costVal > 0 ? costVal : 1;
            if (chargeItem && Number(chargeItem.system?.uses?.max) > 0) {
              const currentUses = Number(chargeItem.system.uses.value) || 0;
              if (currentUses < chargeCost) {
                const proceed = await Dialog.confirm({
                  title: "Insufficient Charges Remaining",
                  content: `<p><strong>${chargeItem.name}</strong> only has <strong>${currentUses}</strong> charges remaining (requires ${chargeCost}). Cast anyway?</p>`
                });
                if (!proceed) return;
              } else {
                config.deductChargeItemId = chargeItemId;
                config.deductChargeCost = chargeCost;
              }
            }
          }

          if (config.damageMode === "choice" && !["heal", "temp_hp", "max_hp"].includes(config.resolutionMethod)) {
            const choiceOptions = [
              "acid", "cold", "fire", "force", "lightning",
              "necrotic", "poison", "psychic", "radiant", "thunder"
            ].map(t => `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('');

            let choiceConfirmed = false;
            await new Promise((resolve) => {
              new Dialog({
                title: `${config.spellName}: Damage Type`,
                content: `<div style="padding: 6px;"><select id="chosenType" style="width:100%; height:30px;">${choiceOptions}</select></div>`,
                buttons: {
                  ok: { label: "Confirm", callback: (chHtml) => { choiceConfirmed = true; config.damageType = chHtml.find("#chosenType").val(); } },
                  cancel: { label: "Cancel" }
                },
                default: "ok",
                close: () => resolve()
              }, { width: 260 }).render(true);
            });
            if (!choiceConfirmed) return;
          }

          if (!globalThis.attackSocket) {
            return ui.notifications.error("SocketLib attack handler is not initialized. Please refresh the page.");
          }

          // Pass extra attack / DC & damage / heal modifiers from spell inspector inputs
          config.extraAttackModifier = html.find("#spell-extra-atk").val() || "";
          config.extraDamageModifier = html.find("#spell-extra-dmg").val() || "";

          config.targetIds = Array.from(game.user.targets).map(t => t.id);
          await globalThis.attackSocket.executeAsGM("runSpellAttackRoll", config, actor.id, game.user.id);

          // Live real-time refresh of spell slots, inspector, and tracking stuff after cast
          html.find("#inspector-spell").html(getSelectedSpellInspectorHtml());
          html.find("#section-spell").html(renderSpellCards());
          updateCardStyles();
          if (typeof window.CustomRolls?._refreshTrackingChips === "function") {
            window.CustomRolls._refreshTrackingChips();
          }
        });

        // Generic Spell Attack Roll Handler
        html.on("click", ".btn-spell-atk-roll", async function (e) {
          e.preventDefault();
          e.stopPropagation();
          const bonus = Number($(this).data("atk-bonus")) || 0;
          const sign = bonus >= 0 ? "+" : "-";
          const formula = bonus !== 0 ? `1d20 ${sign} ${Math.abs(bonus)}` : "1d20";
          try {
            const roll = await new Roll(formula).evaluate();
            if (game.dice3d) {
              await game.dice3d.showForRoll(roll, game.user, true);
            }
            const rollHtml = await roll.render();
            const content = `
              <div style="font-family: inherit; color: #333;">
                <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #7289da; padding-bottom: 3px; margin-bottom: 6px;">
                  <span style="font-size: 1.05em; font-weight: bold; color: #2b3a4a;"><i class="fas fa-dice-d20" style="color: #7289da; margin-right: 4px;"></i>Spell Attack Roll</span>
                  <span style="font-size: 0.8em; color: #777;">${actor.name}</span>
                </div>
                <div style="margin-top: 4px;">
                  ${rollHtml}
                </div>
              </div>
            `;
            await ChatMessage.create({
              user: game.user.id,
              speaker: ChatMessage.getSpeaker({ actor }),
              content,
              rolls: [roll],
              sound: CONFIG.sounds?.dice
            });
          } catch (err) {
            console.error("Failed to roll generic spell attack:", err);
            ui.notifications.error("Failed to execute spell attack roll.");
          }
        });

        // Generic Spell Save DC Chat Card Handler
        html.on("click", ".btn-spell-dc-card", async function (e) {
          e.preventDefault();
          e.stopPropagation();
          const dc = $(this).data("save-dc") || 10;
          const abilities = [
            { key: "str", label: "STR", name: "Strength" },
            { key: "dex", label: "DEX", name: "Dexterity" },
            { key: "con", label: "CON", name: "Constitution" },
            { key: "int", label: "INT", name: "Intelligence" },
            { key: "wis", label: "WIS", name: "Wisdom" },
            { key: "cha", label: "CHA", name: "Charisma" }
          ];

          const saveButtonsHtml = abilities.map(a => {
            return `
              <button type="button" class="cheapdice-dc-save-btn" data-ability="${a.key}" style="flex: 1 1 calc(33.333% - 6px); max-width: calc(33.333% - 6px); height: 26px; line-height: 24px; padding: 0 4px; box-sizing: border-box; text-align: center; border-radius: 4px; border: 1px solid #7289da; background: #fff; color: #4b5d88; font-size: 0.78em; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 3px; white-space: nowrap;">
                <i class="fas fa-dice-d20" style="color: #7289da; font-size: 0.9em;"></i> ${a.label} Save
              </button>
            `;
          }).join("");

          const rawCardHtml = `
            <div style="font-family: inherit; color: #2b3a4a;">
              <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #7289da; padding-bottom: 4px; margin-bottom: 6px;">
                <span style="font-size: 1.05em; font-weight: 800; color: #2b3a4a;">
                  <i class="fas fa-shield-alt" style="color: #7289da; margin-right: 4px;"></i>Spell Save DC
                </span>
                <span style="font-size: 1.1em; font-weight: 800; color: #fff; background: #7289da; padding: 1px 7px; border-radius: 4px;">
                  DC ${dc}
                </span>
              </div>
              <div style="font-size: 0.85em; color: #555; margin-bottom: 6px;">
                <strong>${actor.name}</strong> imposes a saving throw:
              </div>
              <div style="background: rgba(114, 137, 218, 0.08); border: 1px solid rgba(114, 137, 218, 0.25); border-radius: 4px; padding: 6px 8px; text-align: center;">
                <div style="font-size: 0.72em; font-weight: 700; color: #4b5d88; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
                  Click to Roll Save
                </div>
                <div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px;">
                  ${saveButtonsHtml}
                </div>
              </div>
            </div>
          `;

          try {
            await ChatMessage.create({
              user: game.user.id,
              speaker: ChatMessage.getSpeaker({ actor }),
              content: rawCardHtml
            });
          } catch (err) {
            console.error("Failed to create spell save DC card:", err);
            ui.notifications.error("Failed to post Save DC card to chat.");
          }
        });

        // Spell Inspector Sub-Tab Switcher
        html.on("click", ".btn-spell-subtab", function (e) {
          e.preventDefault();
          e.stopPropagation();
          inspectorSpellSubTab = $(this).data("subtab") || "details";
          html.find("#inspector-spell").html(getSelectedSpellInspectorHtml());
        });

        // Spell Slot Tracker Mode Toggle (Available vs Spent)
        html.on("click", ".btn-toggle-slot-mode", function (e) {
          e.preventDefault();
          e.stopPropagation();
          const mode = $(this).data("mode") || "available";
          spellSlotDisplayMode = mode;
          try {
            localStorage.setItem(SPELL_SLOT_MODE_STORAGE_KEY, mode);
          } catch (_err) {}
          html.find("#inspector-spell").html(getSelectedSpellInspectorHtml());
        });

        // Dual-cast Spell Resource Mode Radio Switcher (Charge vs Slot)
        html.on("change", "input[name='spellCastResourceMode']", function () {
          const mode = $(this).val();
          const slotToggle = html.find("#deductSlotToggle");
          const chargeToggle = html.find("#deductChargeToggle");
          if (mode === "charge") {
            slotToggle.prop("checked", false).prop("disabled", true);
            slotToggle.closest("label").css({ opacity: "0.6", cursor: "not-allowed" });
            chargeToggle.prop("checked", true);
          } else {
            slotToggle.prop("disabled", false).prop("checked", true);
            slotToggle.closest("label").css({ opacity: "1", cursor: "pointer" });
            chargeToggle.prop("checked", false);
          }
        });

        // Dedicated uncheck/check handler for charge toggle to keep slot/charge mutually exclusive
        html.on("change", "#deductChargeToggle", function () {
          const isChecked = $(this).is(":checked");
          const slotToggle = html.find("#deductSlotToggle");
          const radioSlot = html.find("input[name='spellCastResourceMode'][value='slot']");
          const radioCharge = html.find("input[name='spellCastResourceMode'][value='charge']");
          if (!isChecked) {
            slotToggle.prop("disabled", false).prop("checked", true);
            slotToggle.closest("label").css({ opacity: "1", cursor: "pointer" });
            if (radioSlot.length) radioSlot.prop("checked", true);
          } else {
            // When checking deduct charge, ensure slot deduction is unchecked and grayed out
            slotToggle.prop("checked", false).prop("disabled", true);
            slotToggle.closest("label").css({ opacity: "0.6", cursor: "not-allowed" });
            if (radioCharge.length) radioCharge.prop("checked", true);
          }
        });

        // Allow clicking slot toggle to switch mode to slot and uncheck/gray out charge
        html.on("change", "#deductSlotToggle", function () {
          const isChecked = $(this).is(":checked");
          const chargeToggle = html.find("#deductChargeToggle");
          const radioSlot = html.find("input[name='spellCastResourceMode'][value='slot']");
          if (isChecked) {
            chargeToggle.prop("checked", false);
            if (radioSlot.length) radioSlot.prop("checked", true);
          }
        });

        // Send Spell Description to Chat Handler
        html.on("click", ".btn-send-spell-desc-chat", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const sp = spellConfigs[selectedSpellKey];
          if (!sp) return;

          const desc = (sp.description || sp.summary || "").trim();
          if (!desc) {
            return ui.notifications.warn(`No description available for "${selectedSpellKey}".`);
          }

          const lvlLabel = Number(sp.baseLevel) === 0 ? "Cantrip" : `Level ${sp.baseLevel}`;
          const d = getSpellDetails(sp, sp.baseLevel);
          const tagsHtml = d.tags.map(t => {
            const isConc = t === "Concentration";
            const isSlot = t.startsWith("Slot:");
            const bg = isConc ? "rgba(163, 72, 72, 0.15)" : (isSlot ? "rgba(43, 116, 137, 0.15)" : "rgba(114, 137, 218, 0.18)");
            const border = isConc ? "rgba(163, 72, 72, 0.4)" : (isSlot ? "rgba(43, 116, 137, 0.4)" : "rgba(114, 137, 218, 0.4)");
            const color = isConc ? "#a34848" : (isSlot ? "#235d6e" : "#4b5d88");
            return `<span style="display: inline-block; background: ${bg}; border: 1px solid ${border}; border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: ${color};">${t}</span>`;
          }).join(" ");

          const chatContent = `
            <div style="font-family: inherit; color: #333;">
              <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #343a40; padding-bottom: 3px; margin-bottom: 6px;">
                <span style="font-size: 1.05em; font-weight: bold; color: #2b3a4a;">${selectedSpellKey}</span>
                <span style="font-size: 0.8em; color: #777;">${actor.name}</span>
              </div>

              ${tagsHtml ? `<div style="display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 6px;">${tagsHtml}</div>` : ""}

              <div style="background: rgba(75, 93, 136, 0.08); border: 1px solid rgba(75, 93, 136, 0.3); border-radius: 4px; padding: 8px 10px; margin-top: 4px;">
                <div style="font-weight: bold; font-size: 0.8em; color: #4b5d88; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.5px;">
                  <i class="fas fa-sparkles"></i> Spell Description
                </div>
                <div style="font-size: 0.9em; line-height: 1.4; color: #2b3a4a;">${desc}</div>
              </div>
            </div>
          `;

          await ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor }),
            content: chatContent
          });
        });

        function updateCardStyles() {
          html.find(".weapon-card").each(function () {
            const k = $(this).data("key");
            const isSel = k === selectedWeaponKey;
            const isStd = $(this).hasClass("standard-weapon-card");
            $(this).css({
              "border-color": isSel ? "#7289da" : (isStd ? "#bcc5d3" : "#e0e0e0"),
              "background-color": isSel ? "#f0f4ff" : (isStd ? "#f8fafc" : "#fff")
            });
            if (isStd) {
              $(this).find("i").css("color", isSel ? "#7289da" : "#5b6eae");
            }
          });
          html.find(".spell-card").each(function () {
            const k = $(this).data("key");
            const isSel = k === selectedSpellKey;
            $(this).css({
              "border-color": isSel ? "#7289da" : "#e0e0e0",
              "background-color": isSel ? "#f0f4ff" : "#fff"
            });
          });
        }

        function setTab(mode) {
          currentMode = mode;
          btnWeapon.css({ background: mode === "weapon" ? "#7289da" : "#f0f2f5", color: mode === "weapon" ? "#fff" : "#555" });
          btnSpell.css({ background: mode === "spell" ? "#7289da" : "#f0f2f5", color: mode === "spell" ? "#fff" : "#555" });
          btnD20.css({ background: mode === "d20" ? "#7289da" : "#f0f2f5", color: mode === "d20" ? "#fff" : "#555" });

          // Center column lists
          secD20.css("display", mode === "d20" ? "flex" : "none");
          secWeapon.css("display", mode === "weapon" ? "flex" : "none");
          secSpell.css("display", mode === "spell" ? "flex" : "none");

          // Right column inspectors
          inspectorD20.css("display", mode === "d20" ? "flex" : "none");
          inspectorWeapon.css("display", mode === "weapon" ? "flex" : "none");
          inspectorSpell.css("display", mode === "spell" ? "flex" : "none");

          if (mode === "weapon") bindWeaponDragAndDrop();
          if (mode === "spell") bindSpellDragAndDrop();
        }

        // --- Compact Mode Toggle & View Switching ---
        let isCompact = isInitiallyCompact;
        const compactNav = html.find("#dice-stuff-compact-nav");
        const panelLeft = html.find("#dialog-sidebar-left");
        const panelCenter = html.find("#dialog-panel-center");
        const panelRight = html.find("#dialog-panel-right");

        function updateCompactView() {
          const collapseBtn = dialogApp.find(".dice-stuff-collapse-btn");
          const themeBtn = dialogApp.find(".dice-stuff-theme-btn");
          const gmBtn = dialogApp.find(".gm-tools-header-btn");
          const refreshBtn = dialogApp.find(".dice-stuff-refresh-btn");
          const closeBtn = dialogApp.find(".header-button.close");

          if (isCompact) {
            collapseBtn.find("i").removeClass("fa-compress-alt").addClass("fa-expand-alt");
            collapseBtn.find(".collapse-label-text").hide();
            collapseBtn.attr("title", "Expand to Full View");

            // Hide text labels in header buttons in compact mode (icons only)
            themeBtn.find(".theme-label-text").hide();
            refreshBtn.find(".refresh-label-text").hide();
            gmBtn.find(".gm-label-text").hide();
            gmBtn.contents().filter(function() { return this.nodeType === 3 && this.textContent.trim().length > 0; }).wrap('<span class="gm-label-text" style="display: none;"></span>');
            dialogApp.find(".gm-label-text").hide();

            closeBtn.contents().filter(function() { return this.nodeType === 3 && this.textContent.trim().length > 0; }).wrap('<span class="close-label-text" style="display: none;"></span>');
            dialogApp.find(".close-label-text").hide();

            compactNav.css("display", "flex");
            panelRight.hide();

            // Highlight active compact tab button
            compactNav.find(".compact-nav-btn").each(function () {
              const t = $(this).data("tab");
              const isAct = t === compactTab;
              $(this).css({
                background: isAct ? "#7289da" : "#f0f2f5",
                color: isAct ? "#fff" : "#555"
              });
            });

            if (compactTab === "abilities") {
              panelLeft.show().css({ width: "100%", "min-width": "0", "border-right": "none", "padding-right": "0" });
              panelCenter.hide();
            } else {
              panelLeft.hide();
              panelCenter.show().css({ width: "100%", "min-width": "0", "border-right": "none", "padding-right": "0" });
              panelCenter.find("> div:first-child").hide(); // Hide center 3-tab bar in compact mode
              if (compactTab === "weapon") {
                secWeapon.css("display", "flex");
                secSpell.hide();
                secD20.hide();
                bindWeaponDragAndDrop();
              } else if (compactTab === "spell") {
                secSpell.css("display", "flex");
                secWeapon.hide();
                secD20.hide();
                bindSpellDragAndDrop();
              } else if (compactTab === "d20") {
                secD20.css("display", "flex");
                secWeapon.hide();
                secSpell.hide();
              }
            }

            dialogApp.css({ width: "310px", "min-width": "310px" });
            if (dlg?.setPosition) {
              dlg.setPosition({ width: 310, height: "auto" });
            } else if (dlg?.position) {
              dlg.position.width = 310;
            }
          } else {
            collapseBtn.find("i").removeClass("fa-expand-alt").addClass("fa-compress-alt");
            collapseBtn.find(".collapse-label-text").show().text("Compact");
            collapseBtn.attr("title", "Collapse to Compact View");

            // Restore text labels in header buttons in expanded mode
            themeBtn.find(".theme-label-text").show();
            refreshBtn.find(".refresh-label-text").show();
            dialogApp.find(".gm-label-text").show();
            dialogApp.find(".close-label-text").show();

            compactNav.hide();
            panelLeft.show().css({ width: "275px", "min-width": "275px", "border-right": "1px solid #bcc5d3", "padding-right": "8px" });
            panelCenter.show().css({ width: "auto", "min-width": "300px", "border-right": "1px solid #bcc5d3", "padding-right": "8px" });
            panelCenter.find("> div:first-child").show(); // Restore center 3-tab bar
            panelRight.show();

            setTab(currentMode);
            dialogApp.css({ width: "980px", "min-width": "980px" });
            if (dlg?.setPosition) {
              dlg.setPosition({ width: 980, height: "auto" });
            } else if (dlg?.position) {
              dlg.position.width = 980;
            }
          }
        }

        function toggleCompactMode() {
          isCompact = !isCompact;
          try {
            localStorage.setItem(COMPACT_STORAGE_KEY, String(isCompact));
          } catch (e) {}
          updateCompactView();
        }

        // Compact Navigation Buttons Click
        compactNav.find(".compact-nav-btn").on("click", function (e) {
          e.preventDefault();
          compactTab = $(this).data("tab");
          try {
            localStorage.setItem(COMPACT_TAB_STORAGE_KEY, compactTab);
          } catch (e) {}
          if (compactTab !== "abilities") {
            currentMode = compactTab;
          }
          updateCompactView();
        });

        // Quick Roll Attack Click (Base Attack Roll)
        html.on("click", ".quick-roll-weapon-btn", async function (e) {
          e.stopPropagation();
          const key = $(this).data("key") || selectedWeaponKey;
          const rawConfig = attacks[key];
          if (!rawConfig) return;

          const config = foundry.utils.duplicate(rawConfig);
          config.targetIds = Array.from(game.user.targets).map(t => t.id);

          // Quick Roll is strictly base damage; disable all optional extra damage components
          if (config.additionalDamageComponents) {
            config.additionalDamageComponents.forEach(c => c.isActive = false);
          }
          config.extraDamageModifier = "";
          config.extraAttackModifier = "";

          if (e.shiftKey) config.rollMode = "advantage";
          else if (e.altKey || e.ctrlKey || e.metaKey) config.rollMode = "disadvantage";

          if (key === "Unarmed Strike") {
            const hasTavern = actor.items?.some(i => (i.name || "").toLowerCase().includes("tavern brawler")) ?? false;
            const monk = actor.items?.find(i => i.type === "class" && (i.name || "").toLowerCase().includes("monk")) || actor.classes?.monk;
            const monkLvl = monk?.system?.levels || 0;
            const strMod = actor.system?.abilities?.str?.mod ?? 0;
            const dexMod = actor.system?.abilities?.dex?.mod ?? 0;
            const saveDC = 8 + (actor.system?.attributes?.prof ?? 2) + (monkLvl > 0 ? Math.max(strMod, dexMod) : strMod);

            let choiceConfirmed = false;
            await new Promise(resolve => {
              new Dialog({
                title: `${actor.name}: Unarmed Strike`,
                content: `
                  <div style="padding: 6px; font-family: inherit;">
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                      <button type="button" id="unarmed-choice-damage" style="height: 32px; font-weight: 700; font-size: 0.85em; background: #7289da; color: #fff; border: 1px solid #5b6eae; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                        <i class="fas fa-hand-fist"></i> Damage
                      </button>
                      <button type="button" id="unarmed-choice-grapple" style="height: 32px; font-weight: 700; font-size: 0.85em; background: #2b7489; color: #fff; border: 1px solid #1f5564; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                        <i class="fas fa-hand-holding-hand"></i> Grapple (DC ${saveDC} Save)
                      </button>
                      <button type="button" id="unarmed-choice-shove" style="height: 32px; font-weight: 700; font-size: 0.85em; background: #a34848; color: #fff; border: 1px solid #7c3535; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                        <i class="fas fa-person-falling"></i> Shove (DC ${saveDC} Save)
                      </button>
                    </div>
                  </div>
                `,
                buttons: { cancel: { label: "Cancel" } },
                default: "cancel",
                render: (dlgHtml) => {
                  dlgHtml.find("#unarmed-choice-damage").on("click", async () => {
                    dlgHtml.closest(".dialog").find(".close").trigger("click");
                    await globalThis.attackSocket.executeAsGM("runAttackRoll", config, actor.id, game.user.id);
                  });
                  dlgHtml.find("#unarmed-choice-grapple").on("click", async () => {
                    dlgHtml.closest(".dialog").find(".close").trigger("click");
                    await globalThis.attackSocket.executeAsGM("runUnarmedManeuver", "grapple", config, actor.id, game.user.id);
                  });
                  dlgHtml.find("#unarmed-choice-shove").on("click", async () => {
                    dlgHtml.closest(".dialog").find(".close").trigger("click");
                    await globalThis.attackSocket.executeAsGM("runUnarmedManeuver", "shove", config, actor.id, game.user.id);
                  });
                }
              }, { width: 300 }).render(true);
            });
          } else {
            await globalThis.attackSocket.executeAsGM("runAttackRoll", config, actor.id, game.user.id);
          }
        });

        // Quick Cast Spell Click (Base Level Spell Cast)
        html.on("click", ".quick-roll-spell-btn", async function (e) {
          e.stopPropagation();
          const key = $(this).data("key") || selectedSpellKey;
          const rawConfig = spellConfigs[key];
          if (!rawConfig) return;

          const castLvl = Number(rawConfig.baseLevel) || 0;
          const { cfg: config } = getEffectiveSpellConfig(rawConfig, castLvl);

          const srcInfo = getSpellItemSourceInfo(rawConfig);
          if (castLvl === 0) {
            config.skipSlotDeduction = true;
          } else if (srcInfo && srcInfo.isPureItem) {
            config.skipSlotDeduction = true;
            if (srcInfo.hasItemUses && srcInfo.chargeCost > 0) {
              if (srcInfo.curUses < srcInfo.chargeCost) {
                const proceed = await Dialog.confirm({
                  title: "Insufficient Charges Remaining",
                  content: `<p><strong>${srcInfo.name}</strong> only has <strong>${srcInfo.curUses}</strong> charges remaining (requires ${srcInfo.chargeCost}). Cast anyway?</p>`
                });
                if (!proceed) return;
              } else {
                config.deductChargeItemId = srcInfo.itemId;
                config.deductChargeCost = srcInfo.chargeCost;
              }
            }
          } else {
            const slotKey = `spell${castLvl}`;
            const currentSlotVal = Number(actor.system.spells?.[slotKey]?.value) || 0;
            if (currentSlotVal <= 0) {
              const proceed = await Dialog.confirm({
                title: "No Spell Slots Remaining",
                content: `<p><strong>${actor.name}</strong> has <strong>0</strong> Level ${castLvl} spell slots remaining. Cast anyway?</p>`
              });
              if (!proceed) return;
              config.skipSlotDeduction = true;
            }
          }

          if (e.shiftKey) config.rollMode = "advantage";
          else if (e.altKey || e.ctrlKey || e.metaKey) config.rollMode = "disadvantage";

          if (config.hasDamageTypeChoice && config.damageTypes?.length > 0) {
            let choiceConfirmed = false;
            const choiceOptions = config.damageTypes.map(t => `<option value="${t}">${t.toUpperCase()}</option>`).join("");
            await new Promise(resolve => {
              new Dialog({
                title: `${config.spellName}: Damage Type`,
                content: `<div style="padding: 6px;"><select id="chosenType" style="width:100%; height:30px;">${choiceOptions}</select></div>`,
                buttons: {
                  ok: { label: "Confirm", callback: (chHtml) => { choiceConfirmed = true; config.damageType = chHtml.find("#chosenType").val(); } },
                  cancel: { label: "Cancel" }
                },
                default: "ok",
                close: () => resolve()
              }, { width: 260 }).render(true);
            });
            if (!choiceConfirmed) return;
          }

          config.targetIds = Array.from(game.user.targets).map(t => t.id);
          await globalThis.attackSocket.executeAsGM("runSpellAttackRoll", config, actor.id, game.user.id);

          // Live real-time refresh of spell slots, inspector, and tracking stuff after cast
          html.find("#inspector-spell").html(getSelectedSpellInspectorHtml());
          html.find("#section-spell").html(renderSpellCards());
          updateCardStyles();
          if (typeof window.CustomRolls?._refreshTrackingChips === "function") {
            window.CustomRolls._refreshTrackingChips();
          }
        });

        // Initial setup for compact mode
        if (isInitiallyCompact) {
          updateCompactView();
        } else {
          setTab(currentMode);
          updateWeaponOverviewTotals();
        }

        // Intercept native minimize/maximize to maintain compact dimensions
        const origMaximize = dlg.maximize.bind(dlg);
        dlg.maximize = async function () {
          await origMaximize();
          if (isCompact) {
            updateCompactView();
          }
        };
        function updateWeaponOverviewTotals() {
          const config = attacks[selectedWeaponKey];
          if (!config) return;
          const d = getWeaponDetails(config);

          let atkMod = d.totalAtk;
          let dmgMod = d.dmgMod;
          let atkSuffix = "";

          // Check GWM toggle
          const isGWM = html.find("#gwm-toggle").is(":checked");
          if (config.hasGWM && isGWM) {
            atkMod -= 5;
            dmgMod += 10;
          }

          // Check Versatile toggle
          let baseDieSize = d.dieSize;
          const isVersatileChecked = html.find("#versatile-toggle").is(":checked");
          if (config.isVersatile && isVersatileChecked) {
            baseDieSize = config.versatileDie || "10";
          }

          // Check extra attack input
          const extraAtk = (html.find("#weapon-extra-atk").val() || "").trim();
          if (extraAtk) {
            atkSuffix = extraAtk.startsWith("+") || extraAtk.startsWith("-") ? ` ${extraAtk}` : ` + ${extraAtk}`;
          }

          // Check extra damage input
          const extraDmg = (html.find("#weapon-extra-dmg").val() || "").trim();

          // Check optional damage toggles
          const activeExtras = [];
          if (config.additionalDamageComponents) {
            html.find(".extra-dmg-toggle:checked").each(function () {
              const idx = $(this).data("index");
              const comp = config.additionalDamageComponents[idx];
              if (comp) {
                activeExtras.push(`${comp.formula} <small style="color: #666;">(${comp.label || comp.damageType || ""})</small>`);
              }
            });
          }

          // Format total attack string
          const atkSign = atkMod >= 0 ? `+ ${atkMod}` : `- ${Math.abs(atkMod)}`;
          const totalAtkStr = `1d20 ${atkSign}${atkSuffix}`;

          // Format total damage string
          const dmgModSign = dmgMod >= 0 ? `+ ${dmgMod}` : `- ${Math.abs(dmgMod)}`;
          let totalDmgStr = "";
          if (d.diceCount > 0 && baseDieSize) {
            totalDmgStr = `${d.diceCount}d${baseDieSize} ${dmgMod !== 0 ? dmgModSign : ""}`.trim();
          } else {
            totalDmgStr = `${dmgMod}`;
          }
          totalDmgStr += ` ${d.dmgType.toLowerCase()}`;

          if (extraDmg) {
            totalDmgStr += ` + ${extraDmg} <small style="color: #666; font-weight: normal;">(Extra)</small>`;
          }
          if (activeExtras.length > 0) {
            totalDmgStr += ` + ${activeExtras.join(" + ")}`;
          }

          html.find("#preview-total-atk").text(totalAtkStr);
          html.find("#preview-total-dmg").html(totalDmgStr).attr("title", totalDmgStr.replace(/<[^>]+>/g, ""));
        }

        btnWeapon.on("click", () => setTab("weapon"));
        btnSpell.on("click", () => setTab("spell"));
        btnD20.on("click", () => setTab("d20"));
        if (!isInitiallyCompact) {
          setTab(currentMode);
          updateWeaponOverviewTotals();
        }

        // Live formula updates on keystroke and checkbox changes
        html.on("input", "#weapon-extra-atk, #weapon-extra-dmg", updateWeaponOverviewTotals);
        html.on("change", "#gwm-toggle, #versatile-toggle, .extra-dmg-toggle", updateWeaponOverviewTotals);

        html.on("click", ".weapon-card", function () {
          selectedWeaponKey = $(this).data("key");
          updateCardStyles();
          html.find("#inspector-weapon").html(getSelectedWeaponInspectorHtml());
          updateWeaponOverviewTotals();
        });

        html.on("click", ".spell-card", function () {
          selectedSpellKey = $(this).data("key");
          updateCardStyles();
          html.find("#inspector-spell").html(getSelectedSpellInspectorHtml());
        });

        function bindWeaponDragAndDrop() {
          const list = html.find("#custom-weapons-list");
          const trashZone = html.find("#weapon-trash-zone");

          list.find(".custom-weapon-card").off("dragstart dragend dragover dragleave drop");
          list.off("dragover dragleave drop");
          trashZone.off("dragover dragleave drop");

          // Helper to import a weapon item dropped from an actor's sheet
          async function importWeaponFromDrop(item) {
            if (!item || item.type !== "weapon") {
              ui.notifications.warn("Only weapons can be added to the weapon column.");
              return;
            }

            const sys = item.system || {};
            const isFinesse = Boolean(sys.properties?.has ? sys.properties.has("fin") : sys.properties?.fin);
            const isRanged = sys.actionType === "rwak";
            const strMod = actor.system.abilities?.str?.mod || 0;
            const dexMod = actor.system.abilities?.dex?.mod || 0;
            const abilityScore = (isRanged || (isFinesse && dexMod > strMod)) ? "dex" : "str";

            let formula = "";
            let dmgType = "slashing";
            if (sys.damage?.base?.formula) {
              formula = sys.damage.base.formula;
              dmgType = sys.damage.base.types?.first?.() || sys.damage.base.types?.[0] || "slashing";
            } else if (sys.damage?.parts?.[0]) {
              formula = sys.damage.parts[0][0] || "";
              dmgType = sys.damage.parts[0][1] || "slashing";
            }

            let damageDiceCount = 1;
            let damageDieSize = "d8";
            const match = formula.match(/(\d*)d(\d+)/i);
            if (match) {
              damageDiceCount = parseInt(match[1]) || 1;
              damageDieSize = `d${match[2]}`;
            }

            let weaponModifier = 0;
            if (typeof sys.magicalBonus === "number" && sys.magicalBonus !== 0) {
              weaponModifier = sys.magicalBonus;
            } else if (typeof sys.attackBonus === "number" && sys.attackBonus !== 0) {
              weaponModifier = sys.attackBonus;
            }

            // Robust proficiency check across dnd5e versions (item.isProficient, sys.proficient, sys.prof?.hasProficiency)
            const isProf = Boolean(item.isProficient ?? sys.proficient ?? sys.prof?.hasProficiency ?? false);
            const isVersatile = Boolean(sys.properties?.has ? sys.properties.has("ver") : sys.properties?.ver);
            let versatileDie = "10";
            if (sys.damage?.versatile) {
              const vm = String(sys.damage.versatile).match(/d(\d+)/i);
              if (vm) versatileDie = vm[1];
            }

            // Determine if GWM can be allowed (heavy weapons)
            const isHeavy = Boolean(sys.properties?.has ? sys.properties.has("hvy") : sys.properties?.hvy);

            // Always query the latest persistent storage to ensure GM edits are captured
            const freshAttacks = foundry.utils.deepClone(
              window.CustomRolls?.getProfileData?.(actor, "attackConfigs") ||
              actor.getFlag?.("world", "attackConfigs") ||
              attacks
            );

            // Check if attack with this name or item already exists
            const existingConfig = freshAttacks[item.name] || Object.values(freshAttacks).find(a => a.itemId === item.id);
            if (existingConfig) {
              const isGmConfigured = existingConfig.addedBy === "gm" || existingConfig.gmModified === true;
              if (!game.user.isGM && isGmConfigured) {
                return ui.notifications.warn(`"${item.name}" is already configured by the GM and cannot be overwritten.`);
              }
              if (game.user.isGM) {
                const confirmed = await Dialog.confirm({
                  title: `Overwrite ${item.name}?`,
                  content: `<p><strong>${item.name}</strong> already exists in attacks. Do you want to overwrite it with default stats from the character sheet?</p>`
                });
                if (!confirmed) return;
              }
            }

            const newAttackConfig = {
              itemId: item.id,
              macroName: item.name,
              chatCardTitle: item.name,
              abilityScore: abilityScore,
              isProficient: isProf,
              damageDiceCount: damageDiceCount,
              damageDieSize: damageDieSize,
              damageType: (dmgType || "slashing").toLowerCase(),
              weaponModifier: weaponModifier,
              attackCircumstanceModifier: 0,
              damageModifier: 0,
              CRIT_THRESHOLD: 20,
              extraCriticalBonus: "",
              GWF_REROLL_THRESHOLD: 0,
              HAS_HALFLING_LUCKY: false,
              HALFLING_LUCKY_REROLL_THRESHOLD: 0,
              superAdv: false,
              hasGWM: isHeavy || isRanged,
              isVersatile: isVersatile,
              versatileDie: versatileDie,
              addedBy: game.user.isGM ? "gm" : "player",
              additionalDamageComponents: []
            };

            const updatedAttacks = foundry.utils.deepClone(freshAttacks);
            updatedAttacks[item.name] = newAttackConfig;

            await window.CustomRolls.setProfileData(actor, "attackConfigs", updatedAttacks);
            if (game.user.isGM) {
              await actor.setFlag("world", "attackConfigs", updatedAttacks, { recursive: false });
            }

            attacks = updatedAttacks;
            attackNames = Object.keys(attacks);
            selectedWeaponKey = item.name;

            html.find("#custom-weapons-list").html(renderCustomWeaponCards());
            html.find("#inspector-weapon").html(getSelectedWeaponInspectorHtml());
            bindWeaponDragAndDrop();
            updateCardStyles();
            updateWeaponOverviewTotals();
            ui.notifications.info(`Added "${item.name}" to weapon attacks.`);
          }

          // Container-level drop listener for dropping an item from the character sheet
          list.on("dragover", function (e) {
            e.preventDefault();
            e.originalEvent.dataTransfer.dropEffect = "copy";
          });

          list.on("drop", async function (e) {
            let data = null;
            try {
              data = JSON.parse(e.originalEvent.dataTransfer.getData("text/plain"));
            } catch (err) {
              data = null;
            }

            // If it's a reorder of an existing action card, the card drop listener handles it
            if (!data || data.type !== "Item") return;

            e.preventDefault();
            e.stopPropagation();

            let droppedItem = null;
            if (data.uuid) {
              droppedItem = fromUuidSync(data.uuid);
            } else if (data.data) {
              droppedItem = data.data;
            }

            // Verify the item belongs directly to the character sheet of the active actor
            const actorItem = actor.items.get(droppedItem?.id) || (droppedItem?.parent?.id === actor.id ? droppedItem : null);
            if (!actorItem) {
              return ui.notifications.warn("Please add the weapon to your character sheet first, then drag it here.");
            }

            await importWeaponFromDrop(actorItem);
          });

          list.find(".custom-weapon-card").on("dragstart", function (e) {
            e.originalEvent.dataTransfer.setData("text/plain", $(this).data("key"));
            e.originalEvent.dataTransfer.effectAllowed = "move";
            $(this).css("opacity", "0.4");
            trashZone.css("display", "flex");
          });

          list.find(".custom-weapon-card").on("dragend", function () {
            $(this).css("opacity", "1");
            list.find(".custom-weapon-card").css({ "border-top": "", "border-bottom": "" });
            trashZone.css("display", "none");
          });

          list.find(".custom-weapon-card").on("dragover", function (e) {
            e.preventDefault();
            e.originalEvent.dataTransfer.dropEffect = "move";
            const rect = this.getBoundingClientRect();
            const relY = e.clientY - rect.top;
            if (relY < rect.height / 2) {
              $(this).css({ "border-top": "3px solid #7289da", "border-bottom": "" });
            } else {
              $(this).css({ "border-bottom": "3px solid #7289da", "border-top": "" });
            }
          });

          list.find(".custom-weapon-card").on("dragleave", function () {
            $(this).css({ "border-top": "", "border-bottom": "" });
          });

          list.find(".custom-weapon-card").on("drop", async function (e) {
            let plainText = "";
            try {
              plainText = e.originalEvent.dataTransfer.getData("text/plain");
            } catch (err) {}

            // Check if this was an Item drop from character sheet
            let isItemDrop = false;
            try {
              const parsed = JSON.parse(plainText);
              if (parsed?.type === "Item") isItemDrop = true;
            } catch (err) {}

            if (isItemDrop) {
              // Defer to container drop handler
              return;
            }

            e.preventDefault();
            e.stopPropagation();
            $(this).css({ "border-top": "", "border-bottom": "" });
            const draggedKey = plainText;
            const targetKey = $(this).data("key");
            if (!draggedKey || draggedKey === targetKey) return;

            const rect = this.getBoundingClientRect();
            const relY = e.clientY - rect.top;
            const insertBefore = relY < rect.height / 2;

            const STANDARD_KEYS = ["Unarmed Strike", "Improvised Weapon", "Off-Hand Attack"];
            const curCustom = attackNames.filter(k => !STANDARD_KEYS.includes(k));
            const fromIdx = curCustom.indexOf(draggedKey);
            const toIdx = curCustom.indexOf(targetKey);
            if (fromIdx === -1 || toIdx === -1) return;

            curCustom.splice(fromIdx, 1);
            const newTargetIdx = curCustom.indexOf(targetKey);
            const finalIdx = insertBefore ? newTargetIdx : newTargetIdx + 1;
            curCustom.splice(finalIdx, 0, draggedKey);

            const newAttacks = {};
            for (const k of curCustom) {
              if (attacks[k]) newAttacks[k] = attacks[k];
            }
            for (const k of STANDARD_KEYS) {
              if (attacks[k]) newAttacks[k] = attacks[k];
            }

            await window.CustomRolls.setProfileData(actor, "attackConfigs", newAttacks);
            if (game.user.isGM) {
              await actor.setFlag("world", "attackConfigs", newAttacks, { recursive: false });
            }

            attacks = newAttacks;
            attackNames = Object.keys(attacks);

            html.find("#custom-weapons-list").html(renderCustomWeaponCards());
            bindWeaponDragAndDrop();
            updateCardStyles();
          });

          // Trash Zone Drag and Drop Handlers
          trashZone.on("dragover", function (e) {
            e.preventDefault();
            e.originalEvent.dataTransfer.dropEffect = "move";
            $(this).css({ "background": "#ffcdd2", "border-color": "#b71c1c" });
          });

          trashZone.on("dragleave", function () {
            $(this).css({ "background": "#ffebee", "border-color": "#e57373" });
          });

          trashZone.on("drop", async function (e) {
            e.preventDefault();
            e.stopPropagation();
            trashZone.css("display", "none");

            const draggedKey = e.originalEvent.dataTransfer.getData("text/plain");
            if (!draggedKey || !attacks[draggedKey]) return;

            const STANDARD_KEYS = ["Unarmed Strike", "Improvised Weapon", "Off-Hand Attack"];
            if (STANDARD_KEYS.includes(draggedKey)) {
              return ui.notifications.warn(`"${draggedKey}" is a standard attack and cannot be removed.`);
            }

            // Fetch latest attack configurations to accurately verify GM ownership
            const currentAttacksStore = foundry.utils.deepClone(
              window.CustomRolls?.getProfileData?.(actor, "attackConfigs") ||
              actor.getFlag?.("world", "attackConfigs") ||
              attacks
            );

            const targetConfig = currentAttacksStore[draggedKey] || attacks[draggedKey];
            const isPlayerAdded = targetConfig?.addedBy === "player" && !targetConfig?.gmModified;

            if (!game.user.isGM && !isPlayerAdded) {
              return ui.notifications.warn(`"${draggedKey}" was configured by the GM and cannot be removed.`);
            }

            // If GM is removing a GM-configured action, prompt confirmation
            if (game.user.isGM && !isPlayerAdded) {
              const confirmRemove = await Dialog.confirm({
                title: `Remove ${draggedKey}?`,
                content: `<p>Are you sure you want to remove <strong>${draggedKey}</strong>? This will permanently delete this GM-configured action.</p>`
              });
              if (!confirmRemove) return;
            }

            const newAttacks = foundry.utils.deepClone(currentAttacksStore);
            delete newAttacks[draggedKey];

            await window.CustomRolls.setProfileData(actor, "attackConfigs", newAttacks);
            if (game.user.isGM) {
              await actor.setFlag("world", "attackConfigs", newAttacks, { recursive: false });
            }

            // Clean up any assigned HUD slots for this removed weapon
            let assignedSlots = foundry.utils.deepClone(
              window.CustomRolls?.getProfileData?.(actor, "hudAssignedSlots") ||
              actor.getFlag("world", "hudAssignedSlots") || {}
            );
            let slotCleaned = false;
            for (const [sNum, data] of Object.entries(assignedSlots)) {
              if (data?.category === "weapons" && data?.name === draggedKey) {
                delete assignedSlots[sNum];
                slotCleaned = true;
              }
            }
            if (slotCleaned) {
              await window.CustomRolls.setProfileData(actor, "hudAssignedSlots", assignedSlots);
              if (game.user.isGM) {
                await actor.setFlag("world", "hudAssignedSlots", assignedSlots, { recursive: false });
              }
              canvas.tokens?.controlled?.forEach(t => t.hud?.render());
            }

            attacks = newAttacks;
            attackNames = Object.keys(attacks);
            if (selectedWeaponKey === draggedKey) {
              selectedWeaponKey = attackNames[0] || null;
            }

            html.find("#custom-weapons-list").html(renderCustomWeaponCards());
            html.find("#inspector-weapon").html(getSelectedWeaponInspectorHtml());
            bindWeaponDragAndDrop();
            updateCardStyles();
            updateWeaponOverviewTotals();
            ui.notifications.info(`Removed "${draggedKey}".`);
          });
        }

        bindWeaponDragAndDrop();

        function bindSpellDragAndDrop() {
          const list = html.find("#section-spell");
          list.find(".custom-spell-card").off("dragstart dragend dragover dragleave drop");
          list.off("dragover dragleave drop");
        }

        bindSpellDragAndDrop();

        // Spell Filter Click Handler (Multi-select toggles)
        html.on("click", ".btn-spell-filter", function (e) {
          e.preventDefault();
          e.stopPropagation();

          const filterVal = String($(this).data("filter"));
          window.CustomRolls._activeSpellFilters = window.CustomRolls._activeSpellFilters || new Set();

          if (window.CustomRolls._activeSpellFilters.has(filterVal)) {
            window.CustomRolls._activeSpellFilters.delete(filterVal);
          } else {
            window.CustomRolls._activeSpellFilters.add(filterVal);
          }

          html.find("#section-spell").html(renderSpellCards());
          updateCardStyles();
        });

        // Favorite Toggle Click Handler
        html.on("click", ".btn-toggle-spell-favorite", async function (e) {
          e.preventDefault();
          e.stopPropagation();

          const key = $(this).data("key");
          const sp = spellConfigs[key];
          if (!sp) return;

          const freshSpells = foundry.utils.deepClone(
            window.CustomRolls?.getProfileData?.(actor, "spellConfigs") ||
            actor.getFlag?.("world", "spellConfigs") ||
            spellConfigs
          );

          if (!freshSpells[key]) return;
          freshSpells[key].isFavorite = !freshSpells[key].isFavorite;

          await window.CustomRolls.setProfileData(actor, "spellConfigs", freshSpells);
          if (game.user.isGM) {
            await actor.setFlag("world", "spellConfigs", freshSpells, { recursive: false });
          }

          spellConfigs = freshSpells;
          html.find("#section-spell").html(renderSpellCards());
          updateCardStyles();
        });

        html.on("click", ".btn-assign-hud-slot", async function (e) {
          e.stopPropagation();
          const category = $(this).data("category") || "weapons";
          const slot = String($(this).data("slot") || "");
          const targetName = category === "weapons" ? selectedWeaponKey : selectedSpellKey;
          if (!targetName) return;

          let assignedSlots = foundry.utils.deepClone(
            window.CustomRolls?.getProfileData?.(actor, "hudAssignedSlots") ||
            actor.getFlag("world", "hudAssignedSlots") || {}
          );

          for (const [sNum, data] of Object.entries(assignedSlots)) {
            if (data?.category === category && data?.name === targetName) {
              delete assignedSlots[sNum];
            }
          }

          if (slot) {
            assignedSlots[slot] = {
              category: category,
              name: targetName,
              handler: category === "weapons" ? "runAttackRoll" : "runSpellAttackRoll"
            };
          }

          await window.CustomRolls.setProfileData(actor, "hudAssignedSlots", assignedSlots);
          if (game.user.isGM) {
            await actor.setFlag("world", "hudAssignedSlots", assignedSlots);
          }

          ui.notifications.info(slot ? `Assigned "${targetName}" to HUD Button ${slot}.` : `Unassigned "${targetName}" from HUD.`);

          if (category === "weapons") {
            html.find("#custom-weapons-list").html(renderCustomWeaponCards());
            bindWeaponDragAndDrop();
            updateCardStyles();
            html.find("#inspector-weapon").html(getSelectedWeaponInspectorHtml());
            updateWeaponOverviewTotals();
          } else {
            html.find("#section-spell").html(renderSpellCards());
            bindSpellDragAndDrop();
            updateCardStyles();
            html.find("#inspector-spell").html(getSelectedSpellInspectorHtml());
          }
          renderSideTabs();
        });

        // --- Render Right-Side Action Tabs & Dice Tray Flyout ---
        let flyoutDiceCounts = { d4: 0, d6: 0, d8: 0, d10: 0, d12: 0, d20: 0, d100: 0 };
        let flyoutRollMode = "norm"; // "norm" | "adv" | "dis"
        let isDiceFlyoutOpen = false;

        function getFlyoutFormula() {
          const parts = [];
          const diceOrder = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
          for (const d of diceOrder) {
            const count = flyoutDiceCounts[d] || 0;
            if (count > 0) {
              if (d === "d20") {
                if (flyoutRollMode === "adv") {
                  parts.push(count === 1 ? "2d20kh" : `${count + 1}d20kh`);
                } else if (flyoutRollMode === "dis") {
                  parts.push(count === 1 ? "2d20kl" : `${count + 1}d20kl`);
                } else {
                  parts.push(`${count}d20`);
                }
              } else {
                parts.push(`${count}${d}`);
              }
            }
          }
          return parts.length > 0 ? parts.join(" + ") : "";
        }

        function renderSideTabs() {
          let sideTabs = dialogApp.find(".dice-stuff-side-tabs");
          if (sideTabs.length === 0) {
            sideTabs = $(`
              <div class="dice-stuff-side-tabs" style="
                position: absolute;
                top: 30px;
                right: -36px;
                display: flex;
                flex-direction: column;
                gap: 5px;
                z-index: 100;
              "></div>
            `);
            dialogApp.append(sideTabs);
          }
          sideTabs.empty();

          // 1. Dice Tray Trigger Tab (Placed above Slot 1)
          const diceTabBtn = $(`
            <button type="button" class="dice-stuff-side-tab-btn ${isDiceFlyoutOpen ? 'tab-assigned' : ''}" id="dice-stuff-flyout-trigger" title="Quick Dice Tray" style="margin-bottom: 2px; ${isDiceFlyoutOpen ? 'border-color: #2563eb; color: #2563eb;' : ''}">
              <i class="fas fa-dice-d20"></i>
            </button>
          `);

          diceTabBtn.on("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            isDiceFlyoutOpen = !isDiceFlyoutOpen;
            renderSideTabs();
          });
          sideTabs.append(diceTabBtn);

          // 2. Action Slots 1 to 4
          const slots = [
            { num: 1, hotbar: 47 },
            { num: 2, hotbar: 48 },
            { num: 3, hotbar: 49 },
            { num: 4, hotbar: 50 }
          ];

          for (const s of slots) {
            const info = getButtonInfo(actor, s.num, s.hotbar);
            const isAssigned = info.type !== "Empty";
            const tabBtn = $(`
              <button type="button" class="dice-stuff-side-tab-btn ${isAssigned ? 'tab-assigned' : 'tab-empty'}" data-slot="${s.num}" data-hotbar="${s.hotbar}" title="${info.title}">
                <i class="${info.icon}"></i>
              </button>
            `);

            tabBtn.on("click", async (e) => {
              e.preventDefault();
              e.stopPropagation();
              await runHudButtonSlot(actor, s.num, s.hotbar);
            });

            sideTabs.append(tabBtn);
          }

          // 3. Render or Remove the Vertical Flyout Tray (Flying out to the right)
          let flyoutTray = sideTabs.find(".dice-stuff-flyout-tray");
          if (!isDiceFlyoutOpen) {
            flyoutTray.remove();
            return;
          }

          if (flyoutTray.length === 0) {
            flyoutTray = $(`<div class="dice-stuff-flyout-tray"></div>`);
            sideTabs.append(flyoutTray);
          }
          flyoutTray.empty();

          // 1) Roll Button (At the very top)
          const rollBtn = $(`
            <button type="button" class="dice-stuff-flyout-roll-btn" title="Roll formula to chat">
              Roll
            </button>
          `);
          rollBtn.on("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const formula = getFlyoutFormula();
            if (!formula) return;

            try {
              const roll = new Roll(formula);
              await roll.evaluate();
              const speaker = ChatMessage.getSpeaker({ actor });
              await roll.toMessage({ speaker });
            } catch (err) {
              console.error("Dice Stuff | Error rolling formula:", err);
            }

            // Reset after rolling
            flyoutDiceCounts = { d4: 0, d6: 0, d8: 0, d10: 0, d12: 0, d20: 0, d100: 0 };
            renderSideTabs();
          });
          flyoutTray.append(rollBtn);

          // 2) Clear Button
          const clearBtn = $(`
            <button type="button" class="dice-stuff-flyout-clear-btn" title="Reset all dice counts">
              Clear
            </button>
          `);
          clearBtn.on("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            flyoutDiceCounts = { d4: 0, d6: 0, d8: 0, d10: 0, d12: 0, d20: 0, d100: 0 };
            renderSideTabs();
          });
          flyoutTray.append(clearBtn);

          // 3) Mode Toggle Button: NORM -> ADV -> DIS -> NORM
          const modeLabels = { norm: "NORM", adv: "ADV", dis: "DIS" };
          const modeClasses = { norm: "", adv: "mode-adv", dis: "mode-dis" };
          const modeBtn = $(`
            <button type="button" class="dice-stuff-flyout-mode-btn ${modeClasses[flyoutRollMode]}" title="Click to cycle Advantage / Disadvantage / Normal">
              ${modeLabels[flyoutRollMode]}
            </button>
          `);
          modeBtn.on("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (flyoutRollMode === "norm") flyoutRollMode = "adv";
            else if (flyoutRollMode === "adv") flyoutRollMode = "dis";
            else flyoutRollMode = "norm";
            renderSideTabs();
          });
          flyoutTray.append(modeBtn);

          // 4) Dice Buttons (Vertical Stack with Dice Icons)
          const diceDefs = [
            { id: "d4", label: "d4", icon: "fas fa-dice-d4" },
            { id: "d6", label: "d6", icon: "fas fa-dice-d6" },
            { id: "d8", label: "d8", icon: "fas fa-dice-d8" },
            { id: "d10", label: "d10", icon: "fas fa-dice-d10" },
            { id: "d12", label: "d12", icon: "fas fa-dice-d12" },
            { id: "d20", label: "d20", icon: "fas fa-dice-d20" },
            { id: "d100", label: "d100", icon: "fas fa-dice-d10" }
          ];

          for (const d of diceDefs) {
            const count = flyoutDiceCounts[d.id] || 0;
            const badgeHtml = count > 0 ? `<span class="dice-stuff-flyout-badge">${count}</span>` : "";
            const dieBtn = $(`
              <button type="button" class="dice-stuff-flyout-die-btn" data-die="${d.id}" title="Left-click: +1 ${d.label} | Right-click: -1">
                <i class="${d.icon}" style="font-size: 0.95em; margin-right: 2px;"></i><span style="font-size: 0.85em;">${d.label}</span>
                ${badgeHtml}
              </button>
            `);

            // Left-Click: Increment
            dieBtn.on("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              flyoutDiceCounts[d.id] = (flyoutDiceCounts[d.id] || 0) + 1;
              renderSideTabs();
            });

            // Right-Click: Decrement
            dieBtn.on("contextmenu", (e) => {
              e.preventDefault();
              e.stopPropagation();
              if ((flyoutDiceCounts[d.id] || 0) > 0) {
                flyoutDiceCounts[d.id] -= 1;
                renderSideTabs();
              }
            });

            flyoutTray.append(dieBtn);
          }
        }

        renderSideTabs();
      }
    }, {
      width: isInitiallyCompact ? 310 : 980,
      height: "auto",
      resizable: true
    }).render(true);
  };

  // Unified Combat Remote alias
  window.CustomRolls.openCombatRemote = window.CustomRolls.openActionDialog;

  // Persistent Storage Inspector Helper
  window.CustomRolls.openStorageInspector = function () {
    const store = foundry.utils.deepClone(game.settings.get("world", "customRollProfiles") || {});
    const actorIds = Object.keys(store);
    if (actorIds.length === 0) return ui.notifications.info("Persistent storage is currently empty.");

    function renderInspector() {
      let sectionsHtml = "";
      for (const actorId of Object.keys(store)) {
        const data = store[actorId];
        const actorName = data._actorName || game.actors.get(actorId)?.name || actorId;
        const weapons = Object.keys(data.attackConfigs || {});
        const spells = Object.keys(data.spellConfigs || {});
        const d20 = Object.keys(data.d20Profiles || {});
        const quick = Object.keys(data.quickMacroProfiles || {});

        const buildItemList = (catKey, items) => {
          if (!items.length) return `<div style="color: #888; font-size: 0.8em; margin-left: 10px;">None</div>`;
          return items.map(item => {
            const displayLabel = catKey === "quickMacroProfiles" ? (data[catKey]?.[item]?.chatCardTitle || data[catKey]?.[item]?.macroName || item) : item;
            return `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px 6px; margin: 2px 0 2px 10px; background: #fff; border: 1px solid #ddd; border-radius: 3px; font-size: 0.82em;">
                <span>${displayLabel}</span>
                <button type="button" class="del-item-btn" data-actor="${actorId}" data-cat="${catKey}" data-item="${item}" style="width: auto; height: 20px; line-height: 18px; padding: 0 5px; color: #a33; border: none; background: transparent; cursor: pointer;">
                  <i class="fas fa-trash"></i>
                </button>
              </div>`;
          }).join("");
        };

        sectionsHtml += `
          <div style="border: 1px solid #ccc; border-radius: 5px; margin-bottom: 10px; background: #fafafa; padding: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #bbb; padding-bottom: 4px; margin-bottom: 6px;">
              <strong style="color: #2b3a4a; font-size: 0.95em;">${actorName}</strong>
              <button type="button" class="del-actor-btn" data-actor="${actorId}" style="height: 22px; line-height: 20px; padding: 0 6px; font-size: 0.75em; color: #fff; background: #a33; border: 1px solid #722; border-radius: 3px; cursor: pointer;">
                Wipe Actor Storage
              </button>
            </div>
            <div style="font-weight: 600; font-size: 0.8em; color: #4b5d88; margin-top: 4px;">WEAPONS (${weapons.length})</div>
            ${buildItemList("attackConfigs", weapons)}
            <div style="font-weight: 600; font-size: 0.8em; color: #4b5d88; margin-top: 6px;">SPELLS (${spells.length})</div>
            ${buildItemList("spellConfigs", spells)}
            <div style="font-weight: 600; font-size: 0.8em; color: #4b5d88; margin-top: 6px;">D20 PRESETS (${d20.length})</div>
            ${buildItemList("d20Profiles", d20)}
            <div style="font-weight: 600; font-size: 0.8em; color: #c9510c; margin-top: 6px;">QUICK MACROS (${quick.length})</div>
            ${buildItemList("quickMacroProfiles", quick)}
          </div>`;
      }

      const d = new Dialog({
        title: "Persistent Storage Inspector",
        content: `<div style="max-height: 480px; overflow-y: auto; padding-right: 4px;">${sectionsHtml}</div>`,
        buttons: { close: { label: "Done" } },
        render: (html) => {
          html.find('.del-item-btn').on('click', async (e) => {
            const aId = $(e.currentTarget).data('actor');
            const cat = $(e.currentTarget).data('cat');
            const item = $(e.currentTarget).data('item');
            if (cat === "quickMacroProfiles") {
              const macroData = store[aId]?.[cat]?.[item];
              const targetName = macroData?.chatCardTitle || macroData?.macroName;
              if (targetName) {
                const m = game.macros.find(macro => macro.name === targetName);
                if (m) await m.delete();
              }
            }
            delete store[aId][cat][item];
            await game.settings.set("world", "customRollProfiles", store);
            ui.notifications.info(`Removed "${item}" from storage.`);
            d.close();
            renderInspector();
          });
          html.find('.del-actor-btn').on('click', async (e) => {
            const aId = $(e.currentTarget).data('actor');
            const confirmed = await Dialog.confirm({ title: "Confirm Wipe", content: "<p>Delete ALL persistent data for this actor?</p>" });
            if (confirmed) {
              delete store[aId];
              await game.settings.set("world", "customRollProfiles", store);
              ui.notifications.warn("Actor profile deleted.");
              d.close();
              renderInspector();
            }
          });
        }
      }, { width: 420, height: "auto" });
      d.render(true);
    }
    renderInspector();
  };



}
