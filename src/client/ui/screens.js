// SPEC-011: the 2D pass of a frame (drawUI) and the per-mode dispatch (drawOverlay, drawOverlayPhone). Client module (moved
// out of index.html in Phase C).

import { L } from "../../i18n.js";
import { paperCache, paperUI } from "./paper.js";
import { backToWardrobe, closeShop, openFriends } from "../flow.js";
import { nameInput, placeNameInput } from "../devices.js";
import { LOOK } from "../look.js";
import { ctx, PHONE, rotateWall, UH, UW, VIEW } from "../screen.js";
import { inMenus, mode, ui } from "../state.js";
import { itemsDesktop, itemsPhone } from "./character/items.js";
import { progressPage } from "./character/progress.js";
import { phoneShopBar, shopTabs } from "./character/tabs.js";
import { upgradeCardsDesktop, upgradeCardsPhone } from "./character/upgrades.js";
import { coinPlate, wardrobeDesktop, wardrobePhone } from "./character/wardrobe.js";
import { fitButton } from "./buttons.js";
import { addButton, drawFx, drawMarkers, drawMood } from "./draw.js";
import { drawHome } from "./home.js";
import { drawLangScreen } from "./lang.js";
import { drawBanner, drawHUD } from "./hud.js";
import { drawHUDPhone } from "./phone.js";
import { drawLevelCard, drawMap } from "./map.js";
import { menuFrame, phoneFrame } from "./menu.js";
import { drawScene, drawStory } from "./story.js";
import { fitText, label, pWrap } from "./text.js";
import { cpx } from "./layout.js";
import { endPhone, loseDesktop, pauseDesktop, pausePhone, winDesktop } from "./win.js";

function drawOverlayPhone() {
  const c = cpx;
  if (mode === "home") drawHome();
  else if (mode === "lang") drawLangScreen();   // SPEC-032
  else if (mode === "story") drawStory();
  else if (mode === "scene") drawScene();
  else if (mode === "map" || mode === "levelCard") {
    drawMap(ui.T);
    if (mode === "levelCard") { ui.buttons = []; ui.hudRects = []; drawLevelCard(); }   // под карточкой карта не нажимается
  } else if (mode === "shop") {
    const f = phoneFrame(), { X0, X1, Y0, Y1, B } = f;
    phoneShopBar(f);   // SPEC-017: вкладки (SPEC-026: «Прогресс» · «Вещи» · «Гардероб» · «Улучшения»), монетки, друзья, «Готово»
    if (ui.shopTab === "progress") progressPage();
    else if (ui.shopTab === "upgrades") upgradeCardsPhone(X0, X1, Y0 + B + c(8), Y1);
    else if (ui.shopTab === "wardrobe") wardrobePhone(f);
    else itemsPhone(f);
  } else if (mode === "pause") pausePhone();
  else if (mode === "win" || mode === "lose") endPhone();
}

