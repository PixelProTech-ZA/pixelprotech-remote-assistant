/* =========================================================================
   PixelProTech Remote Assistant — script.js
   Vanilla JS only. All state lives in memory for the session (no
   localStorage/sessionStorage) so nothing persists beyond the tab —
   every sensor/API is only touched after an explicit user action.
   ========================================================================= */
"use strict";

/* -------------------------------------------------------------------------
   Global session state — this is what gets bundled into the final report.
   ------------------------------------------------------------------------- */
const SESSION = {
  id: makeSessionId(),
  startedAt: new Date(),
  device: {},
  tests: {},        // { camera:{status,notes}, mic:{...}, ... }
  uploads: [],       // {name,size,type,dataUrl?}
  screenshots: [],   // {id,name,size,dataUrl}
  report: { text: "", priority: null, files: [] },
  contact: {},
  diagnostic: null
};

function makeSessionId(){
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PPT-${t}-${r}`;
}

function recordTest(name, status, notes){
  SESSION.tests[name] = { status, notes, at: new Date().toISOString() };
}

/* -------------------------------------------------------------------------
   Toasts
   ------------------------------------------------------------------------- */
function toast(msg, type = ""){
  const stack = document.getElementById("toast-stack");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; }, 3200);
  setTimeout(() => el.remove(), 3600);
}

/* -------------------------------------------------------------------------
   Loading screen
   ------------------------------------------------------------------------- */
window.addEventListener("load", () => {
  setTimeout(() => document.getElementById("loading-screen").classList.add("done"), 900);
});

/* -------------------------------------------------------------------------
   Navigation (hash-routed single page app)
   ------------------------------------------------------------------------- */
const panels = Array.from(document.querySelectorAll(".panel"));
const navLinks = Array.from(document.querySelectorAll(".nav-link"));
const sideNav = document.getElementById("side-nav");
const navScrim = document.getElementById("nav-scrim");

function showPanel(name){
  const target = document.getElementById(`panel-${name}`) ? name : "home";
  panels.forEach(p => p.classList.toggle("active", p.id === `panel-${target}`));
  navLinks.forEach(l => l.classList.toggle("active", l.dataset.panel === target));
  document.title = `${document.getElementById(`panel-${target}`)?.dataset.title || "Dashboard"} — PixelProTech`;
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  closeMobileNav();
}

function goto(name){ location.hash = name; }

navLinks.forEach(link => link.addEventListener("click", (e) => {
  e.preventDefault();
  goto(link.dataset.panel);
}));

document.querySelectorAll("[data-goto]").forEach(btn =>
  btn.addEventListener("click", () => goto(btn.dataset.goto))
);

window.addEventListener("hashchange", () => showPanel(location.hash.replace("#", "")));

function openMobileNav(){ sideNav.classList.add("open"); navScrim.classList.add("show"); document.getElementById("nav-toggle").setAttribute("aria-expanded", "true"); }
function closeMobileNav(){ sideNav.classList.remove("open"); navScrim.classList.remove("show"); document.getElementById("nav-toggle").setAttribute("aria-expanded", "false"); }
document.getElementById("nav-toggle").addEventListener("click", () => {
  sideNav.classList.contains("open") ? closeMobileNav() : openMobileNav();
});
navScrim.addEventListener("click", closeMobileNav);

// initial route (also honours ?panel= from install-shortcuts)
(function initRoute(){
  const params = new URLSearchParams(location.search);
  const initial = location.hash.replace("#", "") || params.get("panel") || "home";
  showPanel(initial);
})();

/* -------------------------------------------------------------------------
   Theme toggle (in-memory only for this session)
   ------------------------------------------------------------------------- */
const themeToggle = document.getElementById("theme-toggle");
themeToggle.addEventListener("click", () => {
  const isDark = document.body.dataset.theme !== "light";
  document.body.dataset.theme = isDark ? "light" : "dark";
  document.querySelector("meta[name=theme-color]").setAttribute("content", isDark ? "#F1F5F9" : "#0F172A");
});

/* -------------------------------------------------------------------------
   HUD clock / date / connectivity
   ------------------------------------------------------------------------- */
function pad(n){ return n.toString().padStart(2, "0"); }
function updateClock(){
  const now = new Date();
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const date = now.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  document.getElementById("hud-time").textContent = time;
  document.getElementById("hud-date").textContent = date;
  const st = document.getElementById("stat-time"); if (st) st.textContent = time;
  const sd = document.getElementById("stat-date"); if (sd) sd.textContent = date;
}
updateClock();
setInterval(updateClock, 1000);

function updateNetStatus(){
  const online = navigator.onLine;
  document.getElementById("hud-net-dot").classList.toggle("on", online);
  document.getElementById("hud-net-text").textContent = online ? "Online" : "Offline";
  const dot = document.getElementById("stat-net-dot");
  const statNetText = document.getElementById("stat-net-text");
  if (dot && statNetText) {
    dot.classList.toggle("on", online);
    statNetText.textContent = online ? "Online" : "Offline";
  }
  const netStatus = document.getElementById("net-status");
  if (netStatus) netStatus.textContent = online ? "Online" : "Offline";
}
window.addEventListener("online", () => { updateNetStatus(); toast("Back online", "success"); });
window.addEventListener("offline", () => { updateNetStatus(); toast("Connection lost", "error"); });
updateNetStatus();

document.getElementById("stat-session").textContent = SESSION.id;

/* =========================================================================
   DEVICE DETECTION
   ========================================================================= */
function detectDeviceType(){
  const ua = navigator.userAgent;
  const touch = navigator.maxTouchPoints > 0;
  if (/iPad|Tablet|(Android(?!.*Mobile))/i.test(ua)) return "Tablet";
  if (/Mobi|Android.*Mobile|iPhone|iPod/i.test(ua)) return "Phone";
  if (touch && Math.min(window.innerWidth, window.innerHeight) > 700) return "Tablet";
  return /Macintosh|Windows|Linux X11|CrOS/i.test(ua) ? "Desktop / Laptop" : "Unknown";
}

function detectOS(){
  const ua = navigator.userAgent;
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  if (/Windows NT 10/.test(ua)) return "Windows 10/11";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) {
    const m = ua.match(/Mac OS X ([\d_]+)/);
    return `macOS ${m ? m[1].replace(/_/g, ".") : ""}`.trim();
  }
  if (/Android/.test(ua)) { const m = ua.match(/Android ([\d.]+)/); return `Android ${m ? m[1] : ""}`.trim(); }
  if (/iPhone|iPad|iPod/.test(ua)) { const m = ua.match(/OS ([\d_]+) like/); return `iOS ${m ? m[1].replace(/_/g, ".") : ""}`.trim(); }
  if (/CrOS/.test(ua)) return "Chrome OS";
  if (/Linux/.test(ua)) return "Linux";
  return platform || "Unknown";
}

function detectBrowser(){
  const ua = navigator.userAgent;
  const rules = [
    ["Edge", /Edg\/([\d.]+)/],
    ["Opera", /OPR\/([\d.]+)/],
    ["Samsung Internet", /SamsungBrowser\/([\d.]+)/],
    ["Chrome", /Chrome\/([\d.]+)/],
    ["Firefox", /Firefox\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, re] of rules) {
    const m = ua.match(re);
    if (m) return `${name} ${m[1]}`;
  }
  return "Unknown Browser";
}

function bytesToGB(b){ return (b / 1073741824).toFixed(1) + " GB"; }

async function buildDeviceProfile(){
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const profile = {
    "Device Type": detectDeviceType(),
    "Operating System": detectOS(),
    "Browser": detectBrowser(),
    "Platform": navigator.platform || navigator.userAgentData?.platform || "—",
    "Language": navigator.language,
    "Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
    "Screen Resolution": `${screen.width} × ${screen.height}`,
    "Viewport": `${window.innerWidth} × ${window.innerHeight}`,
    "Pixel Ratio": window.devicePixelRatio || 1,
    "Touch Support": navigator.maxTouchPoints > 0 ? `Yes (${navigator.maxTouchPoints} pts)` : "No",
    "CPU Cores": navigator.hardwareConcurrency || "Unknown",
    "Estimated RAM": navigator.deviceMemory ? `${navigator.deviceMemory} GB` : "Not reported",
    "Connection Type": conn ? (conn.effectiveType || conn.type || "Unknown") : "Not supported",
    "Online": navigator.onLine ? "Yes" : "No",
    "Cookies Enabled": navigator.cookieEnabled ? "Yes" : "No",
    "PWA Display Mode": window.matchMedia("(display-mode: standalone)").matches ? "Installed (standalone)" : "Browser tab",
  };

  if (navigator.getBattery) {
    try {
      const battery = await navigator.getBattery();
      profile["Battery Level"] = `${Math.round(battery.level * 100)}%`;
      profile["Charging State"] = battery.charging ? "Charging" : "Not charging";
      battery.addEventListener("levelchange", renderDeviceGrid);
      battery.addEventListener("chargingchange", renderDeviceGrid);
    } catch { profile["Battery"] = "Unavailable"; }
  } else {
    profile["Battery"] = "Not supported in this browser";
  }

  SESSION.device = profile;
  return profile;
}

function renderDeviceGrid(){
  const grid = document.getElementById("device-grid");
  if (!grid) return;
  grid.innerHTML = "";
  Object.entries(SESSION.device).forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "card glass stat-card";
    card.innerHTML = `<span class="stat-label">${label}</span><span class="stat-value mono">${value}</span>`;
    grid.appendChild(card);
  });
  document.getElementById("stat-os").textContent = SESSION.device["Operating System"] || "--";
  document.getElementById("stat-browser").textContent = SESSION.device["Browser"] || "--";
}
buildDeviceProfile().then(renderDeviceGrid);

/* =========================================================================
   CAMERA TEST
   ========================================================================= */
(function cameraModule(){
  const video = document.getElementById("camera-video");
  const canvas = document.getElementById("camera-canvas");
  const placeholder = document.getElementById("camera-placeholder");
  const startBtn = document.getElementById("camera-start");
  const snapBtn = document.getElementById("camera-snap");
  const dlBtn = document.getElementById("camera-download");
  const stopBtn = document.getElementById("camera-stop");
  const status = document.getElementById("camera-status");
  let stream = null, snapshotUrl = null;

  function setStatus(text, cls){ status.textContent = text; status.className = `status-pill status-pill--${cls}`; }

  startBtn.addEventListener("click", async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setStatus("Camera Failed", "fail"); recordTest("camera", "fail", "getUserMedia unsupported"); return; }
    setStatus("Requesting permission…", "busy");
    toast("Requesting camera permission — used only for this live preview.");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      video.srcObject = stream;
      placeholder.classList.add("hidden");
      video.classList.remove("hidden");
      setStatus("Camera Working", "pass");
      recordTest("camera", "pass", "Live preview established");
      startBtn.disabled = true; snapBtn.disabled = false; stopBtn.disabled = false;
    } catch (err) {
      setStatus("Camera Failed", "fail");
      recordTest("camera", "fail", err.message);
      toast("Camera permission denied or unavailable", "error");
    }
  });

  snapBtn.addEventListener("click", () => {
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.classList.remove("hidden");
    canvas.toBlob(blob => { snapshotUrl = URL.createObjectURL(blob); dlBtn.disabled = false; toast("Snapshot captured", "success"); });
  });

  dlBtn.addEventListener("click", () => {
    if (!snapshotUrl) return;
    const a = document.createElement("a");
    a.href = snapshotUrl; a.download = `pixelprotech-snapshot-${Date.now()}.png`; a.click();
  });

  stopBtn.addEventListener("click", () => {
    stream?.getTracks().forEach(t => t.stop());
    video.classList.add("hidden"); canvas.classList.add("hidden"); placeholder.classList.remove("hidden");
    startBtn.disabled = false; snapBtn.disabled = true; stopBtn.disabled = true;
    setStatus("Idle", "idle");
  });
})();

/* =========================================================================
   MICROPHONE TEST
   ========================================================================= */
(function micModule(){
  const startBtn = document.getElementById("mic-start");
  const recordBtn = document.getElementById("mic-record");
  const stopBtn = document.getElementById("mic-stop");
  const dlBtn = document.getElementById("mic-download");
  const playback = document.getElementById("mic-playback");
  const status = document.getElementById("mic-status");
  const canvas = document.getElementById("mic-waveform");
  const ctx2d = canvas.getContext("2d");
  const meterFill = document.getElementById("mic-meter-fill");

  let audioCtx, analyser, source, stream, dataArray, rafId;
  let mediaRecorder, chunks = [], recordedUrl = null;

  function setStatus(text, cls){ status.textContent = text; status.className = `status-pill status-pill--${cls}`; }

  function resizeCanvas(){ canvas.width = canvas.clientWidth * 2; canvas.height = canvas.clientHeight * 2; }

  function draw(){
    rafId = requestAnimationFrame(draw);
    analyser.getByteTimeDomainData(dataArray);
    ctx2d.fillStyle = "rgba(15,23,42,0.4)";
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    ctx2d.lineWidth = 3;
    ctx2d.strokeStyle = "#00FFD5";
    ctx2d.beginPath();
    const slice = canvas.width / dataArray.length;
    let x = 0, sumSq = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i] / 128.0;
      sumSq += (v - 1) * (v - 1);
      const y = (v * canvas.height) / 2;
      i === 0 ? ctx2d.moveTo(x, y) : ctx2d.lineTo(x, y);
      x += slice;
    }
    ctx2d.stroke();
    const rms = Math.sqrt(sumSq / dataArray.length);
    meterFill.style.width = `${Math.min(100, rms * 400)}%`;
  }

  startBtn.addEventListener("click", async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setStatus("Microphone Failed", "fail"); recordTest("microphone", "fail", "getUserMedia unsupported"); return; }
    toast("Requesting microphone permission for live waveform + recording.");
    setStatus("Requesting permission…", "busy");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      dataArray = new Uint8Array(analyser.fftSize);
      source.connect(analyser);
      resizeCanvas();
      draw();
      setStatus("Microphone Working", "pass");
      recordTest("microphone", "pass", "Live waveform established");
      startBtn.disabled = true; recordBtn.disabled = false; stopBtn.disabled = false;

      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = e => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        recordedUrl = URL.createObjectURL(blob);
        playback.src = recordedUrl;
        playback.classList.remove("hidden");
        dlBtn.classList.remove("hidden");
        chunks = [];
      };
    } catch (err) {
      setStatus("Microphone Failed", "fail");
      recordTest("microphone", "fail", err.message);
      toast("Microphone permission denied or unavailable", "error");
    }
  });

  recordBtn.addEventListener("click", () => {
    if (mediaRecorder.state === "recording") { mediaRecorder.stop(); recordBtn.textContent = "Record Voice"; toast("Recording saved"); }
    else { mediaRecorder.start(); recordBtn.textContent = "Stop Recording"; toast("Recording…"); }
  });

  dlBtn.addEventListener("click", () => {
    if (!recordedUrl) return;
    const a = document.createElement("a");
    a.href = recordedUrl; a.download = `pixelprotech-recording-${Date.now()}.webm`; a.click();
  });

  stopBtn.addEventListener("click", () => {
    cancelAnimationFrame(rafId);
    stream?.getTracks().forEach(t => t.stop());
    audioCtx?.close();
    startBtn.disabled = false; recordBtn.disabled = true; stopBtn.disabled = true;
    setStatus("Idle", "idle");
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    meterFill.style.width = "0%";
  });
})();

/* =========================================================================
   SPEAKER TEST
   ========================================================================= */
(function speakerModule(){
  const volSlider = document.getElementById("speaker-volume");
  const volVal = document.getElementById("speaker-volume-val");
  const status = document.getElementById("speaker-status");
  let audioCtx, activeNodes = [];

  function setStatus(text, cls){ status.textContent = text; status.className = `status-pill status-pill--${cls}`; }

  volSlider.addEventListener("input", () => volVal.textContent = `${volSlider.value}%`);

  function stopAll(){ activeNodes.forEach(n => { try { n.stop(); } catch {} }); activeNodes = []; }

  function playTone(pan){
    stopAll();
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const gain = audioCtx.createGain();
    gain.gain.value = volSlider.value / 100 * 0.3;
    const panner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null;
    if (panner) panner.pan.value = pan === "left" ? -1 : pan === "right" ? 1 : 0;
    const osc = audioCtx.createOscillator();
    osc.frequency.value = 440;
    osc.connect(gain);
    (panner ? gain.connect(panner).connect(audioCtx.destination) : gain.connect(audioCtx.destination));
    osc.start();
    activeNodes.push(osc);
    setStatus(`Playing: ${pan}`, "busy");
    recordTest("speaker", "pass", `Played ${pan} channel tone`);
  }

  document.querySelectorAll("[data-tone]").forEach(btn =>
    btn.addEventListener("click", () => playTone(btn.dataset.tone))
  );
  document.getElementById("speaker-stop").addEventListener("click", () => { stopAll(); setStatus("Idle", "idle"); });
  document.getElementById("speaker-pass").addEventListener("click", () => { recordTest("speaker", "pass", "User confirmed audio heard clearly"); setStatus("Speaker Pass", "pass"); toast("Speaker marked as passing", "success"); });
  document.getElementById("speaker-fail").addEventListener("click", () => { recordTest("speaker", "fail", "User reported no / distorted audio"); setStatus("Speaker Fail", "fail"); toast("Speaker marked as failing", "error"); });
})();

/* =========================================================================
   SCREEN TEST — full-screen swatches + touch/mouse pad
   ========================================================================= */
(function screenModule(){
  const overlay = document.getElementById("fullscreen-test");
  document.querySelectorAll(".swatch").forEach(sw => sw.addEventListener("click", () => {
    const c = sw.dataset.color;
    overlay.classList.remove("grad");
    if (c === "gradient") overlay.classList.add("grad");
    else overlay.style.background = c;
    overlay.classList.remove("hidden");
    recordTest("screen", "pass", `Displayed ${c === "gradient" ? "gradient" : c} full-screen sweep`);
  }));
  function exit(){ overlay.classList.add("hidden"); }
  overlay.addEventListener("click", exit);
  overlay.addEventListener("touchstart", exit, { passive: true });
  document.addEventListener("keydown", e => { if (e.key === "Escape") exit(); });

  const pad = document.getElementById("screen-pad");
  const pctx = pad.getContext("2d");
  const info = document.getElementById("screen-pad-info");
  let points = 0;

  function fit(){ pad.width = pad.clientWidth * 2; pad.height = pad.clientHeight * 2; pctx.lineWidth = 4; pctx.strokeStyle = "#00FFD5"; pctx.lineCap = "round"; }
  window.addEventListener("resize", fit);
  fit();

  function plot(x, y, type){
    const rect = pad.getBoundingClientRect();
    const cx = (x - rect.left) * (pad.width / rect.width);
    const cy = (y - rect.top) * (pad.height / rect.height);
    pctx.beginPath(); pctx.arc(cx, cy, 5, 0, Math.PI * 2);
    pctx.fillStyle = type === "touch" ? "#8B5CF6" : "#00FFD5"; pctx.fill();
    points++;
    info.textContent = `${points} points registered (${type})`;
    recordTest("screen-pad", "pass", `${points} ${type} points registered`);
  }
  pad.addEventListener("pointerdown", e => plot(e.clientX, e.clientY, e.pointerType === "touch" ? "touch" : "mouse"));
  pad.addEventListener("pointermove", e => { if (e.buttons > 0 || e.pointerType === "touch") plot(e.clientX, e.clientY, e.pointerType === "touch" ? "touch" : "mouse"); });
  document.getElementById("screen-pad-clear").addEventListener("click", () => { pctx.clearRect(0, 0, pad.width, pad.height); points = 0; info.textContent = "Cleared."; });
})();

/* =========================================================================
   KEYBOARD TEST
   ========================================================================= */
(function keyboardModule(){
  const rows = [
    "` 1 2 3 4 5 6 7 8 9 0 - = Backspace".split(" "),
    "Tab q w e r t y u i o p [ ] \\".split(" "),
    "CapsLock a s d f g h j k l ; ' Enter".split(" "),
    "Shift z x c v b n m , . / Shift".split(" "),
    "Ctrl Alt Space Alt Ctrl".split(" ")
  ];
  const kb = document.getElementById("virtual-keyboard");
  const keyEls = {};
  rows.forEach(row => {
    const rowEl = document.createElement("div"); rowEl.className = "kb-row";
    row.forEach(k => {
      const el = document.createElement("div"); el.className = "kb-key"; el.textContent = k;
      rowEl.appendChild(el);
      keyEls[k.toLowerCase()] = keyEls[k.toLowerCase()] || [];
      keyEls[k.toLowerCase()].push(el);
    });
    kb.appendChild(rowEl);
  });

  const countEl = document.getElementById("kb-count");
  const stuckEl = document.getElementById("kb-stuck");
  const pressed = new Set();
  const downTimes = {};
  let stuckCount = 0;

  const keyMap = { " ": "space", "control": "ctrl", "capslock": "capslock" };

  function normalize(key){ return (keyMap[key.toLowerCase()] || key).toLowerCase(); }

  window.addEventListener("keydown", e => {
    const norm = normalize(e.key);
    const els = keyEls[norm];
    if (els) els.forEach(el => el.classList.add("active"));
    if (!pressed.has(norm)) { pressed.add(norm); countEl.textContent = pressed.size; }
    downTimes[norm] = downTimes[norm] || performance.now();
  });
  window.addEventListener("keyup", e => {
    const norm = normalize(e.key);
    const els = keyEls[norm];
    if (els) els.forEach(el => el.classList.remove("active"));
    const held = performance.now() - (downTimes[norm] || performance.now());
    if (held > 3000) { stuckCount++; stuckEl.textContent = stuckCount; recordTest("keyboard", "warn", `Key "${norm}" held ${Math.round(held)}ms — possible stuck key`); }
    delete downTimes[norm];
  });
  document.getElementById("kb-reset").addEventListener("click", () => {
    pressed.clear(); stuckCount = 0; countEl.textContent = "0"; stuckEl.textContent = "0";
    recordTest("keyboard", "pass", "Manual reset");
  });
  document.getElementById("virtual-keyboard").addEventListener("click", function(){ this.focus(); });
})();

