// Study Buddy frontend: library sidebar, material pages, and the tutor chat.
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const api = async (path, opts = {}) => {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
};

let lib = { items: [], kinds: [] };
let route = location.hash || "#/";
let chatBusy = false;

// ---------- tiny markdown renderer (headings, lists, code, tables, bold/italic) ----------
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
}
function md(src) {
  const lines = String(src || "").split("\n");
  let html = "", list = null, i = 0;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      closeList();
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      html += `<pre><code>${esc(code.join("\n"))}</code></pre>`;
      i++; continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList();
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      html += "<table>" + rows.filter(r => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map((r, n) =>
        "<tr>" + r.trim().slice(1, -1).split("|").map(c => n ? `<td>${inline(c.trim())}</td>` : `<th>${inline(c.trim())}</th>`).join("") + "</tr>"
      ).join("") + "</table>";
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)/))) { closeList(); const n = Math.min(3, m[1].length + 1); html += `<h${n}>${inline(m[2])}</h${n}>`; }
    else if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { if (list !== "ul") { closeList(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== "ol") { closeList(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[1])}</li>`; }
    else if (!line.trim()) closeList();
    else { closeList(); html += `<p>${inline(line)}</p>`; }
    i++;
  }
  closeList();
  return html;
}

// ---------- toast & modal ----------
function toast(msg, ms = 3500) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms);
}

// ---------- library & sidebar ----------
function bySubject(items) {
  const groups = {};
  for (const m of items) (groups[m.subject || (m.status === "error" ? "Couldn't read" : "Sorting…")] ??= []).push(m);
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

function renderNav() {
  const q = $("#search").value.trim().toLowerCase();
  const items = lib.items.filter(m => !q || [m.title, m.filename, m.subject, m.kind, ...(m.topics || [])]
    .join(" ").toLowerCase().includes(q));
  let html = `<button class="nav-item ${route === "#/" ? "active" : ""}" data-go="#/">🏠 <span class="name">All material</span><span class="count">${lib.items.length}</span></button>`;
  for (const [subject, list] of bySubject(items)) {
    const sr = `#/subject/${encodeURIComponent(subject)}`;
    html += `<div class="group"><button class="nav-item ${route === sr ? "active" : ""}" data-go="${sr}">📂 <span class="name">${esc(subject)}</span><span class="count">${list.length}</span></button><div class="items">`;
    for (const m of list) {
      const r = `#/m/${m.id}`;
      html += `<button class="nav-item ${route === r ? "active" : ""}" data-go="${r}" title="${esc(m.filename)}"><span class="dot ${m.status}"></span><span class="name">${esc(m.title || m.filename)}</span></button>`;
    }
    html += "</div></div>";
  }
  if (!items.length && q) html += `<p class="hint" style="padding:8px 10px">Nothing matches "${esc(q)}".</p>`;
  $("#nav").innerHTML = html;
}

async function refresh() {
  try { lib = await api("/api/library"); } catch { return; }
  renderNav();
  // keep pages that show processing state live
  const busy = lib.items.some(m => m.status === "queued" || m.status === "processing");
  if (!chatBusy && (route === "#/" || route.startsWith("#/subject/") || busy)) renderView(true);
  clearTimeout(refresh.t);
  refresh.t = setTimeout(refresh, busy ? 2500 : 15000);
}

$("#nav").addEventListener("click", e => {
  const b = e.target.closest("[data-go]");
  if (b) { location.hash = b.dataset.go; $("#sidebar").classList.remove("open"); }
});
$("#search").addEventListener("input", renderNav);
$("#search").addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.value.trim()) { location.hash = `#/search/${encodeURIComponent(e.target.value.trim())}`; $("#sidebar").classList.remove("open"); }
});
$("#openSide").onclick = () => $("#sidebar").classList.add("open");
$("#closeSide").onclick = () => $("#sidebar").classList.remove("open");

