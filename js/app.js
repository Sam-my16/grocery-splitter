import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc,
  getDocs, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig, PEOPLE } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const statusEl = document.getElementById("auth-status");
let ready = false;

onAuthStateChanged(auth, (user) => {
  if (user) {
    ready = true;
    statusEl.textContent = "Conectado";
    loadHistory();
    loadBalances();
  }
});
signInAnonymously(auth).catch((err) => {
  statusEl.textContent = "Error de conexión: " + err.message;
});

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
  const result = Papa.parse(raw, { header: true, skipEmptyLines: true });
  const fields = result.meta.fields || [];
  const itemKey = fields.find((f) => /item|producto|nombre/i.test(f)) || fields[0];
  const priceKey = fields.find((f) => /price|precio|final|total/i.test(f)) || fields[1];

  items = result.data
    .filter((row) => row[itemKey])
    .map((row) => ({
      name: row[itemKey].trim(),
      price: parseFloat(String(row[priceKey]).replace(",", ".")) || 0,
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

  try {
    await addDoc(collection(db, "bills"), {
      date,
      payer,
      total,
      items,
      shares,
      createdAt: serverTimestamp()
    });
    document.getElementById("save-status").textContent = "Guardado.";
    items = [];
    document.getElementById("csv-input").value = "";
    document.getElementById("items-card").hidden = true;
    document.getElementById("save-card").hidden = true;
    document.getElementById("bill-total").value = "";
    loadHistory();
    loadBalances();
  } catch (err) {
    document.getElementById("save-status").textContent = "Error: " + err.message;
  }
});

// ---------- History ----------
async function loadHistory() {
  const el = document.getElementById("history-list");
  const snap = await getDocs(query(collection(db, "bills"), orderBy("date", "desc")));
  if (snap.empty) {
    el.textContent = "Todavía no hay compras cargadas.";
    return;
  }
  el.innerHTML = "";
  snap.forEach((docSnap) => {
    const bill = docSnap.data();
    const details = document.createElement("details");
    details.className = "history-item";
    const summary = document.createElement("summary");
    summary.innerHTML = `<span>${bill.date} — pagó ${bill.payer}</span><span>${fmt(bill.total)}</span>`;
    details.appendChild(summary);

    const ul = document.createElement("ul");
    (bill.items || []).forEach((i) => {
      const li = document.createElement("li");
      li.textContent = `${i.name}: ${fmt(i.price)} → ${i.assignedTo.join(", ")}`;
      ul.appendChild(li);
    });
    details.appendChild(ul);

    const delBtn = document.createElement("button");
    delBtn.textContent = "Eliminar";
    delBtn.className = "assign-btn";
    delBtn.style.marginTop = "0.5rem";
    delBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!confirm("¿Eliminar esta compra?")) return;
      await deleteDoc(doc(db, "bills", docSnap.id));
      loadHistory();
      loadBalances();
    });
    details.appendChild(delBtn);

    el.appendChild(details);
  });
}

// ---------- Balances ----------
async function loadBalances() {
  const balEl = document.getElementById("balances-list");
  const settleEl = document.getElementById("settle-list");
  const snap = await getDocs(collection(db, "bills"));

  const balances = Object.fromEntries(PEOPLE.map((p) => [p, 0]));
  snap.forEach((docSnap) => {
    const bill = docSnap.data();
    balances[bill.payer] = (balances[bill.payer] || 0) + bill.total;
    PEOPLE.forEach((p) => {
      balances[p] -= (bill.shares && bill.shares[p]) || 0;
    });
  });

  balEl.innerHTML = "";
  PEOPLE.forEach((p) => {
    const row = document.createElement("div");
    row.className = "balance-row";
    const sign = balances[p] >= 0 ? "pos" : "neg";
    const label = balances[p] >= 0 ? "le deben" : "debe";
    row.innerHTML = `<span>${p}</span><span class="${sign}">${label} ${fmt(Math.abs(balances[p]))}</span>`;
    balEl.appendChild(row);
  });

  // Settle-up: greedy match creditors with debtors
  const creditors = PEOPLE.filter((p) => balances[p] > 0.01)
    .map((p) => ({ p, amt: balances[p] })).sort((a, b) => b.amt - a.amt);
  const debtors = PEOPLE.filter((p) => balances[p] < -0.01)
    .map((p) => ({ p, amt: -balances[p] })).sort((a, b) => b.amt - a.amt);

  settleEl.innerHTML = "";
  let ci = 0, di = 0;
  const transfers = [];
  while (ci < creditors.length && di < debtors.length) {
    const amt = Math.min(creditors[ci].amt, debtors[di].amt);
    transfers.push(`${debtors[di].p} le paga ${fmt(amt)} a ${creditors[ci].p}`);
    creditors[ci].amt -= amt;
    debtors[di].amt -= amt;
    if (creditors[ci].amt < 0.01) ci++;
    if (debtors[di].amt < 0.01) di++;
  }

  if (transfers.length === 0) {
    settleEl.textContent = "Todo saldado.";
  } else {
    transfers.forEach((t) => {
      const row = document.createElement("div");
      row.className = "settle-row";
      row.textContent = t;
      settleEl.appendChild(row);
    });
  }
}

function fmt(n) {
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