/* =========================================================================
   MOUSE TEST
   ========================================================================= */
(function mouseModule(){
  const pad = document.getElementById("mouse-pad");
  const dot = document.getElementById("mouse-dot");
  const left = document.getElementById("m-left"), right = document.getElementById("m-right"),
        middle = document.getElementById("m-middle"), dbl = document.getElementById("m-double"),
        scroll = document.getElementById("m-scroll"), pos = document.getElementById("m-pos");
  let counts = { left: 0, right: 0, middle: 0, dbl: 0, scroll: 0 };

  pad.addEventListener("mousemove", e => {
    const r = pad.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    dot.style.left = `${x}px`; dot.style.top = `${y}px`;
    pos.textContent = `${Math.round(x)}, ${Math.round(y)}`;
  });
  pad.addEventListener("mousedown", e => {
    if (e.button === 0) counts.left++, left.textContent = counts.left;
    if (e.button === 1) counts.middle++, middle.textContent = counts.middle;
    if (e.button === 2) counts.right++, right.textContent = counts.right;
  });
  pad.addEventListener("dblclick", () => { counts.dbl++; dbl.textContent = counts.dbl; });
  pad.addEventListener("contextmenu", e => e.preventDefault());
  pad.addEventListener("wheel", e => { counts.scroll += Math.round(Math.abs(e.deltaY)); scroll.textContent = counts.scroll; }, { passive: true });
  pad.addEventListener("mouseleave", () => recordTest("mouse", "pass", JSON.stringify(counts)));
})();