// ---------- upload ----------
async function uploadFiles(files) {
  if (!files.length) return;
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  toast(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
  try {
    const r = await fetch("/api/upload", { method: "POST", body: fd }).then(r => r.json());
    const msg = [];
    if (r.added.length) msg.push(`Added ${r.added.length}. The AI is reading and sorting it now.`);
    if (r.skipped.length) msg.push("Skipped: " + r.skipped.join("; "));
    toast(msg.join(" "), 6000);
    if (r.added.length === 1) location.hash = `#/m/${r.added[0]}`;
    refresh();
  } catch (e) { toast("Upload failed: " + e.message); }
}
$("#fileInput").onchange = e => { uploadFiles([...e.target.files]); e.target.value = ""; };
const drop = $("#drop");
for (const ev of ["dragenter", "dragover"]) document.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); });
for (const ev of ["dragleave", "drop"]) document.addEventListener(ev, e => { e.preventDefault(); if (ev === "drop" || !e.relatedTarget) drop.classList.remove("over"); });
document.addEventListener("drop", e => uploadFiles([...e.dataTransfer.files]));

// ---------- views ----------
function statusBlock(m) {
  if (m.status === "error") return `<div class="error-box">⚠️ ${esc(m.error)}</div>`;
  if (m.status !== "ready") {
    const pos = lib.items.filter(x => x.status === "queued").length;
    return `<div class="progress"><span class="spinner"></span><span>${esc(m.progress || "Working…")}${m.status === "queued" && pos > 1 ? ` (${pos} files waiting)` : ""}</span></div>
      <p class="hint">The AI runs on your own computer, so a long PDF can take a few minutes. You can keep using the app meanwhile.</p>`;
  }
  return "";
}

function tile(m) {
  return `<button class="tile" data-go="#/m/${m.id}"><b>${esc(m.title || m.filename)}</b>
    <span class="meta"><span class="dot ${m.status}"></span>${esc(m.kind || (m.status === "error" ? "Error" : "Processing…"))}${m.unit ? ` · ${esc(m.unit)}` : ""}</span>
    <small>${esc((m.topics || []).slice(0, 4).join(" · "))}</small></button>`;
}

async function renderView(soft = false) {
  route = location.hash || "#/";
  renderNav();
  const view = $("#view");
  if (route.startsWith("#/m/")) return renderMaterial(route.slice(4), soft);
  if (route.startsWith("#/search/")) return soft ? undefined : renderSearch(decodeURIComponent(route.slice(9)));
  // library or subject overview (soft refresh only replaces the left content, keeps the chat)
  const subject = route.startsWith("#/subject/") ? decodeURIComponent(route.slice(10)) : null;
  const scope = subject ? `subject:${subject}` : "all";
  const items = subject ? lib.items.filter(m => (m.subject || "") === subject) : lib.items;
  let html;
  if (!lib.items.length) {
    html = `<div class="empty"><div class="big">📚</div><h1>Your study library is empty</h1>
      <p>Add PDFs, Word files, slides, notebooks or notes with the button on the left (or drop them anywhere).<br>
      Each one gets sorted by subject and summarized, and your tutor can teach you from it.</p></div>`;
  } else if (subject) {
    html = `<h1>📂 ${esc(subject)}</h1><p class="meta">${items.length} item${items.length !== 1 ? "s" : ""} · ask the tutor about anything in this subject →</p>`;
    html += unitTree(items);
  } else {
    const token = renderView.n = (renderView.n || 0) + 1;
    html = await dashboardHtml();
    if (token !== renderView.n) return;     // a newer render started while this one waited
  }
  let content = $(".content", view);
  if (!soft || !content || view.dataset.scope !== scope) {
    view.innerHTML = `<div class="content with-chat"></div>`;
    view.dataset.scope = scope;
    content = $(".content", view);
    if (lib.items.length) view.append(makeChat(scope, subject ? `Everything in ${subject}` : "Your whole library", [
      ["What should I study first?", "Look at my materials and suggest a study plan: what to learn first and in what order."],
      ["Quiz me", "Quiz me with 5 mixed questions from my material, one at a time. Wait for my answer each time."],
      ["Key ideas", "What are the most important ideas across this material? Give a short overview."],
    ]));
  }
  const typing = $("#bigSearch input", content);
  if (soft && typing && (typing === document.activeElement || typing.value)) return;
  content.innerHTML = html;
  content.onclick = e => { const b = e.target.closest("[data-go]"); if (b) location.hash = b.dataset.go; };
  const bs = $("#bigSearch", content);
  if (bs) bs.onsubmit = e => { e.preventDefault(); const q = bs.q.value.trim(); if (q) location.hash = `#/search/${encodeURIComponent(q)}`; };
  $("#mobileTitle").textContent = subject || "Study Buddy";
}

