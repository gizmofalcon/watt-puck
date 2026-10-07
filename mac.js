// The hero: a MacBook running Watt, and a live puck on the desk beside it. Turn or tap the puck
// and the Mac answers the way the app does, in the notch and in the app the puck is driving.
//
// Everything on the screen is laid out in points on an 800 x 520 screen and scaled to fit, so the
// notch keeps the app's own sizes and shapes (the Mac app's design snapshots were the reference).

// (the ?v= is stamped by tools/publish-site.sh, so a page never mixes scripts from two versions)
import { Puck, PICKS } from "./puck.js?v=0313ebddf9";

const SCENES = {
  music: { chip: "Music", face: "home", app: "Music", win: "music",
    say: "Turn for volume. Tap to pause." },
  modes: { chip: "Faces", face: "picker", app: "Finder", win: null,
    say: "Click the side button, turn, click to switch faces." },
  claude: { chip: "Claude", face: "claude", app: "Claude", win: "chat",
    say: "Tap and talk to Claude. Tap again to send." },
  code: { chip: "Claude Code", face: "allow", app: "Terminal", win: "term",
    say: "Claude Code asks first. Tap to allow." },
  dialkit: { chip: "DialKit", face: "dialkit", app: "Safari", win: "web",
    say: "Turn to tune a DialKit value." },
};
const ORDER = Object.keys(SCENES);

// Notch sizes in points: [width, height, bottom corner radius], from the app's NotchView
const NOTCH = { w: 190, h: 34 };
const SIZE = {
  idle: [190, 34, 8], eyes: [216, 91, 32], vol: [362, 34, 14], track: [430, 84, 22], ears: [462, 38, 16],
  transcript: [462, 0, 22], allow: [346, 165, 40], picker: [470, 185, 46], msg: [402, 68, 14],
};

const SAY = ["Rename the spring presets and run the tests", "Make the volume ticks snap to whole numbers", "What changed in the notch code today?"];
const REPLY = ["Renaming them now. Then I'll run the tests and fix anything that fails.",
  "Done. The ticks now land on whole numbers, and the readout matches the puck.",
  "Two things: the transcript grows with what you say, and the eyes leave after a second."];
const ASKS = [
  { cmd: "npm test", did: "42 passed in 1.8s", then: "All 42 tests pass." },
  { cmd: "git push", did: "main -> origin/main", then: "Pushed." },
];

const icon = {
  speaker: `<svg viewBox="0 0 20 16" width="17" height="14"><path d="M2 5.5h3l4-3.5v12l-4-3.5H2z" fill="#F5F5F7"/><path d="M12.5 5a4 4 0 0 1 0 6M15 2.8a7 7 0 0 1 0 10.4" fill="none" stroke="#F5F5F7" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  mic: `<svg viewBox="0 0 16 20" width="14" height="18"><rect x="4.5" y="1" width="7" height="11" rx="3.5" fill="#FFD60A"/><path d="M2 9a6 6 0 0 0 12 0M8 15v3.5M5 19h6" fill="none" stroke="#FFD60A" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  dial: `<svg viewBox="0 0 20 20" width="19" height="19"><circle cx="10" cy="10.5" r="5.6" fill="#F5F5F7"/><path d="M10 5.6v5" stroke="#000" stroke-width="1.8" stroke-linecap="round"/><g fill="#F5F5F7"><circle cx="10" cy="1.6" r="1"/><circle cx="2.2" cy="7.5" r="1"/><circle cx="17.8" cy="7.5" r="1"/><circle cx="3.6" cy="16.2" r="1"/><circle cx="16.4" cy="16.2" r="1"/></g></svg>`,
  eyes: `<svg viewBox="0 0 22 16" width="20" height="15"><rect x="3" y="1" width="5.5" height="14" rx="2.75" fill="#F5F5F7"/><rect x="13.5" y="1" width="5.5" height="14" rx="2.75" fill="#F5F5F7"/></svg>`,
  play: `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M8 5.5v13l11-6.5z" fill="#F5F5F7" stroke="#F5F5F7" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" width="30" height="30"><rect x="6.5" y="5" width="4" height="14" rx="1.6" fill="#F5F5F7"/><rect x="13.5" y="5" width="4" height="14" rx="1.6" fill="#F5F5F7"/></svg>`,
  skip: (back) => `<svg viewBox="0 0 24 24" width="22" height="22" style="${back ? "transform:scaleX(-1)" : ""}"><path d="M4 6v12l8-6zM12 6v12l8-6z" fill="#8E8E93"/></svg>`,
};

