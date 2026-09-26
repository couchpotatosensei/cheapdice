// =============================================================================
// TAM'S WORLD SCRIPT
// Part 1: System Config, Speed, HUD, Elevation
// Part 2: SocketLib Execution Handlers (GM / Broadcast)
// Part 3: Client Dialog Launchers (D20, Weapon, Spell)
// Part 4: Configuration Editors (D20 Presets)
// =============================================================================

// =============================================================================
// PART 1: SYSTEM DEFAULTS, SPEED & ELEVATION CONTROLS
// =============================================================================

CONFIG.Token.movement.defaultSpeed = 14;

// Persistent Profile Storage Registration
function registerCustomRollProfilesSetting() {
  if (!game.settings.settings.has("world.customRollProfiles")) {
    game.settings.register("world", "customRollProfiles", {
      name: "Custom Roll Profiles",
      hint: "Stores weapon, spell, and D20 configurations decoupled from actor documents.",
      scope: "world",
      config: false,
      type: Object,
      default: {}
    });
  }
}


if (game.settings) {
  registerCustomRollProfilesSetting();
} else {
  Hooks.once("setup", registerCustomRollProfilesSetting);
}



Hooks.once("ready", () => {
  if (game.user.isGM) return;

  // Prevent elevation shifts during movement
  const originalMoveMany = canvas.tokens.constructor.prototype.moveMany;
  canvas.tokens.constructor.prototype.moveMany = function(options = {}) {
    if (options.dz) options.dz = 0;
    if (!options.dx && !options.dy && !options.dz) return false;
    return originalMoveMany.call(this, options);
  };

  Hooks.on("renderTokenHUD", (app, html, data) => {
    const root = html instanceof HTMLElement ? html : (html[0] ?? html);
    if (!root) return;

    // --- Cleanup: Elevation, Movement Palette, Locked Icon ---
    const elevationTargets = root.querySelectorAll(
      '.control-icon[data-action="elevation"], input[name="elevation"], .attribute.elevation, [data-action="elevation"]'
    );
    elevationTargets.forEach(el => {
      const wrapper = el.closest('.control-icon') || el.closest('.attribute') || el;
      wrapper.remove();
    });

    const movementTargets = root.querySelectorAll(
      '[data-palette="movementActions"], [data-action="togglePalette"][data-palette="movementActions"]'
    );
    movementTargets.forEach(el => el.remove());

    const lockTargets = root.querySelectorAll(
      '.control-icon[data-action="locked"], [data-action="locked"]'
    );
    lockTargets.forEach(el => {
      const wrapper = el.closest('.control-icon') || el;
      wrapper.remove();
    });

    // --- Cleanup: Default Target, Combat, and Sort Icons ---
    root.querySelector('.control-icon[data-action="target"]')?.remove();
    root.querySelector('.control-icon[data-action="combat"]')?.remove();
    root.querySelector('.control-icon[data-action="sort"]')?.remove();

    // Verify token ownership
    const token = canvas.tokens.get(data?._id ?? app.object?.id);
    if (!token?.actor?.isOwner) return;

    const colLeft = root.querySelector(".col.left");
    const colRight = root.querySelector(".col.right");
    const colMiddle = root.querySelector(".col.middle");
    if (!colLeft || !colRight || !colMiddle) return;

    // Helper: Shared Button Factory
    const makeButton = (title, iconOrPath, onClick, imgSize = "28px") => {
      const btn = document.createElement("div");
      btn.className = "control-icon";
      btn.title = title;
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";

      const isImage = /\.(png|svg|webp|jpg|jpeg)$/i.test(iconOrPath);
      if (isImage) {
        btn.innerHTML = `<img src="${iconOrPath}" style="width: ${imgSize} !important; height: ${imgSize} !important; min-width: ${imgSize} !important; min-height: ${imgSize} !important; max-width: none !important; max-height: none !important; object-fit: contain; pointer-events: none; margin: 0; padding: 0;" />`;
      } else {
        btn.innerHTML = `<i class="${iconOrPath}" style="line-height: 1; margin: 0; padding: 0;"></i>`;
      }

      btn.addEventListener("click", onClick);
      return btn;
    };

    // Helper: Hotbar Slot Runner
    const runHotbarSlot = (slotIndex) => {
      const macroId = game.user.hotbar[slotIndex];
      const macro = game.macros.get(macroId);
      if (macro) {
        macro.execute({ actor: token.actor, token: token });
      } else {
        ui.notifications.info(`Hotbar slot ${slotIndex} is empty.`);
      }
    };

    // --- Left Column: D20 Test ---
    const d20Btn = makeButton(
      "Roll D20",
      "docs/assets/fvtt.png",
      () => {
        window.CustomRolls?.openD20Dialog();
      },
      "32px"
    );
    colLeft.appendChild(d20Btn);

    // --- Left Column: Raise Hand Toggle ---
    const isRaised = Boolean(token.handRaised);
    const handBtn = makeButton(isRaised ? "Lower Hand" : "Raise Hand", "fas fa-hand-paper", () => {
      token.handRaised = !token.handRaised;
      if (token.handRaised) {
        game.macros.getName("Raise Hand")?.execute({ actor: token.actor, token: token });
      } else {
        game.macros.getName("Lower Hand")?.execute({ actor: token.actor, token: token });
      }
      app.render();
    });
    if (isRaised) handBtn.classList.add("active");
    colLeft.appendChild(handBtn);

    // --- Left Column: Distance Measure Toggle ---
    const measureBtn = makeButton("Measure Distance", "fas fa-ruler", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const currentlyRuler = ui.controls.tool?.name === "ruler";

      if (currentlyRuler) {
        canvas.controls.ruler?.reset();
        const tokenSelectBtn = document.querySelector('#controls ol.sub-controls li[data-tool="select"]') 
          || document.querySelector('#controls ol.main-controls li[data-control="token"]');
        if (tokenSelectBtn) {
          tokenSelectBtn.click();
        } else {
          ui.controls.render(true, { controls: "token", tool: "select" });
        }
        token.control({ releaseOthers: true });
        measureBtn.classList.remove("active");
      } else {
        const rulerBtn = document.querySelector('#controls ol.main-controls li[data-control="controls"]')
          || document.querySelector('#controls ol.sub-controls li[data-tool="ruler"]');
        if (rulerBtn) {
          rulerBtn.click();
          const subRuler = document.querySelector('#controls ol.sub-controls li[data-tool="ruler"]');
          if (subRuler) subRuler.click();
        } else {
          ui.controls.render(true, { controls: "controls", tool: "ruler" });
        }
        measureBtn.classList.add("active");
      }
    });

    if (ui.controls.tool?.name === "ruler") {
      measureBtn.classList.add("active");
    }
    colLeft.appendChild(measureBtn);

    // --- Left Column: Utility Flyout (Hotbar Slots 1, 2, 3) ---
    const leftFlyoutWrapper = document.createElement("div");
    leftFlyoutWrapper.className = "control-icon left-flyout-parent";
    leftFlyoutWrapper.title = "Quick Menu";
    leftFlyoutWrapper.innerHTML = '<i class="fas fa-ellipsis"></i>';
    leftFlyoutWrapper.style.position = "relative";

    const leftFlyout = document.createElement("div");
    leftFlyout.style.cssText = `
      display: none;
      position: absolute;
      right: 50px;
      top: 0;
      flex-direction: row;
      gap: 5px;
      background: rgba(0, 0, 0, 0.85);
      border: 1px solid #7a7971;
      border-radius: 5px;
      padding: 4px;
      z-index: 100;
      white-space: nowrap;
    `;

    leftFlyoutWrapper.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = leftFlyout.style.display === "flex";
      leftFlyout.style.display = isOpen ? "none" : "flex";
    });

    leftFlyout.appendChild(makeButton("Hotbar Slot 1", "fas fa-dice-one", () => runHotbarSlot(1)));
    leftFlyout.appendChild(makeButton("Hotbar Slot 2", "fas fa-dice-two", () => runHotbarSlot(2)));
    leftFlyout.appendChild(makeButton("Hotbar Slot 3", "fas fa-dice-three", () => runHotbarSlot(3)));

    leftFlyoutWrapper.appendChild(leftFlyout);
    colLeft.appendChild(leftFlyoutWrapper);

    // --- Right Column: Attacks & Quick Slots ---
    const actionBtn = makeButton(
      "Attacks",
      "icons/logo-scifi.png",
      () => {
        window.CustomRolls?.openActionDialog();
      },
      "32px"
    );
    colRight.appendChild(actionBtn);

    // --- Right Column: Hotbar Page 5 (Slots 48, 49, 50) ---
    colRight.appendChild(makeButton("Slot 1", "fas fa-square-1", () => runHotbarSlot(48)));
    colRight.appendChild(makeButton("Slot 2", "fas fa-square-2", () => runHotbarSlot(49)));
    colRight.appendChild(makeButton("Slot 3", "fas fa-square-3", () => runHotbarSlot(50)));

    // --- Middle: Spell Save DC Display ---
    const actorSystem = token.actor.system;
    const hasSpellcasting = Boolean(actorSystem.attributes?.spellcasting);
    const rawDC = actorSystem.attributes?.spell?.dc ?? actorSystem.attributes?.spelldc;
    const spellDC = (hasSpellcasting && rawDC && rawDC > 0) ? rawDC : "S.DC";

    const dcBadge = document.createElement("div");
    dcBadge.className = "attribute spell-dc";
    dcBadge.title = "Spell Save DC";
    dcBadge.style.cssText = `
      position: absolute;
      top: -35px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.7);
      border: 1px solid #7a7971;
      border-radius: 4px;
      color: #fff;
      padding: 2px 6px;
      font-size: 20px;
      font-weight: bold;
      pointer-events: none;
      white-space: nowrap;
    `;
    dcBadge.innerHTML = `<i class="fas fa-wand-magic-sparkles" style="margin-right: 4px;"></i>${spellDC}`;
    colMiddle.appendChild(dcBadge);

    // --- Middle: Quick HP Buttons (-10, -5, -1, +1, +5, +10) ---
    const allInputs = Array.from(colMiddle.querySelectorAll('.attribute input'));
    const bottomInput = allInputs[allInputs.length - 1];
    const hpContainer = bottomInput?.closest('.attribute');

    if (hpContainer) {
      const btnRow = document.createElement("div");
      btnRow.className = "quick-hp-row";
      btnRow.style.cssText = `
        position: absolute;
        bottom: -42px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 3px;
        z-index: 100;
        pointer-events: auto;
      `;

      const createHpBtn = (delta, label) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = label;
        btn.title = `${delta > 0 ? "Heal" : "Damage"} ${Math.abs(delta)}`;
        btn.style.cssText = `
          width: 36px;
          height: 28px;
          line-height: 26px;
          font-size: 15px;
          font-weight: bold;
          padding: 0;
          margin: 0;
          cursor: pointer;
          background: rgba(0, 0, 0, 0.85);
          color: #fff;
          border: 1px solid #7a7971;
          border-radius: 3px;
        `;

        const applyChange = async (event) => {
          event.preventDefault();
          event.stopPropagation();

          const actor = token.actor;
          if (!actor) return;

          const currentHp = Number(actor.system.attributes?.hp?.value ?? 0);
          const maxHp = Number(actor.system.attributes?.hp?.max ?? 0);
          const newHp = Math.clamp(currentHp + delta, 0, maxHp);

          await actor.update({ "system.attributes.hp.value": newHp });
          if (token.document.isLinked === false) {
            await token.document.update({ "actorData.system.attributes.hp.value": newHp });
          }
          if (bottomInput) bottomInput.value = newHp;
        };

        btn.addEventListener("mousedown", (e) => e.stopPropagation());
        btn.addEventListener("mouseup", applyChange);
        return btn;
      };

      btnRow.appendChild(createHpBtn(-10, "-10"));
      btnRow.appendChild(createHpBtn(-5, "-5"));
      btnRow.appendChild(createHpBtn(-1, "-1"));
      btnRow.appendChild(createHpBtn(1, "+1"));
      btnRow.appendChild(createHpBtn(5, "+5"));
      btnRow.appendChild(createHpBtn(10, "+10"));
      hpContainer.appendChild(btnRow);
    }

    // --- Right Column: Fix Status Effects Palette Background ---
    const statusPalette = root.querySelector(".status-effects");
    if (statusPalette) {
      statusPalette.style.background = "rgba(0, 0, 0, 0.85)";
      statusPalette.style.border = "1px solid #7a7971";
      statusPalette.style.borderRadius = "5px";
      statusPalette.style.height = "auto";
      statusPalette.style.maxHeight = "400px";
      statusPalette.style.overflowY = "auto";
      statusPalette.style.padding = "6px";
    }
  });
});

