// =============================================================================
// STAT CARD MODULE
// Generates chat cards for selected tokens and handles custom attack rolls
// =============================================================================

import { MODULE_ID } from "../src/constants.js";

/**
 * Returns border, glow, and header background styling matching the token's disposition or owner color.
 */
function getDispositionTheme(actor, token) {
  const tok = token || actor?.getActiveTokens?.()[0];
  const disposition = tok?.document?.disposition ?? actor?.prototypeToken?.disposition;

  let borderColor = "#475569";
  let glowColor = "rgba(71, 85, 105, 0.15)";
  let headerBg = "#1e293b";

  if (actor?.hasPlayerOwner) {
    const ownerUser = game.users.find(u => !u.isGM && actor.testUserPermission(u, "OWNER") && u.color);
    if (ownerUser?.color) {
      const hex = typeof ownerUser.color === "object" && ownerUser.color.css ? ownerUser.color.css : String(ownerUser.color);
      const cleanHex = hex.replace("#", "");
      let r = 0, g = 0, b = 0;
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
        borderColor = `rgba(${r}, ${g}, ${b}, 0.8)`;
        glowColor = `rgba(${r}, ${g}, ${b}, 0.2)`;
        headerBg = `rgba(${Math.floor(r * 0.4)}, ${Math.floor(g * 0.4)}, ${Math.floor(b * 0.4)}, 0.95)`;
      }
    }
  } else {
    // Match Foundry token disposition borders
    if (disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) {
      borderColor = "rgba(231, 33, 36, 0.85)";
      glowColor = "rgba(231, 33, 36, 0.22)";
      headerBg = "#7f1d1d"; // Dark red
    } else if (disposition === CONST.TOKEN_DISPOSITIONS.NEUTRAL) {
      borderColor = "rgba(241, 216, 54, 0.85)";
      glowColor = "rgba(241, 216, 54, 0.22)";
      headerBg = "#78350f"; // Amber/brown
    } else if (disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) {
      borderColor = "rgba(67, 223, 223, 0.85)";
      glowColor = "rgba(67, 223, 223, 0.22)";
      headerBg = "#134e4a"; // Deep teal
    } else if (disposition === CONST.TOKEN_DISPOSITIONS.SECRET) {
      borderColor = "rgba(166, 18, 211, 0.85)";
      glowColor = "rgba(166, 18, 211, 0.22)";
      headerBg = "#581c87"; // Deep purple
    }
  }

  return { borderColor, glowColor, headerBg };
}

function wrapWithDisposition(innerHtml, actor, token) {
  const { borderColor, glowColor } = getDispositionTheme(actor, token);
  return `<div style="border: 1.5px solid ${borderColor}; border-radius: 6px; padding: 6px 8px; box-shadow: 0 0 8px 1px ${glowColor}, inset 0 0 6px 0 ${glowColor}; background: linear-gradient(to bottom, ${glowColor} 0%, transparent 18%);">${innerHtml}</div>`;
}

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

/**
 * Initialize event listeners for attack button clicks in chat messages.
 */
export function initStatCard() {
  Hooks.on("renderChatMessage", (message, html) => {
    // Foundry v12/v14 HTMLElement or jQuery wrapper support
    const root = html instanceof HTMLElement ? html : html[0];
    if (!root) return;

    root.querySelectorAll(".gwa-attack-btn").forEach((btn) => {
      // Prevent duplicate listener attachments
      if (btn.dataset.gwaBound) return;
      btn.dataset.gwaBound = "true";

      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        await handleAttackButtonClick(btn);
      });
    });
  });
}

/**
 * Handles attack execution when a stat card button is clicked.
 * Delegates directly to Cheap Dice's socket execution engine (runAttackRoll)
 * to utilize targeting, animations, Sequencer, damage buttons, and roll rules.
 */
