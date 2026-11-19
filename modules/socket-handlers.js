// =============================================================================
// SOCKETLIB REGISTRATION & EXECUTION HANDLERS
// =============================================================================

import { MODULE_ID, SETTINGS } from "../src/constants.js";

function getSetting(key, fallback = true) {
  if (game.settings.settings.has(`${MODULE_ID}.${key}`)) {
    return game.settings.get(MODULE_ID, key);
  }
  if (game.settings.settings.has(`cheapdice.${key}`)) {
    return game.settings.get("cheapdice", key);
  }
  return fallback;
}

/**
 * Resolves an actor's effective spell attack bonus and spell save DC across dnd5e 5.x and 6.x.
 * @param {object} actor
 * @param {string} [spellAbility]
 * @returns {{ spellAttackBonus: number, spellSaveDC: number, itemAttackBonus: number, itemDcBonus: number }}
 */
export function getActorSpellBonuses(actor, spellAbility) {
  const sys = actor?.system || {};
  const parseNumericBonus = (val) => {
    if (val === null || val === undefined || val === "") return 0;
    if (typeof val === "number") return Number.isFinite(val) ? val : 0;
    const compact = String(val).replace(/\s+/g, "");
    if (!compact || !/^(?:[+-]?\d+(?:\.\d+)?)+$/.test(compact)) return 0;
    const terms = compact.match(/[+-]?\d+(?:\.\d+)?/g);
    return terms ? terms.reduce((sum, term) => sum + Number(term), 0) : 0;
  };

  const abilKey = spellAbility || sys.attributes?.spellcasting || "int";
  const abilityMod = Number(sys.abilities?.[abilKey]?.mod ?? 0);
  const prof = Number(sys.attributes?.prof ?? 0);

  const rsakBonus = parseNumericBonus(sys.rolls?.attack?.rsak?.bonus) || parseNumericBonus(sys.bonuses?.rsak?.attack);
  const msakBonus = parseNumericBonus(sys.rolls?.attack?.msak?.bonus) || parseNumericBonus(sys.bonuses?.msak?.attack);
  const globalSpellAtkBonus = parseNumericBonus(sys.rolls?.attack?.spell?.bonus) || parseNumericBonus(sys.bonuses?.spell?.attack);
  const rmakBonus = (rsakBonus !== 0 && rsakBonus === msakBonus) ? rsakBonus : (rsakBonus || msakBonus || 0);

  const baseSpellAtk = prof + abilityMod;
  const rawAtk = sys.attributes?.spell?.attack;
  const usesActorSpellcasting = !spellAbility || spellAbility === sys.attributes?.spellcasting;
  let spellAttackBonus = (usesActorSpellcasting && rawAtk !== undefined && rawAtk !== null) ? Number(rawAtk) : baseSpellAtk;
  if (!Number.isFinite(spellAttackBonus)) spellAttackBonus = baseSpellAtk;
  spellAttackBonus += rmakBonus;
  if (globalSpellAtkBonus !== 0 && (!usesActorSpellcasting || rawAtk === undefined || rawAtk === null || Number(rawAtk) === baseSpellAtk)) {
    spellAttackBonus += globalSpellAtkBonus;
  }

  const baseSpellDC = 8 + prof + abilityMod;
  const rawDC = sys.attributes?.spell?.dc ?? sys.attributes?.spelldc;
  let spellSaveDC = (usesActorSpellcasting && rawDC !== undefined && rawDC !== null) ? Number(rawDC) : baseSpellDC;
  if (!Number.isFinite(spellSaveDC)) spellSaveDC = baseSpellDC;
  const spellBonusDC = parseNumericBonus(sys.bonuses?.spell?.dc);
  if (spellBonusDC !== 0 && (!usesActorSpellcasting || rawDC === undefined || rawDC === null || Number(rawDC) === baseSpellDC)) {
    spellSaveDC += spellBonusDC;
  }

  return {
    spellAttackBonus,
    spellSaveDC,
    itemAttackBonus: spellAttackBonus - baseSpellAtk,
    itemDcBonus: spellSaveDC - baseSpellDC
  };
}

/**
 * Injects an exact d20 face value into an evaluated Foundry Roll without mutating frozen result entries.
 * @param {object} roll
 * @param {number} d20Value
 * @param {number|null} [totalOverride]
 * @returns {number|null}
 */
export function injectD20IntoRoll(roll, d20Value, totalOverride = null) {
  const inj = Number(d20Value);
  if (!roll || !Number.isFinite(inj) || inj < 1 || inj > 20) return null;
  const d20Term = roll.terms?.find((t) => t.faces === 20 || (typeof Die !== "undefined" && t instanceof Die)) || roll.dice?.[0];
  if (!d20Term || !Array.isArray(d20Term.results) || d20Term.results.length === 0) return null;
  const origVal = Number(d20Term.results[0]?.result ?? roll.total ?? 0);
  d20Term.results = [{ result: inj, active: true }];
  d20Term._evaluated = true;
  roll._total = totalOverride !== null && Number.isFinite(Number(totalOverride))
    ? Number(totalOverride)
    : Number(roll.total ?? 0) + (inj - origVal);
  roll._evaluated = true;
  return inj;
}

/**
 * Injects exact DDB die face values into an evaluated Foundry Roll's dice terms.
 * @param {object} roll
 * @param {Array<object|number>} ddbDice
 * @param {number|null} [totalOverride]
 */
export function injectDiceIntoRoll(roll, ddbDice, totalOverride = null) {
  if (!roll || !Array.isArray(ddbDice) || ddbDice.length === 0) return;
  let dieIdx = 0;
  for (const term of roll.terms || []) {
    if (!Array.isArray(term.results)) continue;
    term.results = term.results.map((res) => {
      if (ddbDice[dieIdx] === undefined) return res;
      const ddbDie = ddbDice[dieIdx++];
      return {
        ...res,
        result: Number(ddbDie.dieValue ?? ddbDie),
        active: ddbDie.dropped !== undefined ? !ddbDie.dropped : (res.active ?? true)
      };
    });
    term._evaluated = true;
  }
  if (totalOverride !== null && Number.isFinite(Number(totalOverride))) {
    roll._total = Number(totalOverride);
  }
  roll._evaluated = true;
}

// --- Helper: Chat Card Disposition & Player Border Outline Wrapper ---
export function getCardDispositionWrapper(actor, token, userId, innerHtml) {
  if (typeof game === "undefined") return innerHtml;
  const rollUser = game.users?.get(userId) || game.user;
  if (!rollUser) return innerHtml;

  let borderColor = null;
  let glowColor = null;

  if (rollUser.isGM) {
    // If GM is rolling a player-owned token, do not apply DM disposition outline
    if (actor?.hasPlayerOwner) return innerHtml;

    const tok = token || actor?.getActiveTokens?.()[0];
    const disposition = tok?.document?.disposition ?? actor?.prototypeToken?.disposition;

    // Match Foundry token border colors:
    // FRIENDLY = #43dfdf (cyan), NEUTRAL = #f1d836 (yellow), HOSTILE = #e72124 (red), SECRET = #a612d3 (purple)
    if (disposition === CONST.TOKEN_DISPOSITIONS?.HOSTILE) {
      borderColor = "rgba(231, 33, 36, 0.75)";
      glowColor = "rgba(231, 33, 36, 0.18)";
    } else if (disposition === CONST.TOKEN_DISPOSITIONS?.NEUTRAL) {
      borderColor = "rgba(241, 216, 54, 0.75)";
      glowColor = "rgba(241, 216, 54, 0.18)";
    } else if (disposition === CONST.TOKEN_DISPOSITIONS?.FRIENDLY) {
      borderColor = "rgba(67, 223, 223, 0.75)";
      glowColor = "rgba(67, 223, 223, 0.18)";
    } else if (disposition === CONST.TOKEN_DISPOSITIONS?.SECRET) {
      borderColor = "rgba(166, 18, 211, 0.75)";
      glowColor = "rgba(166, 18, 211, 0.18)";
    }
  } else {
    // For non-GM players rolling tokens they own: color card using their player color
    const isOwner = actor?.testUserPermission ? actor.testUserPermission(rollUser, "OWNER") : actor?.isOwner;
    if (isOwner && rollUser.color) {
      let hex = rollUser.color;
      if (typeof hex === "object" && typeof hex.css === "string") {
        hex = hex.css;
      } else {
        hex = String(hex);
      }

      let r = 0, g = 0, b = 0;
      const cleanHex = hex.replace("#", "");
      if (cleanHex.length === 3) {
        r = parseInt(cleanHex[0] + cleanHex[0], 16);
        g = parseInt(cleanHex[1] + cleanHex[1], 16);
        b = parseInt(cleanHex[2] + cleanHex[2], 16);
      } else if (cleanHex.length >= 6) {
        r = parseInt(cleanHex.substring(0, 2), 16);
        g = parseInt(cleanHex.substring(2, 4), 16);
        b = parseInt(cleanHex.substring(4, 6), 16);
      }

      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        borderColor = `rgba(${r}, ${g}, ${b}, 0.75)`;
        glowColor = `rgba(${r}, ${g}, ${b}, 0.18)`;
      }
    }
  }

  if (!borderColor) return innerHtml;

  return `<div style="border: 1.5px solid ${borderColor}; border-radius: 6px; padding: 6px 8px; box-shadow: 0 0 8px 1px ${glowColor}, inset 0 0 6px 0 ${glowColor}; background: linear-gradient(to bottom, ${glowColor} 0%, transparent 18%);">${innerHtml}</div>`;
}