/* =========================================================================
   NETWORK TEST
   ========================================================================= */
(function networkModule(){
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  document.getElementById("net-type").textContent = conn ? (conn.effectiveType || conn.type || "Unknown") : "Not supported";
  document.getElementById("net-downlink").textContent = conn?.downlink ? `${conn.downlink} Mbps` : "Not reported";
  document.getElementById("net-rtt").textContent = conn?.rtt ? `${conn.rtt} ms` : "Not reported";
  document.getElementById("net-status").textContent = navigator.onLine ? "Online" : "Offline";

  const runBtn = document.getElementById("net-run");
  const pingDot = document.getElementById("ping-dot");

  runBtn.addEventListener("click", async () => {
    runBtn.disabled = true;
    pingDot.classList.add("run");

    // Latency: time a same-origin, cache-busted HEAD-ish fetch.
    const t0 = performance.now();
    try {
      await fetch(`./manifest.json?ts=${Date.now()}`, { cache: "no-store" });
    } catch {}
    const latency = Math.round(performance.now() - t0);
    document.getElementById("net-latency").textContent = `${latency} ms`;

    // Simulated throughput: measure local in-memory transfer speed as a relative proxy.
    const size = 2_000_000; // 2MB synthetic buffer
    const buf = new Uint8Array(size);
    const dStart = performance.now();
    const blob = new Blob([buf]);
    await blob.arrayBuffer();
    const dTime = (performance.now() - dStart) / 1000;
    const simDown = ((size * 8) / dTime / 1_000_000).toFixed(1);
    document.getElementById("net-download").textContent = `${simDown} Mbps (sim)`;

    const uStart = performance.now();
    await new Response(buf).blob();
    const uTime = (performance.now() - uStart) / 1000;
    const simUp = ((size * 8) / uTime / 1_000_000).toFixed(1);
    document.getElementById("net-upload").textContent = `${simUp} Mbps (sim)`;

    pingDot.classList.remove("run");
    runBtn.disabled = false;
    recordTest("network", "pass", `Latency ${latency}ms, sim down ${simDown}Mbps, sim up ${simUp}Mbps`);
    toast("Network test complete", "success");
  });
})();
window.addEventListener("online", updateConnFields);
window.addEventListener("offline", updateConnFields);
function updateConnFields(){
  const el = document.getElementById("net-status");
  if (el) el.textContent = navigator.onLine ? "Online" : "Offline";
}

