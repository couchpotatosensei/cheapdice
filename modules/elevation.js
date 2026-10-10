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
    const originalConfirm = foundry.applications.api.DialogV2.confirm;

    foundry.applications.api.DialogV2.confirm = async function (options = {}) {
      const dialogId = options.id ?? "";
      const isRegionBehaviorPrompt = dialogId.startsWith("dialog-Scene.") && dialogId.includes(".RegionBehavior.");

      if (isRegionBehaviorPrompt) {
        // 1. If a callback is defined on the affirmative button or options, execute it
        if (typeof options.yes?.callback === "function") {
          try {
            await options.yes.callback(null, null);
          } catch (err) {
            console.error("Error executing DialogV2 affirmative callback:", err);
          }
        } else if (typeof options.callback === "function") {
          try {
            await options.callback("yes");
          } catch (err) {
            console.error("Error executing DialogV2 root callback:", err);
          }
        }

        // 2. Resolve to the affirmative button action identifier (or "yes" / true)
        const affirmativeResult = options.yes?.action ?? "yes";
        return affirmativeResult;
      }

      return originalConfirm.apply(this, arguments);
    };
  }

  // 2. Lock Relative Elevation to 0 on level change updates
  Hooks.on("preUpdateToken", (tokenDoc, changes, options) => {
    // When a level transition occurs, Foundry updates token elevation and flags.core.level
    const destinationLevelId = changes["flags.core.level"] ?? tokenDoc.flags?.core?.level;

    if (destinationLevelId && changes.elevation !== undefined) {
      const level = canvas.scene?.levels?.get(destinationLevelId);
      if (level) {
        // Snap directly to the bottom floor of the destination level (relative offset = 0)
        changes.elevation = level.elevation?.bottom ?? level.bottom ?? 0;
      }
    }
  });
}