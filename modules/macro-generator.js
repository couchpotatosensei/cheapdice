// =============================================================================
// CHEAP DICE MACRO GENERATOR
// Automated upsert, folder creation, and GM hotbar configuration
// =============================================================================

import { MODULE_ID } from "../src/constants.js";

/**
 * All 14 module macros.
 */
const MODULE_MACROS = [
  {
    name: "Token Control Hotkey",
    type: "script",
    img: "icons/svg/mystery-man.svg",
    command: `const closeTilePickers = () => {
  if (foundry.applications?.instances) {
    for (const app of foundry.applications.instances.values()) {
      const isFilePicker = app instanceof foundry.applications.apps.FilePicker || app.constructor?.name === "FilePicker";
      const isTileMode = app.options?.displayMode === "tiles" || app.options?.classes?.includes("tiles");
      if (isFilePicker && isTileMode) app.close();
    }
  }
  if (ui.windows) {
    for (const app of Object.values(ui.windows)) {
      if (app instanceof FilePicker && app.options?.displayMode === "tiles") app.close();
    }
  }
};
closeTilePickers();
game.user.targets.forEach(token => token.setTarget(false, { releaseOthers: false }));
canvas.tokens.releaseAll();
canvas.tokens.activate({ tool: "select" });
ui.controls.initialize({ control: "token", tool: "select" });`
  },
  {
    name: "Token Info",
    type: "script",
    img: "icons/svg/book.svg",
    command: `game.modules.get("${MODULE_ID}")?.api?.postStatCard?.();`
  },
  {
    name: "Tile Browser",
    type: "script",
    img: "icons/svg/barrel.svg",
    command: `canvas.tiles.activate({ tool: "select" });
ui.controls.initialize({ control: "tiles", tool: "select" });
Object.values(ui.windows).forEach(app => {
  if (app instanceof FilePicker && app.options.displayMode === "tiles") app.close();
});
const picker = new FilePicker({
  type: "imagevideo",
  displayMode: "tiles",
  tileSize: canvas.grid.size,
  callback: () => canvas.tiles.activate()
});
picker.render(true);`
  },
  {
    name: "Lighting Script",
    type: "script",
    img: "icons/svg/light.svg",
    command: `const current = canvas.scene.environment?.darknessLevel ?? canvas.scene.darkness ?? 0;
new Dialog({
  title: "Adjust Scene Darkness",
  content: \`
    <form style="display:flex; flex-direction:column; gap:10px; margin-bottom:10px;">
      <label>Darkness Level (0 = Bright Day, 1 = Pitch Night):</label>
      <input type="range" id="darkness-slider" name="slider" min="0" max="1" step="0.05" value="\${current}" 
             oninput="this.nextElementSibling.value = this.value">
      <output style="text-align:center; font-weight:bold;">\${current}</output>
    </form>
  \`,
  buttons: {
    apply: {
      icon: '<i class="fas fa-sun"></i>',
      label: "Set Lighting",
      callback: async (html) => {
        const val = parseFloat(html.find("#darkness-slider").val());
        if (canvas.scene.environment?.darknessLevel !== undefined) {
          await canvas.scene.update({ "environment.darknessLevel": val });
        } else {
          await canvas.scene.update({ darkness: val });
        }
      }
    },
    cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
  },
  default: "apply"
}).render(true);`
  },
  {
    name: "Actor (Shared) Browser",
    type: "script",
    img: "icons/svg/paralysis.svg",
    command: `const pack = game.packs.find(p => p.title === "Actors (Shared)" || p.metadata.label === "Actors (Shared)");
if (!pack) ui.notifications.warn("Compendium 'Actors (Shared)' not found.");
else pack.render(true, { focus: true });`
  },
  {
    name: "Monsters (Shared) Browser",
    type: "script",
    img: "icons/svg/pawprint.svg",
    command: `const pack = game.packs.find(p => p.title === "Monsters (Shared)" || p.metadata.label === "Monsters (Shared)");
if (!pack) ui.notifications.warn("Compendium 'Monsters (Shared)' not found.");
else pack.render(true, { focus: true });`
  },
  {
    name: "Scene (Shared) Browser",
    type: "script",
    img: "icons/svg/mountain.svg",
    command: `const COMPENDIUM_ID = "forge-vtt-shared-compendiums-double-nats-updater.scene-1-scenes";
const pack = game.packs.get(COMPENDIUM_ID);
if (!pack) {
  ui.notifications.warn(\`Compendium "\${COMPENDIUM_ID}" not found. Ensure the module is enabled.\`);
} else {
  pack.render(true, { focus: true });
}`
  },
  {
    name: "Macros (Shared) Browser",
    type: "script",
    img: "icons/svg/lever.svg",
    command: `const pack = game.packs.find(p => p.title === "Macros (Shared)" || p.metadata.label === "Macros (Shared)");
if (!pack) ui.notifications.warn("Compendium 'Macros (Shared)' not found.");
else pack.render(true, { focus: true });`
  },
  {
    name: "Roll D20 (V2)",
    type: "script",
    img: "docs/assets/fvtt.png",
    command: `window.CustomRolls?.openD20DialogV2();`
  },
  {
    name: "D20 Editor V2",
    type: "script",
    img: "icons/svg/clockwork.svg",
    command: `window.CustomRolls?.openD20PresetEditorV2();`
  },
  {
    name: "Weapon/Spell List",
    type: "script",
    img: "icons/logo-scifi.png",
    command: `window.CustomRolls?.openActionDialog();`
  },
  {
    name: "Edit Attacks/Spells",
    type: "script",
    img: "icons/svg/book.svg",
    command: `window.CustomRolls?.openActionEditor();`
  },
  {
    name: "Attack Roll Generator v14",
    type: "script",
    img: "icons/tools/smithing/anvil.webp",
    command: `window.CustomRolls?.openActionGenerator();`
  },
  {
    name: "Storage Inspector",
    type: "script",
    img: "icons/commodities/tech/cog-gear-steel-glass.webp",
    command: `window.CustomRolls?.openStorageInspector?.();`
  },
  {
    name: "Set Elevation (Region/Token)",
    type: "script",
    img: "icons/svg/up.svg",
    command: `// Works inside Region Behavior scripts (using triggering token in 'event')
// or standalone by selecting one or more tokens on the canvas.
const targetElevation = 0;
await game.modules.get("${MODULE_ID}")?.api?.setRegionElevation?.(typeof event !== "undefined" ? event : undefined, targetElevation);`
  }
];

