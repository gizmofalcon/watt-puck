// A live Watt for the web: the puck's faces drawn on a canvas the way the firmware draws them
// (466 units across), turned by dragging it round and tapped by clicking it.
//
//   const puck = new Puck(canvas, { face: "home" });
//   puck.setFace("pong");  puck.onChange = (puck) => ...;  puck.onInput = ({ type, deg, auto }) => ...
//
// Faces: home, volume, trackpad, pointer, claude, dialkit, allow, call, focus, pong, spin, picker.
// `live: false` draws once (call paint() again to redraw); `bare: true` leaves out the case,
// for the little faces in the notch's picker.

const C = { y: "#FFD60A", w: "#F5F5F7", g1: "#8E8E93", g2: "#5A5A5E", g3: "#2C2C2E", g4: "#1C1C1E" };
const TOP = -Math.PI / 2;
const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clamp01 = (v) => clamp(v, 0, 1);
// Nunito, as on the puck itself (the firmware's faces are set in it)
const ROUND = '"Nunito", ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
const MONO = '"Roboto Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const font = (w, s, mono = false) => `${w} ${s}px ${mono ? MONO : ROUND}`;

function text(c, s, x, y, f, col, track = 0) {
  c.font = f; c.fillStyle = col; c.textAlign = "center"; c.textBaseline = "middle";
  if ("letterSpacing" in c) c.letterSpacing = `${track}px`;
  c.fillText(s, x, y);
  if ("letterSpacing" in c) c.letterSpacing = "0px";
}
function tick(c, a, r1, r2, col, lw) {
  c.strokeStyle = col; c.lineWidth = lw; c.lineCap = "round";
  c.beginPath(); c.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); c.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); c.stroke();
}
function arc(c, r, a0, a1, col, lw) { c.strokeStyle = col; c.lineWidth = lw; c.lineCap = "round"; c.beginPath(); c.arc(0, 0, r, a0, a1); c.stroke(); }
function disc(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
function glow(c, col, blur, fn) { c.save(); c.shadowColor = col; c.shadowBlur = blur * c.k; fn(); c.restore(); }

let digitWidth = {};
// Text is measured before the web fonts arrive: measure again once they have
if (typeof document !== "undefined" && document.fonts) document.fonts.ready.then(() => { digitWidth = {}; });
// Digits roll like a mechanical counter
function odo(c, v, x, y, size, col, minDigits = 1) {
  c.font = font(800, size); c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = col;
  const dw = digitWidth[size] ?? (digitWidth[size] = Math.max(..."0123456789".split("").map((d) => c.measureText(d).width)) * 0.92);
  const n = Math.max(minDigits, String(Math.floor(v + 1e-6)).length), w = dw * n, lh = size * 1.02;
  c.save(); c.beginPath(); c.rect(x - w / 2 - 12, y - lh * 0.55, w + 24, lh * 1.1); c.clip();
  for (let k = 0; k < n; k++) {
    const p = Math.pow(10, k), d = Math.floor(v / p) % 10;
    const roll = k === 0 ? v - Math.floor(v) : clamp01((v % p) - (p - 1));
    const cx = x + w / 2 - dw * (k + 0.5);
    c.fillText(String(d), cx, y + 2 - roll * lh);
    c.fillText(String((d + 1) % 10), cx, y + 2 + (1 - roll) * lh);
  }
  c.restore();
}

// The faces the side button cycles through, in the order the puck lists them
export const PICKS = [["home", "Home"], ["trackpad", "Trackpad"], ["claude", "Claude"], ["focus", "Focus"], ["spin", "Spin"], ["pong", "Pong"]];

export class Puck {
  constructor(canvas, { face = "home", interactive = true, live = true, bare = false } = {}) {
    this.cv = canvas;
    this.c = canvas.getContext("2d");
    this.face = face;
    this.prevFace = face;
    this.bare = bare;
    this.wipeAt = -1e9;
    this.turnAngle = 0;          // how far the body has been turned (the rim shows it)
    this.lastTurn = -1e9;
    this.lastInput = -1e9;
    this.onChange = null;
    this.onInput = null;
    this.s = {
      vol: 38, shownVol: 38, playing: true, morph: 0,
      look: 0, lookY: 0, lookTX: 0, lookTY: 0, blinkAt: 2, blinkStart: -9, hop: -9,
      touch: [0, 0], touchA: 0, scrollAt: -9, clickAt: -9,
      listening: false, sentAt: -9, amp: 0,
      dk: 180, dkShown: 180, dkAcc: 0,
      deny: false, allowedAt: -9,
      muted: true,
      focusSet: 25 * 60, focusLeft: 25 * 60, focusRun: false, focusAcc: 0,
      pong: { paddle: 90, bx: 0, by: 0, vx: 0, vy: 0, score: 0, missAt: -9, flashAt: -9, hitAt: 0, trail: [], auto: true },
      spin: { deg: 30, vel: 0, stopAt: -9 },
      pick: { idx: 0, acc: 0 },
    };
    this.pongServe();
    this.t0 = performance.now();
    this.last = 0;
    this.now = 0;
    this.resize();
    new ResizeObserver(() => { this.resize(); if (!live) this.paint(); }).observe(canvas);
    if (interactive) this.bind();
    if (!live) {
      this.paint();
      document.fonts?.ready.then(() => this.paint());
      return;
    }
    window.addEventListener("pointermove", (e) => this.lookAt(e.clientX, e.clientY), { passive: true });
    const loop = (now) => { this.frame((now - this.t0) / 1000); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  /// Draw once, for a puck that isn't running
  paint() { this.draw(this.now, 0); }

  // ---- size and input

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5), r = this.cv.getBoundingClientRect();
    // a little face in the notch is scaled by its page, so draw it with room to spare
    const w = this.bare ? this.cv.offsetWidth * 1.6 : r.width;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(w * dpr);
  }

  angleAt(e) {
    const r = this.cv.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  }

  // Where on the glass, in face units
  faceXY(e) {
    const r = this.cv.getBoundingClientRect(), k = (r.width / 2) * 0.79 / 233;
    return [(e.clientX - (r.left + r.width / 2)) / k, (e.clientY - (r.top + r.height / 2)) / k];
  }

  bind() {
    const cv = this.cv;
    cv.style.touchAction = "none";
    cv.style.cursor = "grab";
    let drag = null;
    cv.addEventListener("pointerdown", (e) => {
      try { cv.setPointerCapture(e.pointerId); } catch {}
      drag = { a: this.angleAt(e), total: 0, t: performance.now() };
      cv.style.cursor = "grabbing";
    });
    cv.addEventListener("pointermove", (e) => {
      const [x, y] = this.faceXY(e);
      this.s.touch = [x, y];
      this.hover = Math.hypot(x, y) < 233;
      if (!drag) return;
      const a = this.angleAt(e);
      let d = ((a - drag.a) * 180) / Math.PI;
      if (d > 180) d -= 360; else if (d < -180) d += 360;
      drag.a = a;
      drag.total += Math.abs(d);
      if (drag.total > 3) this.turn(d);
    });
    const up = (e) => {
      if (!drag) return;
      const wasTap = drag.total < 4 && performance.now() - drag.t < 500;
      drag = null;
      cv.style.cursor = "grab";
      if (wasTap) this.tap();
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("pointerleave", () => { this.hover = false; });
    cv.tabIndex = 0;
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", "A live Watt puck. Drag to turn it, click to tap it, or use the arrow keys and space.");
    cv.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowUp") { this.turn(12); e.preventDefault(); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { this.turn(-12); e.preventDefault(); }
      else if (e.key === " " || e.key === "Enter") { this.tap(); e.preventDefault(); }
    });
  }

  lookAt(x, y) {
    const r = this.cv.getBoundingClientRect();
    const dx = (x - (r.left + r.width / 2)) / Math.max(r.width, 1), dy = (y - (r.top + r.height / 2)) / Math.max(r.width, 1);
    this.s.lookTX = clamp(dx * 26, -24, 24);
    this.s.lookTY = clamp(dy * 20, -16, 16);
  }

  setFace(face, byUser = false) {
    if (face === this.face) return;
    this.prevFace = this.shownFace();
    this.face = face;
    this.wipeAt = this.now;
    if (byUser) this.lastInput = this.now;
    if (face === "pong") { this.s.pong.score = 0; this.s.pong.auto = true; this.pongServe(); }
    if (face === "allow") { this.s.deny = false; this.s.allowedAt = -9; }
    if (face === "claude") { this.s.listening = false; this.s.sentAt = -9; }
    if (face === "picker") this.s.pick.acc = 0;
    this.onChange?.(this);
  }

  // Home shows the volume while the knob is being turned, as the real one does
  shownFace() {
    if (this.face === "home" && this.now - this.lastTurn < 1.6) return "volume";
    return this.face;
  }

  /// Seconds since someone last touched it
  get idle() { return (this.now ?? 0) - this.lastInput; }

  // ---- what turning and tapping do

  // `auto`: a demo moving it, not a person (doesn't count as someone playing with it)
  turn(deg, auto = false) {
    const s = this.s, now = this.now;
    this.turnAngle += deg;
    this.lastTurn = now;
    if (!auto) this.lastInput = now;
    switch (this.face) {
      case "home": s.vol = clamp(s.vol + deg * 0.35, 0, 100); break;
      case "trackpad": s.scrollAt = now; break;
      case "dialkit":
        s.dkAcc += deg;
        while (Math.abs(s.dkAcc) >= 6) { const d = Math.sign(s.dkAcc); s.dkAcc -= d * 6; s.dk = clamp(s.dk + d * 10, 0, 500); }
        break;
      case "allow": if (Math.abs(deg) > 1.5) s.deny = deg < 0; break;
      case "focus":
        if (!s.focusRun) {
          s.focusAcc += deg;
          while (Math.abs(s.focusAcc) >= 14) { const d = Math.sign(s.focusAcc); s.focusAcc -= d * 14; s.focusSet = clamp(s.focusSet + d * 300, 300, 5400); }
          s.focusLeft = s.focusSet;
        }
        break;
      case "pong": if (!auto) { s.pong.auto = false; s.pong.paddle = (s.pong.paddle + deg + 3600) % 360; } break;
      case "spin": s.spin.deg = (s.spin.deg + deg + 3600) % 360; break;
      case "picker":  // one face per 24 degrees, and it stops at the ends, as on the puck
        s.pick.acc += deg;
        while (Math.abs(s.pick.acc) >= 24) {
          const d = Math.sign(s.pick.acc);
          s.pick.acc -= d * 24;
          s.pick.idx = clamp(s.pick.idx + d, 0, PICKS.length - 1);
        }
        break;
    }
    this.onChange?.(this);
    this.onInput?.({ type: "turn", deg, auto });
  }

  tap(auto = false) {
    const s = this.s, now = this.now;
    if (!auto) this.lastInput = now;
    s.hop = now;
    switch (this.face) {
      case "home": s.playing = !s.playing; break;
      case "pointer": s.clickAt = now; break;
      case "claude":
        if (s.listening) { s.listening = false; s.sentAt = now; } else { s.listening = true; s.sentAt = -9; }
        break;
      case "allow": s.allowedAt = now; break;
      case "call": s.muted = !s.muted; break;
      case "focus": s.focusRun = !s.focusRun; break;
      case "spin": s.spin.vel = 720 + Math.random() * 540; s.spin.stopAt = -9; break;
    }
    this.onChange?.(this);
    this.onInput?.({ type: "tap", auto });
  }

  /// The button on the side of the case: opens the faces, and picks one
  side(auto = false) {
    if (!auto) this.lastInput = this.now;
    this.s.hop = this.now;
    this.onInput?.({ type: "side", auto });
  }

  // ---- pong, as on the puck: two paddles opposite each other, turning as one

  pongServe() {
    const p = this.s.pong, a = rad(p.paddle + (Math.random() < 0.5 ? 180 : 0) + Math.random() * 40 - 20);
    p.bx = p.by = 0; p.vx = Math.sin(a) * 190; p.vy = -Math.cos(a) * 190; p.trail = [];
  }

  pongStep(dt, now) {
    const p = this.s.pong;
    if (p.missAt > 0) { if (now - p.missAt > 0.9) { p.missAt = -9; p.score = 0; this.pongServe(); } return; }
    const clock = (x, y) => ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
    if (p.auto) {
      const target = clock(p.bx + p.vx * 0.3, p.by + p.vy * 0.3);
      const d = ((target - p.paddle + 810) % 180) - 90;
      p.paddle = (p.paddle + clamp(d, -320 * dt, 320 * dt) + 360) % 360;
    }
    p.trail.unshift([p.bx, p.by]); p.trail.length = Math.min(p.trail.length, 5);
    p.bx += p.vx * dt; p.by += p.vy * dt;
    const r = Math.hypot(p.bx, p.by);
    if (r < 182) return;
    const hard = Math.min(p.score / 30, 1), half = 23 - 9 * hard;
    const a = clock(p.bx, p.by), off = ((a - p.paddle + 810) % 180) - 90;
    if (Math.abs(off) <= half) {
      p.score++;
      const nx = p.bx / r, ny = p.by / r, sp = 190 + 290 * Math.min(p.score / 30, 1);
      const steer = rad((off / half) * (11 + 7 * hard) + (Math.random() * 2 - 1) * (3 + 4 * hard));
      const ix = -nx, iy = -ny, cs = Math.cos(steer), sn = Math.sin(steer);
      p.vx = (ix * cs - iy * sn) * sp; p.vy = (ix * sn + iy * cs) * sp;
      p.bx = nx * 181; p.by = ny * 181;
      p.flashAt = now; p.hitAt = a - off;
    } else {
      p.missAt = now;
    }
  }

  // ---- a frame

  frame(now) {
    const dt = Math.min(now - this.last, 0.05), s = this.s;
    this.last = now;
    this.now = now;

    // eyes: glance at the pointer, blink now and then
    s.look += (s.lookTX - s.look) * 0.14;
    s.lookY += (s.lookTY - s.lookY) * 0.14;
    if (now >= s.blinkAt) { s.blinkStart = now; s.blinkAt = now + 2.6 + Math.random() * 3.8; }
    const bk = (now - s.blinkStart) / 0.16, blink = bk < 1 ? 1 - Math.abs(2 * bk - 1) : 0;
    // numbers settle on whole values
    s.shownVol += (Math.round(s.vol) - s.shownVol) * (1 - Math.exp(-dt / 0.05));
    if (Math.abs(Math.round(s.vol) - s.shownVol) < 0.02) s.shownVol = Math.round(s.vol);
    s.dkShown += (s.dk - s.dkShown) * (1 - Math.exp(-dt / 0.05));
    if (Math.abs(s.dk - s.dkShown) < 0.05) s.dkShown = s.dk;
    s.morph += ((s.playing ? 0 : 1) - s.morph) * (1 - Math.exp(-dt / 0.07));
    s.touchA += ((this.hover && this.face === "trackpad" ? 1 : 0) - s.touchA) * 0.2;
    s.amp += ((s.listening ? 1 : 0.14) - s.amp) * 0.12;
    if (s.focusRun) { s.focusLeft = Math.max(0, s.focusLeft - dt); if (s.focusLeft === 0) s.focusRun = false; }
    if (this.face === "pong") this.pongStep(dt, now);
    const sp = s.spin;
    if (sp.vel > 0) {
      sp.deg = (sp.deg + sp.vel * dt) % 360;
      sp.vel -= (sp.vel * 0.55 + 60) * dt;
      if (sp.vel <= 0) { sp.vel = 0; sp.stopAt = now; }
    }
    if (this.face === "allow" && s.allowedAt > 0 && now - s.allowedAt > 1.6) { s.allowedAt = -9; s.deny = false; }

    this.draw(now, blink);
  }

  draw(now, blink) {
    const c = this.c, W = this.cv.width, half = W / 2;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, W);
    c.translate(half, half);

    if (this.bare) { this.glass(half / 233, now, blink); return; }  // just the glass, edge to edge

    // the body: turned aluminium, catching light as it turns
    const rim = c.createConicGradient(rad(this.turnAngle - 40), 0, 0);
    [[0, 0.93], [0.12, 0.6], [0.25, 0.86], [0.38, 0.5], [0.5, 0.9], [0.62, 0.56], [0.75, 0.84], [0.88, 0.48], [1, 0.93]]
      .forEach(([p, v]) => rim.addColorStop(p, `rgb(${v * 232}, ${v * 234}, ${v * 240})`));
    c.fillStyle = rim; c.beginPath(); c.arc(0, 0, half * 0.995, 0, 7); c.fill();
    c.fillStyle = "#050506"; c.beginPath(); c.arc(0, 0, half * 0.905, 0, 7); c.fill();
    // a groove in the rim, so a turn can be seen
    c.save(); c.rotate(rad(this.turnAngle + 55));
    c.fillStyle = "rgba(0,0,0,0.38)"; c.beginPath(); c.roundRect(half * 0.928, -half * 0.05, half * 0.044, half * 0.1, half * 0.022); c.fill();
    c.restore();

    this.glass((half * 0.79) / 233, now, blink);

    // a soft reflection across the glass
    const sheen = c.createLinearGradient(-half, -half, half * 0.4, half * 0.6);
    sheen.addColorStop(0, "rgba(255,255,255,0.07)"); sheen.addColorStop(0.45, "rgba(255,255,255,0)");
    c.fillStyle = sheen; c.beginPath(); c.arc(0, 0, half * 0.905, 0, 7); c.fill();
  }

  // The glass, `k` canvas pixels to a face unit: the face, and for a moment after a change the new
  // one sweeping in over the old
  glass(k, now, blink) {
    const c = this.c;
    c.k = k;
    c.save();
    c.scale(k, k);
    c.beginPath(); c.arc(0, 0, 233, 0, 7); c.clip();
    if (this.bare) { c.fillStyle = "#000"; c.fillRect(-240, -240, 480, 480); }
    const shown = this.shownFace();
    if (shown !== this.lastShown) {  // home <-> volume wipes too
      if (this.lastShown && this.wipeAt < now - 0.42) { this.prevFace = this.lastShown; this.wipeAt = now; }
      this.lastShown = shown;
    }
    const u = (now - this.wipeAt) / 0.42;
    if (u < 1) {
      this.drawFace(this.prevFace, now, blink);
      // the new face sweeps in clockwise from 12, like a clock hand
      const sweep = Math.PI * 2 * (1 - (1 - u) * (1 - u));
      c.save();
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 240, TOP, TOP + sweep); c.closePath(); c.clip();
      c.fillStyle = "#000"; c.fillRect(-240, -240, 480, 480);
      this.drawFace(shown, now, blink);
      c.restore();
    } else {
      this.drawFace(shown, now, blink);
    }
    c.restore();
  }

  drawFace(face, now, blink) {
    const c = this.c, s = this.s;
    const hop = now - s.hop < 0.38 ? -12 * Math.sin((Math.PI * (now - s.hop)) / 0.38) : 0;
    switch (face) {
      case "home": {
        // the eyes are the pause sign: paused, they slide together into a play triangle
        const m = s.morph, w = 60, h = Math.max(12, 140 * (1 - blink * (1 - m)));
        c.save(); c.translate(s.look * (1 - 0.6 * m), s.lookY * (1 - 0.6 * m) + hop);
        glow(c, "rgba(255,255,255,0.55)", 26, () => {
          c.fillStyle = C.w;
          if (m < 0.98) {
            c.globalAlpha = 1 - m;
            for (const d of [-1, 1]) { c.beginPath(); c.roundRect(d * 80 * (1 - 0.6 * m) - w / 2, -8 - h / 2, w, h, w / 2); c.fill(); }
          }
          if (m > 0.02) {
            c.globalAlpha = m;
            const k = 0.6 + 0.4 * m;
            c.lineJoin = "round"; c.lineWidth = 28; c.strokeStyle = C.w;
            c.beginPath(); c.moveTo(-44 * k, -8 - 54 * k); c.lineTo(58 * k, -8); c.lineTo(-44 * k, -8 + 54 * k); c.closePath(); c.fill(); c.stroke();
          }
          c.globalAlpha = 1;
        });
        c.restore();
        break;
      }
      case "volume": {
        const v = s.shownVol;
        for (let i = 0; i <= 50; i++) {
          const tv = i * 2, on = tv <= v + 1e-6, fresh = on ? clamp01(1 - (v - tv) / 7) : 0;
          tick(c, rad(135 + (270 * i) / 50), on ? 186 - 6 * fresh : 193, 214, on ? C.y : C.g3, 7);
        }
        glow(c, "rgba(255,214,10,0.75)", 18, () => tick(c, rad(135 + (270 * s.vol) / 100), 172, 222, C.y, 10));
        text(c, "VOLUME", 0, -98, font(700, 21), C.g1, 3.5);
        odo(c, v, 0, 6, 160, C.w, 2);
        text(c, "Slow Orbit · Low Hum", 0, 100, font(600, 20), C.g1);
        break;
      }
      case "trackpad": {
        const [tx, ty] = s.touch, ta = s.touchA;
        for (let y = -13 * 26; y <= 13 * 26; y += 26) for (let x = -13 * 26; x <= 13 * 26; x += 26) {
          if (Math.hypot(x, y) > 222) continue;
          const l = ta * Math.max(0, 1 - Math.hypot(x - tx, y - ty) / 124);
          disc(c, x, y, 2.6 + 2.4 * l * l, l > 0.01 ? `rgba(245,245,247,${0.16 + 0.72 * l * l})` : C.g3);
        }
        if (ta > 0.01) {
          const g = c.createRadialGradient(tx, ty, 0, tx, ty, 66);
          g.addColorStop(0, `rgba(255,255,255,${0.95 * ta})`); g.addColorStop(0.3, `rgba(255,255,255,${0.42 * ta})`); g.addColorStop(1, "rgba(255,255,255,0)");
          c.fillStyle = g; c.beginPath(); c.arc(tx, ty, 66, 0, 7); c.fill();
        }
        text(c, "TRACKPAD", 0, -176, font(700, 20), C.g1, 3.5);
        const sa = clamp01(1 - (now - s.scrollAt) / 0.8);
        if (sa > 0.01) { c.globalAlpha = sa; const a = rad(this.turnAngle - 90); glow(c, "rgba(255,214,10,0.6)", 12, () => arc(c, 214, a - rad(14), a + rad(14), C.y, 10)); c.globalAlpha = 1; }
        break;
      }
      case "pointer": {
        const tap = clamp01(1 - (now - s.clickAt) / 0.42);  // a click rings out from the dot
        arc(c, 64, 0, 7, "rgba(245,245,247,0.5)", 3);
        arc(c, 122, 0, 7, "rgba(245,245,247,0.16)", 3);
        for (let i = 0; i < 4; i++) tick(c, (i * Math.PI) / 2, 82, 104, C.w, 5);
        if (tap > 0) arc(c, 20 + 120 * (1 - tap), 0, 7, `rgba(255,214,10,${tap})`, 6);
        glow(c, "rgba(255,214,10,0.8)", 22, () => disc(c, 0, 0, 17 * (1 + 0.5 * tap), C.y));
        text(c, "POINTER", 0, -164, font(700, 20), C.g1, 3.5);
        text(c, "tap to click · hold for menu", 0, 166, font(600, 18), C.g2);
        break;
      }
      case "claude": {
        const sent = now - s.sentAt < 1.6;
        for (let i = 0; i < 96; i++) {
          const e = Math.abs(Math.sin(i * 0.61 + now * 9) * 0.6 + Math.sin(i * 0.17 - now * 5) * 0.4);
          const amp = s.amp * (0.12 + 0.88 * e * (0.55 + 0.45 * Math.sin(i * 0.05 + now * 2)));
          c.globalAlpha = 0.3 + 0.7 * clamp01(amp);
          tick(c, TOP + (i / 96) * Math.PI * 2, 132, 146 + amp * 66, C.y, 6);
        }
        c.globalAlpha = 1;
        text(c, sent ? "Sent" : s.listening ? "Listening" : "Tap to talk", 0, -12, font(700, 42), C.w, -0.5);
        text(c, "to Claude", 0, 32, font(600, 22), C.g1);
        break;
      }
      case "dialkit": {
        const v = s.dkShown, f = s.dk / 500;
        for (let i = 0; i <= 100; i++) {
          const ff = i / 100, major = i % 10 === 0, on = ff <= f + 1e-6;
          tick(c, rad(120 + 300 * ff), major ? 188 : 199, 214, on ? C.y : major ? C.g2 : C.g3, major ? 4.5 : 3);
        }
        glow(c, "rgba(255,214,10,0.75)", 16, () => tick(c, rad(120 + 300 * f), 174, 222, C.y, 9));
        text(c, "stiffness", 0, -94, font(600, 28), C.g1);
        odo(c, v, 0, 4, 138, C.w, 2);
        text(c, "spring · card", 0, 86, font(600, 20), C.g2);
        [0, 1, 2].forEach((i) => disc(c, -18 + i * 18, 128, 4.5, i === 0 ? C.w : C.g2));
        break;
      }
      case "allow": {
        const done = s.allowedAt > 0;
        glow(c, "rgba(255,214,10,0.5)", 12, () => arc(c, 214, 0, 7, "rgba(255,214,10,0.55)", 4));
        text(c, "Claude Code wants to run", 0, -106, font(600, 22), C.g1);
        c.fillStyle = C.g4; c.beginPath(); c.roundRect(-140, -72, 280, 62, 16); c.fill();
        text(c, s.cmd ?? "npm test", 0, -40, font(500, 32, true), C.w);
        text(c, done ? (s.deny ? "Denied" : "Allowed") : s.deny ? "Deny?" : "Allow?", 0, 48, font(800, 66), s.deny ? C.w : C.y, -1);
        if (!done) text(c, s.deny ? "tap to deny · turn forward to allow" : "tap to allow · turn back to deny", 0, 114, font(600, 18), C.g2);
        break;
      }
      case "call": {
        const col = s.muted ? C.g1 : C.w;
        c.save(); c.translate(0, -30);
        c.strokeStyle = col; c.lineWidth = 11; c.lineCap = "round";
        c.beginPath(); c.roundRect(-30, -90, 60, 122, 30); c.stroke();
        c.beginPath(); c.arc(0, 0, 62, 0.06 * Math.PI, 0.94 * Math.PI); c.stroke();
        c.beginPath(); c.moveTo(0, 62); c.lineTo(0, 90); c.stroke();
        if (s.muted) {
          c.strokeStyle = "#000"; c.lineWidth = 28; c.beginPath(); c.moveTo(-72, -96); c.lineTo(72, 86); c.stroke();
          c.strokeStyle = C.w; c.lineWidth = 11; c.beginPath(); c.moveTo(-72, -96); c.lineTo(72, 86); c.stroke();
        }
        c.restore();
        text(c, s.muted ? "Muted" : "Mic on", 0, 116, font(800, 40), s.muted ? C.w : C.y, -0.5);
        text(c, s.muted ? "tap to talk" : "tap to mute", 0, 158, font(600, 19), C.g2);
        break;
      }
      case "focus": {
        const f = s.focusLeft / s.focusSet, m = Math.floor(s.focusLeft / 60), sec = Math.floor(s.focusLeft % 60);
        arc(c, 206, 0, 7, C.g3, 12);
        if (f > 0.003) glow(c, "rgba(255,214,10,0.5)", s.focusRun ? 14 : 8, () => arc(c, 206, TOP, TOP + f * Math.PI * 2 - 0.001, C.y, 12));
        text(c, "FOCUS", 0, -90, font(700, 21), C.g1, 3.5);
        text(c, `${m}:${String(sec).padStart(2, "0")}`, 0, 8, font(800, 120), C.w, -3);
        text(c, s.focusRun ? "tap to pause" : s.focusLeft < s.focusSet ? "tap to resume" : "turn to set · tap to start", 0, 94, font(600, 18), C.g2);
        break;
      }
      case "pong": {
        const p = s.pong, hard = Math.min(p.score / 30, 1), vis = 19 - 9 * hard;
        c.setLineDash([3, 14]); arc(c, 72, 0, 7, C.g3, 4); c.setLineDash([]);
        odo(c, p.score, 0, 4, 96, "#3A3A3C");
        for (const k of [0, 180]) {
          const pa = rad(p.paddle + k - 90);
          glow(c, "rgba(255,214,10,0.6)", 16, () => arc(c, 204, pa - rad(vis), pa + rad(vis), C.y, 17));
        }
        const fl = clamp01(1 - (now - p.flashAt) / 0.22);
        if (fl > 0) { const pa = rad(p.hitAt - 90); arc(c, 204, pa - rad(vis + 5), pa + rad(vis + 5), `rgba(255,255,255,${fl * 0.8})`, 24); }
        if (p.missAt < 0) {
          p.trail.forEach(([x, y], i) => disc(c, x, y, 10 - 1.5 * i, `rgba(255,255,255,${0.27 - i * 0.05})`));
          glow(c, "rgba(255,255,255,0.6)", 14, () => disc(c, p.bx, p.by, 12, C.w));
        }
        if (p.auto) text(c, "turn to play", 0, 124, font(600, 18), C.g2);
        break;
      }
      case "spin": {
        const sp = s.spin, a = rad(sp.deg - 90);
        for (let i = 0; i < 16; i++) tick(c, (i * Math.PI) / 8, 204, 216, C.g3, 4);
        const settle = clamp01(1 - (now - sp.stopAt) / 4);
        if (sp.vel === 0 && settle > 0) { c.globalAlpha = settle; glow(c, "rgba(255,214,10,0.7)", 18, () => arc(c, 210, a - rad(9), a + rad(9), C.y, 14)); c.globalAlpha = 1; }
        glow(c, "rgba(255,214,10,0.7)", 16, () => tick(c, a, 30, 182, C.y, 10));
        disc(c, 0, 0, 20, C.w);
        if (sp.vel === 0 && settle <= 0) text(c, "spin me, or tap", 0, 150, font(600, 18), C.g2);
        break;
      }
      case "picker": {
        // a dot for each face along the top, the chosen one in yellow; the face itself in the middle
        const p = s.pick, n = PICKS.length;
        PICKS.forEach((_, i) => {
          const a = TOP + rad((i - (n - 1) / 2) * 12), on = i === p.idx;
          disc(c, Math.cos(a) * 204, Math.sin(a) * 204, on ? 9 : 5.5, on ? C.y : C.g2);
        });
        const [id, name] = PICKS[p.idx];
        c.save(); c.translate(0, -26);
        c.beginPath(); c.arc(0, 0, 98, 0, 7); c.clip();
        c.scale(0.42, 0.42);
        this.drawFace(id, now, blink);
        c.restore();
        c.strokeStyle = C.g3; c.lineWidth = 3; c.beginPath(); c.arc(0, -26, 98, 0, 7); c.stroke();
        text(c, name, 0, 112, font(800, 44), C.w, -0.5);
        text(c, "turn to choose · click to switch", 0, 160, font(600, 18), C.g2);
        break;
      }
    }
  }
}