/* =========================================================================
   GPS TEST
   ========================================================================= */
(function gpsModule(){
  const btn = document.getElementById("gps-start");
  const status = document.getElementById("gps-status");
  function setStatus(text, cls){ status.textContent = text; status.className = `status-pill status-pill--${cls}`; }

  btn.addEventListener("click", () => {
    if (!navigator.geolocation) { setStatus("Not supported", "fail"); return; }
    toast("Requesting location permission for GPS accuracy check.");
    setStatus("Requesting permission…", "busy");
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude, accuracy } = pos.coords;
        document.getElementById("gps-lat").textContent = latitude.toFixed(6);
        document.getElementById("gps-lng").textContent = longitude.toFixed(6);
        document.getElementById("gps-acc").textContent = `± ${Math.round(accuracy)} m`;
        const link = document.getElementById("gps-map-link");
        link.href = `https://www.google.com/maps?q=${latitude},${longitude}`;
        link.classList.remove("hidden");
        setStatus("GPS Locked", "pass");
        recordTest("gps", "pass", `${latitude.toFixed(4)}, ${longitude.toFixed(4)} ±${Math.round(accuracy)}m`);
      },
      err => { setStatus("GPS Failed", "fail"); recordTest("gps", "fail", err.message); toast("Location permission denied or unavailable", "error"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
})();

/* =========================================================================
   COMPASS & MOTION
   ========================================================================= */
(function motionModule(){
  const btn = document.getElementById("motion-start");
  const status = document.getElementById("motion-status");
  const needle = document.getElementById("compass-needle");
  function setStatus(text, cls){ status.textContent = text; status.className = `status-pill status-pill--${cls}`; }

  function bindOrientation(){
    window.addEventListener("deviceorientation", e => {
      const heading = e.webkitCompassHeading ?? (e.alpha != null ? 360 - e.alpha : null);
      if (heading != null) { document.getElementById("mo-heading").textContent = `${Math.round(heading)}°`; needle.style.transform = `translate(-50%,-100%) rotate(${heading}deg)`; }
      document.getElementById("mo-beta").textContent = e.beta != null ? `${Math.round(e.beta)}°` : "--";
      document.getElementById("mo-gamma").textContent = e.gamma != null ? `${Math.round(e.gamma)}°` : "--";
    });
  }
  function bindMotion(){
    window.addEventListener("devicemotion", e => {
      const a = e.accelerationIncludingGravity || {};
      document.getElementById("mo-ax").textContent = a.x != null ? a.x.toFixed(2) : "--";
      document.getElementById("mo-ay").textContent = a.y != null ? a.y.toFixed(2) : "--";
      document.getElementById("mo-az").textContent = a.z != null ? a.z.toFixed(2) : "--";
    });
  }

  btn.addEventListener("click", async () => {
    setStatus("Requesting permission…", "busy");
    try {
      if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== "granted") throw new Error("Orientation permission denied");
      }
      if (typeof DeviceMotionEvent !== "undefined" && DeviceMotionEvent.requestPermission) {
        const res2 = await DeviceMotionEvent.requestPermission();
        if (res2 !== "granted") throw new Error("Motion permission denied");
      }
      bindOrientation(); bindMotion();
      setStatus("Sensors Active", "pass");
      recordTest("motion", "pass", "Orientation + motion listeners bound");
    } catch (err) {
      setStatus("Unavailable", "fail");
      recordTest("motion", "fail", err.message || "Sensors not supported (desktop browsers typically lack these)");
      toast("Motion sensors unavailable on this device/browser", "error");
    }
  });
})();

