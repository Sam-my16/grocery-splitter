import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import Papa from 'papaparse';

const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on('pageerror', error => errors.get(page).push(error.message));
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

async function openApp(page, fixtures = {}) {
  await page.addInitScript(({ bills = [], settlements = [] }) => {
    window.testDB = { bills, settlements, requests: [], fail: false, delay: 0 };
    window.testClient = {
      auth: { getSession: async () => ({ data: { session: {} } }) },
      from(table) {
        let action = 'select', payload, id;
        const query = {
          select() { return query; }, order() { return query; },
          insert(value) { action = 'insert'; payload = value; return query; },
          update(value) { action = 'update'; payload = value; return query; },
          delete() { action = 'delete'; return query; },
          eq(key, value) { id = value; return query; }, not() { return query; },
          then(resolve, reject) {
            return (async () => {
              const db = window.testDB;
              if (action !== 'select') {
                db.requests.push({ table, action, payload, id });
                await new Promise(r => setTimeout(r, db.delay));
                if (db.fail) return { error: { message: 'Sin conexión de prueba' } };
                if (action === 'insert') db[table].push({ ...payload, id: String(db.requests.length), created_at: '2026-10-30T12:00:00Z' });
                if (action === 'update') db[table] = db[table].map(row => row.id === id ? { ...row, ...payload } : row);
                if (action === 'delete') db[table] = id ? db[table].filter(row => row.id !== id) : [];
              }
              return { data: JSON.parse(JSON.stringify(db[table])), error: null };
            })().then(resolve, reject);
          }
        };
        return query;
      }
    };
  }, fixtures);
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'text/javascript', body: 'export function createClient() { return window.testClient; }' }));
  await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ path: 'node_modules/papaparse/papaparse.min.js', contentType: 'text/javascript' }));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '' }));
  await page.goto('/');
  await expect(page.locator('#auth-status')).toHaveText('Conectado');
}

test('quick expense validates payer, recovers draft, handles failed saves and prevents duplicates', async ({ page }, testInfo) => {
  await openApp(page);
  await expect(page.locator('#quick-fields')).toBeVisible();
  await expect(page.locator('#bill-payer')).toHaveValue('');
  await page.locator('#bill-title').fill('Cena');
  await page.locator('#quick-amount').fill('1200');
  await page.locator('#bulk-participants').getByRole('button', { name: 'Todos', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('quick-expense.png'), fullPage: true });
  await page.locator('#save-bill-btn').click();
  await expect(page.locator('#save-status')).toContainText('quién pagó');
  await page.locator('#bill-payer').selectOption('Sammy');
  await page.reload();
  await expect(page.locator('#bill-title')).toHaveValue('Cena');
  await expect(page.locator('#quick-amount')).toHaveValue('1200');
  await expect(page.locator('#draft-status')).toContainText('recuperado');
  await page.evaluate(() => { window.testDB.fail = true; window.testDB.delay = 300; });
  await page.locator('#save-bill-btn').click();
  await expect(page.locator('#save-bill-btn')).toBeDisabled();
  await expect(page.locator('#save-status')).toContainText('Sin conexión');
  await expect(page.locator('#bill-title')).toHaveValue('Cena');
  await page.evaluate(() => { window.testDB.fail = false; window.testDB.requests = []; });
  await page.locator('#save-bill-btn').click();
  await expect(page.locator('#save-status')).toContainText('guardado');
  const saved = await page.evaluate(() => window.testDB.requests);
  expect(saved).toHaveLength(1);
  expect(saved[0].payload.shares).toEqual({ Sammy: 400, Nubi: 400, Gabriel: 400 });
  expect(await page.evaluate(() => localStorage.getItem('cc-purchase-draft'))).toBeNull();
  await expect(page.locator('#bill-payer')).toHaveValue('');
});

test('receipt editing, assignment exceptions, totals, draft discard and mobile fit', async ({ page }, testInfo) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Importar compra', exact: true }).click();
  await page.locator('#csv-input').fill('```csv\nitem,price\n"Pan, integral",100\nLeche,200\n```');
  await page.locator('#parse-btn').click();
  await expect(page.locator('#items-list .item-card')).toHaveCount(2);
  await page.locator('#bulk-participants').getByRole('button', { name: 'Todos', exact: true }).click();
  await page.locator('#items-list .item-card').first().getByRole('button', { name: 'Gabriel', exact: true }).click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#bulk-participants').getByRole('button', { name: 'Sammy', exact: true }).click();
  await expect(page.locator('#items-list .item-card').first().getByRole('button', { name: 'Nubi', exact: true })).toHaveAttribute('aria-pressed', 'true');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#bulk-participants').getByRole('button', { name: 'Sammy', exact: true }).click();
  await page.locator('#items-list .item-card').first().getByLabel('Precio').fill('125');
  await page.locator('#bill-payer').selectOption('Nubi');
  await page.locator('#save-bill-btn').click();
  await expect(page.locator('#save-status')).toContainText('no coincide');
  await page.locator('#bill-total').fill('325');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('receipt.png'), fullPage: true });
  await page.locator('#save-bill-btn').click();
  await expect(page.locator('#save-status')).toContainText('guardado');
  await page.locator('#csv-input').fill('Pan,bad');
  await page.locator('#parse-btn').click();
  await expect(page.locator('#import-status')).toContainText('Fila 1');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#discard-draft-btn').click();
  await expect(page.locator('#csv-input')).toHaveValue('');
});

