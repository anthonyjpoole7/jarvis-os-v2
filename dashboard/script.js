const N8N_BASE = "http://localhost:5678/webhook/jarvis";
const KOKORO_BASE = "http://localhost:8765";
const VOICE_RELAY_WS = "ws://localhost:8766/converse";
const HEALTH = {
  n8n: "http://localhost:5678/healthz",
  kokoro: "http://localhost:8765/health",
  relay: "http://localhost:8766/health",
};

// ---------- Native bridge (only inside original JarvisMenuBar — not this browser preview) ----------
function bridge() {
  return (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.jarvis) || null;
}
function nativeCall(payload) {
  const b = bridge();
  if (!b) {
    toast("Native-only feature — open Jarvis OS v2 with ⌥⌘S (not the browser preview).");
    return false;
  }
  b.postMessage(payload);
  return true;
}

// ---------- Toasts ----------
const toastBox = document.getElementById("toast-box");
function toast(msg, ms = 3200) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  toastBox.appendChild(el);
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 320);
  }, ms);
}

// ---------- Clock + greeting ----------
function tickClock() {
  const now = new Date();
  document.getElementById("clock-time").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  document.getElementById("clock-date").textContent = now.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}
tickClock();
setInterval(tickClock, 1000);

(function setGreeting() {
  const h = new Date().getHours();
  const part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  document.getElementById("greeting").textContent = `Good ${part}, Anthony.`;
})();

// ---------- Live service health panel ----------
const healthState = { n8n: null, kokoro: null, relay: null };

function setHealthRow(svc, ok) {
  healthState[svc] = ok;
  const li = document.querySelector(`#health-list li[data-svc="${svc}"]`);
  if (!li) return;
  li.classList.toggle("online", !!ok);
  li.classList.toggle("offline", !ok);
  li.querySelector(".health-state").textContent = ok ? "ONLINE" : "OFFLINE";
}

function updateAggregateStatus() {
  const vals = Object.values(healthState);
  const known = vals.filter((v) => v !== null);
  const allUp = known.length && known.every(Boolean);
  const anyUp = known.some(Boolean);
  const dot = document.getElementById("status-dot");
  const label = document.getElementById("status-label");
  if (!known.length) {
    dot.className = "dot dot-amber";
    label.textContent = "CHECKING";
    return;
  }
  if (allUp) {
    dot.className = "dot dot-green";
    label.textContent = "ONLINE";
    backendUp = true;
    if (!busy) setOrbStatus("Ready");
  } else if (anyUp) {
    dot.className = "dot dot-amber";
    label.textContent = "PARTIAL";
    backendUp = healthState.n8n === true;
    if (!busy) setOrbStatus("Partial");
  } else {
    dot.className = "dot dot-red";
    label.textContent = "OFFLINE";
    backendUp = false;
    if (!busy) setOrbStatus("Offline");
  }
  const upCount = known.filter(Boolean).length;
  document.getElementById("health-note").textContent =
    `${upCount}/${known.length} services reachable · polls every 8s`;
}

async function ping(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3500), mode: "cors" });
    return r.ok;
  } catch (e) {
    return false;
  }
}

async function refreshServiceHealth() {
  const btn = document.getElementById("health-refresh");
  if (btn) btn.classList.add("spinning");
  const [n8nOk, kokoroOk, relayOk] = await Promise.all([
    ping(HEALTH.n8n),
    ping(HEALTH.kokoro),
    ping(HEALTH.relay),
  ]);
  setHealthRow("n8n", n8nOk);
  setHealthRow("kokoro", kokoroOk);
  setHealthRow("relay", relayOk);
  updateAggregateStatus();
  if (btn) setTimeout(() => btn.classList.remove("spinning"), 400);
}

document.getElementById("health-refresh").addEventListener("click", refreshServiceHealth);
document.getElementById("status-pill").addEventListener("click", async () => {
  toast("Refreshing service health…", 1200);
  await refreshServiceHealth();
  const parts = [
    `n8n ${healthState.n8n ? "✓" : "✗"}`,
    `Kokoro ${healthState.kokoro ? "✓" : "✗"}`,
    `relay ${healthState.relay ? "✓" : "✗"}`,
  ];
  toast(parts.join(" · "), 4000);
});

refreshServiceHealth();
setInterval(refreshServiceHealth, 8000);

// ---------- Status polling (device stats via n8n) ----------
const cpuHist = [];
const ramHist = [];
const HIST_MAX = 24;
let lastStatus = null;
let backendUp = true;
let busy = false;

function setOnline(up) {
  backendUp = up;
  // Aggregate pill is driven by refreshServiceHealth; keep orb in sync.
  if (!busy) setOrbStatus(up ? "Ready" : "Offline");
}

