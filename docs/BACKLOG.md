# Backlog

## P0: Validate the native deployment

Run the permitted/restricted-role matrix in SANDBOX.md, including denied IDs, subsidiaries, HTML/JSON delivery and controlled usage exhaustion. **Done when:** sanitized observed results identify the commit, account release/features and roles; failures are fixed and retested. Joe owns account testing.

## P1: Native search parity and paging

Validate every supported column/formula, implement supported account status/overdue mappings, and define stable pagination behavior beyond the inspected 200-record window. **Done when:** results reconcile with native searches on a declared dataset and concurrent changes have documented behavior.

## P1: Preset privacy

Namespace presets by account/deployment/user/role; add opt-out and clear-all controls. **Done when:** role/context switches cannot reveal another context's saved query text, including after migration.

## P2: Native diagnostics

Add redacted failure categories and correlation IDs for permission, schema, budget and unexpected errors. **Done when:** operators can distinguish controlled failures without logs containing record bodies, credentials or memo text.

## P2: Release engineering

Pin workflow actions to reviewed commits; add checked data contracts, broader accessibility/browser coverage, and a validated SDF package. Coordinate shared-module fixes with sibling tools. **Done when:** a fresh checkout reproduces the demo/deployment build and the release links actual sandbox evidence.