// ---------- dashboard, unit tree, search ----------
function unitTree(items) {
  // Subject → Unit → type. Materials with no stated unit go under "General".
  const units = {};
  for (const m of items) (units[m.unit || ""] ??= []).push(m);
  const keys = Object.keys(units).sort((a, b) => !a - !b || a.localeCompare(b, undefined, { numeric: true }));
  let html = "";
  for (const u of keys) {
    const kinds = {};
    for (const m of units[u]) (kinds[m.kind || "Processing"] ??= []).push(m);
    if (keys.length > 1 || u) html += `<div class="subject-head"><h2>${esc(u || "General")}</h2><span class="hint">${units[u].length}</span></div>`;
    for (const [k, list] of Object.entries(kinds)) html += `<h3 class="kind-head">${esc(k)}</h3><div class="grid">${list.map(tile).join("")}</div>`;
  }
  return html;
}

const ago = t => {
  const s = Date.now() / 1000 - t;
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
};
const scopeHash = s => s === "all" ? "#/" : s.startsWith("subject:") ? `#/subject/${encodeURIComponent(s.slice(8))}` : `#/m/${s}`;

async function dashboardHtml() {
  let d = { questions: 0, streak: 0, study_days: 0, recent: [] };
  try { d = await api("/api/dashboard"); } catch {}
  const ready = lib.items.filter(m => m.status === "ready").length;
  const working = lib.items.length - ready - lib.items.filter(m => m.status === "error").length;
  let html = `<h1>Your study dashboard</h1>
    <form class="bigsearch" id="bigSearch"><input name="q" placeholder="🔎 Search inside all your material (by meaning, not just exact words)…"><button class="primary">Search</button></form>
    <div class="stats">
      <div class="stat"><b>${lib.items.length}</b><small>materials${working ? ` · ${working} processing` : ""}</small></div>
      <div class="stat"><b>${new Set(lib.items.map(m => m.subject).filter(Boolean)).size}</b><small>subjects</small></div>
      <div class="stat"><b>${d.questions}</b><small>questions asked</small></div>
      <div class="stat"><b>${d.streak} 🔥</b><small>day streak</small></div>
      <div class="stat"><b>${d.study_days}</b><small>days studied</small></div>
    </div>`;
  if (d.recent.length) html += `<h2>Continue where you left off</h2><div class="recent">${d.recent.map(r =>
    `<button class="recent-item" data-go="${scopeHash(r.scope)}"><b>${esc(r.label)}</b><span>“${esc(r.question)}”</span><small>${ago(r.created)}</small></button>`).join("")}</div>`;
  for (const [s, list] of bySubject(lib.items)) {
    html += `<div class="subject-block"><div class="subject-head"><h2><a href="#/subject/${encodeURIComponent(s)}">📂 ${esc(s)}</a></h2><span class="hint">${list.length}</span></div>${unitTree(list)}</div>`;
  }
  return html;
}