test('debt detail reconciles both directions, safely renders titles, and reports payment errors', async ({ page }, testInfo) => {
  await openApp(page, { bills: [
    { id: 'a', title: '<img src=x onerror=alert(1)>', date: '2026-10-01', category: 'Comida', payer: 'Sammy', total: 300, items: [{ name: 'Cena', price: 300, assignedTo: ['Sammy', 'Nubi', 'Gabriel'] }], shares: { Sammy: 100, Nubi: 100, Gabriel: 100 } },
    { id: 'b', title: 'Pan', date: '2026-10-02', category: 'Comida', payer: 'Nubi', total: 80, items: [{ name: 'Pan', price: 80, assignedTo: ['Sammy', 'Nubi'] }], shares: { Sammy: 40, Nubi: 40, Gabriel: 0 } }
  ], settlements: [{ id: 's', from_person: 'Nubi', to_person: 'Sammy', amount: 30, created_at: '2026-10-03T12:00:00Z' }] });
  await page.getByRole('button', { name: 'Balances', exact: true }).click();
  const pair = page.locator('.debt-card').filter({ hasText: 'Nubi le debe $30,00 a Sammy' });
  await pair.getByText('Ver detalle', { exact: true }).click();
  await expect(pair.locator('.debt-detail .balance-row')).toHaveCount(1);
  await expect(pair.locator('.debt-detail strong')).toHaveText('$30,00');
  await expect(pair.locator('.debt-detail')).not.toContainText('Resumen');
  await expect(pair.locator('.debt-detail details')).toHaveCount(0);
  await expect(pair).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.debt-card img')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('balances.png'), fullPage: true });
  await page.evaluate(() => { window.testDB.fail = true; });
  await pair.getByRole('button', { name: 'Marcar como pagado' }).click();
  await expect(pair).toContainText('Sin conexión');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(page.locator('#payments-list')).toContainText('Sin conexión');
  await page.getByRole('button', { name: 'Historial', exact: true }).click();
  await expect(page.locator('#history-list img')).toHaveCount(0);
  const history = page.locator('.history-item').filter({ hasText: '<img src=x onerror=alert(1)>' });
  await history.locator('summary').click();
  await history.getByRole('button', { name: 'Editar', exact: true }).click();
  await history.getByLabel('Precio', { exact: true }).fill('310');
  await history.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(history).toContainText('no coincide');
  await history.getByLabel('Total de la boleta').fill('310');
  await page.evaluate(() => { window.testDB.fail = false; });
  await history.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(history.locator('summary')).toContainText('$310,00');
  const updated = await page.evaluate(() => window.testDB.bills.find(b => b.id === 'a'));
  expect(updated.shares.Nubi).toBe(310 / 3);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-csv-btn').click();
  const download = await downloadPromise;
  const csv = Papa.parse(await readFile(await download.path(), 'utf8'), { header: true });
  expect(csv.errors).toEqual([]);
  expect(csv.data[0].total).toBe('310');
  expect(csv.data[0].parte_Nubi).toBe('103.33');
});

