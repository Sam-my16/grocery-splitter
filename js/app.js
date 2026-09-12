import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, PEOPLE } from "./supabase-config.js";

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

// ---------- Tabs ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// ---------- CSV parsing ----------
let items = []; // { name, price, assignedTo: [] }

function sameSet(a, b) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function pairCombos(arr) {
  const res = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      res.push([arr[i], arr[j]]);
    }
  }
  return res;
}

document.getElementById("csv-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById("csv-input").value = ev.target.result;
  };
  reader.readAsText(file);
});

document.getElementById("parse-btn").addEventListener("click", () => {
  const raw = document.getElementById("csv-input").value.trim();
  if (!raw) return;

  const rows = Papa.parse(raw, { skipEmptyLines: true }).data;
  if (!rows || rows.length === 0) return;

  // Con una sola línea no hay forma de tener encabezado + dato: es un item suelto.
  // Con varias líneas, un encabezado real tiene texto (no un número) en la 2da columna.
  const secondCell = rows[0][1];
  const looksLikeHeader = rows.length > 1 &&
    isNaN(parseFloat(String(secondCell ?? "").replace(",", ".")));

  let dataRows = rows;
  let itemIdx = 0;
  let priceIdx = 1;

  if (looksLikeHeader) {
    const header = rows[0].map((h) => String(h).trim());
    const foundItem = header.findIndex((f) => /item|producto|nombre/i.test(f));
    const foundPrice = header.findIndex((f) => /price|precio|final|total/i.test(f));
    if (foundItem !== -1) itemIdx = foundItem;
    if (foundPrice !== -1) priceIdx = foundPrice;
    dataRows = rows.slice(1);
  }

  items = dataRows
    .filter((row) => row[itemIdx])
    .map((row) => ({
      name: String(row[itemIdx]).trim(),
      price: parseFloat(String(row[priceIdx]).replace(",", ".")) || 0,
      assignedTo: []
    }));

  renderItems();
  document.getElementById("items-card").hidden = false;
  document.getElementById("save-card").hidden = false;
  document.getElementById("bill-date").valueAsDate = new Date();
});

function renderItems() {
  const tbody = document.getElementById("items-tbody");
  tbody.innerHTML = "";
  items.forEach((item, idx) => {
    const tr = document.createElement("tr");

    const nameTd = document.createElement("td");
    nameTd.textContent = item.name;

    const priceTd = document.createElement("td");
    priceTd.textContent = fmt(item.price);

    const assignTd = document.createElement("td");

    const quickGroup = document.createElement("div");
    quickGroup.className = "assign-group quick-group";

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "assign-btn quick-btn" + (sameSet(item.assignedTo, PEOPLE) ? " selected" : "");
    allBtn.textContent = "Todos";
    allBtn.addEventListener("click", () => {
      item.assignedTo = [...PEOPLE];
      renderItems();
      updateTotals();
    });
    quickGroup.appendChild(allBtn);

    pairCombos(PEOPLE).forEach(([a, b]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "assign-btn quick-btn" + (sameSet(item.assignedTo, [a, b]) ? " selected" : "");
      btn.textContent = `${a} + ${b}`;
      btn.addEventListener("click", () => {
        item.assignedTo = [a, b];
        renderItems();
        updateTotals();
      });
      quickGroup.appendChild(btn);
    });
    assignTd.appendChild(quickGroup);

    const group = document.createElement("div");
    group.className = "assign-group";
    PEOPLE.forEach((person) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "assign-btn" + (item.assignedTo.includes(person) ? " selected" : "");
      b.textContent = person;
      b.addEventListener("click", () => {
        const i = item.assignedTo.indexOf(person);
        if (i === -1) item.assignedTo.push(person);
        else item.assignedTo.splice(i, 1);
        renderItems();
        updateTotals();
      });
      group.appendChild(b);
    });
    assignTd.appendChild(group);

    tr.appendChild(nameTd);
    tr.appendChild(priceTd);
    tr.appendChild(assignTd);
    tbody.appendChild(tr);
  });
  updateTotals();
}

function updateTotals() {
  const sum = items.reduce((s, i) => s + i.price, 0);
  document.getElementById("sum-items").textContent = fmt(sum);
  const billTotalInput = document.getElementById("bill-total");
  if (!billTotalInput.value) billTotalInput.value = sum.toFixed(2);
  checkMatch();
}

document.getElementById("bill-total").addEventListener("input", checkMatch);

function checkMatch() {
  const sum = items.reduce((s, i) => s + i.price, 0);
  const total = parseFloat(document.getElementById("bill-total").value) || 0;
  const badge = document.getElementById("total-match");
  const diff = Math.abs(sum - total);
  if (diff < 0.01) {
    badge.textContent = "Coincide";
    badge.className = "badge ok";
  } else {
    badge.textContent = `Diferencia: ${fmt(diff)}`;
    badge.className = "badge bad";
  }
}