async function renderSearch(q) {
  const view = $("#view");
  view.dataset.scope = "search:" + q;
  view.innerHTML = `<div class="content"><h1>🔎 “${esc(q)}”</h1><div class="progress"><span class="spinner"></span>Searching your material…</div></div>`;
  $("#mobileTitle").textContent = "Search";
  let r;
  try { r = await api(`/api/search?q=${encodeURIComponent(q)}`); } catch (e) { $(".content", view).innerHTML += `<div class="error-box">${esc(e.message)}</div>`; return; }
  if (view.dataset.scope !== "search:" + q) return;
  const items = r.results.map(x => `<button class="result" data-src='${esc(JSON.stringify(srcOf(x)))}'>
      <div class="meta"><b>${esc(x.title)}</b>${x.loc ? `<span class="badge">${esc(x.loc)}</span>` : ""}${x.sim ? `<span>${Math.round(x.sim * 100)}% match</span>` : ""}</div>
      <p>${esc(x.text.slice(0, 320))}${x.text.length > 320 ? "…" : ""}</p></button>`).join("");
  $(".content", view).innerHTML = `<h1>🔎 “${esc(q)}”</h1>
    ${r.found ? "" : `<div class="notice">Nothing in your material is clearly about this. These are the closest passages.</div>`}
    <p class="hint">Click a result to read it in context. To have it explained, ask the tutor on the dashboard.</p>
    <div class="results">${items || "<p>No passages yet. Upload some material first.</p>"}</div>`;
}

// ---------- sources (citations) ----------
const srcOf = x => ({ material_id: x.material_id, idx: x.idx, title: x.title, filename: x.filename, page: x.page, loc: x.loc });
const fileUrl = (src) => `/api/material/${src.material_id}/file` + (src.page && /\.pdf$/i.test(src.filename) ? `#page=${src.page}` : "");

