export function initElevation() {
  CONFIG.Token.movement.defaultSpeed = 14;

  patchChangeLevelBehavior();

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

function patchChangeLevelBehavior() {
  const ChangeLevelBehavior = CONFIG.RegionBehavior?.dataModels?.changeLevel
    ?? foundry.data.regionBehaviors?.ChangeLevelRegionBehaviorType;

  if (!ChangeLevelBehavior) return;

  const originalHandleTokenMove = ChangeLevelBehavior.prototype._handleTokenMove;
  if (!originalHandleTokenMove) return;

  ChangeLevelBehavior.prototype._handleTokenMove = async function (event) {
    const token = event.data.token;
    if (!token) return;

    const destinationLevel = this.level;
    if (!destinationLevel) {
      return originalHandleTokenMove.call(this, event);
    }

    return await token.document.update({
      elevation: destinationLevel.elevation?.bottom ?? 0
    });
  };
}
