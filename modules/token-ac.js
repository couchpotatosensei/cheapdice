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
  let elevContainer = token.bars.getChildByName("elevationBadgeContainer");

  // Fast path: if master toggle is off, remove badge if present and exit immediately
  if (!masterEnabled) {
    if (acContainer) acContainer.destroy({ children: true });
    if (elevContainer) elevContainer.destroy({ children: true });
    return;
  }

  // Check scoped flag with fallback to legacy flag for backward compatibility
  const tokenShowAC = Boolean(
    token.document.getFlag(MODULE_ID, FLAGS.SHOW_AC) ??
    token.document.getFlag("world", "showAC")
  );
  if (!tokenShowAC) {
    if (acContainer) acContainer.destroy({ children: true });
    if (elevContainer) elevContainer.destroy({ children: true });
    return;
  }

  const acValue = String(token.actor.system?.attributes?.ac?.value ?? token.actor.system?.attributes?.ac ?? "--");
  const tokenScale = Math.max(Math.abs(token.document.texture?.scaleX ?? 1), 1);

  // Derive font size to match token nameplate or scale relative to scene grid
  const nameplateFontSize = Number(token.nameplate?.style?.fontSize);
  const baseGridSize = canvas.grid?.size ?? 100;
  // If nameplate font size is available, match it; otherwise use ~24% of grid size
  const fontSize = Number.isFinite(nameplateFontSize) && nameplateFontSize > 0
    ? Math.round(nameplateFontSize)
    : Math.max(16, Math.round(baseGridSize * 0.24));

  // Dynamically scale badge box dimensions to fit the font size comfortably
  const badgeWidth = Math.max(36, Math.round(fontSize * 2.0));
  const badgeHeight = Math.max(22, Math.round(fontSize * 1.3));
  const paddingX = 6;

  // If elevation is visible or token has elevation > 0, bias AC to the right, otherwise center or keep right
  const hasElevation = Boolean(token.document.elevation);
  const xPos = hasElevation
    ? Math.round(token.w - badgeWidth - paddingX)
    : Math.round((token.w - badgeWidth) / 2);
  const visualTopOffset = Math.max(0, (token.h * (tokenScale - 1)) / 2);
  const yPos = -badgeHeight - 6 - visualTopOffset;

  if (!acContainer) {
    acContainer = new PIXI.Container();
    acContainer.name = "acBadgeContainer";

    const bg = new PIXI.Graphics();
    bg.name = "acBadgeBg";
    acContainer.addChild(bg);

    const style = new PIXI.TextStyle({
      fontFamily: token.nameplate?.style?.fontFamily || "Signika, sans-serif",
      fontSize: fontSize,
      fontWeight: "bold",
      fill: "#ffffff",
      align: "center"
    });

    const text = new PIXI.Text(acValue, style);
    text.name = "acBadgeText";
    text.anchor.set(0.5, 0.5);
    acContainer.addChild(text);

    token.bars.addChild(acContainer);
  }

  // Draw/update background box geometry based on current dynamic dimensions
  const bg = acContainer.getChildByName("acBadgeBg");
  if (bg) {
    bg.clear();
    bg.beginFill(0x000000, 0.85);
    bg.lineStyle(2, 0xd4af37, 1);
    bg.drawRoundedRect(0, 0, badgeWidth, badgeHeight, Math.round(badgeHeight * 0.22));
    bg.endFill();
  }

  // Update text value and ensure style matches target fontSize
  const text = acContainer.getChildByName("acBadgeText");
  if (text) {
    if (text.text !== acValue) text.text = acValue;
    if (text.style.fontSize !== fontSize) text.style.fontSize = fontSize;
    text.position.set(badgeWidth / 2, badgeHeight / 2);
  }

  acContainer.position.set(xPos, yPos);

  // Render matching elevation badge with exact same font size and badge height
  renderTokenElevationBadge(token, fontSize, badgeHeight);
}

