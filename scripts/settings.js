export function registerSettings() {
  const registerFeature = (key, name, hint) => {
    game.settings.register("cheapdice", key, {
      name: `[Feature] ${name}`,
      hint: hint,
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
      requiresReload: true
    });
  };

  registerFeature("featureTokenAc", "Token AC Badges & Controls", "Enables token AC canvas badges and master/per-token controls.");
  registerFeature("featureTokenHud", "Token HUD Enhancements", "Enables custom Token HUD buttons, status effect enhancements, and flyout menus.");
  registerFeature("featureElevationControl", "Elevation & Speed Controls", "Enables player elevation restrictions on token movement.");
  registerFeature("featureCustomRolls", "Custom Roll Dialogs", "Enables D20, Attack, Spell, and Action dialog launchers.");
  registerFeature("featurePresetEditors", "Preset & Action Editors", "Enables D20 preset editors and Action Builder/Generator tools.");
  registerFeature("featureSocketHandlers", "SocketLib Remote Handlers", "Enables SocketLib registration for automated combat and timer broadcasts.");
  registerFeature("featureAnimations", "Automated Animations & Sequencer", "Enables Sequencer and Automated Animations integrations.");
}
