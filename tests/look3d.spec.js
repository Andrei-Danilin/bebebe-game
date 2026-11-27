// SPEC-021: the 3D world in the comic style of art/ — thick black wobbly outlines, flat 2-tone colours, light soft
// shadows, a paper grain over the picture. Rendered pages only (the 3D scene is not built in sim mode); the scene is read
// through __bb.look3D() (drawn state, in SIM_DRAWN).
const { test, expect } = require("./pw");   // SPEC-023: @playwright/test + failure screenshots
const { openGame, frames, putOldSave, storedSave } = require("./helpers");

const play = (page, world, level) => page.evaluate(([w, n]) => { const b = window.__bb; b.world = w; b.level = n; b.startGame(1); }, [world, level]);

// AC 1: black (#1b1b1b), about 2× the old thickness (the hull grows by k × the thickness each part asks for), a seeded
// per-object wobble (the same level is drawn the same way again), CFG.OUTLINE_WOBBLE switches the wobble off
test("outlines are black #1b1b1b, twice as thick, with a seeded wobble that CFG.OUTLINE_WOBBLE turns off @fast", async ({ page }) => {
  const errors = await openGame(page);
  await play(page, "park", 1);
  await frames(page);
  const a = await page.evaluate(() => window.__bb.look3D().outline);
  expect(a.colors).toEqual(["#1b1b1b"]);
  expect(a.hulls).toBeGreaterThan(100);                    // characters, houses, walls, trees, rocks
  expect(a.k).toBeGreaterThan(1.8);
  expect(a.k).toBeLessThan(2.2);                           // the median is about 2× (the wobble moves single hulls)
  expect(a.spread).toBeGreaterThan(0.1);                   // not machine-perfect
  expect(a.shifted).toBeGreaterThan(0.5);                  // most hulls sit a little off-centre: one side a bit thicker
  for (const kind of ["home", "bighome", "tree", "rock"]) expect(a.kinds[kind], kind).toBeGreaterThan(0);
  // seeded: another level and back → the same map outlines
  await play(page, "park", 2);
  await play(page, "park", 1);
  await frames(page);
  expect((await page.evaluate(() => window.__bb.look3D().outline)).mapSig).toBe(a.mapSig);
  // wobble off → every hull exactly k × its thickness, centred
  const b = await page.evaluate(() => {
    const bb = window.__bb; bb.CFG.OUTLINE_WOBBLE = false;
    bb.world = "park"; bb.level = 2; bb.startGame(1);
    const r = bb.look3D().outline;
    bb.CFG.OUTLINE_WOBBLE = true; bb.level = 1; bb.startGame(1);
    return r;
  });
  expect(b.spread).toBeLessThan(1e-6);
  expect(b.shifted).toBe(0);
  expect(b.k).toBeCloseTo(await page.evaluate(() => window.__bb.CFG.OUTLINE_LOOK.k), 5);
  expect(errors).toEqual([]);
});

// AC 2: every world material is a toon material on a 2-tone gradient (light / shade) or an unlit one — nothing with a
// specular highlight; the sun's shadows are lighter and softer than before (intensity < 1, a blur radius)
test("world materials are flat: a 2-tone toon gradient, no specular, light soft shadows @fast", async ({ page }) => {
  const errors = await openGame(page);
  for (const w of ["park", "winter"]) {
    await play(page, w, 5);
    await frames(page);
    const r = await page.evaluate(() => window.__bb.look3D());
    expect(r.tones, w).toBe(2);
    expect(r.materials.filter(t => t !== "MeshToonMaterial" && t !== "MeshBasicMaterial"), w).toEqual([]);
    expect(r.toonOffGradient, w).toBe(0);                  // every toon material uses the 2-tone gradient
    expect(r.shadow.intensity, w).toBeLessThan(0.75);
    expect(r.shadow.radius, w).toBeGreaterThan(1.5);
  }
  expect(errors).toEqual([]);
});