function registerSocketHandlers() {
  if (!getSetting("featureSocketHandlers")) return;
  const ownMod = typeof game !== "undefined" ? game.modules?.get(MODULE_ID) : null;
  if (ownMod?.api?.socket) return;
  let socket = null;
  if (typeof socketlib.registerModule === "function") {
    socket = socketlib.registerModule(MODULE_ID) || socketlib.registerModule("cheapdice");
  }
  if (!socket && typeof socketlib.registerSystem === "function") {
    socket = socketlib.registerSystem("dnd5e");
  }
  if (!socket) {
    console.error("[CheapDice] Failed to initialize SocketLib socket.");
    return;
  }
  globalThis.attackSocket = socket;

  // Expose socket on module public API
  const mod = ownMod || (typeof game !== "undefined" ? game.modules?.get("cheapdice") : null);
  if (mod) {
    mod.api = mod.api || {};
    mod.api.socket = socket;
  }

  function showTimerDialog(label, endTime) {
    if (activeTimerDialog) activeTimerDialog.close();

    const updateContent = (remaining) => `
      <div style="text-align: center; padding: 10px;">
        <h3 style="margin-top: 0;">${label}</h3>
        <div style="font-size: 2em; font-weight: bold; margin: 10px 0;">
          ${Math.floor(remaining / 60)}:${(remaining % 60).toString().padStart(2, '0')}
        </div>
      </div>
    `;

    activeTimerDialog = new Dialog({
      title: label,
      content: updateContent(Math.max(0, Math.round((endTime - Date.now()) / 1000))),
      buttons: {},
      close: () => {
        clearInterval(interval);
        activeTimerDialog = null;
      }
    });

    activeTimerDialog.render(true);

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      if (!activeTimerDialog?.element?.length) {
        clearInterval(interval);
        return;
      }

      if (remaining <= 0) {
        clearInterval(interval);
        activeTimerDialog.data.content = `
          <div style="text-align: center; padding: 10px;">
            <h3 style="margin-top: 0;">${label}</h3>
            <div style="font-size: 2em; font-weight: bold; color: #a34848; margin: 10px 0;">
              Time's Up!
            </div>
          </div>
        `;
        activeTimerDialog.render(true);

        if (game.user.isGM) {
          ChatMessage.create({
            content: `
              <div style="background: rgba(0, 0, 0, 0.4); padding: 10px 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3); text-align: center; font-family: inherit;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin: 0 0 8px 0; padding-bottom: 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); font-size: 1.1em; font-weight: 600; color: #f0f0e0;">
                  <i class="fas fa-hourglass-end" style="color: #a34848;"></i>
                  <span>${label}</span>
                </div>
                <div style="margin: 8px 0; font-size: 1.6em; font-weight: bold; letter-spacing: 1px; color: #a34848; text-shadow: 0 0 8px rgba(163, 72, 72, 0.3);">
                  Time's Up!
                </div>
              </div>
            `
          });
        }
      } else {
        activeTimerDialog.element.find('.dialog-content').html(updateContent(remaining));
      }
    }, 1000);
  }

  function closeTimerDialog() {
    if (activeTimerDialog) {
      activeTimerDialog.close();
    }
  }

  socket.register("showTimerDialog", showTimerDialog);
  socket.register("closeTimerDialog", closeTimerDialog);

  window.TimerSocket = {
    start: (label, durationSeconds) => {
      const endTime = Date.now() + durationSeconds * 1000;
      socket.executeForEveryone("showTimerDialog", label, endTime);
    },
    cancel: () => {
      socket.executeForEveryone("closeTimerDialog");
    }
  };


  // --- 2.2 Attack Execution Handler ---
  socket.register("runAttackRoll", async (config, actorId, userId) => {
    const actor = game.actors.get(actorId);
    if (!actor) {
      return ui.notifications.warn("Actor not found for attack execution.");
    }

    const {
      abilityScore, damageType,
      weaponModifier, attackCircumstanceModifier, damageModifier, CRIT_THRESHOLD,
      HAS_HALFLING_LUCKY, HALFLING_LUCKY_REROLL_THRESHOLD, GWF_REROLL_THRESHOLD,
      superAdv, additionalDamageComponents, chatCardTitle,
      extraAttackModifier, extraDamageModifier,
      secondaryAbilityMod, secondaryAbilityKey, secondaryAbilityLabel,
      secondaryDamageAbilityMod, secondaryDamageAbilityKey, secondaryDamageAbilityLabel
    } = config;

    const isProficient = config.isProficient !== undefined ? (String(config.isProficient) === "true" || config.isProficient === true) : true;
    const isLucky = String(HAS_HALFLING_LUCKY) === "true" || HAS_HALFLING_LUCKY === true;
    const luckyThreshold = Number(HALFLING_LUCKY_REROLL_THRESHOLD) || 1;
    const gwfThreshold = Number(GWF_REROLL_THRESHOLD) || 0;
    const isSuperAdv = String(superAdv) === "true" || superAdv === true;

    const damageDiceCount = Math.max(0, Number(config.damageDiceCount) || 0);
    const rawDie = String(config.damageDieSize || "").toLowerCase() === "none" ? "none" : String(config.damageDieSize || "6").replace(/^d/i, "");
    const cleanDieSize = rawDie === "none" ? "" : `d${rawDie}`;
    const maxDieValue = rawDie === "none" ? 0 : (Number(rawDie) || 0);

    const abilityMod = actor.system.abilities[abilityScore]?.mod || 0;
    const prof = isProficient ? (actor.system.attributes.prof || 0) : 0;
    const secAbilBonus = Number(secondaryAbilityMod) || 0;
    const totalAttackModifier = abilityMod + prof + weaponModifier + attackCircumstanceModifier + secAbilBonus;
    const actorName = actor.name;
    const speaker = ChatMessage.getSpeaker({ actor });

    const rollUser = game.users.get(userId) || game.user;
    const token = actor.getActiveTokens()[0];
    let autoTargetedToken = null;
    let targetIds = Array.isArray(config?.targetIds) && config.targetIds.length > 0
      ? config.targetIds.filter(Boolean)
      : Array.from(rollUser?.targets || game.user.targets).map(t => t.id);

    const animationsEnabled = getSetting("featureAnimations");
    if (animationsEnabled && targetIds.length === 0 && token) {
      const isHostileNpc = actor.type === "npc" && (token.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE);
      if (!isHostileNpc) {
        const hostiles = canvas.tokens.placeables.filter(t => {
          if (t.id === token.id) return false;
          if (t.document.disposition !== CONST.TOKEN_DISPOSITIONS.HOSTILE) return false;
          if (!t.visible || t.document.hidden) return false;
          const isInvisible = t.actor?.statuses?.has?.("invisible") ||
            t.actor?.effects?.some(e => !e.disabled && (e.statuses?.has?.("invisible") || /invis/i.test(e.name || "")));
          return !isInvisible;
        });
        if (hostiles.length > 0) {
          let nearestHostile = null;
          let minDistance = Infinity;
          for (const h of hostiles) {
            const dist = Math.hypot(h.center.x - token.center.x, h.center.y - token.center.y);
            if (dist < minDistance) {
              minDistance = dist;
              nearestHostile = h;
            }
          }
          if (nearestHostile) {
            autoTargetedToken = nearestHostile;
            targetIds = [nearestHostile.id];
            try {
              nearestHostile.setTarget(true, { user: rollUser, releaseOthers: false });
            } catch (e) {
              console.warn("[CustomRolls] Could not set canvas target for user:", e);
            }
          }
        }
      }
    }

    function parseDamageFormula(formula) {
      if (!formula || typeof formula !== 'string') return 0;
      const diceMatches = formula.matchAll(/(\d*)d(\d+)/gi);
      let totalMaxDamage = 0;
      for (const match of diceMatches) {
        const count = parseInt(match[1]) || 1;
        const max = parseInt(match[2]);
        if (max > 0) totalMaxDamage += count * max;
      }
      return totalMaxDamage;
    }

    // Evaluates an individual d20 and performs a Halfling Lucky reroll if threshold is met
    async function _rollSingleD20() {
      let roll = await new Roll("1d20").evaluate();
      let val = roll.total;
      let rerollSummary = null;

      if (isLucky && val <= luckyThreshold) {
        let reroll = await new Roll("1d20").evaluate();
        rerollSummary = { original: val, final: reroll.total };
        val = reroll.total;
        roll = reroll;
      }

      return { val, roll, rerollSummary };
    }

    async function _rollAttackAndCheckCrit() {
      const cleanExtraAtk = (extraAttackModifier || "").trim();
      const atkSuffix = `${totalAttackModifier >= 0 ? `+ ${totalAttackModifier}` : `- ${Math.abs(totalAttackModifier)}`}${cleanExtraAtk ? (cleanExtraAtk.startsWith("+") || cleanExtraAtk.startsWith("-") ? ` ${cleanExtraAtk}` : ` + ${cleanExtraAtk}`) : ""}`;

      let roll1 = await new Roll(`1d20 ${atkSuffix}`).evaluate();
      let d20Term1 = roll1.terms.find(t => t.faces === 20) || roll1.dice[0];
      let val1 = Number(d20Term1?.results?.[0]?.result ?? roll1.total);
      let rerollSummary1 = null;

      const injectedVal1 = injectD20IntoRoll(roll1, config.injectedD20_1);
      if (injectedVal1 !== null) {
        val1 = injectedVal1;
      } else if (isLucky && val1 <= luckyThreshold) {
        let reroll1 = await new Roll(`1d20 ${atkSuffix}`).evaluate();
        let rerolledTerm1 = reroll1.terms.find(t => t.faces === 20) || reroll1.dice[0];
        let newVal1 = Number(rerolledTerm1?.results?.[0]?.result ?? reroll1.total);
        rerollSummary1 = { original: val1, final: newVal1 };
        val1 = newVal1;
        roll1 = reroll1;
      }

      let html1 = await roll1.render();
      if (val1 >= CRIT_THRESHOLD) html1 = html1.replace('dice-total', 'dice-total critical');
      else if (val1 === 1) html1 = html1.replace('dice-total', 'dice-total fumble');

      const cloneTerm = (t) => {
        if (typeof t.clone === "function") return t.clone();
        if (typeof t.constructor?.fromData === "function") return t.constructor.fromData(t.toJSON());
        return RollTerm.fromJSON(JSON.stringify(t));
      };

      // Roll second d20 slot reusing evaluated modifier terms from roll1
      let slot2D20 = null;
      let droppedCandidate = null;
      let extraRolls = [];

      const hasInjected2 = Number.isFinite(Number(config.injectedD20_2)) && Number(config.injectedD20_2) >= 1 && Number(config.injectedD20_2) <= 20;
      if (hasInjected2) {
        const injRoll2 = await new Roll("1d20").evaluate();
        const inj2 = injectD20IntoRoll(injRoll2, config.injectedD20_2, Number(config.injectedD20_2)) ?? Number(config.injectedD20_2);
        slot2D20 = { val: inj2, roll: injRoll2, rerollSummary: null };
        extraRolls.push(slot2D20.roll);
      } else if (isSuperAdv) {
        const candA = await _rollSingleD20();
        const candB = await _rollSingleD20();
        extraRolls.push(candA.roll, candB.roll);
        if (candA.val >= candB.val) {
          slot2D20 = candA;
          droppedCandidate = candB;
        } else {
          slot2D20 = candB;
          droppedCandidate = candA;
        }
      } else {
        slot2D20 = await _rollSingleD20();
        extraRolls.push(slot2D20.roll);
      }

      const terms2 = [cloneTerm(slot2D20.roll.terms[0]), ...roll1.terms.slice(1).map(cloneTerm)];
      let roll2 = Roll.fromTerms(terms2);
      if (!roll2._evaluated) {
        await roll2.evaluate();
      }
      let html2 = await roll2.render();
      if (slot2D20.val >= CRIT_THRESHOLD) html2 = html2.replace('dice-total', 'dice-total critical');
      else if (slot2D20.val === 1) html2 = html2.replace('dice-total', 'dice-total fumble');

      if (isSuperAdv && droppedCandidate) {
        const superAdvHtml = `<div style="padding: 2px 4px; margin: 3px 0 0; border: 1px solid #7289DA; border-radius: 3px; background-color: #f0f4ff; font-size: 0.75em; text-align: center;">
        <span style="font-weight: bold; color: #4b5d88;">Super Adv (Kept d20: ${slot2D20.val} | Dropped: ${droppedCandidate.val})</span>
      </div>`;
        html2 += superAdvHtml;
      }

      const isCritical = val1 >= CRIT_THRESHOLD || slot2D20.val >= CRIT_THRESHOLD;

      return {
        attackRoll1: roll1,
        rollHtml1: html1,
        rerollSummary1,
        attackRoll2: roll2,
        rollHtml2: html2,
        rerollSummary2: slot2D20.rerollSummary,
        extraRolls,
        isCritical
      };
    }

    async function _rollDamageDice() {
      if (damageDiceCount <= 0 || !cleanDieSize || maxDieValue <= 0) {
        return { finalCombinedDieResult: 0, finalDieResults: [], allDieRolls: [], rerollSummary: [], savageAttackerSummary: null, floorSummary: null, piercerSummary: null };
      }
      const damageDieFormula = `1${cleanDieSize}`;

      const hasFloor = (config.hasDamageFloor === true || String(config.hasDamageFloor) === "true") && Number(config.damageFloorValue) > 0;
      const floorValue = hasFloor ? Number(config.damageFloorValue) : 0;
      const floorLabel = (config.damageFloorLabel || "").trim() || "Damage Floor";

      let floorAppliedCount = 0;

      async function _rollSinglePass() {
        const passRolls = [];
        const passResults = [];
        const passRerolls = [];
        let passFloorCount = 0;
        for (let i = 0; i < damageDiceCount; i++) {
          let initialRoll = await new Roll(damageDieFormula).evaluate();
          let currentResult = Number(initialRoll.total);
          passRolls.push(initialRoll);

          if (gwfThreshold > 0 && currentResult <= gwfThreshold) {
            let reroll = await new Roll(damageDieFormula).evaluate();
            passRolls.push(reroll);
            passRerolls.push({ original: currentResult, reroll: Number(reroll.total) });
            currentResult = Number(reroll.total);
          }

          if (hasFloor && currentResult < floorValue) {
            passFloorCount++;
            currentResult = floorValue;
          }

          passResults.push(currentResult);
        }
        const total = passResults.reduce((a, b) => a + b, 0);
        return { total, passResults, passRolls, passRerolls, passFloorCount };
      }

      let finalCombinedDieResult = 0;
      let finalDieResults = [];
      let allDieRolls = [];
      let rerollSummary = [];
      let savageAttackerSummary = null;

      const pass = await _rollSinglePass();
      allDieRolls = pass.passRolls;
      floorAppliedCount = pass.passFloorCount;
      finalCombinedDieResult = pass.total;
      finalDieResults = [...pass.passResults];
      rerollSummary = pass.passRerolls;

      // Check Piercer Feat
      let piercerSummary = null;
      if (config.isPiercerActive && finalDieResults.length > 0) {
        let minIndex = 0;
        let minVal = finalDieResults[0];
        for (let i = 1; i < finalDieResults.length; i++) {
          if (finalDieResults[i] < minVal) {
            minVal = finalDieResults[i];
            minIndex = i;
          }
        }
        let piercerRoll = await new Roll(damageDieFormula).evaluate();
        allDieRolls.push(piercerRoll);
        let piercerVal = Number(piercerRoll.total);
        if (hasFloor && piercerVal < floorValue) {
          piercerVal = floorValue;
          floorAppliedCount++;
        }
        finalDieResults[minIndex] = piercerVal;
        finalCombinedDieResult = finalDieResults.reduce((a, b) => a + b, 0);
        piercerSummary = {
          original: minVal,
          reroll: piercerVal,
          label: (config.piercerLabel || "").trim() || "Piercer"
        };
      }

      const floorSummary = floorAppliedCount > 0 ? {
        count: floorAppliedCount,
        value: floorValue,
        label: floorLabel
      } : null;

      return {
        finalCombinedDieResult,
        finalDieResults,
        allDieRolls,
        rerollSummary,
        savageAttackerSummary,
        floorSummary,
        piercerSummary
      };
    }

    async function _rollAdditionalDamage(selectedDamageComponents, isCritical) {
      const results = [];
      let additionalDamageTotal = 0;
      let critOnlyDamageTotal = 0;
      const allAdditionalDamageRolls = [];

      for (const component of selectedDamageComponents) {
        if (component.onlyCrit && !isCritical) continue;
        const formula = component.formula;
        const label = component.label;
        const isCrit = component.isCrit;
        const compDmgType = component.damageType;

        let total = 0;
        let html = "";

        if (component.onlyCrit && isCrit && /[dD]/.test(formula)) {
          total = parseDamageFormula(formula);
          html = `<div class="dice-roll"><div class="dice-result"><h4 class="dice-formula" style="display: none;">${formula}</h4><div class="dice-tooltip"></div><h4 class="dice-total critical">${total}</h4></div></div>`;
        } else {
          let additionalDamageRoll = await new Roll(formula).evaluate();
          total = additionalDamageRoll.total;
          html = await additionalDamageRoll.render();
          allAdditionalDamageRolls.push(additionalDamageRoll);
          html = html.replace(`<h4 class="dice-formula">${formula}</h4>`, `<h4 class="dice-formula" style="display: none;">${formula}</h4>`);
        }

        results.push({ formula, label, total, html, isCrit, onlyCrit: component.onlyCrit, damageType: compDmgType });

        if (component.onlyCrit) {
          critOnlyDamageTotal += total;
        } else {
          additionalDamageTotal += total;
        }
      }
      return { additionalDamageTotal, critOnlyDamageTotal, additionalDamageResults: results, allAdditionalDamageRolls };
    }

    function _generateDamageDetailsHTML(flavorText, damageBonus, flatBonus, finalCombinedDieResult, rerollSummary, finalDieResults = [], savageAttackerSummary = null) {
      let html = `<p style="text-align: center; font-weight: bold; margin: 5px 0;">${flavorText}</p>`;
      if (savageAttackerSummary) {
        const r1Display = (savageAttackerSummary.roll1Dice && savageAttackerSummary.roll1Dice.length > 1)
          ? `${savageAttackerSummary.roll1Total} [${savageAttackerSummary.roll1Dice.join('+')}]`
          : savageAttackerSummary.roll1Total;
        const r2Display = (savageAttackerSummary.roll2Dice && savageAttackerSummary.roll2Dice.length > 1)
          ? `${savageAttackerSummary.roll2Total} [${savageAttackerSummary.roll2Dice.join('+')}]`
          : savageAttackerSummary.roll2Total;
        const keptDisplay = (savageAttackerSummary.keptDice && savageAttackerSummary.keptDice.length > 1)
          ? `${savageAttackerSummary.keptTotal} [${savageAttackerSummary.keptDice.join('+')}]`
          : savageAttackerSummary.keptTotal;

        html += `
        <div style="padding: 4px 6px; margin: 4px 0; border: 1px solid #8c3b2d; border-radius: 4px; background-color: rgba(140, 59, 45, 0.08); font-size: 0.85em; text-align: center;">
          <span style="font-weight: 700; color: #8c3b2d;">Savage Attacker:</span>
          <span>Rolled <strong>${r1Display}</strong> vs <strong>${r2Display}</strong> &rarr; <strong style="color: #18520b;">Kept ${keptDisplay}</strong></span>
        </div>`;
      }
      if (rerollSummary.length > 0) {
        html += `<div style="padding: 5px; margin: 5px 0; border: 1px solid #7289DA; border-radius: 4px; background-color: #e6eaff; font-size: 0.85em;">
                <p style="margin: 0 0 5px; font-weight: 600; color: #7289DA;">Rerolls:</p>
                <ul style="margin: 0; padding-left: 15px;">`;
        rerollSummary.forEach(s => {
          html += `<li style="list-style-type: none; margin-bottom: 3px; border-bottom: 1px solid #c7d2e4;">
                  <span style="font-weight: bold; color: #dc3545;">Original ${s.original}</span>
                  <span style="color: #6c757d;">&rarr;</span>
                  <span style="font-weight: bold; color: #28a745;">New ${s.reroll}</span>
                </li>`;
        });
        html += `</ul></div>`;
      }
      const showSavageButton = Boolean((config.hasSavageAttacker || config.isSavageAttackerActive) && damageDiceCount > 0 && cleanDieSize && maxDieValue > 0);
      const savageBtnHtml = showSavageButton ? `
      <div class="cheapdice-sa-container" style="margin-top: 5px; text-align: center;">
        <button type="button" class="cheapdice-savage-attacker-btn" style="font-size: 0.78em; font-weight: 700; color: #8c3b2d; background: rgba(140, 59, 45, 0.1); border: 1px solid #8c3b2d; border-radius: 4px; padding: 3px 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
          Savage Attacker
        </button>
      </div>` : "";
      html += `
      <div style="display: flex; justify-content: center; align-items: center; gap: 8px; text-align: center; font-size: 0.9em; margin-top: 5px;">
        <div style="padding: 5px; border: 1px solid #ccc; border-radius: 4px; background-color: #f8f9fa;">
          <p style="margin: 0; font-weight: 600; font-size: 0.9em;">Results (${damageDiceCount > 0 && cleanDieSize ? `${damageDiceCount}${cleanDieSize}` : 'Flat Dmg'})</p>
          <span class="cheapdice-dmg-die-total" style="font-weight: bold; font-size: 1.5em;">${finalCombinedDieResult}</span>
          ${finalDieResults.length > 0 ? `<p class="cheapdice-dmg-die-list" style="margin: 2px 0 0; font-size: 0.8em; color: #555;">Dice: [${finalDieResults.join(', ')}]</p>` : ''}
        </div>
      </div>
      ${savageBtnHtml}`;
      const totalDamageMods = damageBonus + flatBonus;
      const sign = totalDamageMods >= 0 ? '+' : '';
      html += `<p style="text-align: center; font-weight: 500; font-size: 0.9em; margin: 5px 0 0;">Damage Mods = ${sign}${totalDamageMods}</p>`;
      return html;
    }

    function _getHalflingRerollHTML(rerollSummary) {
      if (!rerollSummary) return '';
      return `<div style="padding: 5px; margin: 5px 0 0; border: 1px solid #17a2b8; border-radius: 4px; background-color: #e0f7fa; font-size: 0.8em; text-align: center;">
              <p style="margin: 0; font-weight: 600; color: #17a2b8;">Halfling Lucky Reroll</p>
              <span style="color: #dc3545;">Rolled ${rerollSummary.original}</span> &rarr; <span style="font-weight: bold; color: #007bff;">Rerolled ${rerollSummary.final}</span>
            </div>`;
    }

    const { attackRoll1, rollHtml1, rerollSummary1, attackRoll2, rollHtml2, rerollSummary2, extraRolls, isCritical } = await _rollAttackAndCheckCrit();
    const { finalCombinedDieResult, finalDieResults, allDieRolls, rerollSummary, savageAttackerSummary, floorSummary, piercerSummary } = await _rollDamageDice();
    const activeComponents = (additionalDamageComponents || []).filter(c => c.isActive);
    const cleanExtraDmg = (extraDamageModifier || "").trim();
    if (cleanExtraDmg) {
      activeComponents.push({
        label: "Extra Dmg",
        formula: cleanExtraDmg,
        damageType: damageType,
        isCrit: true,
        isActive: true
      });
    }
    const { additionalDamageTotal, critOnlyDamageTotal, additionalDamageResults, allAdditionalDamageRolls } = await _rollAdditionalDamage(activeComponents, isCritical);

    let critAdditionalDamageComponent = 0;
    for (const result of additionalDamageResults) {
      if (!result.onlyCrit && result.isCrit && /[dD]/.test(result.formula)) {
        critAdditionalDamageComponent += parseDamageFormula(result.formula);
      }
    }

    let resolvedExtraCrit = 0;
    const rawCritBonus = String(config.extraCriticalBonus || "").trim();
    if (rawCritBonus !== "" && isCritical) {
      if (/[dD]/.test(rawCritBonus)) {
        resolvedExtraCrit = parseDamageFormula(rawCritBonus);
      } else {
        resolvedExtraCrit = Number(rawCritBonus) || 0;
      }
    }
    const extraCritLabel = (config.extraCriticalLabel || "Extra Crit").trim();
    const extraCritType = (config.extraCriticalType || damageType).trim();

    const secDmgAbilBonus = Number(secondaryDamageAbilityMod) || 0;
    const damageBonus = abilityMod + weaponModifier + secDmgAbilBonus;
    const flatBonus = damageModifier;
    const maximizedWeaponDice = damageDiceCount * maxDieValue;
    const totalMaxDiceCrit = maximizedWeaponDice + critAdditionalDamageComponent;
    const finalGWFTotal = finalCombinedDieResult + damageBonus + flatBonus + additionalDamageTotal;
    const allCriticalTotal = totalMaxDiceCrit + resolvedExtraCrit + critOnlyDamageTotal;
    const criticalTotal = finalGWFTotal + totalMaxDiceCrit + resolvedExtraCrit + critOnlyDamageTotal;

    const finalRolls = [attackRoll1, ...extraRolls, ...allDieRolls, ...allAdditionalDamageRolls];
    const baseDamageFormulaSummary = damageDiceCount > 0 && cleanDieSize ? `${damageDiceCount}${cleanDieSize}` : "Flat Dmg";
    const baseDamageFlavor = `${damageType.charAt(0).toUpperCase() + damageType.slice(1)} Damage (${baseDamageFormulaSummary})`;
    const normalDamageHTML = _generateDamageDetailsHTML(baseDamageFlavor, damageBonus, flatBonus, finalCombinedDieResult, rerollSummary, finalDieResults, savageAttackerSummary);

    let additionalDamageSectionHTML = '';
    let critAdditionalDiceList = '';
    if (additionalDamageResults.length > 0) {
      additionalDamageSectionHTML = `
      <hr style="margin: 5px 0 3px; border-top: 1px solid #7289DA;">
      <p style="font-weight: 600; font-size: 0.9em; color: #7289DA; text-align: center; margin-bottom: 3px;">ADDITIONAL DAMAGE</p>`;
      for (const result of additionalDamageResults) {
        const isDice = /[dD]/.test(result.formula);
        const maxVal = isDice ? parseDamageFormula(result.formula) : result.total;

        if (result.onlyCrit) {
          const maxTag = (result.isCrit && isDice) ? " Max" : "";
          critAdditionalDiceList += `<li style="list-style-type: disc;">${result.label} (${result.formula}${maxTag}): <span style="font-weight: bold;">+${result.total}</span></li>`;
        } else if (isCritical && result.isCrit && isDice) {
          critAdditionalDiceList += `<li style="list-style-type: disc;">${result.label} (${result.formula} Max): <span style="font-weight: bold;">+${maxVal}</span></li>`;
        }
        const componentDamageType = result.damageType.toUpperCase() === 'BPS' ? 'BPS' : (result.damageType.charAt(0).toUpperCase() + result.damageType.slice(1));
        additionalDamageSectionHTML += `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0 5px;">
          <span style="font-weight: 500; font-size: 0.85em;">${result.label} (${componentDamageType}):</span>
          <div style="width: 50%; flex-shrink: 0; text-align: right; transform: scale(.9);">${result.html}</div>
        </div>`;
      }
      additionalDamageSectionHTML += `<hr style="margin: 3px 0 5px; border-top: 1px solid #ddd;">`;
    } else {
      additionalDamageSectionHTML = `<hr style="margin: 5px 0 5px; border-top: 1px solid #ddd;">`;
    }

    let criticalBonusHTML = '';
    if (isCritical) {
      const flatBonusLabel = resolvedExtraCrit > 0
        ? `<li style="list-style-type: disc;">${extraCritLabel} (${rawCritBonus}): <span style="font-weight: bold;">+${resolvedExtraCrit}</span></li>`
        : '';
      criticalBonusHTML = `
      <p style="font-weight: 500; font-size: 0.95em; margin: 5px 0;"><strong>Critical Bonus: +${allCriticalTotal}</strong></p>
      <ul style="margin: 0 0 5px; padding-left: 15px; list-style-type: disc; font-size: 0.9em; line-height: 1.4;">
        ${damageDiceCount > 0 && cleanDieSize ? `<li style="list-style-type: disc;">Weapon Dice (${damageDiceCount}${cleanDieSize} Max): <span style="font-weight: bold;">+${maximizedWeaponDice}</span></li>` : ''}
        ${critAdditionalDiceList}
        ${flatBonusLabel}
      </ul>`;
    }

    let totalBlocks = `<p style="margin: 0; flex: 1; ${isCritical ? 'border-right: 1px solid #ddd;' : ''} padding: 0 5px;">Damage Total: <span class="cheapdice-damage-total-val" style="font-size: 1.2em; font-weight: bold;">${finalGWFTotal}</span></p>`;
    if (isCritical) {
      totalBlocks += `<p style="margin: 0; flex: 1; padding: 0 5px;">Critical Total: <span class="cheapdice-critical-total-val" style="font-size: 1.2em; font-weight: bold; color: #18520b;">${criticalTotal}</span></p>`;
    }

    const finalSummaryHTML = `
    ${additionalDamageSectionHTML}
    <div style="display: flex; justify-content: space-around; text-align: center; font-weight: bold; font-size: 1em;">
      ${totalBlocks}
    </div>
    <hr style="margin: 5px 0 0; border-top: 2px solid #343a40;">`;

    const reroll1Html = _getHalflingRerollHTML(rerollSummary1);
    const reroll2Html = _getHalflingRerollHTML(rerollSummary2);

    const abilityModSign = abilityMod >= 0 ? '+' : '';
    const weaponModSign = weaponModifier >= 0 ? '+' : '';
    const flatModSign = damageModifier >= 0 ? '+' : '';
    const baseDamageTypeDisplay = damageType.toUpperCase() === 'BPS' ? 'BPS' : (damageType.charAt(0).toUpperCase() + damageType.slice(1));

    const weaponDamageLine = damageDiceCount > 0 && cleanDieSize
      ? `<li style="list-style-type: disc;">Weapon Damage: <strong>${damageDiceCount}${cleanDieSize} (${baseDamageTypeDisplay})</strong></li>`
      : `<li style="list-style-type: disc;">Base Damage: <strong>Flat (${baseDamageTypeDisplay})</strong></li>`;

    const secDmgAbilSign = secDmgAbilBonus >= 0 ? '+' : '';
    const secDmgAbilKeyUpper = (secondaryDamageAbilityKey || "").toUpperCase();
    const secDmgAbilDisplayLabel = secondaryDamageAbilityLabel ? `${secondaryDamageAbilityLabel} (${secDmgAbilKeyUpper})` : `Secondary Ability (${secDmgAbilKeyUpper})`;

    let savageAttackerBreakdownLine = '';
    if (savageAttackerSummary) {
      const r1 = (savageAttackerSummary.roll1Dice && savageAttackerSummary.roll1Dice.length > 1)
        ? `${savageAttackerSummary.roll1Total} [${savageAttackerSummary.roll1Dice.join('+')}]`
        : savageAttackerSummary.roll1Total;
      const r2 = (savageAttackerSummary.roll2Dice && savageAttackerSummary.roll2Dice.length > 1)
        ? `${savageAttackerSummary.roll2Total} [${savageAttackerSummary.roll2Dice.join('+')}]`
        : savageAttackerSummary.roll2Total;
      const kp = (savageAttackerSummary.keptDice && savageAttackerSummary.keptDice.length > 1)
        ? `${savageAttackerSummary.keptTotal} [${savageAttackerSummary.keptDice.join('+')}]`
        : savageAttackerSummary.keptTotal;
      savageAttackerBreakdownLine = `<li style="list-style-type: disc;">Savage Attacker: <strong>Kept ${kp}</strong> (Rolled ${r1}, ${r2})</li>`;
    }

    let floorBreakdownLine = '';
    if (floorSummary) {
      floorBreakdownLine = `<li style="list-style-type: disc;">${floorSummary.label}: Minimum ${floorSummary.value} applied to ${floorSummary.count} ${floorSummary.count === 1 ? 'die' : 'dice'}</li>`;
    }

    let piercerBreakdownLine = '';
    if (piercerSummary) {
      piercerBreakdownLine = `<li style="list-style-type: disc;">${piercerSummary.label}: Rerolled ${piercerSummary.original} &rarr; <strong>${piercerSummary.reroll}</strong></li>`;
    }

    let damageDiceSummary = `<ul style="margin: 0 0 5px; padding-left: 15px; font-size: 0.95em; line-height: 1.4;">
    <li style="list-style-type: disc;">Ability Mod (${abilityScore.toUpperCase()}): <strong>${abilityModSign}${abilityMod}</strong></li>
    ${weaponDamageLine}
    ${savageAttackerBreakdownLine}
    ${floorBreakdownLine}
    ${piercerBreakdownLine}
    ${weaponModifier !== 0 ? `<li style="list-style-type: disc;">Weapon Modifier: <strong>${weaponModSign}${weaponModifier}</strong></li>` : ''}
    ${secDmgAbilBonus !== 0 ? `<li style="list-style-type: disc;">${secDmgAbilDisplayLabel}: <strong>${secDmgAbilSign}${secDmgAbilBonus}</strong></li>` : ''}
    ${damageModifier !== 0 ? `<li style="list-style-type: disc;">Other Damage Mod: <strong>${flatModSign}${damageModifier}</strong></li>` : ''}`;
    additionalDamageResults.forEach(c => {
      if (c.onlyCrit) return;
      const disp = c.damageType.toUpperCase() === 'BPS' ? 'BPS' : (c.damageType.charAt(0).toUpperCase() + c.damageType.slice(1));
      damageDiceSummary += `<li style="list-style-type: disc;">${c.label}: <strong>${c.formula} (${disp})</strong></li>`;
    });
    damageDiceSummary += `</ul>`;

    const attackCircumstanceModSign = attackCircumstanceModifier >= 0 ? '+' : '';
    const weaponModifierAttackSign = weaponModifier >= 0 ? '+' : '';
    const abilityModAttackSign = abilityMod >= 0 ? '+' : '';
    const secAbilSign = secAbilBonus >= 0 ? '+' : '';
    const secAbilKeyUpper = (secondaryAbilityKey || "").toUpperCase();
    const secAbilDisplayLabel = secondaryAbilityLabel ? `${secondaryAbilityLabel} (${secAbilKeyUpper})` : `Secondary Ability (${secAbilKeyUpper})`;
    const attackModifiersList = `<ul style="margin: 0 0 5px; padding-left: 15px; font-size: 0.95em; line-height: 1.4;">
    <li style="list-style-type: disc;">Ability Mod (${abilityScore.toUpperCase()}): <strong>${abilityModAttackSign}${abilityMod}</strong></li>
    <li style="list-style-type: disc;">Proficiency Bonus (PB): <strong>+${prof}</strong></li>
    ${weaponModifier !== 0 ? `<li style="list-style-type: disc;">Weapon Modifier: <strong>${weaponModifierAttackSign}${weaponModifier}</strong></li>` : ''}
    ${secAbilBonus !== 0 ? `<li style="list-style-type: disc;">${secAbilDisplayLabel}: <strong>${secAbilSign}${secAbilBonus}</strong></li>` : ''}
    ${attackCircumstanceModifier !== 0 ? `<li style="list-style-type: disc;">Other Mod: <strong>${attackCircumstanceModSign}${attackCircumstanceModifier}</strong></li>` : ''}
  </ul>`;

    let diceMap = {};
    let flatTotal = damageBonus + flatBonus;
    let otherParts = [];
    if (damageDiceCount > 0 && maxDieValue > 0) {
      diceMap[rawDie] = damageDiceCount;
    }

    additionalDamageResults.forEach(c => {
      if (c.onlyCrit) return;
      let parts = (c.formula || "").match(/[+-]?[^+-]+/g)?.map(p => p.trim()).filter(Boolean) || [];
      parts.forEach(p => {
        let cleanP = p.replace(/\s+/g, "");
        let diceMatch = cleanP.match(/^([+-]?)(\d*)[dD](\d+)$/);
        if (diceMatch) {
          let sign = diceMatch[1] === '-' ? -1 : 1;
          let count = (parseInt(diceMatch[2]) || 1) * sign;
          let size = diceMatch[3];
          diceMap[size] = (diceMap[size] || 0) + count;
        } else if (!isNaN(Number(cleanP)) && cleanP !== "") {
          flatTotal += Number(cleanP);
        } else {
          otherParts.push(p.replace(/^[+]/, '').trim());
        }
      });
    });

    let combinedDamageFormulas = [];
    Object.keys(diceMap).sort((a, b) => Number(b) - Number(a)).forEach(size => {
      if (diceMap[size] > 0) combinedDamageFormulas.push(diceMap[size] + 'd' + size);
    });
    combinedDamageFormulas.push(...otherParts);
    if (flatTotal !== 0) combinedDamageFormulas.push(flatTotal);
    if (combinedDamageFormulas.length === 0) combinedDamageFormulas.push("0");
    const finalDamageString = combinedDamageFormulas.join(" + ").replace(/\+\s*-\s*/g, "- ");

    const normalDamageByType = {};
    const critDamageByType = {};
    const addDmg = (obj, t, amt) => {
      const typeKey = (t || "slashing").toLowerCase();
      obj[typeKey] = (obj[typeKey] || 0) + amt;
    };

    addDmg(normalDamageByType, damageType, finalCombinedDieResult + damageBonus + flatBonus);
    addDmg(critDamageByType, damageType, finalCombinedDieResult + damageBonus + flatBonus + maximizedWeaponDice);

    if (resolvedExtraCrit > 0) {
      addDmg(critDamageByType, extraCritType, resolvedExtraCrit);
    }

    for (const result of additionalDamageResults) {
      if (!result.onlyCrit) addDmg(normalDamageByType, result.damageType, result.total);
      let critBonus = 0;
      if (result.isCrit && /[dD]/.test(result.formula)) {
        critBonus = parseDamageFormula(result.formula);
      }
      if (result.onlyCrit) {
        addDmg(critDamageByType, result.damageType, result.total);
      } else {
        addDmg(critDamageByType, result.damageType, result.total + critBonus);
      }
    }

    let normalBreakdownList = '';
    for (const [t, amt] of Object.entries(normalDamageByType)) {
      if (amt > 0) {
        const displayType = t.toUpperCase() === 'BPS' ? 'BPS' : (t.charAt(0).toUpperCase() + t.slice(1));
        normalBreakdownList += `<li class="cheapdice-breakdown-noncrit" data-dmg-type="${t}" style="list-style-type: disc;">${displayType}: <strong class="cheapdice-type-amt">${amt}</strong></li>`;
      }
    }

    let critBreakdownList = '';
    for (const [t, amt] of Object.entries(critDamageByType)) {
      if (amt > 0) {
        const displayType = t.toUpperCase() === 'BPS' ? 'BPS' : (t.charAt(0).toUpperCase() + t.slice(1));
        critBreakdownList += `<li class="cheapdice-breakdown-crit" data-dmg-type="${t}" style="list-style-type: disc;">${displayType}: <strong class="cheapdice-type-amt">${amt}</strong></li>`;
      }
    }

    const typeBreakdownHTML = `
    <p style="font-weight: 500; font-size: 0.95em; margin: 5px 0;"><strong>Non-Crit Dmg Breakdown:</strong></p>
    <ul style="margin: 0 0 5px; padding-left: 15px; font-size: 0.9em; line-height: 1.4;">${normalBreakdownList}</ul>
    ${isCritical ? `
    <p style="font-weight: 500; font-size: 0.95em; margin: 5px 0;"><strong>Critical Dmg Breakdown:</strong></p>
    <ul style="margin: 0 0 5px; padding-left: 15px; font-size: 0.9em; line-height: 1.4;">${critBreakdownList}</ul>` : ''}`;

    const contentSummary = `
    <details style="padding: 0 5px;">
      <summary style="font-weight: 600; font-size: 1em; text-decoration: underline; margin: 5px 0; cursor: pointer;">
        <strong>Attack/Damage Breakdown</strong>
      </summary>
      <div style="padding-top: 5px; border-top: 1px solid #ccc;">
        <p style="font-weight: 500; font-size: 0.95em; margin: 5px 0;"><strong>Attack: ${totalAttackModifier >= 0 ? '+' : ''}${totalAttackModifier}</strong></p>
        ${attackModifiersList}
        <p style="font-weight: 500; font-size: 0.95em; margin: 5px 0;"><strong>Damage Dice: ${finalDamageString}</strong></p>
        ${damageDiceSummary}
        ${criticalBonusHTML}
        ${typeBreakdownHTML}
      </div>
    </details>`;

    const perkBadges = [];
    if (CRIT_THRESHOLD && CRIT_THRESHOLD < 20) perkBadges.push(`Crit ${CRIT_THRESHOLD}+`);
    if (isSuperAdv) perkBadges.push("Super Adv");
    if (isLucky) perkBadges.push("Lucky");
    if (gwfThreshold > 0) perkBadges.push(`GWF ≤${gwfThreshold}`);
    if (config.hasDamageFloor && Number(config.damageFloorValue) > 0) {
      const fLabel = (config.damageFloorLabel || "").trim() || "Min Die";
      perkBadges.push(`${fLabel} ≤${config.damageFloorValue}`);
    }
    if (config.isPiercerActive) {
      perkBadges.push((config.piercerLabel || "").trim() || "Piercer");
    }
    if (config.hasSavageAttacker || config.isSavageAttackerActive) perkBadges.push("Savage Attacker");
    if (rawCritBonus !== "") perkBadges.push("Crit Bonus Dmg");

    const ddbHijackBadgeHtml = config.isDdbHijacked
      ? `<span style="background: rgba(227, 25, 55, 0.12); border: 1px solid rgba(227, 25, 55, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.74em; font-weight: 700; color: #c41230;">DDB</span>`
      : "";

    const allBadgesHtml = [
      ...(ddbHijackBadgeHtml ? [ddbHijackBadgeHtml] : []),
      ...perkBadges.map(t => `<span style="background: rgba(114, 137, 218, 0.15); border: 1px solid rgba(114, 137, 218, 0.35); border-radius: 3px; padding: 1px 5px; font-size: 0.74em; font-weight: 600; color: #4b5d88;">${t}</span>`),
      ...activeComponents.map(c => `<span style="background: #f1f3f5; border: 1px solid #ced4da; border-radius: 3px; padding: 1px 5px; font-size: 0.74em; font-weight: 600; color: #495057;">${c.label}</span>`)
    ].join("");

    const tagsBlock = allBadgesHtml
      ? `<div style="display: flex; flex-wrap: wrap; gap: 4px; margin: 3px 0 5px;">${allBadgesHtml}</div>`
      : "";

    let saveRiderHTML = "";
    if (config.hasSaveRider && config.isSaveRiderActive) {
      let saveDC = 10;
      if (config.saveRiderDcType === "ability") {
        const dcAbil = config.saveRiderDcAbility || "str";
        const dcAbilMod = Number(actor.system?.abilities?.[dcAbil]?.mod) || 0;
        const pb = Number(actor.system?.attributes?.prof) || 2;
        saveDC = 8 + pb + dcAbilMod;
      } else {
        saveDC = Number(config.saveRiderDcFixed) || 13;
      }

      const saveAbilUpper = (config.saveRiderAbility || "con").toUpperCase();
      const riderLabel = config.saveRiderLabel || "Saving Throw";
      const safeText = (s) => (typeof foundry !== "undefined" && foundry.utils?.escapeHTML) ? foundry.utils.escapeHTML(s) : String(s || "").replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

      let riderDamageHtml = "";
      if (config.saveRiderDamageFormula && config.saveRiderDamageFormula.trim() !== "") {
        try {
          const riderRoll = await new Roll(config.saveRiderDamageFormula.trim()).evaluate();
          finalRolls.push(riderRoll);
          const riderTotal = riderRoll.total;
          const riderType = (config.saveRiderDamageType || "").trim();
          const riderTypeDisp = riderType ? ` ${riderType.toUpperCase() === 'BPS' ? 'BPS' : (riderType.charAt(0).toUpperCase() + riderType.slice(1))}` : "";
          const successText = config.saveRiderSaveSuccess === "none" ? "No dmg on save" : "Half dmg on save";
          riderDamageHtml = `<div style="font-size: 0.9em; margin-top: 3px;"><strong>Damage:</strong> <span style="font-size: 1.1em; font-weight: bold; color: #18520b;">${riderTotal}</span>${riderTypeDisp} <small style="color: #666;">(${config.saveRiderDamageFormula}, ${successText})</small></div>`;
        } catch (e) {
          console.warn("[CustomRolls] Could not evaluate save rider damage formula:", e);
        }
      }

      const effectHtml = config.saveRiderEffect && config.saveRiderEffect.trim() !== ""
        ? `<div style="font-size: 0.88em; color: #555; margin-top: 3px;"><strong>On Failure:</strong> <em>${safeText(config.saveRiderEffect.trim())}</em></div>`
        : "";

      saveRiderHTML = `
      <div style="margin: 6px 0; padding: 6px 8px; background: rgba(107, 63, 148, 0.08); border: 1px solid rgba(107, 63, 148, 0.3); border-radius: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <span style="font-weight: 700; font-size: 0.95em; color: #502772;"><i class="fas fa-shield-alt"></i> ${safeText(riderLabel)}</span>
          <span style="font-weight: 800; font-size: 0.95em; color: #502772; background: rgba(107, 63, 148, 0.15); padding: 1px 6px; border-radius: 3px;">DC ${saveDC} ${saveAbilUpper}</span>
        </div>
        ${riderDamageHtml}
        ${effectHtml}
      </div>`;
    }

    const chatContent = `
    <p style="margin: 0 0 4px 0;"><strong>${actorName}: ${chatCardTitle}</strong></p>
    ${tagsBlock}
    <hr style="margin: 4px 0;">
    <div style="display: flex; justify-content: space-around; align-items: flex-start; gap: 10px;">
      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column;">
        <p style="margin: 0; text-align: center;">Attack Roll</p>
        ${rollHtml1}
        ${reroll1Html}
      </div>
      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column;">
        <p style="margin: 0; text-align: center;">+/- Adv.</p>
        ${rollHtml2}
        ${reroll2Html}
      </div>
    </div>
    <hr style="margin: 5px 0 5px; border-top: 2px solid #343a40;">
    ${normalDamageHTML}
    ${finalSummaryHTML}
    ${saveRiderHTML}
    ${contentSummary}`;

    const showSavageButton = Boolean((config.hasSavageAttacker || config.isSavageAttackerActive) && damageDiceCount > 0 && cleanDieSize && maxDieValue > 0);
    const hasFloorRule = (config.hasDamageFloor === true || String(config.hasDamageFloor) === "true") && Number(config.damageFloorValue) > 0;
    const msgFlags = {
      "autoanimations": {
        item: {
          name: chatCardTitle || config.macroName
        },
        targets: targetIds
      }
    };
    if (showSavageButton) {
      msgFlags[MODULE_ID] = {
        savageAttacker: {
          used: false,
          actorId: actor.id,
          damageDiceCount,
          cleanDieSize,
          maxDieValue,
          gwfThreshold,
          hasFloor: hasFloorRule,
          floorValue: hasFloorRule ? Number(config.damageFloorValue) : 0,
          pass1Total: finalCombinedDieResult,
          pass1Dice: finalDieResults,
          damageType: (damageType || "slashing").toLowerCase(),
          damageTotal: finalGWFTotal,
          criticalTotal,
          isCritical
        }
      };
    }

    await ChatMessage.create({
      user: userId,
      speaker: speaker,
      content: getCardDispositionWrapper(actor, token, userId, chatContent),
      rolls: finalRolls,
      sound: CONFIG.sounds.dice,
      flags: msgFlags
    });

    triggerSequencerAnimation(actor, config, rollUser, autoTargetedToken);
  });

  // --- 2.2a Interactive Savage Attacker Reroll Handler ---
  socket.register("applySavageAttacker", async (messageId, userId) => {
    const msg = game.messages.get(messageId);
    if (!msg) return;
    const saData = msg.getFlag(MODULE_ID, "savageAttacker");
    if (!saData || saData.used) return;

    const dmgFormula = `1${saData.cleanDieSize}`;
    const pass2Rolls = [];
    const pass2Results = [];
    const pass2Rerolls = [];

    for (let i = 0; i < saData.damageDiceCount; i++) {
      let initialRoll = await new Roll(dmgFormula).evaluate();
      let currentResult = Number(initialRoll.total);
      pass2Rolls.push(initialRoll);

      if (saData.gwfThreshold > 0 && currentResult <= saData.gwfThreshold) {
        let reroll = await new Roll(dmgFormula).evaluate();
        pass2Rolls.push(reroll);
        pass2Rerolls.push({ original: currentResult, reroll: Number(reroll.total) });
        currentResult = Number(reroll.total);
      }

      if (saData.hasFloor && currentResult < saData.floorValue) {
        currentResult = saData.floorValue;
      }

      pass2Results.push(currentResult);
    }

    const pass2Total = pass2Results.reduce((a, b) => a + b, 0);

    if (typeof game !== "undefined" && game.dice3d?.showForRoll) {
      const rollUser = game.users.get(userId) || game.user;
      for (const r of pass2Rolls) {
        game.dice3d.showForRoll(r, rollUser, true).catch(() => {});
      }
    }

    const pass1Total = Number(saData.pass1Total) || 0;
    const pass1Dice = Array.isArray(saData.pass1Dice) ? saData.pass1Dice : [];
    const pass2Wins = pass2Total > pass1Total;
    const keptTotal = pass2Wins ? pass2Total : pass1Total;
    const keptDice = pass2Wins ? pass2Results : pass1Dice;
    const diff = Math.max(0, pass2Total - pass1Total);

    const r1Display = pass1Dice.length > 1 ? `${pass1Total} [${pass1Dice.join('+')}]` : pass1Total;
    const r2Display = pass2Results.length > 1 ? `${pass2Total} [${pass2Results.join('+')}]` : pass2Total;
    const keptDisplay = keptDice.length > 1 ? `${keptTotal} [${keptDice.join('+')}]` : keptTotal;

    const comparisonBannerHtml = `
      <div style="padding: 4px 6px; margin: 4px 0; border: 1px solid #8c3b2d; border-radius: 4px; background-color: rgba(140, 59, 45, 0.08); font-size: 0.85em; text-align: center;">
        <span style="font-weight: 700; color: #8c3b2d;">Savage Attacker:</span>
        <span>Rolled <strong>${r1Display}</strong> vs <strong>${r2Display}</strong> &rarr; <strong style="color: #18520b;">Kept ${keptDisplay}</strong></span>
      </div>`;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = msg.content;

    const saContainer = wrapper.querySelector(".cheapdice-sa-container");
    if (saContainer) {
      saContainer.innerHTML = comparisonBannerHtml;
    }

    if (diff > 0) {
      const dieTotalEl = wrapper.querySelector(".cheapdice-dmg-die-total");
      if (dieTotalEl) dieTotalEl.textContent = String(keptTotal);

      const dieListEl = wrapper.querySelector(".cheapdice-dmg-die-list");
      if (dieListEl) dieListEl.textContent = `Dice: [${keptDice.join(', ')}]`;

      const dmgTotalEl = wrapper.querySelector(".cheapdice-damage-total-val");
      if (dmgTotalEl) dmgTotalEl.textContent = String(Number(saData.damageTotal) + diff);

      const critTotalEl = wrapper.querySelector(".cheapdice-critical-total-val");
      if (critTotalEl) critTotalEl.textContent = String(Number(saData.criticalTotal) + diff);

      const dmgTypeKey = (saData.damageType || "slashing").toLowerCase();
      for (const li of wrapper.querySelectorAll(`.cheapdice-breakdown-noncrit[data-dmg-type="${dmgTypeKey}"], .cheapdice-breakdown-crit[data-dmg-type="${dmgTypeKey}"]`)) {
        const amtEl = li.querySelector(".cheapdice-type-amt");
        if (amtEl) {
          const curVal = Number(amtEl.textContent) || 0;
          amtEl.textContent = String(curVal + diff);
        }
      }
    }

    await msg.update({
      content: wrapper.innerHTML,
      [`flags.${MODULE_ID}.savageAttacker.used`]: true
    });
  });

  // --- 2.2b Unarmed 5.5e Maneuver Handler (Grapple / Shove) ---
  socket.register("runUnarmedManeuver", async (maneuverType, config, actorId, userId) => {
    const actor = game.actors.get(actorId);
    if (!actor) return ui.notifications.warn("Actor not found for Unarmed Maneuver.");
    const token = actor.getActiveTokens()[0];

    const rollUser = game.users.get(userId) || game.user;
    const speaker = ChatMessage.getSpeaker({ actor });

    const abilityScore = config.abilityScore || "str";
    const abilityMod = actor.system.abilities?.[abilityScore]?.mod || 0;
    const prof = actor.system.attributes?.prof || 0;
    const wepMod = Number(config.weaponModifier) || 0;
    const circMod = Number(config.attackCircumstanceModifier) || 0;
    const saveDC = 8 + prof + abilityMod + wepMod + circMod;

    let targetIds = Array.isArray(config?.targetIds) && config.targetIds.length > 0
      ? config.targetIds.filter(Boolean)
      : Array.from(rollUser?.targets || game.user.targets).map(t => t.id);

    let targetHtml = "";
    if (targetIds.length > 0) {
      const targetNames = targetIds.map(tid => {
        const t = canvas.tokens.get(tid);
        return t ? t.name : tid;
      });
      targetHtml = `
        <div style="font-size: 0.82em; color: #555; margin-bottom: 5px;">
          <strong>Target:</strong> ${targetNames.join(", ")}
        </div>
      `;
    }

    const isGrapple = maneuverType === "grapple";
    const actionTitle = isGrapple ? "Unarmed Strike: Grapple" : "Unarmed Strike: Shove";
    const badgeColor = isGrapple ? "#2b7489" : "#a34848";
    const badgeIcon = isGrapple ? "fa-hand-holding-hand" : "fa-person-falling";

    const effectDetails = isGrapple
      ? `
        <div style="background: #f8fafc; border: 1px solid #bcc5d3; border-radius: 4px; padding: 6px; font-size: 0.82em; color: #333; line-height: 1.4;">
          <div style="font-weight: 700; color: #2b7489; margin-bottom: 2px;">
            <i class="fas fa-hand-holding-hand"></i> Grapple Effect (5.5e)
          </div>
          <div><strong>Failed Save:</strong> The target has the <strong>Grappled</strong> condition. Its Speed is 0, and attack rolls against creatures other than you have Disadvantage.</div>
          <div style="margin-top: 4px; font-size: 0.8em; color: #666;">Target can be up to one size larger than you. Target can escape by repeating the save as an action or at the end of its turns.</div>
        </div>
      `
      : `
        <div style="background: #f8fafc; border: 1px solid #bcc5d3; border-radius: 4px; padding: 6px; font-size: 0.82em; color: #333; line-height: 1.4;">
          <div style="font-weight: 700; color: #a34848; margin-bottom: 2px;">
            <i class="fas fa-person-falling"></i> Shove Effect (5.5e)
          </div>
          <div><strong>Failed Save:</strong> You push the target <strong>5 feet away</strong> from you, OR knock it <strong>Prone</strong> (attacker's choice).</div>
          <div style="margin-top: 4px; font-size: 0.8em; color: #666;">Target can be up to one size larger than you.</div>
        </div>
      `;

    const circDetails = circMod !== 0 ? ` + Circ (${circMod})` : '';
    const wepDetails = wepMod !== 0 ? ` + Mod (${wepMod})` : '';

    const chatContent = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <span style="font-weight: bold; font-size: 0.95em; color: #2b3a4a;">${actor.name}: ${actionTitle}</span>
        <span style="font-size: 0.72em; font-weight: bold; color: #fff; background: ${badgeColor}; padding: 1px 6px; border-radius: 3px;">
          <i class="fas ${badgeIcon}"></i> 5.5e
        </span>
      </div>
      ${targetHtml}
      <div style="background: rgba(43, 116, 137, 0.1); border: 1px solid rgba(43, 116, 137, 0.35); border-radius: 4px; padding: 6px; text-align: center; margin: 6px 0;">
        <div style="font-size: 1.15em; font-weight: bold; color: #235d6e;">DC ${saveDC} Strength or Dexterity Save</div>
        <div style="font-size: 0.8em; color: #555; margin-top: 2px;">Target's choice to resist</div>
      </div>
      ${effectDetails}
      <details style="margin-top: 6px; padding: 2px 4px;">
        <summary style="font-weight: 600; font-size: 0.78em; color: #666; cursor: pointer;">Formula Breakdown</summary>
        <div style="padding-top: 4px; border-top: 1px solid #e0e0e0; font-size: 0.78em; color: #555; margin-top: 3px;">
          <div><strong>Save DC:</strong> 8 + PB (${prof}) + ${abilityScore.toUpperCase()} (${abilityMod})${wepDetails}${circDetails} = DC ${saveDC}</div>
        </div>
      </details>
    `;

    await ChatMessage.create({
      user: userId,
      speaker: speaker,
      content: getCardDispositionWrapper(actor, token, userId, chatContent),
      sound: CONFIG.sounds.dice,
      flags: {
        "autoanimations": {
          item: { name: isGrapple ? "Grapple" : "Shove" },
          targets: targetIds
        }
      }
    });

    triggerSequencerAnimation(actor, config, rollUser, null);
  });



  // --- 2.3 Spell Execution Handler ---
  socket.register("runSpellAttackRoll", async (config, actorId, userId) => {
    const actor = game.actors.get(actorId);
    if (!actor) return ui.notifications.warn("Actor not found for spell execution.");

    console.log("[CustomRolls] Starting runSpellAttackRoll for:", config.spellName, "Method:", config.resolutionMethod);






    const {
      spellName, spellAbility, resolutionMethod = "attack",
      saveAbility = "dex", saveSuccess = "half",
      isMultiAttack = false, attackCount = 1, effectiveAttacks,
      projectileCount = 3, effectiveProjectiles,
      damageDieSize, extraDiceFormula, damageMode, flatDamageBonus,
      attackModifier, explodeCondition, explodingDice, chaosJump,
      isCantripScale, superAdv, components,
      targetType, areaShape, areaSize,
      duration = "Instantaneous", concentration = false,
      addAbilityModToValue = false,
      castLevel = 0, skipSlotDeduction = false,
      deductChargeItemId,
      extraAttackModifier, extraDamageModifier
    } = config;

    let slotTag = "";
    const slotLvl = Number(castLevel) || 0;

    // Handle charge/use deduction for items/feats
    if (deductChargeItemId) {
      const chargeCost = Math.max(1, Number(config.deductChargeCost) || 1);
      const chargeItem = actor.items?.get(deductChargeItemId);
      if (chargeItem && Number(chargeItem.system?.uses?.max) > 0) {
        const maxUses = Number(chargeItem.system.uses.max) || 0;
        const curUses = chargeItem.system.uses.spent !== undefined
          ? Math.max(0, maxUses - Number(chargeItem.system.uses.spent))
          : (Number(chargeItem.system.uses.value) || 0);
        const newUses = Math.max(0, curUses - chargeCost);
        const newSpent = Math.max(0, maxUses - newUses);
        await chargeItem.update({
          "system.uses.spent": newSpent,
          "system.uses.value": newUses
        });
        slotTag = `${chargeItem.name}: (${newUses}/${maxUses} charges left)`;

        // Keep trackingStuff flag synchronized in real-time
        const trackers = actor.getFlag("world", "trackingStuff") || [];
        const t = trackers.find(x => x.itemRefId === deductChargeItemId || x.id === `item_${deductChargeItemId}`);
        if (t) {
          t.value = newUses;
          await actor.setFlag("world", "trackingStuff", trackers);
        }
      }
    } else if (slotLvl > 0) {
      const slotKey = `system.spells.spell${slotLvl}.value`;
      const currentSlots = Number(actor.system.spells?.[`spell${slotLvl}`]?.value) || 0;
      const maxSlots = Number(actor.system.spells?.[`spell${slotLvl}`]?.max) || 0;

      if (!skipSlotDeduction && currentSlots > 0) {
        const newSlots = currentSlots - 1;
        await actor.update({ [slotKey]: newSlots });
        slotTag = `Slot: Lvl ${slotLvl} (${newSlots}/${maxSlots} left)`;
      } else if (skipSlotDeduction) {
        slotTag = `Slot: Lvl ${slotLvl} (No slot consumed)`;
      } else {
        slotTag = `Slot: Lvl ${slotLvl} (0/${maxSlots} left)`;
      }
    }

    const isHealingType = ["heal", "temp_hp", "max_hp"].includes(resolutionMethod);
    let selectedDamageType = config.damageType || "fire";
    let diceCount = Number(config.damageDiceCount) || 0;

    if (isCantripScale && !isMultiAttack && Number(config.baseLevel) === 0 && diceCount > 0) {
      const level = actor.system.details?.level ?? 1;
      if (level >= 17) diceCount = 4;
      else if (level >= 11) diceCount = 3;
      else if (level >= 5) diceCount = 2;
      else diceCount = 1;
    }

    const rawDie = String(damageDieSize || "6").replace(/^d/i, "");
    let cleanDieSize = `d${rawDie}`;
    const maxDieVal = Number(rawDie) || 0;

    const effSpellAbil = spellAbility || actor.system.attributes?.spellcasting || "int";
    const abilityMod = actor.system.abilities?.[effSpellAbil]?.mod ?? 0;
    const prof = actor.system.attributes?.prof ?? 0;
    const { spellAttackBonus, spellSaveDC } = getActorSpellBonuses(actor, effSpellAbil);
    const baseDC = (Number(config?.fixedSaveDC) > 0) ? Number(config.fixedSaveDC) : spellSaveDC;
    const cleanExtraMod = (extraAttackModifier || "").trim();
    let dcBonus = 0;
    if (resolutionMethod === "save" && cleanExtraMod) {
      const parsedDcBonus = Number(cleanExtraMod.replace(/^\+/, ""));
      if (!isNaN(parsedDcBonus)) dcBonus = parsedDcBonus;
    }
    const spellDC = baseDC + dcBonus;
    const totalAttackMod = spellAttackBonus + (Number(attackModifier) || 0);

    const actorName = actor.name;
    const speaker = ChatMessage.getSpeaker({ actor });

    const rollUser = game.users.get(userId) || game.user;
    const token = actor.getActiveTokens()[0];
    let autoTargetedToken = null;
    let targetIds = Array.isArray(config?.targetIds) && config.targetIds.length > 0
      ? config.targetIds.filter(Boolean)
      : Array.from(rollUser?.targets || game.user.targets).map(t => t.id);

    const animationsEnabled = getSetting("featureAnimations");
    // If not self/point/healing and no targets, auto-target nearest hostile for player / non-hostile tokens
    if (animationsEnabled && targetIds.length === 0 && token && !isHealingType && targetType !== "self" && targetType !== "point") {
      const isHostileNpc = actor.type === "npc" && (token.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE);
      if (!isHostileNpc) {
        const hostiles = canvas.tokens.placeables.filter(t => {
          if (t.id === token.id) return false;
          if (t.document.disposition !== CONST.TOKEN_DISPOSITIONS.HOSTILE) return false;
          if (!t.visible || t.document.hidden) return false;
          const isInvisible = t.actor?.statuses?.has?.("invisible") ||
            t.actor?.effects?.some(e => !e.disabled && (e.statuses?.has?.("invisible") || /invis/i.test(e.name || "")));
          return !isInvisible;
        });
        if (hostiles.length > 0) {
          let nearestHostile = null;
          let minDistance = Infinity;
          for (const h of hostiles) {
            const dist = Math.hypot(h.center.x - token.center.x, h.center.y - token.center.y);
            if (dist < minDistance) {
              minDistance = dist;
              nearestHostile = h;
            }
          }
          if (nearestHostile) {
            autoTargetedToken = nearestHostile;
            targetIds = [nearestHostile.id];
            try {
              nearestHostile.setTarget(true, { user: rollUser, releaseOthers: false });
            } catch (e) {
              console.warn("[CustomRolls] Could not set canvas target for user:", e);
            }
          }
        }
      }
    }

    function parseMaxDiceDamage(formula) {
      if (!formula || typeof formula !== 'string') return 0;
      const matches = formula.matchAll(/(\d*)[dD](\d+)/gi);
      let total = 0;
      for (const m of matches) {
        const count = parseInt(m[1]) || 1;
        const size = parseInt(m[2]) || 0;
        total += count * size;
      }
      return total;
    }

    let rawCondition = (explodeCondition || "").trim();
    if (!rawCondition && explodingDice) rawCondition = "x";
    let explodeModifier = "";
    if (rawCondition && !isHealingType) {
      explodeModifier = rawCondition.toLowerCase().startsWith("x") ? rawCondition : `x${rawCondition}`;
    }

    const tags = [];
    if (slotTag) {
      tags.push(slotTag);
    } else if (Number(config.baseLevel) === 0) {
      tags.push("Cantrip");
    } else {
      tags.push(`Level ${config.baseLevel}`);
    }

    let targetLabel = "Creature(s)";
    if (targetType === "self") targetLabel = "Self";
    else if (targetType === "point") targetLabel = "Point in Space";
    else if (targetType === "object") targetLabel = "Object(s)";
    else if (targetType === "creature_object") targetLabel = "Creature/Object";
    else if (targetType === "area") {
      const shape = areaShape ? areaShape.charAt(0).toUpperCase() + areaShape.slice(1) : "Area";
      targetLabel = areaSize ? `${shape} (${areaSize})` : shape;
    }
    tags.push(`Target: ${targetLabel}`);
    tags.push(`Dur: ${duration}`);
    if (concentration) tags.push("Concentration");

    let compList = [];
    if (components?.v) compList.push("V");
    if (components?.s) compList.push("S");
    if (components?.m) compList.push(components?.costly ? "M*" : "M");
    if (compList.length > 0) tags.push(`Comp: ${compList.join(",")}`);

    if (explodeModifier && resolutionMethod !== "auto" && !isHealingType) tags.push(`Explode [${explodeModifier}]`);
    if (chaosJump && !isHealingType) tags.push("Chaos Jump");
    if (superAdv && resolutionMethod === "attack") tags.push("Super Adv");
    if (config.isDdbHijacked) tags.push("DDB");

    const tagsHtml = tags.map(t => {
      const isDdb = t === "DDB";
      const isConc = t === "Concentration";
      const isSlot = t.startsWith("Slot:");
      const bg = isDdb ? "rgba(227, 25, 55, 0.12)" : (isConc ? "rgba(163, 72, 72, 0.15)" : (isSlot ? "rgba(43, 116, 137, 0.15)" : "rgba(114, 137, 218, 0.18)"));
      const border = isDdb ? "rgba(227, 25, 55, 0.4)" : (isConc ? "rgba(163, 72, 72, 0.4)" : (isSlot ? "rgba(43, 116, 137, 0.4)" : "rgba(114, 137, 218, 0.4)"));
      const color = isDdb ? "#c41230" : (isConc ? "#a34848" : (isSlot ? "#235d6e" : "#4b5d88"));
      return `<span style="display: inline-block; background: ${bg}; border: 1px solid ${border}; border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: ${isDdb ? "700" : "600"}; color: ${color};">${t}</span>`;
    }).join("");

    const fullSpellDescription = (config.description || config.summary || "").trim();
    const descriptionHtmlBlock = fullSpellDescription ? `
      <details style="margin-bottom: 6px; border: 1px solid rgba(75, 93, 136, 0.3); border-radius: 4px; padding: 5px 8px; background: rgba(75, 93, 136, 0.05);">
        <summary style="font-weight: 700; font-size: 0.9em; color: #4b5d88; cursor: pointer; user-select: none; text-transform: uppercase; letter-spacing: 0.5px;">
          <i class="fas fa-sparkles" style="margin-right: 4px;"></i> Spell Description
        </summary>
        <div class="spell-description-content" style="margin-top: 6px; font-size: 0.9em; line-height: 1.45; color: #2b3a4a; border-top: 1px solid rgba(75, 93, 136, 0.15); padding-top: 4px;">
          ${fullSpellDescription}
        </div>
      </details>
    ` : "";

    // --- Healing Branch ---
    if (isHealingType) {
      let healDiceCount = diceCount;
      let healDieSize = cleanDieSize;
      let includeMod = Boolean(addAbilityModToValue);
      let effectiveFlat = Number(flatDamageBonus) || 0;

      // Live fallback for pre-existing zeroed healing configs saved before heal activity parsing fix
      if (healDiceCount === 0 && effectiveFlat === 0 && !extraDiceFormula) {
        const sheetSpell = (config.itemId ? actor.items?.get?.(config.itemId) : null)
          || actor.items?.getName?.(spellName)
          || actor.items?.find?.(i => String(i.name || "").toLowerCase().trim() === String(spellName || "").toLowerCase().trim());
        const sSys = sheetSpell?.system;
        if (sSys) {
          const acts = sSys.activities ? (typeof sSys.activities.values === "function" ? Array.from(sSys.activities.values()) : Object.values(sSys.activities)) : [];
          const hAct = acts.find(a => a && (a.type === "heal" || a.healing));
          const hObj = hAct?.healing;
          if (hObj && !Array.isArray(hObj.parts)) {
            if (hObj.custom?.enabled && hObj.custom?.formula) {
              const cForm = String(hObj.custom.formula);
              if (/@mod/i.test(cForm)) includeMod = true;
              const m = cForm.match(/(\d*)d(\d+)/i);
              if (m) {
                healDiceCount = parseInt(m[1]) || 1;
                healDieSize = `d${m[2]}`;
              }
            } else {
              healDiceCount = Number(hObj.number) || 0;
              if (hObj.denomination) healDieSize = `d${hObj.denomination}`;
              if (/@mod/i.test(String(hObj.bonus ?? ""))) includeMod = true;
              else if (Number.isFinite(Number(hObj.bonus))) effectiveFlat += Number(hObj.bonus);
            }
          } else {
            const parts = hObj?.parts || sSys.damage?.parts || [];
            const fp = parts[0];
            if (Array.isArray(fp)) {
              if (/@mod/i.test(String(fp[0] || ""))) includeMod = true;
              const m = String(fp[0] || "").match(/(\d*)d(\d+)/i);
              if (m) {
                healDiceCount = parseInt(m[1]) || 1;
                healDieSize = `d${m[2]}`;
              }
            }
          }
          const extraLvls = (Number(config.baseLevel) > 0 && slotLvl > Number(config.baseLevel)) ? (slotLvl - Number(config.baseLevel)) : 0;
          if (extraLvls > 0 && healDiceCount > 0) healDiceCount += extraLvls;
        }
      }

      if (includeMod) effectiveFlat += abilityMod;

      let healFormula = "";
      const cleanUserExtra = (extraDamageModifier || "").trim().replace(/^\+/, "").trim();
      const combinedExtraDice = [extraDiceFormula, cleanUserExtra].filter(Boolean).map(s => String(s).trim().replace(/^\+/, "").trim()).filter(Boolean).join(" + ");
      if (healDiceCount > 0) {
        healFormula = `${healDiceCount}${healDieSize}`;
        if (combinedExtraDice) healFormula += ` + ${combinedExtraDice}`;
        if (effectiveFlat !== 0) healFormula += ` + ${effectiveFlat}`;
      } else {
        healFormula = `${effectiveFlat || 0}`;
        if (combinedExtraDice) healFormula += ` + ${combinedExtraDice}`;
      }

      const rollObj = await new Roll(healFormula).evaluate();
      if (Array.isArray(config.injectedDamageDice) && config.injectedDamageDice.length > 0) {
        injectDiceIntoRoll(rollObj, config.injectedDamageDice, config.injectedDamageTotal ?? null);
      }
      const totalValue = rollObj.total;
      const rollRender = await rollObj.render();

      let headerColor = "#28a745";
      let headerBg = "rgba(40, 167, 69, 0.1)";
      let headerBorder = "rgba(40, 167, 69, 0.35)";
      let titleText = "HIT POINTS RESTORED";
      let totalLabel = "HEALING TOTAL";
      let icon = "fa-heart";

      if (resolutionMethod === "temp_hp") {
        headerColor = "#17a2b8";
        headerBg = "rgba(23, 162, 184, 0.1)";
        headerBorder = "rgba(23, 162, 184, 0.35)";
        titleText = "TEMPORARY HIT POINTS";
        totalLabel = "TEMP HP GAINED";
        icon = "fa-shield-alt";
      } else if (resolutionMethod === "max_hp") {
        headerColor = "#20c997";
        headerBg = "rgba(32, 201, 151, 0.1)";
        headerBorder = "rgba(32, 201, 151, 0.35)";
        titleText = "MAX HP & CURRENT HP INCREASE";
        totalLabel = "HP INCREASE";
        icon = "fa-plus-circle";
      }

      const healCard = `
        <div style="font-family: inherit; color: #333;">
          <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #343a40; padding-bottom: 3px; margin-bottom: 6px;">
            <span style="font-size: 1.05em; font-weight: bold; color: #2b3a4a;">${spellName}</span>
            <span style="font-size: 0.8em; color: #777;">${actorName}</span>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 6px;">
            ${tagsHtml}
          </div>

          ${descriptionHtmlBlock}

          <div style="background: ${headerBg}; border: 1px solid ${headerBorder}; border-radius: 4px; padding: 5px; text-align: center; margin-bottom: 6px;">
            <span style="font-weight: bold; font-size: 0.9em; color: ${headerColor};"><i class="fas ${icon}"></i> ${titleText}</span>
          </div>

          <div style="transform: scale(0.96); margin: -2px 0;">${rollRender}</div>

          <div style="display: flex; justify-content: space-around; background: rgba(0,0,0,0.04); border-radius: 4px; padding: 6px 4px; text-align: center; margin-top: 6px;">
            <div>
              <div style="font-size: 0.75em; font-weight: 600; color: #777;">${totalLabel}</div>
              <div style="font-size: 1.3em; font-weight: bold; color: ${headerColor};">+${totalValue}</div>
            </div>
          </div>

          <details style="margin-top: 6px; padding: 2px 4px;">
            <summary style="font-weight: 600; font-size: 0.82em; color: #666; cursor: pointer;">Formula Breakdown</summary>
            <div style="padding-top: 4px; border-top: 1px solid #e0e0e0; font-size: 0.8em; color: #555; margin-top: 3px;">
              <div><strong>Formula:</strong> ${healFormula}</div>
              ${includeMod ? `<div><strong>Spellcasting Mod:</strong> +${abilityMod} (${effSpellAbil.toUpperCase()})</div>` : ''}
            </div>
          </details>
        </div>
      `;

      await ChatMessage.create({
        user: userId,
        speaker: speaker,
        content: getCardDispositionWrapper(actor, token, userId, healCard),
        rolls: [rollObj],
        sound: CONFIG.sounds.dice,
        flags: {
          "autoanimations": {
            item: { name: spellName || config.macroName },
            targets: targetIds
          }
        }
      });

      triggerSequencerAnimation(actor, config, rollUser, autoTargetedToken);
      return;
    }

    // --- Utility Branch ---
    if (resolutionMethod === "other") {
      const summaryText = (config.summary || "No effect summary provided.").trim();
      const utilityCard = `
        <div style="font-family: inherit; color: #333;">
          <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #343a40; padding-bottom: 3px; margin-bottom: 6px;">
            <span style="font-size: 1.05em; font-weight: bold; color: #2b3a4a;">${spellName}</span>
            <span style="font-size: 0.8em; color: #777;">${actorName}</span>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 6px;">
            ${tagsHtml}
          </div>

          <div style="background: rgba(75, 93, 136, 0.08); border: 1px solid rgba(75, 93, 136, 0.3); border-radius: 4px; padding: 8px 10px; margin-top: 4px;">
            <div style="font-weight: bold; font-size: 0.8em; color: #4b5d88; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.5px;">
              <i class="fas fa-sparkles"></i> Spell Description
            </div>
            <div style="font-size: 0.9em; line-height: 1.4; color: #2b3a4a;">${fullSpellDescription || summaryText}</div>
          </div>
        </div>
      `;

      return await ChatMessage.create({
        user: userId,
        speaker: speaker,
        content: getCardDispositionWrapper(actor, token, userId, utilityCard)
      });
    }

    // --- Auto Hit Branch (Magic Missile, etc.) ---
    if (resolutionMethod === "auto") {
      const dartsToRoll = Number(effectiveProjectiles) || Number(projectileCount) || 3;
      let dartFormula = `${diceCount}${cleanDieSize}`;
      const cleanExtra = (extraDiceFormula || "").trim().replace(/^\+/, "").trim();
      if (cleanExtra) dartFormula += ` + ${cleanExtra}`;
      if (Number(flatDamageBonus)) dartFormula += ` + ${flatDamageBonus}`;

      let totalDartDamage = 0;
      let dartsAuditHtml = "";
      const rolledObjects = [];

      for (let i = 1; i <= dartsToRoll; i++) {
        const dRoll = await new Roll(dartFormula).evaluate();
        rolledObjects.push(dRoll);
        totalDartDamage += dRoll.total;
        const dHtml = await dRoll.render();

        dartsAuditHtml += `
          <div style="margin-bottom: 4px;">
            <div style="font-size: 0.8em; font-weight: bold; color: #4b5d88;">Dart ${i}</div>
            <div style="transform: scale(0.95);">${dHtml}</div>
          </div>
        `;
      }

      const typeDisplay = selectedDamageType.toUpperCase();
      const autoCard = `
        <div style="font-family: inherit; color: #333;">
          <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #343a40; padding-bottom: 3px; margin-bottom: 6px;">
            <span style="font-size: 1.05em; font-weight: bold; color: #2b3a4a;">${spellName}</span>
            <span style="font-size: 0.8em; color: #777;">${actorName}</span>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 6px;">
            ${tagsHtml}
          </div>

          ${descriptionHtmlBlock}

          <div style="background: rgba(111, 66, 193, 0.08); border: 1px solid rgba(111, 66, 193, 0.3); border-radius: 4px; padding: 5px; text-align: center; margin-bottom: 6px;">
            <span style="font-weight: bold; font-size: 0.9em; color: #5a32a3;"><i class="fas fa-bullseye"></i> AUTOMATIC HIT (${dartsToRoll} PROJECTILES)</span>
          </div>

          <div style="background: rgba(0,0,0,0.02); border: 1px solid #d2d7df; border-radius: 4px; padding: 6px; margin-bottom: 6px;">
            ${dartsAuditHtml}
          </div>

          <div style="display: flex; justify-content: space-around; background: rgba(0,0,0,0.04); border-radius: 4px; padding: 6px 4px; text-align: center;">
            <div>
              <div style="font-size: 0.75em; font-weight: 600; color: #777;">TOTAL DAMAGE</div>
              <div style="font-size: 1.25em; font-weight: bold; color: #2b3a4a;">${totalDartDamage}</div>
            </div>
            <div style="border-left: 1px solid rgba(0,0,0,0.1); padding-left: 14px;">
              <div style="font-size: 0.75em; font-weight: 600; color: #777;">DAMAGE TYPE</div>
              <div style="font-size: 1.1em; font-weight: bold; color: #2b3a4a;">${typeDisplay}</div>
            </div>
          </div>

          <details style="margin-top: 6px; padding: 2px 4px;">
            <summary style="font-weight: 600; font-size: 0.82em; color: #666; cursor: pointer;">Formula Breakdown</summary>
            <div style="padding-top: 4px; border-top: 1px solid #e0e0e0; font-size: 0.8em; color: #555; margin-top: 3px;">
              <div><strong>Dart Formula:</strong> ${dartFormula} (${typeDisplay})</div>
            </div>
          </details>
        </div>
      `;

      await ChatMessage.create({
        user: userId,
        speaker: speaker,
        content: getCardDispositionWrapper(actor, token, userId, autoCard),
        rolls: rolledObjects,
        sound: CONFIG.sounds.dice,
        flags: {
          "autoanimations": {
            item: { name: spellName || config.macroName },
            targets: targetIds
          }
        }
      });

      triggerSequencerAnimation(actor, config, rollUser, autoTargetedToken);
      return;
    }

    // --- Attack Roll Branch (Fire Bolt, Scorching Ray, etc.) ---
    if (resolutionMethod === "attack") {
      const normSpell = String(spellName || "").toLowerCase().replace(/\s*\([^)]*\)/g, "").trim();
      let effIsMulti = Boolean(isMultiAttack && isMultiAttack !== "false");
      let effAtkCount = Number(attackCount) || 1;
      let effUpcastAtk = Number(config.upcastAttacks) || 0;
      let effCantripAtkScale = Boolean(config.cantripAttackScaling);

      // Auto-repair stale pre-existing configs saved before multi-ray auto-detection
      if (!effIsMulti) {
        if (normSpell === "scorching ray" || normSpell === "jim's magic missile") {
          effIsMulti = true;
          effAtkCount = 3;
          effUpcastAtk = 1;
        } else if (normSpell === "steel wind strike") {
          effIsMulti = true;
          effAtkCount = 5;
        } else if (normSpell === "eldritch blast") {
          effIsMulti = true;
          effCantripAtkScale = true;
        }
      }
      if ((normSpell === "scorching ray" || normSpell === "jim's magic missile") && effUpcastAtk <= 0) {
        effUpcastAtk = 1;
      }

      const baseLvl = Number(config.baseLevel) || 0;
      const extraLvls = (baseLvl > 0 && slotLvl > baseLvl) ? (slotLvl - baseLvl) : 0;
      let numAttacks = 1;
      if (effIsMulti) {
        if (Number(effectiveAttacks) > 0 && !(config.isDdbHijacked && extraLvls > 0 && effUpcastAtk > 0)) {
          numAttacks = Number(effectiveAttacks);
        } else if (effCantripAtkScale && baseLvl === 0) {
          const charLvl = actor.system.details?.level ?? 1;
          numAttacks = charLvl >= 17 ? 4 : (charLvl >= 11 ? 3 : (charLvl >= 5 ? 2 : 1));
        } else {
          numAttacks = Math.max(1, effAtkCount + (extraLvls * effUpcastAtk));
        }
      }

      // Guard: if a stale non-multi Scorching Ray config had damageDiceCount scaled by upcasting, keep 2d6 per ray
      if ((normSpell === "scorching ray") && !isMultiAttack && extraLvls > 0 && diceCount === 2 + extraLvls) {
        diceCount = 2;
      }

      const cloneTerm = (t) => {
        if (typeof t.clone === "function") return t.clone();
        if (typeof t.constructor?.fromData === "function") return t.constructor.fromData(t.toJSON());
        return RollTerm.fromJSON(JSON.stringify(t));
      };

      const cleanExtraAtk = (extraAttackModifier || "").trim();
      const atkSuffix = `${totalAttackMod >= 0 ? `+ ${totalAttackMod}` : `- ${Math.abs(totalAttackMod)}`}${cleanExtraAtk ? (cleanExtraAtk.startsWith("+") || cleanExtraAtk.startsWith("-") ? ` ${cleanExtraAtk}` : ` + ${cleanExtraAtk}`) : ""}`;
      const attackFormula = `1d20 ${atkSuffix}`;

      let baseDamageFormula = `${diceCount}${cleanDieSize}${explodeModifier}`;
      const cleanExtraDice = [extraDiceFormula, extraDamageModifier].filter(Boolean).map(s => String(s).trim().replace(/^\+/, "").trim()).filter(Boolean).join(" + ");
      if (cleanExtraDice) baseDamageFormula += ` + ${cleanExtraDice}`;
      if (Number(flatDamageBonus)) baseDamageFormula += ` + ${flatDamageBonus}`;

      const maxPrimaryCrit = diceCount * maxDieVal;
      const maxExtraCrit = parseMaxDiceDamage(cleanExtraDice);
      const maxCritBonus = maxPrimaryCrit + maxExtraCrit;

      const critThreshold = Number(config.CRIT_THRESHOLD) || 20;
      const rolledObjects = [];
      let totalStandardDamage = 0;
      let totalCritBonus = 0;
      let hasAnyCrit = false;
      let summaryRowsHtml = "";
      let detailedAuditHtml = "";

      for (let i = 1; i <= numAttacks; i++) {
        const atkRoll = await new Roll(attackFormula, actor.system).evaluate();
        if (i === 1 && Number.isFinite(Number(config.injectedD20_1))) {
          injectD20IntoRoll(atkRoll, config.injectedD20_1);
        }

        // Roll second d20 candidate reusing evaluated modifier terms from atkRoll (so 1d4+2 is only rolled once)
        let slot2D20Val = 0;
        let slot2D20Term = null;
        if (i === 1 && Number.isFinite(Number(config.injectedD20_2)) && Number(config.injectedD20_2) >= 1 && Number(config.injectedD20_2) <= 20) {
          const d20Roll = await new Roll("1d20").evaluate();
          const inj2 = injectD20IntoRoll(d20Roll, config.injectedD20_2, Number(config.injectedD20_2)) ?? Number(config.injectedD20_2);
          slot2D20Val = inj2;
          slot2D20Term = d20Roll.terms[0];
        } else if (superAdv) {
          const d20A = await new Roll("1d20").evaluate();
          const d20B = await new Roll("1d20").evaluate();
          const valA = Number(d20A.terms[0]?.results?.[0]?.result ?? d20A.total);
          const valB = Number(d20B.terms[0]?.results?.[0]?.result ?? d20B.total);
          if (valA >= valB) {
            slot2D20Val = valA;
            slot2D20Term = d20A.terms[0];
          } else {
            slot2D20Val = valB;
            slot2D20Term = d20B.terms[0];
          }
        } else {
          const d20Roll = await new Roll("1d20").evaluate();
          slot2D20Val = Number(d20Roll.terms[0]?.results?.[0]?.result ?? d20Roll.total);
          slot2D20Term = d20Roll.terms[0];
        }

        const terms2 = [cloneTerm(slot2D20Term), ...atkRoll.terms.slice(1).map(cloneTerm)];
        let advRoll = Roll.fromTerms(terms2);
        if (!advRoll._evaluated) {
          await advRoll.evaluate();
        }

        const dmgRoll = await new Roll(baseDamageFormula).evaluate();

        rolledObjects.push(atkRoll, advRoll, dmgRoll);

        const d20_1 = atkRoll.dice[0]?.total ?? 0;
        const d20_2 = slot2D20Val;
        const isCrit = d20_1 >= critThreshold || d20_2 >= critThreshold;
        if (isCrit) {
          hasAnyCrit = true;
          totalCritBonus += maxCritBonus;
        }

        const baseDmg = dmgRoll.total;
        totalStandardDamage += baseDmg;

        let atk1Style = "color: #2b3a4a;";
        if (d20_1 >= critThreshold) atk1Style = "color: #18521e; font-weight: bold;";
        else if (d20_1 === 1) atk1Style = "color: #a33; font-weight: bold;";

        let atk2Style = "color: #666;";
        if (d20_2 >= critThreshold) atk2Style = "color: #18521e; font-weight: bold;";
        else if (d20_2 === 1) atk2Style = "color: #a33; font-weight: bold;";

        const rowLabel = numAttacks > 1 ? `Ray ${i}` : "Attack";

        const dmgDisplayHtml = isCrit
          ? `<strong style="font-size: 1.05em; color: #2b3a4a;">${baseDmg}</strong> <span style="font-size: 0.85em; color: #18521e; font-weight: bold;">(+${maxCritBonus} crit)</span>`
          : `<strong style="font-size: 1.05em; color: #2b3a4a;">${baseDmg}</strong>`;

        summaryRowsHtml += `
          <div style="display: grid; grid-template-columns: 1fr 1.2fr 1.2fr; align-items: center; padding: 4px 2px; border-bottom: 1px dotted #ccc; font-size: 0.85em;">
            <div><strong style="color: #4b5d88;">${rowLabel}</strong></div>
            <div style="text-align: center;">
              <span style="${atk1Style}"><strong>${atkRoll.total}</strong></span>
              <span style="font-size: 0.85em; ${atk2Style}"> (${advRoll.total})</span>
            </div>
            <div style="text-align: right;">
              ${dmgDisplayHtml}
            </div>
          </div>
        `;

        let atkHtml = await atkRoll.render();
        let advHtml = await advRoll.render();
        let dmgHtml = await dmgRoll.render();

        if (d20_1 >= critThreshold) atkHtml = atkHtml.replace('dice-total', 'dice-total critical');
        else if (d20_1 === 1) atkHtml = atkHtml.replace('dice-total', 'dice-total fumble');

        if (d20_2 >= critThreshold) advHtml = advHtml.replace('dice-total', 'dice-total critical');
        else if (d20_2 === 1) advHtml = advHtml.replace('dice-total', 'dice-total fumble');

        detailedAuditHtml += `
          <div style="margin-top: 6px; padding: 4px; background: rgba(0,0,0,0.02); border-radius: 4px; border: 1px solid #eee;">
            <div style="font-weight: bold; font-size: 0.82em; color: #4b5d88; margin-bottom: 3px;">${rowLabel} Audit</div>
            <div style="display: flex; gap: 6px;">
              <div style="flex: 1; text-align: center;">
                <div style="font-size: 0.75em; color: #777;">Roll</div>
                <div style="transform: scale(0.9); margin: -4px 0;">${atkHtml}</div>
              </div>
              <div style="flex: 1; text-align: center;">
                <div style="font-size: 0.75em; color: #777;">Adv/Dis</div>
                <div style="transform: scale(0.9); margin: -4px 0;">${advHtml}</div>
              </div>
            </div>
            <div style="margin-top: 4px;">
              <div style="font-size: 0.75em; color: #777; text-align: center;">Base Damage</div>
              <div style="transform: scale(0.9); margin: -4px 0;">${dmgHtml}</div>
              ${isCrit ? `<div style="text-align: center; font-size: 0.78em; color: #18521e; font-weight: bold; margin-top: 2px;">+${maxCritBonus} Max Crit Added =${baseDmg + maxCritBonus}</div>` : ''}
            </div>
          </div>
        `;
      }

      const typeDisplay = selectedDamageType.toUpperCase();
      const attackCard = `
        <div style="font-family: inherit; color: #333;">
          <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #343a40; padding-bottom: 3px; margin-bottom: 6px;">
            <span style="font-size: 1.05em; font-weight: bold; color: #2b3a4a;">${spellName}</span>
            <span style="font-size: 0.8em; color: #777;">${actorName}</span>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 6px;">
            ${tagsHtml}
          </div>

          ${descriptionHtmlBlock}

          ${components?.costly && components?.description ? `
            <div style="font-size: 0.78em; color: #b35900; background: rgba(179, 89, 0, 0.08); padding: 3px 6px; border-radius: 3px; margin-bottom: 6px;">
              <i class="fas fa-coins"></i> <strong>Requires:</strong> ${components.description}
            </div>
          ` : ''}

          <div style="background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
            <div style="display: grid; grid-template-columns: 1fr 1.2fr 1.2fr; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-bottom: 3px; font-size: 0.75em; font-weight: bold; color: #777;">
              <div>TARGET</div>
              <div style="text-align: center;">ATK (ADV)</div>
              <div style="text-align: right;">DMG</div>
            </div>
            ${summaryRowsHtml}
          </div>

          <div style="display: flex; justify-content: space-around; background: rgba(0,0,0,0.04); border-radius: 4px; padding: 6px 4px; text-align: center;">
            <div style="flex: 1; ${hasAnyCrit ? 'border-right: 1px solid rgba(0,0,0,0.1);' : ''} padding: 0 4px;">
              <div style="font-size: 0.75em; font-weight: 600; color: #777;">${numAttacks > 1 ? "COMBINED BASE" : "DAMAGE TOTAL"}</div>
              <div style="font-size: 1.25em; font-weight: bold; color: #2b3a4a;">${totalStandardDamage}</div>
            </div>
            ${hasAnyCrit ? `
            <div style="flex: 1; border-right: 1px solid rgba(0,0,0,0.1); padding: 0 4px;">
              <div style="font-size: 0.75em; font-weight: 600; color: #18520b;">CRITICAL TOTAL</div>
              <div style="font-size: 1.25em; font-weight: bold; color: #18520b;">${totalStandardDamage + totalCritBonus}</div>
            </div>` : ''}
            <div style="flex: 1; padding: 0 4px;">
              <div style="font-size: 0.75em; font-weight: 600; color: #777;">DAMAGE TYPE</div>
              <div style="font-size: 1.1em; font-weight: bold; color: #2b3a4a;">${typeDisplay}</div>
            </div>
          </div>

          <details style="margin-top: 6px; padding: 2px 4px;">
            <summary style="font-weight: 600; font-size: 0.82em; color: #666; cursor: pointer;">Dice Roll Audits & Formula</summary>
            <div style="padding-top: 4px; border-top: 1px solid #e0e0e0; font-size: 0.8em; color: #555; margin-top: 3px;">
              <div><strong>Attack Mod:</strong> ${totalAttackMod >= 0 ? '+' : ''}${totalAttackMod} (${spellAbility.toUpperCase()}: ${abilityMod >= 0 ? '+' : ''}${abilityMod} + PB: +${prof}${attackModifier ? ` + Mod: ${attackModifier}` : ''})</div>
              <div><strong>Damage Formula:</strong> ${baseDamageFormula} (${typeDisplay})</div>
              ${hasAnyCrit ? `<div><strong>Crunchy Crit Extra:</strong> +${maxCritBonus} (Max Dice)</div>` : ''}
              ${detailedAuditHtml}
            </div>
          </details>
        </div>
      `;

      await ChatMessage.create({
        user: userId,
        speaker: speaker,
        content: getCardDispositionWrapper(actor, token, userId, attackCard),
        rolls: rolledObjects,
        sound: CONFIG.sounds.dice,
        flags: {
          "autoanimations": {
            item: { name: spellName || config.macroName },
            targets: targetIds
          }
        }
      });

      triggerSequencerAnimation(actor, config, rollUser, autoTargetedToken);
      return;
    }

    // --- Save Branch (Fireball, Sacred Flame, etc.) ---
    const saveLabel = saveAbility.toUpperCase();
    const attackHtmlBlock = `
      <div style="background: rgba(43, 116, 137, 0.1); border: 1px solid rgba(43, 116, 137, 0.35); border-radius: 4px; padding: 6px; text-align: center; margin-bottom: 6px;">
        <div style="font-size: 1.05em; font-weight: bold; color: #235d6e;">DC ${spellDC} ${saveLabel} Saving Throw</div>
      </div>
    `;

    let fullDamageFormula = `${diceCount}${cleanDieSize}${explodeModifier}`;
    const cleanExtraDice = [extraDiceFormula, extraDamageModifier].filter(Boolean).map(s => String(s).trim().replace(/^\+/, "").trim()).filter(Boolean).join(" + ");
    if (cleanExtraDice) fullDamageFormula += ` + ${cleanExtraDice}`;
    if (Number(flatDamageBonus)) fullDamageFormula += ` + ${flatDamageBonus}`;

    const damageRoll = await new Roll(fullDamageFormula).evaluate();
    if (Array.isArray(config.injectedDamageDice) && config.injectedDamageDice.length > 0) {
      injectDiceIntoRoll(damageRoll, config.injectedDamageDice, config.injectedDamageTotal ?? null);
    }
    const normalDamageTotal = damageRoll.total;
    const damageRollHtml = await damageRoll.render();

    const CHAOS_TABLE = {
      1: "Acid", 2: "Cold", 3: "Fire", 4: "Force",
      5: "Lightning", 6: "Poison", 7: "Psychic", 8: "Thunder"
    };

    let chaosBannerHTML = "";
    let typeDisplay = selectedDamageType.toUpperCase();

    if (damageMode === "chaos") {
      const primaryDiePool = damageRoll.dice.find(d => d.faces === 8) || damageRoll.dice[0];
      const rolledResults = primaryDiePool?.results?.map(r => r.result) || [];

      const d8_1 = rolledResults[0] ?? (await new Roll("1d8").evaluate()).total;
      const d8_2 = rolledResults[1] ?? (await new Roll("1d8").evaluate()).total;

      const type1 = (CHAOS_TABLE[d8_1] || "Force").toUpperCase();
      const type2 = (CHAOS_TABLE[d8_2] || "Force").toUpperCase();

      if (chaosJump) {
        if (d8_1 === d8_2) {
          typeDisplay = type1;
          chaosBannerHTML = `
            <div style="background: rgba(40, 167, 69, 0.12); border: 1px solid #28a745; border-radius: 4px; padding: 4px 6px; margin: 4px 0; text-align: center;">
              <strong style="color: #218838; font-size: 0.9em;"><i class="fas fa-bolt"></i> CHAOS JUMP! (${d8_1} & ${d8_2})</strong>
              <div style="font-size: 0.8em; color: #333; margin-top: 2px;">Matching d8s leap to another target within 30 ft. <strong>Type: ${typeDisplay}</strong></div>
            </div>
          `;
        } else {
          typeDisplay = `${type1} / ${type2}`;
          chaosBannerHTML = `
            <div style="background: rgba(114, 137, 218, 0.12); border: 1px solid #7289da; border-radius: 4px; padding: 4px 6px; margin: 4px 0; text-align: center; font-size: 0.82em;">
              <span style="font-weight: 600;">Chaos Table: [${d8_1}: ${type1}] & [${d8_2}: ${type2}]</span>
              <div style="color: #555; font-size: 0.95em;">Choose either damage type.</div>
            </div>
          `;
        }
      } else {
        typeDisplay = type1;
        chaosBannerHTML = `
          <div style="background: rgba(114, 137, 218, 0.12); border: 1px solid #7289da; border-radius: 4px; padding: 4px 6px; margin: 4px 0; text-align: center; font-size: 0.82em;">
            <strong>Chaos Roll [${d8_1}]:</strong> Determined Type &rarr; <strong>${typeDisplay}</strong>
          </div>
        `;
      }
    }

    let explodingBannerHTML = "";
    if (explodeModifier) {
      explodingBannerHTML = `
        <div style="background: rgba(255, 152, 0, 0.12); border: 1px solid #ff9800; border-radius: 4px; padding: 3px 6px; margin: 4px 0; text-align: center; font-size: 0.8em; color: #b35900;">
          <i class="fas fa-bomb"></i> <strong>Exploding Dice:</strong> Trigger [${explodeModifier}]
        </div>
      `;
    }

    const diceSummaryText = cleanExtraDice ? `${diceCount}${cleanDieSize} + ${cleanExtraDice}` : `${diceCount}${cleanDieSize}`;

    let damageTotalDisplay = "";
    if (saveSuccess === "half") {
      const halfDamage = Math.floor(normalDamageTotal / 2);
      damageTotalDisplay = `
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
      `;
    } else {
      damageTotalDisplay = `
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
    }

    const saveCard = `
      <div style="font-family: inherit; color: #333;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #343a40; padding-bottom: 3px; margin-bottom: 6px;">
          <span style="font-size: 1.05em; font-weight: bold; color: #2b3a4a;">${spellName}</span>
          <span style="font-size: 0.8em; color: #777;">${actorName}</span>
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 6px;">
          ${tagsHtml}
        </div>

        ${descriptionHtmlBlock}

        ${components?.costly && components?.description ? `
          <div style="font-size: 0.78em; color: #b35900; background: rgba(179, 89, 0, 0.08); padding: 3px 6px; border-radius: 3px; margin-bottom: 6px;">
            <i class="fas fa-coins"></i> <strong>Requires:</strong> ${components.description}
          </div>
        ` : ''}

        ${attackHtmlBlock}
        ${chaosBannerHTML}
        ${explodingBannerHTML}

        <div style="text-align: center; font-weight: 600; font-size: 0.85em; color: #4b5d88; margin: 4px 0 2px;">
          ${typeDisplay} DAMAGE (${diceSummaryText}${explodeModifier ? ` [${explodeModifier}]` : ''})
        </div>
        <div style="transform: scale(0.96); margin: -2px 0;">${damageRollHtml}</div>

        ${damageTotalDisplay}

        <details style="margin-top: 6px; padding: 2px 4px;">
          <summary style="font-weight: 600; font-size: 0.82em; color: #666; cursor: pointer;">Formula Breakdown</summary>
          <div style="padding-top: 4px; border-top: 1px solid #e0e0e0; font-size: 0.8em; color: #555; margin-top: 3px;">
            <div><strong>Spell Save DC:</strong> 8 + PB (${prof}) + ${spellAbility.toUpperCase()} (${abilityMod}) = DC ${spellDC}</div>
            <div><strong>Damage:</strong> ${diceSummaryText} (${typeDisplay})${flatDamageBonus !== 0 ? ` + ${flatDamageBonus}` : ''}${explodeModifier ? ` [${explodeModifier}]` : ''}</div>
          </div>
        </details>
      </div>
    `;

    await ChatMessage.create({
      user: userId,
      speaker: speaker,
      content: getCardDispositionWrapper(actor, token, userId, saveCard),
      rolls: [damageRoll],
      sound: CONFIG.sounds.dice,
      flags: {
        "autoanimations": {
          item: { name: spellName || config.macroName },
          targets: targetIds
        }
      }
    });

    triggerSequencerAnimation(actor, config, rollUser, autoTargetedToken);
  });



  // --- 2.4 D20 Test Execution Handler ---
  socket.register("runD20TestRoll", async (data, actorId, userId) => {
    const actor = game.actors.get(actorId);
    if (!actor) return ui.notifications.warn("Actor not found for D20 Test.");
    const token = actor.getActiveTokens?.()[0] || null;

    const {
      rollType,
      key,
      isReliableTalent,
      isHalflingLuck,
      isSuperAdvantage,
      otherModString
    } = data;

    let baseMod = 0;
    let label = "";
    let sublabel = "";
    let dexScore = 0;
    let tieBreaker = 0;

    function getNumericValue(val, fallback = 0) {
      if (typeof val === "number" && !isNaN(val)) return val;
      if (val && typeof val === "object" && typeof val.value === "number") return val.value;
      const parsed = Number(val);
      return isNaN(parsed) ? fallback : parsed;
    }

    const pb = getNumericValue(actor.system.attributes?.prof, 2);

    const ABILITIES = {
      str: "Strength",
      dex: "Dexterity",
      con: "Constitution",
      int: "Intelligence",
      wis: "Wisdom",
      cha: "Charisma"
    };

    const TOOLS = {
      alchemist: { name: "Alchemist Supplies", ability: "int" },
      brewer: { name: "Brewer's Supplies", ability: "int" },
      calligrapher: { name: "Calligrapher's Supplies", ability: "dex" },
      carpenter: { name: "Carpenter's Tools", ability: "str" },
      cartographer: { name: "Cartographer's Tools", ability: "wis" },
      cobbler: { name: "Cobbler's Tools", ability: "dex" },
      cook: { name: "Cook's Utensils", ability: "wis" },
      disguise: { name: "Disguise Kit", ability: "cha" },
      forgery: { name: "Forgery Kit", ability: "dex" },
      gaming: { name: "Gaming Set", ability: "wis" },
      glassblower: { name: "Glassblower's Tools", ability: "int" },
      herbalism: { name: "Herbalism Kit", ability: "int" },
      jeweler: { name: "Jeweler's Tools", ability: "int" },
      leatherworker: { name: "Leatherworker's Tools", ability: "dex" },
      mason: { name: "Mason's Tools", ability: "str" },
      musical: { name: "Musical Instrument", ability: "cha" },
      navigator: { name: "Navigator's Tools", ability: "wis" },
      painter: { name: "Painter's Supplies", ability: "wis" },
      poisoner: { name: "Poisoner's Kit", ability: "int" },
      potter: { name: "Potter's Tools", ability: "int" },
      smith: { name: "Smith's Tools", ability: "str" },
      thieves: { name: "Thieves' Tools", ability: "dex" },
      tinker: { name: "Tinker's Tools", ability: "dex" },
      weaver: { name: "Weaver's Tools", ability: "dex" },
      woodcarver: { name: "Woodcarver's Tools", ability: "dex" }
    };

    let isProficient = false;

    if (rollType === "init") {
      const dexMod = getNumericValue(actor.system.abilities?.dex?.mod, 0);
      dexScore = getNumericValue(actor.system.abilities?.dex?.value, 10);
      const initBonus = getNumericValue(actor.system.attributes?.init?.roll?.bonus ?? actor.system.attributes?.init?.bonus, 0);
      const alertBonus = actor.items.some(i => i.name?.toLowerCase().includes("alert")) ? 5 : 0;

      baseMod = dexMod + initBonus + alertBonus;
      tieBreaker = dexScore / 100;

      label = "Initiative";
      sublabel = `DEX Mod (${dexMod >= 0 ? '+' : ''}${dexMod}) + Tie-Breaker (.${dexScore})${alertBonus ? ' + Alert (+5)' : ''}`;
    } else if (rollType === "concentration") {
      const conMod = getNumericValue(actor.system.abilities?.con?.mod, 0);
      const conSaveObj = actor.system.abilities?.con?.save;
      const rawSave = getNumericValue(conSaveObj, null);

      let conSaveTotal = conMod;
      if (rawSave !== null) {
        conSaveTotal = rawSave;
      } else {
        const isProf = actor.system.abilities?.con?.proficient || actor.system.abilities?.con?.prof;
        conSaveTotal = conMod + (isProf ? pb : 0);
      }

      baseMod = conSaveTotal;
      label = "Concentration Check";
      sublabel = `CON Save (${baseMod >= 0 ? '+' : ''}${baseMod})`;
    } else if (rollType === "skill") {
      const storedD20Profiles = window.CustomRolls.getProfileData?.(actor, "d20ProfilesV2")
        || actor.getFlag("world", "d20ProfilesV2")
        || window.CustomRolls.getProfileData?.(actor, "d20Profiles")
        || actor.getFlag("world", "d20Profiles")
        || {};

      if (key && key.startsWith("custom_")) {
        const customObj = storedD20Profiles[key];
        const abil = customObj?.ability || "int";
        const customProf = Boolean(customObj?.proficient);
        if (customProf) isProficient = true;
        const profBonus = customProf ? pb : 0;
        baseMod = getNumericValue(actor.system.abilities?.[abil]?.mod, 0) + profBonus;
        label = `${customObj?.name || "Custom"} Check`;
        sublabel = `${abil.toUpperCase()} Base${profBonus ? ` + PB (+${profBonus})` : ""}`;
      } else {
        const skill = actor.system.skills?.[key];
        baseMod = getNumericValue(skill?.total, 0);
        const profLevel = Number(skill?.value ?? skill?.proficient ?? skill?.prof?.multiplier ?? (skill?.prof?.hasProficiency ? 1 : 0) ?? 0);
        if (profLevel > 0 || Boolean(skill?.proficient) || Boolean(skill?.prof?.hasProficiency)) isProficient = true;
        const skillNames = {
          acr: "Acrobatics", ani: "Animal Handling", arc: "Arcana", ath: "Athletics",
          dec: "Deception", his: "History", ins: "Insight", itm: "Intimidation",
          inv: "Investigation", med: "Medicine", nat: "Nature", prc: "Perception",
          prf: "Performance", per: "Persuasion", rel: "Religion", slt: "Sleight of Hand",
          ste: "Stealth", sur: "Survival"
        };
        label = `${skillNames[key] || key.toUpperCase()} Check`;
        sublabel = `${(skill?.ability || "dex").toUpperCase()} Base`;
      }
    } else if (rollType === "tool") {
      const storedD20Profiles = window.CustomRolls.getProfileData?.(actor, "d20ProfilesV2")
        || actor.getFlag("world", "d20ProfilesV2")
        || window.CustomRolls.getProfileData?.(actor, "d20Profiles")
        || actor.getFlag("world", "d20Profiles")
        || {};

      if (key && key.startsWith("custom_")) {
        const customObj = storedD20Profiles[key];
        const abil = customObj?.ability || "dex";
        const customProf = Boolean(customObj?.proficient);
        if (customProf) isProficient = true;
        const profBonus = customProf ? pb : 0;
        baseMod = getNumericValue(actor.system.abilities?.[abil]?.mod, 0) + profBonus;
        label = `${customObj?.name || "Custom"} Tool Check`;
        sublabel = `${abil.toUpperCase()} Base${profBonus ? ` + PB (+${profBonus})` : ""}`;
      } else {
        const tool = TOOLS[key];
        const abil = tool?.ability || "dex";
        const abilMod = getNumericValue(actor.system.abilities?.[abil]?.mod, 0);
        const toolItem = actor.items.find(i => i.type === "tool" && i.name.toLowerCase().includes((tool?.name || "").toLowerCase().split("'")[0]));
        const isProf = actor.system.tools?.[key]?.proficient || toolItem?.system?.proficient || 0;
        const profBonus = isProf ? pb * (isProf === 2 ? 2 : 1) : 0;
        if (Number(isProf) > 0) isProficient = true;

        baseMod = abilMod + profBonus;
        label = `${tool?.name || "Tool"} Check`;
        sublabel = `${abil.toUpperCase()} Base${profBonus ? ` + PB (+${profBonus})` : ""}`;
      }
    } else if (rollType === "save") {
      const abilKey = key.replace("save_", "");
      const saveObj = actor.system.abilities?.[abilKey]?.save;
      const modObj = actor.system.abilities?.[abilKey]?.mod;
      baseMod = getNumericValue(saveObj, getNumericValue(modObj, 0));
      const abilName = ABILITIES[abilKey] || abilKey.toUpperCase();
      label = `${abilName} Saving Throw`;
      sublabel = "Ability Save";
    } else {
      const storedD20Profiles = window.CustomRolls.getProfileData?.(actor, "d20ProfilesV2")
        || actor.getFlag("world", "d20ProfilesV2")
        || window.CustomRolls.getProfileData?.(actor, "d20Profiles")
        || actor.getFlag("world", "d20Profiles")
        || {};

      if (key && key.startsWith("custom_")) {
        const customObj = storedD20Profiles[key];
        const abil = customObj?.ability || "str";
        const customProf = Boolean(customObj?.proficient);
        if (customProf) isProficient = true;
        const profBonus = customProf ? pb : 0;
        baseMod = getNumericValue(actor.system.abilities?.[abil]?.mod, 0) + profBonus;
        label = `${customObj?.name || "Custom"} Ability Check`;
        sublabel = `${abil.toUpperCase()} Base${profBonus ? ` + PB (+${profBonus})` : ""}`;
      } else {
        const abilKey = key.replace("check_", "");
        baseMod = getNumericValue(actor.system.abilities?.[abilKey]?.mod, 0);
        const abilName = ABILITIES[abilKey] || abilKey.toUpperCase();
        label = `${abilName} Ability Check`;
        sublabel = "Raw Ability";
      }
    }

    let dieFormula = "1d20";
    if (isHalflingLuck) dieFormula += "r1";
    // Reliable talent: active if explicitly toggled (or if proficient skill/tool)
    const applyReliableTalent = Boolean(isReliableTalent) && (isProficient || rollType === "skill" || rollType === "tool" || rollType === "check");
    if (applyReliableTalent) dieFormula += "min10";

    const cleanOther = (otherModString || "").trim();
    let formulaSuffix = `${baseMod >= 0 ? `+ ${baseMod}` : `- ${Math.abs(baseMod)}`}`;
    if (cleanOther) {
      const formattedOther = cleanOther.startsWith("+") || cleanOther.startsWith("-") ? cleanOther : `+ ${cleanOther}`;
      formulaSuffix += ` ${formattedOther}`;
    }

    // 1. Roll the primary roll (rolls 1d20 plus all extra modifiers and bonus dice)
    const fullFormula = `${dieFormula} ${formulaSuffix}`;
    const roll1 = await new Roll(fullFormula).evaluate();

    // 2. Roll second d20 slot for Advantage / Disadvantage / Super Advantage
    let roll2 = null;
    let rollD20Second = null;
    let droppedCandidate = null;

    if (isSuperAdvantage) {
      const candidateA = await new Roll(dieFormula).evaluate();
      const candidateB = await new Roll(dieFormula).evaluate();

      const rawA = candidateA.dice[0]?.results?.[0]?.result ?? candidateA.dice[0]?.total ?? candidateA.total;
      const rawB = candidateB.dice[0]?.results?.[0]?.result ?? candidateB.dice[0]?.total ?? candidateB.total;
      let valA = candidateA.dice[0]?.total ?? candidateA.total;
      let valB = candidateB.dice[0]?.total ?? candidateB.total;

      // Enforce Reliable Talent floor of 10 if active
      if (applyReliableTalent) {
        valA = Math.max(10, valA);
        valB = Math.max(10, valB);
      }

      // Pick highest by evaluated value (or break ties with raw roll)
      if (valA > valB || (valA === valB && rawA >= rawB)) {
        rollD20Second = candidateA;
        droppedCandidate = candidateB;
      } else {
        rollD20Second = candidateB;
        droppedCandidate = candidateA;
      }
    } else {
      rollD20Second = await new Roll(dieFormula).evaluate();
    }

    // Construct roll2 reusing evaluated modifier terms from roll1 so extra dice (e.g. 1d4) are only rolled once
    const cloneTerm = (t) => {
      if (typeof t.clone === "function") return t.clone();
      if (typeof t.constructor?.fromData === "function") return t.constructor.fromData(t.toJSON());
      return RollTerm.fromJSON(JSON.stringify(t));
    };
    const terms2 = [cloneTerm(rollD20Second.terms[0]), ...roll1.terms.slice(1).map(cloneTerm)];
    roll2 = Roll.fromTerms(terms2);
    if (!roll2._evaluated) {
      await roll2.evaluate();
    }

    let d20_1 = roll1.dice[0]?.total ?? 0;
    let d20_2 = rollD20Second.dice[0]?.total ?? 0;
    if (applyReliableTalent) {
      d20_1 = Math.max(10, d20_1);
      d20_2 = Math.max(10, d20_2);
    }

    // Helper to detect genuine Halfling Lucky rerolls on a roll object (only when a 1 is rerolled)
    const getHalflingReroll = (rollObj) => {
      const results = rollObj?.dice?.[0]?.results || [];
      const rerolled = results.find(r => r.rerolled === true && r.result === 1);
      const active = results.find(r => r.active !== false && !r.rerolled);
      if (rerolled && active) {
        return { original: rerolled.result, final: active.result };
      }
      return null;
    };

    const reroll1 = isHalflingLuck ? getHalflingReroll(roll1) : null;
    const reroll2 = isHalflingLuck ? getHalflingReroll(rollD20Second) : null;

    let rHtml1 = await roll1.render();
    let rHtml2 = await roll2.render();

    if (d20_1 === 20) rHtml1 = rHtml1.replace('dice-total', 'dice-total critical');
    else if (d20_1 === 1) rHtml1 = rHtml1.replace('dice-total', 'dice-total fumble');

    if (d20_2 === 20) rHtml2 = rHtml2.replace('dice-total', 'dice-total critical');
    else if (d20_2 === 1) rHtml2 = rHtml2.replace('dice-total', 'dice-total fumble');

    const renderHalflingRerollBox = (reroll) => {
      if (!reroll) return "";
      return `<div style="padding: 2px 4px; margin: 3px 0 0; border: 1px solid #17a2b8; border-radius: 3px; background-color: #e0f7fa; font-size: 0.75em; text-align: center;">
        <span style="font-weight: 600; color: #117a8b;">Halfling Lucky:</span> <span style="color: #dc3545;">Rolled ${reroll.original}</span> &rarr; <span style="font-weight: bold; color: #007bff;">${reroll.final}</span>
      </div>`;
    };

    if (reroll1) rHtml1 += renderHalflingRerollBox(reroll1);
    if (reroll2) rHtml2 += renderHalflingRerollBox(reroll2);

    if (isSuperAdvantage && droppedCandidate) {
      // Use the active result (post-reroll) as the natural roll
      const getActiveResult = (rollObj, fallback) => {
        const results = rollObj?.dice?.[0]?.results || [];
        const activeItem = results.find(r => r.active !== false);
        return activeItem ? activeItem.result : fallback;
      };

      const keptRaw = getActiveResult(rollD20Second, d20_2);
      const droppedRaw = getActiveResult(droppedCandidate, droppedCandidate.dice[0]?.total ?? droppedCandidate.total);
      const droppedVal = applyReliableTalent ? Math.max(10, (droppedCandidate.dice[0]?.total ?? droppedCandidate.total)) : (droppedCandidate.dice[0]?.total ?? droppedCandidate.total);

      const keptDisplay = (applyReliableTalent && keptRaw < 10) ? `${keptRaw} → ${d20_2}` : `${d20_2}`;
      const droppedDisplay = (applyReliableTalent && droppedRaw < 10) ? `${droppedRaw} → ${droppedVal}` : `${droppedVal}`;

      const superAdvHtml = `<div style="padding: 2px 4px; margin: 3px 0 0; border: 1px solid #7289DA; border-radius: 3px; background-color: #f0f4ff; font-size: 0.75em; text-align: center;">
        <span style="font-weight: bold; color: #4b5d88;">Super Adv (Kept d20: ${keptDisplay} | Dropped: ${droppedDisplay})</span>
      </div>`;
      rHtml2 += superAdvHtml;
    }

    const finalTotal1 = rollType === "init" ? (roll1.total + tieBreaker) : roll1.total;
    const finalTotal2 = rollType === "init" ? (roll2.total + tieBreaker) : roll2.total;

    if (rollType === "init") {
      rHtml1 = rHtml1.replace(/>\s*([0-9]+)\s*<\/h4>/, `>${finalTotal1.toFixed(2)}</h4>`);
      rHtml2 = rHtml2.replace(/>\s*([0-9]+)\s*<\/h4>/, `>${finalTotal2.toFixed(2)}</h4>`);

      const combat = game.combat;
      if (combat) {
        const combatant = combat.combatants.find(c => c.actorId === actor.id);
        if (combatant) {
          await combat.setInitiative(combatant.id, finalTotal1);
        }
      }
    }

    const tags = [];
    if (rollType === "skill") {
      tags.push('<span style="background: rgba(114, 137, 218, 0.15); border: 1px solid rgba(114, 137, 218, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #4b5d88;">Skill Check</span>');
    } else if (rollType === "check") {
      tags.push('<span style="background: rgba(40, 167, 69, 0.15); border: 1px solid rgba(40, 167, 69, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #28a745;">Ability Check</span>');
    } else if (rollType === "save") {
      tags.push('<span style="background: rgba(220, 53, 69, 0.15); border: 1px solid rgba(220, 53, 69, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #dc3545;">Saving Throw</span>');
    } else if (rollType === "tool") {
      tags.push('<span style="background: rgba(111, 66, 193, 0.15); border: 1px solid rgba(111, 66, 193, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #5a32a3;">Tool Check</span>');
    } else if (rollType === "concentration") {
      tags.push('<span style="background: rgba(163, 72, 72, 0.15); border: 1px solid rgba(163, 72, 72, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #a34848;">Concentration</span>');
    } else if (rollType === "init") {
      tags.push('<span style="background: rgba(43, 116, 137, 0.15); border: 1px solid rgba(43, 116, 137, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #235d6e;">Initiative</span>');
    }

    if (isSuperAdvantage) {
      tags.push('<span style="background: rgba(40, 167, 69, 0.2); border: 1px solid rgba(40, 167, 69, 0.5); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #1e7e34;">Super Advantage</span>');
    }
    if (applyReliableTalent) {
      tags.push('<span style="background: rgba(108, 117, 125, 0.15); border: 1px solid rgba(108, 117, 125, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #495057;">Reliable Talent</span>');
    }
    if (isHalflingLuck) {
      tags.push('<span style="background: rgba(255, 193, 7, 0.2); border: 1px solid rgba(255, 193, 7, 0.5); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #856404;">Halfling Luck</span>');
    }

    const tagsBlock = tags.length > 0
      ? `<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px;">${tags.join("")}</div>`
      : "";

    const rollsRowHtml = `
      <div style="display: flex; justify-content: space-around; gap: 8px; margin-bottom: 6px;">
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 0.75em; font-weight: 600; color: #777; margin-bottom: 2px;">NORMAL ROLL</div>
          <div style="transform: scale(0.96); margin: -2px 0;">${rHtml1}</div>
        </div>
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 0.75em; font-weight: 600; color: #777; margin-bottom: 2px;">${isSuperAdvantage ? "SUPER ADV" : "ADV / DIS"}</div>
          <div style="transform: scale(0.96); margin: -2px 0;">${rHtml2}</div>
        </div>
      </div>
    `;

    const cardContent = `
      <div style="font-family: inherit; color: #333;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #343a40; padding-bottom: 3px; margin-bottom: 6px;">
          <span style="font-size: 1.05em; font-weight: bold; color: #2b3a4a;">${label}</span>
          <span style="font-size: 0.8em; color: #777;">${actor.name}</span>
        </div>

        ${tagsBlock}

        ${rollsRowHtml}

        <details style="margin-top: 6px; padding: 2px 4px;">
          <summary style="font-weight: 600; font-size: 0.82em; color: #666; cursor: pointer;">Modifier Breakdown</summary>
          <div style="padding-top: 4px; border-top: 1px solid #e0e0e0; font-size: 0.8em; color: #555; margin-top: 3px;">
            <div><strong>Subtype:</strong> ${sublabel}</div>
            <div><strong>Base Modifier:</strong> ${baseMod >= 0 ? `+${baseMod}` : baseMod}</div>
            ${rollType === "init" ? `<div><strong>DEX Score Tie-Breaker:</strong> +${tieBreaker} (Score:${dexScore})</div>` : ''}
            ${cleanOther ? `<div><strong>Extra Modifier:</strong> ${cleanOther}</div>` : ''}
            <div><strong>Base Formula:</strong> <code>${fullFormula}</code></div>
          </div>
        </details>
      </div>
    `;

    const chatRolls = [roll1, roll2];
    if (droppedCandidate) chatRolls.push(droppedCandidate);

    return await ChatMessage.create({
      user: userId,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: getCardDispositionWrapper(actor, token, userId, cardContent),
      rolls: chatRolls,
      sound: CONFIG.sounds.dice
    });
  });

  // --- 2.5 Party Long Rest Execution Handler ---
  socket.register("runPartyLongRest", async (actorIds, userId) => {
    if (!game.user.isGM) return;

    const summaryRows = [];

    for (const id of actorIds) {
      const actor = game.actors.get(id);
      if (!actor) continue;

      const updates = {};

      const maxHp = actor.system.attributes?.hp?.max ?? 0;
      updates["system.attributes.hp.value"] = maxHp;
      updates["system.attributes.hp.temp"] = 0;

      const spells = actor.system.spells || {};
      for (const [key, slot] of Object.entries(spells)) {
        if (slot && typeof slot.max === "number" && slot.max > 0) {
          updates[`system.spells.${key}.value`] = slot.max;
        }
      }

      const classes = actor.itemTypes?.class || [];
      let totalHitDice = 0;
      let spentHitDice = 0;

      for (const cls of classes) {
        const levels = cls.system?.levels ?? 0;
        const hdUsed = cls.system?.hitDiceUsed ?? 0;
        totalHitDice += levels;
        spentHitDice += hdUsed;
      }

      const hdToRecover = Math.max(1, Math.floor(totalHitDice / 2));
      let remainingRecovery = hdToRecover;

      for (const cls of classes) {
        if (remainingRecovery <= 0) break;
        const hdUsed = cls.system?.hitDiceUsed ?? 0;
        if (hdUsed > 0) {
          const recoverThis = Math.min(hdUsed, remainingRecovery);
          await cls.update({ "system.hitDiceUsed": hdUsed - recoverThis });
          remainingRecovery -= recoverThis;
        }
      }

      await actor.update(updates);

      // Recharges Tracking Stuff, class resources, and magic items on Long Rest
      if (typeof window.CustomRolls?.rechargeActorTrackers === "function") {
        await window.CustomRolls.rechargeActorTrackers(actor, "lr");
      }

      summaryRows.push(`
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 2px; border-bottom: 1px dotted #ccc; font-size: 0.85em;">
          <strong style="color: #2b3a4a;">${actor.name}</strong>
          <span style="color: #28a745; font-size: 0.8em; font-weight: 600;">HP Full &bull; Slots Reset &bull; +${hdToRecover - remainingRecovery} HD</span>
        </div>
      `);
    }

    const cardContent = `
      <div style="font-size: 18px; font-family: inherit; color: #333;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #343a40; padding-bottom: 3px; margin-bottom: 6px;">
          <span style="font-size: 1.05em; font-weight: bold; color: #2b3a4a;">Party Long Rest Completed</span>
          <span style="font-size: 0.8em; color: #777;"><i class="fas fa-campground"></i> 8 Hours</span>
        </div>
        <div style="background: rgba(40, 167, 69, 0.08); border: 1px solid rgba(40, 167, 69, 0.3); border-radius: 4px; padding: 4px 6px; margin-bottom: 6px; font-size: 0.8em; color: #218838; text-align: center;">
          All hit points restored, spell slots replenished, and hit dice recovered.
        </div>
        <div style="background: rgba(0,0,0,0.02); border: 1px solid #d2d7df; border-radius: 4px; padding: 6px 8px;">
          ${summaryRows.join("")}
        </div>
      </div>
    `;

    await ChatMessage.create({
      user: userId,
      speaker: { alias: "Campground" },
      content: cardContent
    });
  });

  // --- 2.6 Save Game Gag Handlers ---
  socket.register("broadcastSaveDialog", async () => {
    if (window._activeSaveDialog) return;

    const content = `
      <div style="font-size: 15px; font-family: inherit; color: #333; padding: 4px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #343a40; padding-bottom: 4px; margin-bottom: 8px;">
          <span style="font-weight: bold; color: #2b3a4a;">System Alert</span>
          <span style="font-size: 0.8em; color: #777;"><i class="fas fa-save"></i> Save Point</span>
        </div>
        <p style="margin: 0 0 8px 0; font-size: 0.95em;">
          You have reached the end of the session. Who will commit the save before exiting?
        </p>
        <div class="form-group" style="margin-bottom: 6px;">
          <label style="font-weight: 600; font-size: 0.85em; color: #4b5d88; display: block; margin-bottom: 3px;">SAVE SLOT</label>
          <select id="save-slot-broadcast" style="width: 100%; height: 30px; border-radius: 4px; border: 1px solid #7289da; padding: 2px 6px;">
            <option value="1">Slot 1: AutoSave (Current Campaign)</option>
            <option value="2">Slot 2: Quicksave (Dungeon Floor 3)</option>
            <option value="3">Slot 3: Hardcore Run (Do Not Overwrite)</option>
          </select>
        </div>
      </div>
    `;

    window._activeSaveDialog = new Dialog({
      title: "System: Save Progress",
      content: content,
      buttons: {
        save: {
          icon: '<i class="fas fa-floppy-disk" style="margin-right: 4px;"></i>',
          label: "Save & Exit",
          callback: async (html) => {
            const slotName = html.find("#save-slot-broadcast option:selected").text();
            await socket.executeAsGM("resolveSaveGame", {
              slotName,
              saverName: game.user.name,
              userId: game.user.id
            });
          }
        },
        cancel: {
          label: "Dismiss"
        }
      },
      default: "save",
      close: () => {
        window._activeSaveDialog = null;
      }
    }, { width: 340, height: "auto" });

    window._activeSaveDialog.render(true);
  });

  socket.register("closeSaveDialogForAll", async () => {
    if (window._activeSaveDialog) {
      window._activeSaveDialog.close();
      window._activeSaveDialog = null;
    }
  });

  socket.register("resolveSaveGame", async (data) => {
    if (!game.user.isGM) return;

    await socket.executeForEveryone("closeSaveDialogForAll");

    const { slotName, saverName, userId } = data;
    await new Promise(resolve => setTimeout(resolve, 1500));

    const SUCCESS_FLAVORS = [
      "All current hit points, inventory states, and trauma have been preserved. See you next session.",
      "Checkpoints updated. The tavern bed is cold, but your progress is warm and safe.",
      "Game progress serialized to sector 7G. May your next initiative roll be merciful.",
      "State saved successfully. Remember to stretch, hydrate, and pretend that last fumble never happened.",
      "Autosave verified. Your questionable tactical choices have been permanently recorded.",
      "Memory sectors locked. Take a long rest in the real world.",
      "Save state intact. Rumors of impending character mortality have been temporarily postponed.",
      "Progress anchored to the timeline. Don't let the mimic bite on your way out.",
      "All spell slots, debts, and bad decisions archived to the local drive. Rest easy.",
      "Sync complete. You may now safely step away from the table without losing your gear."
    ];

    const CORRUPT_FLAVORS = [
      `CRITICAL: Parity check failed. Please direct all complaints to ${saverName}. See you next week.`,
      `Memory sector corrupted. Character sheets may revert to commoners with pitchforks upon next boot.`,
      `Save write interrupted. A localized tear in the weave has consumed your inventory.`,
      `Checksum mismatch on block 0xDEADBEEF. All magic items converted into dry rations.`,
      `Parity failed: File integrity compromised. Hope everyone remembers their current hit points.`,
      `Buffer overflow error. The BBEG has gained root administrative access to your party files.`,
      `Corrupted state file. If you wake up inside a dungeon wall next session, this is why.`,
      `File format unrecognized. Please insert 25 cents or one diamond worth 300gp to continue.`,
      `Failed to mount partition. The gods have left your timeline uncommitted.`,
      `Save aborted. A wandering rust monster appears to have eaten the storage sectors.`
    ];

    const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const isCorrupt = Math.random() < 0.25;
    let cardContent = "";

    if (isCorrupt) {
      const flavor = pickRandom(CORRUPT_FLAVORS);
      cardContent = `
        <div style="font-size: 15px; font-family: inherit; color: #333;">
          <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #dc3545; padding-bottom: 3px; margin-bottom: 6px;">
            <span style="font-size: 1.05em; font-weight: bold; color: #dc3545;">
              <i class="fas fa-triangle-exclamation"></i> Error: Save Corrupted
            </span>
            <span style="font-size: 0.8em; color: #888;">ERR_CORRUPT_SECTOR</span>
          </div>
          <div style="background: rgba(220, 53, 69, 0.08); border: 1px solid rgba(220, 53, 69, 0.35); border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
            <div style="font-weight: 600; color: #b02a37; font-size: 0.95em;">DATA CORRUPTION DETECTED</div>
            <div style="font-size: 0.85em; color: #666; margin-top: 2px;">Saved by: <strong>${saverName}</strong> &bull; ${slotName}</div>
          </div>
          <p style="font-size: 0.85em; color: #555; margin: 0; font-family: monospace;">
            ${flavor}
          </p>
        </div>
      `;
    } else {
      const flavor = pickRandom(SUCCESS_FLAVORS);
      cardContent = `
        <div style="font-size: 15px; font-family: inherit; color: #333;">
          <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #28a745; padding-bottom: 3px; margin-bottom: 6px;">
            <span style="font-size: 1.05em; font-weight: bold; color: #218838;">
              <i class="fas fa-check-circle"></i> Save Successful
            </span>
            <span style="font-size: 0.8em; color: #888;">Session Terminated</span>
          </div>
          <div style="background: rgba(40, 167, 69, 0.08); border: 1px solid rgba(40, 167, 69, 0.35); border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
            <div style="font-weight: 600; color: #1e7e34; font-size: 0.95em;">Progress Written to Memory Card</div>
            <div style="font-size: 0.85em; color: #666; margin-top: 2px;">Saved by: <strong>${saverName}</strong> &bull; ${slotName}</div>
          </div>
          <p style="font-size: 0.85em; color: #555; margin: 0;">
            ${flavor}
          </p>
        </div>
      `;
    }

    await ChatMessage.create({
      user: userId,
      speaker: { alias: "Memory Card 1" },
      content: cardContent
    });
  });

  // --- 2.7 Load Game Gag Handlers ---
  socket.register("broadcastLoadDialog", async () => {
    if (window._activeLoadDialog) return;

    const content = `
      <div style="font-size: 15px; font-family: inherit; color: #333; padding: 4px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #343a40; padding-bottom: 4px; margin-bottom: 8px;">
          <span style="font-weight: bold; color: #2b3a4a;">System: Load Game</span>
          <span style="font-size: 0.8em; color: #777;"><i class="fas fa-folder-open"></i> Memory Card</span>
        </div>
        <p style="margin: 0 0 8px 0; font-size: 0.95em;">
          Select a saved state to restore the party's timeline for tonight's session:
        </p>
        <div class="form-group" style="margin-bottom: 6px;">
          <label style="font-weight: 600; font-size: 0.85em; color: #4b5d88; display: block; margin-bottom: 3px;">SELECT SAVE FILE</label>
          <select id="load-slot-broadcast" style="width: 100%; height: 30px; border-radius: 4px; border: 1px solid #7289da; padding: 2px 6px;">
            <option value="1">Slot 1: AutoSave (Session End - Safe Area)</option>
            <option value="2">Slot 2: Quicksave (Right Before Bad Decisions)</option>
            <option value="3">Slot 3: Hardcore Run (Level 1 Memories)</option>
            <option value="4">Slot 4: New Game+ (Overconfident Party)</option>
          </select>
        </div>
      </div>
    `;

    window._activeLoadDialog = new Dialog({
      title: "System: Resume Game",
      content: content,
      buttons: {
        load: {
          icon: '<i class="fas fa-play" style="margin-right: 4px;"></i>',
          label: "Load State",
          callback: async (html) => {
            const slotName = html.find("#load-slot-broadcast option:selected").text();
            await socket.executeAsGM("resolveLoadGame", {
              slotName,
              loaderName: game.user.name,
              userId: game.user.id
            });
          }
        },
        cancel: {
          label: "Dismiss"
        }
      },
      default: "load",
      close: () => {
        window._activeLoadDialog = null;
      }
    }, { width: 350, height: "auto" });

    window._activeLoadDialog.render(true);
  });

  socket.register("closeLoadDialogForAll", async () => {
    if (window._activeLoadDialog) {
      window._activeLoadDialog.close();
      window._activeLoadDialog = null;
    }
  });

  socket.register("resolveLoadGame", async (data) => {
    if (!game.user.isGM) return;

    await socket.executeForEveryone("closeLoadDialogForAll");

    const { slotName, loaderName, userId } = data;
    await new Promise(resolve => setTimeout(resolve, 1400));

    const LOAD_TIPS = [
      "Tip: Standing directly inside dragon breath significantly reduces lifespan.",
      "Tip: Don't forget that your bard can cast spells other than Vicious Mockery.",
      "Tip: Always check chests for teeth before reaching inside.",
      "Tip: Splitting the party is guaranteed to speed up character creation.",
      "Tip: Your rations are strictly cosmetic until the DM remembers encumbrance.",
      "Tip: Running away yields 100% of your current hit points next round.",
      "Tip: If an NPC is overly friendly, they are either a devil or a mimic.",
      "Tip: Rolling a natural 1 on Perception means you got dust in your eye.",
      "Tip: Friendly fire isn't, but Fireball doesn't care.",
      "Tip: Please pretend you fully remember everything that happened last week."
    ];

    const randomTip = LOAD_TIPS[Math.floor(Math.random() * LOAD_TIPS.length)];

    const cardContent = `
      <div style="font-size: 15px; font-family: inherit; color: #333;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #2b7489; padding-bottom: 3px; margin-bottom: 6px;">
          <span style="font-size: 1.05em; font-weight: bold; color: #235d6e;">
            <i class="fas fa-play"></i> Session Loaded
          </span>
          <span style="font-size: 0.8em; color: #888;">State Restored</span>
        </div>
        <div style="background: rgba(43, 116, 137, 0.08); border: 1px solid rgba(43, 116, 137, 0.35); border-radius: 4px; padding: 6px 8px; margin-bottom: 6px;">
          <div style="font-weight: 600; color: #235d6e; font-size: 0.95em;">World State Synchronized</div>
          <div style="font-size: 0.85em; color: #555; margin-top: 2px;">Loaded by: <strong>${loaderName}</strong> &bull; ${slotName}</div>
        </div>
        <div style="background: rgba(0,0,0,0.03); border-left: 3px solid #7289da; padding: 6px 8px; font-style: italic; font-size: 0.88em; color: #444;">
          ${randomTip}
        </div>
      </div>
    `;

    await ChatMessage.create({
      user: userId,
      speaker: { alias: "Bootloader" },
      content: cardContent
    });
  });

  // --- 2.8 Synced Video Player & Controller ---
  socket.register("playSyncedVideo", async (videoUrl) => {
    if (window._activeVideoPopup) {
      window._activeVideoPopup.close();
      window._activeVideoPopup = null;
    }

    let mediaHtml = "";
    const isYouTube = videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be");

    if (isYouTube) {
      let videoId = "";
      if (videoUrl.includes("watch?v=")) {
        videoId = videoUrl.split("watch?v=")[1].split("&")[0];
      } else if (videoUrl.includes("youtu.be/")) {
        videoId = videoUrl.split("youtu.be/")[1].split("?")[0];
      }

      mediaHtml = `
        <iframe id="synced-video-iframe" width="100%" height="450" 
          src="https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1" 
          frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen style="display: block; border-radius: 4px;">
        </iframe>
      `;
    } else {
      mediaHtml = `
        <video id="synced-video-element" width="100%" height="auto" controls autoplay style="display: block; border-radius: 4px; max-height: 500px; background: #000;">
          <source src="${videoUrl}">
          Your browser does not support HTML5 video.
        </video>
      `;
    }

    const content = `
      <div style="background: #111; padding: 6px; border-radius: 6px;">
        ${mediaHtml}
      </div>
    `;

    window._activeVideoPopup = new Dialog({
      title: "Incoming Cutscene",
      content: content,
      buttons: {},
      close: () => {
        window._activeVideoPopup = null;
      }
    }, { width: 800, height: "auto" });

    window._activeVideoPopup.render(true);

    if (game.user.isGM) {
      if (window._videoControllerDialog) window._videoControllerDialog.close();

      const controllerContent = `
        <div style="font-size: 14px; font-family: inherit; padding: 6px; text-align: center;">
          <div style="margin-bottom: 8px; font-weight: 600; color: #2b3a4a;">GM Sync Controls</div>
          <div style="display: flex; gap: 8px; justify-content: center;">
            <button type="button" class="btn-video-pause" style="flex: 1; height: 32px; cursor: pointer;">
              <i class="fas fa-pause"></i> Pause
            </button>
            <button type="button" class="btn-video-play" style="flex: 1; height: 32px; cursor: pointer;">
              <i class="fas fa-play"></i> Play
            </button>
            <button type="button" class="btn-video-stop" style="flex: 1; height: 32px; background: rgba(220,53,69,0.15); border: 1px solid #dc3545; color: #dc3545; cursor: pointer;">
              <i class="fas fa-stop"></i> Close All
            </button>
          </div>
        </div>
      `;

      window._videoControllerDialog = new Dialog({
        title: "Video Controls",
        content: controllerContent,
        buttons: {},
        render: (html) => {
          html.find('.btn-video-pause').on('click', () => {
            socket.executeForEveryone("controlVideoPlayback", "pause");
          });
          html.find('.btn-video-play').on('click', () => {
            socket.executeForEveryone("controlVideoPlayback", "play");
          });
          html.find('.btn-video-stop').on('click', () => {
            socket.executeForEveryone("closeVideoForAll");
          });
        },
        close: () => {
          window._videoControllerDialog = null;
        }
      }, { width: 340, height: "auto" });

      window._videoControllerDialog.render(true);
    }
  });

  socket.register("controlVideoPlayback", async (action) => {
    const iframe = document.getElementById("synced-video-iframe");
    if (iframe && iframe.contentWindow) {
      const ytCommand = action === "play" ? "playVideo" : "pauseVideo";
      iframe.contentWindow.postMessage(JSON.stringify({
        event: "command",
        func: ytCommand,
        args: []
      }), "*");
      return;
    }

    const video = document.getElementById("synced-video-element");
    if (video) {
      if (action === "play") video.play();
      if (action === "pause") video.pause();
    }
  });

  socket.register("closeVideoForAll", async () => {
    if (window._activeVideoPopup) {
      window._activeVideoPopup.close();
      window._activeVideoPopup = null;
    }
    if (window._videoControllerDialog) {
      window._videoControllerDialog.close();
      window._videoControllerDialog = null;
    }
  });

  // --- 2.9 Synced Background Audio / Music Player ---
  socket.register("playSyncedMusic", async (mediaUrl) => {
    if (window._activeMusicPopup) {
      window._activeMusicPopup.close();
      window._activeMusicPopup = null;
    }

    let mediaHtml = "";
    const isYouTube = mediaUrl.includes("youtube.com") || mediaUrl.includes("youtu.be");

    if (isYouTube) {
      let videoId = "";
      if (mediaUrl.includes("watch?v=")) {
        videoId = mediaUrl.split("watch?v=")[1].split("&")[0];
      } else if (mediaUrl.includes("youtu.be/")) {
        videoId = mediaUrl.split("youtu.be/")[1].split("?")[0];
      }

      mediaHtml = `
        <iframe id="synced-audio-iframe" width="200" height="200" 
          src="https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&origin=${encodeURIComponent(window.location.origin)}" 
          frameborder="0" allow="autoplay" 
          style="position: fixed; left: -9999px; top: -9999px;">
        </iframe>
      `;
    } else {
      mediaHtml = `
        <audio id="synced-audio-element" autoplay style="display: none;">
          <source src="${mediaUrl}">
        </audio>
      `;
    }

    const content = `
      <div style="font-size: 14px; font-family: inherit; padding: 6px;">
        ${mediaHtml}
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <span style="font-weight: 600; color: #2b3a4a;">
            <i class="fas fa-volume-high" style="color: #28a745; margin-right: 4px;"></i> Audio Stream
          </span>
          <span style="font-size: 0.8em; color: #777;">Connected</span>
        </div>
        <div class="form-group" style="margin: 0;">
          <label style="font-size: 0.8em; color: #555; display: block; margin-bottom: 4px;">Local Volume</label>
          <input type="range" class="synced-local-vol" min="0" max="100" value="80" style="width: 100%; cursor: pointer;">
        </div>
      </div>
    `;

    window._activeMusicPopup = new Dialog({
      title: "Atmosphere",
      content: content,
      buttons: {},
      render: (html) => {
        html.find('.synced-local-vol').on('input', (event) => {
          const val = Number(event.target.value);
          const iframe = document.getElementById("synced-audio-iframe");
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage(JSON.stringify({
              event: "command",
              func: "setVolume",
              args: [val]
            }), "*");
          }
          const audio = document.getElementById("synced-audio-element");
          if (audio) {
            audio.volume = val / 100;
          }
        });
      },
      close: () => {
        const iframe = document.getElementById("synced-audio-iframe");
        if (iframe) iframe.remove();
        const audio = document.getElementById("synced-audio-element");
        if (audio) audio.remove();
        window._activeMusicPopup = null;
      }
    }, { width: 260, height: "auto" });

    window._activeMusicPopup.render(true);

    if (game.user.isGM) {
      if (window._musicControllerDialog) window._musicControllerDialog.close();

      const controllerContent = `
        <div style="font-size: 14px; font-family: inherit; padding: 6px; text-align: center;">
          <div style="margin-bottom: 8px; font-weight: 600; color: #2b3a4a;">Music GM Controls</div>
          <div style="display: flex; gap: 6px; justify-content: center;">
            <button type="button" class="btn-music-pause" style="flex: 1; height: 30px; cursor: pointer;">
              <i class="fas fa-pause"></i> Pause
            </button>
            <button type="button" class="btn-music-play" style="flex: 1; height: 30px; cursor: pointer;">
              <i class="fas fa-play"></i> Play
            </button>
            <button type="button" class="btn-music-stop" style="flex: 1; height: 30px; background: rgba(220,53,69,0.15); border: 1px solid #dc3545; color: #dc3545; cursor: pointer;">
              <i class="fas fa-stop"></i> Stop All
            </button>
          </div>
        </div>
      `;

      window._musicControllerDialog = new Dialog({
        title: "Music Controls",
        content: controllerContent,
        buttons: {},
        render: (html) => {
          html.find('.btn-music-pause').on('click', () => {
            socket.executeForEveryone("controlMusicPlayback", "pause");
          });
          html.find('.btn-music-play').on('click', () => {
            socket.executeForEveryone("controlMusicPlayback", "play");
          });
          html.find('.btn-music-stop').on('click', () => {
            socket.executeForEveryone("closeMusicForAll");
          });
        },
        close: () => {
          window._musicControllerDialog = null;
        }
      }, { width: 320, height: "auto" });

      window._musicControllerDialog.render(true);
    }
  });

  socket.register("controlMusicPlayback", async (action) => {
    const iframe = document.getElementById("synced-audio-iframe");
    if (iframe && iframe.contentWindow) {
      const ytCommand = action === "play" ? "playVideo" : "pauseVideo";
      iframe.contentWindow.postMessage(JSON.stringify({
        event: "command",
        func: ytCommand,
        args: []
      }), "*");
    }

    const audio = document.getElementById("synced-audio-element");
    if (audio) {
      if (action === "play") audio.play();
      if (action === "pause") audio.pause();
    }
  });

  socket.register("saveProfileDataAsGM", async (actorId, category, data, userId) => {
    const ALLOWED_CATEGORIES = new Set(["hudAssignedSlots", "attackConfigs", "spellConfigs"]);
    if (!ALLOWED_CATEGORIES.has(category)) {
      console.warn(`[growingpotatoes] saveProfileDataAsGM: rejected invalid category "${category}"`);
      return false;
    }

    const actor = game.actors.get(actorId);
    if (!actor) return false;

    const callingUser = game.users.get(userId);
    if (callingUser && !callingUser.isGM && !actor.testUserPermission(callingUser, "OWNER")) {
      console.warn(`[growingpotatoes] saveProfileDataAsGM: User ${callingUser.name} lacks ownership permission on actor ${actor.name}`);
      return false;
    }

    const isWorldSetting = game.settings.settings.has("world.customRollProfiles");
    const scope = isWorldSetting ? "world" : MODULE_ID;
    const key = isWorldSetting ? "customRollProfiles" : SETTINGS.CUSTOM_ROLL_PROFILES;
    const store = foundry.utils.deepClone(game.settings.get(scope, key) || {});
    if (!store[actor.id]) store[actor.id] = {};
    store[actor.id][category] = data;
    store[actor.id]._actorName = actor.name;
    await game.settings.set(scope, key, store);

    await actor.setFlag("world", category, data, { recursive: false });
    return true;
  });

  socket.register("updateActorTrackerValueAsGM", async (actorId, trackerId, type, itemRefId, resourceSlot, newVal, userId) => {
    const actor = game.actors.get(actorId);
    if (!actor) return false;

    const callingUser = game.users.get(userId);
    if (callingUser && !callingUser.isGM && !actor.testUserPermission(callingUser, "OWNER")) {
      return false;
    }

    if (type === "item" && itemRefId) {
      const item = actor.items.get(itemRefId);
      if (item) {
        const max = Number(item.system?.uses?.max || 0);
        const newSpent = Math.max(0, max - newVal);
        await item.update({
          "system.uses.spent": newSpent,
          "system.uses.value": newVal
        });
      }
    } else if (type === "resource" && resourceSlot) {
      await actor.update({ [`system.resources.${resourceSlot}.value`]: newVal });
    }

    const trackers = actor.getFlag("world", "trackingStuff") || [];
    const t = trackers.find(x => x.id === trackerId);
    if (t) {
      t.value = newVal;
      await actor.setFlag("world", "trackingStuff", trackers);
    }
    return true;
  });

  socket.register("rechargeActorTrackersAsGM", async (actorId, restType, userId, options) => {
    const actor = game.actors.get(actorId);
    if (!actor) return [];

    const callingUser = game.users.get(userId);
    if (callingUser && !callingUser.isGM && !actor.testUserPermission(callingUser, "OWNER")) {
      return [];
    }

    if (typeof window.CustomRolls?.rechargeActorTrackers === "function") {
      return await window.CustomRolls.rechargeActorTrackers(actor, restType, options);
    }
    return [];
  });

  socket.register("closeMusicForAll", async () => {
    if (window._activeMusicPopup) {
      window._activeMusicPopup.close();
      window._activeMusicPopup = null;
    }
    const iframe = document.getElementById("synced-audio-iframe");
    if (iframe) iframe.remove();
    const audio = document.getElementById("synced-audio-element");
    if (audio) audio.remove();

    if (window._musicControllerDialog) {
      window._musicControllerDialog.close();
      window._musicControllerDialog = null;
    }
  });
}