async function handleAttackButtonClick(btn) {
  const tokenId = btn.dataset.tokenId;
  const itemId = btn.dataset.itemId;
  const totalAttackModifier = parseInt(btn.dataset.atkMod, 10) || 0;
  const damageDiceCount = parseInt(btn.dataset.dmgCount, 10) || 1;
  const damageDieSize = btn.dataset.dmgSize || "d4";
  const damageType = btn.dataset.dmgType || "slashing";
  const damageBonus = parseInt(btn.dataset.dmgMod, 10) || 0;

  const tokenObj = canvas.tokens.get(tokenId) || game.actors.get(tokenId)?.getActiveTokens()[0];
  const actorObj = tokenObj?.actor || game.actors.get(tokenId);
  const itemObj = actorObj?.items.get(itemId);

  if (!actorObj || !itemObj) {
    return ui.notifications.warn("Actor or Item not found.");
  }

  // If the CheapDice socket system is registered, run through the full engine
  if (globalThis.attackSocket) {
    const config = {
      chatCardTitle: itemObj.name,
      abilityScore: "str",
      isProficient: false,
      weaponModifier: totalAttackModifier, // Flat modifier representation
      attackCircumstanceModifier: 0,
      damageDiceCount: damageDiceCount,
      damageDieSize: damageDieSize,
      damageType: damageType,
      damageModifier: damageBonus,
      CRIT_THRESHOLD: 20,
      HAS_HALFLING_LUCKY: false,
      GWF_REROLL_THRESHOLD: 0,
      superAdv: false,
      additionalDamageComponents: []
    };

    // If item has secondary damage parts, map them as additional damage components
    const itemSys = itemObj.system;
    if (itemSys?.damage?.parts?.length > 1) {
      for (let i = 1; i < itemSys.damage.parts.length; i++) {
        const extraPart = itemSys.damage.parts[i];
        if (extraPart && extraPart[0]) {
          config.additionalDamageComponents.push({
            label: extraPart[1] || "Extra",
            formula: String(extraPart[0]),
            damageType: extraPart[1] || "untyped"
          });
        }
      }
    }

    try {
      await globalThis.attackSocket.executeAsGM("runAttackRoll", config, actorObj.id, game.user.id);
      return;
    } catch (err) {
      console.warn("[CheapDice] Failed to execute runAttackRoll via socket, falling back to local roll:", err);
    }
  }

  // Fallback if socketlib is unavailable
  const CRIT_THRESHOLD = 20;
  const maxDieValue = parseInt(damageDieSize.replace(/d/i, ""), 10) || 4;
  const maximizedWeaponDice = damageDiceCount * maxDieValue;

  const roll1 = await new Roll("1d20 + " + totalAttackModifier).evaluate();
  let rollHtml1 = await roll1.render();
  const d20_1 = roll1.dice[0].total;
  if (d20_1 >= CRIT_THRESHOLD) rollHtml1 = rollHtml1.replace("dice-total", "dice-total critical");
  else if (d20_1 === 1) rollHtml1 = rollHtml1.replace("dice-total", "dice-total fumble");

  const roll2 = await new Roll("1d20 + " + totalAttackModifier).evaluate();
  let rollHtml2 = await roll2.render();
  const d20_2 = roll2.dice[0].total;
  if (d20_2 >= CRIT_THRESHOLD) rollHtml2 = rollHtml2.replace("dice-total", "dice-total critical");
  else if (d20_2 === 1) rollHtml2 = rollHtml2.replace("dice-total", "dice-total fumble");

  const isCritical = d20_1 >= CRIT_THRESHOLD || d20_2 >= CRIT_THRESHOLD;

  const dmgFormula = `${damageDiceCount}${damageDieSize}${
    damageBonus !== 0 ? (damageBonus > 0 ? " + " + damageBonus : " - " + Math.abs(damageBonus)) : ""
  }`;
  const dmgRoll = await new Roll(dmgFormula).evaluate();
  const finalGWFTotal = dmgRoll.total;
  const criticalTotal = finalGWFTotal + maximizedWeaponDice;

  if (game.dice3d) {
    await Promise.all([roll1, roll2, dmgRoll].map((r) => game.dice3d.showForRoll(r, game.user, true)));
  }

  const baseDamageTypeDisplay = damageType.charAt(0).toUpperCase() + damageType.slice(1);
  const normalDamageHTML = `
    <p style="text-align: center; font-weight: bold; margin: 5px 0;">${baseDamageTypeDisplay} Damage (${dmgFormula})</p>
    <div style="display: flex; justify-content: center; text-align: center; font-size: 0.9em; margin-top: 5px;">
      <div style="padding: 5px; border: 1px solid #ccc; border-radius: 4px; background-color: #f8f9fa;">
        <p style="margin: 0; font-weight: 600; font-size: 0.9em;">Results (${dmgFormula})</p>
        <span style="font-weight: bold; font-size: 1.5em;">${finalGWFTotal}</span>
      </div>
    </div>
    <p style="text-align: center; font-weight: 500; font-size: 0.9em; margin: 5px 0 0;">Damage Mods = ${damageBonus >= 0 ? "+" : ""}${damageBonus}</p>
  `;

  let totalBlocks = `
    <p style="margin: 0; flex: 1; ${isCritical ? "border-right: 1px solid #ddd;" : ""} padding: 0 5px;">
      Damage Total: <span style="font-size: 1.2em; font-weight: bold;">${finalGWFTotal}</span>
    </p>
  `;

  if (isCritical) {
    totalBlocks += `
      <p style="margin: 0; flex: 1; padding: 0 5px;">
        Critical Total: <span class="dice-total critical" style="font-size: 1.2em;">${criticalTotal}</span>
      </p>
    `;
  }

  let criticalBonusHTML = "";
  if (isCritical) {
    criticalBonusHTML = `
      <p style="font-weight: 500; font-size: 0.95em; margin: 5px 0;"><strong>Critical Bonus: +${maximizedWeaponDice}</strong></p>
      <ul style="margin: 0 0 5px; padding-left: 15px; list-style-type: disc; font-size: 0.9em; line-height: 1.4;">
        <li>Weapon Dice (${damageDiceCount}${damageDieSize} Max): <span style="font-weight: bold;">+${maximizedWeaponDice}</span></li>
      </ul>
    `;
  }

  const chatContent = `
    <p><strong>${actorObj.name}: ${itemObj.name}</strong></p>
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
    ${normalDamageHTML}
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
        <p style="font-weight: 500; font-size: 0.95em; margin: 5px 0;"><strong>Attack: ${totalAttackModifier >= 0 ? "+" : ""}${totalAttackModifier}</strong></p>
        <p style="font-weight: 500; font-size: 0.95em; margin: 5px 0;"><strong>Damage: ${dmgFormula} (${baseDamageTypeDisplay})</strong></p>
        ${criticalBonusHTML}
      </div>
    </details>
  `;

  const wrappedContent = wrapWithDisposition(chatContent, actorObj, tokenObj);

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: tokenObj?.document }),
    content: wrappedContent,
    sound: CONFIG.sounds.dice
  });
}