function screenHTML() {
  const lights = `<span class="tl"><i></i><i></i><i></i></span>`;
  return `
  <div class="wall"></div>
  <div class="menubar"><b id="m-app">Music</b><span>File</span><span>Edit</span><span>View</span><span class="clock">Fri 9:41</span></div>

  <div class="win" data-win="music">
    <div class="bar">${lights}<span class="title">Music</span></div>
    <div class="music">
      <div class="art"><i></i></div>
      <div class="meta">
        <b>Slow Orbit</b><span>Low Hum</span>
        <div class="prog"><i id="m-prog"></i></div>
        <div class="times"><span id="m-at">1:12</span><span>3:48</span></div>
        <div class="ctl">${icon.skip(true)}<span id="m-pp">${icon.pause}</span>${icon.skip(false)}</div>
        <div class="vol"><svg viewBox="0 0 20 16" width="13" height="11"><path d="M2 5.5h3l4-3.5v12l-4-3.5H2z" fill="#8E8E93"/></svg><div class="slider"><i id="m-vol"></i></div>${icon.speaker}</div>
      </div>
    </div>
  </div>

  <div class="win" data-win="chat">
    <div class="bar">${lights}<span class="title">Claude</span></div>
    <div class="chat"><div class="msgs" id="c-msgs"><p class="ai">Morning. What are we working on?</p></div>
      <div class="input"><span id="c-input">Reply to Claude</span><i class="rec" id="c-rec"></i></div></div>
  </div>

  <div class="win" data-win="term">
    <div class="bar">${lights}<span class="title">Terminal — claude</span></div>
    <div class="term" id="t-out"></div>
  </div>

  <div class="win" data-win="web">
    <div class="bar">${lights}<span class="url">localhost:3000</span></div>
    <div class="web">
      <div class="stagebox"><div class="track"><div class="card" id="w-card"></div></div><p>Spring preview</p></div>
      <div class="dk">
        <div class="dkhead">DialKit</div>
        <div class="row on"><span>stiffness</span><code id="w-stiff">180</code><div class="sl"><i id="w-sl"></i></div></div>
        <div class="row"><span>damping</span><code>14</code><div class="sl"><i style="width:28%"></i></div></div>
        <div class="row"><span>mass</span><code>1.0</code><div class="sl"><i style="width:20%"></i></div></div>
      </div>
    </div>
  </div>

  <div class="dock"><i></i><i></i><i></i><i class="watt"></i><i></i></div>

  <div class="notch" id="notch">
    <i class="ear l"></i><i class="ear r"></i>
    <div class="nbody">
      <div class="st" data-st="eyes"><div class="eyes" id="n-eyes"><i></i><i></i></div></div>
      <div class="st wings" data-st="vol"><div class="wl">${icon.speaker}</div><div></div>
        <div class="wr"><div class="vbar"><i id="n-vol"></i></div><b id="n-voln">62</b></div></div>
      <div class="st" data-st="track"><div class="wings top"><div class="wl"><span class="appicon"></span></div><div></div>
        <div class="wr"><span class="bars" id="n-bars"><i></i><i></i><i></i><i></i></span></div></div>
        <b class="t1">Slow Orbit</b><span class="t2">Low Hum · Music</span></div>
      <div class="st wings tall" data-st="ears"><div class="wl"><span id="n-eg"></span><b id="n-et"></b></div><div></div>
        <div class="wr"><span id="n-ev"></span></div></div>
      <div class="st" data-st="transcript"><div class="thead">${icon.mic}<b>Claude</b><span id="n-tl">Listening</span></div>
        <p class="ttext" id="n-tt"></p></div>
      <div class="st" data-st="allow"><p class="ask">Claude Code wants to run</p><code id="n-cmd">npm test</code>
        <div class="btns"><span class="deny" id="n-deny">Deny</span><span class="yes" id="n-yes">Allow</span></div></div>
      <div class="st" data-st="picker"><div class="coins" id="n-coins"></div><b class="pname" id="n-pname">Home</b><span class="phint">Click to switch</span></div>
      <div class="st" data-st="msg"><div class="wings top"><div class="wl">${icon.eyes}</div><div></div><div></div></div><b class="mtext" id="n-msg"></b></div>
    </div>
  </div>`;
}

