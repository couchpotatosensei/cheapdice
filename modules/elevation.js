// =============================================================================
// Region Behavior: Auto-Accept Change Level (Bypass Dialog & Set Relative Elevation 0)
// =============================================================================

export function initElevation() {
  CONFIG.Token.movement.defaultSpeed = 14;

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

// Hook directly into init to ensure the prototype is patched before Region instances are created
Hooks.once("init", () => {
  patchChangeLevelBehavior();
});

function patchChangeLevelBehavior() {
  const ChangeLevelType = CONFIG.RegionBehavior?.dataModels?.changeLevel;
  if (!ChangeLevelType?.prototype?._handleRegionEvent) {
    console.warn("Region Level Automation: _handleRegionEvent not found on ChangeLevel prototype.");
    return;
  }

  const originalHandleRegionEvent = ChangeLevelType.prototype._handleRegionEvent;

  ChangeLevelType.prototype._handleRegionEvent = async function (event) {
    // Only intercept token movement / entry triggers
    const isMovementEvent = event.name === "tokenMove" || event.name === "tokenEnter" || event.name === "tokenPreMove";
    if (!isMovementEvent) {
      return originalHandleRegionEvent.call(this, event);
    }

    const token = event.data?.token ?? event.token;
    if (!token) {
      return originalHandleRegionEvent.call(this, event);
    }

    // Resolve target level from the behavior's system data
    const levelId = this.level ?? this.system?.level;
    const targetLevel = canvas.scene?.levels?.get(levelId);

    // If destination level cannot be found, fallback to original logic
    if (!targetLevel) {
      return originalHandleRegionEvent.call(this, event);
    }

    // Snap token directly to the base elevation of the target level (relative offset = 0)
    const baseElevation = targetLevel.elevation?.bottom ?? targetLevel.bottom ?? 0;

    const updates = {
      elevation: baseElevation
    };

    if (targetLevel.id) {
      updates["flags.core.level"] = targetLevel.id;
    }

    // Apply movement update directly to bypass the confirmation dialog
    await token.document.update(updates, { animate: false });
    return;
  };
}