function drawOverlay() {
  if (mode === "play") return;
  ctx.fillStyle = "rgba(20,30,25,.55)"; ctx.fillRect(0, 0, UW, UH);
  if (PHONE) { drawOverlayPhone(); return; }
  if (mode === "home") drawHome();
  else if (mode === "lang") drawLangScreen();   // SPEC-032
  else if (mode === "story") drawStory();
  else if (mode === "scene") drawScene();
  else if (mode === "map" || mode === "levelCard") {
    drawMap(ui.T);
    if (mode === "levelCard") { ui.buttons = []; ui.hudRects = []; drawLevelCard(); }   // под карточкой карта не нажимается
  } else if (mode === "shop") {
    menuFrame();
    shopTabs(UW / 2 - 420, 41, 46, 20, 12, 10, true, LOOK.MENU_LOOK.frame.tabsW);   // SPEC-009: вкладки на месте заголовка (SPEC-017: три; SPEC-026: четыре — до монеток)
    coinPlate(UW / 2 + 250, 46, 150, 38);
    if (ui.shopTab === "progress") progressPage();
    else if (ui.shopTab === "upgrades") upgradeCardsDesktop();
    else if (ui.shopTab === "wardrobe") wardrobeDesktop();
    else itemsDesktop();
    if (ui.shopTab === "wardrobe") {
      // SPEC-017: ряд под колонками гардероба — подсказка про имена, «Готово», «Друзья» (на странице друзей — «◀ Гардероб»)
      const W = LOOK.MENU_LOOK.wardrobe, fr = ui.wardrobePage === "friends";
      if (!fr) fitText(L().tapToRename, UW / 2 - 265, W.rowY + W.rowH / 2, 14, 290, "center", LOOK.MENU_LOOK.note, 700);
      addButton(UW / 2 - 100, W.rowY, 200, W.rowH, L().ok, LOOK.MENU_LOOK.ok, closeShop, 22);
      fitButton(UW / 2 + 130, W.rowY, 230, W.rowH, fr ? "◀ " + L().wardrobeTab : "👥 " + L().friends, fr ? LOOK.MENU_LOOK.ok : LOOK.MENU_LOOK.friends, fr ? backToWardrobe : openFriends, 20, 13);
    } else {
      addButton(UW / 2 - 100, 540, 200, 50, L().ok, LOOK.MENU_LOOK.ok, closeShop, 22);
    }
  } else if (mode === "pause") pauseDesktop();
  else if (mode === "win") winDesktop();
  else if (mode === "lose") loseDesktop();
}

export function drawUI(t) {
  ui.draws++;
  ui.buttonsGen = ui.screenSeq;                                       // SPEC-025 AC 7d: this frame's buttons belong to the screen now
  // SPEC-040 AC 10: edgeArrows and hudRects are emptied, not remade (the __bb getters copy them)
  ui.buttons = []; ui.homeInfo = null; ui.progressInfo = null; ui.mapState = null; ui.cardInfo = null; ui.cardRect = null; ui.storyInfo = null; ui.sceneInfo = null; ui.bonusNote = null; ui.winLine = ""; ui.mmShown = false; ui.edgeArrows.length = 0; ui.hudRects.length = 0; ui.downDrawn = []; ui.textOverflows = []; ui.textSizes = {}; ui.bannerRect = null; ui.bellRect = null; ui.freezeRect = null; ui.tipInfo = null; ui.kitHintRect = null; ui.heardHintRect = null; ui.tutorialHintRect = null; ui.stickMarks = []; ui.shopLayout = null; ui.winPanel = null;
  if (!paperUI()) paperCache.length = 0;                           // SPEC-020: и листы бумажных панелей — вне бумажных экранов
  ctx.setTransform(VIEW, 0, 0, VIEW, 0, 0);
  ctx.clearRect(0, 0, UW, UH);
  if (!inMenus()) { drawMarkers(t); drawMood(t); drawFx(); if (PHONE) drawHUDPhone(t); else drawHUD(t); } else ui.moodInfo = null;
  if (mode === "play" && ui.banner) drawBanner();
  drawOverlay();
  if (PHONE && nameInput) {                // телефон: поле ввода следует за своей подписью (клавиатура могла поменять высоту экрана)
    const b = ui.buttons.find(q => q.id === "name:" + nameInput.slot);
    if (b) { nameInput.rect = { x: b.x, y: b.y, w: b.w, h: b.h }; placeNameInput(); }
  }
  ui.rotateShown = false;
  if (rotateWall()) {                      // SPEC-038 AC 2: под заставкой ничего не нажимается — и вне режима телефона
    ui.buttons = []; ui.rotateShown = true;
    ctx.fillStyle = "rgba(20,30,25,.92)"; ctx.fillRect(0, 0, UW, UH);
    if (PHONE) {   // телефон: узкий экран — крупно в несколько строк
      const h = pWrap(L().rotate, UW / 2, 0, "title", 30, UW - cpx(32), 3, "#fff", 900);   // мерка
      ctx.fillStyle = "rgba(20,30,25,1)"; ctx.fillRect(0, 0, UW, UH);
      pWrap(L().rotate, UW / 2, UH / 2 - h / 2, "title", 30, UW - cpx(32), 3, "#fff", 900);
    } else label(L().rotate, UW / 2, UH / 2, 44, "#fff");
  }
}