class Notch {
  constructor(el) {
    this.el = el;
    this.states = Object.fromEntries([...el.querySelectorAll(".st")].map((s) => [s.dataset.st, s]));
    this.rest = "idle";
    this.flash = null;
    this.timer = 0;
    this.textH = 19;
    this.render();
  }

  setRest(st) { this.rest = st; if (!this.flash) this.render(); }

  show(st, ms) {
    clearTimeout(this.timer);
    this.flash = st;
    this.timer = setTimeout(() => { this.flash = null; this.render(); }, ms);
    this.render();
  }

  clearFlash() { clearTimeout(this.timer); this.flash = null; this.render(); }

  get current() { return this.flash ?? this.rest; }

  render() {
    const st = this.current;
    let [w, h, r] = SIZE[st];
    if (st === "transcript") h = NOTCH.h + 4 + this.textH + 18;
    // --nw, not --w: the page's white is --w, and the notch's children would inherit the size instead
    this.el.style.setProperty("--nw", w);
    this.el.style.setProperty("--nh", h);
    this.el.style.setProperty("--nr", r);
    for (const [name, node] of Object.entries(this.states)) {
      node.classList.toggle("on", name === st);
      if (name === st) { node.style.width = `${w - 12}px`; node.style.height = `${h}px`; }
    }
  }
}

