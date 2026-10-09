const TOOL_VIEW = "search";
/* global document, localStorage, fetch, URL, Blob */
("use strict");
const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const labels = {
  customer: "Customers",
  vendor: "Vendors",
  salesorder: "Sales orders",
  purchaseorder: "Purchase orders",
  itemfulfillment: "Fulfillments",
  itemreceipt: "Receipts",
  invoice: "Invoices",
};
const symbols = {
  customer: "CU",
  vendor: "VE",
  salesorder: "SO",
  purchaseorder: "PO",
  itemfulfillment: "IF",
  itemreceipt: "IR",
  invoice: "IN",
};
const state = {
  view: TOOL_VIEW,
  page: 0,
  rows: [],
  graph: null,
  zoom: 1,
  selected: null,
  meta: null,
  evidence: null,
  activity: [],
  presets: [],
  searchRequest: 0,
  graphRequest: 0,
  detailRequest: { preview: 0, "graph-preview": 0 },
  investigationRequest: 0,
};
async function api(body) {
  const endpoint = location.pathname.includes("scriptlet.nl")
    ? location.href
    : "/api";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "Request failed");
  return data.data;
}
function notice(message = "", error = false) {
  $("notice").textContent = message;
  $("notice").className = error ? "error" : "";
}
function warnings(id, list) {
  $(id).innerHTML = list?.length
    ? `<div class="warning"><strong>Incomplete evidence</strong><ul>${list.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>`
    : "";
}
function plan() {
  return {
    types: [...document.querySelectorAll("[name=type]:checked")].map(
      (e) => e.value,
    ),
    fields: [...document.querySelectorAll("[name=field]:checked")].map(
      (e) => e.value,
    ),
    query: $("query").value,
    match: $("match").value,
    status: $("status").value,
    includeInactive: $("inactive").checked,
    overdue: $("overdue").checked,
    page: state.page,
    pageSize: 6,
  };
}
function applyPlan(p) {
  document
    .querySelectorAll("[name=type]")
    .forEach((e) => (e.checked = p.types?.includes(e.value)));
  document
    .querySelectorAll("[name=field]")
    .forEach((e) => (e.checked = p.fields?.includes(e.value)));
  $("query").value = p.query || "";
  $("match").value = p.match || "contains";
  $("status").value =
    state.meta?.mode === "netsuite" ? "any" : p.status || "any";
  $("inactive").checked = !!p.includeInactive;
  $("overdue").checked = state.meta?.mode !== "netsuite" && !!p.overdue;
  state.page = 0;
}
function renderPresets() {
  $("presets").innerHTML =
    '<option value="">Load a preset…</option>' +
    state.presets
      .map((p, i) => `<option value="${i}">${esc(p.name)}</option>`)
      .join("");
}
function persistPresets() {
  try {
    localStorage.setItem(
      "netsuite-global-search-plus:presets:v1",
      JSON.stringify(state.presets),
    );
    renderPresets();
  } catch (_) {
    notice("Browser storage is unavailable. Preset was not saved.", true);
  }
}
async function search() {
  const request = ++state.searchRequest;
  $("results").classList.add("loading");
  notice();
  ++state.detailRequest.preview;
  state.rows = [];
  $("preview").textContent = "Loading current search…";
  warnings("search-warnings", []);
  try {
    const data = await api({ action: "search", plan: plan() });
    if (request !== state.searchRequest) return;
    state.rows = data.rows;
    $("result-count").textContent =
      `${data.total}${data.partial ? "+" : ""} matching record${data.total === 1 ? "" : "s"}${data.partial ? " in inspected window" : ""}`;
    warnings("search-warnings", data.warnings);
    $("results").innerHTML = data.rows.length
      ? data.rows
          .map(
            (r) =>
              `<button class="record-card" data-key="${esc(r.type + ":" + r.id)}"><span class="record-top"><span class="record-symbol">${symbols[r.type] || "RE"}</span><span><strong>${esc(r.number)}</strong><small>${esc(r.entity)}</small></span><span class="arrow">↗</span></span><span class="record-status">${esc(r.status)}${r.inactive ? " · Inactive" : ""}</span><span class="record-reason">${esc(r.reasons.join(" · "))}</span></button>`,
          )
          .join("")
      : '<div class="empty-state">No records match this scope.<br>Try another field or record type.</div>';
    $("page-label").textContent =
      `Page ${state.page + 1} of ${Math.max(1, Math.ceil(data.total / 6))}`;
    $("prev").disabled = state.page === 0;
    $("next").disabled = (state.page + 1) * 6 >= data.total;
    $("results")
      .querySelectorAll("[data-key]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          selectRecord(button.dataset.key, "preview"),
        ),
      );
    if (data.rows.length)
      await selectRecord(data.rows[0].type + ":" + data.rows[0].id, "preview");
    else
      $("preview").innerHTML =
        '<div class="empty-icon">⌕</div><h2>No match yet</h2><p>Choose another scope to explore records.</p>';
  } catch (e) {
    if (request === state.searchRequest) {
      notice(e.message, true);
      $("preview").textContent =
        "Search unavailable. No current evidence loaded.";
      $("result-count").textContent = "Search not completed";
      $("results").innerHTML =
        '<div class="empty-state">Adjust the scope and search again.</div>';
      $("prev").disabled = true;
      $("next").disabled = true;
    }
  } finally {
    if (request === state.searchRequest)
      $("results").classList.remove("loading");
  }
}
function safeRecordURL(raw) {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw, location.origin);
    return u.origin === location.origin && u.pathname.startsWith("/app/")
      ? u.href
      : null;
  } catch (_) {
    return null;
  }
}
async function selectRecord(key, target) {
  const version = ++state.detailRequest[target];
  $(target).textContent = "Loading record…";
  try {
    const r = await api({ action: "read", key });
    if (version !== state.detailRequest[target]) return;
    const link = safeRecordURL(r.url);
    $(target).innerHTML =
      `<span class="eyebrow">RECORD DETAILS</span><div class="record-symbol">${symbols[r.type] || "RE"}</div><h2>${esc(r.number)}</h2><p>${esc(r.entity)}</p><dl><div><dt>Type / internal ID</dt><dd>${esc(labels[r.type])} / ${esc(r.id)}</dd></div><div><dt>Status</dt><dd>${esc(r.status)}</dd></div><div><dt>Memo · untrusted source text</dt><dd>${esc(r.memo || "No memo")}</dd></div>${r.expectedDate ? `<div><dt>Expected receipt</dt><dd>${esc(r.expectedDate)} · ${esc(r.receivedQuantity)} / ${esc(r.quantity)} received</dd></div>` : ""}</dl>${link ? `<a class="secondary" href="${esc(link)}" target="_blank" rel="noopener">Open record in NetSuite ↗</a>` : `<small>${state.meta?.mode === "netsuite" ? "Record link unavailable." : "Fictional record. No NetSuite URL."}</small>`}`;
    document
      .querySelectorAll(".record-card")
      .forEach((b) => b.classList.toggle("selected", b.dataset.key === key));
  } catch (e) {
    if (version === state.detailRequest[target]) {
      $(target).textContent = "Record unavailable. No current evidence loaded.";
      notice(e.message, true);
    }
  }
}

