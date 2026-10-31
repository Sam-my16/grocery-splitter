// Pure purchase/account rules shared by new purchases, history editing and tests.
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Match the UI's sign + Intl-formatted magnitude, including half-cent ties.
export function displayCents(value) {
  const rounded = Math.abs(value).toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Math.sign(value) * Math.round(Number(rounded) * 100);
}

export function amount(value) {
  const text = String(value ?? '').trim();
  if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(text)) return NaN;
  const number = Number(text.replace(',', '.'));
  return Number.isSafeInteger(Math.round(number * 100)) ? number : NaN;
}

export function parseReceipt(raw, parse) {
  const text = raw.trim().replace(/^```(?:csv)?\s*\r?\n/i, '').replace(/\r?\n```\s*$/, '').trim();
  if (!text) throw new Error('Pegá el CSV o elegí un archivo.');
  const result = parse(text, { skipEmptyLines: 'greedy' });
  const errors = result.errors.filter(e => e.code !== 'UndetectableDelimiter');
  if (errors.length) throw new Error(`No se pudo leer el CSV: ${errors[0].message}`);
  const rows = result.data;
  const header = rows[0]?.map(cell => String(cell).trim()) || [];
  const nameColumn = header.findIndex(cell => /item|producto|nombre/i.test(cell));
  const priceColumn = header.findIndex(cell => /price|precio|final|total/i.test(cell));
  const hasHeader = nameColumn >= 0 && priceColumn >= 0;
  const start = hasHeader ? 1 : 0;
  if (rows.length <= start) throw new Error('Agregá al menos un item debajo del encabezado.');
  return rows.slice(start).map((row, index) => {
    const line = index + start + 1;
    if (row.length !== (hasHeader ? header.length : 2)) throw new Error(`Fila ${line}: revisá las columnas y las comillas.`);
    const name = String(row[hasHeader ? nameColumn : 0] ?? '').trim();
    const price = amount(row[hasHeader ? priceColumn : 1]);
    if (!name || !Number.isFinite(price)) throw new Error(`Fila ${line}: falta el nombre o el precio no es válido. Usá hasta dos decimales, sin símbolo de moneda ni separador de miles.`);
    return { name, price, assignedTo: [] };
  });
}

export function calculateShares(items, people) {
  const shares = Object.fromEntries(people.map(person => [person, 0]));
  for (const item of items) {
    if (!item.assignedTo.length || !Number.isFinite(amount(item.price))) continue;
    const share = amount(item.price) / item.assignedTo.length;
    for (const person of item.assignedTo) if (person in shares) shares[person] += share;
  }
  return shares;
}

export function prepareBill(draft, people) {
  if (!draft.items.length) throw new Error('Agregá al menos un item.');
  const items = draft.items.map((item, index) => {
    if (!item.name.trim() || !Number.isFinite(amount(item.price))) throw new Error(`Item ${index + 1}: completá el nombre y un precio válido.`);
    if (!item.assignedTo.length || item.assignedTo.some(p => !people.includes(p)) || new Set(item.assignedTo).size !== item.assignedTo.length) throw new Error(`Item ${index + 1}: elegí quiénes lo comparten.`);
    return { name: item.name.trim(), price: amount(item.price), assignedTo: [...item.assignedTo] };
  });
  if (!people.includes(draft.payer)) throw new Error('Elegí quién pagó.');
  const date = draft.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Elegí una fecha válida.');
  const total = amount(draft.total);
  const cents = items.reduce((sum, item) => sum + Math.round(item.price * 100), 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('El total debe ser mayor que cero.');
  if (Math.round(total * 100) !== cents) throw new Error('El total de la boleta no coincide con la suma de items. Corregí los precios o el total.');
  return { date, payer: draft.payer, total, title: draft.title.trim() || null, category: draft.category, items, shares: calculateShares(items, people) };
}

export function applyParticipants(items, previous, next, confirmOverwrite) {
  const same = assigned => assigned.length === previous.length && assigned.every(p => previous.includes(p));
  if (items.some(item => item.assignedTo.length && !same(item.assignedTo)) && !confirmOverwrite()) return null;
  return items.map(item => ({ ...item, assignedTo: [...next] }));
}

export function restoreDraft(raw, people) {
  try {
    const value = JSON.parse(raw);
    const validPeople = list => Array.isArray(list) && list.every(p => people.includes(p)) && new Set(list).size === list.length;
    if (value?.version !== 1 || !['quick', 'import'].includes(value.mode) || !validPeople(value.participants) || !Array.isArray(value.items) || !value.fields || typeof value.raw !== 'string') return null;
    if (!Object.values(value.fields).every(v => typeof v === 'string')) return null;
    if (!value.items.every(i => typeof i.name === 'string' && ['string', 'number'].includes(typeof i.price) && validPeople(i.assignedTo))) return null;
    return value;
  } catch { return null; }
}

// A positive net means `person` owes `other`. Preserve unrounded legacy shares.
export function pairAccount(bills, payments, person, other) {
  let purchasesOwed = 0, purchasesOffset = 0, paymentsSent = 0, paymentsReceived = 0;
  const entries = [];
  for (const bill of bills) {
    let value = 0;
    if (bill.payer === other) { value = Number(bill.shares?.[person]) || 0; purchasesOwed += value; }
    if (bill.payer === person) { const share = Number(bill.shares?.[other]) || 0; purchasesOffset += share; value = -share; }
    if (value) entries.push({ kind: 'purchase', amount: value, date: bill.date, title: bill.title?.trim() || null, payer: bill.payer, id: bill.id });
  }
  for (const payment of payments) {
    let value = 0;
    if (payment.from_person === person && payment.to_person === other) { paymentsSent += Number(payment.amount); value = -Number(payment.amount); }
    if (payment.from_person === other && payment.to_person === person) { paymentsReceived += Number(payment.amount); value = Number(payment.amount); }
    if (value) entries.push({ kind: 'payment', amount: value, date: payment.created_at?.slice(0, 10) || '', from: payment.from_person, to: payment.to_person, id: payment.id });
  }
  const net = purchasesOwed - purchasesOffset - paymentsSent + paymentsReceived;
  const pending = [];
  let remaining = Math.max(0, net);
  // Keep the newest purchases outstanding, offsetting the oldest first.
  // ID breaks same-date ties independently of database response order.
  const purchases = entries.filter(e => e.kind === 'purchase' && e.amount > 0)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || String(b.id || '').localeCompare(String(a.id || '')));
  for (const entry of purchases) {
    const value = Math.min(entry.amount, remaining);
    const next = Math.max(0, remaining - value);
    // Differences of rounded running totals preserve the displayed net exactly.
    const cents = displayCents(remaining) - displayCents(next);
    if (cents > 0) pending.push({ ...entry, amount: cents / 100 });
    remaining = next;
  }
  pending.reverse();
  // An excess reverse payment may create debt with no purchase behind it.
  if (displayCents(remaining) > 0) pending.push({ kind: 'payment', title: 'Saldo por pagos', amount: displayCents(remaining) / 100 });
  return { purchasesOwed, purchasesOffset, paymentsSent, paymentsReceived, net, entries, pending };
}