/**
 * Generates or updates world macros and maps them to the GM hotbar.
 */
export async function generateModuleMacros({ forceHotbar = false } = {}) {
  if (!game.user.isGM) return;

  const FOLDER_NAME = "Cheap Dice Macros";

  // 1. Locate or create destination folder
  let folder = game.folders.find((f) => f.name === FOLDER_NAME && f.type === "Macro");
  if (!folder) {
    folder = await Folder.create({
      name: FOLDER_NAME,
      type: "Macro",
      color: "#4a525d"
    });
  }

  // 2. Separate into batch creations and updates for high performance
  const macroMap = new Map();
  const toCreate = [];
  const toUpdate = [];

  for (const macroData of MODULE_MACROS) {
    const existing = game.macros.find(
      (m) =>
        (m.name === macroData.name && m.folder?.id === folder.id) ||
        (m.getFlag(MODULE_ID, "isGeneratedMacro") === true && m.name === macroData.name)
    );

    const payload = {
      ...macroData,
      folder: folder.id,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
      flags: { [MODULE_ID]: { isGeneratedMacro: true } }
    };

    if (existing) {
      toUpdate.push({ _id: existing.id, ...payload });
      macroMap.set(macroData.name, existing);
    } else {
      toCreate.push(payload);
    }
  }

  if (toUpdate.length > 0) {
    await Macro.updateDocuments(toUpdate);
  }

  if (toCreate.length > 0) {
    const createdDocs = await Macro.createDocuments(toCreate);
    createdDocs.forEach((doc) => macroMap.set(doc.name, doc));
  }

  // 3. Assign slots on Hotbar Page 1 and Page 2 (run once unless forced)
  const isConfigured = game.user.getFlag(MODULE_ID, "hotbarConfigured");
  if (!isConfigured || forceHotbar) {
    const hotbarSlotPlan = {
      // Hotbar Page 1
      1: "Token Control Hotkey",
      2: "Token Info",
      3: "Tile Browser",
      4: "Lighting Script",
      5: "Actor (Shared) Browser",
      6: "Monsters (Shared) Browser",
      7: "Scene (Shared) Browser",
      8: "Macros (Shared) Browser",

      // Hotbar Page 2 (Slots 11-20)
      11: "Roll D20 (V2)",
      12: "D20 Editor V2",
      13: "Weapon/Spell List",
      14: "Edit Attacks/Spells",
      15: "Attack Roll Generator v14",
      16: "Storage Inspector"
    };

    const hotbarUpdates = {};
    for (const [slot, macroName] of Object.entries(hotbarSlotPlan)) {
      const macroDoc = macroMap.get(macroName);
      if (macroDoc) {
        hotbarUpdates[`hotbar.${slot}`] = macroDoc.id;
      }
    }

    await game.user.update(hotbarUpdates);
    await game.user.setFlag(MODULE_ID, "hotbarConfigured", true);
    ui.notifications.info("Cheap Dice Macros assigned to Hotbar Page 1 and Page 2.");
  } else {
    // If already configured in a previous version, ensure slot 2 is populated with Token Info
    const tokenInfoMacro = macroMap.get("Token Info");
    if (tokenInfoMacro && !game.user.hotbar?.[2]) {
      await game.user.update({ "hotbar.2": tokenInfoMacro.id });
    }
  }
}

/**
 * Initialization hook entry point.
 */
export function initMacroGenerator() {
  if (!game.user.isGM) return;
  generateModuleMacros();
}