async function init() {
  $("type-options").innerHTML = Object.entries(labels)
    .map(
      ([type, label]) =>
        `<label class="check"><input name="type" type="checkbox" value="${type}"${type === "purchaseorder" ? " checked" : ""}>${label}<span class="type-count">${symbols[type]}</span></label>`,
    )
    .join("");
  $("field-options").innerHTML = ["number", "entity", "memo"]
    .map(
      (f) =>
        `<label class="check"><input name="field" type="checkbox" value="${f}" checked>${f}</label>`,
    )
    .join("");
  $("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    state.page = 0;
    search();
  });
  $("prev").addEventListener("click", () => {
    state.page--;
    search();
  });
  $("next").addEventListener("click", () => {
    state.page++;
    search();
  });
  $("type-options").addEventListener("change", () => {
    if (
      [...document.querySelectorAll("[name=type]:checked")].some(
        (e) => e.value !== "purchaseorder",
      )
    )
      $("overdue").checked = false;
  });
  $("save-preset").addEventListener("click", () => {
    const name = $("preset-name").value.trim();
    if (!name) return notice("Name the preset first.", true);
    if (state.presets.length >= 20)
      return notice("Remove a preset before adding more (limit 20).", true);
    const p = plan();
    p.page = 0;
    state.presets.push({ name, plan: p });
    persistPresets();
    $("preset-name").value = "";
  });
  $("presets").addEventListener("change", () => {
    const p = state.presets[Number($("presets").value)];
    if ($("presets").value !== "" && p) {
      applyPlan(p.plan);
      search();
    }
  });
  $("delete-preset").addEventListener("click", () => {
    if ($("presets").value === "") return;
    state.presets.splice(Number($("presets").value), 1);
    persistPresets();
  });
  try {
    const saved = JSON.parse(
      localStorage.getItem("netsuite-global-search-plus:presets:v1") || "[]",
    );
    if (Array.isArray(saved))
      state.presets = saved
        .filter(
          (p) =>
            p &&
            typeof p.name === "string" &&
            p.plan &&
            Array.isArray(p.plan.types) &&
            Array.isArray(p.plan.fields),
        )
        .slice(0, 20);
  } catch (_) {}
  renderPresets();
  try {
    state.meta = await api({ action: "meta" });
    const live = state.meta.mode === "netsuite";
    $("environment").textContent = live
      ? "NETSUITE · READ ONLY"
      : "DEMO · FICTIONAL RECORDS";
    if (live) {
      $("footer-mode").textContent =
        "Read-only NetSuite adapter. Sandbox validation pending.";
      notice(state.meta.limitations.join(" · "));
    }
    $("data-label").textContent = live ? "EXECUTION ROLE" : "FICTIONAL DATA";
    if (live) {
      $("query").value = "";
      $("status").value = "any";
      $("status").disabled = true;
      $("overdue").checked = false;
      $("overdue").disabled = true;
    }
    await search();
  } catch (e) {
    notice("Could not connect: " + e.message, true);
    $("environment").textContent = "CONNECTION UNAVAILABLE";
  }
}
init();