// AC 4: a paper grain over the 3D (under the UI layer), multiply, ~0.08 opacity, made once; CFG.PAPER_GRAIN hides it
test("a paper grain lies over the 3D (multiply, ~0.08) and CFG.PAPER_GRAIN switches it off @fast", async ({ page }) => {
  const errors = await openGame(page);
  await play(page, "park", 1);
  await frames(page);
  const on = await page.evaluate(() => window.__bb.look3D().paper);
  expect(on.shown).toBe(true);
  expect(on.blend).toBe("multiply");
  expect(on.alpha).toBeGreaterThan(0.04);
  expect(on.alpha).toBeLessThan(0.15);
  expect(on.over3D).toBe(true);                            // drawn last over the 3D scene (the 2D interface canvas lies above the 3D one)
  expect(on.made).toBe(1);
  const off = await page.evaluate(async () => {
    const b = window.__bb; b.CFG.PAPER_GRAIN = false;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const p = b.look3D().paper; b.CFG.PAPER_GRAIN = true;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { p, again: b.look3D().paper };
  });
  expect(off.p.shown).toBe(false);
  expect(off.again.shown).toBe(true);
  expect(off.again.made).toBe(1);                          // generated once, not per switch
  expect(errors).toEqual([]);
});

// AC 3 + 8: the ground of every world is painted with diagonal felt-tip strokes (seeded canvas strokes, not a flat colour per
// cell) and keeps its THEMES colour underneath; walls, houses, cottages and roofs are hatched on their shade side
test("every world's ground has diagonal marker strokes over its THEMES colour; walls and roofs are hatched", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, out = {};
    for (const w of b.WORLDS) for (const lv of [1, 5]) {             // walls and houses (1), cottages with roofs (5)
      b.world = w; b.level = lv; b.startGame(1);
      const L = b.look3D();
      if (lv === 1) out[w] = { ground: L.ground, g1: b.THEMES[w].g1, g2: b.THEMES[w].g2 };
      out[w]["hatch" + lv] = L.hatch;
    }
    return out;
  });
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const dist = (a, c) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
  for (const [w, q] of Object.entries(r)) {
    expect(q.ground.colors, `${w}: colours inside a cell`).toBeGreaterThanOrEqual(6);
    expect(q.ground.diag, `${w}: strokes run diagonally (change along / across)`).toBeGreaterThan(1.15);
    expect(Math.min(dist(q.ground.mean, hex(q.g1)), dist(q.ground.mean, hex(q.g2))), `${w}: ground stays its THEMES colour`).toBeLessThan(40);
    for (const lv of [1, 5]) {
      expect(q["hatch" + lv].pieces, `${w} ${lv}: walls found`).toBeGreaterThan(0);
      expect(q["hatch" + lv].plain, `${w} ${lv}: walls without hatching`).toEqual([]);
    }
  }
  await frames(page);                                       // the hatching shader compiles and draws without errors
  expect(await page.evaluate(() => window.__bb.look3D("hatch").hatch.programs), "a compiled hatch program").toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);                               // addHatch logs an error if three.js changed the shader chunks
});

// AC 8: Winter's maze walls are clearly darker than the snow (contrast ratio of their THEMES colours): the sides, and the
// tops the camera mostly sees (before SPEC-021: #dbe8f6 walls with white snow caps — 1.2 and 1.0)
test("winter maze walls stand out from the snow", async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const t = await page.evaluate(() => window.__bb.THEMES.winter);
  const lum = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  expect(ratio(t.maze.wall, t.g1)).toBeGreaterThan(1.8);
  expect(ratio(t.maze.wall, t.g2)).toBeGreaterThan(1.8);
  expect(ratio(t.maze.cap, t.g1)).toBeGreaterThan(1.5);
  expect(errors).toEqual([]);
});

// no leak: building levels one after another does not pile up textures or geometries in the renderer
test("switching levels keeps the renderer's texture and geometry count flat", async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(async () => {
    const b = window.__bb, seen = [], tick = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    for (const [w, lv] of [["park", 1], ["winter", 5], ["city", 8], ["park", 1], ["winter", 5], ["city", 8], ["park", 1]]) {
      b.world = w; b.level = lv; b.startGame(1); await tick();
      seen.push(b.look3D().memory);
    }
    return seen;
  });
  expect(r[6].textures).toBeLessThanOrEqual(r[3].textures);
  expect(r[6].geometries).toBeLessThanOrEqual(r[3].geometries + 2);
  expect(errors).toEqual([]);
});

