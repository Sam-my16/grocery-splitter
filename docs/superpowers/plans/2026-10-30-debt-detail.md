# Debt detail implementation plan

**Goal:** Show each pending purchase as title (or date) and remaining amount.
**Architecture:** Preserve pairAccount's net; allocate the positive balance to newest purchases, thereby offsetting oldest purchases first. Reconcile displayed cents against the total. Render only the resulting rows.
**Tech Stack:** JavaScript modules, Node tests, Playwright.
**Spec:** ../specs/2026-10-30-debt-detail-design.md

## Constraints and review focus
Preserve existing balances and saved data. Titles take precedence over dates, including safe rendering of HTML-like titles. Cover reverse payments, overpayments, fractional shares, stable ordering and fully paid purchases.

## Task 1: Pending amounts and display
- [x] Add failing core tests for the $6,000 example, FIFO offsets, both directions, overpayments, zero balances, cent reconciliation and same-date ordering.
- [x] Add/update browser tests for title/date labels, removal of summary/history, partial and complete payment.
- [x] Extend pairAccount with pending entries (amount in displayed currency units); simplify renderDebtDetail.
- [x] Run npm test and npm run test:ui; require all tests to pass.
- [x] Bump app and service-worker cache versions; review diff, commit and publish; verify deployment.

## Execution decisions
Proceed inline with the user's clarified display requirement; no additional design or execution-method confirmation is needed. The work is authorized by the continuation request.

Validation: 13 Node tests and 14 Playwright tests passed (desktop/mobile). Publication follows the authorized continuation request.