// --- Automated Animations & Sequencer Trigger ---
async function triggerSequencerAnimation(actor, config, rollUser = null, autoTargetedToken = null) {
  if (!getSetting("featureAnimations")) return;
  const aa = globalThis.AutomatedAnimations || globalThis.AutoAnimations;
  const token = actor.getActiveTokens()[0];
  if (!token) return;

  const targetUser = rollUser || game.user;
  let targets = [];

  // 1. Resolve explicit target IDs passed from caller
  if (Array.isArray(config?.targetIds) && config.targetIds.length > 0) {
    targets = config.targetIds.map(id => canvas.tokens.get(id)).filter(Boolean);
  }

  // 2. Fall back to user's targeted tokens if empty
  if (targets.length === 0) {
    targets = Array.from(targetUser?.targets || game.user.targets);
  }

  if (autoTargetedToken) {
    if (!targets.some(t => t.id === autoTargetedToken.id)) {
      targets.push(autoTargetedToken);
    }
  }

  // Fallback: If no target and player owned / non-hostile, acquire nearest hostile
  if (targets.length === 0) {
    const isHostileNpc = actor.type === "npc" && (token.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE);
    if (!isHostileNpc) {
      const hostiles = canvas.tokens.placeables.filter(t => {
        if (t.id === token.id) return false;
        if (t.document.disposition !== CONST.TOKEN_DISPOSITIONS.HOSTILE) return false;
        if (!t.visible || t.document.hidden) return false;
        const isInvisible = t.actor?.statuses?.has?.("invisible") ||
          t.actor?.effects?.some(e => !e.disabled && (e.statuses?.has?.("invisible") || /invis/i.test(e.name || "")));
        return !isInvisible;
      });

      if (hostiles.length > 0) {
        let nearestHostile = null;
        let minDistance = Infinity;
        for (const h of hostiles) {
          const dist = Math.hypot(h.center.x - token.center.x, h.center.y - token.center.y);
          if (dist < minDistance) {
            minDistance = dist;
            nearestHostile = h;
          }
        }
        if (nearestHostile) {
          targets = [nearestHostile];
          autoTargetedToken = nearestHostile;
          try {
            nearestHostile.setTarget(true, { user: targetUser, releaseOthers: false });
          } catch (e) {
            console.warn("[CustomRolls] Could not set canvas target for user:", e);
          }
        }
      }
    }
  }

  if (targets.length === 0) return;

  const cleanupAutoTarget = () => {
    if (autoTargetedToken && targetUser) {
      try {
        autoTargetedToken.setTarget(false, { user: targetUser, releaseOthers: false });
      } catch (e) {
        console.warn("[CustomRolls] Error clearing auto target:", e);
      }
    }
  };

  const isSpell = Boolean(config.spellName || config.baseLevel !== undefined || config.spellAbility);
  const rawName = String(config.spellName || config.macroName || config.chatCardTitle || (isSpell ? "Spell" : "Attack")).trim();
  const actionName = rawName.toLowerCase() === "firebolt" ? "Fire Bolt" : rawName;

  // 1. Fetch real sheet item first
  let item = (config.itemId ? actor.items.get(config.itemId) : null)
    || actor.items.getName(actionName)
    || actor.items.getName(rawName);

  // 2. Synthesize item if missing from actor sheet
  if (!item) {
    let actType = "rsak";
    if (config.resolutionMethod === "save") actType = "save";
    else if (config.resolutionMethod === "heal") actType = "heal";
    else if (config.resolutionMethod === "other" || config.resolutionMethod === "auto") actType = "util";

    item = new Item.implementation({
      name: actionName,
      type: isSpell ? "spell" : "weapon",
      system: {
        level: Number(config.baseLevel) || 0,
        school: "evo",
        actionType: isSpell ? actType : "mwak",
        activation: { type: "action", cost: 1 },
        range: { value: isSpell ? 60 : 5, units: "ft" },
        target: { value: 1, type: "creature" },
        preparation: { mode: "prepared", prepared: true },
        damage: { parts: [] }
      }
    }, { parent: actor });
  }

  const targetToken = targets[0];
  const isFireball = actionName.toLowerCase().replace(/[^a-z]/g, "") === "fireball";

  // If Fireball is cast without an active measured template, use Sequencer directly on the target token
  if (isFireball && globalThis.Sequence && targetToken) {
    try {
      await new Sequence()
        .effect()
        .file("jb2a.fireball.beam.orange")
        .atLocation(token)
        .stretchTo(targetToken)
        .waitUntilFinished(-500)
        .effect()
        .file("jb2a.fireball.explosion.orange")
        .atLocation(targetToken)
        .scale(1.5)
        .play();
    } finally {
      cleanupAutoTarget();
    }
    return;
  }

  // Standard AutoAnimations pipeline for weapons and non-template spells
  if (aa) {
    const playFn = aa.PlayAnimation || aa.playAnimation;
    if (typeof playFn === "function") {
      try {
        const animPromise = playFn.call(aa, token, item, targets);
        if (animPromise && typeof animPromise.then === "function") {
          await animPromise;
        }
      } catch (err) {
        console.warn("[CustomRolls AA] AutoAnimations call failed:", err);
      } finally {
        cleanupAutoTarget();
      }
      return;
    }
  }

  // If no animation ran, clean up target
  cleanupAutoTarget();
}