// AC 5: the Little Ones like art/6_personas — a bigger round head (the head group is scaled, so hats and hair grow with it;
// collision sizes stay), small dot eyes, rosy cheeks, a simple smile
test("the Little Ones have big round heads with dot eyes, rosy cheeks and a smile", async ({ page }) => {
  const errors = await openGame(page);
  await play(page, "park", 1);
  await frames(page);
  const r = await page.evaluate(() => {
    const b = window.__bb;
    const K = b.CFG.KID_LOOK, top = K.headY + b.KID_HEAD_R * K.head;   // the head's top in model units
    return { want: K.head, r: b.littles[0].r, tagAbove: b.nameTagH() / b.grid.CELL / b.LITTLE_SCALE > top, stars: b.littles.map((l, i) => b.model(i).dizzyStars.position.y > top), kids: b.littles.map((l, i) => { const m = b.model(i), bub = m.bubble;
      return { head: m.head.scale.x, eyes: m.face.eyes.map(e => e.geometry.parameters.radius), cheeks: (m.face.cheeks || []).length, mouth: !!m.face.mouth,
        inBubble: bub.position.y + bub.geometry.parameters.radius > top }; }) };
  });
  expect(r.want).toBeGreaterThan(1.15);
  for (const q of r.kids) {
    expect(q.head).toBeCloseTo(r.want, 5);
    expect(Math.max(...q.eyes)).toBeLessThan(0.035);       // dots (before: 0.046 eyes with a white highlight)
    expect(q.cheeks).toBe(2);
    expect(q.mouth).toBe(true);
    expect(q.inBubble, "the shield bubble covers the bigger head").toBe(true);
  }
  expect(r.tagAbove, "the name tag point is above the head").toBe(true);
  expect(r.stars.every(Boolean), "the dizzy stars circle above the bigger head (from KID_LOOK)").toBe(true);
  expect(r.r).toBe(11);                                     // the logic size is untouched (looks only)
  expect(errors).toEqual([]);
});

// AC 6: the dad is the Big One of a new save; BIG_SKINS keeps its order (dad is added at the end), so a saved index keeps
// its costume. Coordinator decision (BACKLOG: check with Andrei): an old save (no v) with big 0 — Classic was the default, so
// almost always "never chose" — gets the dad; any other index keeps its costume; Classic chosen after SPEC-021 (v: 2) stays
test("the dad is the Big One of a new save and of an old default save; other old costumes and a new Classic stay", async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const ids = () => page.evaluate(() => { const b = window.__bb, W = b.wardrobe().big; return { shown: W[b.outfits.shown.big].id, saved: W[b.outfits.saved.big].id, price: W[b.outfits.saved.big].price, order: W.map(q => q.id) }; });
  expect(await ids()).toEqual({ shown: "dad", saved: "dad", price: 0, order: ["classic", "ogre", "robot", "captain", "bear", "dad"] });
  // the shapes through the pure merge the start code runs (no reload each)
  const shapes = await page.evaluate(() => {
    const b = window.__bb, W = b.wardrobe().big, base = { p1: { hair: 0, hat: 1, jacket: 0, pants: 0 }, p2: { hair: 1, hat: 4, jacket: 1, pants: 3 } };
    return [{ big: 0 }, { big: 1 }, { big: "0" }, {}, { big: 0, v: 1 }, { big: 0, v: 2 }, { big: 4, v: 2 }, { big: 99 }, { big: -3, v: 2 }, { big: "x" }]
      .map(sv => W[b.loadOutfits({ ...base, ...sv }).big].id).concat([null, "junk", { p1: 1 }].map(sv => W[b.loadOutfits(sv).big].id));
  });
  expect(shapes).toEqual(["dad", "ogre", "dad", "dad", "dad", "classic", "bear", "dad", "classic", "dad", "dad", "dad", "dad"]);
  // one real reload: an old default save starts with the dad
  await putOldSave(page, { "bebebe-outfits": { p1: { hair: 0, hat: 1, jacket: 0, pants: 0 }, p2: { hair: 1, hat: 4, jacket: 1, pants: 3 }, big: 0 } });   // SPEC-025: an old device
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  expect(await ids()).toMatchObject({ shown: "dad", saved: "dad" });
  // Classic chosen now is saved (SPEC-025: by id in bebebe-save) and stays Classic after a reload
  await putOldSave(page, { "bebebe-outfits": null });
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  await page.evaluate(() => { const b = window.__bb; b.cycleBig(-b.outfits.shown.big); });
  expect((await storedSave(page)).outfits.big).toBe("classic");
  await page.reload();
  await page.waitForFunction(() => window.__bbReady === true);
  expect((await ids()).saved).toBe("classic");
  expect(errors).toEqual([]);
});

