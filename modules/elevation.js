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

export function initRegionLevelAutomation() {
  Hooks.once("init", () => {
    patchChangeLevelBehavior();
  });
}

function patchChangeLevelBehavior() {
  // Resolve the Change Level behavior DataModel
  const ChangeLevelType = 
    CONFIG.RegionBehavior?.dataModels?.changeLevel ??
    foundry.data.regionBehaviors?.ChangeLevelRegionBehaviorType;

  if (!ChangeLevelType) {
    console.warn("Region Level Automation: ChangeLevel DataModel not found on CONFIG.RegionBehavior.");
    return;
  }

  // Foundry Scene Regions dispatch behaviors through _handleRegionEvent or handleEvent
  const originalHandleEvent = ChangeLevelType.prototype._handleRegionEvent 
    ?? ChangeLevelType.prototype.handleEvent;

  if (!originalHandleEvent) {
    console.warn("Region Level Automation: Event handler not found on ChangeLevel prototype.");
    return;
  }

  ChangeLevelType.prototype._handleRegionEvent = async function (event) {
    // Only intercept token movement / entry events
    if (event.name !== "tokenMove" && event.name !== "tokenEnter") {
      return originalHandleEvent.call(this, event);
    }

    const token = event.data?.token;
    if (!token) return originalHandleEvent.call(this, event);

    // Resolve destination level data
    // In Foundry v12+, Scene Levels are stored on canvas.scene.levels or this.system.level
    const destinationLevelId = this.system?.level ?? this.level;
    const sceneLevels = canvas.scene?.levels;
    const destinationLevel = sceneLevels?.get ? sceneLevels.get(destinationLevelId) : destinationLevelId;

    if (!destinationLevel) {
      return originalHandleEvent.call(this, event);
    }

    // Determine target bottom elevation (forcing relative offset to 0)
    const baseElevation = destinationLevel.elevation?.bottom ?? destinationLevel.elevation ?? 0;

    // Directly update token document, bypassing any dialog calls
    const updateData = {
      elevation: baseElevation
    };

    // If Scene Levels flag is used to track token level assignments:
    if (destinationLevel.id) {
      updateData["flags.core.level"] = destinationLevel.id;
    }

    await token.document.update(updateData, { animate: false });
    return; // Complete execution without calling original handler
  };
}