async function openSource(src) {
  let d;
  try { d = await api(`/api/material/${src.material_id}/passage/${src.idx}`); } catch { toast("That material was deleted."); return; }
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal wide"><div class="meta"><b style="color:var(--text);font-size:16px">📄 ${esc(d.title)}</b>${src.loc ? `<span class="badge">${esc(src.loc)}</span>` : ""}</div>
    <div class="passages">${d.passages.map(p => `<div class="passage ${p.hit ? "hit" : ""}">${p.loc && !p.hit ? `<small>${esc(p.loc)}</small>` : ""}${esc(p.text)}</div>`).join("")}</div>
    <div class="row"><a href="#/m/${src.material_id}"><button class="ghost" data-x>Go to material</button></a>
    <a href="${fileUrl(src)}" target="_blank"><button class="primary">Open ${esc(src.loc || "file")}</button></a>
    <button class="ghost" data-x>Close</button></div></div>`;
  document.body.append(bg);
  bg.onclick = e => { if (e.target === bg || e.target.closest("[data-x]")) bg.remove(); };
  $(".passage.hit", bg)?.scrollIntoView({ block: "center" });
}

document.addEventListener("click", e => {
  const el = e.target.closest("[data-src]");
  if (el) { e.preventDefault(); openSource(JSON.parse(el.dataset.src)); }
});

async function renderMaterial(id, soft) {
  const view = $("#view");
  let m;
  try { m = await api(`/api/material/${id}`); } catch { view.innerHTML = `<div class="content"><div class="empty"><h1>Not found</h1><p>This material was deleted.</p></div></div>`; return; }
  if (soft && view.dataset.scope === id && view.dataset.status === m.status + m.progress) return;
  const kinds = lib.kinds.map(k => `<option ${k === m.kind ? "selected" : ""}>${esc(k)}</option>`).join("");
  const html = `
    <h1>${esc(m.title || m.filename)}</h1>
    <div class="meta">
      ${m.subject ? `<a class="badge subject" href="#/subject/${encodeURIComponent(m.subject)}">📂 ${esc(m.subject)}</a>` : ""}
      ${m.kind ? `<span class="badge">${esc(m.kind)}</span>` : ""}
      ${m.unit ? `<span class="badge">${esc(m.unit)}</span>` : ""}${m.semester ? `<span class="badge">${esc(m.semester)}</span>` : ""}
      <span>${esc(m.filename)}</span>${m.chars ? `<span>· ${Math.round(m.chars / 1000)}k characters</span>` : ""}
    </div>
    <div class="actions">
      <a href="/api/material/${id}/file" target="_blank"><button class="ghost small">📄 Open file</button></a>
      <button class="ghost small" id="editBtn">✏️ Edit details</button>
      <button class="ghost small" id="redoBtn">🔄 Re-analyze</button>
      <button class="ghost small danger" id="delBtn">🗑 Delete</button>
    </div>
    ${statusBlock(m)}
    ${m.topics.length ? `<h2>Topics</h2><p class="hint">Click a topic and the tutor will teach it to you.</p><div class="chips" id="topics">${m.topics.map(t => `<button class="chip" data-topic="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : ""}
    ${m.summary ? `<h2>Summary</h2><div class="card md">${md(m.summary)}</div>` : ""}`;
  let content = $(".content", view);
  if (!soft || view.dataset.scope !== id || !content) {
    view.innerHTML = `<div class="content with-chat"></div>`;
    view.dataset.scope = id;
    content = $(".content", view);
    view.append(makeChat(id, m.title || m.filename, [
      ["📖 Teach me from the start", "Teach me this material from the beginning. First give a short lesson plan of the topics, then teach the first topic with simple examples, and end with one question to check my understanding."],
      ["➡️ Next topic", "Let's move on to the next topic in the lesson plan."],
      ["🧠 Quiz me", "Quiz me on this material: ask 5 questions one at a time (mix of easy and hard). Wait for my answer before the next."],
      ["🧒 Explain simpler", "Explain that again more simply, like I'm a beginner, with an everyday analogy."],
      ["📝 Exam revision", "Give me a quick exam revision sheet for this material: must-know points, formulas, and likely questions."],
    ]));
  }
  view.dataset.status = m.status + m.progress;
  content.innerHTML = html;
  $("#mobileTitle").textContent = m.title || m.filename;
  $("#topics")?.addEventListener("click", e => {
    const t = e.target.closest("[data-topic]");
    if (t) sendChat(`Teach me about "${t.dataset.topic}" from this material. Start simple, use examples, and end with one question to check my understanding.`);
  });
  $("#redoBtn").onclick = async () => { await api(`/api/material/${id}/reprocess`, { method: "POST" }); toast("Re-analyzing…"); refresh(); renderMaterial(id); };
  $("#delBtn").onclick = async () => {
    if (!confirm(`Delete "${m.title || m.filename}" and its chat from your library?`)) return;
    await api(`/api/material/${id}`, { method: "DELETE" });
    toast("Deleted"); location.hash = m.subject ? `#/subject/${encodeURIComponent(m.subject)}` : "#/"; refresh();
  };
  $("#editBtn").onclick = () => editModal(m, kinds);
}