// AC 6: the dad's model like art/1_papa, with hooks for SPEC-022 (face colour by mood, an anchor above the head, an anchor
// for outfits): setBigFace(model, colour) recolours the face (stubble follows, darker), setBigFace(model, null) restores it
test("the dad: bald with stubble, small eyes, heavy brows, big nose, red t-shirt, jeans, sneakers — with hooks for his moods @fast", async ({ page }) => {
  const errors = await openGame(page);
  await play(page, "park", 1);
  await frames(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, m = b.model("big"), hex = c => "#" + c.getHexString();
    const out = { look: m.look, shirt: hex(m.bodyMat.color), parts: Object.keys(m.dad || {}).sort(), top: !!(m.headTop && m.headTop.isObject3D), outfit: !!(m.outfitAnchor && m.outfitAnchor.isObject3D),
      eyes: m.face.eyes.map(e => e.geometry.parameters.radius), brows: m.face.brows.length, skin: m.faceBase,   // SPEC-022: the face shows his mood (red when angry); faceBase is the look's own
      anchors: Object.keys(m.anchors).sort(), handsSwing: [m.anchors.handL.parent, m.anchors.handR.parent].every(q => m.arms.includes(q)),
      topNoTilt: m.anchors.top.parent === m.rig, hatOnHead: m.anchors.head.parent === m.head, aliases: m.headTop === m.anchors.top && m.outfitAnchor === m.anchors.torso,
      ownMats: ["shirt", "pants", "shoes", "face", "stubble"].every(k => m.mats[k] && m.mats[k].userData.own), sleevesShirt: m.dad.sleeves.every(q => q.material === m.mats.shirt) };
    b.setBigFace(m, "#ff8a65"); out.faced = m.faceMats.map(q => hex(q.color));
    b.setBigFace(m, null); out.back = m.faceMats.map(q => hex(q.color));
    return out;
  });
  expect(r.look).toBe("dad");
  expect(r.shirt).toBe("#eb3e42");
  expect(r.parts).toEqual(["ears", "hairs", "jeans", "nose", "sleeves", "sneakers", "stubble"]);
  expect(r.top && r.outfit).toBe(true);
  expect(r.anchors).toEqual(["handL", "handR", "head", "top", "torso"]);
  expect([r.handsSwing, r.topNoTilt, r.hatOnHead, r.aliases, r.ownMats, r.sleevesShirt]).toEqual([true, true, true, true, true, true]);
  expect(Math.max(...r.eyes)).toBeLessThan(0.07);          // small grumpy eyes (the old looks: 0.12 whites)
  expect(r.brows).toBe(2);
  expect(r.faced[0]).toBe("#ff8a65");
  expect(r.faced[1]).not.toBe("#ff8a65");                  // the stubble stays a shade darker than the face
  expect(r.back[0]).toBe(r.skin);
  expect(errors).toEqual([]);
});

