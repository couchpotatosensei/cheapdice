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

  const tokenScale = Math.max(Math.abs(token.document.texture?.scaleX ?? 1), 1);
  const tokenSize = Math.min(token.w, token.h);
  // Render matching elevation badge independently whenever token elevation is non-zero
  renderTokenElevationBadge(token);

  // Check master AC toggle and per-token AC flag
  const tokenShowAC = Boolean(
    token.document.getFlag(MODULE_ID, FLAGS.SHOW_AC) ??
    token.document.getFlag("world", "showAC")
  );

  if (!masterEnabled || !tokenShowAC) {
    if (acContainer) acContainer.destroy({ children: true });
    return;
  }

  const acValue = String(token.actor.system?.attributes?.ac?.value ?? token.actor.system?.attributes?.ac ?? "--");

  // Uniform proportional scaling: render at base reference size (token size 100) and scale container
  const baseScale = tokenSize / 100;
  const baseFontSize = 20;
  const baseBadgeHeight = 28;
  const baseBadgeWidth = Math.round(baseFontSize * (acValue.length > 2 ? 2.2 : 1.9));
  const basePaddingX = 4;
  const basePaddingY = 4;

  const badgeWidth = baseBadgeWidth * baseScale;
  const badgeHeight = baseBadgeHeight * baseScale;
  const paddingX = basePaddingX * baseScale;
  const paddingY = basePaddingY * baseScale;

  // If elevation is visible or token has elevation > 0, bias AC to the right, otherwise center
  const hasElevation = Boolean(token.document.elevation);
  const xPos = hasElevation
    ? Math.round(token.w - badgeWidth - paddingX)
    : Math.round((token.w - badgeWidth) / 2);
  const visualTopOffset = Math.max(0, (token.h * (tokenScale - 1)) / 2);
  const yPos = -badgeHeight - paddingY - visualTopOffset;

  if (!acContainer) {
    acContainer = new PIXI.Container();
    acContainer.name = "acBadgeContainer";

    const bg = new PIXI.Graphics();
    bg.name = "acBadgeBg";
    acContainer.addChild(bg);

    const style = new PIXI.TextStyle({
      fontFamily: token.nameplate?.style?.fontFamily || "Signika, sans-serif",
      fontSize: baseFontSize,
      fontWeight: "bold",
      fill: "#ffffff",
      align: "center"
    });

    const text = new PIXI.Text(acValue, style);
    text.name = "acBadgeText";
    text.anchor.set(0.5, 0.5);
    text.resolution = Math.max(2, Math.round(2 / Math.min(baseScale, 1)));
    acContainer.addChild(text);

    token.bars.addChild(acContainer);
  }

  // Draw background at base reference coordinates
  const bg = acContainer.getChildByName("acBadgeBg");
  if (bg) {
    bg.clear();
    bg.beginFill(0x000000, 0.85);
    bg.lineStyle(1.6, 0xd4af37, 1);
    bg.drawRoundedRect(0, 0, baseBadgeWidth, baseBadgeHeight, 5);
    bg.endFill();
  }

  // Update text value and ensure crisp resolution when zooming
  const text = acContainer.getChildByName("acBadgeText");
  if (text) {
    if (text.text !== acValue) text.text = acValue;
    text.resolution = Math.max(2, Math.round(2 / Math.min(baseScale, 1)));
    text.position.set(baseBadgeWidth / 2, baseBadgeHeight / 2);
  }

  acContainer.scale.set(baseScale, baseScale);
  acContainer.position.set(xPos, yPos);
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

  const tokenSize = Math.min(token.w, token.h);
  const baseScale = tokenSize / 100;
  const baseFontSize = 20;
  const baseBadgeHeight = 28;
  const elevText = `${elevationValue > 0 ? "+" : ""}${elevationValue}`;
  const baseBadgeWidth = Math.round(baseFontSize * (elevText.length > 3 ? 2.3 : 1.9));
  const basePaddingX = 4;
  const basePaddingY = 4;

  const badgeHeight = baseBadgeHeight * baseScale;
  const paddingX = basePaddingX * baseScale;
  const paddingY = basePaddingY * baseScale;
  const xPos = paddingX;
  const tokenScale = Math.max(Math.abs(token.document.texture?.scaleX ?? 1), 1);
  const visualTopOffset = Math.max(0, (token.h * (tokenScale - 1)) / 2);
  const yPos = -badgeHeight - paddingY - visualTopOffset;

  if (!elevContainer) {
    elevContainer = new PIXI.Container();
    elevContainer.name = "elevationBadgeContainer";

    const bg = new PIXI.Graphics();
    bg.name = "elevationBadgeBg";
    elevContainer.addChild(bg);

    const style = new PIXI.TextStyle({
      fontFamily: token.nameplate?.style?.fontFamily || "Signika, sans-serif",
      fontSize: baseFontSize,
      fontWeight: "bold",
      fill: "#ffffff",
      align: "center"
    });

    const text = new PIXI.Text(elevText, style);
    text.name = "elevationBadgeText";
    text.anchor.set(0.5, 0.5);
    text.resolution = Math.max(2, Math.round(2 / Math.min(baseScale, 1)));
    elevContainer.addChild(text);

    token.bars.addChild(elevContainer);
  }

  // Draw background matching AC badge aesthetic at base reference scale
  const bg = elevContainer.getChildByName("elevationBadgeBg");
  if (bg) {
    bg.clear();
    bg.beginFill(0x000000, 0.85);
    bg.lineStyle(1.6, 0x4a90e2, 1);
    bg.drawRoundedRect(0, 0, baseBadgeWidth, baseBadgeHeight, 5);
    bg.endFill();
  }

  const text = elevContainer.getChildByName("elevationBadgeText");
  if (text) {
    if (text.text !== elevText) text.text = elevText;
    text.resolution = Math.max(2, Math.round(2 / Math.min(baseScale, 1)));
    text.position.set(baseBadgeWidth / 2, baseBadgeHeight / 2);
  }

  elevContainer.scale.set(baseScale, baseScale);
  elevContainer.position.set(xPos, yPos);
}

