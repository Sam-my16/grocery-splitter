import { amount, parseReceipt, prepareBill, calculateShares, applyParticipants, restoreDraft, localDate } from './core.js';

export function money(number) {
  return '$' + number.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function renderItemCards(container, items, people, onChange) {
  container.replaceChildren();
  items.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'item-card';
    const fields = document.createElement('div');
    fields.className = 'item-fields';
    for (const [key, label] of [['name', 'Producto'], ['price', 'Precio']]) {
      const wrapper = document.createElement('label');
      wrapper.textContent = label;
      const input = document.createElement('input');
      input.type = 'text';
      if (key === 'price') input.inputMode = 'decimal';
      input.value = item[key];
      input.addEventListener('input', () => { item[key] = input.value; onChange(); });
      wrapper.append(input);
      fields.append(wrapper);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'assign-btn';
    remove.textContent = 'Quitar';
    remove.setAttribute('aria-label', `Quitar item ${index + 1}`);
    remove.addEventListener('click', () => {
      items.splice(index, 1);
      renderItemCards(container, items, people, onChange);
      onChange();
      const next = container.querySelectorAll('input')[Math.min(index, items.length - 1) * 2];
      if (next) next.focus();
      else container.parentElement.querySelector('button')?.focus();
    });
    fields.append(remove);
    const participants = document.createElement('div');
    participants.className = 'assign-group';
    participants.setAttribute('role', 'group');
    participants.setAttribute('aria-label', `Participantes del item ${index + 1}`);
    people.forEach(person => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = person;
      const refresh = () => {
        const selected = item.assignedTo.includes(person);
        button.className = `assign-btn person-${person.toLowerCase()}${selected ? ' selected' : ''}`;
        button.setAttribute('aria-pressed', String(selected));
      };
      refresh();
      button.addEventListener('click', () => {
        item.assignedTo = item.assignedTo.includes(person) ? item.assignedTo.filter(p => p !== person) : [...item.assignedTo, person];
        refresh();
        onChange();
      });
      participants.append(button);
    });
    card.append(fields, participants);
    container.append(card);
  });
}