// ---------- Save bill ----------
document.getElementById("save-bill-btn").addEventListener("click", async () => {
  if (!ready) return;
  const unassigned = items.filter((i) => i.assignedTo.length === 0);
  if (unassigned.length > 0) {
    document.getElementById("save-status").textContent =
      `Faltan asignar ${unassigned.length} item(s).`;
    return;
  }

  const shares = Object.fromEntries(PEOPLE.map((p) => [p, 0]));
  items.forEach((item) => {
    const share = item.price / item.assignedTo.length;
    item.assignedTo.forEach((p) => { shares[p] += share; });
  });

  const total = parseFloat(document.getElementById("bill-total").value) || 0;
  const payer = document.getElementById("bill-payer").value;
  const date = document.getElementById("bill-date").value;
  const title = document.getElementById("bill-title").value.trim() || null;
  const category = document.getElementById("bill-category").value;

  const { error } = await supabase.from("bills").insert({
    date, payer, total, items, shares, title, category
  });

  if (error) {
    document.getElementById("save-status").textContent = friendlyError(error);
    return;
  }

  document.getElementById("save-status").textContent = "Guardado.";
  items = [];
  document.getElementById("csv-input").value = "";
  document.getElementById("items-card").hidden = true;
  document.getElementById("save-card").hidden = true;
  document.getElementById("bill-total").value = "";
  document.getElementById("bill-title").value = "";
  document.getElementById("bill-category").value = "Supermercado";
  loadHistory();
  loadBalances();
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

  const currentMonth = new Date().toISOString().slice(0, 7);
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
  Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, total]) => {
      const row = document.createElement("div");
      row.className = "balance-row";
      row.innerHTML = `<span>${cat}</span><span>${fmt(total)}</span>`;
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
    const categoryTag = bill.category ? ` · ${bill.category}` : "";
    const summary = document.createElement("summary");
    summary.innerHTML = `<span>${label} — pagó ${bill.payer}${categoryTag}</span><span>${fmt(bill.total)}</span>`;
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

    const saveEditBtn = document.createElement("button");
    saveEditBtn.type = "button";
    saveEditBtn.className = "primary";
    saveEditBtn.textContent = "Guardar cambios";
    const editStatus = document.createElement("p");
    editStatus.className = "hint";
    saveEditBtn.addEventListener("click", async () => {
      const { error } = await supabase.from("bills").update({
        title: titleInput.value.trim() || null,
        date: dateInput.value,
        payer: payerSelect.value,
        category: categorySelect.value
      }).eq("id", bill.id);
      if (error) {
        editStatus.textContent = friendlyError(error);
        return;
      }
      loadHistory();
      loadBalances();
    });

    editForm.appendChild(titleLabel);
    editForm.appendChild(dateLabel);
    editForm.appendChild(payerLabel);
    editForm.appendChild(categoryLabel);
    editForm.appendChild(saveEditBtn);
    editForm.appendChild(editStatus);
    details.appendChild(editForm);

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
      await supabase.from("bills").delete().eq("id", bill.id);
      loadHistory();
      loadBalances();
    });
    actions.appendChild(delBtn);
    details.appendChild(actions);

    monthGroupEl.appendChild(details);
  });
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

  const headers = ["fecha", "mes", "titulo", "categoria", "pago", ...PEOPLE.map((p) => `parte_${p}`)];
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
  a.download = `gastos_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("clear-payments-btn").addEventListener("click", async () => {
  if (!confirm("¿Eliminar todos los pagos registrados? Esta acción no se puede deshacer.")) return;
  await supabase.from("settlements").delete().not("id", "is", null);
  loadBalances();
});

// ---------- Balances ----------
async function loadBalances() {
  const pairEl = document.getElementById("pairwise-list");
  const paymentsEl = document.getElementById("payments-list");

  const [{ data: bills, error: billsErr }, { data: payments, error: paysErr }] = await Promise.all([
    supabase.from("bills").select("payer,total,shares"),
    supabase.from("settlements").select("*").order("created_at", { ascending: false })
  ]);

  if (billsErr) {
    pairEl.textContent = friendlyError(billsErr);
    return;
  }

  // Pairwise net debt: exactly what each pair owes each other, no group-wide optimization
  const net = {};
  function applyDebt(debtor, creditor, amt) {
    if (debtor === creditor || !amt) return;
    const [a, b] = [debtor, creditor].sort();
    const sign = debtor === a ? 1 : -1;
    net[`${a}|${b}`] = (net[`${a}|${b}`] || 0) + sign * amt;
  }
  (bills || []).forEach((bill) => {
    PEOPLE.forEach((p) => {
      if (p === bill.payer) return;
      applyDebt(p, bill.payer, (bill.shares && bill.shares[p]) || 0);
    });
  });
  (payments || []).forEach((s) => {
    applyDebt(s.to_person, s.from_person, s.amount);
  });

  pairEl.innerHTML = "";
  let anyPairDebt = false;
  pairCombos(PEOPLE).forEach(([a, b]) => {
    const [sortedA, sortedB] = [a, b].sort();
    const value = net[`${sortedA}|${sortedB}`] || 0;
    if (Math.abs(value) < 0.01) return;
    anyPairDebt = true;
    const debtor = value > 0 ? sortedA : sortedB;
    const creditor = value > 0 ? sortedB : sortedA;
    const amt = Math.abs(value);

    const row = document.createElement("div");
    row.className = "settle-row";
    const text = document.createElement("span");
    text.textContent = `${debtor} le debe ${fmt(amt)} a ${creditor}`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "assign-btn";
    btn.textContent = "Marcar como pagado";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const { error } = await supabase.from("settlements").insert({ from_person: debtor, to_person: creditor, amount: amt });
      if (error) {
        const err = document.createElement("p");
        err.className = "hint";
        err.style.color = "var(--danger)";
        err.textContent = friendlyError(error);
        row.appendChild(err);
        btn.disabled = false;
        return;
      }
      loadBalances();
    });
    row.appendChild(text);
    row.appendChild(btn);
    pairEl.appendChild(row);
  });
  if (!anyPairDebt) {
    pairEl.textContent = "Todo saldado entre todos.";
  }

  // Recorded payments (audit trail, with undo)
  if (paysErr) {
    paymentsEl.textContent = "";
    return;
  }
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
      await supabase.from("settlements").delete().eq("id", s.id);
      loadBalances();
    });
    row.appendChild(text);
    row.appendChild(btn);
    paymentsEl.appendChild(row);
  });
}

function fmt(n) {
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