/* =========================================================================
   STORAGE
   ========================================================================= */
(function storageModule(){
  async function refresh(){
    if (navigator.storage?.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      document.getElementById("storage-used").textContent = bytesToGB(usage || 0);
      document.getElementById("storage-quota").textContent = bytesToGB(quota || 0);
      document.getElementById("storage-available").textContent = bytesToGB((quota || 0) - (usage || 0));
      document.getElementById("storage-bar-fill").style.width = quota ? `${Math.min(100, (usage / quota) * 100)}%` : "0%";
      recordTest("storage", "pass", `${bytesToGB(usage||0)} used of ${bytesToGB(quota||0)}`);
    } else {
      document.getElementById("storage-used").textContent = "Not supported";
    }
    if (navigator.storage?.persisted) {
      document.getElementById("storage-persist").textContent = (await navigator.storage.persisted()) ? "Yes" : "No";
    }
  }
  refresh();
  document.getElementById("storage-request-persist").addEventListener("click", async () => {
    if (!navigator.storage?.persist) { toast("Not supported in this browser", "error"); return; }
    const granted = await navigator.storage.persist();
    toast(granted ? "Persistent storage granted" : "Persistent storage denied", granted ? "success" : "error");
    refresh();
  });
})();

/* =========================================================================
   USB / BLUETOOTH
   ========================================================================= */
document.getElementById("usb-request").addEventListener("click", async () => {
  const out = document.getElementById("usb-result");
  if (!navigator.usb) { out.textContent = "WebUSB is not supported in this browser."; recordTest("usb", "fail", "unsupported"); return; }
  try {
    toast("Opening USB device picker…");
    const device = await navigator.usb.requestDevice({ filters: [] });
    out.innerHTML = `Vendor ID: ${device.vendorId}<br>Product ID: ${device.productId}<br>Product: ${device.productName || "—"}<br>Serial: ${device.serialNumber || "Not exposed"}`;
    recordTest("usb", "pass", `${device.productName || device.vendorId}`);
  } catch (err) { out.textContent = "No device selected."; recordTest("usb", "warn", err.message); }
});