function formatUptime(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
  const s = Math.floor(totalSeconds % 60);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

async function refreshStatus() {
  try {
    const res = await fetch(`${N8N_BASE}/status`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error("bad status");
    const s = await res.json();
    lastStatus = s;

    cpuHist.push(s.cpuLoadPercent);
    ramHist.push(Math.round((s.memUsedGB / s.memTotalGB) * 100));
    while (cpuHist.length > HIST_MAX) cpuHist.shift();
    while (ramHist.length > HIST_MAX) ramHist.shift();

    document.getElementById("stat-cpu").textContent = `${s.cpuLoadPercent}%`;
    document.getElementById("bar-cpu").style.width = `${Math.min(100, s.cpuLoadPercent)}%`;
    document.getElementById("orb-cpu").textContent = s.cpuLoadPercent;

    const ramPercent = ramHist[ramHist.length - 1];
    document.getElementById("stat-ram").textContent = `${ramPercent}%`;
    document.getElementById("bar-ram").style.width = `${ramPercent}%`;
    document.getElementById("orb-ram").textContent = s.memUsedGB.toFixed(1);
    document.getElementById("orb-ram-total").textContent = `of ${s.memTotalGB.toFixed(1)} GB`;

    document.getElementById("stat-uptime").textContent = formatUptime(s.uptimeSeconds);
    document.getElementById("orb-uptime").textContent = formatUptime(s.uptimeSeconds);
    document.getElementById("orb-turns").textContent = s.conversationTurns ?? 0;

    drawSpark("spark-cpu", cpuHist, 100);
    drawSpark("spark-ram", ramHist, 100);
    drawTurnsSpark(s.conversationTurns ?? 0);
    drawUptimeSpark(s.uptimeSeconds);

    setOnline(true);
  } catch (e) {
    setOnline(false);
    document.getElementById("stat-cpu").textContent = "—";
    document.getElementById("stat-ram").textContent = "—";
    document.getElementById("stat-uptime").textContent = "n8n offline";
  }
}
refreshStatus();
setInterval(refreshStatus, 5000);

// ---------- Weather ----------
async function refreshWeather() {
  try {
    const res = await fetch(`${N8N_BASE}/weather`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error("bad weather response");
    const w = await res.json();
    document.getElementById("env-temp").textContent = `${w.tempF} °F`;
    document.getElementById("env-loc").textContent = w.location;
    document.getElementById("env-cond").textContent = w.condition;
    document.getElementById("env-humidity").textContent = `${w.humidity}%`;
    document.getElementById("env-wind").textContent = `${w.windMph} mph`;
    document.getElementById("env-feels").textContent = `${w.feelsLikeF} °F`;
  } catch (e) {
    document.getElementById("env-cond").textContent = "Unavailable (n8n down?)";
  }
}
refreshWeather();
setInterval(refreshWeather, 10 * 60 * 1000);

// ---------- Calendar (EventKit — native bridge only) ----------
const agendaList = document.getElementById("agenda-list");
const briefSub = document.getElementById("brief-sub");

function renderAgenda(events) {
  agendaList.innerHTML = "";
  if (!events.length) {
    briefSub.textContent = "Nothing on your calendar today.";
    return;
  }
  briefSub.textContent = `${events.length} event${events.length === 1 ? "" : "s"} today.`;
  events.forEach((ev) => {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = ev.allDay ? "agenda-dot hollow" : "agenda-dot";
    const time = document.createElement("span");
    time.className = "agenda-time";
    time.textContent = ev.time;
    const label = document.createElement("span");
    label.className = "agenda-label";
    label.textContent = ev.title;
    li.append(dot, time, label);
    agendaList.appendChild(li);
  });
}

function refreshCalendar() {
  if (!bridge()) {
    briefSub.textContent = "Calendar needs EventKit (native live app). Not available in this browser preview.";
    agendaList.innerHTML = "";
    return;
  }
  briefSub.textContent = "Loading today's events…";
  nativeCall({ action: "getCalendarEvents", days: 1 });
}

const fullAgendaOverlay = document.getElementById("full-agenda");
const fullAgendaList = document.getElementById("full-agenda-list");

function renderFullAgenda(events) {
  fullAgendaList.innerHTML = "";
  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "agenda-modal-empty";
    empty.textContent = "Nothing on your calendar for the next 7 days.";
    fullAgendaList.appendChild(empty);
    return;
  }
  let lastDay = null;
  events.forEach((ev) => {
    if (ev.day !== lastDay) {
      lastDay = ev.day;
      const heading = document.createElement("div");
      heading.className = "agenda-day-heading";
      heading.textContent = ev.day;
      fullAgendaList.appendChild(heading);
    }
    const row = document.createElement("div");
    row.className = "agenda-modal-row";
    const time = document.createElement("span");
    time.className = "agenda-time";
    time.textContent = ev.time;
    const label = document.createElement("span");
    label.className = "agenda-label";
    label.textContent = ev.title;
    row.append(time, label);
    fullAgendaList.appendChild(row);
  });
}

function openFullAgenda() {
  if (!bridge()) {
    toast("Calendar is only available in the native live app (⌥⌘D → ~/jarvis).");
    return;
  }
  fullAgendaList.innerHTML = '<div class="agenda-modal-empty">Loading…</div>';
  fullAgendaOverlay.hidden = false;
  nativeCall({ action: "getCalendarEvents", days: 7 });
}
function closeFullAgenda() {
  fullAgendaOverlay.hidden = true;
}
document.getElementById("agenda-link").addEventListener("click", openFullAgenda);
fullAgendaOverlay.addEventListener("click", (e) => { if (e.target === fullAgendaOverlay) closeFullAgenda(); });

window.addEventListener("jarvis-calendar-events", (e) => {
  const detail = e.detail || {};
  const events = detail.events || [];
  if (detail.days > 1) {
    renderFullAgenda(events);
  } else {
    renderAgenda(events);
  }
});
window.addEventListener("jarvis-calendar-error", (e) => {
  const detail = e.detail || {};
  const message = detail.message || "Couldn't load your calendar.";
  if (detail.days > 1) {
    fullAgendaList.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "agenda-modal-empty";
    empty.textContent = message;
    fullAgendaList.appendChild(empty);
  } else {
    briefSub.textContent = message;
  }
});

refreshCalendar();
setInterval(refreshCalendar, 15 * 60 * 1000);
document.getElementById("brief-refresh").addEventListener("click", refreshCalendar);

// ---------- AI Projects ----------
const projectsList = document.getElementById("projects-list");
const projectsSub = document.getElementById("projects-sub");
let projectsCache = [];

async function refreshProjects() {
  try {
    const res = await fetch(`${N8N_BASE}/projects`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error("bad projects response");
    const data = await res.json();
    const projects = data.projects || [];
    projectsCache = projects;
    projectsList.innerHTML = "";
    if (!projects.length) {
      projectsSub.textContent = "Just tell Jarvis about a project idea, or add one yourself.";
      return;
    }
    projectsSub.textContent = `${projects.length} project${projects.length === 1 ? "" : "s"} tracked.`;
    projects.forEach((p) => {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = "project-dot";
      const body = document.createElement("div");
      body.className = "project-body";
      const title = document.createElement("div");
      title.className = "project-title";
      title.textContent = p.title;
      body.appendChild(title);
      if (p.description) {
        const desc = document.createElement("div");
        desc.className = "project-desc";
        desc.textContent = p.description;
        body.appendChild(desc);
      }
      const editBtn = document.createElement("button");
      editBtn.className = "project-edit-btn";
      editBtn.title = "Edit";
      editBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 20l3.5-.7L18.5 8.3a1.5 1.5 0 0 0 0-2.1l-1.7-1.7a1.5 1.5 0 0 0-2.1 0L3.7 15.5 3 19z"/><path d="M13.5 5.5l3 3"/></svg>';
      editBtn.addEventListener("click", () => openProjectModal(p));
      li.append(dot, body, editBtn);
      projectsList.appendChild(li);
    });
  } catch (e) {
    projectsSub.textContent = "Couldn't load projects (n8n webhook offline).";
    projectsList.innerHTML = "";
  }
}
refreshProjects();
setInterval(refreshProjects, 60 * 1000);
document.getElementById("projects-refresh").addEventListener("click", refreshProjects);

const projectModal = document.getElementById("project-modal");
const projectModalTitleEl = document.getElementById("project-modal-title");
const projectModalTitleInput = document.getElementById("project-modal-title-input");
const projectModalDescInput = document.getElementById("project-modal-desc-input");
const projectModalError = document.getElementById("project-modal-error");
const projectModalDeleteBtn = document.getElementById("project-modal-delete");
const projectModalSaveBtn = document.getElementById("project-modal-save");
let editingProjectId = null;

function openProjectModal(project) {
  editingProjectId = project ? project.id : null;
  projectModalTitleEl.textContent = project ? "EDIT PROJECT" : "ADD PROJECT";
  projectModalTitleInput.value = project ? project.title : "";
  projectModalDescInput.value = project ? project.description || "" : "";
  projectModalError.hidden = true;
  projectModalDeleteBtn.hidden = !project;
  projectModalDeleteBtn.textContent = "Delete";
  projectModalDeleteBtn.classList.remove("confirming");
  projectModal.hidden = false;
  projectModalTitleInput.focus();
}
function closeProjectModal() {
  projectModal.hidden = true;
  editingProjectId = null;
}

async function callProjectsApi(payload) {
  const res = await fetch(`${N8N_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(6000),
  });
  return res.json();
}

async function saveProjectModal() {
  const title = projectModalTitleInput.value.trim();
  if (!title) {
    projectModalError.textContent = "Title is required.";
    projectModalError.hidden = false;
    projectModalTitleInput.focus();
    return;
  }
  const description = projectModalDescInput.value.trim();
  const payload = editingProjectId
    ? { action: "update", id: editingProjectId, title, description }
    : { action: "add", title, description };
  try {
    const result = await callProjectsApi(payload);
    if (!result.ok) {
      projectModalError.textContent = result.error || "Couldn't save the project.";
      projectModalError.hidden = false;
      return;
    }
    closeProjectModal();
    refreshProjects();
    toast(editingProjectId ? "Project updated." : "Project added.");
  } catch (e) {
    projectModalError.textContent = "Couldn't reach the backend.";
    projectModalError.hidden = false;
  }
}

async function deleteProjectModal() {
  if (!editingProjectId) return;
  if (!projectModalDeleteBtn.classList.contains("confirming")) {
    projectModalDeleteBtn.classList.add("confirming");
    projectModalDeleteBtn.textContent = "Confirm delete?";
    return;
  }
  try {
    await callProjectsApi({ action: "delete", id: editingProjectId });
    closeProjectModal();
    refreshProjects();
    toast("Project deleted.");
  } catch (e) {
    projectModalError.textContent = "Couldn't reach the backend.";
    projectModalError.hidden = false;
  }
}

document.getElementById("projects-add").addEventListener("click", () => openProjectModal(null));
document.getElementById("project-modal-cancel").addEventListener("click", closeProjectModal);
projectModalSaveBtn.addEventListener("click", saveProjectModal);
projectModalDeleteBtn.addEventListener("click", deleteProjectModal);
projectModal.addEventListener("click", (e) => { if (e.target === projectModal) closeProjectModal(); });
projectModalTitleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); saveProjectModal(); }
});

// ---------- Market Digest ----------
const digestSub = document.getElementById("digest-sub");
const digestTickers = document.getElementById("digest-tickers");
let digestCache = null;

async function refreshDigest() {
  try {
    const res = await fetch(`${N8N_BASE}/newsletter`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error("bad newsletter response");
    const data = await res.json();
    digestCache = data;
    const entries = data.analysis || [];
    digestTickers.innerHTML = "";
    if (!entries.length) {
      digestSub.textContent = "No digest yet — next one runs at 10am.";
      return;
    }
    digestSub.textContent = `${data.date} · ${entries.length} ticker${entries.length === 1 ? "" : "s"} analyzed.`;
    entries.forEach((e) => {
      const chip = document.createElement("span");
      chip.className = "digest-ticker-chip";
      chip.textContent = e.ticker;
      digestTickers.appendChild(chip);
    });
  } catch (e) {
    digestSub.textContent = "Couldn't load digest (n8n offline).";
    digestTickers.innerHTML = "";
  }
}
refreshDigest();
setInterval(refreshDigest, 5 * 60 * 1000);

const digestModal = document.getElementById("digest-modal");
const digestModalList = document.getElementById("digest-modal-list");
const digestModalTitle = document.getElementById("digest-modal-title");

function openDigestModal() {
  const data = digestCache;
  const entries = (data && data.analysis) || [];
  digestModalTitle.textContent = data && data.date ? `MARKET DIGEST — ${data.date.toUpperCase()}` : "MARKET DIGEST";
  digestModalList.innerHTML = "";
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "digest-modal-empty";
    empty.textContent = "No digest yet — the next one runs at 10am.";
    digestModalList.appendChild(empty);
  } else {
    entries.forEach((e) => {
      const card = document.createElement("div");
      card.className = "digest-entry";
      const head = document.createElement("div");
      head.className = "digest-entry-head";
      const ticker = document.createElement("span");
      ticker.className = "digest-entry-ticker";
      ticker.textContent = e.ticker;
      const company = document.createElement("span");
      company.className = "digest-entry-company";
      company.textContent = e.company;
      head.append(ticker, company);
      const summary = document.createElement("div");
      summary.className = "digest-entry-summary";
      summary.textContent = e.summary;
      const outlooks = document.createElement("div");
      outlooks.className = "digest-entry-outlooks";
      const short = document.createElement("div");
      short.className = "digest-outlook short";
      short.innerHTML = '<div class="digest-outlook-label">Short-Term</div>';
      const shortText = document.createElement("div");
      shortText.className = "digest-outlook-text";
      shortText.textContent = e.shortTermImpact;
      short.appendChild(shortText);
      const long = document.createElement("div");
      long.className = "digest-outlook long";
      long.innerHTML = '<div class="digest-outlook-label">Long-Term</div>';
      const longText = document.createElement("div");
      longText.className = "digest-outlook-text";
      longText.textContent = e.longTermImpact;
      long.appendChild(longText);
      outlooks.append(short, long);
      card.append(head, summary, outlooks);
      digestModalList.appendChild(card);
    });
  }
  digestModal.hidden = false;
}
function closeDigestModal() {
  digestModal.hidden = true;
}
document.getElementById("digest-card").addEventListener("click", openDigestModal);
digestModal.addEventListener("click", (e) => { if (e.target === digestModal) closeDigestModal(); });

// ---------- Sparklines (cyan) ----------
function sparkCtx(id) {
  const c = document.getElementById(id);
  const dpr = window.devicePixelRatio || 1;
  if (!c.dataset.scaled) {
    const w = c.width, h = c.height;
    c.style.width = w + "px";
    c.style.height = h + "px";
    c.width = w * dpr;
    c.height = h * dpr;
    c.dataset.scaled = "1";
  }
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: parseInt(c.style.width), h: parseInt(c.style.height) };
}

function drawBars(id, values, maxVal) {
  const { ctx, w, h } = sparkCtx(id);
  ctx.clearRect(0, 0, w, h);
  const n = values.length;
  if (!n) return;
  const bw = 2.5, gap = (w - n * bw) / Math.max(1, n - 1);
  values.forEach((v, i) => {
    const frac = Math.max(0.06, Math.min(1, v / maxVal));
    const bh = frac * (h - 2);
    const x = i * (bw + gap);
    const age = (i + 1) / n;
    ctx.fillStyle = `rgba(77, 184, 255, ${0.25 + 0.65 * age})`;
    ctx.fillRect(x, h - bh, bw, bh);
  });
}
function drawSpark(id, hist, maxVal) {
  const padded = hist.length < HIST_MAX ? Array(HIST_MAX - hist.length).fill(0).concat(hist) : hist;
  drawBars(id, padded, maxVal);
}
function drawTurnsSpark(turns) {
  const vals = Array.from({ length: 10 }, (_, i) => (i < turns ? 85 : 6));
  drawBars("spark-turns", vals, 100);
}
let uptimePattern = null;
function drawUptimeSpark(uptime) {
  if (!uptimePattern) {
    let seed = uptime % 997;
    uptimePattern = Array.from({ length: 16 }, () => {
      seed = (seed * 9301 + 49297) % 233280;
      return 25 + (seed / 233280) * 70;
    });
  }
  drawBars("spark-uptime", uptimePattern, 100);
}

// ---------- Particle orb (cyan/steel) ----------
const orbCanvas = document.getElementById("orb-canvas");
const orbCtx = orbCanvas.getContext("2d");
let orbSize = 0;

function setOrbStatus(text) {
  document.getElementById("orb-status").textContent = text;
}

const sprite = document.createElement("canvas");
sprite.width = sprite.height = 32;
{
  const sctx = sprite.getContext("2d");
  const g = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(200, 240, 255, 1)");
  g.addColorStop(0.25, "rgba(125, 211, 252, 0.8)");
  g.addColorStop(0.6, "rgba(77, 184, 255, 0.25)");
  g.addColorStop(1, "rgba(30, 100, 160, 0)");
  sctx.fillStyle = g;
  sctx.fillRect(0, 0, 32, 32);
}

let particles = [];
let speckles = [];
const DIAMOND_ANGLES = [-90, -30, 30, 90, 150, 210].map((d) => (d * Math.PI) / 180);

function initOrb() {
  const stage = document.getElementById("orb-stage");
  const size = Math.min(stage.clientWidth, stage.clientHeight);
  if (!size || size === orbSize) return;
  orbSize = size;
  const dpr = window.devicePixelRatio || 1;
  orbCanvas.width = size * dpr;
  orbCanvas.height = size * dpr;
  orbCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const ringR = size * 0.335;
  particles = Array.from({ length: 340 }, () => {
    const band = Math.random();
    const base = band < 0.72 ? ringR : ringR * 0.62;
    const spreadScale = band < 0.72 ? 0.016 : 0.012;
    return {
      a: Math.random() * Math.PI * 2,
      r: base + (Math.random() + Math.random() + Math.random() - 1.5) * size * spreadScale,
      w: (0.00008 + Math.random() * 0.00035) * (Math.random() < 0.5 ? -1 : 1),
      size: 0.8 + Math.random() * 2.2,
      ph: Math.random() * Math.PI * 2,
      fs: 0.001 + Math.random() * 0.004,
    };
  });
  speckles = Array.from({ length: 260 }, () => ({
    a: Math.random() * Math.PI * 2,
    r: ringR * (0.3 + 0.68 * Math.pow(Math.random(), 0.5)),
    alpha: 0.04 + Math.random() * 0.16,
    ph: Math.random() * Math.PI * 2,
    tw: 0.0008 + Math.random() * 0.003,
  }));
}

function drawOrb(t) {
  if (!orbSize) return;
  const S = orbSize, cx = S / 2, cy = S / 2;
  const ringR = S * 0.335;
  const speed = busy ? 3.0 : 1.0;
  const bright = busy ? 1.35 : 1.0;

  orbCtx.clearRect(0, 0, S, S);

  orbCtx.globalCompositeOperation = "source-over";
  orbCtx.lineWidth = 1;
  [S * 0.46, S * 0.40, ringR * 0.62].forEach((r, i) => {
    orbCtx.beginPath();
    orbCtx.arc(cx, cy, r, 0, Math.PI * 2);
    orbCtx.strokeStyle = `rgba(77, 184, 255, ${0.12 - i * 0.02})`;
    orbCtx.stroke();
  });

  const arcs = [
    { r: S * 0.43, w: 0.00006, dash: [2, 9], alpha: 0.35 },
    { r: S * 0.40, w: -0.00004, dash: [14, 26], alpha: 0.25 },
    { r: ringR * 0.52, w: 0.00012, dash: [3, 6], alpha: 0.3 },
  ];
  arcs.forEach((a) => {
    orbCtx.save();
    orbCtx.translate(cx, cy);
    orbCtx.rotate(t * a.w * speed);
    orbCtx.beginPath();
    orbCtx.setLineDash(a.dash);
    orbCtx.arc(0, 0, a.r, 0, Math.PI * 2);
    orbCtx.strokeStyle = `rgba(125, 211, 252, ${a.alpha})`;
    orbCtx.stroke();
    orbCtx.restore();
  });
  orbCtx.setLineDash([]);

  orbCtx.strokeStyle = "rgba(77, 184, 255, 0.4)";
  [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
    const r1 = S * 0.455, r2 = S * 0.48;
    orbCtx.beginPath();
    orbCtx.moveTo(cx + dx * r1, cy + dy * r1);
    orbCtx.lineTo(cx + dx * r2, cy + dy * r2);
    orbCtx.stroke();
  });

  orbCtx.globalCompositeOperation = "lighter";

  [[ringR, 0.4], [ringR * 0.62, 0.25]].forEach(([r, alpha]) => {
    orbCtx.beginPath();
    orbCtx.arc(cx, cy, r, 0, Math.PI * 2);
    orbCtx.strokeStyle = `rgba(125, 211, 252, ${alpha * bright})`;
    orbCtx.lineWidth = 1.2;
    orbCtx.stroke();
  });

  const streaks = [
    { w: 0.00042, len: 0.9, off: 0 },
    { w: -0.00028, len: 0.55, off: 2.2 },
    { w: 0.0002, len: 1.3, off: 4.1 },
  ];
  streaks.forEach((s) => {
    const start = s.off + t * s.w * speed;
    orbCtx.beginPath();
    orbCtx.arc(cx, cy, ringR, start, start + s.len);
    orbCtx.strokeStyle = `rgba(180, 230, 255, ${0.4 * bright})`;
    orbCtx.lineWidth = 2.6;
    orbCtx.shadowColor = "rgba(77, 184, 255, 0.85)";
    orbCtx.shadowBlur = 10;
    orbCtx.stroke();
    orbCtx.shadowBlur = 0;
  });

  const worldRot = t * 0.000012 * speed;
  speckles.forEach((sp) => {
    const tw = 0.55 + 0.45 * Math.sin(t * sp.tw + sp.ph);
    const x = cx + Math.cos(sp.a + worldRot) * sp.r;
    const y = cy + Math.sin(sp.a + worldRot) * sp.r;
    orbCtx.globalAlpha = sp.alpha * tw * bright * 0.6;
    orbCtx.drawImage(sprite, x - 1.1, y - 1.1, 2.2, 2.2);
  });

  particles.forEach((p) => {
    p.a += p.w * speed * 16;
    const flick = 0.5 + 0.5 * Math.sin(t * p.fs + p.ph);
    const x = cx + Math.cos(p.a) * p.r;
    const y = cy + Math.sin(p.a) * p.r;
    const d = p.size * (2.6 + flick);
    orbCtx.globalAlpha = (0.22 + 0.55 * flick) * bright;
    orbCtx.drawImage(sprite, x - d / 2, y - d / 2, d, d);
  });
  orbCtx.globalAlpha = 1;

  DIAMOND_ANGLES.forEach((a, i) => {
    const pulse = 0.6 + 0.4 * Math.sin(t * 0.0015 + i * 1.3);
    const x = cx + Math.cos(a) * S * 0.40;
    const y = cy + Math.sin(a) * S * 0.40;
    orbCtx.save();
    orbCtx.translate(x, y);
    orbCtx.rotate(Math.PI / 4);
    orbCtx.globalAlpha = pulse * bright;
    orbCtx.fillStyle = "#7dd3fc";
    orbCtx.shadowColor = "rgba(125, 211, 252, 0.9)";
    orbCtx.shadowBlur = 8;
    orbCtx.fillRect(-2.6, -2.6, 5.2, 5.2);
    orbCtx.restore();
  });
  orbCtx.globalAlpha = 1;

  orbCtx.globalCompositeOperation = "source-over";
  const dark = orbCtx.createRadialGradient(cx, cy, 0, cx, cy, ringR * 0.55);
  dark.addColorStop(0, "rgba(4, 8, 12, 0.55)");
  dark.addColorStop(0.7, "rgba(4, 8, 12, 0.22)");
  dark.addColorStop(1, "rgba(4, 8, 12, 0)");
  orbCtx.fillStyle = dark;
  orbCtx.beginPath();
  orbCtx.arc(cx, cy, ringR * 0.55, 0, Math.PI * 2);
  orbCtx.fill();
}

function drawWave(id, t, amp) {
  const { ctx, w, h } = sparkCtx(id);
  ctx.clearRect(0, 0, w, h);
  const bars = Math.floor(w / 4.5);
  for (let i = 0; i < bars; i++) {
    const env = Math.sin((i / (bars - 1)) * Math.PI);
    const wob = 0.5 + 0.5 * Math.sin(t * 0.007 + i * 0.85) * Math.sin(t * 0.0031 + i * 0.31);
    const bh = Math.max(1.5, env * wob * amp * (h - 2));
    const x = i * 4.5 + 1;
    ctx.fillStyle = `rgba(77, 184, 255, ${0.35 + 0.55 * env * wob})`;
    ctx.fillRect(x, (h - bh) / 2, 2.4, bh);
  }
}

initOrb();
window.addEventListener("resize", initOrb);
function loop(t) {
  drawOrb(t);
  drawWave("wave-center", t, busy ? 1 : 0.4);
  drawWave("listen-wave", t, 0.6);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- Spoken replies (Kokoro) ----------
let voiceOn = true;
let currentAudio = null;
const voiceToggle = document.getElementById("voice-toggle");
voiceToggle.addEventListener("click", () => {
  voiceOn = !voiceOn;
  voiceToggle.classList.toggle("muted", !voiceOn);
  voiceToggle.title = `Spoken replies: ${voiceOn ? "on" : "off"}`;
  if (!voiceOn && currentAudio) { currentAudio.pause(); currentAudio = null; }
  toast(`Spoken replies ${voiceOn ? "on" : "off"}`);
});

function splitSentences(text) {
  const PLACEHOLDER = "\u0001";
  const protectedText = text.replace(/\b[A-Z](?:\.[A-Z])+\.?/g, (m) => m.split(".").join(PLACEHOLDER));
  const restore = (s) => s.split(PLACEHOLDER).join(".");
  const parts = protectedText.match(/[^.!?]+[.!?]+(\s+|$)/g);
  if (!parts || !parts.length) return [restore(protectedText.trim())].filter(Boolean);
  return parts.map((s) => restore(s.trim())).filter(Boolean);
}

const MIN_FIRST_CHUNK_WORDS = 20;

function splitIntoSpeechChunks(text) {
  const sentences = splitSentences(text);
  if (sentences.length <= 1) return sentences;
  const firstChunkSentences = [sentences[0]];
  let wordCount = sentences[0].split(/\s+/).length;
  let i = 1;
  while (wordCount < MIN_FIRST_CHUNK_WORDS && i < sentences.length - 1) {
    firstChunkSentences.push(sentences[i]);
    wordCount += sentences[i].split(/\s+/).length;
    i++;
  }
  const first = firstChunkSentences.join(" ");
  const rest = sentences.slice(i).join(" ");
  return rest ? [first, rest] : [first];
}

function forSpeech(text) {
  return text.replace(/\bJ\.A\.R\.V\.I\.S\.?/gi, "Jarvis");
}

async function synthesize(sentence) {
  const res = await fetch(`${KOKORO_BASE}/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: forSpeech(sentence) }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error("tts failed");
  return URL.createObjectURL(await res.blob());
}

function playAudio(url) {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = resolve;
    audio.onerror = resolve;
    audio.play().catch(resolve);
  });
}

let voiceQueueToken = 0;

async function speak(text) {
  if (!voiceOn || !text) return;
  const myToken = ++voiceQueueToken;
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  const sentences = splitIntoSpeechChunks(text);
  if (!sentences.length) return;
  let nextClip = synthesize(sentences[0]).catch(() => null);
  for (let i = 0; i < sentences.length; i++) {
    if (myToken !== voiceQueueToken) return;
    const url = await nextClip;
    if (i + 1 < sentences.length) {
      nextClip = synthesize(sentences[i + 1]).catch(() => null);
    }
    if (!url) continue;
    if (myToken !== voiceQueueToken) return;
    await playAudio(url);
  }
}

// ---------- Chat (voice-relay) ----------
const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

function addMessage(who, text, timeStr) {
  const wrap = document.createElement("div");
  wrap.className = `chat-msg ${who}`;
  const time = timeStr ?? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  wrap.innerHTML = `
    <div class="meta"><span class="who">${who === "user" ? "YOU" : "JARVIS"}</span><span class="time">${time}</span></div>
    <div class="body"></div>
  `;
  wrap.querySelector(".body").textContent = text;
  chatLog.appendChild(wrap);
  chatLog.scrollTop = chatLog.scrollHeight;
  return wrap;
}

async function sendToJarvis(text) {
  addMessage("user", text);
  chatInput.value = "";
  chatInput.disabled = true;
  busy = true;
  setOrbStatus("Processing…");

  const pending = addMessage("assistant", "");
  const body = pending.querySelector(".body");
  body.classList.add("thinking");

  const myToken = ++voiceQueueToken;
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }

  let replyText = "";
  let gotAnyDelta = false;
  const audioQueue = [];
  let pumping = false;

  async function pump() {
    if (pumping) return;
    pumping = true;
    while (audioQueue.length) {
      if (myToken !== voiceQueueToken) { audioQueue.length = 0; break; }
      const blob = audioQueue.shift();
      if (voiceOn) {
        const url = URL.createObjectURL(blob);
        await playAudio(url);
      }
    }
    pumping = false;
  }

  await new Promise((resolveTurn) => {
    let ws;
    try {
      ws = new WebSocket(VOICE_RELAY_WS);
    } catch (e) {
      body.classList.remove("thinking");
      body.textContent = "I couldn't reach voice-relay (port 8766). Is the live Jarvis stack running?";
      resolveTurn();
      return;
    }
    ws.binaryType = "blob";
    const timeout = setTimeout(() => ws.close(), 60000);
    ws.onopen = () => ws.send(JSON.stringify({ type: "user_text", text }));
    ws.onmessage = (event) => {
      if (myToken !== voiceQueueToken) return;
      if (typeof event.data !== "string") {
        audioQueue.push(event.data);
        pump();
        return;
      }
      let msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      if (msg.type === "text_delta") {
        if (!gotAnyDelta) { body.classList.remove("thinking"); gotAnyDelta = true; }
        replyText += msg.text;
        body.textContent = replyText;
        chatLog.scrollTop = chatLog.scrollHeight;
      } else if (msg.type === "tool_used") {
        refreshProjects();
      } else if (msg.type === "error") {
        body.classList.remove("thinking");
        body.textContent = replyText || "I couldn't reach the backend just now.";
      } else if (msg.type === "done") {
        clearTimeout(timeout);
        ws.close();
      }
    };
    ws.onerror = () => {
      clearTimeout(timeout);
      body.classList.remove("thinking");
      if (!replyText) body.textContent = "I couldn't reach voice-relay just now.";
    };
    ws.onclose = () => {
      clearTimeout(timeout);
      body.classList.remove("thinking");
      if (!gotAnyDelta) body.textContent = body.textContent || "(empty reply — is voice-relay up?)";
      resolveTurn();
    };
  });

  busy = false;
  setOrbStatus(backendUp ? "Ready" : "Offline");
  chatInput.disabled = false;
  chatInput.focus();
  chatLog.scrollTop = chatLog.scrollHeight;
  refreshStatus();
  refreshProjects();
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (text === "/") { chatInput.value = ""; openPalette(); return; }
  if (text) sendToJarvis(text);
});