// AC 7: both houses in every world — the messy house of the dad, the blue house with a heart on the door; snow on the roofs in Winter
test("the dad's house is the messy little house and the kids' house the blue one with a heart, in every world", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const b = window.__bb, out = {};
    for (const w of b.WORLDS) { b.world = w; b.level = 1; b.startGame(1); out[w] = b.look3D().houses; }
    // SPEC-022 (from SPEC-021's check): the laundry line finds a free spot on other levels too (it used to drop on ~half of them)
    out.laundry = [];
    for (const w of b.WORLDS) for (const n of [5, 10]) { b.world = w; b.level = n; b.startGame(1); out.laundry.push([w + " " + n, [...b.look3D().houses.big.laundry].sort().join(",")]); }
    return out;
  });
  for (const [at, l] of r.laundry) expect(l, `${at}: sock and t-shirt`).toBe("shirt,sock");
  delete r.laundry;
  for (const [w, h] of Object.entries(r)) {
    expect(h.kid.roof, `${w} kids' roof`).toBe(true);
    expect(h.kid.hearts, `${w} heart on a door`).toBeGreaterThanOrEqual(1);
    expect(h.kid.flowers, `${w} flowers`).toBeGreaterThanOrEqual(3);
    expect(h.big.roof && h.big.crooked, `${w} crooked roof`).toBe(true);
    expect(h.big.patches, `${w} roof patches`).toBeGreaterThanOrEqual(2);
    expect(h.big.stains, `${w} mud stains`).toBeGreaterThanOrEqual(5);
    expect([...h.big.laundry].sort(), `${w} sock and t-shirt`).toEqual(["shirt", "sock"]);
    expect(h.big.bin && h.big.stink >= 2, `${w} overflowing bin with stink lines`).toBe(true);
    expect(h.big.pizza, `${w} pizza boxes`).toBeGreaterThanOrEqual(2);
    expect(h.big.toys, `${w} toys`).toBeGreaterThanOrEqual(1);
    expect(h.snow, `${w} roof snow`).toBe(w === "winter" ? 2 : 0);
  }
  expect(errors).toEqual([]);
});

// AC 7: the roofs never hide a Little One: a roof fades while anyone is inside its house (and while the player is next to
// it); empty and alone, it is solid
test("a house roof fades while someone is inside, so it never hides a Little One", async ({ page }) => {
  const errors = await openGame(page);
  // at the start the kids stand in their house: the roof is already faded on the first frame (no flash)
  expect(await page.evaluate(() => { const b = window.__bb; b.world = "park"; b.level = 1; b.startGame(1); return b.look3D("houses").houses.kid.alpha; })).toBeLessThan(0.5);
  await play(page, "park", 1);
  const place = inside => page.evaluate(inKid => {
    const b = window.__bb, z = b.safeZone;
    b.mode = "play";
    b.littles.forEach((l, i) => { l.x = 15 * 32 + i * 40; l.y = 10 * 32; });   // the middle of the map, far from both houses
    Object.assign(b.big, { x: 20 * 32, y: 12 * 32, state: "look", timer: 999 });
    if (inKid) { const l = b.littles[1]; l.x = z.x + z.w / 2; l.y = z.y + z.h / 2; }
    b.mode = "pause";                                        // frozen: the scene still renders and the roofs fade
  }, inside);
  // the fade takes ~0.25 s of frames; on a slow software renderer that is longer — wait for it, then read the scene
  const settle = async ok => { await page.waitForFunction(ok, null, { timeout: 15_000 }); return page.evaluate(() => window.__bb.look3D("houses")); };
  await place(false);
  const empty = await settle(() => { const h = window.__bb.look3D("houses").houses; return h.kid.alpha > 0.95 && h.big.alpha > 0.95; });
  expect(empty.houses.kid.alpha).toBeGreaterThan(0.95);
  expect(empty.houses.big.alpha).toBeGreaterThan(0.95);
  expect(empty.houses.kid.glow, "AC 9: a solid roof of the safe house glows green").toBeGreaterThan(0.15);
  await place(true);
  const full = await settle(() => window.__bb.look3D("houses").houses.kid.alpha < 0.12);
  expect(full.houses.kid.alpha).toBeLessThan(0.5);
  expect(full.roofHides[1]).toBe(false);                   // a ray from the camera to the kid's head meets no solid roof
  expect(full.houses.kid.glow, "faded: the floor glow shows instead").toBeLessThan(0.1);
  // an item lying in the dad's house fades his roof too (nobody inside)
  await place(false);
  await page.evaluate(() => { const b = window.__bb, d = b.dangerZone; b.mode = "play"; b.spawnItem(); const it = b.items[b.items.length - 1]; it.x = d.x + d.w / 2; it.y = d.y + d.h / 2; b.mode = "pause"; });
  expect((await settle(() => window.__bb.look3D("houses").houses.big.alpha < 0.12)).houses.big.alpha).toBeLessThan(0.5);
  expect(errors).toEqual([]);
});

