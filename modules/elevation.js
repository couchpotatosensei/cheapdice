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

  // 2. Lock Relative Elevation to 0 on level change updates
  Hooks.on("preUpdateToken", (tokenDoc, changes, options) => {
    const destinationLevelId = changes["flags.core.level"] ?? tokenDoc.flags?.core?.level;

    if (destinationLevelId && changes.elevation !== undefined) {
      const level = canvas.scene?.levels?.get(destinationLevelId);
      if (level) {
        changes.elevation = level.elevation?.bottom ?? level.bottom ?? 0;
      }
    }
  });
}