document.querySelectorAll(".suggest-btn").forEach((btn) => {
  btn.addEventListener("click", () => sendToJarvis(btn.dataset.prompt));
});

(async function hydrate() {
  try {
    const res = await fetch(`${N8N_BASE}/history`, { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    const history = data.history || [];
    history.forEach((m) => addMessage(m.role === "user" ? "user" : "assistant", m.content, "earlier"));
    if (!history.length) {
      addMessage("assistant", "Jarvis OS v2 online. Ask me anything below, or press / for quick commands. (This is the cyan rebuild — ⌥⌘D still opens the original amber app.)");
    } else {
      chatLog.scrollTop = chatLog.scrollHeight;
    }
  } catch (e) {
    addMessage("assistant", "Jarvis OS v2 online. Backend history unavailable — you can still try chat if voice-relay is up. Press / for commands.");
  }
})();

// ---------- Voice / focus / commands ----------
function startVoice() {
  nativeCall({ action: "voice" });
}
document.getElementById("btn-voice").addEventListener("click", startVoice);
document.getElementById("mic-btn").addEventListener("click", startVoice);

let listening = false;
const btnVoice = document.getElementById("btn-voice");
const micBtn = document.getElementById("mic-btn");

function setListeningUI(on) {
  listening = on;
  btnVoice.classList.toggle("listening", on);
  micBtn.classList.toggle("listening", on);
}

window.addEventListener("jarvis-voice-start", () => {
  setListeningUI(true);
  chatInput.value = "";
  chatInput.placeholder = "Listening…";
  setOrbStatus("Listening…");
});
window.addEventListener("jarvis-voice-partial", (e) => {
  chatInput.value = (e.detail && e.detail.text) || "";
});
window.addEventListener("jarvis-voice-result", (e) => {
  setListeningUI(false);
  chatInput.placeholder = "Ask anything or give a command...";
  const text = e.detail && e.detail.text;
  if (text) sendToJarvis(text);
});
window.addEventListener("jarvis-voice-cancelled", () => {
  setListeningUI(false);
  chatInput.value = "";
  chatInput.placeholder = "Ask anything or give a command...";
  setOrbStatus(backendUp ? "Ready" : "Offline");
});
window.addEventListener("jarvis-voice-error", (e) => {
  setListeningUI(false);
  chatInput.placeholder = "Ask anything or give a command...";
  toast((e.detail && e.detail.message) || "Voice input failed.");
  setOrbStatus(backendUp ? "Ready" : "Offline");
});

document.getElementById("btn-commands").addEventListener("click", () => openPalette());

// ---------- Focus / Compact layout ----------
const mainEl = document.getElementById("main");
const assistantToggle = document.getElementById("assistant-toggle");
const focusToggle = document.getElementById("focus-toggle");
const sideFocus = document.getElementById("side-focus");
const btnFocusCtrl = document.getElementById("btn-focus-ctrl");
let chatVisible = true;
let focusMode = false;

function setChatVisible(visible) {
  chatVisible = visible;
  mainEl.classList.toggle("chat-hidden", !visible);
  assistantToggle.classList.toggle("active", visible);
  assistantToggle.title = visible ? "Hide assistant panel" : "Show assistant panel";
}

function setFocusMode(on) {
  focusMode = on;
  mainEl.classList.toggle("focus-mode", on);
  focusToggle.classList.toggle("active", on);
  sideFocus.classList.toggle("active", on);
  btnFocusCtrl.classList.toggle("active-focus", on);
  if (on && !chatVisible) setChatVisible(true);
  toast(on ? "Focus mode — orb + assistant" : "Full dashboard layout", 1800);
  requestAnimationFrame(() => { orbSize = 0; initOrb(); });
}

focusToggle.addEventListener("click", () => setFocusMode(!focusMode));
sideFocus.addEventListener("click", () => setFocusMode(!focusMode));
btnFocusCtrl.addEventListener("click", () => setFocusMode(!focusMode));
assistantToggle.addEventListener("click", () => setChatVisible(!chatVisible));
document.getElementById("panel-close").addEventListener("click", () => setChatVisible(false));

setChatVisible(true);

async function newConversation() {
  try {
    await fetch(`${N8N_BASE}/reset`, { method: "POST", signal: AbortSignal.timeout(4000) });
    chatLog.innerHTML = "";
    addMessage("assistant", "Fresh start. What shall we talk about?");
    toast("Short-term memory cleared.");
    refreshStatus();
  } catch (e) {
    toast("Couldn't reach the backend to clear memory.");
  }
}

document.getElementById("env-refresh").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.classList.add("spinning");
  await Promise.all([refreshWeather(), refreshStatus()]);
  setTimeout(() => btn.classList.remove("spinning"), 900);
});