export function initPurchase({ supabase, people, isReady, onSaved, friendlyError }) {
  const $ = id => document.getElementById(id);
  const storageKey = 'cc-purchase-draft';
  const fieldIds = { title: 'bill-title', quickAmount: 'quick-amount', total: 'bill-total', payer: 'bill-payer', date: 'bill-date', category: 'bill-category' };
  let mode = 'quick', items = [], participants = [], saving = false;
  let hasDraft = false;
  people.forEach(person => $('bill-payer').add(new Option(person, person)));
  $('bill-date').value = localDate();

  function fields() { return Object.fromEntries(Object.entries(fieldIds).map(([key, id]) => [key, $(id).value])); }
  function currentItems() {
    return mode === 'quick' ? [{ name: $('bill-title').value, price: $('quick-amount').value, assignedTo: participants }] : items;
  }
  function persist() {
    hasDraft = true;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, mode, items, participants, raw: $('csv-input').value, fields: fields() }));
      $('draft-status').textContent = 'Borrador guardado en este dispositivo.';
    } catch { $('draft-status').textContent = 'No se pudo guardar el borrador en este dispositivo. Mantené esta página abierta.'; }
  }
  function refreshTotals() {
    const rows = currentItems();
    const validPrices = rows.every(i => Number.isFinite(amount(i.price)));
    const sumCents = rows.reduce((sum, i) => sum + (Number.isFinite(amount(i.price)) ? Math.round(amount(i.price) * 100) : 0), 0);
    $('sum-items').textContent = money(sumCents / 100);
    const total = amount($('bill-total').value);
    const matches = validPrices && Number.isFinite(total) && Math.round(total * 100) === sumCents;
    $('total-match').textContent = !validPrices ? 'Revisá los precios' : !Number.isFinite(total) ? 'Completá el total' : matches ? 'Coincide' : `Diferencia: ${money(Math.abs(sumCents / 100 - total))}`;
    $('total-match').className = 'badge ' + (matches ? 'ok' : 'bad');
    const unassigned = rows.filter(i => !i.assignedTo.length).length;
    $('unassigned-status').textContent = !rows.length ? 'Agregá items para ver el reparto.' : unassigned ? `Falta asignar ${unassigned} item(s).` : !validPrices ? 'Revisá los precios para completar el reparto.' : 'Todos los items tienen participantes.';
    $('purchase-shares').replaceChildren();
    const shares = calculateShares(rows, people);
    people.forEach(person => {
      const row = document.createElement('div');
      row.className = 'balance-row';
      const name = document.createElement('span'); name.textContent = person;
      const value = document.createElement('strong'); value.textContent = money(shares[person]);
      row.append(name, value); $('purchase-shares').append(row);
    });
  }
  function changed() { $('save-status').textContent = ''; refreshTotals(); persist(); }
  function renderItems() { renderItemCards($('items-list'), items, people, changed); }
  function renderBulk() {
    $('bulk-participants').replaceChildren();
    const choices = [['Todos', people]];
    for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) choices.push([`${people[i]} + ${people[j]}`, [people[i], people[j]]]);
    people.forEach(p => choices.push([p, [p]]));
    choices.forEach(([label, selected]) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label; button.className = 'assign-btn';
      const active = participants.length === selected.length && selected.every(p => participants.includes(p));
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
      button.addEventListener('click', () => {
        const next = applyParticipants(items, participants, selected, () => confirm('Cambiar el reparto de toda la compra reemplazará las excepciones de los items. ¿Continuar?'));
        if (!next) return;
        participants = [...selected]; items = next;
        renderBulk(); renderItems(); changed();
        [...$('bulk-participants').children].find(b => b.textContent === label)?.focus();
      });
      $('bulk-participants').append(button);
    });
  }
  function renderMode() {
    $('import-card').hidden = mode !== 'import';
    $('items-card').hidden = mode !== 'import';
    $('quick-fields').hidden = mode !== 'quick';
    $('title-label').textContent = mode === 'quick' ? 'Descripción' : 'Título (opcional)';
    $('purchase-heading').textContent = mode === 'quick' ? 'Anotá un gasto' : 'Datos de la compra';
    $('bulk-hint').textContent = mode === 'quick' ? 'Elegí quiénes comparten este gasto.' : 'Elegí una opción para toda la compra. Después podés ajustar cada item.';
    $('save-bill-btn').textContent = mode === 'quick' ? 'Guardar gasto' : 'Guardar compra';
    document.querySelectorAll('[data-entry-mode]').forEach(button => {
      const active = button.dataset.entryMode === mode;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    renderBulk(); renderItems(); refreshTotals();
  }
  function reset() {
    items = []; participants = []; hasDraft = false;
    $('purchase-form').reset();
    $('bill-date').value = localDate();
    $('import-status').textContent = '';
    try { localStorage.removeItem(storageKey); $('draft-status').textContent = ''; }
    catch { $('draft-status').textContent = 'No se pudo borrar el borrador del dispositivo.'; }
    renderMode();
  }
  document.querySelectorAll('[data-entry-mode]').forEach(button => button.addEventListener('click', () => {
    if (saving) return;
    mode = button.dataset.entryMode; renderMode(); changed();
  }));
  $('purchase-form').addEventListener('input', event => {
    if (event.target.id !== 'csv-file') changed();
  });
  $('purchase-form').addEventListener('change', event => {
    if (event.target.id !== 'csv-file') changed();
  });
  $('csv-file').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try { $('csv-input').value = await file.text(); changed(); }
    catch { $('import-status').textContent = 'No se pudo leer el archivo. Probá pegar el CSV.'; }
  });
  $('parse-btn').addEventListener('click', () => {
    try {
      const parsed = parseReceipt($('csv-input').value, window.Papa.parse);
      if (items.length && !confirm('¿Reemplazar los items actuales por este CSV?')) return;
      items = parsed.map(item => ({ ...item, assignedTo: [...participants] }));
      $('bill-total').value = (items.reduce((sum, i) => sum + Math.round(i.price * 100), 0) / 100).toFixed(2);
      $('import-status').textContent = `${items.length} item(s) listos para revisar.`;
      $('import-status').classList.remove('error-text');
      renderItems(); changed(); $('items-list').querySelector('input')?.focus();
    } catch (error) { $('import-status').textContent = error.message; $('import-status').classList.add('error-text'); }
  });
  $('add-item-btn').addEventListener('click', () => {
    items.push({ name: '', price: '', assignedTo: [...participants] });
    renderItems(); changed(); $('items-list').lastElementChild.querySelector('input').focus();
  });
  $('discard-draft-btn').addEventListener('click', () => {
    if (saving || !hasDraft || !confirm('¿Descartar esta compra sin guardar?')) return;
    reset(); $('save-status').textContent = 'Borrador descartado.';
  });
  $('purchase-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) return;
    let payload;
    try { payload = prepareBill({ ...fields(), total: mode === 'quick' ? $('quick-amount').value : $('bill-total').value, items: currentItems() }, people); }
    catch (error) { $('save-status').textContent = error.message; $('save-status').focus(); return; }
    if (!isReady()) { $('save-status').textContent = 'Todavía no hay conexión. Tu borrador sigue guardado.'; return; }
    saving = true;
    $('purchase-fields').disabled = true;
    $('discard-draft-btn').disabled = true;
    document.querySelectorAll('[data-entry-mode]').forEach(b => { b.disabled = true; });
    $('save-status').textContent = 'Guardando…';
    try {
      const { error } = await supabase.from('bills').insert(payload);
      if (error) throw error;
      reset();
      $('save-status').textContent = 'Gasto guardado. Podés verlo en Historial y Balances.';
      onSaved();
    } catch (error) { $('save-status').textContent = friendlyError(error) + ' Podés volver a intentar; conservamos tu compra.'; }
    finally {
      saving = false; $('purchase-fields').disabled = false; $('discard-draft-btn').disabled = false;
      document.querySelectorAll('[data-entry-mode]').forEach(b => { b.disabled = false; });
      $('save-status').focus();
    }
  });
  try {
    const raw = localStorage.getItem(storageKey);
    const draft = restoreDraft(raw, people);
    if (draft) {
      mode = draft.mode; items = draft.items; participants = draft.participants; hasDraft = true;
      $('csv-input').value = draft.raw;
      for (const [key, id] of Object.entries(fieldIds)) if (key in draft.fields) $(id).value = draft.fields[key];
      $('draft-status').textContent = 'Borrador recuperado. Podés seguir donde lo dejaste.';
    } else if (raw) { $('draft-status').textContent = 'No se pudo recuperar el borrador anterior.'; }
  } catch { $('draft-status').textContent = 'El almacenamiento del dispositivo no está disponible.'; }
  renderMode();
}
