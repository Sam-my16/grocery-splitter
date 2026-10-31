import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, PEOPLE } from "./supabase-config.js";

import { prepareBill, pairAccount, localDate, amount } from "./core.js";
import { initPurchase, renderItemCards } from "./purchase.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const statusEl = document.getElementById("auth-status");
let ready = false;

function friendlyError(error) {
  if (!error) return "";
  if (/future|issued at|clock/i.test(error.message)) {
    return "La fecha y hora de tu celular están mal. Activá \"Ajustar automáticamente\" " +
      "en Ajustes → General → Fecha y hora, y volvé a entrar a la página.";
  }
  return "Error: " + error.message;
}

(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      statusEl.textContent = friendlyError(error);
      return;
    }
  }
  ready = true;
  statusEl.textContent = "Conectado";
  loadHistory();
  loadBalances();
})();

// ---------- Person colors ----------
const PERSON_PALETTE = ["oklch(68% 0.17 45)", "oklch(62% 0.17 310)", "oklch(62% 0.15 230)", "oklch(62% 0.16 190)"];
const PERSON_VAR = { Sammy: "--sammy", Nubi: "--nubi", Gabriel: "--gabriel" };
let personColorIdx = { Sammy: 0, Nubi: 1, Gabriel: 2 };
try {
  const stored = JSON.parse(localStorage.getItem("cc-person-colors"));
  if (stored && PEOPLE.every(p => Number.isInteger(stored[p]) && stored[p] >= 0 && stored[p] < PERSON_PALETTE.length)) personColorIdx = stored;
} catch { /* Preferences must not prevent purchase entry. */ }

function applyPersonColors() {
  PEOPLE.forEach((p) => {
    document.documentElement.style.setProperty(PERSON_VAR[p], PERSON_PALETTE[personColorIdx[p]]);
  });
}
applyPersonColors();

document.querySelectorAll(".avatar").forEach((el) => {
  const person = PEOPLE.find((p) => el.classList.contains("person-" + p.toLowerCase()));
  if (!person) return;
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".color-picker").forEach((p) => p.remove());
    const picker = document.createElement("div");
    picker.className = "color-picker";
    const taken = PEOPLE.filter((p) => p !== person).map((p) => personColorIdx[p]);
    PERSON_PALETTE.forEach((color, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.style.background = color;
      if (taken.includes(idx)) btn.classList.add("taken");
      if (idx === personColorIdx[person]) btn.classList.add("current");
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (taken.includes(idx)) return;
        personColorIdx = { ...personColorIdx, [person]: idx };
        try { localStorage.setItem("cc-person-colors", JSON.stringify(personColorIdx)); } catch {}
        applyPersonColors();
        picker.remove();
      });
      picker.appendChild(btn);
    });
    el.appendChild(picker);
  });
});
document.addEventListener("click", () => document.querySelectorAll(".color-picker").forEach((p) => p.remove()));

// ---------- Theme ----------
const themeToggleBtn = document.getElementById("theme-toggle");

function setThemeLabel(theme) {
  themeToggleBtn.textContent = theme === "dark" ? "☀️ Claro" : "🌙 Oscuro";
}

setThemeLabel(document.documentElement.getAttribute("data-theme"));

themeToggleBtn.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("cc-theme", next); } catch {}
  setThemeLabel(next);
});

// ---------- Tabs ----------
document.querySelectorAll("[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// ---------- AI prompt helper ----------
const INVOICE_PROMPT = `Tengo la foto/PDF de una factura de supermercado. Extraé cada producto
y devolvé SOLO un CSV con dos columnas: item,price

Reglas:
- Encabezado exacto: item,price
- Una fila por producto (usá el nombre tal como aparece, sin abreviar de más)
- price = precio final de ese producto YA con descuentos, promociones
  o cupones aplicados (no el precio de lista si hubo descuento)
- Usá punto como separador decimal, sin símbolo de moneda ni miles
- No incluyas impuestos, envío ni el total como una fila más
- Devolvé el CSV directamente en el chat, como texto (en un bloque de código),
  NO como un archivo para descargar
- No agregues texto extra ni explicaciones, solo el CSV`;

document.getElementById("copy-prompt-btn").addEventListener("click", async () => {
  const status = document.getElementById("copy-prompt-status");
  try {
    await navigator.clipboard.writeText(INVOICE_PROMPT);
    status.textContent = "Copiado ✓";
  } catch {
    status.textContent = "No se pudo copiar. Copialo manualmente.";
  }
  setTimeout(() => { status.textContent = ""; }, 3000);
});

function pairCombos(arr) {
  const res = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      res.push([arr[i], arr[j]]);
    }
  }
  return res;
}