// ---------- Command palette ----------
const paletteEl = document.getElementById("palette");
const paletteList = document.getElementById("palette-list");

const COMMANDS = [
  {
    label: "Toggle focus layout", desc: "Hide secondary cards; emphasize orb + assistant", badge: null,
    icon: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    run: () => setFocusMode(!focusMode),
  },
  {
    label: "Voice input", desc: "Needs native live app bridge", badge: "native",
    icon: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v4"/>',
    run: startVoice,
  },
  {
    label: "New conversation", desc: "Clear short-term memory via n8n", badge: null,
    icon: '<path d="M12 5v14M5 12h14"/>',
    run: newConversation,
  },
  {
    label: "Check services", desc: "Ping n8n, Kokoro, voice-relay", badge: null,
    icon: '<path d="M22 12h-4l-3 8L9 4l-3 8H2"/>',
    run: async () => {
      await refreshServiceHealth();
      toast(`n8n ${healthState.n8n ? "✓" : "✗"} · Kokoro ${healthState.kokoro ? "✓" : "✗"} · relay ${healthState.relay ? "✓" : "✗"}`, 4500);
    },
  },
  {
    label: "Toggle assistant panel", desc: "Show or hide the chat panel", badge: null,
    icon: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
    run: () => setChatVisible(!chatVisible),
  },
];