export function mountHero({ screen, canvas, side, chips, say }) {
  screen.innerHTML = `<div class="pts">${screenHTML()}</div>`;
  const pts = screen.firstElementChild, $ = (id) => screen.querySelector("#" + id);
  new ResizeObserver(() => { pts.style.transform = `scale(${screen.clientWidth / 800})`; }).observe(screen);

  const notch = new Notch($("notch"));
  const puck = new Puck(canvas, { face: "home" });
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // the picker's little faces, one live-drawn coin each
  const coins = PICKS.map(([id]) => {
    const cv = document.createElement("canvas");
    cv.className = "coin";
    $("n-coins").append(cv);
    return { cv, puck: new Puck(cv, { face: id, interactive: false, live: false, bare: true }) };
  });
  const COIN = { size: [28, 38, 50, 70, 50, 38, 28], x: [-173, -128, -72, 0, 72, 128, 173], dim: [0.4, 0.55, 0.7, 1, 0.7, 0.55, 0.4] };
  function placeCoins() {
    const idx = puck.s.pick.idx;
    coins.forEach((c, i) => {
      const rel = i - idx, k = rel + 3, show = Math.abs(rel) <= 3;
      c.cv.style.opacity = show ? COIN.dim[k] : 0;
      c.cv.style.transform = `translateX(${show ? COIN.x[k] : Math.sign(rel) * 200}px) scale(${(show ? COIN.size[k] : 20) / 70})`;
      c.cv.classList.toggle("on", rel === 0);
    });
    $("n-pname").textContent = PICKS[idx][1];
  }

  // ---- the apps on the screen

  const music = {
    at: 72,
    update() {
      $("m-vol").style.width = `${puck.s.vol}%`;
      $("n-vol").style.width = `${puck.s.vol}%`;
      $("n-voln").textContent = Math.round(puck.s.vol);
      $("m-pp").innerHTML = puck.s.playing ? icon.pause : icon.play;
      $("n-bars").classList.toggle("playing", puck.s.playing);
    },
    tick(dt) {
      if (!puck.s.playing) return;
      this.at = (this.at + dt) % 228;
      $("m-prog").style.width = `${(this.at / 228) * 100}%`;
      $("m-at").textContent = `${Math.floor(this.at / 60)}:${String(Math.floor(this.at % 60)).padStart(2, "0")}`;
    },
  };

  const chat = {
    n: 0, words: [], heard: 0, timer: 0, typing: 0,
    listen() {
      this.words = SAY[this.n % SAY.length].split(" ");
      this.heard = 0;
      $("n-tl").textContent = "Listening";
      $("n-tl").classList.remove("sent");
      $("c-rec").classList.add("on");
      this.hear();
      notch.setRest("transcript");
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        if (this.heard >= this.words.length) return clearInterval(this.timer);
        this.heard++;
        this.hear();
      }, 190);
    },
    hear() {
      const t = $("n-tt");
      t.textContent = this.words.slice(0, this.heard).join(" ") || "…";
      notch.textH = Math.max(19, t.offsetHeight);
      notch.render();
    },
    send() {
      clearInterval(this.timer);
      $("c-rec").classList.remove("on");
      const text = this.words.slice(0, Math.max(this.heard, 1)).join(" ");
      $("n-tl").textContent = "Sent";
      $("n-tl").classList.add("sent");
      setTimeout(() => { if (scene === "claude") notch.setRest("ears"); }, 900);
      this.add("me", text);
      const reply = REPLY[this.n % REPLY.length];
      this.n++;
      const p = this.add("ai", "");
      let i = 0;
      clearInterval(this.typing);
      setTimeout(() => {
        this.typing = setInterval(() => {
          i = Math.min(reply.length, i + 2);
          p.textContent = reply.slice(0, i);
          if (i >= reply.length) clearInterval(this.typing);
        }, 28);
      }, 600);
    },
    add(who, text) {
      const p = document.createElement("p");
      p.className = who;
      p.textContent = text;
      const box = $("c-msgs");
      box.append(p);
      while (box.children.length > 4) box.firstElementChild.remove();
      return p;
    },
    stop() { clearInterval(this.timer); $("c-rec").classList.remove("on"); },
  };

  const term = {
    i: 0, pending: null,
    lines(html) { $("t-out").innerHTML = html; },
    ask() {
      const a = ASKS[this.i % ASKS.length];
      this.pending = a;
      const intro = this.i % ASKS.length === 0
        ? `<p><span class="p">&gt;</span> run the tests, and push if they pass</p><p><span class="dot">●</span> I'll run the test suite first.</p>`
        : `<p><span class="dot">●</span> Now pushing to main.</p>`;
      this.prev = this.i % ASKS.length === 0 ? "" : this.prev;
      this.lines(this.prev + intro + `<p><span class="dot">●</span> <b>Bash</b>(${a.cmd})</p><p class="wait">  └ Waiting for your answer on the puck</p>`);
      $("n-cmd").textContent = a.cmd;
      puck.s.cmd = a.cmd;  // the puck asks about the same command
      $("n-deny").classList.remove("on");
      notch.setRest("allow");
    },
    answer(yes) {
      const a = this.pending;
      if (!a) return;
      this.pending = null;
      const out = $("t-out");
      out.querySelector(".wait")?.remove();
      out.insertAdjacentHTML("beforeend", yes
        ? `<p class="ok">  └ ${a.did}</p><p><span class="dot">●</span> ${a.then}</p>`
        : `<p class="no">  └ Denied from the puck</p><p><span class="dot">●</span> Okay, I won't run that. What should I do instead?</p>`);
      this.prev = out.innerHTML;
      notch.setRest("idle");
      notch.show("msg", 1500);
      $("n-msg").textContent = yes ? "Allowed" : "Denied";
      this.i = yes ? this.i + 1 : 0;  // after a no, Claude starts over rather than pushing
      clearTimeout(this.next);
      this.next = setTimeout(() => { if (scene === "code") this.ask(); }, yes ? 1700 : 2600);
    },
    stop() { clearTimeout(this.next); this.pending = null; },
  };

  const web = {
    x: 0, v: 0, target: 0, flipAt: 0,
    update() {
      const v = Math.round(puck.s.dkShown);
      $("w-stiff").textContent = v;
      $("w-sl").style.width = `${(puck.s.dk / 500) * 100}%`;
      $("n-ev").innerHTML = `<span class="mono y">${v}</span>`;
    },
    tick(dt, now) {
      const card = $("w-card"), track = card.parentElement.clientWidth - card.offsetWidth - 24;
      if (now > this.flipAt) { this.target = this.target ? 0 : 1; this.flipAt = now + 1.5; }
      const k = Math.max(puck.s.dk, 8), c = 14;
      for (let i = 0; i < 4; i++) { const a = k * (this.target - this.x) - c * this.v; this.v += (a * dt) / 4; this.x += (this.v * dt) / 4; }
      card.style.transform = `translateX(${this.x * track}px)`;
      if (scene === "dialkit") this.update();
    },
  };

  // ---- scenes

  let scene = "music", picking = false, pickTimer = 0;
  const wins = Object.fromEntries([...screen.querySelectorAll(".win")].map((w) => [w.dataset.win, w]));

  function ears(glyph, title, value) {
    $("n-eg").innerHTML = glyph;
    $("n-et").textContent = title;
    $("n-ev").innerHTML = value;
  }

  function setScene(id, byUser = false) {
    if (byUser) puck.lastInput = puck.now;
    const prev = scene;
    scene = id;
    const S = SCENES[id];
    if (prev === "claude" && id !== "claude") chat.stop();
    if (prev === "code" && id !== "code") term.stop();
    if (picking && id !== "modes") closePicker(false);
    for (const [name, w] of Object.entries(wins)) w.classList.toggle("on", name === S.win);
    $("m-app").textContent = S.app;
    notch.clearFlash();
    switch (id) {
      case "music": puck.setFace("home", byUser); notch.setRest("idle"); break;
      case "claude": puck.setFace("claude", byUser); ears(icon.mic, "Claude", `<span class="dim">Tap to talk</span>`); notch.setRest("ears"); break;
      case "code": puck.setFace("allow", byUser); term.ask(); break;
      case "dialkit": puck.setFace("dialkit", byUser); ears(icon.dial, "stiffness", ""); web.update(); notch.setRest("ears"); break;
      case "modes": puck.setFace("home", byUser); notch.setRest("idle"); break;
    }
    for (const b of chips.querySelectorAll("button")) {
      const on = b.dataset.scene === id;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
      b.style.setProperty("--p", 0);
      // on a phone the row scrolls sideways: keep the scene that's playing in view
      if (on) chips.scrollTo({ left: b.offsetLeft - (chips.clientWidth - b.offsetWidth) / 2, behavior: "smooth" });
    }
    say.textContent = S.say;
    side.classList.toggle("hint", id === "modes" && !picking);
  }

  function openPicker() {
    picking = true;
    if (scene !== "modes") setScene("modes");
    const cur = PICKS.findIndex(([f]) => f === puck.face);
    puck.s.pick.idx = Math.max(0, cur);
    puck.setFace("picker");
    placeCoins();
    notch.clearFlash();
    notch.setRest("picker");
    side.classList.remove("hint");
    clearTimeout(pickTimer);
    pickTimer = setTimeout(() => closePicker(false), 10000);  // the puck gives up after 10 s too
  }

  function closePicker(choose) {
    clearTimeout(pickTimer);
    picking = false;
    const [face, name] = PICKS[puck.s.pick.idx];
    puck.setFace(choose ? face : "home");
    notch.setRest("idle");
    if (choose) { $("n-msg").textContent = name; notch.show("msg", 1600); }
  }

  // ---- what the puck does to the Mac

  const notchEl = $("notch"), holder = canvas.parentElement;
  let pingTimer = 0;
  puck.onInput = ({ type, auto }) => {
    if (!auto) holder.classList.add("used");  // it's been touched: the turn arrows can go
    // the notch glows for a moment: it heard the puck
    notchEl.classList.add("ping");
    clearTimeout(pingTimer);
    pingTimer = setTimeout(() => notchEl.classList.remove("ping"), 180);
    if (type === "side") {
      if (picking) closePicker(true); else openPicker();
      return;
    }
    if (picking) {
      if (type === "tap") closePicker(true);
      else { placeCoins(); clearTimeout(pickTimer); pickTimer = setTimeout(() => closePicker(false), 10000); }
      return;
    }
    switch (scene) {
      case "music":
        if (type === "turn") { music.update(); if (notch.current !== "track") notch.show("vol", 1500); }
        else { music.update(); notch.show("track", 2600); }
        break;
      case "claude":
        if (type === "tap") { if (puck.s.listening) chat.listen(); else chat.send(); }
        break;
      case "code":
        if (type === "turn") $("n-deny").classList.toggle("on", puck.s.deny);
        if (type === "tap") term.answer(!puck.s.deny);
        break;
      case "dialkit":
        web.update();
        break;
    }
  };
  side.addEventListener("click", () => puck.side());

  // the eyes in the notch glance at the pointer, as they do on the Mac
  const eyes = $("n-eyes");
  window.addEventListener("pointermove", (e) => {
    const r = screen.getBoundingClientRect(), cx = r.left + r.width / 2;
    const dx = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width / 2)));
    const dy = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    eyes.style.transform = `translate(${dx * 7}px, ${dy * 4 - 1}px)`;
  }, { passive: true });

  // chips
  for (const id of ORDER) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = SCENES[id].chip; b.dataset.scene = id; b.setAttribute("role", "tab");
    b.addEventListener("click", () => { setScene(id, true); demoReset(); });
    chips.append(b);
  }

  placeCoins();
  music.update();
  // ?try=dialkit (or music, faces, claude, code) opens on that scene
  let asked = new URLSearchParams(location.search).get("try");
  if (asked === "faces") asked = "modes";
  if (SCENES[asked]) setScene(asked, true);
  else { setScene("music"); notch.show("eyes", 2400); }  // a hello on arrival
  puck.lastInput = -5;  // and the demo waits for it: it starts 3 s in

  // ---- one clock for the screen

  let last = performance.now();
  (function loop(t) {
    const dt = Math.min((t - last) / 1000, 0.05); last = t;
    music.tick(dt);
    web.tick(dt, t / 1000);
    requestAnimationFrame(loop);
  })(last);

  // ---- left alone, it shows itself off: a little of each scene, then the next

  const DEMO = {
    music: { len: 8.8, run(t, first) {
      if (t > 0.6 && t < 1.6) puck.turn(1.8, true);
      else if (t > 2.6 && t < 3.3) puck.turn(-1.7, true);
      if (first(4.4)) puck.tap(true);
      if (first(6.8)) puck.tap(true);
    } },
    claude: { len: 9.6, run(t, first) {
      if (first(0.8)) puck.tap(true);
      if (first(3.6)) puck.tap(true);
    } },
    code: { len: 6.4, run(t, first) {
      if (first(2.6)) puck.tap(true);
    } },
    dialkit: { len: 7.4, run(t) {
      if (t > 0.4 && t < 6.4) {
        const want = 260 + 200 * Math.sin((t - 0.4) * 0.9);
        puck.turn(Math.max(-3, Math.min(3, (want - puck.s.dk) * 0.05)), true);
      }
    } },
    modes: { len: 7.6, run(t, first) {
      if (first(0.6)) puck.side(true);
      if (first(1.5) || first(2.2) || first(2.9)) puck.turn(24, true);
      if (first(4.0)) puck.side(true);
      if (first(5.0)) puck.tap(true);
    } },
  };
  let enteredAt = 0, fired = new Set(), visible = true;
  function demoReset() { enteredAt = puck.now; fired.clear(); }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.15 }).observe(screen);
  setInterval(() => {
    const active = chips.querySelector("button.on");
    if (calm || !visible || document.hidden || puck.idle < 8) { demoReset(); active?.style.setProperty("--p", 0); return; }
    const t = puck.now - enteredAt;
    active?.style.setProperty("--p", Math.min(1, t / DEMO[scene].len).toFixed(3));  // counting down to the next scene
    const first = (at) => { if (t >= at && !fired.has(at)) { fired.add(at); return true; } return false; };
    DEMO[scene].run(t, first);
    if (t > DEMO[scene].len) {
      setScene(ORDER[(ORDER.indexOf(scene) + 1) % ORDER.length]);
      demoReset();
    }
  }, 33);

  return { puck, setScene };
}