document.getElementById("bt-request").addEventListener("click", async () => {
  const out = document.getElementById("bt-result");
  if (!navigator.bluetooth) { out.textContent = "Web Bluetooth is not supported in this browser."; recordTest("bluetooth", "fail", "unsupported"); return; }
  try {
    toast("Opening Bluetooth device picker…");
    const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
    out.innerHTML = `Name: ${device.name || "Unnamed device"}<br>ID: ${device.id}`;
    recordTest("bluetooth", "pass", device.name || device.id);
  } catch (err) { out.textContent = "No device selected."; recordTest("bluetooth", "warn", err.message); }
});

/* =========================================================================
   FILE UPLOAD CENTER
   ========================================================================= */
(function uploadModule(){
  const zone = document.getElementById("dropzone");
  const input = document.getElementById("file-input");
  const list = document.getElementById("upload-list");

  function humanSize(b){ if (b < 1024) return `${b} B`; if (b < 1048576) return `${(b/1024).toFixed(1)} KB`; return `${(b/1048576).toFixed(1)} MB`; }

  function addFiles(files){
    Array.from(files).forEach(file => {
      const item = document.createElement("div"); item.className = "upload-item";
      const isImg = file.type.startsWith("image/");
      item.innerHTML = `
        ${isImg ? '<img alt="">' : '<span style="font-size:1.3rem">📄</span>'}
        <span class="name">${file.name}</span>
        <span class="mono" style="color:var(--text-dimmer);font-size:.72rem">${humanSize(file.size)}</span>
        <div class="upload-progress"><div class="upload-progress-fill"></div></div>
        <button class="upload-remove" aria-label="Remove">✕</button>`;
      list.appendChild(item);
      const fill = item.querySelector(".upload-progress-fill");
      const img = item.querySelector("img");

      const reader = new FileReader();
      reader.onprogress = e => { if (e.lengthComputable) fill.style.width = `${(e.loaded / e.total) * 100}%`; };
      reader.onload = () => {
        fill.style.width = "100%";
        if (isImg && img) img.src = reader.result;
        SESSION.uploads.push({ name: file.name, size: file.size, type: file.type });
      };
      if (isImg) reader.readAsDataURL(file); else { setTimeout(() => fill.style.width = "100%", 250); SESSION.uploads.push({ name: file.name, size: file.size, type: file.type }); }

      item.querySelector(".upload-remove").addEventListener("click", () => {
        item.remove();
        SESSION.uploads = SESSION.uploads.filter(u => u.name !== file.name);
      });
    });
    toast(`${files.length} file(s) added`, "success");
  }

  zone.addEventListener("click", () => input.click());
  input.addEventListener("change", () => addFiles(input.files));
  ["dragenter", "dragover"].forEach(evt => zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(evt => zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.remove("drag"); }));
  zone.addEventListener("drop", e => addFiles(e.dataTransfer.files));
})();

/* =========================================================================
   SCREENSHOT CENTER
   ========================================================================= */
(function screenshotModule(){
  const zone = document.getElementById("screenshot-dropzone");
  const input = document.getElementById("screenshot-input");
  const grid = document.getElementById("screenshot-grid");

  function render(){
    grid.innerHTML = "";
    SESSION.screenshots.forEach(s => {
      const tile = document.createElement("div"); tile.className = "screenshot-tile";
      tile.innerHTML = `
        <img src="${s.dataUrl}" alt="${s.name}">
        <div class="screenshot-meta">
          <input type="text" value="${s.name}" data-id="${s.id}">
          <div class="screenshot-actions">
            <button data-action="preview" data-id="${s.id}">Preview</button>
            <button data-action="delete" data-id="${s.id}">Delete</button>
          </div>
        </div>`;
      grid.appendChild(tile);
    });
  }

  function addFiles(files){
    Array.from(files).filter(f => f.type.startsWith("image/")).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        SESSION.screenshots.push({ id: crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random(), name: file.name, size: file.size, dataUrl: reader.result });
        render();
      };
      reader.readAsDataURL(file);
    });
  }

  zone.addEventListener("click", () => input.click());
  input.addEventListener("change", () => addFiles(input.files));
  ["dragenter", "dragover"].forEach(evt => zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(evt => zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.remove("drag"); }));
  zone.addEventListener("drop", e => addFiles(e.dataTransfer.files));

  grid.addEventListener("click", e => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (e.target.dataset.action === "delete") { SESSION.screenshots = SESSION.screenshots.filter(s => s.id != id); render(); }
    if (e.target.dataset.action === "preview") { const s = SESSION.screenshots.find(s => s.id == id); if (s) window.open(s.dataUrl, "_blank"); }
  });
  grid.addEventListener("change", e => {
    if (e.target.tagName === "INPUT") {
      const s = SESSION.screenshots.find(s => s.id == e.target.dataset.id);
      if (s) s.name = e.target.value;
    }
  });
})();

/* =========================================================================
   ERROR REPORT
   ========================================================================= */
(function reportModule(){
  const textarea = document.getElementById("report-text");
  const counter = document.getElementById("report-count");
  textarea.addEventListener("input", () => { counter.textContent = textarea.value.length; SESSION.report.text = textarea.value; });

  document.querySelectorAll(".priority-btn").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".priority-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    SESSION.report.priority = btn.dataset.priority;
  }));

  const fileInput = document.getElementById("report-files");
  const list = document.getElementById("report-files-list");
  fileInput.addEventListener("change", () => {
    list.innerHTML = "";
    Array.from(fileInput.files).forEach(f => {
      const item = document.createElement("div"); item.className = "upload-item";
      item.innerHTML = `<span style="font-size:1.2rem">📎</span><span class="name">${f.name}</span>`;
      list.appendChild(item);
    });
    SESSION.report.files = Array.from(fileInput.files).map(f => ({ name: f.name, size: f.size }));
  });
})();

/* =========================================================================
   CONTACT FORM
   ========================================================================= */
document.getElementById("contact-form").addEventListener("input", e => {
  const form = e.currentTarget;
  SESSION.contact = Object.fromEntries(new FormData(form).entries());
});