function editModal(m, kinds) {
  const subjects = [...new Set(lib.items.map(x => x.subject).filter(Boolean))];
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<form class="modal"><b>Edit details</b>
    <label>Title<input name="title" value="${esc(m.title)}"></label>
    <label>Subject<input name="subject" list="subjList" value="${esc(m.subject)}"><datalist id="subjList">${subjects.map(s => `<option value="${esc(s)}">`).join("")}</datalist></label>
    <label>Type<select name="kind">${kinds}</select></label>
    <div class="row2"><label>Unit / chapter<input name="unit" value="${esc(m.unit)}" placeholder="e.g. Unit 2"></label>
    <label>Semester<input name="semester" value="${esc(m.semester)}" placeholder="e.g. Semester 4"></label></div>
    <div class="row"><button type="button" class="ghost" data-x>Cancel</button><button class="primary">Save</button></div></form>`;
  document.body.append(bg);
  bg.onclick = e => { if (e.target === bg || e.target.dataset.x !== undefined) bg.remove(); };
  $("form", bg).onsubmit = async e => {
    e.preventDefault();
    await api(`/api/material/${m.id}`, { method: "PATCH", body: JSON.stringify(Object.fromEntries(new FormData(e.target))) });
    bg.remove(); toast("Saved"); await refresh(); renderMaterial(m.id);
  };
}

// ---------- tutor chat ----------
let activeChat = null;

function makeChat(scope, label, presets) {
  const el = $("#chatTpl").content.firstElementChild.cloneNode(true);
  $(".chat-scope", el).textContent = label;
  $(".presets", el).innerHTML = presets.map(([t, p]) => `<button class="chip" data-p="${esc(p)}">${esc(t)}</button>`).join("");
  const msgs = $(".msgs", el), ta = $("textarea", el);
  activeChat = { scope, el, msgs, ta };
  api(`/api/messages?scope=${encodeURIComponent(scope)}`).then(list => {
    if (activeChat?.scope !== scope) return;
    if (!list.length) addMsg("assistant", `Hi! I'm your tutor for **${label}**. Ask me anything, or pick an option above to start a lesson.`);
    for (const x of list) addMsg(x.role, x.content, x.sources);
  });
  $(".presets", el).onclick = e => { const b = e.target.closest("[data-p]"); if (b) sendChat(b.dataset.p); };
  $(".composer", el).onsubmit = e => { e.preventDefault(); sendChat(ta.value); };
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(ta.value); } });
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; });
  $(".clear-chat", el).onclick = async () => {
    if (!confirm("Clear this conversation?")) return;
    await api(`/api/messages?scope=${encodeURIComponent(scope)}`, { method: "DELETE" });
    msgs.innerHTML = ""; addMsg("assistant", "Chat cleared. What would you like to learn?");
  };
  return el;
}

function answerHtml(text, sources = []) {
  // [n] citations become clickable markers; the cited files are listed under the answer
  const byN = Object.fromEntries(sources.map(s => [s.n, s]));
  let html = `<div class="md">${md(text)}</div>`.replace(/(<pre>[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>)|\[(\d{1,2})\]/g, (all, code, n) =>
    code ? code : byN[n] ? `<button class="cite" data-src='${esc(JSON.stringify(srcOf(byN[n])))}' title="${esc(byN[n].title)}${byN[n].loc ? " · " + esc(byN[n].loc) : ""}">${n}</button>` : all);
  if (sources.length) html += `<div class="sources"><small>Sources</small>${sources.map(s =>
    `<button class="src" data-src='${esc(JSON.stringify(srcOf(s)))}'><b>${s.n}</b> 📄 ${esc(s.title)}${s.loc ? ` · ${esc(s.loc)}` : ""}</button>`).join("")}</div>`;
  return html;
}

function addMsg(role, text, sources) {
  const d = document.createElement("div");
  d.className = `msg ${role}`;
  if (role === "user") d.textContent = text; else d.innerHTML = answerHtml(text, sources);
  activeChat.msgs.append(d);
  activeChat.msgs.scrollTop = activeChat.msgs.scrollHeight;
  return d;
}

async function sendChat(text) {
  text = (text || "").trim();
  if (!text || chatBusy || !activeChat) return;
  const chat = activeChat;
  chatBusy = true;
  chat.ta.value = ""; chat.ta.style.height = "auto";
  $("button[type=submit]", chat.el).disabled = true;
  addMsg("user", text);
  const bubble = addMsg("assistant", "");
  bubble.classList.add("thinking");
  bubble.innerHTML = `<span class="spinner"></span> Thinking…`;
  let answer = "";
  try {
    const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: chat.scope, message: text }) });
    const reader = r.body.getReader(), dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      answer += dec.decode(value, { stream: true });
      bubble.classList.remove("thinking");
      const [body, src] = answer.split("\x1e");
      let sources = [];
      if (src) try { sources = JSON.parse(src); } catch {}
      bubble.innerHTML = answerHtml(body, sources);
      const near = chat.msgs.scrollHeight - chat.msgs.scrollTop - chat.msgs.clientHeight < 120;
      if (near) chat.msgs.scrollTop = chat.msgs.scrollHeight;
    }
    if (!answer.split("\x1e")[0].trim()) bubble.innerHTML = `<div class="md"><p>⚠️ No answer came back. Is Ollama running?</p></div>`;
  } catch (e) {
    bubble.innerHTML = `<div class="md"><p>⚠️ ${esc(e.message)}</p></div>`;
  } finally {
    bubble.classList.remove("thinking");
    chatBusy = false;
    $("button[type=submit]", chat.el).disabled = false;
    chat.ta.focus();
  }
}

