import { renderTokenAcBadge, getGlobalShowAC } from "./token-ac.js";

export function initTokenHud() {
  if (!game.settings.get("cheapdice", "featureTokenHud")) return;

  // Allow players with LIMITED or OBSERVER permission to open TokenHUD on NPCs
  const originalCanControl = Token.prototype._canControl;
  if (typeof originalCanControl === "function") {
    Token.prototype._canControl = function (user, event) {
      if (user && !user.isGM && this.actor?.testUserPermission(user, "LIMITED")) {
        return true;
      }
      return originalCanControl.apply(this, arguments);
    };
  }

  // 3. Token HUD adjustments
  Hooks.on("renderTokenHUD", (app, html, data) => {
    if (!game.settings.get("cheapdice", "featureTokenHud")) return;
    const root = html instanceof HTMLElement ? html : (html[0] ?? html);
    if (!root) return;

    const token = canvas.tokens.get(data?._id ?? app.object?.id);
    if (!token?.actor) return;

    // Shared Button Factory helper
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

    // Condition Submenu Styling (GM + Player)
    const statusPalette = root.querySelector(".status-effects");
    if (statusPalette) {
      statusPalette.style.background = "rgba(0, 0, 0, 0.85)";
      statusPalette.style.border = "1px solid #7a7971";
      statusPalette.style.borderRadius = "5px";
      statusPalette.style.height = "auto";
      statusPalette.style.maxHeight = "400px";
      statusPalette.style.overflowY = "auto";
      statusPalette.style.padding = "6px";

      if (!statusPalette.querySelector(".clear-all-effects-btn")) {
        const clearBtn = document.createElement("div");
        clearBtn.className = "control-icon effect-control clear-all-effects-btn";
        clearBtn.title = "Clear All Conditions";
        clearBtn.style.display = "flex";
        clearBtn.style.alignItems = "center";
        clearBtn.style.justifyContent = "center";
        clearBtn.style.cursor = "pointer";
        clearBtn.style.border = "1px solid #7a7971";
        clearBtn.style.borderRadius = "4px";
        clearBtn.style.margin = "2px";
        clearBtn.innerHTML = '<i class="fas fa-trash-can" style="color: #e74c3c;"></i>';

        clearBtn.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const effectIds = token.actor.effects.map(e => e.id);
          if (effectIds.length > 0) {
            await token.actor.deleteEmbeddedDocuments("ActiveEffect", effectIds);
          }
        });

        statusPalette.prepend(clearBtn);
      }
    }

    // GM Specific Layout
    if (game.user.isGM) {
      const colLeft = root.querySelector(".col.left") || root.querySelector(".left");
      const colRight = root.querySelector(".col.right") || root.querySelector(".right");
      if (!colRight) return;

      // GM Cleanup: Left Column (lock button, settings cog)
      if (colLeft) {
        colLeft.querySelectorAll('.control-icon[data-action="locked"], [data-action="locked"]').forEach(el => el.remove());
        // Hide the config cog instead of removing it from the DOM, so modules (like Hide NPC Names) that anchor to it don't crash
        colLeft.querySelectorAll('.control-icon[data-action="config"], [data-action="config"]').forEach(el => {
          el.style.display = "none";
        });
      }

      // GM Cleanup: Right Column (movement palette, default target button)
      colRight.querySelectorAll('[data-palette="movementActions"], [data-action="togglePalette"][data-palette="movementActions"]').forEach(el => el.remove());
      colRight.querySelectorAll('.control-icon[data-action="target"], [data-action="target"]').forEach(el => el.remove());

      // Hide NPC Names: Let module manage its own button and logic if installed and active.
      // If the module is active and inserted its button into the HUD, make sure it is visible.
      const hnnModuleActive = Boolean(game.modules.get("hide-npc-names")?.active);
      if (hnnModuleActive) {
        const existingHnnBtn = root.querySelector('[data-action="toggleActorHidden"], .hide-npc-name-btn, [data-action="hide-npc-names"]');
        if (existingHnnBtn) {
          existingHnnBtn.style.display = "flex";
        }
      }

      // AC Toggle Button
      if (game.settings.get("cheapdice", "featureTokenAc") && !colRight.querySelector(".ac-toggle-btn")) {
        const isAcVisible = Boolean(token.document.getFlag("world", "showAC"));

        const acToggleBtn = document.createElement("div");
        acToggleBtn.className = `control-icon ac-toggle-btn ${isAcVisible ? "active" : ""}`;
        acToggleBtn.title = isAcVisible ? "AC Override: Visible (Click to Hide)" : "AC Override: Hidden (Click to Show)";
        acToggleBtn.style.display = "flex";
        acToggleBtn.style.alignItems = "center";
        acToggleBtn.style.justifyContent = "center";
        acToggleBtn.innerHTML = '<i class="fas fa-shield-halved" style="line-height: 1; margin: 0; padding: 0;"></i>';

        acToggleBtn.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();

          const newState = !token.document.getFlag("world", "showAC");
          await token.document.setFlag("world", "showAC", newState);
          renderTokenAcBadge(token);
          app.render();
        });

        colRight.appendChild(acToggleBtn);
      }

      // GM Quick Actions Flyout Button (under AC, flies right)
      if (!colRight.querySelector(".gm-flyout-parent")) {
        const flyoutWrapper = document.createElement("div");
        flyoutWrapper.className = "control-icon gm-flyout-parent";
        flyoutWrapper.title = "GM Quick Actions";
        flyoutWrapper.style.display = "flex";
        flyoutWrapper.style.alignItems = "center";
        flyoutWrapper.style.justifyContent = "center";
        flyoutWrapper.style.position = "relative";
        flyoutWrapper.innerHTML = '<i class="fas fa-ellipsis" style="line-height: 1; margin: 0; padding: 0;"></i>';

        const flyoutMenu = document.createElement("div");
        flyoutMenu.style.cssText = `
        display: none;
        position: absolute;
        left: 50px;
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

        flyoutWrapper.addEventListener("click", (e) => {
          e.stopPropagation();
          const isOpen = flyoutMenu.style.display === "flex";
          flyoutMenu.style.display = isOpen ? "none" : "flex";
        });

        // Disposition Switcher
        const dispositionConfig = {
          [-1]: { label: "Hostile", icon: "fa-solid fa-face-angry", color: "#e74c3c" },
          [0]: { label: "Neutral", icon: "fa-solid fa-face-meh", color: "#f1c40f" },
          [1]: { label: "Friendly", icon: "fa-solid fa-face-smile", color: "#2ecc71" }
        };

        const currentDisp = token.document.disposition in dispositionConfig ? token.document.disposition : 0;
        const currentMeta = dispositionConfig[currentDisp];

        const dispositionBtn = makeButton(
          `Disposition: ${currentMeta.label} (Click to Cycle)`,
          currentMeta.icon,
          async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const cycleMap = { [-1]: 0, [0]: 1, [1]: -1 };
            const nextDisp = cycleMap[token.document.disposition] ?? 0;

            await token.document.update({ disposition: nextDisp });
            app.render();
          }
        );

        const dispIcon = dispositionBtn.querySelector("i");
        if (dispIcon) dispIcon.style.color = currentMeta.color;
        flyoutMenu.appendChild(dispositionBtn);

        // Button 2: D20 Test (Updated to V2 Dialog)
        const d20Btn = makeButton(
          "Roll D20 (V2)",
          "docs/assets/fvtt.png",
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.CustomRolls?.openD20DialogV2();
          },
          "32px"
        );
        flyoutMenu.appendChild(d20Btn);

        // Button 3: D20 Modifier Editor V2
        const d20EditorV2Btn = makeButton(
          "D20 Modifier Editor (V2)",
          "fas fa-sliders",
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.CustomRolls?.openD20PresetEditorV2();
          }
        );
        flyoutMenu.appendChild(d20EditorV2Btn);

        // Button 4: Attacks
        const attacksBtn = makeButton(
          "Attacks",
          "icons/logo-scifi.png",
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.CustomRolls?.openActionDialog();
          },
          "32px"
        );
        flyoutMenu.appendChild(attacksBtn);

        // Button 5: Action Editor
        const editorBtn = makeButton(
          "Action Editor",
          "fas fa-pen-to-square",
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.CustomRolls?.openActionEditor();
          }
        );
        flyoutMenu.appendChild(editorBtn);

        flyoutWrapper.appendChild(flyoutMenu);
        colRight.appendChild(flyoutWrapper);
      }

      return;
    }

    // Player Code (Non-GM)
    const isOwner = Boolean(token.actor.isOwner);
    const hasLimited = token.actor.testUserPermission(game.user, "LIMITED");
    if (!isOwner && !hasLimited) return;

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

    root.querySelector('.control-icon[data-action="sort"]')?.remove();
    root.querySelector('.control-icon[data-action="combat"]')?.remove();

    const colLeft = root.querySelector(".col.left");
    const colRight = root.querySelector(".col.right");
    const colMiddle = root.querySelector(".col.middle");
    if (!colLeft || !colRight || !colMiddle) return;

    // LIMITED VIEW (Non-Owner with Limited/Observer permission)
    if (!isOwner) {
      // Clean up player action controls not permitted on non-owned NPC
      colLeft.innerHTML = "";
      colRight.innerHTML = "";
      colMiddle.querySelectorAll(".attribute").forEach(el => el.remove());

      // Target Button for Limited view
      const isTargeted = token.isTargeted;
      const targetBtn = makeButton(
        isTargeted ? "Untarget Token" : "Target Token",
        "fa-solid fa-crosshairs",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          token.setTarget(!token.isTargeted, { releaseOthers: false });
          app.render();
        }
      );
      if (isTargeted) targetBtn.classList.add("active");
      colRight.appendChild(targetBtn);

      // Render AC and Elevation badges in HUD top row
      renderHudBadges(token, colMiddle, false);
      return;
    }

    root.querySelector('.control-icon[data-action="target"]')?.remove();

    const d20Btn = makeButton(
      "Roll D20",
      "docs/assets/fvtt.png",
      () => {
        window.CustomRolls?.openD20DialogV2();
      },
      "32px"
    );
    colLeft.appendChild(d20Btn);

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

    // Render AC, Elevation, and Spell DC badges in HUD top row for owned tokens
    renderHudBadges(token, colMiddle, true);

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

    const actionBtn = makeButton(
      "Attacks",
      "icons/logo-scifi.png",
      () => {
        window.CustomRolls?.openActionDialog();
      },
      "32px"
    );
    colRight.appendChild(actionBtn);

    if (token.actor.type === "npc") {
      colRight.appendChild(makeButton("Slot 1", "fas fa-square-1", () => runHotbarSlot(46)));
      colRight.appendChild(makeButton("Slot 2", "fas fa-square-2", () => runHotbarSlot(47)));
      return;
    }

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

    colRight.appendChild(makeButton("Slot 1", "fas fa-square-1", () => runHotbarSlot(48)));
    colRight.appendChild(makeButton("Slot 2", "fas fa-square-2", () => runHotbarSlot(49)));
    colRight.appendChild(makeButton("Slot 3", "fas fa-square-3", () => runHotbarSlot(50)));
  });

  /**
   * Helper to render AC, Elevation, and optionally Spell DC badges in the top row of Token HUD.
   */
  function renderHudBadges(token, colMiddle, includeSpellDC = true) {
    colMiddle.querySelector(".cheapdice-hud-badges-row")?.remove();

    const row = document.createElement("div");
    row.className = "cheapdice-hud-badges-row";
    row.style.cssText = `
      position: absolute;
      top: -38px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: 6px;
      pointer-events: none;
      white-space: nowrap;
      z-index: 100;
    `;

    // Elevation badge: Blue accent, hidden if elevation === 0
    const elevationValue = Number(token.document.elevation ?? 0);
    if (elevationValue !== 0) {
      const elevBadge = document.createElement("div");
      elevBadge.className = "attribute cheapdice-hud-elev-badge";
      elevBadge.title = "Elevation";
      elevBadge.style.cssText = `
        background: rgba(0, 0, 0, 0.85);
        border: 1px solid #4a90e2;
        border-radius: 4px;
        color: #fff;
        padding: 2px 7px;
        font-size: 18px;
        font-weight: bold;
        line-height: 1.2;
        box-shadow: 0 2px 4px rgba(0,0,0,0.5);
      `;
      elevBadge.innerHTML = `<i class="fa-solid fa-arrow-up-right-dots" style="margin-right: 4px; color: #4a90e2;"></i>${elevationValue > 0 ? "+" : ""}${elevationValue}`;
      row.appendChild(elevBadge);
    }

    // AC badge: Gold accent, shown if master toggle is on AND token flag is enabled
    const masterAC = getGlobalShowAC();
    const tokenShowAC = Boolean(token.document.getFlag("world", "showAC") ?? token.document.getFlag("cheapdice", "showAC"));
    if (masterAC && tokenShowAC) {
      const acValue = String(token.actor?.system?.attributes?.ac?.value ?? token.actor?.system?.attributes?.ac ?? "--");
      const acBadge = document.createElement("div");
      acBadge.className = "attribute cheapdice-hud-ac-badge";
      acBadge.title = "Armor Class (AC)";
      acBadge.style.cssText = `
        background: rgba(0, 0, 0, 0.85);
        border: 1px solid #d4af37;
        border-radius: 4px;
        color: #fff;
        padding: 2px 7px;
        font-size: 18px;
        font-weight: bold;
        line-height: 1.2;
        box-shadow: 0 2px 4px rgba(0,0,0,0.5);
      `;
      acBadge.innerHTML = `<i class="fas fa-shield-halved" style="margin-right: 4px; color: #d4af37;"></i>${acValue}`;
      row.appendChild(acBadge);
    }

    // Spell Save DC: only for owned tokens if requested
    if (includeSpellDC) {
      const actorSystem = token.actor?.system;
      const hasSpellcasting = Boolean(actorSystem?.attributes?.spellcasting);
      const rawDC = actorSystem?.attributes?.spell?.dc ?? actorSystem?.attributes?.spelldc;
      if (hasSpellcasting && rawDC && rawDC > 0) {
        const dcBadge = document.createElement("div");
        dcBadge.className = "attribute spell-dc";
        dcBadge.title = "Spell Save DC";
        dcBadge.style.cssText = `
          background: rgba(0, 0, 0, 0.85);
          border: 1px solid #7a7971;
          border-radius: 4px;
          color: #fff;
          padding: 2px 7px;
          font-size: 18px;
          font-weight: bold;
          line-height: 1.2;
          box-shadow: 0 2px 4px rgba(0,0,0,0.5);
        `;
        dcBadge.innerHTML = `<i class="fas fa-wand-magic-sparkles" style="margin-right: 4px;"></i>${rawDC}`;
        row.appendChild(dcBadge);
      }
    }

    if (row.children.length > 0) {
      colMiddle.appendChild(row);
    }
  }
}
