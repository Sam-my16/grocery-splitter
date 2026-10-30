# Make Cuentas Claras easier to use

Approved scope: quick expenses and CSV imports, purchase-wide participants with item exceptions,
editable items, local draft recovery, shared validation, and explanations of all-time pair debts.
Keep the Spanish UI, static hosting, equal splitting, and existing bills/settlements schema.

## Deliverables

1. Pure purchase rules: robust CSV parsing, validation, share calculation, participant replacement,
   local dates and draft validation. Unit tests cover errors, fractional shares and both debt directions.
2. Purchase UI: quick/import entry, mobile item cards, bulk assignment confirmation, per-person
   preview, draft restoration/discard, explicit payer selection and guarded saving.
3. History and balances: reuse item editor/validation, safely render titles, explain purchases and
   payments in both directions, report mutation errors, fix the export header.
4. Verify desktop/mobile interactions using isolated Supabase fixtures, update PWA assets and docs.

## Decisions

- No new backend, AI service or database migration. Household access control remains separate.
- Preserve unrounded equal shares for historical compatibility. Display two decimals and identify
   any rounding adjustment in the brief debt summary.
- Validate amounts to two decimals, accepting decimal comma or point. Negative item rows allow
   explicit receipt discounts; the final purchase total must be positive.
- One local draft stores both entry-mode inputs so switching modes does not erase work. Saving
   submits the active mode and clears the draft. Initial category stays Supermercado.
- Test tooling is development-only. No build step is needed for publishing the app.

## Acceptance checks

Quick expenses, fenced/headerless/quoted CSV, malformed prices, item edits and deletions, bulk
exceptions, reload/discard, failed/repeated saves, mismatched totals, keyboard controls, narrow
screens, both directions of debts/payments, zero/fractional balances, history editing and export.