// =============================================================================
// PART 2: SOCKETLIB REGISTRATION & EXECUTION HANDLERS
// =============================================================================
function initSockets() {
  const socket = socketlib.registerSystem("dnd5e");
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

  const targetIds = Array.from(game.user.targets).map(t => t.id);

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

  triggerSequencerAnimation(actor, config);
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

      const targetIds = Array.from(game.user.targets).map(t => t.id);

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

      triggerSequencerAnimation(actor, config);
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
            targets: Array.from(game.user.targets).map(t => t.id)
          }
        }
      });

      triggerSequencerAnimation(actor, config);
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
            targets: Array.from(game.user.targets).map(t => t.id)
          }
        }
      });

      triggerSequencerAnimation(actor, config);
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
          targets: Array.from(game.user.targets).map(t => t.id)
        }
      }
    });

    triggerSequencerAnimation(actor, config);
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
      if (key && key.startsWith("custom_")) {
        const storedProfiles = actor.getFlag("world", "d20Profiles") || {};
        const customObj = storedProfiles[key];
        const abil = customObj?.ability || "int";
        baseMod = getNumericValue(actor.system.abilities?.[abil]?.mod, 0);
        label = `${customObj?.name || "Custom"} Check`;
        sublabel = `${abil.toUpperCase()} Base`;
      } else {
        const skill = actor.system.skills?.[key];
        baseMod = getNumericValue(skill?.total, 0);
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
      if (key && key.startsWith("custom_")) {
        const storedProfiles = actor.getFlag("world", "d20Profiles") || {};
        const customObj = storedProfiles[key];
        const abil = customObj?.ability || "dex";
        baseMod = getNumericValue(actor.system.abilities?.[abil]?.mod, 0);
        label = `${customObj?.name || "Custom"} Tool Check`;
        sublabel = `${abil.toUpperCase()} Base`;
      } else {
        const tool = TOOLS[key];
        const abil = tool?.ability || "dex";
        const abilMod = getNumericValue(actor.system.abilities?.[abil]?.mod, 0);
        const toolItem = actor.items.find(i => i.type === "tool" && i.name.toLowerCase().includes((tool?.name || "").toLowerCase().split("'")[0]));
        const isProf = actor.system.tools?.[key]?.proficient || toolItem?.system?.proficient || 0;
        const profBonus = isProf ? pb * (isProf === 2 ? 2 : 1) : 0;

        baseMod = abilMod + profBonus;
        label = `${tool?.name || "Tool"} Check`;
        sublabel = `${abil.toUpperCase()} Base${profBonus ? ` + PB (+${profBonus})` : ""}`;
      }
    } else if (rollType === "save") {
      const saveObj = actor.system.abilities?.[key]?.save;
      const modObj = actor.system.abilities?.[key]?.mod;
      baseMod = getNumericValue(saveObj, getNumericValue(modObj, 0));
      label = `${key.toUpperCase()} Saving Throw`;
      sublabel = "Ability Save";
    } else {
      if (key && key.startsWith("custom_")) {
        const storedProfiles = actor.getFlag("world", "d20Profiles") || {};
        const customObj = storedProfiles[key];
        const abil = customObj?.ability || "str";
        baseMod = getNumericValue(actor.system.abilities?.[abil]?.mod, 0);
        label = `${customObj?.name || "Custom"} Ability Check`;
        sublabel = `${abil.toUpperCase()} Base`;
      } else {
        baseMod = getNumericValue(actor.system.abilities?.[key]?.mod, 0);
        label = `${key.toUpperCase()} Ability Check`;
        sublabel = "Raw Ability";
      }
    }

    let dieFormula = "1d20";
    if (isHalflingLuck) dieFormula += "r1";
    if (isReliableTalent && (rollType === "skill" || rollType === "tool")) dieFormula += "min10";

    const cleanOther = (otherModString || "").trim();
    let formulaSuffix = `${baseMod >= 0 ? `+ ${baseMod}` : `- ${Math.abs(baseMod)}`}`;
    if (cleanOther) {
      const formattedOther = cleanOther.startsWith("+") || cleanOther.startsWith("-") ? cleanOther : `+ ${cleanOther}`;
      formulaSuffix += ` ${formattedOther}`;
    }

    const fullFormula = `${dieFormula} ${formulaSuffix}`;

    const roll1 = await new Roll(fullFormula).evaluate();
    const roll2 = await new Roll(fullFormula).evaluate();

    const d20_1 = roll1.dice[0]?.total ?? 0;
    const d20_2 = roll2.dice[0]?.total ?? 0;

    let rHtml1 = await roll1.render();
    let rHtml2 = await roll2.render();

    if (d20_1 === 20) rHtml1 = rHtml1.replace('dice-total', 'dice-total critical');
    else if (d20_1 === 1) rHtml1 = rHtml1.replace('dice-total', 'dice-total fumble');

    if (d20_2 === 20) rHtml2 = rHtml2.replace('dice-total', 'dice-total critical');
    else if (d20_2 === 1) rHtml2 = rHtml2.replace('dice-total', 'dice-total fumble');

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

    if (isReliableTalent && (rollType === "skill" || rollType === "tool")) {
      tags.push('<span style="background: rgba(108, 117, 125, 0.15); border: 1px solid rgba(108, 117, 125, 0.4); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #495057;">Reliable Talent</span>');
    }
    if (isHalflingLuck) {
      tags.push('<span style="background: rgba(255, 193, 7, 0.2); border: 1px solid rgba(255, 193, 7, 0.5); border-radius: 3px; padding: 1px 5px; font-size: 0.75em; font-weight: 600; color: #856404;">Halfling Luck</span>');
    }

    const tagsBlock = tags.length > 0
      ? `<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px;">${tags.join("")}</div>`
      : "";

    const cardContent = `
      <div style="font-family: inherit; color: #333;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #343a40; padding-bottom: 3px; margin-bottom: 6px;">
          <span style="font-size: 1.05em; font-weight: bold; color: #2b3a4a;">${label}</span>
          <span style="font-size: 0.8em; color: #777;">${actor.name}</span>
        </div>

        ${tagsBlock}

        <div style="display: flex; justify-content: space-around; gap: 8px; margin-bottom: 6px;">
          <div style="flex: 1; text-align: center;">
            <div style="font-size: 0.75em; font-weight: 600; color: #777; margin-bottom: 2px;">NORMAL ROLL</div>
            <div style="transform: scale(0.96); margin: -2px 0;">${rHtml1}</div>
          </div>
          <div style="flex: 1; text-align: center;">
            <div style="font-size: 0.75em; font-weight: 600; color: #777; margin-bottom: 2px;">ADV / DIS</div>
            <div style="transform: scale(0.96); margin: -2px 0;">${rHtml2}</div>
          </div>
        </div>

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

    return await ChatMessage.create({
      user: userId,
      speaker: ChatMessage.getSpeaker({ actor }),
      content: cardContent,
      rolls: [roll1, roll2],
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

if (window.socketlib) {
  initSockets();
} else {
  Hooks.once("socketlib.ready", initSockets);
}


// --- Automated Animations & Sequencer Trigger ---
async function triggerSequencerAnimation(actor, config) {
  const aa = globalThis.AutomatedAnimations || globalThis.AutoAnimations;
  const token = actor.getActiveTokens()[0];
  if (!token) return;

  let targets = Array.from(game.user.targets);

  // Auto-acquire nearest hostile if no target is active
  if (targets.length === 0) {
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
        nearestHostile.setTarget(true, { user: game.user, releaseOthers: true });
        targets = [nearestHostile];
      }
    } else {
      return;
    }
  }

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
    new Sequence()
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
    return;
  }

  // Standard AutoAnimations pipeline for weapons and non-template spells
  if (aa) {
    const playFn = aa.PlayAnimation || aa.playAnimation;
    if (typeof playFn === "function") {
      try {
        await playFn.call(aa, token, item, targets);
      } catch (err) {
        console.warn("[CustomRolls AA] AutoAnimations call failed:", err);
      }
    }
  }
}










// =============================================================================
// PART 3: CLIENT-SIDE DIALOG LAUNCHERS
// =============================================================================
window.CustomRolls = window.CustomRolls || {};



// --- Persistent Profile Storage Helpers ---
window.CustomRolls.getProfileData = function(actor, category) {
  if (!actor) return null;
  const store = game.settings.get("world", "customRollProfiles") || {};
  const actorStore = store[actor.id] || store[actor.name] || {};
  return actorStore[category] || null;
};

window.CustomRolls.setProfileData = async function(actor, category, data) {
  if (!actor) return;
  const store = foundry.utils.deepClone(game.settings.get("world", "customRollProfiles") || {});
  if (!store[actor.id]) store[actor.id] = {};
  store[actor.id][category] = data;
  store[actor.id]._actorName = actor.name;
  return await game.settings.set("world", "customRollProfiles", store);
};

// --- 3.1 D20 Test Client-Side Dialog Launcher ---
window.CustomRolls.openD20Dialog = function() {
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

// --- 3.2 Weapon Attack Client-Side Dialog Launcher ---
window.CustomRolls.openAttackDialog = function() {
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
    const prof = actor.system.attributes.prof || 0;
    const wepMod = Number(config.weaponModifier) || 0;
    const circMod = Number(config.attackCircumstanceModifier) || 0;
    const totalAtk = abilityMod + prof + wepMod + circMod;
    const atkSign = totalAtk >= 0 ? `+${totalAtk}` : `${totalAtk}`;

    const diceCount = Number(config.damageDiceCount) || 1;
    const dieSize = String(config.damageDieSize || "6").replace(/^d/i, "");
    const dmgMod = abilityMod + wepMod + (Number(config.damageModifier) || 0);
    const dmgModSign = dmgMod >= 0 ? `+${dmgMod}` : `${dmgMod}`;
    const dmgFormula = `${diceCount}d${dieSize} ${dmgMod !== 0 ? dmgModSign : ""}`.trim();
    const dmgType = (config.damageType || "slashing").toUpperCase();

    const tags = [];
    tags.push(`Crit: ${config.CRIT_THRESHOLD || 20}+`);
    if (config.superAdv) tags.push("Elven Acc.");
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
            html.find(".extra-dmg-toggle").each(function() {
              const idx = $(this).data("index");
              if (config.additionalDamageComponents[idx]) {
                config.additionalDamageComponents[idx].isActive = $(this).is(":checked");
              }
            });
          }

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
window.CustomRolls.openSpellDialog = async function() {
  const token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;

  if (!token) {
    return ui.notifications.warn("Please select your token first.");
  }

  const actor = token.actor;
  if (!actor || !actor.isOwner) {
    return ui.notifications.warn("You don't have permissions to use this token.");
  }

  const spellConfigs = window.CustomRolls.getProfileData(actor, "spellConfigs") || actor.getFlag("world", "spellConfigs") || {};
  const spellKeys = Object.keys(spellConfigs);

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
    if (cfg.superAdv && cfg.resolutionMethod === "attack") tags.push("Elven Acc.");
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

      await globalThis.attackSocket.executeAsGM("runSpellAttackRoll", config, actor.id, game.user.id);
    }
  }, { width: 400 }).render(true);
};

// --- 3.4 Unified Action Client-Side Dialog Launcher (Card/List View) ---
window.CustomRolls.openActionDialog = function(initialMode = "weapon") {
  const token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;

  if (!token) {
    return ui.notifications.warn("Please select your token first.");
  }

  const actor = token.actor;
  if (!actor || !actor.isOwner) {
    return ui.notifications.warn("You don't have permissions to use this token.");
  }

  const attacks = window.CustomRolls.getProfileData(actor, "attackConfigs") || actor.getFlag("world", "attackConfigs") || {};
  const spellConfigs = window.CustomRolls.getProfileData(actor, "spellConfigs") || actor.getFlag("world", "spellConfigs") || {};

  const attackNames = Object.keys(attacks);
  const spellKeys = Object.keys(spellConfigs);

  if (attackNames.length === 0 && spellKeys.length === 0) {
    return ui.notifications.warn(`No configured attacks or spells found for ${actor.name}.`);
  }

  let currentMode = initialMode;
  if (currentMode === "weapon" && attackNames.length === 0) currentMode = "spell";
  if (currentMode === "spell" && spellKeys.length === 0) currentMode = "weapon";

  let selectedWeaponKey = attackNames[0] || null;
  let selectedSpellKey = spellKeys[0] || null;

  // --- Helper Calculations ---
  function getWeaponDetails(config) {
    if (!config) return { atkSign: "+0", dmgFormula: "1d6", dmgType: "SLASHING", tags: [] };
    const abilityMod = actor.system.abilities[config.abilityScore]?.mod || 0;
    const prof = actor.system.attributes.prof || 0;
    const wepMod = Number(config.weaponModifier) || 0;
    const circMod = Number(config.attackCircumstanceModifier) || 0;
    const totalAtk = abilityMod + prof + wepMod + circMod;
    const atkSign = totalAtk >= 0 ? `+${totalAtk}` : `${totalAtk}`;

    const diceCount = Number(config.damageDiceCount) || 1;
    const dieSize = String(config.damageDieSize || "6").replace(/^d/i, "");
    const dmgMod = abilityMod + wepMod + (Number(config.damageModifier) || 0);
    const dmgModSign = dmgMod >= 0 ? `+${dmgMod}` : `${dmgMod}`;
    const dmgFormula = `${diceCount}d${dieSize} ${dmgMod !== 0 ? dmgModSign : ""}`.trim();
    const dmgType = (config.damageType || "slashing").toUpperCase();

    const tags = [];
    if (config.CRIT_THRESHOLD && config.CRIT_THRESHOLD < 20) tags.push(`Crit ${config.CRIT_THRESHOLD}+`);
    if (config.superAdv) tags.push("Elven Acc.");
    if (config.HAS_HALFLING_LUCKY) tags.push("Lucky");
    if (Number(config.GWF_REROLL_THRESHOLD) > 0) tags.push(`GWF ≤${config.GWF_REROLL_THRESHOLD}`);

    return { atkSign, dmgFormula, dmgType, tags };
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
      actionVal = `DC ${spellDC} ${(cfg.saveAbility || 'dex').toUpperCase()}`;
    } else if (cfg.resolutionMethod === "auto") {
      actionVal = `${cfg.effectiveProjectiles || cfg.projectileCount || 3} Darts`;
    } else if (isHealing) {
      actionVal = "HEAL";
      typeLabel = "RECOVERY";
    }

    const tags = [];
    if (cfg.castingTime) tags.push(cfg.castingTime);
    if (cfg.range) tags.push(cfg.range);
    if (cfg.concentration) tags.push("Conc.");

    return { actionVal, valFormula, typeLabel, tags };
  }

  function getUpcastOptionsHtml(spell) {
    const baseLevel = Number(spell?.baseLevel) || 0;
    if (baseLevel === 0) {
      return `
        <div style="font-size: 0.82em; color: #555; padding: 4px 6px; background: rgba(0,0,0,0.02); border-radius: 4px; border: 1px solid #e0e0e0;">
          <strong>Slot:</strong> Cantrip (No slot cost)
          <input type="hidden" id="castLevelSelect" value="0" />
        </div>
      `;
    }

    let html = `
      <div style="background: rgba(0,0,0,0.02); border: 1px solid #d2d7df; border-radius: 4px; padding: 6px;">
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
        <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em; cursor: pointer; padding: 2px 4px; background: #fff; border-radius: 3px; border: 1px solid #e0e0e0; margin-top: 4px;">
          <span style="font-weight: 600; color: #4b5d88;">Deduct slot from sheet</span>
          <input type="checkbox" id="deductSlotToggle" style="margin: 0;" />
        </label>
      </div>
    `;
    return html;
  }

  function renderWeaponCards() {
    return attackNames.map(name => {
      const conf = attacks[name];
      const isSel = name === selectedWeaponKey;
      const d = getWeaponDetails(conf);
      const tagsHtml = d.tags.map(t => `<span style="background: rgba(114, 137, 218, 0.15); border: 1px solid rgba(114, 137, 218, 0.3); border-radius: 2px; padding: 1px 4px; font-size: 0.7em; color: #4b5d88;">${t}</span>`).join(" ");

      return `
        <div class="action-card weapon-card" data-key="${name}" style="border: 2px solid ${isSel ? '#7289da' : '#e0e0e0'}; background: ${isSel ? '#f0f4ff' : '#fff'}; border-radius: 5px; padding: 6px 8px; cursor: pointer; transition: border-color 0.15s, background-color 0.15s; margin-bottom: 5px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
            <span style="font-weight: bold; font-size: 0.9em; color: #2b3a4a;">${name}</span>
            <span style="font-size: 0.75em; font-weight: bold; color: #555;">${d.dmgType}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82em; color: #333;">
            <span>Atk: <strong style="color: #2b3a4a;">${d.atkSign}</strong></span>
            <span>Dmg: <strong style="color: #2b3a4a;">${d.dmgFormula}</strong></span>
          </div>
          ${d.tags.length > 0 ? `<div style="display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px;">${tagsHtml}</div>` : ""}
        </div>
      `;
    }).join("");
  }

  function renderSpellCards() {
    return spellKeys.map(key => {
      const sp = spellConfigs[key];
      const isSel = key === selectedSpellKey;
      const d = getSpellDetails(sp, sp.baseLevel);
      const lvlLabel = Number(sp.baseLevel) === 0 ? "Cantrip" : `Lvl ${sp.baseLevel}`;
      const tagsHtml = d.tags.map(t => `<span style="background: rgba(114, 137, 218, 0.15); border: 1px solid rgba(114, 137, 218, 0.3); border-radius: 2px; padding: 1px 4px; font-size: 0.7em; color: #4b5d88;">${t}</span>`).join(" ");

      return `
        <div class="action-card spell-card" data-key="${key}" style="border: 2px solid ${isSel ? '#7289da' : '#e0e0e0'}; background: ${isSel ? '#f0f4ff' : '#fff'}; border-radius: 5px; padding: 6px 8px; cursor: pointer; transition: border-color 0.15s, background-color 0.15s; margin-bottom: 5px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
            <span style="font-weight: bold; font-size: 0.9em; color: #2b3a4a;">${key}</span>
            <span style="font-size: 0.75em; font-weight: bold; color: #7289da;">${lvlLabel}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82em; color: #333;">
            <span>${sp.resolutionMethod === 'save' ? 'Save' : 'Roll'}: <strong style="color: #2b3a4a;">${d.actionVal}</strong></span>
            <span>Effect: <strong style="color: #2b3a4a;">${d.valFormula}</strong> <small style="color: #666;">${d.typeLabel}</small></span>
          </div>
          ${d.tags.length > 0 ? `<div style="display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px;">${tagsHtml}</div>` : ""}
        </div>
      `;
    }).join("");
  }

  function getSelectedWeaponOptionsHtml() {
    const config = attacks[selectedWeaponKey];
    if (!config) return "";
    let gwmHtml = "";
    if (config.hasGWM) {
      gwmHtml = `
        <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em; font-weight: bold; color: #a34848; cursor: pointer; padding: 3px 6px; background: rgba(163, 72, 72, 0.08); border-radius: 3px; margin-bottom: 4px;">
          <span>GWM / Sharpshooter (-5 / +10)</span>
          <input type="checkbox" id="gwm-toggle" style="margin: 0;">
        </label>
      `;
    }
    const extras = config.additionalDamageComponents || [];
    let extrasHtml = "";
    if (extras.length > 0) {
      extrasHtml = `
        <div style="border-top: 1px solid #e0e0e0; padding-top: 4px; margin-top: 4px;">
          <div style="font-size: 0.7em; font-weight: bold; color: #777; margin-bottom: 3px;">OPTIONAL DAMAGE:</div>
          ${extras.map((ex, i) => `
            <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.78em; cursor: pointer; padding: 2px 4px; background: rgba(0,0,0,0.02); border-radius: 3px; margin-bottom: 2px;">
              <span><strong>${ex.label}</strong> <small style="color: #777;">(${ex.formula})</small></span>
              <input type="checkbox" class="extra-dmg-toggle" data-index="${i}" style="margin: 0;">
            </label>
          `).join("")}
        </div>
      `;
    }
    if (!gwmHtml && !extrasHtml) return "";
    return `<div style="background: #fafbfc; border: 1px solid #d2d7df; border-radius: 4px; padding: 6px; margin-top: 6px;">${gwmHtml}${extrasHtml}</div>`;
  }

  const content = `
    <div style="display: flex; flex-direction: column; gap: 8px; padding: 4px 2px; font-family: inherit;">
      <!-- Tabs -->
      <div style="display: flex; gap: 6px; border-bottom: 2px solid #7289da; padding-bottom: 8px;">
        <button type="button" id="tab-btn-weapon" style="flex: 1; padding: 6px; font-weight: bold; border-radius: 4px 4px 0 0; border: 1px solid #7289da; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
          <i class="fas fa-sword"></i> Weapons (${attackNames.length})
        </button>
        <button type="button" id="tab-btn-spell" style="flex: 1; padding: 6px; font-weight: bold; border-radius: 4px 4px 0 0; border: 1px solid #7289da; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
          <i class="fas fa-magic"></i> Spells (${spellKeys.length})
        </button>
      </div>

      <!-- Weapons Section -->
      <div id="section-weapon" style="display: ${currentMode === 'weapon' ? 'flex' : 'none'}; flex-direction: column;">
        <div id="weapon-cards-container" style="max-height: 55vh; overflow-y: auto; padding-right: 4px;">
          ${renderWeaponCards()}
        </div>
        <div id="weapon-options-container">
          ${getSelectedWeaponOptionsHtml()}
        </div>
      </div>

      <!-- Spells Section -->
      <div id="section-spell" style="display: ${currentMode === 'spell' ? 'flex' : 'none'}; flex-direction: column;">
        <div id="spell-cards-container" style="max-height: 55vh; overflow-y: auto; padding-right: 4px;">
          ${renderSpellCards()}
        </div>
        <div id="spell-options-container" style="margin-top: 6px;">
          ${spellConfigs[selectedSpellKey] ? getUpcastOptionsHtml(spellConfigs[selectedSpellKey]) : ""}
        </div>
      </div>
    </div>
  `;

  new Dialog({
    title: `${actor.name}: Perform Action`,
    content: content,
    buttons: {
      execute: {
        icon: '<i class="fas fa-dice-d20" style="margin-right: 6px;"></i>',
        label: currentMode === "weapon" ? "Roll Attack" : "Cast Spell",
        callback: async (html) => {
          if (currentMode === "weapon") {
            const rawConfig = attacks[selectedWeaponKey];
            if (!rawConfig) return;
            const config = foundry.utils.duplicate(rawConfig);

            if (config.hasGWM && html.find("#gwm-toggle").is(":checked")) {
              config.attackCircumstanceModifier = (Number(config.attackCircumstanceModifier) || 0) - 5;
              config.damageModifier = (Number(config.damageModifier) || 0) + 10;
              config.chatCardTitle = `${config.chatCardTitle || selectedWeaponKey} [GWM/SS -5/+10]`;
            }

            if (config.additionalDamageComponents) {
              html.find(".extra-dmg-toggle").each(function() {
                const idx = $(this).data("index");
                if (config.additionalDamageComponents[idx]) {
                  config.additionalDamageComponents[idx].isActive = $(this).is(":checked");
                }
              });
            }

            await globalThis.attackSocket.executeAsGM("runAttackRoll", config, actor.id, game.user.id);
          } else {
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

            triggerSequencerAnimation(actor, config);

            await globalThis.attackSocket.executeAsGM("runSpellAttackRoll", config, actor.id, game.user.id);
          }
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "execute",
    render: (html) => {
      setTimeout(() => html.closest('.app.dialog').css({ height: "auto" }), 10);
      const btnWeapon = html.find("#tab-btn-weapon");
      const btnSpell = html.find("#tab-btn-spell");
      const secWeapon = html.find("#section-weapon");
      const secSpell = html.find("#section-spell");
      const execBtn = html.find(".dialog-button.execute");

      function updateCardStyles() {
        html.find(".weapon-card").each(function() {
          const k = $(this).data("key");
          const isSel = k === selectedWeaponKey;
          $(this).css({
            "border-color": isSel ? "#7289da" : "#e0e0e0",
            "background-color": isSel ? "#f0f4ff" : "#fff"
          });
        });
        html.find(".spell-card").each(function() {
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
        if (mode === "weapon") {
          btnWeapon.css({ background: "#7289da", color: "#fff" });
          btnSpell.css({ background: "#f0f2f5", color: "#555" });
          secWeapon.show();
          secSpell.hide();
          execBtn.html('<i class="fas fa-dice-d20" style="margin-right: 6px;"></i> Roll Attack');
          execBtn.prop("disabled", attackNames.length === 0);
        } else {
          btnSpell.css({ background: "#7289da", color: "#fff" });
          btnWeapon.css({ background: "#f0f2f5", color: "#555" });
          secSpell.show();
          secWeapon.hide();
          execBtn.html('<i class="fas fa-magic" style="margin-right: 6px;"></i> Cast Spell');
          execBtn.prop("disabled", spellKeys.length === 0);
        }
      }

      btnWeapon.on("click", () => setTab("weapon"));
      btnSpell.on("click", () => setTab("spell"));
      setTab(currentMode);

      html.find(".weapon-card").on("click", function() {
        selectedWeaponKey = $(this).data("key");
        updateCardStyles();
        html.find("#weapon-options-container").html(getSelectedWeaponOptionsHtml());
      });

      html.find(".spell-card").on("click", function() {
        selectedSpellKey = $(this).data("key");
        updateCardStyles();
        const sp = spellConfigs[selectedSpellKey];
        html.find("#spell-options-container").html(sp ? getUpcastOptionsHtml(sp) : "");
      });
    }
  }, { 
    width: 440, 
    height: "auto", 
    resizable: true 
  }).render(true);
};




// =============================================================================
// PART 4: CONFIGURATION EDITORS
// =============================================================================

// --- 4.1 D20 Preset Modifier Editor Launcher ---
window.CustomRolls.openD20PresetEditor = function() {
  const token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;

  if (!token) {
    return ui.notifications.warn("Please select your token first.");
  }

  const actor = token.actor;
  if (!actor || !actor.isOwner) {
    return ui.notifications.warn("You don't have permissions to use this token.");
  }

  const currentProfiles = foundry.utils.deepClone(
    window.CustomRolls.getProfileData(actor, "d20Profiles") || actor.getFlag("world", "d20Profiles") || {}
  );

  const ABILITIES = {
    str: "STR",
    dex: "DEX",
    con: "CON",
    int: "INT",
    wis: "WIS",
    cha: "CHA"
  };

  const CATEGORIES = {
    skill: "Skill Check",
    tool: "Tool Check",
    check: "Ability Check"
  };

  const STANDARD_OPTIONS = [
    { optgroup: "Skills", options: [
      { key: "acr", label: "Acrobatics (DEX)" },
      { key: "ani", label: "Animal Handling (WIS)" },
      { key: "arc", label: "Arcana (INT)" },
      { key: "ath", label: "Athletics (STR)" },
      { key: "dec", label: "Deception (CHA)" },
      { key: "his", label: "History (INT)" },
      { key: "ins", label: "Insight (WIS)" },
      { key: "itm", label: "Intimidation (CHA)" },
      { key: "inv", label: "Investigation (INT)" },
      { key: "med", label: "Medicine (WIS)" },
      { key: "nat", label: "Nature (INT)" },
      { key: "prc", label: "Perception (WIS)" },
      { key: "prf", label: "Performance (CHA)" },
      { key: "per", label: "Persuasion (CHA)" },
      { key: "rel", label: "Religion (INT)" },
      { key: "slt", label: "Sleight of Hand (DEX)" },
      { key: "ste", label: "Stealth (DEX)" },
      { key: "sur", label: "Survival (WIS)" }
    ]},
    { optgroup: "Common Tools", options: [
      { key: "alchemist", label: "Alchemist Supplies" },
      { key: "brewer", label: "Brewer's Supplies" },
      { key: "calligrapher", label: "Calligrapher's Supplies" },
      { key: "carpenter", label: "Carpenter's Tools" },
      { key: "cartographer", label: "Cartographer's Tools" },
      { key: "cobbler", label: "Cobbler's Tools" },
      { key: "cook", label: "Cook's Utensils" },
      { key: "disguise", label: "Disguise Kit" },
      { key: "forgery", label: "Forgery Kit" },
      { key: "gaming", label: "Gaming Set" },
      { key: "glassblower", label: "Glassblower's Tools" },
      { key: "herbalism", label: "Herbalism Kit" },
      { key: "jeweler", label: "Jeweler's Tools" },
      { key: "leatherworker", label: "Leatherworker's Tools" },
      { key: "mason", label: "Mason's Tools" },
      { key: "musical", label: "Musical Instrument" },
      { key: "navigator", label: "Navigator's Tools" },
      { key: "painter", label: "Painter's Supplies" },
      { key: "poisoner", label: "Poisoner's Kit" },
      { key: "potter", label: "Potter's Tools" },
      { key: "smith", label: "Smith's Tools" },
      { key: "thieves", label: "Thieves' Tools" },
      { key: "tinker", label: "Tinker's Tools" },
      { key: "weaver", label: "Weaver's Tools" },
      { key: "woodcarver", label: "Woodcarver's Tools" }
    ]},
    { optgroup: "Saving Throws", options: [
      { key: "save_str", label: "Strength Save" },
      { key: "save_dex", label: "Dexterity Save" },
      { key: "save_con", label: "Constitution Save" },
      { key: "save_int", label: "Intelligence Save" },
      { key: "save_wis", label: "Wisdom Save" },
      { key: "save_cha", label: "Charisma Save" }
    ]}
  ];

  const getLabelForKey = (key) => {
    for (const group of STANDARD_OPTIONS) {
      const match = group.options.find(o => o.key === key);
      if (match) return match.label;
    }
    if (key.startsWith("custom_")) {
      const stored = currentProfiles[key];
      const customName = stored?.name || key.replace("custom_", "").replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
      const customAbil = stored?.ability ? ` (${stored.ability.toUpperCase()})` : "";
      const catLabel = stored?.category ? ` [${CATEGORIES[stored.category] || stored.category}]` : "";
      return `${customName}${customAbil}${catLabel}`;
    }
    return key;
  };

  const buildSelectOptionsHtml = () => {
    let out = `<option value="">-- Choose D20 Test to Configure --</option>`;
    STANDARD_OPTIONS.forEach(grp => {
      out += `<optgroup label="${grp.optgroup}">`;
      grp.options.forEach(opt => {
        out += `<option value="${opt.key}">${opt.label}</option>`;
      });
      out += `</optgroup>`;
    });
    out += `<optgroup label="Custom">
      <option value="__create_custom__">+ Create New Custom D20 Test...</option>
    </optgroup>`;
    return out;
  };

  const buildSectionsHtml = () => {
    const keys = Object.keys(currentProfiles);
    if (keys.length === 0) {
      return `<div style="text-align: center; color: #888; font-size: 0.85em; padding: 20px 0;">No active modifier profiles configured yet for this token. Use the dropdown above to add one.</div>`;
    }

    return keys.map(k => {
      const displayLabel = getLabelForKey(k);
      const profileData = currentProfiles[k];
      const isCustom = k.startsWith("custom_");
      const presets = Array.isArray(profileData) ? profileData : (profileData.modifiers || []);
      const currentAbil = profileData?.ability || "int";
      const currentCat = profileData?.category || "skill";

      const customSelectorsHtml = isCustom ? `
        <select class="custom-category-select" data-key="${k}" title="Category" style="height: 22px; font-size: 0.75em; padding: 0 4px; margin-right: 4px;">
          ${Object.entries(CATEGORIES).map(([code, name]) => `<option value="${code}" ${currentCat === code ? 'selected' : ''}>${name}</option>`).join('')}
        </select>
        <select class="custom-ability-select" data-key="${k}" title="Ability Score" style="height: 22px; font-size: 0.75em; padding: 0 4px; margin-right: 6px;">
          ${Object.entries(ABILITIES).map(([code, name]) => `<option value="${code}" ${currentAbil === code ? 'selected' : ''}>${name}</option>`).join('')}
        </select>
      ` : '';

      const presetsHtml = presets.map((p, idx) => `
        <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 4px;">
          <input type="text" class="preset-label" data-key="${k}" data-idx="${idx}" value="${p.label}" placeholder="Label (e.g. Scavenger Kit)" style="flex: 2; height: 26px; font-size: 0.85em;" />
          <input type="text" class="preset-formula" data-key="${k}" data-idx="${idx}" value="${p.formula}" placeholder="Formula (e.g. 1d4, 2)" style="flex: 1.2; height: 26px; font-size: 0.85em;" />
          <label style="display: flex; align-items: center; gap: 3px; font-size: 0.8em; cursor: pointer;">
            <input type="checkbox" class="preset-default" data-key="${k}" data-idx="${idx}" ${p.enabled ? 'checked' : ''} style="margin: 0;" /> Default
          </label>
          <button type="button" class="delete-preset-btn" data-key="${k}" data-idx="${idx}" title="Delete Modifier" style="width: 26px; height: 26px; line-height: 24px; padding: 0; color: #a34848; border: 1px solid #d2d7df; background: #fff; border-radius: 3px; cursor: pointer;">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `).join('');

      return `
        <div style="border: 1px solid #d2d7df; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px; background: rgba(0,0,0,0.015);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong style="font-size: 0.88em; color: #2b3a4a;">${displayLabel}</strong>
              <button type="button" class="remove-test-btn" data-key="${k}" title="Remove Entire D20 Test Profile" style="border: none; background: none; color: #999; cursor: pointer; padding: 2px 4px; font-size: 0.8em;">
                <i class="fas fa-times-circle"></i>
              </button>
            </div>
            <div style="display: flex; align-items: center;">
              ${customSelectorsHtml}
              <button type="button" class="add-preset-btn" data-key="${k}" style="font-size: 0.78em; height: 22px; line-height: 20px; padding: 0 6px; cursor: pointer;">
                <i class="fas fa-plus"></i> Add Bonus
              </button>
            </div>
          </div>
          <div id="container-${k}">
            ${presetsHtml || '<span style="font-size: 0.8em; color: #999;">No bonuses added yet.</span>'}
          </div>
        </div>
      `;
    }).join('');
  };

  const dialogHtml = `
    <div style="max-height: 520px; overflow-y: auto; padding-right: 4px; font-family: inherit;">
      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px; background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px; padding: 6px 8px;">
        <select id="select-test-to-add" style="flex: 1; height: 28px; font-size: 0.85em;">
          ${buildSelectOptionsHtml()}
        </select>
        <button type="button" id="btn-add-test-group" style="height: 28px; padding: 0 10px; font-size: 0.85em; cursor: pointer; white-space: nowrap;">
          <i class="fas fa-plus"></i> Configure D20 Test
        </button>
      </div>

      <div id="custom-test-creator" style="display: none; flex-direction: column; gap: 6px; margin-bottom: 12px; background: #fdfaf3; border: 1px solid #d5c898; border-radius: 4px; padding: 8px 10px;">
        <span style="font-weight: 700; font-size: 0.75em; color: #6d5b1f; letter-spacing: 0.5px;">NEW CUSTOM D20 TEST</span>
        <div style="display: flex; gap: 6px; align-items: center;">
          <input type="text" id="custom-test-name" placeholder="Test Name (e.g. Scavenging)" style="flex: 1.5; min-width: 130px; height: 26px; font-size: 0.85em; padding: 2px 6px;" />
          <select id="custom-test-category" title="Roll Category" style="flex: 1; height: 26px; font-size: 0.8em; padding: 2px;">
            <option value="skill">Skill Check</option>
            <option value="tool">Tool Check</option>
            <option value="check">Ability Check</option>
          </select>
          <select id="custom-test-ability" title="Ability Score" style="width: 65px; height: 26px; font-size: 0.8em; padding: 2px;">
            ${Object.entries(ABILITIES).map(([code, name]) => `<option value="${code}">${name}</option>`).join('')}
          </select>
          <button type="button" id="btn-confirm-create-custom" style="height: 26px; padding: 0 10px; font-size: 0.82em; cursor: pointer; white-space: nowrap; font-weight: 600;">
            Add
          </button>
          <button type="button" id="btn-cancel-create-custom" style="height: 26px; padding: 0 8px; font-size: 0.82em; cursor: pointer; white-space: nowrap; color: #666;">
            Cancel
          </button>
        </div>
      </div>

      <div id="preset-editor-content">
        ${buildSectionsHtml()}
      </div>
    </div>
  `;

  let performSave = false;

  const d = new Dialog({
    title: `${actor.name}: D20 Modifier Presets`,
    content: dialogHtml,
    buttons: {
      save: {
        icon: '<i class="fas fa-save"></i>',
        label: "Save Profiles",
        callback: () => { performSave = true; }
      },
      cancel: { label: "Cancel" }
    },
    default: "save",
    render: (html) => {
      const refreshView = () => {
        html.find('#preset-editor-content').html(buildSectionsHtml());
        bindEvents();
      };

      const syncFromInputs = () => {
        Object.keys(currentProfiles).forEach(k => {
          const isCustom = k.startsWith("custom_");
          const list = [];
          html.find(`#container-${k} > div`).each((idx, el) => {
            const label = $(el).find('.preset-label').val()?.trim() || "Bonus";
            const formula = $(el).find('.preset-formula').val()?.trim() || "0";
            const enabled = $(el).find('.preset-default').is(':checked');
            list.push({ label, formula, enabled });
          });

          if (isCustom) {
            const currentObj = currentProfiles[k] || {};
            const ability = html.find(`.custom-ability-select[data-key="${k}"]`).val() || currentObj.ability || "int";
            const category = html.find(`.custom-category-select[data-key="${k}"]`).val() || currentObj.category || "skill";
            currentProfiles[k] = {
              name: currentObj.name || k.replace("custom_", ""),
              ability: ability,
              category: category,
              modifiers: list
            };
          } else {
            currentProfiles[k] = list;
          }
        });
      };

      const bindEvents = () => {
        html.find('#btn-add-test-group').off('click').on('click', () => {
          syncFromInputs();
          const chosenKey = html.find('#select-test-to-add').val();
          if (!chosenKey) return;

          if (chosenKey === '__create_custom__') {
            html.find('#custom-test-creator').css('display', 'flex');
            html.find('#custom-test-name').focus();
            return;
          }

          if (!currentProfiles[chosenKey]) {
            currentProfiles[chosenKey] = [{ label: "Bonus", formula: "1d4", enabled: true }];
          }
          refreshView();
        });

        html.find('#btn-confirm-create-custom').off('click').on('click', () => {
          syncFromInputs();
          const customName = html.find('#custom-test-name').val()?.trim();
          if (!customName) return;

          const chosenAbility = html.find('#custom-test-ability').val() || "int";
          const chosenCategory = html.find('#custom-test-category').val() || "skill";
          const customKey = "custom_" + customName.toLowerCase().replace(/[^a-z0-9]/g, "_");

          if (!currentProfiles[customKey]) {
            currentProfiles[customKey] = {
              name: customName,
              ability: chosenAbility,
              category: chosenCategory,
              modifiers: [{ label: "Kit / Gear", formula: "1d4", enabled: true }]
            };
          }
          html.find('#custom-test-name').val('');
          html.find('#custom-test-creator').hide();
          refreshView();
        });

        html.find('#btn-cancel-create-custom').off('click').on('click', () => {
          html.find('#custom-test-creator').hide();
        });

        html.find('.custom-ability-select').off('change').on('change', (e) => {
          const key = $(e.currentTarget).data('key');
          if (currentProfiles[key]) {
            currentProfiles[key].ability = $(e.currentTarget).val();
          }
        });

        html.find('.custom-category-select').off('change').on('change', (e) => {
          const key = $(e.currentTarget).data('key');
          if (currentProfiles[key]) {
            currentProfiles[key].category = $(e.currentTarget).val();
          }
        });

        html.find('.remove-test-btn').off('click').on('click', (e) => {
          syncFromInputs();
          const key = $(e.currentTarget).data('key');
          delete currentProfiles[key];
          refreshView();
        });

        html.find('.add-preset-btn').off('click').on('click', (e) => {
          syncFromInputs();
          const key = $(e.currentTarget).data('key');
          const isCustom = key.startsWith("custom_");

          if (isCustom) {
            if (!currentProfiles[key]) {
              currentProfiles[key] = { name: key.replace("custom_", ""), ability: "int", category: "skill", modifiers: [] };
            }
            currentProfiles[key].modifiers.push({ label: "Item / Feature", formula: "1d4", enabled: true });
          } else {
            if (!currentProfiles[key]) currentProfiles[key] = [];
            currentProfiles[key].push({ label: "Item / Feature", formula: "1d4", enabled: true });
          }
          refreshView();
        });

        html.find('.delete-preset-btn').off('click').on('click', (e) => {
          syncFromInputs();
          const key = $(e.currentTarget).data('key');
          const idx = Number($(e.currentTarget).data('idx'));
          const isCustom = key.startsWith("custom_");

          if (isCustom && currentProfiles[key]?.modifiers) {
            currentProfiles[key].modifiers.splice(idx, 1);
          } else if (Array.isArray(currentProfiles[key])) {
            currentProfiles[key].splice(idx, 1);
          }
          refreshView();
        });
      };

      bindEvents();
    },
    close: async (html) => {
      if (!performSave) return;

      const finalProfiles = {};
      Object.keys(currentProfiles).forEach(k => {
        const isCustom = k.startsWith("custom_");
        const list = [];
        html.find(`#container-${k} > div`).each((idx, el) => {
          const label = $(el).find('.preset-label').val()?.trim() || "";
          const formula = $(el).find('.preset-formula').val()?.trim() || "";
          const enabled = $(el).find('.preset-default').is(':checked');
          if (label && formula) {
            list.push({ label, formula, enabled });
          }
        });

        if (isCustom) {
          const ability = html.find(`.custom-ability-select[data-key="${k}"]`).val() || currentProfiles[k]?.ability || "int";
          const category = html.find(`.custom-category-select[data-key="${k}"]`).val() || currentProfiles[k]?.category || "skill";
          finalProfiles[k] = {
            name: currentProfiles[k]?.name || k.replace("custom_", ""),
            ability: ability,
            category: category,
            modifiers: list
          };
        } else if (list.length > 0) {
          finalProfiles[k] = list;
        }
      });

      await window.CustomRolls.setProfileData(actor, "d20Profiles", finalProfiles);
      await actor.unsetFlag("world", "d20Profiles");
      await actor.setFlag("world", "d20Profiles", finalProfiles);
      ui.notifications.info(`Saved D20 presets for ${actor.name} to Persistent Storage.`);
    }
  }, { width: 560, height: "auto" });

  d.render(true);
};