// ---------- settings ----------
async function loadSettings() {
  try {
    const s = await api("/api/settings");
    const label = m => m === s.claude ? `Claude (Opus 5.5) · best, paid API${s.claude_key ? "" : " (needs key)"}`
      : `${m}${s.installed.includes(m) ? "" : " (not downloaded)"}${m.endsWith("4b") ? " · free, faster" : " · free, smarter, slower"}`;
    $("#model").innerHTML = s.models.map(m => `<option value="${m}" ${m === s.model ? "selected" : ""}>${label(m)}</option>`).join("");
    $("#claudeKey").textContent = s.claude_key ? "Change Claude API key" : "Add Claude API key";
    const usingClaude = s.model === s.claude;
    $("#aiStatus").textContent = usingClaude ? "Claude Opus 5.5 · paid API" : s.ollama ? `Local AI ready · ${s.model}` : "Local AI starting…";
    if (!s.ollama && !usingClaude) setTimeout(loadSettings, 4000);
    loadSettings.s = s;
  } catch { $("#aiStatus").textContent = "Server offline"; }
}
$("#model").onchange = async e => {
  const s = loadSettings.s || {};
  if (e.target.value === s.claude && !s.claude_key) { e.target.value = s.model; return keyModal(true); }
  await api("/api/settings", { method: "POST", body: JSON.stringify({ model: e.target.value }) });
  toast(e.target.value === s.claude ? "Using Claude. Each question costs a little API credit." : `Using ${e.target.value} (free, local)`); loadSettings();
};

function keyModal(switchAfter) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<form class="modal"><b>Claude API key</b>
    <p class="hint" style="margin:0">Claude gives much better and faster answers than the local model, but the API is paid per use and needs credit on your Anthropic account (console.anthropic.com → API keys). The key stays only in <code>settings.json</code> on this computer. Search and embeddings stay local and free.</p>
    <label>API key<input name="key" type="password" placeholder="sk-ant-…" autocomplete="off"></label>
    <div class="row"><button type="button" class="ghost danger" data-clear>Remove key</button><button type="button" class="ghost" data-x>Cancel</button><button class="primary">Save</button></div></form>`;
  document.body.append(bg);
  bg.onclick = async e => {
    if (e.target === bg || e.target.dataset.x !== undefined) bg.remove();
    if (e.target.dataset.clear !== undefined) {
      const s = loadSettings.s || {};
      await api("/api/settings", { method: "POST", body: JSON.stringify({ anthropic_api_key: "", ...(s.model === s.claude ? { model: s.models[0] } : {}) }) });
      bg.remove(); toast("Key removed"); loadSettings();
    }
  };
  $("form", bg).onsubmit = async e => {
    e.preventDefault();
    const key = e.target.key.value.trim();
    if (!key) return;
    const s = loadSettings.s || {};
    await api("/api/settings", { method: "POST", body: JSON.stringify({ anthropic_api_key: key, ...(switchAfter ? { model: s.claude } : {}) }) });
    bg.remove(); toast(switchAfter ? "Saved. Now using Claude." : "Key saved"); loadSettings();
  };
}
$("#claudeKey").onclick = () => keyModal(false);

window.addEventListener("hashchange", () => renderView());
loadSettings();
refresh().then(() => { if (!$("#view").dataset.scope) renderView(); });
