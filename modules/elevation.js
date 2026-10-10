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

    foundry.applications.api.DialogV2.confirm = function (options = {}) {
      const dialogId = options.id ?? "";

      // Target dialogs originating specifically from RegionBehavior prompts
      const isRegionBehaviorPrompt = dialogId.startsWith("dialog-Scene.") && dialogId.includes(".RegionBehavior.");

      if (isRegionBehaviorPrompt) {
        // Return true immediately so #confirmDialog proceeds without rendering UI
        return Promise.resolve(true);
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