// AC 9: readability on every ground — the hero's black outline against each world's ground colours (WCAG contrast ratio),
// the Big One's view cone (looking / chasing) and the safe-zone floor glow against the ground and the floor under them
// (colour change of the blend, 0–441)
test("the hero's outline, the view cone and the safe glow stand out on every world's ground", async ({ page }) => {
  const errors = await openGame(page, { sim: true });
  const r = await page.evaluate(() => { const C = window.__bb.CFG; return { th: window.__bb.THEMES, W: window.__bb.WORLDS, ink: C.OUTLINE_LOOK.color, cone: C.CONE_LOOK, glow: C.SAFE_GLOW, floor: C.FLOOR_LOOK.wood[0] }; });
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lum = h => { const [a, b, c] = rgb(h).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * a + 0.7152 * b + 0.0722 * c; };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const blendShift = (ground, c, a) => { const g = rgb(ground), q = rgb(c); return Math.hypot(...g.map((v, i) => (q[i] - v) * a)); };
  const problems = [];
  for (const w of r.W) {
    const t = r.th[w], light = [t.g1, t.g2, ...(t.square ? [t.square[0]] : [])], dark = t.deco && t.deco.asphalt ? [t.deco.asphalt] : [];
    for (const g of light) if (ratio(r.ink, g) < 4.5) problems.push(`${w}: outline on ${g} ${ratio(r.ink, g).toFixed(2)}`);
    for (const g of dark) if (ratio(r.ink, g) < 2.5) problems.push(`${w}: outline on asphalt ${g} ${ratio(r.ink, g).toFixed(2)}`);
    for (const g of [t.g1, t.g2, ...dark]) for (const [k, c, a] of [["look", r.cone.look, r.cone.lookA], ["chase", r.cone.chase, r.cone.chaseA]])
      if (blendShift(g, c, a) < 30) problems.push(`${w}: ${k} cone on ${g} ${blendShift(g, c, a).toFixed(1)}`);
  }
  if (blendShift(r.floor, r.glow.color, r.glow.alpha) < 30) problems.push("safe glow on the wood floor");
  expect(problems).toEqual([]);
  expect(errors).toEqual([]);
});

// AC 10 / Goal: the paper grain is off on a phone by default (CFG.PAPER_GRAIN_PHONE), on for desktop
test("the paper grain is off on a phone by default", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const errors = await openGame(page, { query: "?phone=1" });
  await play(page, "park", 1);
  await frames(page);
  expect(await page.evaluate(() => [window.__bb.phone, window.__bb.CFG.PAPER_GRAIN, window.__bb.look3D("paper").paper.shown])).toEqual([true, true, false]);
  expect(errors).toEqual([]);
});