export function renderTokenElevationBadge(token, fontSize, badgeHeight) {
  if (!token?.bars) return;

  const elevationValue = token.document.elevation ?? 0;
  let elevContainer = token.bars.getChildByName("elevationBadgeContainer");

  // Hide or remove if elevation is 0
  if (!elevationValue) {
    if (elevContainer) elevContainer.destroy({ children: true });
    return;
  }

  const elevText = `${elevationValue > 0 ? "+" : ""}${elevationValue}`;
  const badgeWidth = Math.max(36, Math.round(fontSize * (elevText.length > 3 ? 2.3 : 2.0)));
  const paddingX = 6;
  const xPos = paddingX;
  const tokenScale = Math.max(Math.abs(token.document.texture?.scaleX ?? 1), 1);
  const visualTopOffset = Math.max(0, (token.h * (tokenScale - 1)) / 2);
  const yPos = -badgeHeight - 6 - visualTopOffset;

  if (!elevContainer) {
    elevContainer = new PIXI.Container();
    elevContainer.name = "elevationBadgeContainer";

    const bg = new PIXI.Graphics();
    bg.name = "elevationBadgeBg";
    elevContainer.addChild(bg);

    const style = new PIXI.TextStyle({
      fontFamily: token.nameplate?.style?.fontFamily || "Signika, sans-serif",
      fontSize: fontSize,
      fontWeight: "bold",
      fill: "#ffffff",
      align: "center"
    });

    const text = new PIXI.Text(elevText, style);
    text.name = "elevationBadgeText";
    text.anchor.set(0.5, 0.5);
    elevContainer.addChild(text);

    token.bars.addChild(elevContainer);
  }

  // Draw background matching AC badge aesthetic
  const bg = elevContainer.getChildByName("elevationBadgeBg");
  if (bg) {
    bg.clear();
    bg.beginFill(0x000000, 0.85);
    bg.lineStyle(2, 0x4a90e2, 1); // Subtle blue border distinction for elevation, or gold matching
    bg.drawRoundedRect(0, 0, badgeWidth, badgeHeight, Math.round(badgeHeight * 0.22));
    bg.endFill();
  }

  const text = elevContainer.getChildByName("elevationBadgeText");
  if (text) {
    if (text.text !== elevText) text.text = elevText;
    if (text.style.fontSize !== fontSize) text.style.fontSize = fontSize;
    text.position.set(badgeWidth / 2, badgeHeight / 2);
  }

  elevContainer.position.set(xPos, yPos);
}

export function initTokenAc() {
  if (!game.settings.get(MODULE_ID, SETTINGS.FEATURES.TOKEN_AC)) return;

  // Suppress core raw tooltip elevation text when our custom styled elevation badge is active
  if (typeof Token.prototype._refreshTooltip === "function") {
    const originalRefreshTooltip = Token.prototype._refreshTooltip;
    Token.prototype._refreshTooltip = function (...args) {
      originalRefreshTooltip.apply(this, args);
      if (this.tooltip && this.document.elevation !== 0) {
        this.tooltip.visible = false;
      }
    };
  }

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

    function refreshElevationVisuals(t) {
      if (t._refreshTooltip) t._refreshTooltip();
      if (t._refreshElevation) t._refreshElevation();
    }

    canvas.tokens?.placeables.forEach(t => {
      renderTokenAcBadge(t);
      refreshElevationVisuals(t);
    });

    Hooks.on("drawToken", (token) => {
      if (!token?.actor) return;
      renderTokenAcBadge(token);
      refreshElevationVisuals(token);
    });

    Hooks.on("updateToken", (document, change) => {
      const token = document.object;
      if (!token) return;

      // Redraw if texture, scale, elevation, or showAC flag changed
      if (
        foundry.utils.hasProperty(change, "texture") ||
        foundry.utils.hasProperty(change, "elevation") ||
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
globalThis.renderTokenElevationBadge = renderTokenElevationBadge;
globalThis.getGlobalShowAC = getGlobalShowAC;