test('file upload, keyboard assignment, added/removed items and restored exceptions', async ({ page }) => {
  await openApp(page);
  const mode = page.getByRole('button', { name: 'Importar compra', exact: true });
  await mode.focus(); await page.keyboard.press('Enter');
  await page.locator('#csv-file').setInputFiles({ name: 'compra.csv', mimeType: 'text/csv', buffer: Buffer.from('item,price\nArroz,30\nPan,10') });
  await expect(page.locator('#csv-input')).toHaveValue('item,price\nArroz,30\nPan,10');
  await page.locator('#parse-btn').click();
  const everyone = page.locator('#bulk-participants').getByRole('button', { name: 'Todos', exact: true });
  await everyone.focus(); await page.keyboard.press('Space');
  await expect(everyone).toBeFocused();
  await page.locator('#items-list .item-card').first().getByRole('button', { name: 'Nubi', exact: true }).click();
  await page.locator('#add-item-btn').click();
  await page.locator('#items-list .item-card').last().getByLabel('Producto').fill('Yerba');
  await page.locator('#items-list .item-card').last().getByLabel('Precio').fill('20,50');
  await page.locator('#items-list .item-card').nth(1).getByRole('button', { name: 'Quitar item 2' }).click();
  await page.reload();
  await expect(page.locator('#items-list .item-card')).toHaveCount(2);
  await expect(page.locator('#items-list .item-card').first().getByRole('button', { name: 'Nubi', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#items-list .item-card').last().getByLabel('Precio')).toHaveValue('20,50');
  await page.locator('#bill-total').fill('50,50');
  await page.locator('#bill-payer').selectOption('Gabriel');
  await page.locator('#save-bill-btn').click();
  await expect(page.locator('#save-status')).toContainText('guardado');
  const saved = await page.evaluate(() => window.testDB.bills[0]);
  expect(saved.total).toBe(50.5);
  expect(saved.items.map(i => i.name)).toEqual(['Arroz', 'Yerba']);
  expect(saved.shares.Nubi).toBe(20.5 / 3);
});

test('storage unavailable does not break entry and warns that drafts cannot be saved', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage unavailable', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage unavailable', 'SecurityError'); };
  });
  await openApp(page);
  await page.locator('#bill-title').fill('Cena');
  await expect(page.locator('#draft-status')).toContainText('No se pudo guardar');
  await page.locator('#quick-amount').fill('12');
  await page.locator('#bill-payer').selectOption('Sammy');
  await page.locator('#bulk-participants').getByRole('button', { name: 'Todos', exact: true }).click();
  await page.locator('#save-bill-btn').click();
  await expect(page.locator('#save-status')).toContainText('guardado');
});

test('fractional debt summary reconciles and a completed payment clears that pair', async ({ page }) => {
  await openApp(page, { bills: [
    { id: 'a', title: 'Pan', date: '2026-10-01', category: 'Comida', payer: 'Sammy', total: 1, items: [{ name: 'Pan', price: 1, assignedTo: ['Nubi'] }], shares: { Sammy: 0, Nubi: 1, Gabriel: 0 } },
    { id: 'b', title: 'Cena', date: '2026-10-02', category: 'Comida', payer: 'Nubi', total: 0.25, items: [{ name: 'Cena', price: 0.25, assignedTo: ['Sammy', 'Nubi'] }], shares: { Sammy: 0.125, Nubi: 0.125, Gabriel: 0 } }
  ] });
  await page.getByRole('button', { name: 'Balances', exact: true }).click();
  const pair = page.locator('.debt-card');
  await expect(pair).toContainText('Nubi le debe $0,88 a Sammy');
  await pair.getByText('Ver detalle', { exact: true }).click();
  const displayed = await pair.locator('.balance-row strong').allTextContents();
  expect(displayed).toEqual(['$0,88']);
  await pair.getByRole('button', { name: 'Marcar como pagado' }).click();
  await expect(page.locator('#pairwise-list')).toHaveText('Todo saldado entre todos.');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(page.locator('#pairwise-list')).toContainText('Nubi le debe $0,88 a Sammy');
});

test('pending detail uses purchase titles or dates and hides paid purchases', async ({ page }) => {
  const fixture = (id, date, title, value) => ({ id, date, title, category: 'Comida', payer: 'Sammy', total: value, items: [], shares: { Nubi: value, Sammy: 0, Gabriel: 0 } });
  await openApp(page, { bills: [
    fixture('paid', '2026-08-01', 'Compra saldada', 1000),
    fixture('super', '2026-08-30', 'Supermercado', 4500),
    fixture('date', '2026-08-31', '   ', 500),
    fixture('today', '2026-10-30', 'Compra de hoy', 1500)
  ], settlements: [{ id: 'p', from_person: 'Nubi', to_person: 'Sammy', amount: 1500, created_at: '2026-10-30T12:00:00Z' }] });
  await page.getByRole('button', { name: 'Balances', exact: true }).click();
  const pair = page.locator('.debt-card');
  await expect(pair).toContainText('Nubi le debe $6.000,00 a Sammy');
  await pair.getByText('Ver detalle', { exact: true }).click();
  await expect(pair.locator('.balance-row span')).toHaveText(['Supermercado — ', '31-08-2026 — ', 'Compra de hoy — ']);
  await expect(pair.locator('.balance-row strong')).toHaveText(['$4.000,00', '$500,00', '$1.500,00']);
  await expect(pair.locator('.debt-detail')).not.toContainText('Compra saldada');
  await expect(pair.locator('.debt-detail')).not.toContainText('Comida');
});
