// =============================================================================
// SOCKETLIB REGISTRATION & EXECUTION HANDLERS
// =============================================================================

function registerSocketHandlers() {
  if (!game.settings.get("cheapdice", "featureSocketHandlers")) return;
  if (globalThis.attackSocket) return;
  const socket = typeof socketlib.registerModule === "function"
    ? socketlib.registerModule("cheapdice")
    : socketlib.registerSystem("dnd5e");
  globalThis.attackSocket = socket;



  // --- 2.1 Timer Handlers ---
  let activeTimerDialog = null;

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
      superAdv, additionalDamageComponents, chatCardTitle
    } = config;

    const isProficient = config.isProficient !== undefined ? (String(config.isProficient) === "true" || config.isProficient === true) : true;
    const isLucky = String(HAS_HALFLING_LUCKY) === "true" || HAS_HALFLING_LUCKY === true;
    const luckyThreshold = Number(HALFLING_LUCKY_REROLL_THRESHOLD) || 1;
    const gwfThreshold = Number(GWF_REROLL_THRESHOLD) || 0;
    const isSuperAdv = String(superAdv) === "true" || superAdv === true;

    const damageDiceCount = Number(config.damageDiceCount) ?? 0;
    const rawDie = String(config.damageDieSize || "6").replace(/^d/i, "");
    const cleanDieSize = `d${rawDie}`;
    const maxDieValue = Number(rawDie) || 0;

    const abilityMod = actor.system.abilities[abilityScore]?.mod || 0;
    const prof = isProficient ? (actor.system.attributes.prof || 0) : 0;
    const totalAttackModifier = abilityMod + prof + weaponModifier + attackCircumstanceModifier;
    const actorName = actor.name;
    const speaker = ChatMessage.getSpeaker({ actor });

    const rollUser = game.users.get(userId) || game.user;
    const token = actor.getActiveTokens()[0];
    let autoTargetedToken = null;
    let targetIds = Array.from(rollUser?.targets || game.user.targets).map(t => t.id);

    if (targetIds.length === 0 && token) {
      const isHostileNpc = actor.type === "npc" && (token.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE);
      if (!isHostileNpc) {
        const hostiles = canvas.tokens.placeables.filter(t =>
          t.id !== token.id &&
          t.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE &&
          t.visible
        );
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
      async function _rollD20AttackSlot() {
        let roll = await new Roll(`1d20 + ${totalAttackModifier}`).evaluate();
        let d20Term = roll.terms.find(t => t.faces === 20) || roll.dice[0];
        let val = Number(d20Term?.results?.[0]?.result ?? roll.total);
        let rerollSummary = null;

        if (isLucky && val <= luckyThreshold) {
          let reroll = await new Roll(`1d20 + ${totalAttackModifier}`).evaluate();
          let rerolledTerm = reroll.terms.find(t => t.faces === 20) || reroll.dice[0];
          let newVal = Number(rerolledTerm?.results?.[0]?.result ?? reroll.total);
          rerollSummary = { original: val, final: newVal };
          val = newVal;
          roll = reroll;
        }

        let html = await roll.render();
        if (val >= CRIT_THRESHOLD) html = html.replace('dice-total', 'dice-total critical');
        else if (val === 1) html = html.replace('dice-total', 'dice-total fumble');

        return { roll, html, val, rerollSummary };
      }

      const slot1 = await _rollD20AttackSlot();

      let slot2;
      let droppedCandidate = null;
      let extraRolls = [];

      if (isSuperAdv) {
        const candidateA = await _rollD20AttackSlot();
        const candidateB = await _rollD20AttackSlot();
        extraRolls.push(candidateA.roll, candidateB.roll);

        if (candidateA.val >= candidateB.val) {
          slot2 = candidateA;
          droppedCandidate = candidateB;
        } else {
          slot2 = candidateB;
          droppedCandidate = candidateA;
        }
      } else {
        slot2 = await _rollD20AttackSlot();
        extraRolls.push(slot2.roll);
      }

      let rerollSummary2 = slot2.rerollSummary;
      if (isSuperAdv && droppedCandidate) {
        const superAdvHtml = `<div style="padding: 2px 4px; margin: 3px 0 0; border: 1px solid #7289DA; border-radius: 3px; background-color: #f0f4ff; font-size: 0.75em; text-align: center;">
        <span style="font-weight: bold; color: #4b5d88;">Super Adv (Kept d20: ${slot2.val} | Dropped: ${droppedCandidate.val})</span>
      </div>`;
        slot2.html += superAdvHtml;
      }

      const isCritical = slot1.val >= CRIT_THRESHOLD || slot2.val >= CRIT_THRESHOLD;

      return {
        attackRoll1: slot1.roll,
        rollHtml1: slot1.html,
        rerollSummary1: slot1.rerollSummary,
        attackRoll2: slot2.roll,
        rollHtml2: slot2.html,
        rerollSummary2,
        extraRolls,
        isCritical
      };
    }

    async function _rollDamageDice() {
      if (damageDiceCount <= 0) {
        return { finalCombinedDieResult: 0, allDieRolls: [], rerollSummary: [] };
      }
      const damageDieFormula = `1${cleanDieSize}`;
      const allDieRolls = [];
      const finalDieResults = [];
      const rerollSummary = [];

      for (let i = 0; i < damageDiceCount; i++) {
        let initialRoll = await new Roll(damageDieFormula).evaluate();
        let initialResult = Number(initialRoll.total);
        allDieRolls.push(initialRoll);

        if (gwfThreshold > 0 && initialResult <= gwfThreshold) {
          let reroll = await new Roll(damageDieFormula).evaluate();
          allDieRolls.push(reroll);
          finalDieResults.push(Number(reroll.total));
          rerollSummary.push({ original: initialResult, reroll: Number(reroll.total) });
        } else {
          finalDieResults.push(initialResult);
        }
      }
      const finalCombinedDieResult = finalDieResults.reduce((a, b) => a + b, 0);
      return { finalCombinedDieResult, allDieRolls, rerollSummary };
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

    function _generateDamageDetailsHTML(flavorText, damageBonus, flatBonus, finalCombinedDieResult, rerollSummary) {
      let html = `<p style="text-align: center; font-weight: bold; margin: 5px 0;">${flavorText}</p>`;
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
      html += `
      <div style="display: flex; justify-content: center; text-align: center; font-size: 0.9em; margin-top: 5px;">
        <div style="padding: 5px; border: 1px solid #ccc; border-radius: 4px; background-color: #f8f9fa;">
          <p style="margin: 0; font-weight: 600; font-size: 0.9em;">Results (${damageDiceCount}${cleanDieSize})</p>
          <span style="font-weight: bold; font-size: 1.5em;">${finalCombinedDieResult}</span>
        </div>
      </div>`;
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
    const { finalCombinedDieResult, allDieRolls, rerollSummary } = await _rollDamageDice();
    const activeComponents = (additionalDamageComponents || []).filter(c => c.isActive);
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

    const damageBonus = abilityMod + weaponModifier;
    const flatBonus = damageModifier;
    const maximizedWeaponDice = damageDiceCount * maxDieValue;
    const totalMaxDiceCrit = maximizedWeaponDice + critAdditionalDamageComponent;
    const finalGWFTotal = finalCombinedDieResult + damageBonus + flatBonus + additionalDamageTotal;
    const allCriticalTotal = totalMaxDiceCrit + resolvedExtraCrit + critOnlyDamageTotal;
    const criticalTotal = finalGWFTotal + totalMaxDiceCrit + resolvedExtraCrit + critOnlyDamageTotal;

    const finalRolls = [attackRoll1, ...extraRolls, ...allDieRolls, ...allAdditionalDamageRolls];
    const baseDamageFormulaSummary = `${damageDiceCount}${cleanDieSize}`;
    const baseDamageFlavor = `${damageType.charAt(0).toUpperCase() + damageType.slice(1)} Damage (${baseDamageFormulaSummary})`;
    const normalDamageHTML = _generateDamageDetailsHTML(baseDamageFlavor, damageBonus, flatBonus, finalCombinedDieResult, rerollSummary);

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
        <li style="list-style-type: disc;">Weapon Dice (${damageDiceCount}${cleanDieSize} Max): <span style="font-weight: bold;">+${maximizedWeaponDice}</span></li>
        ${critAdditionalDiceList}
        ${flatBonusLabel}
      </ul>`;
    }

    let totalBlocks = `<p style="margin: 0; flex: 1; ${isCritical ? 'border-right: 1px solid #ddd;' : ''} padding: 0 5px;">Damage Total: <span style="font-size: 1.2em; font-weight: bold;">${finalGWFTotal}</span></p>`;
    if (isCritical) {
      totalBlocks += `<p style="margin: 0; flex: 1; padding: 0 5px;">Critical Total: <span style="font-size: 1.2em; font-weight: bold; color: #18520b;">${criticalTotal}</span></p>`;
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

    let damageDiceSummary = `<ul style="margin: 0 0 5px; padding-left: 15px; font-size: 0.95em; line-height: 1.4;">
    <li style="list-style-type: disc;">Ability Mod (${abilityScore.toUpperCase()}): <strong>${abilityModSign}${abilityMod}</strong></li>
    <li style="list-style-type: disc;">Weapon Damage: <strong>${damageDiceCount}${cleanDieSize} (${baseDamageTypeDisplay})</strong></li>
    ${weaponModifier !== 0 ? `<li style="list-style-type: disc;">Weapon Modifier: <strong>${weaponModSign}${weaponModifier}</strong></li>` : ''}
    ${damageModifier !== 0 ? `<li style="list-style-type: disc;">Other Damage Mod: <strong>${flatModSign}${damageModifier}</strong></li>` : ''}`;
    additionalDamageResults.forEach(c => {
      if (c.onlyCrit) return;
      const disp = c.damageType.toUpperCase() === 'BPS' ? 'BPS' : (c.damageType.charAt(0).toUpperCase() + c.damageType.slice(1));
      damageDiceSummary += `<li style="list-style-type: disc;">${c.label}: <strong>${c.formula} (${disp})</strong></li>`;
    });
    damageDiceSummary += `</ul>`;

    const attackCircumstanceModSign = attackCircumstanceModifier >= 0 ? '+' : '';
    const weaponModifierAttackSign = weaponModifier >= 0 ? '+' : '';
    const attackModifiersList = `<ul style="margin: 0 0 5px; padding-left: 15px; font-size: 0.95em; line-height: 1.4;">
    <li style="list-style-type: disc;">Ability Mod (${abilityScore.toUpperCase()}): <strong>${abilityMod}</strong></li>
    <li style="list-style-type: disc;">Proficiency Bonus (PB): <strong>${prof}</strong></li>
    ${weaponModifier !== 0 ? `<li style="list-style-type: disc;">Weapon Modifier: <strong>${weaponModifierAttackSign}${weaponModifier}</strong></li>` : ''}
    ${attackCircumstanceModifier !== 0 ? `<li style="list-style-type: disc;">Other Mod: <strong>${attackCircumstanceModSign}${attackCircumstanceModifier}</strong></li>` : ''}
  </ul>`;

    let diceMap = {};
    let flatTotal = damageBonus + flatBonus;
    let otherParts = [];
    diceMap[rawDie] = damageDiceCount;

    additionalDamageResults.forEach(c => {
      if (c.onlyCrit) return;
      let parts = c.formula.split('+').map(p => p.trim());
      parts.forEach(p => {
        let diceMatch = p.match(/^(\d*)[dD](\d+)$/);
        if (diceMatch) {
          let count = parseInt(diceMatch[1]) || 1;
          let size = diceMatch[2];
          diceMap[size] = (diceMap[size] || 0) + count;
        } else if (!isNaN(Number(p)) && p !== "") {
          flatTotal += Number(p);
        } else {
          otherParts.push(p);
        }
      });
    });

    let combinedDamageFormulas = [];
    Object.keys(diceMap).sort((a, b) => Number(b) - Number(a)).forEach(size => {
      if (diceMap[size] > 0) combinedDamageFormulas.push(diceMap[size] + 'd' + size);
    });
    combinedDamageFormulas.push(...otherParts);
    if (flatTotal !== 0) combinedDamageFormulas.push(flatTotal);
    const finalDamageString = combinedDamageFormulas.join(" + ").replace(/\+ -/g, "- ");

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
        normalBreakdownList += `<li style="list-style-type: disc;">${displayType}: <strong>${amt}</strong></li>`;
      }
    }

    let critBreakdownList = '';
    for (const [t, amt] of Object.entries(critDamageByType)) {
      if (amt > 0) {
        const displayType = t.toUpperCase() === 'BPS' ? 'BPS' : (t.charAt(0).toUpperCase() + t.slice(1));
        critBreakdownList += `<li style="list-style-type: disc;">${displayType}: <strong>${amt}</strong></li>`;
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
        <p style="font-weight: 500; font-size: 0.95em; margin: 5px 0;"><strong>Attack: +${totalAttackModifier}</strong></p>
        ${attackModifiersList}
        <p style="font-weight: 500; font-size: 0.95em; margin: 5px 0;"><strong>Damage Dice: ${finalDamageString}</strong></p>
        ${damageDiceSummary}
        ${criticalBonusHTML}
        ${typeBreakdownHTML}
      </div>
    </details>`;

    const chatContent = `
    <p><strong>${actorName}: ${chatCardTitle}</strong></p>
    <hr>
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
    ${contentSummary}`;

    await ChatMessage.create({
      user: userId,
      speaker: speaker,
      content: chatContent,
      rolls: finalRolls,
      sound: CONFIG.sounds.dice,
      flags: {
        "autoanimations": {
          item: {
            name: chatCardTitle || config.macroName
          },
          targets: targetIds
        }
      }
    });

    triggerSequencerAnimation(actor, config, rollUser, autoTargetedToken);
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
      castLevel = 0, skipSlotDeduction = false
    } = config;

    let slotTag = "";
    const slotLvl = Number(castLevel) || 0;
    if (slotLvl > 0) {
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
    const cleanDieSize = `d${rawDie}`;
    const maxDieVal = Number(rawDie) || 0;

    const abilityMod = actor.system.abilities?.[spellAbility]?.mod ?? 0;
    const prof = actor.system.attributes?.prof ?? 0;
    const spellDC = 8 + prof + abilityMod;
    const totalAttackMod = abilityMod + prof + (Number(attackModifier) || 0);

    const actorName = actor.name;
    const speaker = ChatMessage.getSpeaker({ actor });

    const rollUser = game.users.get(userId) || game.user;
    const token = actor.getActiveTokens()[0];
    let autoTargetedToken = null;
    let targetIds = Array.from(rollUser?.targets || game.user.targets).map(t => t.id);

    // If not self/point/healing and no targets, auto-target nearest hostile for player / non-hostile tokens
    if (targetIds.length === 0 && token && !isHealingType && targetType !== "self" && targetType !== "point") {
      const isHostileNpc = actor.type === "npc" && (token.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE);
      if (!isHostileNpc) {
        const hostiles = canvas.tokens.placeables.filter(t =>
          t.id !== token.id &&
          t.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE &&
          t.visible
        );
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
    if (superAdv && resolutionMethod === "attack") tags.push("Elven Acc.");

    const tagsHtml = tags.map(t => {
      const isConc = t === "Concentration";
      const isSlot = t.startsWith("Slot:");
      const bg = isConc ? "rgba(163, 72, 72, 0.15)" : (isSlot ? "rgba(43, 116, 137, 0.15)" : "rgba(114, 137, 218, 0.18)");
      const border = isConc ? "rgba(163, 72, 72, 0.4)" : (isSlot ? "rgba(43, 116, 137, 0.4)" : "rgba(114, 137, 218, 0.4)");
      const color = isConc ? "#a34848" : (isSlot ? "#235d6e" : "#4b5d88");
      return `<span style="display: inline-block; background: ${bg}; border: 1px solid ${border}; border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: ${color};">${t}</span>`;
    }).join("");

    // --- Healing Branch ---
    if (isHealingType) {
      let effectiveFlat = Number(flatDamageBonus) || 0;
      if (addAbilityModToValue) effectiveFlat += abilityMod;

      let healFormula = "";
      if (diceCount > 0) {
        healFormula = `${diceCount}${cleanDieSize}`;
        const cleanExtra = (extraDiceFormula || "").trim().replace(/^\+/, "").trim();
        if (cleanExtra) healFormula += ` + ${cleanExtra}`;
        if (effectiveFlat !== 0) healFormula += ` + ${effectiveFlat}`;
      } else {
        healFormula = `${effectiveFlat || 0}`;
      }

      const rollObj = await new Roll(healFormula).evaluate();
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
              ${addAbilityModToValue ? `<div><strong>Spellcasting Mod:</strong> +${abilityMod} (${spellAbility.toUpperCase()})</div>` : ''}
            </div>
          </details>
        </div>
      `;

      await ChatMessage.create({
        user: userId,
        speaker: speaker,
        content: healCard,
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
              <i class="fas fa-sparkles"></i> Spell Effect / Summary
            </div>
            <div style="font-size: 0.9em; line-height: 1.4; color: #2b3a4a; white-space: pre-wrap;">${summaryText}</div>
          </div>
        </div>
      `;

      return await ChatMessage.create({
        user: userId,
        speaker: speaker,
        content: utilityCard
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
        content: autoCard,
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
      const numAttacks = isMultiAttack
        ? (Number(effectiveAttacks) || Number(attackCount) || 1)
        : 1;

      const attackFormula = `1d20 + ${totalAttackMod}`;
      const advFormula = `2d20kh1 + ${totalAttackMod}`;

      let baseDamageFormula = `${diceCount}${cleanDieSize}${explodeModifier}`;
      const cleanExtraDice = (extraDiceFormula || "").trim().replace(/^\+/, "").trim();
      if (cleanExtraDice) baseDamageFormula += ` + ${cleanExtraDice}`;
      if (Number(flatDamageBonus)) baseDamageFormula += ` + ${flatDamageBonus}`;

      const maxPrimaryCrit = diceCount * maxDieVal;
      const maxExtraCrit = parseMaxDiceDamage(cleanExtraDice);
      const maxCritBonus = maxPrimaryCrit + maxExtraCrit;

      const rolledObjects = [];
      let totalStandardDamage = 0;
      let hasAnyCrit = false;
      let summaryRowsHtml = "";
      let detailedAuditHtml = "";

      for (let i = 1; i <= numAttacks; i++) {
        const atkRoll = await new Roll(attackFormula, actor.system).evaluate();
        const advRoll = await new Roll(superAdv ? advFormula : attackFormula, actor.system).evaluate();
        const dmgRoll = await new Roll(baseDamageFormula).evaluate();

        rolledObjects.push(atkRoll, advRoll, dmgRoll);

        const d20_1 = atkRoll.dice[0]?.total ?? 0;
        const d20_2 = advRoll.dice[0]?.total ?? 0;
        const isCrit = d20_1 === 20 || d20_2 === 20;
        if (isCrit) hasAnyCrit = true;

        const baseDmg = dmgRoll.total;
        totalStandardDamage += baseDmg;

        let atk1Style = "color: #2b3a4a;";
        if (d20_1 === 20) atk1Style = "color: #18521e; font-weight: bold;";
        else if (d20_1 === 1) atk1Style = "color: #a33; font-weight: bold;";

        let atk2Style = "color: #666;";
        if (d20_2 === 20) atk2Style = "color: #18521e; font-weight: bold;";
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

        if (d20_1 === 20) atkHtml = atkHtml.replace('dice-total', 'dice-total critical');
        else if (d20_1 === 1) atkHtml = atkHtml.replace('dice-total', 'dice-total fumble');

        if (d20_2 === 20) advHtml = advHtml.replace('dice-total', 'dice-total critical');
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
            <div>
              <div style="font-size: 0.75em; font-weight: 600; color: #777;">${numAttacks > 1 ? "COMBINED BASE DAMAGE" : "DAMAGE TOTAL"}</div>
              <div style="font-size: 1.25em; font-weight: bold; color: #2b3a4a;">${totalStandardDamage}</div>
            </div>
            <div style="border-left: 1px solid rgba(0,0,0,0.1); padding-left: 14px;">
              <div style="font-size: 0.75em; font-weight: 600; color: #777;">DAMAGE TYPE</div>
              <div style="font-size: 1.1em; font-weight: bold; color: #2b3a4a;">${typeDisplay}</div>
            </div>
          </div>

          <details style="margin-top: 6px; padding: 2px 4px;">
            <summary style="font-weight: 600; font-size: 0.82em; color: #666; cursor: pointer;">Dice Roll Audits & Formula</summary>
            <div style="padding-top: 4px; border-top: 1px solid #e0e0e0; font-size: 0.8em; color: #555; margin-top: 3px;">
              <div><strong>Attack Mod:</strong> +${totalAttackMod} (${spellAbility.toUpperCase()}: ${abilityMod} + PB: ${prof}${attackModifier ? ` + Mod: ${attackModifier}` : ''})</div>
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
        content: attackCard,
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
    const outcomeText = saveSuccess === "half" ? "Half damage on success" : "Negates / No damage on success";
    const attackHtmlBlock = `
      <div style="background: rgba(43, 116, 137, 0.1); border: 1px solid rgba(43, 116, 137, 0.35); border-radius: 4px; padding: 6px; text-align: center; margin-bottom: 6px;">
        <div style="font-size: 1.05em; font-weight: bold; color: #235d6e;">DC ${spellDC} ${saveLabel} Saving Throw</div>
        <div style="font-size: 0.8em; color: #555; margin-top: 1px;">${outcomeText}</div>
      </div>
    `;

    let fullDamageFormula = `${diceCount}${cleanDieSize}${explodeModifier}`;
    const cleanExtraDice = (extraDiceFormula || "").trim().replace(/^\+/, "").trim();
    if (cleanExtraDice) fullDamageFormula += ` + ${cleanExtraDice}`;
    if (Number(flatDamageBonus)) fullDamageFormula += ` + ${flatDamageBonus}`;

    const damageRoll = await new Roll(fullDamageFormula).evaluate();
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
      content: saveCard,
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
      const initBonus = getNumericValue(actor.system.attributes?.init?.bonus, 0);
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
        const profLevel = Number(skill?.value ?? skill?.proficient ?? 0);
        if (profLevel > 0) isProficient = true;
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
    if (isReliableTalent && isProficient && (rollType === "skill" || rollType === "tool")) dieFormula += "min10";

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
      const valA = candidateA.dice[0]?.total ?? candidateA.total;
      const valB = candidateB.dice[0]?.total ?? candidateB.total;

      if (valA >= valB) {
        rollD20Second = candidateA;
        droppedCandidate = candidateB;
      } else {
        rollD20Second = candidateB;
        droppedCandidate = candidateA;
      }
    } else {
      rollD20Second = await new Roll(dieFormula).evaluate();
    }

    const terms2 = [rollD20Second.terms[0], ...roll1.terms.slice(1)];
    roll2 = Roll.fromTerms(terms2);
    roll2._total = roll2._evaluateTotal();
    roll2._evaluated = true;

    const d20_1 = roll1.dice[0]?.total ?? 0;
    const d20_2 = rollD20Second.dice[0]?.total ?? 0;

    let rHtml1 = await roll1.render();
    let rHtml2 = await roll2.render();

    if (d20_1 === 20) rHtml1 = rHtml1.replace('dice-total', 'dice-total critical');
    else if (d20_1 === 1) rHtml1 = rHtml1.replace('dice-total', 'dice-total fumble');

    if (d20_2 === 20) rHtml2 = rHtml2.replace('dice-total', 'dice-total critical');
    else if (d20_2 === 1) rHtml2 = rHtml2.replace('dice-total', 'dice-total fumble');

    if (isSuperAdvantage && droppedCandidate) {
      const droppedVal = droppedCandidate.dice[0]?.total ?? droppedCandidate.total;
      const superAdvHtml = `<div style="padding: 2px 4px; margin: 3px 0 0; border: 1px solid #7289DA; border-radius: 3px; background-color: #f0f4ff; font-size: 0.75em; text-align: center;">
        <span style="font-weight: bold; color: #4b5d88;">Super Adv (Kept d20: ${d20_2} | Dropped: ${droppedVal})</span>
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
    if (isReliableTalent && isProficient && (rollType === "skill" || rollType === "tool")) {
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
      content: cardContent,
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
  if (!game.settings.get("cheapdice", "featureAnimations")) return;
  const aa = globalThis.AutomatedAnimations || globalThis.AutoAnimations;
  const token = actor.getActiveTokens()[0];
  if (!token) return;

  const targetUser = rollUser || game.user;
  let targets = Array.from(targetUser?.targets || game.user.targets);

  if (autoTargetedToken) {
    if (!targets.some(t => t.id === autoTargetedToken.id)) {
      targets.push(autoTargetedToken);
    }
  }

  // Fallback: If no target and player owned / non-hostile, acquire nearest hostile
  if (targets.length === 0) {
    const isHostileNpc = actor.type === "npc" && (token.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE);
    if (!isHostileNpc) {
      const hostiles = canvas.tokens.placeables.filter(t =>
        t.id !== token.id &&
        t.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE &&
        t.visible
      );

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
  if (!game.settings.get("cheapdice", "featureSocketHandlers")) return;

  const runSocketInit = () => {
    if (window.socketlib) {
      registerSocketHandlers();
    } else {
      Hooks.once("socketlib.ready", registerSocketHandlers);
    }
  };

  Hooks.once("socketlib.ready", () => {
    if (!globalThis.attackSocket) registerSocketHandlers();
  });

  if (game.ready) {
    runSocketInit();
  } else {
    Hooks.once("setup", runSocketInit);
    Hooks.once("ready", () => {
      if (!globalThis.attackSocket) runSocketInit();
    });
  }
}
