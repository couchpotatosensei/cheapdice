// =============================================================================
// Region Behavior: Auto-Confirm Change Level & Force Relative Elevation 0
// =============================================================================

export function initElevation() {
  CONFIG.Token.movement.defaultSpeed = 14;

  setupChangeLevelBypass();

  Hooks.once("ready", () => {
    if (!game.user.isGM && game.settings.get("cheapdice", "featureElevationControl")) {
      const originalMoveMany = canvas.tokens.constructor.prototype.moveMany;
      canvas.tokens.constructor.prototype.moveMany = function (options = {}) {
        if (options.dz) options.dz = 0;
        if (!options.dx && !options.dy && !options.dz) return false;
        return originalMoveMany.call(this, options);
      };
    }
  });
}

function setupChangeLevelBypass() {
  // 1. Intercept DialogV2.confirm to auto-approve RegionBehavior level transitions
  if (foundry.applications?.api?.DialogV2?.confirm) {
    if (foundry.applications.api.DialogV2.confirm._changeLevelPatched) return;

    const originalConfirm = foundry.applications.api.DialogV2.confirm;

    foundry.applications.api.DialogV2.confirm = async function (options = {}) {
      const dialogId = options.id ?? "";
      const isRegionBehaviorPrompt = dialogId.startsWith("dialog-Scene.") && dialogId.includes(".RegionBehavior.");

      if (isRegionBehaviorPrompt) {
        // Construct mock DOM elements pre-populated with options content
        const mockForm = document.createElement("form");
        if (options.content instanceof HTMLElement) {
          mockForm.appendChild(options.content.cloneNode(true));
        } else if (typeof options.content === "string") {
          mockForm.innerHTML = options.content;
        }

        const mockButton = document.createElement("button");
        mockButton.type = "button";
        mockButton.dataset.action = options.yes?.action ?? "yes";
        mockForm.appendChild(mockButton);

        const mockEvent = new CustomEvent("click", { bubbles: true, cancelable: true });

        let callbackResult;
        if (typeof options.yes?.callback === "function") {
          try {
            callbackResult = await options.yes.callback.call(this, mockEvent, mockButton, mockForm);
          } catch (err) {
            console.error("Error executing DialogV2 affirmative callback:", err);
          }
        } else if (typeof options.callback === "function") {
          try {
            callbackResult = await options.callback.call(this, "yes", mockButton, mockForm);
          } catch (err) {
            console.error("Error executing DialogV2 root callback:", err);
          }
        }

        return callbackResult !== undefined ? callbackResult : (options.yes?.action ?? true);
      }

      return originalConfirm.apply(this, arguments);
    };

    foundry.applications.api.DialogV2.confirm._changeLevelPatched = true;
  }

  // 2. Lock Relative Elevation to 0 only when changing levels actively
  Hooks.on("preUpdateToken", (tokenDoc, changes, options) => {
    const destinationLevelId = changes["flags.core.level"];

    if (destinationLevelId && changes.elevation !== undefined) {
      const level = canvas.scene?.levels?.get(destinationLevelId);
      if (level) {
        changes.elevation = level.elevation?.bottom ?? level.bottom ?? 0;
      }
    }
  });
}

/**
 * Sets elevation for the triggering token in a Region Behavior script,
 * or for the currently controlled tokens if run manually outside a region event.
 *
 * @param {object} [event] - The RegionEvent passed to Execute Script behavior (optional)
 * @param {number} [targetElevation=0] - The elevation to set
 */
export async function setRegionElevation(event, targetElevation = 0) {
  const elev = Number(targetElevation ?? 0);
  const rawDoc = event?.data?.token ?? canvas.tokens.controlled[0]?.document;
  const tokenDoc = rawDoc ? (canvas.scene?.tokens?.get(rawDoc.id) ?? rawDoc) : null;

  // If scene has Levels, locate matching level
  const levels = canvas.scene?.levels;
  let matchingLevelId = null;
  if (levels?.size) {
    for (const level of levels.values()) {
      const bottom = Number(level.elevation?.bottom ?? level.bottom ?? 0);
      const top = Number(level.elevation?.top ?? level.top ?? Infinity);
      if (elev >= bottom && elev < top) {
        matchingLevelId = level.id;
        break;
      }
    }
  }

  const buildUpdateData = (doc) => {
    const data = { elevation: elev };
    if (matchingLevelId && doc.flags?.core?.level !== matchingLevelId) {
      data["flags.core.level"] = matchingLevelId;
    }
    return data;
  };

  if (tokenDoc) {
    if (Number(tokenDoc.elevation) !== elev || (matchingLevelId && tokenDoc.flags?.core?.level !== matchingLevelId)) {
      await tokenDoc.update(buildUpdateData(tokenDoc), { animate: false });
    }
    return;
  }

  const selectedTokens = canvas.tokens.controlled;
  if (!selectedTokens.length) {
    ui.notifications.warn("Please select at least one token.");
    return;
  }

  const updates = selectedTokens
    .map(t => {
      const doc = canvas.scene?.tokens?.get(t.id) ?? t.document;
      const data = buildUpdateData(doc);
      return { _id: t.id, ...data, prev: Number(doc.elevation) };
    })
    .filter(u => u.prev !== u.elevation)
    .map(u => {
      const { prev, ...clean } = u;
      return clean;
    });

  if (updates.length) {
    await canvas.scene.updateEmbeddedDocuments("Token", updates, { animate: false });
  }
}

globalThis.setRegionElevation = setRegionElevation;