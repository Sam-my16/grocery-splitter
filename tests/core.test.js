import { test } from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import { parseReceipt, prepareBill, calculateShares, pairAccount, localDate, applyParticipants, restoreDraft, displayCents } from '../js/core.js';

const people = ['Sammy', 'Nubi', 'Gabriel'];
const item = (price, assignedTo = people) => ({ name: 'Pan', price, assignedTo });
const bill = (changes = {}) => ({ date: '2026-10-30', payer: 'Sammy', total: '10.00', title: 'Compra', category: 'Comida', items: [item('10')], ...changes });

test('imports fenced CSV, quoted names, flexible headers and headerless rows', () => {
  assert.deepEqual(parseReceipt('```csv\nproducto,precio\n"Pan, integral",12.50\n```', Papa.parse), [{ name: 'Pan, integral', price: 12.5, assignedTo: [] }]);
  assert.equal(parseReceipt('Leche,1200', Papa.parse)[0].price, 1200);
  assert.equal(parseReceipt('precio;producto\n"12,50";Pan', Papa.parse)[0].price, 12.5);
});

test('rejects malformed rows and prices instead of silently creating zero amounts', () => {
  for (const csv of ['item,price\nPan,no', 'item,price\nPan,', 'item,price\nPan,12oops', 'item,price\nPan,Infinity', 'item,price\nPan,1,20', 'item,price', 'item,price\n,12', 'item,price\n"Pan,12']) {
    assert.throws(() => parseReceipt(csv, Papa.parse), undefined, csv);
  }
});

test('validates both quick expenses and edited purchases through the same builder', () => {
  const result = prepareBill(bill(), people);
  assert.equal(result.total, 10);
  assert.equal(result.items[0].price, 10);
  assert.equal(result.shares.Nubi, 10 / 3);
  for (const invalid of [bill({ payer: '' }), bill({ date: '2026-02-30' }), bill({ items: [] }), bill({ items: [item('')] }), bill({ items: [item('NaN')] }), bill({ items: [item(10, [])] }), bill({ items: [{ ...item(10), name: ' ' }] }), bill({ total: 10.01 }), bill({ items: [item(10, ['Stranger'])] })]) {
    assert.throws(() => prepareBill(invalid, people));
  }
});

test('fractional shares and discounts retain the existing equal-split calculation', () => {
  const shares = calculateShares([item(10), item(-1, ['Nubi'])], people);
  assert.equal(shares.Sammy, 10 / 3);
  assert.equal(shares.Nubi, 10 / 3 - 1);
  assert.equal(shares.Gabriel, 10 / 3);
});

test('bulk selection preserves exceptions when confirmation is declined', () => {
  const rows = [item(10, people), item(5, ['Nubi'])];
  assert.equal(applyParticipants(rows, people, ['Sammy'], () => false), null);
  const updated = applyParticipants(rows, people, ['Sammy'], () => true);
  assert.deepEqual(updated.map(i => i.assignedTo), [['Sammy'], ['Sammy']]);
  assert.deepEqual(rows[1].assignedTo, ['Nubi']);
});

test('pair account explains purchases and payments in both directions, excluding third parties', () => {
  const bills = [
    { id: '1', date: '2026-10-01', title: 'Super', payer: 'Sammy', total: 300, shares: { Sammy: 100, Nubi: 100, Gabriel: 100 } },
    { id: '2', date: '2026-10-02', title: 'Cena', payer: 'Nubi', total: 80, shares: { Sammy: 40, Nubi: 40 } },
    { id: '3', payer: 'Gabriel', shares: { Sammy: 999, Nubi: 999 } }
  ];
  const payments = [{ from_person: 'Nubi', to_person: 'Sammy', amount: 30 }, { from_person: 'Sammy', to_person: 'Nubi', amount: 5 }];
  const account = pairAccount(bills, payments, 'Nubi', 'Sammy');
  assert.equal(account.purchasesOwed, 100);
  assert.equal(account.purchasesOffset, 40);
  assert.equal(account.paymentsSent, 30);
  assert.equal(account.paymentsReceived, 5);
  assert.equal(account.net, 35);
  assert.deepEqual(account.entries.map(e => e.amount), [100, -40, -30, 5]);
  assert.equal(pairAccount(bills, payments, 'Sammy', 'Nubi').net, -35);
  assert.equal(pairAccount([], [], 'Sammy', 'Nubi').net, 0);
});

test('local date does not roll into tomorrow at UTC midnight', () => {
  const date = new Date(2026, 9, 30, 23, 30);
  assert.equal(localDate(date), '2026-10-30');
});

test('display rounding reconciles half-cent offsets and decimal floating point ties', () => {
  assert.equal(displayCents(-0.125), -13);
  assert.equal(displayCents(0.875), 88);
  assert.equal(displayCents(1.005), 101);
  assert.equal(displayCents(-1.005), -101);
  assert.equal(displayCents(0.875) - (displayCents(1) + displayCents(-0.125)), 1);
});

test('draft restoration preserves unfinished input and rejects corrupt or obsolete drafts', () => {
  const draft = { version: 1, mode: 'import', items: [item('')], participants: people, raw: 'Pan,', fields: { payer: '', date: '2026-10-30', total: '' } };
  assert.deepEqual(restoreDraft(JSON.stringify(draft), people), draft);
  assert.equal(restoreDraft('{bad', people), null);
  assert.equal(restoreDraft('{"version":99}', people), null);
  assert.equal(restoreDraft(JSON.stringify({ ...draft, participants: ['Someone else'] }), people), null);
});