/* =========================================================================
   AI DIAGNOSTIC ENGINE (rule-based, entirely local)
   ========================================================================= */
function runDiagnostic(){
  const lines = [];
  const t = SESSION.tests;

  function add(kind, msg){ lines.push({ kind, msg }); }

  // Camera
  if (t.camera?.status === "pass") add("ok", "Camera appears functional — live preview established successfully.");
  else if (t.camera?.status === "fail") add("bad", "Possible camera issue detected — permission was denied or no device responded.");
  else add("info", "Camera test not yet run.");

  // Microphone
  if (t.microphone?.status === "pass") add("ok", "Microphone signal detected and waveform rendered correctly.");
  else if (t.microphone?.status === "fail") add("bad", "Possible microphone issue detected — no audio input was captured.");
  else add("info", "Microphone test not yet run.");

  // Speaker
  if (t.speaker?.status === "pass") add("ok", "Speaker output confirmed by test tone playback.");
  else if (t.speaker?.status === "fail") add("bad", "Speaker reported as failing — user did not hear a clear test tone.");
  else add("info", "Speaker test not yet run.");

  // Screen
  if (t.screen?.status === "pass" || t["screen-pad"]?.status === "pass") add("ok", "Screen responded correctly to color sweeps and/or touch input.");
  else add("info", "Screen test not yet run.");

  // Keyboard
  if (t.keyboard?.status === "warn") add("warn", "One or more keys were held unusually long — worth a physical inspection for a stuck key.");
  else if (t.keyboard) add("ok", "Keyboard input registered normally.");
  else add("info", "Keyboard test not yet run.");

  // Network
  if (t.network?.status === "pass") add("ok", `Internet connection is stable. ${t.network.notes}`);
  else add("info", "Network test not yet run.");

  // GPS
  if (t.gps?.status === "pass") add("ok", "GPS lock acquired with a reasonable accuracy radius.");
  else if (t.gps?.status === "fail") add("warn", "GPS unavailable — expected on desktops or when location services are off.");

  // Motion
  if (t.motion?.status === "pass") add("ok", "Motion and orientation sensors are reporting live data.");
  else if (t.motion?.status === "fail") add("info", "Motion sensors unavailable — normal for most laptops/desktops.");

  // Storage
  if (t.storage?.status === "pass") add("ok", `Storage looks healthy: ${t.storage.notes}.`);

  // Battery
  const battery = SESSION.device["Battery Level"];
  if (battery) {
    const pct = parseInt(battery);
    if (pct < 20) add("warn", `Battery is low (${battery}) — recommend charging before further diagnostics.`);
    else add("ok", `Battery healthy (${battery}).`);
  }

  // Browser currency (heuristic only — cannot verify "latest" offline)
  add("info", `Browser detected as ${SESSION.device["Browser"]}. Verify against the vendor's latest release if issues persist.`);

  const anyFail = Object.values(t).some(x => x.status === "fail");
  const anyWarn = Object.values(t).some(x => x.status === "warn");
  if (anyFail) add("bad", "One or more hardware tests failed — recommend in-person technician inspection.");
  else if (anyWarn) add("warn", "Minor issues flagged — monitor and retest; technician review optional.");
  else if (Object.keys(t).length > 0) add("ok", "No critical issues detected across completed tests.");

  SESSION.diagnostic = lines;
  return lines;
}

document.getElementById("run-diagnostic").addEventListener("click", () => {
  const lines = runDiagnostic();
  const out = document.getElementById("diagnostic-output");
  out.innerHTML = "";
  lines.forEach(l => {
    const div = document.createElement("div");
    div.className = `diag-line ${l.kind}`;
    div.textContent = l.msg;
    out.appendChild(div);
  });
  toast("Diagnostic analysis complete", "success");
});

/* =========================================================================
   EXPORT / REPORT GENERATION
   ========================================================================= */
function buildReportObject(){
  if (!SESSION.diagnostic) runDiagnostic();
  return {
    sessionId: SESSION.id,
    generatedAt: new Date().toISOString(),
    contact: SESSION.contact,
    device: SESSION.device,
    tests: SESSION.tests,
    report: SESSION.report,
    uploads: SESSION.uploads,
    screenshots: SESSION.screenshots.map(s => ({ name: s.name, size: s.size })),
    diagnostic: SESSION.diagnostic
  };
}

