import { MODULE_ID, FLAGS, SETTINGS } from "../src/constants.js";

export function getGlobalShowAC() {
  try {
    return Boolean(game.settings.get(MODULE_ID, SETTINGS.GLOBAL_SHOW_AC));
  } catch (e) {
    try {
      return Boolean(game.settings.get("world", "globalShowAC"));
    } catch {
      return false;
    }
  }
}

export function renderTokenAcBadge(token) {
  if (!token?.actor || !token.bars) return;

  if (!game.settings.get(MODULE_ID, SETTINGS.FEATURES.TOKEN_AC)) {
    const existing = token.bars.getChildByName("acBadgeContainer");
    if (existing) existing.destroy({ children: true });
    return;
  }

  const masterEnabled = getGlobalShowAC();
  let acContainer = token.bars.getChildByName("acBadgeContainer");

  // Fast path: if master toggle is off, remove badge if present and exit immediately
  if (!masterEnabled) {
    if (acContainer) acContainer.destroy({ children: true });
    return;
  }

  // Check scoped flag with fallback to legacy flag for backward compatibility
  const tokenShowAC = Boolean(
    token.document.getFlag(MODULE_ID, FLAGS.SHOW_AC) ??
    token.document.getFlag("world", "showAC")
  );
  if (!tokenShowAC) {
    if (acContainer) acContainer.destroy({ children: true });
    return;
  }

  const acValue = String(token.actor.system?.attributes?.ac?.value ?? token.actor.system?.attributes?.ac ?? "--");
  const tokenScale = Math.max(Math.abs(token.document.texture?.scaleX ?? 1), 1);

  const fontSize = 22;
  const badgeWidth = 44;
  const badgeHeight = 28;

  const xPos = Math.round((token.w - badgeWidth) / 2);
  const visualTopOffset = Math.max(0, (token.h * (tokenScale - 1)) / 2);
  const yPos = -badgeHeight - 6 - visualTopOffset;

  if (!acContainer) {
    acContainer = new PIXI.Container();
    acContainer.name = "acBadgeContainer";

    const bg = new PIXI.Graphics();
    bg.name = "acBadgeBg";
    bg.beginFill(0x000000, 0.85);
    bg.lineStyle(2, 0xd4af37, 1);
    bg.drawRoundedRect(0, 0, badgeWidth, badgeHeight, 6);
    bg.endFill();
    acContainer.addChild(bg);

    const style = new PIXI.TextStyle({
      fontFamily: "Signika, sans-serif",
      fontSize: fontSize,
      fontWeight: "bold",
      fill: "#ffffff",
      align: "center"
    });

    const text = new PIXI.Text(acValue, style);
    text.name = "acBadgeText";
    text.anchor.set(0.5, 0.5);
    text.position.set(badgeWidth / 2, badgeHeight / 2);
    acContainer.addChild(text);

    token.bars.addChild(acContainer);
  } else {
    // In-place text update without reallocating Graphics/Text/Containers
    const text = acContainer.getChildByName("acBadgeText");
    if (text && text.text !== acValue) {
      text.text = acValue;
    }
  }

  acContainer.position.set(xPos, yPos);
}

export function initTokenAc() {
  if (!game.settings.get(MODULE_ID, SETTINGS.FEATURES.TOKEN_AC)) return;

  Hooks.on("renderSceneControls", (controls, html) => {
    if (!game.user.isGM) return;
    if (!game.settings.get(MODULE_ID, SETTINGS.FEATURES.TOKEN_AC)) return;

    const root = html instanceof HTMLElement ? html : (html[0] ?? document.getElementById("scene-controls"));
    if (!root) return;

    const activeLayer = root.querySelector('#scene-controls-layers button[data-control="tokens"][aria-pressed="true"]');
    if (!activeLayer) return;

    const toolsMenu = root.querySelector('#scene-controls-tools[data-application-part="tools"]')
      || root.querySelector("#scene-controls-tools");
    if (!toolsMenu) return;

    toolsMenu.querySelector('li[data-tool="masterToggleAC"]')?.remove();

    const isActive = getGlobalShowAC();

    const li = document.createElement("li");
    li.dataset.tool = "masterToggleAC";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "control ui-control tool icon toggle fa-solid fa-shield-halved";
    btn.dataset.action = "tool";
    btn.dataset.tool = "masterToggleAC";
    btn.setAttribute("aria-label", "Master Toggle: Token AC Display");
    btn.setAttribute("aria-pressed", String(isActive));
    btn.dataset.tooltip = "Master Toggle: Token AC Display";

    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const currentState = getGlobalShowAC();
      const newState = !currentState;

      await game.settings.set(MODULE_ID, SETTINGS.GLOBAL_SHOW_AC, newState);
      btn.setAttribute("aria-pressed", String(newState));
      canvas.tokens?.placeables.forEach(t => renderTokenAcBadge(t));
    });

    li.appendChild(btn);
    toolsMenu.appendChild(li);
  });

  Hooks.once("ready", () => {
    try {
      game.settings.register(MODULE_ID, SETTINGS.GLOBAL_SHOW_AC, {
        name: "Master AC Display",
        hint: "Globally display AC badges above tokens.",
        scope: "world",
        config: false,
        type: Boolean,
        default: false,
        onChange: () => {
          canvas.tokens?.placeables.forEach(t => renderTokenAcBadge(t));
        }
      });
    } catch (e) {
      // Setting already registered
    }

    if (game.user.isGM && ui.controls) {
      ui.controls.render(true);
    }

    canvas.tokens?.placeables.forEach(t => renderTokenAcBadge(t));

    Hooks.on("drawToken", (token) => {
      if (!token?.actor) return;
      renderTokenAcBadge(token);
    });

    Hooks.on("updateToken", (document, change) => {
      const token = document.object;
      if (!token) return;

      // Only redraw if texture, scale, or the showAC flag changed
      if (
        foundry.utils.hasProperty(change, "texture") ||
        foundry.utils.hasProperty(change, `flags.${MODULE_ID}.${FLAGS.SHOW_AC}`) ||
        foundry.utils.hasProperty(change, "flags.world.showAC")
      ) {
        renderTokenAcBadge(token);
      }
    });

    Hooks.on("updateActor", (actor, change) => {
      if (foundry.utils.hasProperty(change, "system.attributes.ac")) {
        actor.getActiveTokens().forEach(token => renderTokenAcBadge(token));
      }
    });
  });
}

// Preserve backwards-compatible global references and expose to module public API
globalThis.renderTokenAcBadge = renderTokenAcBadge;
globalThis.getGlobalShowAC = getGlobalShowAC;