// SPEC-027 AC 5: the new clothes in 3D — the rainbow jacket (six coloured bands), the detective coat (a longer hem), the overalls
// (bib + two straps over the jacket) and the striped pants (vertical stripes on both legs), in the game model and in the wardrobe
// preview. __bb.outfit3D(who) — the tagged clothes parts of a model: who = a Little One's index or "p1" / "p2" (the preview)
test("the new clothes are built in 3D: rainbow bands, a coat hem, overalls, striped pants — in play and in the wardrobe preview", async ({ page }) => {
  const errors = await openGame(page);
  const wear = (jacket, pants) => page.evaluate(([j, p]) => {
    const b = window.__bb, W = b.wardrobe(), o = b.progress.owned;
    o.jackets.push(j); o.pants.push(p);
    b.cycleOutfit("p1", "jacket", W.jacket.findIndex(q => q.id === j) - b.outfits.shown.p1.jacket);
    b.cycleOutfit("p1", "pants", W.pants.findIndex(q => q.id === p) - b.outfits.shown.p1.pants);
  }, [jacket, pants]);
  const count = (parts, piece) => parts.filter(q => q.piece === piece);
  // rainbow + overalls, in play
  await wear("rainbow", "overalls");
  await play(page, "park", 1);
  await frames(page);
  let r = await page.evaluate(() => ({ parts: window.__bb.outfit3D(0), look: window.__bb.littles[0].look }));
  expect(r.look.pattern).toBe("rainbow");
  expect(count(r.parts, "band").map(q => q.color)).toEqual(r.look.bands);
  expect(r.look.bands).toEqual(["#a855f7", "#3b82f6", "#22c55e", "#facc15", "#f97316", "#ef4444"]);
  expect(count(r.parts, "bib").map(q => q.color)).toEqual([r.look.pants]);
  expect(count(r.parts, "strap").map(q => q.color)).toEqual([r.look.pants, r.look.pants]);
  expect(count(r.parts, "pantStripe"), "plain overalls have no stripes").toEqual([]);
  // the same in the wardrobe preview
  await page.evaluate(() => { const b = window.__bb; b.mode = "shop"; b.shopTab = "wardrobe"; });
  await frames(page);
  const pv = await page.evaluate(() => window.__bb.outfit3D("p1"));
  expect(pv.map(q => q.piece).sort()).toEqual(r.parts.map(q => q.piece).sort());
  // review: the bib lies OVER every jacket — its front is ahead of the zip, the stripe / belt / rainbow rings and the cape's star
  const over = [];
  for (const j of ["rainbow", "tshirt", "stripes", "purple", "pinkhoodie", "cape", "ninja", "sailor", "bluezip", "redzip", "magiccape", "trench"]) {
    await wear(j, "overalls");
    await frames(page);
    const c = await page.evaluate(() => window.__bb.bibClear("p1"));
    if (!c || c.bibFront < c.jacketFront + 0.01) over.push(`${j}: bib front ${c && c.bibFront} vs jacket ${c && c.jacketFront}`);
  }
  expect(over).toEqual([]);
  // detective coat + striped pants
  await wear("trench", "striped");
  await frames(page);
  const pv2 = await page.evaluate(() => window.__bb.outfit3D("p1"));
  await play(page, "park", 1);
  await frames(page);
  r = await page.evaluate(() => ({ parts: window.__bb.outfit3D(0), look: window.__bb.littles[0].look }));
  expect([r.look.pattern, r.look.long]).toEqual(["belt", true]);
  expect(count(r.parts, "hem").map(q => q.color)).toEqual([r.look.shirt]);
  const stripes = count(r.parts, "pantStripe");
  expect(stripes.length, "stripes on both legs").toBeGreaterThanOrEqual(6);
  expect(new Set(stripes.map(q => q.color))).toEqual(new Set(["#facc15"]));
  expect(count(r.parts, "band").length + count(r.parts, "bib").length).toBe(0);
  expect(pv2.map(q => q.piece).sort()).toEqual(r.parts.map(q => q.piece).sort());
  // an old look builds none of the new parts
  const old = await page.evaluate(() => { const b = window.__bb; return b.littles.slice(1).filter(l => !l.look.bands && !l.look.long && !l.look.overalls && !l.look.pantStripes).map((l, i) => b.outfit3D(b.littles.indexOf(l)).length); });
  expect(old.every(n => n === 0)).toBe(true);
  expect(errors).toEqual([]);
});

// SPEC-041 AC 10: the 3D ninja band matches its wardrobe picture (hat_ninja): a black band with two short red tails at the back
test("the ninja band is a black band with two short red tails at the back, in play and in the wardrobe preview", async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { const b = window.__bb, W = b.wardrobe(); b.progress.owned.hats.push("headband"); b.cycleOutfit("p1", "hat", W.hat.findIndex(q => q.id === "headband") - b.outfits.shown.p1.hat); });
  await play(page, "park", 1);
  await frames(page);
  const read = who => page.evaluate(w => ({ parts: window.__bb.hat3D(w), want: window.__bb.CFG.HEADBAND_LOOK }), who);
  const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  for (const [where, who] of [["in play", 0], ["in the wardrobe preview", "p1"]]) {
    if (who === "p1") { await page.evaluate(() => { const b = window.__bb; b.mode = "shop"; b.shopTab = "wardrobe"; }); await frames(page); }
    const r = await read(who), band = r.parts.filter(q => q.piece === "band"), tails = r.parts.filter(q => q.piece === "tail");
    expect(band.length, `${where}: one band`).toBe(1);
    expect(tails.length, `${where}: two tails`).toBe(2);
    expect(band[0].color, `${where}: the band colour is the LOOK colour`).toBe(r.want.band);
    expect(Math.max(...rgb(band[0].color)), `${where}: the band is black`).toBeLessThan(60);
    for (const t of tails) {
      const [R, G, B] = rgb(t.color);
      expect(t.color, `${where}: a tail colour is the LOOK colour`).toBe(r.want.tailColor);
      expect([R > 200, G < 100, B < 100], `${where}: a tail is red`).toEqual([true, true, true]);
      expect(t.z, `${where}: the tails are at the back of the head`).toBeLessThan(-0.2);
    }
  }
  expect(errors).toEqual([]);
});