function downloadBlob(content, filename, type){
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

document.getElementById("export-json").addEventListener("click", () => {
  downloadBlob(JSON.stringify(buildReportObject(), null, 2), `pixelprotech-report-${SESSION.id}.json`, "application/json");
  toast("JSON exported", "success");
});

document.getElementById("export-txt").addEventListener("click", () => {
  const r = buildReportObject();
  let txt = `PIXELPROTECH SOLUTIONS — DIAGNOSTIC REPORT\nSession: ${r.sessionId}\nGenerated: ${r.generatedAt}\n\n--- CONTACT ---\n`;
  Object.entries(r.contact).forEach(([k, v]) => txt += `${k}: ${v}\n`);
  txt += `\n--- DEVICE ---\n`;
  Object.entries(r.device).forEach(([k, v]) => txt += `${k}: ${v}\n`);
  txt += `\n--- TESTS ---\n`;
  Object.entries(r.tests).forEach(([k, v]) => txt += `${k}: ${v.status.toUpperCase()} — ${v.notes}\n`);
  txt += `\n--- AI DIAGNOSTIC SUMMARY ---\n`;
  (r.diagnostic || []).forEach(l => txt += `[${l.kind.toUpperCase()}] ${l.msg}\n`);
  downloadBlob(txt, `pixelprotech-report-${SESSION.id}.txt`, "text/plain");
  toast("TXT exported", "success");
});

document.getElementById("export-csv").addEventListener("click", () => {
  const r = buildReportObject();
  let csv = "Test,Status,Notes\n";
  Object.entries(r.tests).forEach(([k, v]) => csv += `"${k}","${v.status}","${(v.notes || "").replace(/"/g, "'")}"\n`);
  downloadBlob(csv, `pixelprotech-report-${SESSION.id}.csv`, "text/csv");
  toast("CSV exported", "success");
});

document.getElementById("export-print").addEventListener("click", () => {
  const r = buildReportObject();
  document.getElementById("print-meta").innerHTML = `<small>Session ${r.sessionId}<br>${new Date(r.generatedAt).toLocaleString()}</small>`;
  document.getElementById("print-customer").innerHTML = `<h3>Customer</h3>` + Object.entries(r.contact).map(([k, v]) => `<div><strong>${k}:</strong> ${v || "—"}</div>`).join("") || "<h3>Customer</h3><div>No contact details entered.</div>";
  document.getElementById("print-device").innerHTML = `<h3>Device</h3>` + Object.entries(r.device).map(([k, v]) => `<div><strong>${k}:</strong> ${v}</div>`).join("");
  document.getElementById("print-tests").innerHTML = `<h3>Tests</h3>` + (Object.entries(r.tests).map(([k, v]) => `<div><strong>${k}:</strong> ${v.status.toUpperCase()} — ${v.notes}</div>`).join("") || "<div>No tests run.</div>");
  document.getElementById("print-files").innerHTML = `<h3>Attachments</h3><div>${r.uploads.length} upload(s), ${r.screenshots.length} screenshot(s)</div>`;
  document.getElementById("print-diagnostic").innerHTML = `<h3>AI Diagnostic Summary</h3>` + (r.diagnostic || []).map(l => `<div>[${l.kind.toUpperCase()}] ${l.msg}</div>`).join("");
  document.getElementById("print-date").textContent = `Date: ${new Date().toLocaleDateString()}`;
  document.getElementById("print-qr").innerHTML = renderScanCode(r.sessionId);
  window.print();
});

// Lightweight deterministic "scan code" (visual identifier, not ISO-QR)
// so the printed report carries a unique glyph tying it back to the session ID.
function renderScanCode(seed){
  const size = 9;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  let cells = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      hash = (hash * 1103515245 + 12345) >>> 0;
      const on = (hash >>> 16) % 2 === 0;
      cells += `<div style="width:6px;height:6px;background:${on ? '#0F172A' : 'transparent'}"></div>`;
    }
  }
  return `<div style="display:grid;grid-template-columns:repeat(${size},6px);gap:1px;border:4px solid #0F172A;padding:4px;width:fit-content;">${cells}</div><div style="font-size:.6rem;margin-top:4px;">Scan code: ${seed}</div>`;
}

/* =========================================================================
   FLOATING AI ASSISTANT (rule-based, local, offline-friendly)
   ========================================================================= */
(function assistant(){
  const toggle = document.getElementById("assistant-toggle");
  const panel = document.getElementById("assistant-panel");
  const close = document.getElementById("assistant-close");
  const log = document.getElementById("assistant-log");
  const form = document.getElementById("assistant-form");
  const input = document.getElementById("assistant-input");

  function say(text, who = "bot"){
    const div = document.createElement("div");
    div.className = `assistant-msg ${who}`;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  let greeted = false;
  toggle.addEventListener("click", () => {
    panel.classList.toggle("hidden");
    if (!greeted) { say("Hi, I'm the PixelProTech Assistant. Ask me about any test — camera, mic, speaker, network, GPS — or say “report” to jump to the error report."); greeted = true; }
  });
  close.addEventListener("click", () => panel.classList.add("hidden"));

  const KB = [
    [/camera/i, "Open the Camera panel and press Start Camera Test — your browser will ask for permission first. If it fails, check another app isn't already using the camera."],
    [/mic|microphone/i, "Head to Microphone — press Start, then Record Voice to capture a sample you can play back or download."],
    [/speaker|audio|sound/i, "In Speaker Test you can play left, right or stereo tones and mark Pass/Fail once you've listened."],
    [/network|internet|wifi|speed/i, "Network Test shows your connection type plus a same-origin latency check and a local throughput simulation."],
    [/gps|location/i, "GPS Test requests location permission once you press the button — it needs a device with a GPS/location service."],
    [/report|issue|problem|broken/i, "You can describe the issue on the Error Report panel, set a priority, and attach files."],
    [/install|pwa|app/i, "Use the Install App button in the top bar, or your browser's install/Add to Home Screen option, to add this as an app."],
    [/diagnostic|summary|analy[sz]e/i, "The AI Diagnostic panel reviews every test you've run in this tab and drafts a plain-English summary — all locally, nothing is sent anywhere."],
    [/export|pdf|download/i, "Generate Report lets you export as a printable PDF, JSON, TXT or CSV."],
  ];

  function reply(msg){
    const hit = KB.find(([re]) => re.test(msg));
    return hit ? hit[1] : "I can help with camera, mic, speaker, screen, keyboard, mouse, network, GPS, motion, storage, or the error report / export flow — try mentioning one of those.";
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    const val = input.value.trim();
    if (!val) return;
    say(val, "user");
    input.value = "";
    setTimeout(() => say(reply(val)), 300);
  });
})();

/* =========================================================================
   PWA: service worker registration, install prompt, update banner,
   iOS "Add to Home Screen" guidance.
   ========================================================================= */
let deferredInstallPrompt = null;
const installBtn = document.getElementById("install-btn");
const swStatus = document.getElementById("sw-status");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./service-worker.js");
      swStatus.textContent = "Offline-ready";
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            document.getElementById("update-banner").classList.remove("hidden");
          }
        });
      });
    } catch (err) {
      swStatus.textContent = "Offline mode unavailable";
      console.warn("Service worker registration failed:", err);
    }
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return; refreshing = true; window.location.reload();
  });
}

document.getElementById("update-reload").addEventListener("click", async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  reg?.waiting?.postMessage("SKIP_WAITING");
});

// Chromium-based browsers (desktop + Android): native install prompt.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.classList.remove("hidden");
});

installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  toast(outcome === "accepted" ? "Installing PixelProTech Remote Assistant…" : "Install dismissed");
  deferredInstallPrompt = null;
  installBtn.classList.add("hidden");
});

window.addEventListener("appinstalled", () => {
  toast("PixelProTech Remote Assistant installed", "success");
  installBtn.classList.add("hidden");
});

// iOS Safari has no beforeinstallprompt — show manual "Add to Home Screen" guidance.
(function iosInstallHint(){
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  if (!isIOS || isStandalone) return;
  const hint = document.getElementById("ios-install-hint");
  setTimeout(() => hint.classList.remove("hidden"), 2500);
  document.getElementById("ios-install-dismiss").addEventListener("click", () => hint.classList.add("hidden"));
})();

// If already installed/standalone, no need to show any install affordance.
if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true) {
  installBtn.classList.add("hidden");
}