async function evaluateBonus(bonusStr, abilityMod, pbVal) {
  let parsed = String(bonusStr || "0").replace(/@mod/gi, abilityMod).replace(/@prof/gi, pbVal).trim();
  if (!parsed || parsed === "0") return 0;
  const signStr = /^[+\-]/.test(parsed) ? parsed : "+" + parsed;
  try {
    const resultRoll = await new Roll("0" + signStr).evaluate();
    return resultRoll.total;
  } catch (e) {
    return 0;
  }
}

function formatTrait(traitObj) {
  if (!traitObj) return "";
  let values = [];
  if (traitObj.value) {
    if (Array.isArray(traitObj.value)) values.push(...traitObj.value);
    else if (traitObj.value instanceof Set) values.push(...Array.from(traitObj.value));
  }
  if (traitObj.custom) values.push(traitObj.custom);
  return values.join(", ");
}

/**
 * Renders and sends the stat card for a given token (or first controlled token).
 */
export async function postStatCard(targetToken = null) {
  const token = targetToken || canvas.tokens.controlled[0];
  if (!token) {
    return ui.notifications.warn("Please select a token first.");
  }

  const actor = token.actor;
  if (!actor) {
    return ui.notifications.warn("No actor data found for this token.");
  }

  const sys = actor.system;

  const pb = sys.attributes?.prof ?? 0;
  const pbSign = pb >= 0 ? "+" : "";
  const cr = sys.details?.cr ?? sys.details?.level ?? "—";
  const ac = sys.attributes?.ac?.value ?? 10;

  const abilities = ["str", "dex", "con", "int", "wis", "cha"];
  const abilityBoxes = abilities.map((ab) => {
    const score = sys.abilities[ab]?.value ?? 10;
    const modNumber = sys.abilities[ab]?.mod ?? 0;
    const sign = modNumber >= 0 ? "+" : "-";
    const modPart = modNumber !== 0 ? ` ${sign} ${Math.abs(modNumber)}` : "";
    const fullName = FULL_ABILITY_NAMES[ab] || ab.toUpperCase();
    const formula = `1d20${modPart}[${fullName} Check]`;
    const label = `${modNumber >= 0 ? "+" : ""}${modNumber}`;
    const rollLink = `[[/r ${formula}]]{${label}}`;

    return `
      <div style="text-align: center; background: #fff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 3px 1px;">
        <div style="font-size: 0.7em; font-weight: bold; color: #344155; text-transform: uppercase;">${ab}</div>
        <div style="font-size: 1.1em; font-weight: 800; color: #000000; line-height: 1.15;">${score}</div>
        <div style="font-size: 0.75em; font-weight: bold; margin-top: 2px; line-height: 1.2;">${rollLink}</div>
      </div>`;
  }).join("");

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
  const sensesDisplay = sensesList.length > 0 ? sensesList.join(", ") : "Normal";

  const proficientSaves = [];
  abilities.forEach((ab) => {
    const ability = sys.abilities[ab];
    const isProf = ability?.proficient || ability?.saveProf?.multiplier > 0;
    if (ability && isProf) {
      let saveBonus = ability.mod ?? 0;
      if (typeof ability.save === "number") saveBonus = ability.save;
      else if (typeof ability.save?.value === "number") saveBonus = ability.save.value;
      else saveBonus = (ability.mod ?? 0) + pb;

      const sign = saveBonus >= 0 ? "+" : "-";
      const bonusPart = saveBonus !== 0 ? ` ${sign} ${Math.abs(saveBonus)}` : "";
      const label = `${saveBonus >= 0 ? "+" : ""}${saveBonus}`;
      const fullName = FULL_ABILITY_NAMES[ab] || ab.toUpperCase();
      const formula = `1d20${bonusPart}[${fullName} Save]`;
      proficientSaves.push(`[[/r ${formula}]]{${ab.toUpperCase()} ${label}}`);
    }
  });
  const savesDisplay = proficientSaves.length > 0 ? proficientSaves.join(" ") : "<span style='color: #888;'>None</span>";

  const trainedSkills = [];
  if (sys.skills) {
    for (const [key, skill] of Object.entries(sys.skills)) {
      if (skill.value && skill.value > 0) {
        const fullSkillName = CONFIG?.DND5E?.skills?.[key]?.label ?? key;
        const shortSkillName = fullSkillName.substring(0, 4);
        const total = skill.total ?? ((sys.abilities[skill.ability]?.mod ?? 0) + skill.value * pb);
        const sign = total >= 0 ? "+" : "-";
        const bonusPart = total !== 0 ? ` ${sign} ${Math.abs(total)}` : "";
        const label = `${total >= 0 ? "+" : ""}${total}`;
        const formula = `1d20${bonusPart}[${fullSkillName} Check]`;
        trainedSkills.push(`[[/r ${formula}]]{${shortSkillName} ${label}}`);
      }
    }
  }
  const skillsDisplay = trainedSkills.length > 0 ? trainedSkills.join(" ") : "<span style='color: #888;'>None</span>";

  const dr = formatTrait(sys.traits?.dr);
  const di = formatTrait(sys.traits?.di);
  const dv = formatTrait(sys.traits?.dv);
  const ci = formatTrait(sys.traits?.ci);

  let langList = [];
  if (sys.traits?.languages?.value) {
    const langs = sys.traits.languages.value;
    if (Array.isArray(langs)) langList.push(...langs);
    else if (langs instanceof Set) langList.push(...Array.from(langs));
  }
  if (sys.traits?.languages?.custom) langList.push(sys.traits.languages.custom);
  const languagesDisplay = langList.length > 0 ? langList.join(", ") : "None";

  const passivePerc = sys.skills?.prc?.passive ?? (10 + (sys.abilities?.wis?.mod ?? 0));
  const passiveInv = sys.skills?.inv?.passive ?? (10 + (sys.abilities?.int?.mod ?? 0));
  const passiveIns = sys.skills?.ins?.passive ?? (10 + (sys.abilities?.wis?.mod ?? 0));

  const hpCurrent = sys.attributes?.hp?.value ?? 0;
  const hpMax = sys.attributes?.hp?.max ?? 0;
  const hpTemp = sys.attributes?.hp?.temp ?? 0;
  const hpTempMax = sys.attributes?.hp?.tempmax ?? 0;

  let hpDisplay = `${hpCurrent}/${hpMax}`;
  if (hpTemp > 0) hpDisplay += ` <span style="color: #0284c7;">(+${hpTemp})</span>`;
  if (hpTempMax !== 0) hpDisplay += ` <span style="color: #b45309;">(${hpTempMax > 0 ? "+" : ""}${hpTempMax})</span>`;

  const movementObj = sys.attributes?.movement || {};
  const speeds = [];
  if (movementObj.walk) speeds.push(`${movementObj.walk} ft`);
  if (movementObj.fly) speeds.push(`Fly ${movementObj.fly} ft${movementObj.hover ? " (H)" : ""}`);
  if (movementObj.swim) speeds.push(`Swim ${movementObj.swim} ft`);
  if (movementObj.burrow) speeds.push(`Burrow ${movementObj.burrow} ft`);
  if (movementObj.climb) speeds.push(`Climb ${movementObj.climb} ft`);
  const movementDisplay = speeds.length > 0 ? speeds.join(", ") : "0 ft";

  const legActMax = sys.resources?.legact?.max ?? 0;
  const legActVal = sys.resources?.legact?.value ?? 0;
  const legResMax = sys.resources?.legres?.max ?? 0;
  const legResVal = sys.resources?.legres?.value ?? 0;

  const spellcastingAbility = sys.attributes?.spellcasting;
  let spellStats = null;
  let slotDisplay = [];

  if (spellcastingAbility && spellcastingAbility !== "" && spellcastingAbility !== "none") {
    const spellMod = sys.abilities[spellcastingAbility]?.mod ?? 0;
    const spellAttackBonus = pb + spellMod;
    const spellSign = spellAttackBonus >= 0 ? "+" : "";
    const spellDC = sys.attributes?.spelldc ?? (8 + pb + spellMod);
    spellStats = `${spellcastingAbility.toUpperCase()} | Atk: <b>${spellSign}${spellAttackBonus}</b> | DC: <b>${spellDC}</b>`;

    if (sys.spells) {
      for (let i = 1; i <= 9; i++) {
        const slot = sys.spells[`spell${i}`];
        if (slot && slot.max > 0) slotDisplay.push(`L${i}: ${slot.value}/${slot.max}`);
      }
      if (sys.spells.pact && sys.spells.pact.max > 0) {
        slotDisplay.push(`Pact: ${sys.spells.pact.value}/${sys.spells.pact.max}`);
      }
    }
  }

  const attackItems = actor.items.filter((item) => {
    if (item.type === "weapon" || item.hasAttack) return true;
    const oldAction = item.system?.actionType;
    if (["mwak", "rwak", "msak", "rsak"].includes(oldAction)) return true;
    if (item.system?.activities) {
      return Array.from(item.system.activities.values()).some((act) => act.type === "attack" || act.attack);
    }
    return false;
  }).slice(0, 5);

  let attacksSummaryHtml = "";
  if (attackItems.length > 0) {
    const attackRows = [];

    for (const item of attackItems) {
      try {
        const itemSys = item.system;
        let abilityScore = "str";
        let damageDiceCount = 1;
        let damageDieSize = "d4";
        let damageType = "slashing";
        let rawDamageBonus = "0";
        let rawAttackBonus = "0";
        let isFlatAttack = false;

        if (itemSys.activities && itemSys.activities.size > 0) {
          const activities = Array.from(itemSys.activities.values());
          const act = activities.find((a) => a.attack || a.damage);
          if (act) {
            abilityScore = act.ability || itemSys.ability || "str";
            if (abilityScore === "default" || abilityScore === "") abilityScore = "str";

            if (act.damage?.parts?.length > 0) {
              const part = act.damage.parts[0];
              damageDiceCount = part.number || 1;
              damageDieSize = part.denomination ? `d${part.denomination}` : "d4";
              if (part.types && part.types.size > 0) damageType = Array.from(part.types)[0];
              rawDamageBonus = String(part.bonus || "0");
            }
            if (act.attack) {
              rawAttackBonus = String(act.attack.bonus || act.attack.flat || "0");
              if (act.attack.flat) isFlatAttack = true;
            }
          }
        } else {
          abilityScore = item.abilityMod || "str";
          if (itemSys.damage?.parts?.length > 0) {
            const dmgPart = itemSys.damage.parts[0];
            const match = String(dmgPart[0] || "").match(/(\d+)d(\d+)/i);
            if (match) {
              damageDiceCount = parseInt(match[1], 10) || 1;
              damageDieSize = `d${match[2]}`;
              rawDamageBonus = String(dmgPart[0]).replace(match[0], "");
            } else {
              rawDamageBonus = String(dmgPart[0] || "0");
            }
            damageType = dmgPart[1] || "slashing";
          }
          if (itemSys.attackBonus) {
            rawAttackBonus = String(itemSys.attackBonus || "0");
          }
        }

        const abilityMod = sys.abilities[abilityScore]?.mod || 0;
        const weaponModifier = await evaluateBonus(rawDamageBonus, abilityMod, pb);
        const attackCircumstanceModifier = await evaluateBonus(rawAttackBonus, abilityMod, pb);

        let totalAttackModifier = isFlatAttack ? attackCircumstanceModifier : abilityMod + pb + attackCircumstanceModifier;

        if (item.labels?.toHit) {
          const toHitMatch = String(item.labels.toHit).match(/[\+\-]?\d+/);
          if (toHitMatch) totalAttackModifier = parseInt(toHitMatch[0], 10);
        }

        const atkSign = totalAttackModifier >= 0 ? "+" : "";
        const dmgModSign = weaponModifier !== 0 ? (weaponModifier > 0 ? `+${weaponModifier}` : weaponModifier) : "";

        attackRows.push(`
          <div style="display: flex; justify-content: space-between; align-items: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 3px; padding: 2px 4px; margin-bottom: 2px;">
            <span style="font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px;">${item.name}</span>
            <span>Atk ${atkSign}${totalAttackModifier} &bull; Dmg ${damageDiceCount}${damageDieSize}${dmgModSign} &bull; 
              <a class="gwa-attack-btn" 
                 data-token-id="${token.id}" 
                 data-item-id="${item.id}"
                 data-atk-mod="${totalAttackModifier}"
                 data-dmg-count="${damageDiceCount}"
                 data-dmg-size="${damageDieSize}"
                 data-dmg-mod="${weaponModifier}"
                 data-dmg-type="${damageType}"
                 style="color: #0284c7; text-decoration: underline; cursor: pointer; font-weight: bold;">
                 Roll
              </a>
            </span>
          </div>`);
      } catch (e) {
        console.error(`Skipped item ${item.name} due to structure format.`, e);
      }
    }

    attacksSummaryHtml = `
      <div style="border-top: 1px dashed #cbd5e1; margin-top: 5px; padding-top: 4px;">
        <div style="font-weight: bold; margin-bottom: 3px; color: #475569;">Attacks:</div>
        ${attackRows.join("")}
      </div>`;
  }

  const { borderColor, glowColor, headerBg } = getDispositionTheme(actor, token);

  const statCardHtml = `
<div style="border: 1.5px solid ${borderColor}; border-radius: 6px; overflow: hidden; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; box-shadow: 0 0 8px 1px ${glowColor}, 0 1px 3px rgba(0,0,0,0.1);">
  <div style="background: ${headerBg}; color: #f8fafc; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center;">
    <div>
      <div style="font-size: 1.05em; font-weight: bold; letter-spacing: 0.3px;">${token.name}</div>
      <div style="font-size: 0.75em; color: #cbd5e1; font-style: italic;">${sizeDisplay} ${typeDisplay}</div>
    </div>
    <div style="text-align: right; font-size: 0.75em; color: #cbd5e1; line-height: 1.3;">
      <div>CR/LEVEL <b>${cr}</b></div>
      <div style="margin-top: 2px;">PB <b>${pbSign}${pb}</b></div>
    </div>
  </div>

  <div style="display: grid; grid-template-columns: 1fr 1.3fr 1fr; gap: 4px; padding: 6px 8px; background: #e2e8f0; border-bottom: 1px solid #cbd5e1; text-align: center;">
    <div style="background: #fff; padding: 3px; border-radius: 4px; border: 1px solid #cbd5e1;">
      <span style="font-size: 0.65em; color: #64748b; display: block; font-weight: bold;">ARMOR</span>
      <span style="font-size: 1.1em; font-weight: bold; color: #0f172a;">${ac}</span>
    </div>
    <div style="background: #fff; padding: 3px; border-radius: 4px; border: 1px solid #cbd5e1;">
      <span style="font-size: 0.65em; color: #64748b; display: block; font-weight: bold;">HIT POINTS</span>
      <span style="font-size: 1.1em; font-weight: bold; color: #0f172a;">${hpDisplay}</span>
    </div>
    <div style="background: #fff; padding: 3px; border-radius: 4px; border: 1px solid #cbd5e1;">
      <span style="font-size: 0.65em; color: #64748b; display: block; font-weight: bold;">SPEED</span>
      <span style="font-size: 0.9em; font-weight: bold; color: #0f172a;">${movementDisplay}</span>
    </div>
  </div>

  <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; padding: 6px 8px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0;">
    ${abilityBoxes}
  </div>

  <div style="padding: 6px 8px; font-size: 0.8em; line-height: 1.45; color: #334155;">
    <div style="margin-bottom: 3px;"><b>Saves:</b> ${savesDisplay}</div>
    <div style="margin-bottom: 3px;"><b>Skills:</b> ${skillsDisplay}</div>
    <div style="margin-bottom: 3px;"><b>Passives:</b> Perc <b>${passivePerc}</b> &bull; Inv <b>${passiveInv}</b> &bull; Ins <b>${passiveIns}</b></div>
    <div style="margin-bottom: 3px;"><b>Senses:</b> ${sensesDisplay}</div>
    <div style="margin-bottom: 3px;"><b>Languages:</b> ${languagesDisplay}</div>

    ${dv ? `<div style="margin-top: 4px; padding: 2px 4px; background: #fee2e2; border-left: 3px solid #ef4444; border-radius: 2px;"><b>Vulnerabilities:</b> ${dv}</div>` : ""}
    ${dr ? `<div style="margin-top: 4px; padding: 2px 4px; background: #e0f2fe; border-left: 3px solid #0284c7; border-radius: 2px;"><b>Resistances:</b> ${dr}</div>` : ""}
    ${di ? `<div style="margin-top: 4px; padding: 2px 4px; background: #f3e8ff; border-left: 3px solid #9333ea; border-radius: 2px;"><b>Damage Immunities:</b> ${di}</div>` : ""}
    ${ci ? `<div style="margin-top: 4px; padding: 2px 4px; background: #ffedd5; border-left: 3px solid #f97316; border-radius: 2px;"><b>Condition Immunities:</b> ${ci}</div>` : ""}

    ${
      legActMax > 0 || legResMax > 0
        ? `
      <div style="margin-top: 4px; padding: 3px 5px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 3px;">
        ${legActMax > 0 ? `<span><b>Legendary Actions:</b> ${legActVal}/${legActMax}</span>` : ""}
        ${legActMax > 0 && legResMax > 0 ? ` &bull; ` : ""}
        ${legResMax > 0 ? `<span><b>Legendary Resistance:</b> ${legResVal}/${legResMax}</span>` : ""}
      </div>`
        : ""
    }

    ${
      spellStats
        ? `
      <div style="border-top: 1px dashed #cbd5e1; margin-top: 5px; padding-top: 4px; color: #475569;">
        <div><b>Spellcasting:</b> ${spellStats}</div>${slotDisplay.length > 0 ? `<div style="font-size: 0.9em; margin-top: 2px; color: #334155;"><b>Slots:</b> ${slotDisplay.join(" &bull; ")}</div>` : ""}
      </div>`
        : ""
    }

    ${attacksSummaryHtml}
  </div>
</div>`;

  const enrichedContent = await TextEditor.enrichHTML(statCardHtml, { async: true });

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: token.document }),
    content: enrichedContent,
    whisper: ChatMessage.getWhisperRecipients("GM")
  });
}
