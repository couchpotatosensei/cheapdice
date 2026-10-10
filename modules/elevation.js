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
  // 1. Intercept legacy Dialog rendering
  Hooks.on("renderDialog", (dialog, html) => {
    const title = dialog.data?.title?.toLowerCase() ?? "";
    const content = (typeof dialog.data?.content === "string" ? dialog.data.content : "").toLowerCase();

    if (title.includes("level") || (content.includes("level") && content.includes("move"))) {
      const confirmBtn = dialog.data.buttons?.yes ?? dialog.data.buttons?.ok;
      if (confirmBtn?.callback) {
        confirmBtn.callback();
        dialog.close();
      }
    }
  });

  // 2. Intercept modern DialogV2 / ApplicationV2 (Foundry v12+)
  Hooks.on("renderApplicationV2", (app, html) => {
    const title = app.options?.window?.title?.toLowerCase() ?? "";
    const content = (app.element?.textContent || html?.textContent || "").toLowerCase();

    if (title.includes("level") || (content.includes("level") && (content.includes("move") || content.includes("change")))) {
      const container = app.element || (html instanceof HTMLElement ? html : html?.[0]);
      const submitBtn = container?.querySelector?.("button[data-action='ok'], button[data-action='yes'], button.confirm");
      if (submitBtn) {
        submitBtn.click();
        app.close();
      }
    }
  });

  // 3. Patch Behavior DataModel if present
  const ChangeLevelBehavior = CONFIG.RegionBehavior?.dataModels?.changeLevel
    ?? foundry.data.regionBehaviors?.ChangeLevelRegionBehaviorType;

  if (ChangeLevelBehavior) {
    const methodsToPatch = ["_handleTokenMove", "_onTokenEnter", "_onBehaviorExecute", "execute"];
    for (const methodName of methodsToPatch) {
      const originalMethod = ChangeLevelBehavior.prototype[methodName];
      if (typeof originalMethod === "function") {
        ChangeLevelBehavior.prototype[methodName] = async function (event, ...args) {
          const token = event?.data?.token ?? event?.token;
          const destinationLevel = this.level;
          if (token && destinationLevel) {
            return await token.document.update({
              elevation: destinationLevel.elevation?.bottom ?? 0
            });
          }
          return originalMethod.call(this, event, ...args);
        };
      }
    }
  }
}
