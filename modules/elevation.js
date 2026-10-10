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
  // 1. Intercept classic Dialog instances
  Hooks.on("renderDialog", (dialog, html) => {
    // Never intercept document creation/configuration forms
    if (dialog.data?.content?.includes("region-behavior") || dialog.options?.classes?.includes("sheet")) return;

    const title = (dialog.data?.title ?? "").toLowerCase();
    const content = (typeof dialog.data?.content === "string" ? dialog.data.content : "").toLowerCase();

    // Specifically target player movement confirmation prompts
    const isTransitionPrompt = 
      (title.includes("change level") || title.includes("move token")) &&
      (content.includes("move to") || content.includes("destination"));

    if (isTransitionPrompt) {
      const confirmBtn = dialog.data.buttons?.yes ?? dialog.data.buttons?.ok;
      if (confirmBtn?.callback) {
        confirmBtn.callback();
        dialog.close();
      }
    }
  });

  // 2. Intercept modern DialogV2 / ApplicationV2
  Hooks.on("renderApplicationV2", (app, html) => {
    // Guard against any configuration sheet, document editor, or behavior creator
    if (app.options?.classes?.some(c => c.includes("sheet") || c.includes("config"))) return;
    if (app.document || app.options?.document) return;

    const title = (app.options?.window?.title ?? "").toLowerCase();

    // Target only the specific runtime prompt, not "Create Behavior"
    const isTransitionPrompt = title.includes("change level") && !title.includes("create") && !title.includes("configure");

    if (isTransitionPrompt) {
      const submitBtn = html.querySelector("button[data-action='ok'], button[data-action='yes'], button.confirm");
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
