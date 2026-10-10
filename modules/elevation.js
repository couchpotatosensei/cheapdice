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
  const ChangeLevelType = 
    CONFIG.RegionBehavior?.dataModels?.changeLevel ??
    CONFIG.RegionBehavior?.typeDataModels?.changeLevel ??
    foundry.data.regionBehaviors?.ChangeLevelRegionBehaviorType;

  if (!ChangeLevelType) {
    console.warn("Region Level Automation: ChangeLevel DataModel not found on CONFIG.RegionBehavior.");
    return;
  }

  // Determine which event handler exists on the prototype
  const proto = ChangeLevelType.prototype;
  const methodName = proto._handleRegionEvent 
    ? "_handleRegionEvent" 
    : (proto.handleEvent ? "handleEvent" : null);

  if (!methodName) {
    console.warn("Region Level Automation: Neither _handleRegionEvent nor handleEvent found on ChangeLevel prototype.");
    return;
  }

  const originalMethod = proto[methodName];

  proto[methodName] = async function (event) {
    // Only intercept token movement / entry events
    if (event.name !== "tokenMove" && event.name !== "tokenEnter") {
      return originalMethod.call(this, event);
    }

    const token = event.data?.token ?? event.token;
    if (!token) return originalMethod.call(this, event);

    // Resolve destination level in Foundry v14 / Scene Levels
    const destinationLevelId = this.system?.level ?? this.level;
    const sceneLevels = canvas.scene?.levels;
    const destinationLevel = sceneLevels?.get ? sceneLevels.get(destinationLevelId) : destinationLevelId;

    if (!destinationLevel || typeof destinationLevel !== "object") {
      return originalMethod.call(this, event);
    }

    // Lock relative elevation to 0 by snapping to bottom elevation
    const baseElevation = destinationLevel.elevation?.bottom ?? destinationLevel.bottom ?? destinationLevel.elevation ?? 0;

    const updateData = {
      elevation: baseElevation
    };

    if (destinationLevel.id) {
      updateData["flags.core.level"] = destinationLevel.id;
    }

    await token.document.update(updateData, { animate: false });
    return;
  };
}