function catClass(cat) {
  return "cat-" + String(cat || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
}

initPurchase({ supabase, people: PEOPLE, isReady: () => ready, friendlyError,
  onSaved: () => { loadHistory(); loadBalances(); }
});

// ---------- History ----------
let historyBills = [];

async function loadHistory() {
  const el = document.getElementById("history-list");
  const catEl = document.getElementById("category-list");
  const { data: bills, error } = await supabase
    .from("bills")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    el.textContent = friendlyError(error);
    catEl.textContent = "";
    return;
  }
  historyBills = bills || [];
  if (!bills || bills.length === 0) {
    el.textContent = "Todavía no hay compras cargadas.";
    catEl.textContent = "Todavía no hay compras cargadas.";
    return;
  }

  const currentMonth = localDate().slice(0, 7);
  const billsThisMonth = bills.filter((bill) => bill.date.slice(0, 7) === currentMonth);

  const byCategory = {};
  billsThisMonth.forEach((bill) => {
    const cat = bill.category || "Sin categoría";
    byCategory[cat] = (byCategory[cat] || 0) + bill.total;
  });
  catEl.innerHTML = "";
  if (billsThisMonth.length === 0) {
    catEl.textContent = "Todavía no hay compras este mes.";
  }
  const maxCat = Math.max(1, ...Object.values(byCategory));
  Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, total]) => {
      const row = document.createElement("div");
      row.style.marginBottom = "0.75rem";
      const pct = Math.round((total / maxCat) * 100);
      row.innerHTML = `<div class="balance-row" style="border-bottom:none;padding-bottom:0;"><span>${escapeHTML(cat)}</span><span>${fmt(total)}</span></div>` +
        `<div class="cat-bar-track"><div class="cat-bar-fill ${catClass(cat)}" style="width:${pct}%"></div></div>`;
      catEl.appendChild(row);
    });

  el.innerHTML = "";
  let currentMonthKey = null;
  let monthGroupEl = null;
  bills.forEach((bill) => {
    const monthKey = bill.date.slice(0, 7);
    if (monthKey !== currentMonthKey) {
      currentMonthKey = monthKey;
      const header = document.createElement("h3");
      header.className = "month-header";
      header.textContent = monthLabel(bill.date);
      el.appendChild(header);
      monthGroupEl = document.createElement("div");
      monthGroupEl.className = "month-group";
      el.appendChild(monthGroupEl);
    }

    const details = document.createElement("details");
    details.className = "history-item";
    const label = bill.title ? `${bill.title} (${bill.date})` : bill.date;
    const categoryTag = bill.category ? `<span class="cat-tag ${catClass(bill.category)}">${escapeHTML(bill.category)}</span> ` : "";
    const summary = document.createElement("summary");
    summary.innerHTML = `<span>${categoryTag}${escapeHTML(label)} — pagó ${escapeHTML(bill.payer)}</span><span>${fmt(bill.total)}</span>`;
    details.appendChild(summary);

    const owed = PEOPLE.filter((p) => p !== bill.payer && bill.shares && bill.shares[p] > 0.009)
      .map((p) => `${p} le debe ${fmt(bill.shares[p])} a ${bill.payer}`);
    if (owed.length) {
      const owedP = document.createElement("p");
      owedP.className = "hint";
      owedP.textContent = owed.join(" · ");
      details.appendChild(owedP);
    }

    const ul = document.createElement("ul");
    (bill.items || []).forEach((i) => {
      const li = document.createElement("li");
      li.textContent = `${i.name}: ${fmt(i.price)} → ${i.assignedTo.join(", ")}`;
      ul.appendChild(li);
    });
    details.appendChild(ul);

    const actions = document.createElement("div");
    actions.style.marginTop = "0.5rem";
    actions.style.display = "flex";
    actions.style.gap = "0.5rem";

    const editForm = document.createElement("div");
    editForm.className = "row";
    editForm.hidden = true;

    const titleLabel = document.createElement("label");
    titleLabel.textContent = "Título";
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.value = bill.title || "";
    titleLabel.appendChild(titleInput);

    const dateLabel = document.createElement("label");
    dateLabel.textContent = "Fecha";
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.value = bill.date;
    dateLabel.appendChild(dateInput);

    const payerLabel = document.createElement("label");
    payerLabel.textContent = "¿Quién pagó?";
    const payerSelect = document.createElement("select");
    PEOPLE.forEach((p) => {
      const opt = document.createElement("option");
      opt.textContent = p;
      if (p === bill.payer) opt.selected = true;
      payerSelect.appendChild(opt);
    });
    payerLabel.appendChild(payerSelect);

    const categoryLabel = document.createElement("label");
    categoryLabel.textContent = "Categoría";
    const categorySelect = document.createElement("select");
    ["Supermercado", "Salidas", "Comida"].forEach((c) => {
      const opt = document.createElement("option");
      opt.textContent = c;
      if (c === bill.category) opt.selected = true;
      categorySelect.appendChild(opt);
    });
    categoryLabel.appendChild(categorySelect);

    // -- Items editing --
    const editItems = (bill.items || []).map((i) => ({
      name: i.name,
      price: i.price,
      assignedTo: [...(i.assignedTo || [])]
    }));

    const itemsWrap = document.createElement("div");
    itemsWrap.style.width = "100%";
    const itemsList = document.createElement("div");
    itemsWrap.appendChild(itemsList);

    const addItemBtn = document.createElement("button");
    addItemBtn.type = "button";
    addItemBtn.className = "assign-btn";
    addItemBtn.textContent = "+ Agregar item";
    addItemBtn.addEventListener("click", () => {
      editItems.push({ name: "", price: 0, assignedTo: [] });
      renderEditItems();
    });

    const editTotalsRow = document.createElement("div");
    editTotalsRow.className = "row totals";
    editTotalsRow.style.width = "100%";
    const editSumEl = document.createElement("span");
    const editTotalLabel = document.createElement("label");
    editTotalLabel.textContent = "Total de la boleta";
    const editTotalInput = document.createElement("input");
    editTotalInput.type = "text";
    editTotalInput.inputMode = "decimal";
    editTotalInput.value = bill.total;
    editTotalLabel.appendChild(editTotalInput);
    const editMatchBadge = document.createElement("span");
    editMatchBadge.className = "badge";
    editTotalsRow.appendChild(editSumEl);
    editTotalsRow.appendChild(editTotalLabel);
    editTotalsRow.appendChild(editMatchBadge);

    function checkEditMatch() {
      const valid = editItems.every(i => Number.isFinite(amount(i.price)));
      const sum = editItems.reduce((s, i) => s + (Number.isFinite(amount(i.price)) ? Math.round(amount(i.price) * 100) : 0), 0) / 100;
      const total = amount(editTotalInput.value);
      const diff = Math.abs(sum - total);
      editSumEl.textContent = `Suma de items: ${fmt(sum)}`;
      if (!valid || !Number.isFinite(total)) {
        editMatchBadge.textContent = "Revisá los precios y el total";
        editMatchBadge.className = "badge bad";
      } else if (Math.round(sum * 100) === Math.round(total * 100)) {
        editMatchBadge.textContent = "Coincide";
        editMatchBadge.className = "badge ok";
      } else {
        editMatchBadge.textContent = `Diferencia: ${fmt(diff)}`;
        editMatchBadge.className = "badge bad";
      }
    }
    editTotalInput.addEventListener("input", checkEditMatch);

    function renderEditItems() {
      renderItemCards(itemsList, editItems, PEOPLE, checkEditMatch);
      checkEditMatch();
    }
    renderEditItems();

    const saveEditBtn = document.createElement("button");
    saveEditBtn.type = "button";
    saveEditBtn.className = "primary";
    saveEditBtn.textContent = "Guardar cambios";
    const editStatus = document.createElement("p");
    editStatus.className = "hint";
    editStatus.setAttribute("role", "status");
    saveEditBtn.addEventListener("click", async () => {
      if (saveEditBtn.disabled) return;
      let payload;
      try {
        payload = prepareBill({ title: titleInput.value, date: dateInput.value,
          payer: payerSelect.value, category: categorySelect.value,
          items: editItems, total: editTotalInput.value }, PEOPLE);
      } catch (error) { editStatus.textContent = error.message; return; }
      const controls = [...editForm.querySelectorAll("input, select, button")];
      controls.forEach(control => { control.disabled = true; });
      editStatus.textContent = "Guardando…";
      try {
        const { error } = await supabase.from("bills").update(payload).eq("id", bill.id);
        if (error) throw error;
        loadHistory(); loadBalances();
      } catch (error) { editStatus.textContent = friendlyError(error); }
      finally { controls.forEach(control => { control.disabled = false; }); }
    });

    editForm.appendChild(titleLabel);
    editForm.appendChild(dateLabel);
    editForm.appendChild(payerLabel);
    editForm.appendChild(categoryLabel);
    editForm.appendChild(itemsWrap);
    editForm.appendChild(addItemBtn);
    editForm.appendChild(editTotalsRow);
    editForm.appendChild(saveEditBtn);
    details.appendChild(editForm);
    details.appendChild(editStatus);

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Editar";
    editBtn.className = "assign-btn";
    editBtn.addEventListener("click", (e) => {
      e.preventDefault();
      editForm.hidden = !editForm.hidden;
    });
    actions.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Eliminar";
    delBtn.className = "assign-btn";
    delBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!confirm("¿Eliminar esta compra?")) return;
      await runMutation(delBtn, editStatus, () => supabase.from("bills").delete().eq("id", bill.id), () => { loadHistory(); loadBalances(); });
    });
    actions.appendChild(delBtn);
    details.appendChild(actions);

    monthGroupEl.appendChild(details);
  });

  makeCollapsible(el, {
    itemSelector: ".history-item",
    groupSelector: ".month-group",
    headerSelector: ".month-header",
    visibleCount: 2,
    moreLabel: "Mostrar todas las compras",
    lessLabel: "Mostrar menos"
  });
}