// SPEC-041 AC 11: the overalls' strap arcs end above the cape line — with overalls and a resting cape (cape, magiccape) no strap vertex
// lies behind the cape's front surface; without a cape nothing changes (two straps, the same colour)
test("overalls straps stop above the cape: nothing behind the cape cloth (cape, magiccape; in play and in the wardrobe preview)", async ({ page }) => {
  const errors = await openGame(page);
  const wear = (jacket, pants) => page.evaluate(([j, p]) => {
    const b = window.__bb, W = b.wardrobe(), o = b.progress.owned;
    o.jackets.push(j); o.pants.push(p);
    b.cycleOutfit("p1", "jacket", W.jacket.findIndex(q => q.id === j) - b.outfits.shown.p1.jacket);
    b.cycleOutfit("p1", "pants", W.pants.findIndex(q => q.id === p) - b.outfits.shown.p1.pants);
  }, [jacket, pants]);
  const bad = [];
  for (const j of ["cape", "magiccape"]) {
    await wear(j, "overalls");
    await play(page, "park", 1);
    await frames(page);
    const play0 = await page.evaluate(() => window.__bb.capeClear(0));
    await page.evaluate(() => { const b = window.__bb; b.mode = "shop"; b.shopTab = "wardrobe"; });
    await frames(page);
    const prev = await page.evaluate(() => window.__bb.capeClear("p1"));
    for (const [where, c] of [["in play", play0], ["in the wardrobe preview", prev]]) {
      if (!c) { bad.push(`${j} ${where}: no straps or no cape`); continue; }
      if (!(c.covered > 0) || !Number.isFinite(c.strapBack)) bad.push(`${j} ${where}: no strap vertex was measured (covered ${c.covered}), the check would pass for nothing`);
      else if (!(c.strapBack >= c.capeFront)) bad.push(`${j} ${where}: a strap vertex at z ${c.strapBack} is behind the cape front ${c.capeFront}`);
    }
    // the straps are still there, over the shoulders: the arc reaches past the top of the body (the front end is on the chest)
    const parts = await page.evaluate(() => window.__bb.outfit3D("p1").filter(q => q.piece === "strap"));
    if (parts.length !== 2) bad.push(`${j}: ${parts.length} straps`);
    await page.evaluate(() => { window.__bb.mode = "home"; });
  }
  expect(bad).toEqual([]);
  expect(errors).toEqual([]);
});

// SPEC-012 review: a glove change re-dresses the shown game (no rebuild of the level) — the kid's 3D model wears the new mittens at
// once: mittens red, mega pink, none — no glove parts
test("equipping a glove re-dresses the kid in the menus", async ({ page }) => {
  const errors = await openGame(page);
  const gloves = async kind => page.evaluate(k => {
    const b = window.__bb;
    b.progress.inv.mittens = 3; b.progress.inv.mega = 3;
    b.setEquip(0, k);
    const m = b.model(0);
    return { n: m.gloveParts.length, color: m.gloveParts[0] ? "#" + m.gloveParts[0].material.color.getHexString() : null, want: k === "none" ? null : b.GLOVES[k].color };
  }, kind);
  for (const k of ["mittens", "mega", "none"]) {
    const g = await gloves(k);
    expect([g.n > 0, g.color], k).toEqual(k === "none" ? [false, null] : [true, g.want]);   // mitten, cuff and thumb on each hand
  }
  expect(errors).toEqual([]);
});
