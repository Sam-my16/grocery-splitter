# Cuentas Claras — shared grocery bill splitter

A mobile-first web app (installable as a PWA) that a three-person household uses to split
shared purchases item by item and keep a running, explainable balance of who owes whom.

**Live:** <https://sam-my16.github.io/grocery-splitter/> · **UI language:** Spanish ·
**Stack:** vanilla HTML/CSS/JS, Supabase (Postgres + anonymous auth), GitHub Pages

> Built with AI-assisted development: I defined the product, wrote the specs, made the design
> decisions and reviewed/tested each iteration; [Claude Code](https://claude.com/claude-code)
> wrote most of the implementation. See [How it was built](#how-it-was-built).

---

## The problem

Splitting a supermarket receipt evenly is unfair when not everyone uses every item, and
splitting it by hand is tedious. Existing apps split *totals*, not *items*, and their
balances become opaque after a few months of purchases and partial payments.

## What it does

- **Item-level splitting.** Import a receipt as CSV, set the default participants for the
  whole purchase, then mark exceptions per item. Shares are computed per item and summed.
- **Receipt → CSV via an LLM.** The app doesn't do OCR itself; a *Copy prompt* button gives a
  ready-made prompt for any multimodal model to turn a receipt photo into the expected CSV.
  The parser is tolerant of what models actually output (fenced code blocks, Spanish/English
  headers, missing header row, quoted names, decimal comma).
- **Quick expenses** for one-off costs that don't need an item list.
- **Explainable balances.** For each pair of people, *Ver detalle* lists the specific
  purchases that make up the outstanding debt, after netting purchases in both directions
  and recorded payments.
- **Settlements without losing history.** *Mark as paid* records a transfer instead of
  deleting bills; it can be undone.
- **History** grouped by month, editable after the fact, exportable to CSV; monthly spend by
  category.
- **Draft recovery**: unfinished entries survive reloads (local only).
- Light/dark theme, works offline as an installed app (data operations still need a connection).

## Technical highlights

**Money correctness.** All validation goes through one pure module
([`js/core.js`](js/core.js)) shared by new purchases, history edits and tests:

- Amounts accept at most two decimals; a purchase is rejected unless the item prices sum
  to the receipt total **in integer cents**, avoiding floating-point false mismatches.
- Equal shares are stored unrounded (for backward compatibility with existing data) and only
  rounded at display time.

**Explaining a net balance.** A pairwise balance is a single number, but users want to know
*which purchases* it corresponds to. `pairAccount` attributes the net debt to the newest
purchases, treating payments and reverse purchases as offsetting the oldest ones first
(FIFO). Two details mattered:

- *Rounding reconciliation:* each row's displayed amount is the difference between rounded
  running totals, so the rows always add up exactly to the displayed balance, even with
  shares like $1000/3.
- *No invented attributions:* if an overpayment creates debt that no purchase explains, it's
  shown as a separate "Saldo por pagos" line instead of being pinned on a bill.

Ties on the same date are broken by ID, so the breakdown doesn't depend on database
response order.

**Zero-build architecture.** No framework, no bundler: ES modules served statically by GitHub
Pages, a service worker for installability, cache-busted asset URLs to avoid stale mobile
caches. Supabase provides shared state across devices with anonymous sign-in, so housemates
don't need accounts.

**Testing.** 13 unit tests (`node:test`) cover the money and balance rules — malformed CSVs,
fractional shares, half-cent ties, both debt directions, excess payments, corrupted drafts.
7 Playwright end-to-end tests run on desktop and mobile viewports against a **mocked
Supabase**, covering failed and repeated saves, keyboard-only assignment, unavailable
`localStorage` and safe rendering of user-provided titles.

## How it was built

The project was developed over ~2 months (Sep–Oct 2026) iteratively with Claude Code, driven by
real usage feedback from the household. My role was product owner and reviewer:

- **Specifying behavior.** Each larger change started as a written spec with scope, decisions
  and acceptance checks — e.g. [`docs/ease-of-use-plan.md`](docs/ease-of-use-plan.md) and the
  [debt-detail design](docs/superpowers/specs/2026-10-30-debt-detail-design.md), which works
  through alternatives (showing original shares vs. linking payments to bills vs. FIFO
  offsetting) before committing to one.
- **Making the calls.** e.g. migrating from Firebase to Supabase early on; keeping
  settlements as records instead of deleting history; preserving the existing data schema
  instead of migrating it; no backend or AI service in the app itself.
- **Catching bugs from real use** and turning them into fixes and regression tests —
  inflated debts when a query failed, payments not collapsing in the balance view, clock skew
  on phones breaking anonymous auth (now surfaced as a friendly message).
- **Design.** The visual redesign was prototyped with Claude Design and then applied to the app.

What I took away: the leverage of AI coding comes from precise specs and acceptance criteria,
and the bugs that matter only show up with real users and real data — so tests around the
core invariants (totals match, balances reconcile) were the most valuable part.

## Known limitations

- **Access control is minimal by design.** Row Level Security allows any authenticated
  (including anonymous) session to read and write. This is acceptable for a private app shared
  by three trusted people, but anyone with the URL could access the data; per-household access
  control is the next step before any wider use.
- Splits are equal among the people sharing an item (no weights).
- Drafts are stored per device and not synced.

## Running it

No build step — serve the repository root with any static server.

```bash
npm install
npm test          # unit tests
npm run test:ui   # Playwright E2E (local server on :4173, mocked Supabase)
```

<details>
<summary><b>Deploying your own instance</b></summary>

1. Create a [Supabase](https://supabase.com/) project (free tier is enough) and enable
   **Authentication → Anonymous Sign-Ins**.
2. Run [`supabase.sql`](supabase.sql) in the SQL editor to create the `bills` and
   `settlements` tables and their RLS policies.
3. Put the project URL and anon key in [`js/supabase-config.js`](js/supabase-config.js)
   (the anon key is public by design; access is governed by RLS). Edit the `PEOPLE` array
   there to set the household members.
4. Enable GitHub Pages (**Settings → Pages → Deploy from branch `main` / root**).
5. On a phone, use *Add to Home Screen* (iOS) or *Install app* (Android).

If the app reports a connection or date error, check that the device clock is set
automatically — Supabase's anonymous auth tokens are time-sensitive.

**CSV format:** two columns, item name and final price (discounts applied, no currency
symbol or thousands separator). Header names are flexible (`item`/`producto`,
`price`/`precio`); the header row is optional.

</details>