COMMANDS.forEach((cmd) => {
  const btn = document.createElement("button");
  btn.className = "palette-item";
  btn.innerHTML = `
    <svg viewBox="0 0 24 24">${cmd.icon}</svg>
    <span><span class="pi-label">${cmd.label}</span><br/><span class="pi-desc">${cmd.desc}</span></span>
    ${cmd.badge ? `<span class="pi-badge">${cmd.badge}</span>` : ""}
  `;
  btn.addEventListener("click", () => { closePalette(); cmd.run(); });
  paletteList.appendChild(btn);
});

function openPalette() { paletteEl.hidden = false; }
function closePalette() { paletteEl.hidden = true; }
paletteEl.addEventListener("click", (e) => { if (e.target === paletteEl) closePalette(); });

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closePalette();
    closeFullAgenda();
    closeProjectModal();
    closeDigestModal();
    if (listening) nativeCall({ action: "voiceCancel" });
  }
  if (e.key === "/" && document.activeElement !== chatInput) {
    e.preventDefault();
    openPalette();
  }
  if ((e.key === "f" || e.key === "F") && (e.metaKey || e.ctrlKey) && e.shiftKey) {
    e.preventDefault();
    setFocusMode(!focusMode);
  }
});

window.addEventListener("jarvis-bridge", (e) => {
  const d = e.detail || {};
  if (d.ok === false) toast(`That didn't work (${d.action ?? "action"} failed).`);
});