export { triggerSequencerAnimation, registerSocketHandlers };
globalThis.triggerSequencerAnimation = triggerSequencerAnimation;


export function initSockets() {
  if (!getSetting("featureSocketHandlers")) return;

  const runSocketInit = () => {
    if (window.socketlib) {
      registerSocketHandlers();
    } else {
      Hooks.once("socketlib.ready", registerSocketHandlers);
    }
  };

  Hooks.once("socketlib.ready", () => {
    if (!game.modules?.get(MODULE_ID)?.api?.socket) registerSocketHandlers();
  });

  if (game.ready) {
    runSocketInit();
  } else {
    Hooks.once("setup", runSocketInit);
    Hooks.once("ready", () => {
      if (!game.modules?.get(MODULE_ID)?.api?.socket) runSocketInit();
    });
  }

  Hooks.on("renderChatLog", (app, html) => {
    const root = html?.[0] || html;
    if (!root || root._gpSavageAttackerBound) return;
    root._gpSavageAttackerBound = true;
    root.addEventListener("click", async (e) => {
      const btn = e.target?.closest?.(".cheapdice-savage-attacker-btn");
      if (!btn || btn.disabled) return;
      const msgEl = btn.closest(".chat-message, [data-message-id]");
      const messageId = msgEl?.dataset?.messageId;
      if (!messageId || !globalThis.attackSocket) return;
      btn.disabled = true;
      btn.style.opacity = "0.6";
      try {
        await globalThis.attackSocket.executeAsGM("applySavageAttacker", messageId, game.user?.id);
      } catch (err) {
        console.error(`[${MODULE_ID}] Failed to apply Savage Attacker:`, err);
        btn.disabled = false;
        btn.style.opacity = "1";
      }
    });
  });
}