// --- 4.2 Unified Action Generator (Weapons & Spells) ---
window.CustomRolls.openActionGenerator = async function() {
  const token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;
  const actor = token?.actor;
  if (!actor) {
    return ui.notifications.warn("Please select your token first.");
  }

  const DAMAGE_TYPES = [
    { label: "Acid", value: "acid" },
    { label: "Bludgeoning", value: "bludgeoning" },
    { label: "Cold", value: "cold" },
    { label: "Fire", value: "fire" },
    { label: "Force", value: "force" },
    { label: "Lightning", value: "lightning" },
    { label: "Necrotic", value: "necrotic" },
    { label: "Piercing", value: "piercing" },
    { label: "Poison", value: "poison" },
    { label: "Psychic", value: "psychic" },
    { label: "Radiant", value: "radiant" },
    { label: "Slashing", value: "slashing" },
    { label: "Thunder", value: "thunder" }
  ];

  function generateDamageTypeOptions(selectedValue = "slashing") {
    return DAMAGE_TYPES.map(t => 
      `<option value="${t.value}" ${t.value === selectedValue ? 'selected' : ''}>${t.label}</option>`
    ).join('');
  }

  // --- Weapon Generator Sub-Form ---
  function openWeaponGeneratorDialog() {
    const actorWeapons = (actor.itemTypes?.weapon || []).sort((a, b) => a.name.localeCompare(b.name));
    const weaponOptionsHtml = actorWeapons.length > 0
      ? `<option value="">-- Link to an Inventory Weapon (Optional) --</option>` + actorWeapons.map(w => `<option value="${w.id}">${w.name}</option>`).join('')
      : `<option value="">-- No weapons found in inventory --</option>`;

    const DAMAGE_COMPONENT_COUNT = 10;
    let damageComponentHTML = '';
    for (let i = 1; i <= DAMAGE_COMPONENT_COUNT; i++) {
      const defaultLabel = `Extra Damage ${i}`;
      const placeholderLabel = i === 1 ? 'Sneak Attack, etc.' : 
                               i === 2 ? "Hunter's Mark / Hex" : 
                               i === 3 ? 'Divine Smite, etc.' : 
                               `Component ${i}`;

      const defaultCritChecked = i === 1 || i === 3 ? 'checked' : '';
      const defaultType = i === 3 ? 'radiant' : 'slashing';
      
      damageComponentHTML += `
        <div class="damage-component-block" style="border: 1px solid #7289DA; padding: 8px; margin-bottom: 10px; border-radius: 4px; background: #f7f9ff;">
          <h4 style="margin: 0 0 6px 0; border-bottom: 1px dashed #7289DA; padding-bottom: 3px; font-size: 0.9em; color: #2c3e50;">Component ${i}</h4>
          <div class="form-group" style="margin-bottom: 6px;">
            <label style="font-size: 0.8em; font-weight: bold; display: block;">Dice Formula:</label>
            <input type="text" name="damage${i}_formula" value="" placeholder="e.g., 2d6+5" style="width: 100%; height: 26px; font-size: 0.85em;"/>
          </div>
          <div class="form-group" style="margin-bottom: 6px;">
            <label style="font-size: 0.8em; font-weight: bold; display: block;">Label:</label>
            <input type="text" name="damage${i}_label" value="${defaultLabel}" placeholder="${placeholderLabel}" style="width: 100%; height: 26px; font-size: 0.85em;"/>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <div style="flex: 1.2;">
              <label style="font-size: 0.8em; font-weight: bold; display: block;">Type:</label>
              <select name="damage${i}_type" style="width: 100%; height: 26px; font-size: 0.85em;">
                ${generateDamageTypeOptions(defaultType)}
              </select>
            </div>
            <div style="flex: 1; display: flex; flex-direction: column; gap: 3px;">
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75em; cursor: pointer;">
                <span>Crunchy Crit</span>
                <input type="checkbox" name="damage${i}_isCrit" ${defaultCritChecked}/>
              </label>
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75em; cursor: pointer;">
                <span>Only on Crit</span>
                <input type="checkbox" name="damage${i}_onlyCrit"/>
              </label>
            </div>
          </div>
        </div>
      `;
    }

    const content = `
      <div class="generator-container" style="padding: 4px; font-family: inherit;">
        <div class="form-group" style="margin-bottom: 8px; background: rgba(114, 137, 218, 0.08); border: 1px solid rgba(114, 137, 218, 0.3); border-radius: 4px; padding: 6px;">
          <label style="font-weight: bold; display: block; font-size: 0.8em; color: #4b5d88; margin-bottom: 2px;">
            <i class="fas fa-link"></i> Link Inventory Item (for AutoAnimations):
          </label>
          <select id="sheetWeaponSelect" name="itemId" style="width: 100%; height: 28px; font-size: 0.85em; border-radius: 4px; border: 1px solid #7289da;">
            ${weaponOptionsHtml}
          </select>
        </div>

        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <div style="flex: 1;">
            <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Action Name:</label>
            <input type="text" name="macroName" value="Attack" style="width: 100%; height: 28px; font-size: 0.9em;"/>
          </div>
          <div style="flex: 1;">
            <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Chat Card Title:</label>
            <input type="text" name="chatCardTitle" value="Attack Roll" style="width: 100%; height: 28px; font-size: 0.9em;"/>
          </div>
        </div>

        <div style="border: 1px solid #ccc; border-radius: 4px; overflow: hidden; margin-bottom: 6px;">
          <div class="tabs" style="display: flex; background: #eee; border-bottom: 1px solid #ccc;">
            <button type="button" class="tab-button active" data-tab="atk-main" style="flex: 1; padding: 6px; font-weight: bold; font-size: 0.85em; cursor: pointer; border: none; border-right: 1px solid #ccc; background: #fff;">Base Attack</button>
            <button type="button" class="tab-button" data-tab="atk-extra" style="flex: 1; padding: 6px; font-weight: bold; font-size: 0.85em; cursor: pointer; border: none; border-right: 1px solid #ccc; background: #eee;">Extra Damage</button>
            <button type="button" class="tab-button" data-tab="atk-misc" style="flex: 1; padding: 6px; font-weight: bold; font-size: 0.85em; cursor: pointer; border: none; background: #eee;">Rules & Perks</button>
          </div>

          <div id="atk-main" class="tab-content" style="padding: 10px; max-height: 420px; overflow-y: auto;">
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Ability:</label>
                <select name="abilityScore" style="width: 100%; height: 28px; font-size: 0.85em;">
                  <option value="str" selected>STR</option>
                  <option value="dex">DEX</option>
                  <option value="con">CON</option>
                  <option value="int">INT</option>
                  <option value="wis">WIS</option>
                  <option value="cha">CHA</option>
                </select>
              </div>
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Damage Type:</label>
                <select name="damageType" style="width: 100%; height: 28px; font-size: 0.85em;">
                  ${generateDamageTypeOptions("slashing")}
                </select>
              </div>
            </div>

            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Dice Count:</label>
                <input type="number" name="damageDiceCount" value="1" min="0" placeholder="0 for flat damage" style="width: 100%; height: 28px; font-size: 0.85em;"/>
              </div>
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Die Size:</label>
                <select name="damageDieSize" style="width: 100%; height: 28px; font-size: 0.85em;">
                  <option value="none">None (Flat Dmg)</option>
                  <option value="d4">d4</option>
                  <option value="d6" selected>d6</option>
                  <option value="d8">d8</option>
                  <option value="d10">d10</option>
                  <option value="d12">d12</option>
                </select>
              </div>
            </div>
            <div style="margin-bottom: 8px;">
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer; padding: 4px 6px; background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px;">
                <span style="font-weight: 600; color: #4b5d88;">Proficient with Weapon (Adds PB)</span>
                <input type="checkbox" name="isProficient" checked style="margin: 0;"/>
              </label>
            </div>

            <hr style="margin: 8px 0; border-top: 1px solid #eee;">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
              <div>
                <label style="font-weight: bold; font-size: 0.8em; display: block; margin-bottom: 2px;">Weapon (+):</label>
                <input type="number" name="weaponModifier" value="0" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
              <div>
                <label style="font-weight: bold; font-size: 0.8em; display: block; margin-bottom: 2px;">Atk Mod:</label>
                <input type="number" name="attackCircumstanceModifier" value="0" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
              <div>
                <label style="font-weight: bold; font-size: 0.8em; display: block; margin-bottom: 2px;">Dmg Mod:</label>
                <input type="number" name="damageModifier" value="0" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
            </div>
          </div>

          <div id="atk-extra" class="tab-content" style="padding: 10px; max-height: 420px; overflow-y: auto; display: none;">
            ${damageComponentHTML}
          </div>

          <div id="atk-misc" class="tab-content" style="padding: 10px; max-height: 420px; overflow-y: auto; display: none;">
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Crit Threshold:</label>
                <input type="number" name="CRIT_THRESHOLD" value="20" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Extra Crit Bonus:</label>
                <input type="text" name="extraCriticalBonus" value="" placeholder="e.g. 1d6 or 5" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">GWF Reroll (≤):</label>
                <input type="number" name="GWF_REROLL_THRESHOLD" value="0" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Lucky Reroll (≤):</label>
                <input type="number" name="HALFLING_LUCKY_REROLL_THRESHOLD" value="1" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #eee; padding-top: 6px;">
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer;">
                <span>Halfling Lucky</span>
                <input type="checkbox" name="HAS_HALFLING_LUCKY"/>
              </label>
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer;">
                <span>Elven Accuracy (Super Advantage)</span>
                <input type="checkbox" name="superAdv"/>
              </label>
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer; color: #a34848; font-weight: bold;">
                <span>Allow GWM / Sharpshooter (-5 / +10)</span>
                <input type="checkbox" name="hasGWM"/>
              </label>
            </div>
          </div>
        </div>
      </div>
    `;

    new Dialog({
      title: `Generate Weapon Attack: ${actor.name}`,
      content: content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save Attack",
          callback: async (html) => {
            const root = html[0] ?? html;
            const getVal = (name) => {
              const el = root.querySelector(`[name="${name}"]`);
              return el ? el.value : "";
            };
            const getCheck = (name) => {
              const el = root.querySelector(`[name="${name}"]`);
              return el ? el.checked : false;
            };

            const macroName = getVal("macroName").trim() || "Default Attack";
            const chatCardTitle = getVal("chatCardTitle").trim() || macroName;
            const itemId = getVal("itemId") || null;
            const abilityScore = getVal("abilityScore") || "str";
            const isProficient = getCheck("isProficient");
            const damageDiceCount = parseInt(getVal("damageDiceCount")) || 0;
            const damageDieSize = getVal("damageDieSize") || "d6";
            const damageType = getVal("damageType") || "slashing";
            const weaponModifier = parseInt(getVal("weaponModifier")) || 0;
            const attackCircumstanceModifier = parseInt(getVal("attackCircumstanceModifier")) || 0;
            const damageModifier = parseInt(getVal("damageModifier")) || 0;
            const CRIT_THRESHOLD = parseInt(getVal("CRIT_THRESHOLD")) || 20;
            const extraCriticalBonus = getVal("extraCriticalBonus").trim();
            const GWF_REROLL_THRESHOLD = parseInt(getVal("GWF_REROLL_THRESHOLD")) || 0;
            const HAS_HALFLING_LUCKY = getCheck("HAS_HALFLING_LUCKY");
            const HALFLING_LUCKY_REROLL_THRESHOLD = parseInt(getVal("HALFLING_LUCKY_REROLL_THRESHOLD")) || 0;
            const superAdv = getCheck("superAdv");
            const hasGWM = getCheck("hasGWM");

            const components = [];
            for (let i = 1; i <= DAMAGE_COMPONENT_COUNT; i++) {
              const formula = getVal(`damage${i}_formula`).trim();
              if (formula) {
                components.push({
                  formula: formula,
                  label: getVal(`damage${i}_label`) || `Extra Damage ${i}`,
                  damageType: getVal(`damage${i}_type`) || "slashing",
                  isActive: true,
                  isCrit: getCheck(`damage${i}_isCrit`),
                  onlyCrit: getCheck(`damage${i}_onlyCrit`),
                  id: `extra_gen_${i}`
                });
              }
            }

            const configData = {
              itemId,
              macroName, chatCardTitle, abilityScore, isProficient, damageDiceCount, damageDieSize, damageType,
              weaponModifier, attackCircumstanceModifier, damageModifier, CRIT_THRESHOLD,
              extraCriticalBonus, GWF_REROLL_THRESHOLD, HAS_HALFLING_LUCKY,
              HALFLING_LUCKY_REROLL_THRESHOLD, superAdv, hasGWM,
              additionalDamageComponents: components
            };

            const currentAttacks = foundry.utils.deepClone(
              window.CustomRolls.getProfileData(actor, "attackConfigs") || 
              actor.getFlag("world", "attackConfigs") || {}
            );
            currentAttacks[macroName] = configData;

            await window.CustomRolls.setProfileData(actor, "attackConfigs", currentAttacks);
            await actor.unsetFlag("world", "attackConfigs");
            await actor.setFlag("world", "attackConfigs", currentAttacks);
            ui.notifications.info(`Attack "${macroName}" saved to Persistent Storage.`);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "save",
      render: (html) => {
        setTimeout(() => html.closest('.app.dialog').css({ height: "auto" }), 10);
        
        // Tab switching
        const tabs = html.find('.tab-button');
        const contents = html.find('.tab-content');
        tabs.on('click', function(e) {
          e.preventDefault();
          const targetTab = $(this).data('tab');
          tabs.css('background', '#eee').removeClass('active');
          $(this).css('background', '#fff').addClass('active');
          contents.hide();
          html.find(`#${targetTab}`).show();
        });

        // Autofill when a weapon is picked from the sheet
        html.find('#sheetWeaponSelect').on('change', function() {
          const weaponId = $(this).val();
          if (!weaponId) return;

          const item = actor.items.get(weaponId);
          if (!item) return;

          const sys = item.system || {};

          // Name autofill
          html.find('input[name="macroName"]').val(item.name);
          html.find('input[name="chatCardTitle"]').val(item.name);

          // Ability selection: Finesse/Ranged default to DEX if higher
          const isFinesse = Boolean(sys.properties?.has ? sys.properties.has("fin") : sys.properties?.fin);
          const isRanged = sys.actionType === "rwak";
          const strMod = actor.system.abilities?.str?.mod || 0;
          const dexMod = actor.system.abilities?.dex?.mod || 0;
          if (isRanged || (isFinesse && dexMod > strMod)) {
            html.find('select[name="abilityScore"]').val("dex");
          } else {
            html.find('select[name="abilityScore"]').val("str");
          }

          // Damage formula & type parsing (supports DND5e v3.x and legacy formats)
          let formula = "";
          let dmgType = "slashing";

          if (sys.damage?.base?.formula) {
            formula = sys.damage.base.formula;
            dmgType = sys.damage.base.types?.first?.() || sys.damage.base.types?.[0] || "slashing";
          } else if (sys.damage?.parts?.[0]) {
            formula = sys.damage.parts[0][0] || "";
            dmgType = sys.damage.parts[0][1] || "slashing";
          }

          const match = formula.match(/(\d*)d(\d+)/i);
          if (match) {
            html.find('input[name="damageDiceCount"]').val(parseInt(match[1]) || 1);
            html.find('select[name="damageDieSize"]').val(`d${match[2]}`);
          }

          if (dmgType) {
            html.find('select[name="damageType"]').val(dmgType.toLowerCase());
          }

          // Magical/masterwork bonus (+1, +2, etc.)
          if (typeof sys.magicalBonus === "number" && sys.magicalBonus !== 0) {
            html.find('input[name="weaponModifier"]').val(sys.magicalBonus);
          } else if (typeof sys.attackBonus === "number" && sys.attackBonus !== 0) {
            html.find('input[name="weaponModifier"]').val(sys.attackBonus);
          }

          // Proficiency check
          const isProf = sys.proficient !== undefined ? Boolean(sys.proficient) : true;
          html.find('input[name="isProficient"]').prop('checked', isProf);
        });
      }
    }, { width: 480, height: "auto" }).render(true);
  }

  // --- Spell Generator Sub-Form ---
function openSpellGeneratorDialog() {
  const actorSpells = (actor.itemTypes?.spell || []).sort((a, b) => a.name.localeCompare(b.name));
  const spellOptionsHtml = actorSpells.length > 0
    ? `<option value="">-- Select a spell to autofill fields --</option>` + actorSpells.map(s => `<option value="${s.id}">${s.name} (Lvl ${s.system.level ?? 0})</option>`).join('')
    : `<option value="">-- No spells found on sheet --</option>`;

  const content = `
    <form style="padding: 5px; font-family: inherit;">
      <div class="form-group" style="margin-bottom: 8px; background: rgba(114, 137, 218, 0.08); border: 1px solid rgba(114, 137, 218, 0.3); border-radius: 4px; padding: 6px;">
        <label style="font-weight: bold; display: block; font-size: 0.8em; color: #4b5d88; margin-bottom: 2px;">
          <i class="fas fa-file-import"></i> Import From Character Sheet:
        </label>
        <select id="sheetSpellSelect" name="itemId" style="width: 100%; height: 28px; font-size: 0.85em; border-radius: 4px; border: 1px solid #7289da;">
          ${spellOptionsHtml}
        </select>
      </div>

      <div class="form-group" style="margin-bottom: 8px;">
        <label style="font-weight: bold; display: block; font-size: 0.85em;">Spell Name:</label>
        <input type="text" name="spellName" placeholder="e.g. Scorching Ray, Fireball" style="width: 100%; height: 28px; font-size: 0.9em;" />
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
        <div class="form-group" style="margin: 0;">
          <label style="font-weight: bold; display: block; font-size: 0.85em;">Ability:</label>
          <select name="spellAbility" style="width: 100%; height: 28px; font-size: 0.85em;">
            <option value="int">INT</option>
            <option value="wis">WIS</option>
            <option value="cha" selected>CHA</option>
          </select>
        </div>
        <div class="form-group" style="margin: 0;">
          <label style="font-weight: bold; display: block; font-size: 0.85em;">Base Spell Level:</label>
          <select name="baseLevel" style="width: 100%; height: 28px; font-size: 0.85em;">
            <option value="0" selected>Cantrip (Level 0)</option>
            <option value="1">1st Level</option>
            <option value="2">2nd Level</option>
            <option value="3">3rd Level</option>
            <option value="4">4th Level</option>
            <option value="5">5th Level</option>
            <option value="6">6th Level</option>
            <option value="7">7th Level</option>
            <option value="8">8th Level</option>
            <option value="9">9th Level</option>
          </select>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 8px;">
        <label style="font-weight: bold; display: block; font-size: 0.85em;">Resolution Method:</label>
        <select name="resolutionMethod" id="resMethodSelect" style="width: 100%; height: 28px; font-size: 0.85em;">
          <option value="attack" selected>Attack Roll (d20 vs AC)</option>
          <option value="save">Saving Throw (vs Spell DC)</option>
          <option value="auto">Automatic Hit / Projectiles (Magic Missile)</option>
          <option value="heal">Healing (Hit Point Recovery)</option>
          <option value="temp_hp">Temporary HP Grant</option>
          <option value="max_hp">Max HP Increase (Aid / Heroes' Feast)</option>
          <option value="other">Other / Utility (Summary Only)</option>
        </select>
      </div>

      <div id="multiAttackOptionsGroup" style="background: rgba(114, 137, 218, 0.08); border: 1px solid rgba(114, 137, 218, 0.4); border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
        <label style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-weight: bold; font-size: 0.85em; color: #4b5d88;">Multiple Attacks / Rays?</span>
          <input type="checkbox" name="isMultiAttack" id="isMultiAttackCheck" style="margin: 0;" />
        </label>
        <div id="multiAttackDetails" style="display: none; border-top: 1px solid rgba(114, 137, 218, 0.2); padding-top: 6px; margin-top: 4px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <label style="font-size: 0.8em; font-weight: bold; display: block;">Base Attack Count:</label>
              <input type="number" name="attackCount" value="1" style="width: 100%; height: 26px; font-size: 0.85em;" />
            </div>
            <div>
              <label style="font-size: 0.8em; font-weight: bold; display: block;">Rays per Upcast Lvl:</label>
              <input type="number" name="upcastAttacks" value="0" style="width: 100%; height: 26px; font-size: 0.85em;" />
            </div>
          </div>
          <div style="margin-top: 4px;">
            <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em;">
              <span>Cantrip Scaling (Eldritch Blast)?</span>
              <input type="checkbox" name="cantripAttackScaling" style="margin: 0;" />
            </label>
          </div>
        </div>
      </div>

      <div id="saveOptionsGroup" style="display: none; background: rgba(0,0,0,0.03); border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Save Required:</label>
            <select name="saveAbility" style="width: 100%; height: 26px; font-size: 0.85em;">
              <option value="dex">DEX</option>
              <option value="con">CON</option>
              <option value="wis">WIS</option>
              <option value="str">STR</option>
              <option value="int">INT</option>
              <option value="cha">CHA</option>
            </select>
          </div>
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">On Success:</label>
            <select name="saveSuccess" style="width: 100%; height: 26px; font-size: 0.85em;">
              <option value="half">Half Damage</option>
              <option value="none">No Damage</option>
            </select>
          </div>
        </div>
      </div>

      <div id="autoOptionsGroup" style="display: none; background: rgba(0,0,0,0.03); border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Base Projectiles:</label>
            <input type="number" name="projectileCount" placeholder="3" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Per Upcast Lvl:</label>
            <input type="number" name="upcastProjectiles" placeholder="1" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
        </div>
      </div>

      <div id="healOptionsGroup" style="display: none; background: rgba(40,167,69,0.08); border: 1px solid #28a745; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
        <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em;">
          <span style="font-weight: 600;">Add Spell Mod to Total?</span>
          <input type="checkbox" name="addAbilityModToValue" id="addAbilityModToValue" style="margin: 0;" />
        </label>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
        <div>
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Casting Time:</label>
          <input type="text" name="castingTime" placeholder="1 Action" style="width: 100%; height: 26px; font-size: 0.85em;" />
        </div>
        <div>
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Range:</label>
          <input type="text" name="range" placeholder="60 ft, Touch" style="width: 100%; height: 26px; font-size: 0.85em;" />
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
        <div>
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Duration:</label>
          <input type="text" name="duration" placeholder="Instantaneous" style="width: 100%; height: 26px; font-size: 0.85em;" />
        </div>
        <div style="display: flex; align-items: flex-end;">
          <label style="display: flex; align-items: center; gap: 4px; font-size: 0.8em; cursor: pointer; color: #a34848; font-weight: bold; padding-bottom: 4px;">
            <input type="checkbox" name="concentration" style="margin: 0;" /> Concentration
          </label>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 8px; background: rgba(0,0,0,0.02); border: 1px solid #d2d7df; border-radius: 4px; padding: 6px 8px;">
        <label style="font-weight: bold; display: block; font-size: 0.8em; margin-bottom: 4px; color: #4b5d88;">Spell Components:</label>
        <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 4px;">
          <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85em; cursor: pointer;">
            <input type="checkbox" name="comp_v" checked style="margin: 0;" /> Verbal (V)
          </label>
          <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85em; cursor: pointer;">
            <input type="checkbox" name="comp_s" checked style="margin: 0;" /> Somatic (S)
          </label>
          <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85em; cursor: pointer;">
            <input type="checkbox" name="comp_m" id="comp_m_check" style="margin: 0;" /> Material (M)
          </label>
        </div>
        <div id="materialDetailsGroup" style="display: none; border-top: 1px dashed #ccc; padding-top: 6px; margin-top: 4px;">
          <label style="display: flex; align-items: center; gap: 4px; font-size: 0.8em; color: #b35900; font-weight: bold; cursor: pointer; margin-bottom: 4px;">
            <input type="checkbox" name="comp_costly" style="margin: 0;" /> Costly / Consumed Component?
          </label>
          <input type="text" name="comp_desc" placeholder="e.g. A diamond worth at least 50gp" style="width: 100%; height: 24px; font-size: 0.8em;" />
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 8px;">
        <label style="font-weight: bold; display: block; font-size: 0.8em;">Target Type:</label>
        <select name="targetType" id="targetTypeSelect" style="width: 100%; height: 26px; font-size: 0.85em;">
          <option value="self">Self</option>
          <option value="point">Point in Space</option>
          <option value="creature" selected>Creature(s)</option>
          <option value="object">Object(s)</option>
          <option value="creature_object">Creature or Object</option>
          <option value="area">Area of Effect</option>
        </select>
      </div>

      <div id="areaDetailsGroup" style="display: none; background: rgba(0,0,0,0.03); border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Shape:</label>
            <select name="areaShape" style="width: 100%; height: 26px; font-size: 0.85em;">
              <option value="cone">Cone</option>
              <option value="cube">Square / Cube</option>
              <option value="line">Line</option>
              <option value="sphere">Circle / Sphere</option>
            </select>
          </div>
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Size:</label>
            <input type="text" name="areaSize" placeholder="20 ft radius" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 8px;">
        <label style="font-weight: bold; display: block; font-size: 0.8em;">Short Summary:</label>
        <input type="text" name="summary" placeholder="Quick effect tooltip" style="width: 100%; height: 26px; font-size: 0.85em;" />
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
        <div>
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Dice (Count / Size):</label>
          <div style="display: flex; gap: 4px;">
            <input type="number" name="damageDiceCount" placeholder="0" style="width: 50%; height: 26px; font-size: 0.85em;" />
            <select name="damageDieSize" style="width: 50%; height: 26px; font-size: 0.85em;">
              <option value="d4">d4</option>
              <option value="d6" selected>d6</option>
              <option value="d8">d8</option>
              <option value="d10">d10</option>
              <option value="d12">d12</option>
            </select>
          </div>
        </div>
        <div id="damageModeGroup">
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Type Mode:</label>
          <select name="damageMode" id="damageModeSelect" style="width: 100%; height: 26px; font-size: 0.85em;">
            <option value="static" selected>Fixed</option>
            <option value="choice">Choice (On Cast)</option>
            <option value="chaos">Chaos Table</option>
          </select>
        </div>
      </div>

      <div id="fixedDamageTypeGroup" class="form-group" style="margin-bottom: 8px;">
        <label style="font-weight: bold; display: block; font-size: 0.8em;">Fixed Damage Type:</label>
        <select name="damageType" style="width: 100%; height: 26px; font-size: 0.85em;">
          ${generateDamageTypeOptions("fire")}
        </select>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
        <div>
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Extra Dice Formula:</label>
          <input type="text" name="extraDiceFormula" placeholder="e.g. 1d4" style="width: 100%; height: 26px; font-size: 0.85em;" />
        </div>
        <div>
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Upcast Dice Formula:</label>
          <input type="text" name="upcastDiceFormula" placeholder="e.g. 1d8" style="width: 100%; height: 26px; font-size: 0.85em;" />
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
        <div>
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Flat Bonus:</label>
          <input type="number" name="flatDamageBonus" placeholder="0" style="width: 100%; height: 26px; font-size: 0.85em;" />
        </div>
        <div id="explodeGroup">
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Explode Condition:</label>
          <input type="text" name="explodeCondition" placeholder="e.g. x8" style="width: 100%; height: 26px; font-size: 0.85em;" />
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 4px; border-top: 1px solid #eee; padding-top: 6px;">
        <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em;">
          <span>Cantrip Dice Scaling (Lvl 5, 11, 17)</span>
          <input type="checkbox" name="isCantripScale" style="margin: 0;" />
        </label>
        <label id="chaosJumpGroup" style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em;">
          <span>Chaos Jump on Matching d8s</span>
          <input type="checkbox" name="chaosJump" style="margin: 0;" />
        </label>
        <label id="superAdvGroup" style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em;">
          <span>Elven Accuracy (Super Advantage)</span>
          <input type="checkbox" name="superAdv" style="margin: 0;" />
        </label>
      </div>
    </form>
  `;

  new Dialog({
    title: `Generate Spell: ${actor.name}`,
    content: content,
    buttons: {
      save: {
        icon: '<i class="fas fa-save"></i>',
        label: "Save Spell",
        callback: async (html) => {
          const getVal = (name) => html.find(`[name="${name}"]`).val();
          const getCheck = (name) => html.find(`[name="${name}"]`).is(':checked');

          const spellName = getVal("spellName")?.trim() || "New Spell";
          const spellData = {
            itemId: getVal("itemId") || null,
            spellName,
            spellAbility: getVal("spellAbility"),
            baseLevel: Number(getVal("baseLevel")) || 0,
            resolutionMethod: getVal("resolutionMethod") || "attack",
            saveAbility: getVal("saveAbility") || "dex",
            saveSuccess: getVal("saveSuccess") || "half",
            isMultiAttack: getCheck("isMultiAttack"),
            attackCount: Number(getVal("attackCount")) || 1,
            upcastAttacks: Number(getVal("upcastAttacks")) || 0,
            cantripAttackScaling: getCheck("cantripAttackScaling"),
            projectileCount: Number(getVal("projectileCount")) || 3,
            upcastProjectiles: Number(getVal("upcastProjectiles")) || 1,
            addAbilityModToValue: getCheck("addAbilityModToValue"),
            castingTime: getVal("castingTime")?.trim() || "1 Action",
            range: getVal("range")?.trim() || "Touch",
            duration: getVal("duration")?.trim() || "Instantaneous",
            concentration: getCheck("concentration"),
            targetType: getVal("targetType") || "creature",
            areaShape: getVal("areaShape") || "cone",
            areaSize: getVal("areaSize")?.trim() || "",
            summary: getVal("summary")?.trim() || "",
            damageDiceCount: Number(getVal("damageDiceCount")) || 0,
            damageDieSize: getVal("damageDieSize"),
            extraDiceFormula: getVal("extraDiceFormula")?.trim() || "",
            upcastDiceFormula: getVal("upcastDiceFormula")?.trim() || "",
            damageMode: getVal("damageMode"),
            damageType: getVal("damageType") || "fire",
            flatDamageBonus: Number(getVal("flatDamageBonus")) || 0,
            explodeCondition: getVal("explodeCondition")?.trim() || "",
            chaosJump: getCheck("chaosJump"),
            attackModifier: Number(getVal("attackModifier")) || 0,
            isCantripScale: getCheck("isCantripScale"),
            superAdv: getCheck("superAdv"),
            components: {
              v: getCheck("comp_v"),
              s: getCheck("comp_s"),
              m: getCheck("comp_m"),
              costly: getCheck("comp_costly"),
              description: getVal("comp_desc")?.trim() || ""
            }
          };

          const currentSpells = foundry.utils.deepClone(
            window.CustomRolls.getProfileData(actor, "spellConfigs") || 
            actor.getFlag("world", "spellConfigs") || {}
          );
          currentSpells[spellName] = spellData;

          await window.CustomRolls.setProfileData(actor, "spellConfigs", currentSpells);
          await actor.unsetFlag("world", "spellConfigs");
          await actor.setFlag("world", "spellConfigs", currentSpells);
          ui.notifications.info(`Spell "${spellName}" saved to Persistent Storage.`);
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "save",
    render: (html) => {
      const resSelect = html.find('#resMethodSelect');
      const saveGroup = html.find('#saveOptionsGroup');
      const autoGroup = html.find('#autoOptionsGroup');
      const healGroup = html.find('#healOptionsGroup');
      const multiGroup = html.find('#multiAttackOptionsGroup');
      const isMultiCheck = html.find('#isMultiAttackCheck');
      const multiDetails = html.find('#multiAttackDetails');
      const targetTypeSelect = html.find('#targetTypeSelect');
      const areaGroup = html.find('#areaDetailsGroup');
      const damageModeSelect = html.find('#damageModeSelect');
      const fixedGroup = html.find('#fixedDamageTypeGroup');
      const compMCheck = html.find('#comp_m_check');
      const materialDetailsGroup = html.find('#materialDetailsGroup');

      function updateLayout() {
        const val = resSelect.val();
        saveGroup.toggle(val === 'save');
        autoGroup.toggle(val === 'auto');
        healGroup.toggle(['heal', 'temp_hp', 'max_hp'].includes(val));
        multiGroup.toggle(val === 'attack');
        areaGroup.toggle(targetTypeSelect.val() === 'area');
        fixedGroup.toggle(damageModeSelect.val() === 'static');
        materialDetailsGroup.toggle(compMCheck.is(':checked'));
      }

      compMCheck.on('change', () => {
        materialDetailsGroup.toggle(compMCheck.is(':checked'));
      });

      isMultiCheck.on('change', () => {
        multiDetails.toggle(isMultiCheck.is(':checked'));
      });

      targetTypeSelect.on('change', () => {
        areaGroup.toggle(targetTypeSelect.val() === 'area');
      });

      damageModeSelect.on('change', () => {
        fixedGroup.toggle(damageModeSelect.val() === 'static');
      });

      resSelect.on('change', updateLayout);

      // Autofill handler from Character Sheet selection
      html.find('#sheetSpellSelect').on('change', function() {
        const spellId = $(this).val();
        if (!spellId) return;

        const item = actor.items.get(spellId);
        if (!item) return;

        const sys = item.system || {};

        // Spell Name & Level
        html.find('input[name="spellName"]').val(item.name);
        html.find('select[name="baseLevel"]').val(String(sys.level ?? 0));

        // Spellcasting Ability
        const sheetSpellAbil = sys.ability || actor.system.attributes?.spellcasting || "int";
        html.find('select[name="spellAbility"]').val(sheetSpellAbil);

        // Casting Time, Range, Duration, Concentration
        const act = sys.activation;
        const castStr = act?.cost ? `${act.cost} ${act.type || 'Action'}` : "1 Action";
        html.find('input[name="castingTime"]').val(castStr);

        const rng = sys.range;
        const rangeStr = rng?.value ? `${rng.value} ${rng.units || 'ft'}` : (rng?.units || "Touch");
        html.find('input[name="range"]').val(rangeStr);

        const dur = sys.duration;
        const durStr = dur?.value ? `${dur.value} ${dur.units || ''}` : (dur?.units || "Instantaneous");
        html.find('input[name="duration"]').val(durStr);

        const isConc = Boolean(sys.properties?.has?.("concentration") || sys.components?.concentration);
        html.find('input[name="concentration"]').prop('checked', isConc);

        // Components Autofill
        const comps = sys.properties || sys.components || {};
        const hasV = Boolean(comps.has ? comps.has("vocal") : comps.vocal);
        const hasS = Boolean(comps.has ? comps.has("somatic") : comps.somatic);
        const hasM = Boolean(comps.has ? comps.has("material") : comps.material);
        const isCostly = Boolean(sys.materials?.cost || sys.materials?.consumed);
        const matDesc = sys.materials?.value || "";

        html.find('input[name="comp_v"]').prop('checked', hasV);
        html.find('input[name="comp_s"]').prop('checked', hasS);
        html.find('input[name="comp_m"]').prop('checked', hasM);
        html.find('input[name="comp_costly"]').prop('checked', isCostly);
        html.find('input[name="comp_desc"]').val(matDesc);

        // Target Type & Area
        const targetUnits = sys.target?.units;
        const targetType = sys.target?.type;
        if (["cone", "cube", "line", "sphere", "cylinder", "radius"].includes(targetType) || ["cone", "cube", "line", "sphere"].includes(targetUnits)) {
          targetTypeSelect.val("area");
          html.find('select[name="areaShape"]').val(targetType === "cylinder" || targetType === "radius" ? "sphere" : (targetType || "cone"));
          html.find('input[name="areaSize"]').val(sys.target?.value ? `${sys.target.value} ft` : "");
        } else if (targetType === "self" || rangeStr.toLowerCase() === "self") {
          targetTypeSelect.val("self");
        } else {
          targetTypeSelect.val("creature");
        }

        // Summary (Stripped HTML)
        const rawDesc = sys.description?.value || "";
        const cleanSummary = rawDesc.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
        html.find('input[name="summary"]').val(cleanSummary);

        // Resolution Method & Damage
        const actionType = sys.actionType;
        if (actionType === "save") {
          resSelect.val("save");
          html.find('select[name="saveAbility"]').val(sys.save?.ability || "dex");
          html.find('select[name="saveSuccess"]').val(sys.save?.scaling === "half" ? "half" : "none");
        } else if (actionType === "heal") {
          resSelect.val("heal");
        } else if (actionType === "rsak" || actionType === "msak") {
          resSelect.val("attack");
        } else if (actionType === "util" || !actionType) {
          resSelect.val("other");
        }

        // Damage Parts
        const parts = sys.damage?.parts || [];
        if (parts.length > 0) {
          const firstPart = parts[0];
          const formula = firstPart[0] || "";
          const dmgType = (firstPart[1] || "fire").toLowerCase();

          const diceMatch = formula.match(/(\d*)d(\d+)/i);
          if (diceMatch) {
            html.find('input[name="damageDiceCount"]').val(parseInt(diceMatch[1]) || 1);
            html.find('select[name="damageDieSize"]').val(`d${diceMatch[2]}`);
          }

          html.find('select[name="damageType"]').val(dmgType);
        }

        // Cantrip scaling checkbox
        if (Number(sys.level) === 0 && sys.scaling?.mode === "cantrip") {
          html.find('input[name="isCantripScale"]').prop('checked', true);
        }

        updateLayout();
      });
    }
  }, { 
    width: 440, 
    height: "auto", 
    resizable: true 
  }).render(true);
}

  // --- Initial Choice Prompt ---
  new Dialog({
    title: `Generate Action: ${actor.name}`,
    content: `
      <div style="text-align: center; padding: 10px; font-family: inherit;">
        <p style="margin: 0 0 10px 0; font-size: 0.95em; color: #333;">Choose which type of action configuration to create:</p>
      </div>
    `,
    buttons: {
      weapon: {
        icon: '<i class="fas fa-sword" style="margin-right: 6px;"></i>',
        label: "Weapon Attack",
        callback: () => openWeaponGeneratorDialog()

      },
      spell: {
        icon: '<i class="fas fa-magic" style="margin-right: 6px;"></i>',
        label: "Spell",
        callback: () => openSpellGeneratorDialog()
      },
      cancel: { label: "Cancel" }
    },
    default: "weapon"
  }, { width: 340 }).render(true);
};

// --- 4.3 Unified Action Editor & Manager (Weapons & Spells) ---
window.CustomRolls.openActionEditor = function(initialCategory = "weapons") {
  const token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;
  const actor = token?.actor;
  if (!actor) {
    return ui.notifications.warn("Please select your token first.");
  }

  let activeCategory = initialCategory;

  const DAMAGE_TYPES = [
    { label: "Acid", value: "acid" },
    { label: "Bludgeoning", value: "bludgeoning" },
    { label: "Cold", value: "cold" },
    { label: "Fire", value: "fire" },
    { label: "Force", value: "force" },
    { label: "Lightning", value: "lightning" },
    { label: "Necrotic", value: "necrotic" },
    { label: "Piercing", value: "piercing" },
    { label: "Poison", value: "poison" },
    { label: "Psychic", value: "psychic" },
    { label: "Radiant", value: "radiant" },
    { label: "Slashing", value: "slashing" },
    { label: "Thunder", value: "thunder" }
  ];

  function generateDamageTypeOptions(selectedValue = "slashing") {
    return DAMAGE_TYPES.map(t => 
      `<option value="${t.value}" ${t.value === selectedValue ? 'selected' : ''}>${t.label}</option>`
    ).join('');
  }

  function renderUnifiedManager() {
    const isWeapons = activeCategory === "weapons";
    const flagKey = isWeapons ? "attackConfigs" : "spellConfigs";

    const weaponConfigs = foundry.utils.deepClone(
      window.CustomRolls.getProfileData(actor, "attackConfigs") || 
      actor.getFlag("world", "attackConfigs") || {}
    );
    const spellConfigs = foundry.utils.deepClone(
      window.CustomRolls.getProfileData(actor, "spellConfigs") || 
      actor.getFlag("world", "spellConfigs") || {}
    );

    const weaponKeys = Object.keys(weaponConfigs);
    const spellKeys = Object.keys(spellConfigs);

    const allConfigs = isWeapons ? weaponConfigs : spellConfigs;
    const keys = isWeapons ? weaponKeys : spellKeys;

    async function saveAllData(newData) {
      await window.CustomRolls.setProfileData(actor, flagKey, newData);
      await actor.unsetFlag("world", flagKey);
      await actor.setFlag("world", flagKey, newData);
    }

    const selectOptions = keys.length > 0 
      ? keys.map(k => `<option value="${k}">${k}</option>`).join("")
      : `<option value="">-- No configured ${isWeapons ? 'weapons' : 'spells'} --</option>`;

    const content = `
      <div style="display: flex; flex-direction: column; gap: 8px; padding: 4px 2px; font-family: inherit;">
        <div style="display: flex; gap: 6px; border-bottom: 2px solid #7289da; padding-bottom: 8px;">
          <button type="button" id="tab-btn-weapon" style="flex: 1; padding: 6px; font-weight: bold; border-radius: 4px 4px 0 0; border: 1px solid #7289da; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; background: ${isWeapons ? '#7289da' : '#f0f2f5'}; color: ${isWeapons ? '#fff' : '#555'};">
            <i class="fas fa-sword"></i> Weapons (${weaponKeys.length})
          </button>
          <button type="button" id="tab-btn-spell" style="flex: 1; padding: 6px; font-weight: bold; border-radius: 4px 4px 0 0; border: 1px solid #7289da; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; background: ${!isWeapons ? '#7289da' : '#f0f2f5'}; color: ${!isWeapons ? '#fff' : '#555'};">
            <i class="fas fa-magic"></i> Spells (${spellKeys.length})
          </button>
        </div>

        <div style="background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px; padding: 8px;">
          <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 4px; color: #4b5d88;">
            Select ${isWeapons ? 'Weapon' : 'Spell'}:
          </label>
          <select id="action-choice" style="width: 100%; height: 32px; font-size: 0.9em; border-radius: 4px; border: 1px solid #7289da; padding: 2px 6px;">
            ${selectOptions}
          </select>
        </div>
      </div>
      <style>
        .action-manager-dialog .dialog-buttons {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
        }
        .action-manager-dialog .dialog-buttons button {
          height: 32px;
          margin: 0;
          font-size: 0.82em;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
      </style>
    `;

    const dlg = new Dialog({
      title: `${actor.name}: Action Editor`,
      content: content,
      buttons: {
        moveUp: {
          icon: '<i class="fas fa-arrow-up"></i>',
          label: "Move Up",
          callback: async (html) => {
            const choice = html.find("#action-choice").val();
            const idx = keys.indexOf(choice);
            if (idx > 0) {
              const temp = keys[idx - 1];
              keys[idx - 1] = keys[idx];
              keys[idx] = temp;
              const reordered = {};
              keys.forEach(k => { reordered[k] = allConfigs[k]; });
              await saveAllData(reordered);
            }
            renderUnifiedManager();
          }
        },
        moveDown: {
          icon: '<i class="fas fa-arrow-down"></i>',
          label: "Move Down",
          callback: async (html) => {
            const choice = html.find("#action-choice").val();
            const idx = keys.indexOf(choice);
            if (idx >= 0 && idx < keys.length - 1) {
              const temp = keys[idx + 1];
              keys[idx + 1] = keys[idx];
              keys[idx] = temp;
              const reordered = {};
              keys.forEach(k => { reordered[k] = allConfigs[k]; });
              await saveAllData(reordered);
            }
            renderUnifiedManager();
          }
        },
        edit: {
          icon: '<i class="fas fa-edit"></i>',
          label: "Edit",
          callback: (html) => {
            const choice = html.find("#action-choice").val();
            if (!choice) return;
            if (isWeapons) {
              openWeaponEditorDetail(choice);
            } else {
              openSpellEditorDetail(choice);
            }
          }
        },
        quickMacro: {
          icon: '<i class="fas fa-bolt" style="color: #c9510c;"></i>',
          label: "Quick Macro",
          callback: async (html) => {
            const choice = html.find("#action-choice").val();
            if (!choice) return ui.notifications.warn("Please select an action first.");

            const rawConfig = allConfigs[choice];
            if (!rawConfig) return;

            const extras = rawConfig.additionalDamageComponents || [];
            const hasGWM = Boolean(rawConfig.hasGWM);

            // Build checkboxes for extra damage sources
            let extrasCheckboxesHtml = "";
            if (extras.length > 0) {
              extrasCheckboxesHtml += `
                <div style="margin-top: 6px; border-top: 1px solid #ccc; padding-top: 6px;">
                  <span style="font-weight: 600; font-size: 0.8em; color: #4b5d88; display: block; margin-bottom: 4px;">ACTIVE EXTRA DAMAGE SOURCES:</span>
                  ${extras.map((ex, i) => `
                    <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8em; padding: 2px 4px; margin-bottom: 2px; background: rgba(0,0,0,0.02); border-radius: 3px; cursor: pointer;">
                      <span><strong>${ex.label}</strong> <small style="color: #666;">(${ex.formula})</small></span>
                      <input type="checkbox" class="qm-extra-toggle" data-index="${i}" ${ex.isActive ? 'checked' : ''} style="margin: 0;">
                    </label>
                  `).join("")}
                </div>
              `;
            }

            let gwmToggleHtml = "";
            if (hasGWM) {
              gwmToggleHtml = `
                <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8em; font-weight: bold; color: #a34848; padding: 3px 6px; background: rgba(163,72,72,0.08); border-radius: 3px; cursor: pointer; margin-top: 6px;">
                  <span>Default GWM / SS (-5 / +10)</span>
                  <input type="checkbox" id="qm-gwm-toggle" style="margin: 0;">
                </label>
              `;
            }

            const promptHtml = `
              <div style="font-family: inherit; padding: 4px;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 3px;">Macro Name:</label>
                <input type="text" id="qm-name-input" value="${actor.name}: ${choice}" style="width: 100%; height: 28px; font-size: 0.9em; margin-bottom: 6px;" />
                ${gwmToggleHtml}
                ${extrasCheckboxesHtml}
              </div>
            `;

            new Dialog({
              title: `Configure Quick Macro: ${choice}`,
              content: promptHtml,
              buttons: {
                create: {
                  icon: '<i class="fas fa-check"></i>',
                  label: "Create Macro",
                  callback: async (promptModal) => {
                    const finalMacroName = promptModal.find("#qm-name-input").val().trim();
                    if (!finalMacroName) return ui.notifications.warn("Macro name cannot be blank.");

                    // Generate a safe unique key for actor profile storage
                    const profileKey = `${actor.id}_${finalMacroName}`.replace(/[^a-zA-Z0-9_-]/g, "_");

                    // Clone config and apply user toggle preferences
                    const targetData = foundry.utils.deepClone(rawConfig);

                    if (hasGWM && promptModal.find("#qm-gwm-toggle").is(":checked")) {
                      targetData.attackCircumstanceModifier = (Number(targetData.attackCircumstanceModifier) || 0) - 5;
                      targetData.damageModifier = (Number(targetData.damageModifier) || 0) + 10;
                      targetData.chatCardTitle = `${targetData.chatCardTitle || choice} [GWM/SS]`;
                    }

                    if (targetData.additionalDamageComponents) {
                      promptModal.find(".qm-extra-toggle").each(function() {
                        const idx = $(this).data("index");
                        if (targetData.additionalDamageComponents[idx]) {
                          targetData.additionalDamageComponents[idx].isActive = $(this).is(":checked");
                        }
                      });
                    }

                    // Save to persistent profile storage
                    const quickProfiles = foundry.utils.deepClone(
                      window.CustomRolls.getProfileData(actor, "quickMacroProfiles") || {}
                    );
                    quickProfiles[profileKey] = targetData;
                    await window.CustomRolls.setProfileData(actor, "quickMacroProfiles", quickProfiles);

                    // Build the executable hotbar macro script
                    const handlerName = isWeapons ? "runAttackRoll" : "runSpellAttackRoll";
                    const scriptCommand = `
const token = canvas.tokens.controlled[0] || canvas.tokens.hover;
const actor = token?.actor;
if (!actor) return ui.notifications.warn("Select your token first.");
if (!globalThis.attackSocket) return ui.notifications.error("SocketLib handler is not initialized.");

const profiles = window.CustomRolls?.getProfileData(actor, "quickMacroProfiles") || {};
const config = profiles["${profileKey}"];
if (!config) return ui.notifications.error("Stored profile not found for ${finalMacroName}.");

await globalThis.attackSocket.executeAsGM("${handlerName}", config, actor.id, game.user.id);
`.trim();

                    let existingMacro = game.macros.find(m => m.name === finalMacroName);
                    if (existingMacro) {
                      await existingMacro.update({ command: scriptCommand });
                      ui.notifications.info(`Updated existing macro: "${finalMacroName}".`);
                    } else {
                      await Macro.create({
                      name: finalMacroName,
                      type: "script",
                      img: activeCategory === "weapons" ? "icons/skills/melee/strike-sword-blood-red.webp" : "icons/magic/symbols/runes-star-pentagon-orange.webp",
                      command: scriptCommand,
                      ownership: {
                        default: 0,
                        [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
                      }
                    });
                      ui.notifications.info(`Created Quick Macro: "${finalMacroName}".`);
                    }
                  }
                },
                cancel: { label: "Cancel" }
              },
              default: "create"
            }, { width: 340, height: "auto" }).render(true);
          }
        },
        delete: {
          icon: '<i class="fas fa-trash" style="color: #a33;"></i>',
          label: "Delete",
          callback: async (html) => {
            const choice = html.find("#action-choice").val();
            if (!choice) return;
            delete allConfigs[choice];
            await saveAllData(allConfigs);
            ui.notifications.warn(`Deleted "${choice}" from Persistent Storage.`);
            renderUnifiedManager();
          }
        },
        close: {
          icon: '<i class="fas fa-times"></i>',
          label: "Close"
        }
      },
      default: "edit",
      render: (html) => {
        html.find('#tab-btn-weapon').on('click', () => {
          if (activeCategory !== "weapons") {
            activeCategory = "weapons";
            dlg.close();
            renderUnifiedManager();
          }
        });
        html.find('#tab-btn-spell').on('click', () => {
          if (activeCategory !== "spells") {
            activeCategory = "spells";
            dlg.close();
            renderUnifiedManager();
          }
        });
      }
    }, { width: 440, classes: ["dialog", "action-manager-dialog"] });

    dlg.render(true);
  }

  // --- Weapon Detail Form (Full Generator UI) ---
  function openWeaponEditorDetail(name) {
    const attacks = foundry.utils.deepClone(
      window.CustomRolls.getProfileData(actor, "attackConfigs") || 
      actor.getFlag("world", "attackConfigs") || {}
    );
    const item = attacks[name] || {};
    const existingComponents = item.additionalDamageComponents || [];

    const DAMAGE_COMPONENT_COUNT = 10;
    let damageComponentHTML = '';
    for (let i = 1; i <= DAMAGE_COMPONENT_COUNT; i++) {
      const comp = existingComponents[i - 1] || {};
      const formulaVal = comp.formula ?? "";
      const defaultLabel = `Extra Damage ${i}`;
      const labelVal = comp.label ?? defaultLabel;
      const placeholderLabel = i === 1 ? 'Sneak Attack, etc.' : 
                               i === 2 ? "Hunter's Mark / Hex" : 
                               i === 3 ? 'Divine Smite, etc.' : 
                               `Component ${i}`;

      const isCritChecked = comp.isCrit !== undefined ? (comp.isCrit ? 'checked' : '') : (i === 1 || i === 3 ? 'checked' : '');
      const onlyCritChecked = comp.onlyCrit ? 'checked' : '';
      const typeVal = comp.damageType || (i === 3 ? 'radiant' : 'slashing');
      
      damageComponentHTML += `
        <div class="damage-component-block" style="border: 1px solid #7289DA; padding: 8px; margin-bottom: 10px; border-radius: 4px; background: #f7f9ff;">
          <h4 style="margin: 0 0 6px 0; border-bottom: 1px dashed #7289DA; padding-bottom: 3px; font-size: 0.9em; color: #2c3e50;">Component ${i}</h4>
          <div class="form-group" style="margin-bottom: 6px;">
            <label style="font-size: 0.8em; font-weight: bold; display: block;">Dice Formula:</label>
            <input type="text" name="damage${i}_formula" value="${formulaVal}" placeholder="e.g., 2d6+5" style="width: 100%; height: 26px; font-size: 0.85em;"/>
          </div>
          <div class="form-group" style="margin-bottom: 6px;">
            <label style="font-size: 0.8em; font-weight: bold; display: block;">Label:</label>
            <input type="text" name="damage${i}_label" value="${labelVal}" placeholder="${placeholderLabel}" style="width: 100%; height: 26px; font-size: 0.85em;"/>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <div style="flex: 1.2;">
              <label style="font-size: 0.8em; font-weight: bold; display: block;">Type:</label>
              <select name="damage${i}_type" style="width: 100%; height: 26px; font-size: 0.85em;">
                ${generateDamageTypeOptions(typeVal)}
              </select>
            </div>
            <div style="flex: 1; display: flex; flex-direction: column; gap: 3px;">
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75em; cursor: pointer;">
                <span>Crunchy Crit</span>
                <input type="checkbox" name="damage${i}_isCrit" ${isCritChecked}/>
              </label>
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75em; cursor: pointer;">
                <span>Only on Crit</span>
                <input type="checkbox" name="damage${i}_onlyCrit" ${onlyCritChecked}/>
              </label>
            </div>
          </div>
        </div>
      `;
    }

    const curDieSize = String(item.damageDieSize || "6").replace(/^d/i, "");
    const curAbility = item.abilityScore || "str";

    const content = `
      <form class="generator-form" style="padding: 4px; font-family: inherit;">
        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <div style="flex: 1;">
            <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Action Name:</label>
            <input type="text" name="macroName" value="${item.macroName ?? name}" style="width: 100%; height: 28px; font-size: 0.9em;"/>
          </div>
          <div style="flex: 1;">
            <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Chat Card Title:</label>
            <input type="text" name="chatCardTitle" value="${item.chatCardTitle ?? name}" style="width: 100%; height: 28px; font-size: 0.9em;"/>
          </div>
        </div>

        <div style="border: 1px solid #ccc; border-radius: 4px; overflow: hidden; margin-bottom: 6px;">
          <div class="tabs" style="display: flex; background: #eee; border-bottom: 1px solid #ccc;">
            <button type="button" class="tab-button active" data-tab="atk-main" style="flex: 1; padding: 6px; font-weight: bold; font-size: 0.85em; cursor: pointer; border: none; border-right: 1px solid #ccc; background: #fff;">Base Attack</button>
            <button type="button" class="tab-button" data-tab="atk-extra" style="flex: 1; padding: 6px; font-weight: bold; font-size: 0.85em; cursor: pointer; border: none; border-right: 1px solid #ccc; background: #eee;">Extra Damage</button>
            <button type="button" class="tab-button" data-tab="atk-misc" style="flex: 1; padding: 6px; font-weight: bold; font-size: 0.85em; cursor: pointer; border: none; background: #eee;">Rules & Perks</button>
          </div>

          <div id="atk-main" class="tab-content" style="padding: 10px; max-height: 420px; overflow-y: auto;">
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Ability:</label>
                <select name="abilityScore" style="width: 100%; height: 28px; font-size: 0.85em;">
                  <option value="str" ${curAbility === 'str' ? 'selected' : ''}>STR</option>
                  <option value="dex" ${curAbility === 'dex' ? 'selected' : ''}>DEX</option>
                  <option value="con" ${curAbility === 'con' ? 'selected' : ''}>CON</option>
                  <option value="int" ${curAbility === 'int' ? 'selected' : ''}>INT</option>
                  <option value="wis" ${curAbility === 'wis' ? 'selected' : ''}>WIS</option>
                  <option value="cha" ${curAbility === 'cha' ? 'selected' : ''}>CHA</option>
                </select>
              </div>
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Damage Type:</label>
                <select name="damageType" style="width: 100%; height: 28px; font-size: 0.85em;">
                  ${generateDamageTypeOptions(item.damageType || "slashing")}
                </select>
              </div>
            </div>

            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Dice Count:</label>
                <input type="number" name="damageDiceCount" value="${item.damageDiceCount ?? 0}" min="0" placeholder="0 for flat damage" style="width: 100%; height: 28px; font-size: 0.85em;"/>
              </div>
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Die Size:</label>
                <select name="damageDieSize" style="width: 100%; height: 28px; font-size: 0.85em;">
                  <option value="none" ${curDieSize === 'none' || !curDieSize ? 'selected' : ''}>None (Flat Dmg)</option>
                  <option value="d4" ${curDieSize === '4' ? 'selected' : ''}>d4</option>
                  <option value="d6" ${curDieSize === '6' ? 'selected' : ''}>d6</option>
                  <option value="d8" ${curDieSize === '8' ? 'selected' : ''}>d8</option>
                  <option value="d10" ${curDieSize === '10' ? 'selected' : ''}>d10</option>
                  <option value="d12" ${curDieSize === '12' ? 'selected' : ''}>d12</option>
                </select>
              </div>
            </div>
            <div style="margin-bottom: 8px;">
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer; padding: 4px 6px; background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px;">
                <span style="font-weight: 600; color: #4b5d88;">Proficient with Weapon (Adds PB)</span>
                <input type="checkbox" name="isProficient" ${item.isProficient !== false ? 'checked' : ''} style="margin: 0;"/>
              </label>
            </div>

            <hr style="margin: 8px 0; border-top: 1px solid #eee;">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
              <div>
                <label style="font-weight: bold; font-size: 0.8em; display: block; margin-bottom: 2px;">Weapon (+):</label>
                <input type="number" name="weaponModifier" value="${item.weaponModifier ?? 0}" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
              <div>
                <label style="font-weight: bold; font-size: 0.8em; display: block; margin-bottom: 2px;">Atk Mod:</label>
                <input type="number" name="attackCircumstanceModifier" value="${item.attackCircumstanceModifier ?? 0}" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
              <div>
                <label style="font-weight: bold; font-size: 0.8em; display: block; margin-bottom: 2px;">Dmg Mod:</label>
                <input type="number" name="damageModifier" value="${item.damageModifier ?? 0}" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
            </div>
          </div>

          <div id="atk-extra" class="tab-content" style="padding: 10px; max-height: 420px; overflow-y: auto; display: none;">
            ${damageComponentHTML}
          </div>

          <div id="atk-misc" class="tab-content" style="padding: 10px; max-height: 420px; overflow-y: auto; display: none;">
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Crit Threshold:</label>
                <input type="number" name="CRIT_THRESHOLD" value="${item.CRIT_THRESHOLD ?? 20}" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Extra Crit Bonus:</label>
                <input type="text" name="extraCriticalBonus" value="${item.extraCriticalBonus ?? ''}" placeholder="e.g. 1d6 or 5" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">GWF Reroll (≤):</label>
                <input type="number" name="GWF_REROLL_THRESHOLD" value="${item.GWF_REROLL_THRESHOLD ?? 0}" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Lucky Reroll (≤):</label>
                <input type="number" name="HALFLING_LUCKY_REROLL_THRESHOLD" value="${item.HALFLING_LUCKY_REROLL_THRESHOLD ?? 1}" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #eee; padding-top: 6px;">
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer;">
                <span>Halfling Lucky</span>
                <input type="checkbox" name="HAS_HALFLING_LUCKY" ${item.HAS_HALFLING_LUCKY ? 'checked' : ''}/>
              </label>
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer;">
                <span>Elven Accuracy (Super Advantage)</span>
                <input type="checkbox" name="superAdv" ${item.superAdv ? 'checked' : ''}/>
              </label>
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer; color: #a34848; font-weight: bold;">
                <span>Allow GWM / Sharpshooter (-5 / +10)</span>
                <input type="checkbox" name="hasGWM" ${item.hasGWM ? 'checked' : ''}/>
              </label>
            </div>
          </div>
        </div>
      </form>
    `;

    new Dialog({
      title: `Edit Weapon: ${name}`,
      content: content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save Changes",
          callback: async (html) => {
            const getVal = (n) => html.find(`[name="${n}"]`).val();
            const getCheck = (n) => html.find(`[name="${n}"]`).is(':checked');

            const newMacroName = getVal("macroName")?.trim() || name;
            const chatCardTitle = getVal("chatCardTitle")?.trim() || newMacroName;
            const abilityScore = getVal("abilityScore");
            const isProficient = getCheck("isProficient");
            const damageDiceCount = parseInt(getVal("damageDiceCount")) || 0;
            const damageDieSize = getVal("damageDieSize");
            const damageType = getVal("damageType");
            const weaponModifier = parseInt(getVal("weaponModifier")) || 0;
            const attackCircumstanceModifier = parseInt(getVal("attackCircumstanceModifier")) || 0;
            const damageModifier = parseInt(getVal("damageModifier")) || 0;
            const CRIT_THRESHOLD = parseInt(getVal("CRIT_THRESHOLD")) || 20;
            const extraCriticalBonus = getVal("extraCriticalBonus")?.trim() || "";
            const GWF_REROLL_THRESHOLD = parseInt(getVal("GWF_REROLL_THRESHOLD")) || 0;
            const HAS_HALFLING_LUCKY = getCheck("HAS_HALFLING_LUCKY");
            const HALFLING_LUCKY_REROLL_THRESHOLD = parseInt(getVal("HALFLING_LUCKY_REROLL_THRESHOLD")) || 0;
            const superAdv = getCheck("superAdv");
            const hasGWM = getCheck("hasGWM");

            const components = [];
            for (let i = 1; i <= DAMAGE_COMPONENT_COUNT; i++) {
              const formula = getVal(`damage${i}_formula`)?.trim();
              if (formula) {
                const prevActive = existingComponents[i - 1]?.isActive ?? true;
                components.push({
                  formula: formula,
                  label: getVal(`damage${i}_label`) || `Extra Damage ${i}`,
                  damageType: getVal(`damage${i}_type`) || "slashing",
                  isActive: prevActive,
                  isCrit: getCheck(`damage${i}_isCrit`),
                  onlyCrit: getCheck(`damage${i}_onlyCrit`),
                  id: existingComponents[i - 1]?.id || `extra_gen_${i}`
                });
              }
            }

            const configData = {
              macroName: newMacroName, chatCardTitle, abilityScore, isProficient, damageDiceCount, damageDieSize, damageType,
              weaponModifier, attackCircumstanceModifier, damageModifier, CRIT_THRESHOLD,
              extraCriticalBonus, GWF_REROLL_THRESHOLD, HAS_HALFLING_LUCKY,
              HALFLING_LUCKY_REROLL_THRESHOLD, superAdv, hasGWM,
              additionalDamageComponents: components
            };

            if (newMacroName !== name) {
              delete attacks[name];
            }
            attacks[newMacroName] = configData;

            await window.CustomRolls.setProfileData(actor, "attackConfigs", attacks);
            await actor.unsetFlag("world", "attackConfigs");
            await actor.setFlag("world", "attackConfigs", attacks);
            ui.notifications.info(`Updated "${newMacroName}" in Persistent Storage.`);
            renderUnifiedManager();
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "save",
      render: (html) => {
        const tabs = html.find('.tab-button');
        const contents = html.find('.tab-content');
        tabs.on('click', function() {
          const targetTab = $(this).data('tab');
          tabs.css('background', '#eee').removeClass('active');
          $(this).css('background', '#fff').addClass('active');
          contents.hide();
          html.find(`#${targetTab}`).show();
        });
      }
    }, { width: 480, height: "auto" }).render(true);
  }

  // --- Spell Detail Form (Full Generator UI) ---
  function openSpellEditorDetail(name) {
    const spells = foundry.utils.deepClone(
      window.CustomRolls.getProfileData(actor, "spellConfigs") || 
      actor.getFlag("world", "spellConfigs") || {}
    );
    const s = spells[name] || {};

    const curDieSize = String(s.damageDieSize || "d6").trim();
    const curAbility = s.spellAbility || "cha";
    const curLevel = Number(s.baseLevel) || 0;
    const curMethod = s.resolutionMethod || "attack";
    const curTarget = s.targetType || "creature";
    const curDamageMode = s.damageMode || "static";

    const content = `
      <form style="padding: 5px; font-family: inherit;">
        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-weight: bold; display: block; font-size: 0.85em;">Spell Name:</label>
          <input type="text" name="spellName" value="${s.spellName ?? name}" style="width: 100%; height: 28px; font-size: 0.9em;" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
          <div class="form-group" style="margin: 0;">
            <label style="font-weight: bold; display: block; font-size: 0.85em;">Ability:</label>
            <select name="spellAbility" style="width: 100%; height: 28px; font-size: 0.85em;">
              <option value="int" ${curAbility === 'int' ? 'selected' : ''}>INT</option>
              <option value="wis" ${curAbility === 'wis' ? 'selected' : ''}>WIS</option>
              <option value="cha" ${curAbility === 'cha' ? 'selected' : ''}>CHA</option>
            </select>
          </div>
          <div class="form-group" style="margin: 0;">
            <label style="font-weight: bold; display: block; font-size: 0.85em;">Base Spell Level:</label>
            <select name="baseLevel" style="width: 100%; height: 28px; font-size: 0.85em;">
              <option value="0" ${curLevel === 0 ? 'selected' : ''}>Cantrip (Level 0)</option>
              <option value="1" ${curLevel === 1 ? 'selected' : ''}>1st Level</option>
              <option value="2" ${curLevel === 2 ? 'selected' : ''}>2nd Level</option>
              <option value="3" ${curLevel === 3 ? 'selected' : ''}>3rd Level</option>
              <option value="4" ${curLevel === 4 ? 'selected' : ''}>4th Level</option>
              <option value="5" ${curLevel === 5 ? 'selected' : ''}>5th Level</option>
              <option value="6" ${curLevel === 6 ? 'selected' : ''}>6th Level</option>
              <option value="7" ${curLevel === 7 ? 'selected' : ''}>7th Level</option>
              <option value="8" ${curLevel === 8 ? 'selected' : ''}>8th Level</option>
              <option value="9" ${curLevel === 9 ? 'selected' : ''}>9th Level</option>
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-weight: bold; display: block; font-size: 0.85em;">Resolution Method:</label>
          <select name="resolutionMethod" id="resMethodSelect" style="width: 100%; height: 28px; font-size: 0.85em;">
            <option value="attack" ${curMethod === 'attack' ? 'selected' : ''}>Attack Roll (d20 vs AC)</option>
            <option value="save" ${curMethod === 'save' ? 'selected' : ''}>Saving Throw (vs Spell DC)</option>
            <option value="auto" ${curMethod === 'auto' ? 'selected' : ''}>Automatic Hit / Projectiles (Magic Missile)</option>
            <option value="heal" ${curMethod === 'heal' ? 'selected' : ''}>Healing (Hit Point Recovery)</option>
            <option value="temp_hp" ${curMethod === 'temp_hp' ? 'selected' : ''}>Temporary HP Grant</option>
            <option value="max_hp" ${curMethod === 'max_hp' ? 'selected' : ''}>Max HP Increase (Aid / Heroes' Feast)</option>
            <option value="other" ${curMethod === 'other' ? 'selected' : ''}>Other / Utility (Summary Only)</option>
          </select>
        </div>

        <div id="multiAttackOptionsGroup" style="background: rgba(114, 137, 218, 0.08); border: 1px solid rgba(114, 137, 218, 0.4); border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
          <label style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-weight: bold; font-size: 0.85em; color: #4b5d88;">Multiple Attacks / Rays?</span>
            <input type="checkbox" name="isMultiAttack" id="isMultiAttackCheck" ${s.isMultiAttack ? 'checked' : ''} style="margin: 0;" />
          </label>
          <div id="multiAttackDetails" style="display: ${s.isMultiAttack ? 'block' : 'none'}; border-top: 1px solid rgba(114, 137, 218, 0.2); padding-top: 6px; margin-top: 4px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <label style="font-size: 0.8em; font-weight: bold; display: block;">Base Attack Count:</label>
                <input type="number" name="attackCount" value="${s.attackCount ?? 1}" style="width: 100%; height: 26px; font-size: 0.85em;" />
              </div>
              <div>
                <label style="font-size: 0.8em; font-weight: bold; display: block;">Rays per Upcast Lvl:</label>
                <input type="number" name="upcastAttacks" value="${s.upcastAttacks ?? 0}" style="width: 100%; height: 26px; font-size: 0.85em;" />
              </div>
            </div>
            <div style="margin-top: 4px;">
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em;">
                <span>Cantrip Scaling (Eldritch Blast)?</span>
                <input type="checkbox" name="cantripAttackScaling" ${s.cantripAttackScaling ? 'checked' : ''} style="margin: 0;" />
              </label>
            </div>
          </div>
        </div>

        <div id="saveOptionsGroup" style="display: ${curMethod === 'save' ? 'block' : 'none'}; background: rgba(0,0,0,0.03); border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <label style="font-weight: bold; display: block; font-size: 0.8em;">Save Required:</label>
              <select name="saveAbility" style="width: 100%; height: 26px; font-size: 0.85em;">
                <option value="dex" ${s.saveAbility === 'dex' ? 'selected' : ''}>DEX</option>
                <option value="con" ${s.saveAbility === 'con' ? 'selected' : ''}>CON</option>
                <option value="wis" ${s.saveAbility === 'wis' ? 'selected' : ''}>WIS</option>
                <option value="str" ${s.saveAbility === 'str' ? 'selected' : ''}>STR</option>
                <option value="int" ${s.saveAbility === 'int' ? 'selected' : ''}>INT</option>
                <option value="cha" ${s.saveAbility === 'cha' ? 'selected' : ''}>CHA</option>
              </select>
            </div>
            <div>
              <label style="font-weight: bold; display: block; font-size: 0.8em;">On Success:</label>
              <select name="saveSuccess" style="width: 100%; height: 26px; font-size: 0.85em;">
                <option value="half" ${s.saveSuccess === 'half' ? 'selected' : ''}>Half Damage</option>
                <option value="none" ${s.saveSuccess === 'none' ? 'selected' : ''}>No Damage</option>
              </select>
            </div>
          </div>
        </div>

        <div id="autoOptionsGroup" style="display: ${curMethod === 'auto' ? 'block' : 'none'}; background: rgba(0,0,0,0.03); border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <label style="font-weight: bold; display: block; font-size: 0.8em;">Base Projectiles:</label>
              <input type="number" name="projectileCount" value="${s.projectileCount ?? 3}" placeholder="3" style="width: 100%; height: 26px; font-size: 0.85em;" />
            </div>
            <div>
              <label style="font-weight: bold; display: block; font-size: 0.8em;">Per Upcast Lvl:</label>
              <input type="number" name="upcastProjectiles" value="${s.upcastProjectiles ?? 1}" placeholder="1" style="width: 100%; height: 26px; font-size: 0.85em;" />
            </div>
          </div>
        </div>

        <div id="healOptionsGroup" style="display: ${['heal', 'temp_hp', 'max_hp'].includes(curMethod) ? 'block' : 'none'}; background: rgba(40,167,69,0.08); border: 1px solid #28a745; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
          <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em;">
            <span style="font-weight: 600;">Add Spell Mod to Total?</span>
            <input type="checkbox" name="addAbilityModToValue" id="addAbilityModToValue" ${s.addAbilityModToValue ? 'checked' : ''} style="margin: 0;" />
          </label>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Casting Time:</label>
            <input type="text" name="castingTime" value="${s.castingTime ?? '1 Action'}" placeholder="1 Action" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Range:</label>
            <input type="text" name="range" value="${s.range ?? 'Touch'}" placeholder="60 ft, Touch" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Duration:</label>
            <input type="text" name="duration" value="${s.duration ?? 'Instantaneous'}" placeholder="Instantaneous" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
          <div style="display: flex; align-items: flex-end;">
            <label style="display: flex; align-items: center; gap: 4px; font-size: 0.8em; cursor: pointer; color: #a34848; font-weight: bold; padding-bottom: 4px;">
              <input type="checkbox" name="concentration" ${s.concentration ? 'checked' : ''} style="margin: 0;" /> Concentration
            </label>
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Target Type:</label>
          <select name="targetType" id="targetTypeSelect" style="width: 100%; height: 26px; font-size: 0.85em;">
            <option value="self" ${curTarget === 'self' ? 'selected' : ''}>Self</option>
            <option value="point" ${curTarget === 'point' ? 'selected' : ''}>Point</option>
            <option value="creature" ${curTarget === 'creature' ? 'selected' : ''}>Creature(s)</option>
            <option value="object" ${curTarget === 'object' ? 'selected' : ''}>Object(s)</option>
            <option value="creature_object" ${curTarget === 'creature_object' ? 'selected' : ''}>Creature or Object</option>
            <option value="area" ${curTarget === 'area' ? 'selected' : ''}>Area of Effect</option>
          </select>
        </div>

        <div id="areaDetailsGroup" style="display: ${curTarget === 'area' ? 'block' : 'none'}; background: rgba(0,0,0,0.03); border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <label style="font-weight: bold; display: block; font-size: 0.8em;">Shape:</label>
              <select name="areaShape" style="width: 100%; height: 26px; font-size: 0.85em;">
                <option value="cone" ${s.areaShape === 'cone' ? 'selected' : ''}>Cone</option>
                <option value="cube" ${s.areaShape === 'cube' ? 'selected' : ''}>Square / Cube</option>
                <option value="line" ${s.areaShape === 'line' ? 'selected' : ''}>Line</option>
                <option value="sphere" ${s.areaShape === 'sphere' ? 'selected' : ''}>Circle / Sphere</option>
              </select>
            </div>
            <div>
              <label style="font-weight: bold; display: block; font-size: 0.8em;">Size:</label>
              <input type="text" name="areaSize" value="${s.areaSize ?? ''}" placeholder="20 ft radius" style="width: 100%; height: 26px; font-size: 0.85em;" />
            </div>
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Short Summary:</label>
          <input type="text" name="summary" value="${s.summary ?? ''}" placeholder="Quick effect tooltip" style="width: 100%; height: 26px; font-size: 0.85em;" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Dice (Count / Size):</label>
            <div style="display: flex; gap: 4px;">
              <input type="number" name="damageDiceCount" value="${s.damageDiceCount ?? 0}" placeholder="0" style="width: 50%; height: 26px; font-size: 0.85em;" />
              <select name="damageDieSize" style="width: 50%; height: 26px; font-size: 0.85em;">
                <option value="d4" ${curDieSize === 'd4' ? 'selected' : ''}>d4</option>
                <option value="d6" ${curDieSize === 'd6' ? 'selected' : ''}>d6</option>
                <option value="d8" ${curDieSize === 'd8' ? 'selected' : ''}>d8</option>
                <option value="d10" ${curDieSize === 'd10' ? 'selected' : ''}>d10</option>
                <option value="d12" ${curDieSize === 'd12' ? 'selected' : ''}>d12</option>
              </select>
            </div>
          </div>
          <div id="damageModeGroup">
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Type Mode:</label>
            <select name="damageMode" id="damageModeSelect" style="width: 100%; height: 26px; font-size: 0.85em;">
              <option value="static" ${curDamageMode === 'static' ? 'selected' : ''}>Fixed</option>
              <option value="choice" ${curDamageMode === 'choice' ? 'selected' : ''}>Choice (On Cast)</option>
              <option value="chaos" ${curDamageMode === 'chaos' ? 'selected' : ''}>Chaos Table</option>
            </select>
          </div>
        </div>

        <div id="fixedDamageTypeGroup" class="form-group" style="display: ${curDamageMode === 'static' ? 'block' : 'none'}; margin-bottom: 8px;">
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Fixed Damage Type:</label>
          <select name="damageType" style="width: 100%; height: 26px; font-size: 0.85em;">
            ${generateDamageTypeOptions(s.damageType || "fire")}
          </select>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Extra Dice Formula:</label>
            <input type="text" name="extraDiceFormula" value="${s.extraDiceFormula ?? ''}" placeholder="e.g. 1d4" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Upcast Dice Formula:</label>
            <input type="text" name="upcastDiceFormula" value="${s.upcastDiceFormula ?? ''}" placeholder="e.g. 1d8" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Flat Bonus:</label>
            <input type="number" name="flatDamageBonus" value="${s.flatDamageBonus ?? 0}" placeholder="0" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
          <div id="explodeGroup">
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Explode Condition:</label>
            <input type="text" name="explodeCondition" value="${s.explodeCondition ?? ''}" placeholder="e.g. x8" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px; border-top: 1px solid #eee; padding-top: 6px;">
          <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em;">
            <span>Cantrip Dice Scaling (Lvl 5, 11, 17)</span>
            <input type="checkbox" name="isCantripScale" ${s.isCantripScale ? 'checked' : ''} style="margin: 0;" />
          </label>
          <label id="chaosJumpGroup" style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em;">
            <span>Chaos Jump on Matching d8s</span>
            <input type="checkbox" name="chaosJump" ${s.chaosJump ? 'checked' : ''} style="margin: 0;" />
          </label>
          <label id="superAdvGroup" style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em;">
            <span>Elven Accuracy (Super Advantage)</span>
            <input type="checkbox" name="superAdv" ${s.superAdv ? 'checked' : ''} style="margin: 0;" />
          </label>
        </div>
      </form>
    `;

    new Dialog({
      title: `Edit Spell: ${name}`,
      content: content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save Changes",
          callback: async (html) => {
            const getVal = (n) => html.find(`[name="${n}"]`).val();
            const getCheck = (n) => html.find(`[name="${n}"]`).is(':checked');

            const newSpellName = getVal("spellName")?.trim() || name;
            const spellData = {
              spellName: newSpellName,
              spellAbility: getVal("spellAbility"),
              baseLevel: Number(getVal("baseLevel")) || 0,
              resolutionMethod: getVal("resolutionMethod") || "attack",
              saveAbility: getVal("saveAbility") || "dex",
              saveSuccess: getVal("saveSuccess") || "half",
              isMultiAttack: getCheck("isMultiAttack"),
              attackCount: Number(getVal("attackCount")) || 1,
              upcastAttacks: Number(getVal("upcastAttacks")) || 0,
              cantripAttackScaling: getCheck("cantripAttackScaling"),
              projectileCount: Number(getVal("projectileCount")) || 3,
              upcastProjectiles: Number(getVal("upcastProjectiles")) || 1,
              addAbilityModToValue: getCheck("addAbilityModToValue"),
              castingTime: getVal("castingTime")?.trim() || "1 Action",
              range: getVal("range")?.trim() || "Touch",
              duration: getVal("duration")?.trim() || "Instantaneous",
              concentration: getCheck("concentration"),
              targetType: getVal("targetType") || "creature",
              areaShape: getVal("areaShape") || "cone",
              areaSize: getVal("areaSize")?.trim() || "",
              summary: getVal("summary")?.trim() || "",
              damageDiceCount: Number(getVal("damageDiceCount")) || 0,
              damageDieSize: getVal("damageDieSize"),
              extraDiceFormula: getVal("extraDiceFormula")?.trim() || "",
              upcastDiceFormula: getVal("upcastDiceFormula")?.trim() || "",
              damageMode: getVal("damageMode"),
              damageType: getVal("damageType") || "fire",
              flatDamageBonus: Number(getVal("flatDamageBonus")) || 0,
              explodeCondition: getVal("explodeCondition")?.trim() || "",
              chaosJump: getCheck("chaosJump"),
              attackModifier: Number(getVal("attackModifier")) || 0,
              isCantripScale: getCheck("isCantripScale"),
              superAdv: getCheck("superAdv"),
              components: s.components || { v: true, s: true, m: false, costly: false, description: "" }
            };

            if (newSpellName !== name) {
              delete spells[name];
            }
            spells[newSpellName] = spellData;

            await window.CustomRolls.setProfileData(actor, "spellConfigs", spells);
            await actor.unsetFlag("world", "spellConfigs");
            await actor.setFlag("world", "spellConfigs", spells);
            ui.notifications.info(`Updated "${newSpellName}" in Persistent Storage.`);
            renderUnifiedManager();
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "save",
      render: (html) => {
        const resSelect = html.find('#resMethodSelect');
        const saveGroup = html.find('#saveOptionsGroup');
        const autoGroup = html.find('#autoOptionsGroup');
        const healGroup = html.find('#healOptionsGroup');
        const multiGroup = html.find('#multiAttackOptionsGroup');
        const isMultiCheck = html.find('#isMultiAttackCheck');
        const multiDetails = html.find('#multiAttackDetails');
        const targetTypeSelect = html.find('#targetTypeSelect');
        const areaGroup = html.find('#areaDetailsGroup');
        const damageModeSelect = html.find('#damageModeSelect');
        const fixedGroup = html.find('#fixedDamageTypeGroup');

        isMultiCheck.on('change', () => {
          multiDetails.toggle(isMultiCheck.is(':checked'));
        });

        targetTypeSelect.on('change', () => {
          areaGroup.toggle(targetTypeSelect.val() === 'area');
        });

        damageModeSelect.on('change', () => {
          fixedGroup.toggle(damageModeSelect.val() === 'static');
        });

        resSelect.on('change', () => {
          const val = resSelect.val();
          saveGroup.toggle(val === 'save');
          autoGroup.toggle(val === 'auto');
          healGroup.toggle(['heal', 'temp_hp', 'max_hp'].includes(val));
          multiGroup.toggle(val === 'attack');
        });
      }
    }, { 
      width: 440, 
      height: "auto", 
      resizable: true 
    }).render(true);
};

  renderUnifiedManager();
  };