export function initTokenAc() {
  if (!game.settings.get(MODULE_ID, SETTINGS.FEATURES.TOKEN_AC)) return;

  const TokenCls = foundry.canvas?.placeables?.Token ?? (typeof Token !== "undefined" ? Token : null);
  if (!TokenCls) return;

  // Suppress core raw tooltip / elevation indicators completely
  if (typeof TokenCls.prototype._getTooltipText === "function") {
    TokenCls.prototype._getTooltipText = function () {
      return "";
    };
  }

  if (typeof TokenCls.prototype._refreshTooltip === "function") {
    const originalRefreshTooltip = TokenCls.prototype._refreshTooltip;
    TokenCls.prototype._refreshTooltip = function (...args) {
      originalRefreshTooltip.apply(this, args);
      if (this.tooltip) {
        this.tooltip.visible = false;
        this.tooltip.renderable = false;
        this.tooltip.text = "";
      }
    };
  }

  if (typeof TokenCls.prototype._refreshElevation === "function") {
    const originalRefreshElevation = TokenCls.prototype._refreshElevation;
    TokenCls.prototype._refreshElevation = function (...args) {
      originalRefreshElevation.apply(this, args);
      if (this.elevation) {
        this.elevation.visible = false;
        this.elevation.renderable = false;
        this.elevation.text = "";
      }
    };
  }

  // When nameplate or token transforms are refreshed, re-render AC & Elevation badges
  if (typeof TokenCls.prototype._refreshNameplate === "function") {
    const originalRefreshNameplate = TokenCls.prototype._refreshNameplate;
    TokenCls.prototype._refreshNameplate = function (...args) {
      originalRefreshNameplate.apply(this, args);
      renderTokenAcBadge(this);
    };
  }

  // Foundry v11/v12/v13/v14 hook into token refresh
  Hooks.on("refreshToken", (token) => {
    if (token?.actor) renderTokenAcBadge(token);
  });

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
      if (t.tooltip) {
        t.tooltip.visible = false;
        t.tooltip.renderable = false;
        t.tooltip.text = "";
      }
      if (t.elevation) {
        t.elevation.visible = false;
        t.elevation.renderable = false;
        t.elevation.text = "";
      }
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