function makeCollapsible(container, { itemSelector, groupSelector, headerSelector, visibleCount, moreLabel, lessLabel }) {
  const items = Array.from(container.querySelectorAll(itemSelector));
  if (items.length <= visibleCount) return;

  let expanded = false;
  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "assign-btn toggle-list-btn";

  function render() {
    items.forEach((item, idx) => {
      item.hidden = !expanded && idx >= visibleCount;
    });
    if (groupSelector && headerSelector) {
      container.querySelectorAll(groupSelector).forEach((group) => {
        const header = group.previousElementSibling;
        if (!header || !header.matches(headerSelector)) return;
        const hasVisible = Array.from(group.children).some((c) => !c.hidden);
        header.hidden = !hasVisible;
      });
    }
    toggleBtn.textContent = expanded ? lessLabel : `${moreLabel} (${items.length - visibleCount})`;
  }

  toggleBtn.addEventListener("click", () => {
    expanded = !expanded;
    render();
  });

  render();
  container.appendChild(toggleBtn);
}

function monthLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const label = d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

document.getElementById("export-csv-btn").addEventListener("click", () => {
  if (historyBills.length === 0) return;

  const headers = ["fecha", "mes", "titulo", "categoria", "pago", "total", ...PEOPLE.map((p) => `parte_${p}`)];
  const rows = historyBills.map((bill) => [
    bill.date,
    bill.date.slice(0, 7),
    bill.title || "",
    bill.category || "",
    bill.payer,
    bill.total,
    ...PEOPLE.map((p) => (bill.shares && bill.shares[p] ? bill.shares[p].toFixed(2) : "0"))
  ]);

  const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gastos_${localDate()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("clear-payments-btn").addEventListener("click", async () => {
  if (!confirm("¿Eliminar todos los pagos registrados? Esta acción no se puede deshacer.")) return;
  await runMutation(document.getElementById("clear-payments-btn"), document.getElementById("payments-status"),
    () => supabase.from("settlements").delete().not("id", "is", null), loadBalances);
});

// ---------- Balances ----------
async function loadBalances() {
  const pairEl = document.getElementById("pairwise-list");
  const paymentsEl = document.getElementById("payments-list");

  const [{ data: bills, error: billsErr }, { data: payments, error: paysErr }] = await Promise.all([
    supabase.from("bills").select("id,date,title,category,payer,total,shares"),
    supabase.from("settlements").select("*").order("created_at", { ascending: false })
  ]);

  if (billsErr || paysErr) {
    pairEl.textContent = friendlyError(billsErr || paysErr);
    paymentsEl.textContent = friendlyError(billsErr || paysErr);
    return;
  }

  pairEl.innerHTML = "";
  let anyPairDebt = false;
  pairCombos(PEOPLE).forEach(([a, b]) => {
    const account = pairAccount(bills || [], payments || [], a, b);
    if (Math.abs(account.net) < 0.01) return;
    anyPairDebt = true;
    const debtor = account.net > 0 ? a : b;
    const creditor = account.net > 0 ? b : a;
    const detail = account.net > 0 ? account : pairAccount(bills || [], payments || [], b, a);
    const row = document.createElement("div");
    row.className = "debt-card";
    const top = document.createElement("div");
    top.className = "settle-row";
    const text = document.createElement("strong");
    text.textContent = `${debtor} le debe ${fmt(detail.net)} a ${creditor}`;
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "assign-btn"; btn.textContent = "Marcar como pagado";
    const status = document.createElement("p");
    status.className = "hint error-text"; status.setAttribute("role", "status");
    btn.addEventListener("click", () => runMutation(btn, status,
      () => supabase.from("settlements").insert({ from_person: debtor, to_person: creditor, amount: detail.net }), loadBalances));
    top.append(text, btn);
    row.append(top, renderDebtDetail(detail), status);
    pairEl.appendChild(row);
  });
  if (!anyPairDebt) {
    pairEl.textContent = "Todo saldado entre todos.";
  }

  // Recorded payments (audit trail, with undo)
  paymentsEl.innerHTML = "";
  if (!payments || payments.length === 0) {
    paymentsEl.textContent = "Todavía no se registraron pagos.";
    return;
  }
  payments.forEach((s) => {
    const row = document.createElement("div");
    row.className = "settle-row";
    const text = document.createElement("span");
    text.textContent = `${s.from_person} le pagó ${fmt(s.amount)} a ${s.to_person}`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "assign-btn";
    btn.textContent = "Deshacer";
    btn.addEventListener("click", async () => {
      if (!confirm("¿Deshacer este pago?")) return;
      await runMutation(btn, status, () => supabase.from("settlements").delete().eq("id", s.id), loadBalances);
    });
    const status = document.createElement("p");
    status.className = "hint error-text";
    status.setAttribute("role", "status");
    row.append(text, btn, status);
    paymentsEl.appendChild(row);
  });

  makeCollapsible(paymentsEl, {
    itemSelector: ".settle-row",
    visibleCount: 2,
    moreLabel: "Mostrar todos los pagos",
    lessLabel: "Mostrar menos"
  });
}

function fmt(n) {
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

async function runMutation(button, status, mutation, refresh) {
  if (button.disabled) return;
  button.disabled = true; status.textContent = "";
  try {
    const { error } = await mutation();
    if (error) throw error;
    await refresh();
  } catch (error) { status.textContent = friendlyError(error); }
  finally { button.disabled = false; }
}

function renderDebtDetail(account) {
  const details = document.createElement("details");
  details.className = "debt-detail";
  const summary = document.createElement("summary"); summary.textContent = "Ver detalle";
  details.append(summary);
  account.pending.forEach(entry => {
    const row = document.createElement("div"); row.className = "balance-row";
    const label = entry.title || (entry.date ? entry.date.split("-").reverse().join("-") : "Sin fecha");
    const text = document.createElement("span"); text.textContent = `${label} — `;
    const number = document.createElement("strong"); number.textContent = fmt(entry.amount);
    row.append(text, number); details.append(row);
  });
  return details;
}
