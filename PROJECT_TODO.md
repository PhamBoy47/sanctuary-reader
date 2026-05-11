# Sanctuary Reader Project Todo

This checklist tracks the major project problems that need to be resolved before the app can be considered release-ready.

## P0 - Quality Gate

- [x] Add a `typecheck` script that runs `tsc --noEmit -p tsconfig.json`.
- [x] Add a single `check` script that runs typecheck, lint, tests, and build.
- [x] Use `npm run check` as the required local gate before merging changes.
- [x] Keep `npm run lint` clean with zero warnings.
- [x] Keep `npx tsc --noEmit -p tsconfig.json` clean with zero TypeScript diagnostics.

## P0 - Architecture Cleanup

- [x] Consolidate duplicate EPUB stores into one canonical store path.
- [x] Remove the unused or migrated EPUB store file after confirming imports.
- [x] Confirm PDF and EPUB viewers use consistent state-management patterns.
- [x] Document the chosen store structure in code comments or project docs.

## P0 - Core Test Coverage

- [x] Add a PDF open smoke test.
- [x] Add an EPUB open smoke test.
- [x] Add a recent-file restore test.
- [x] Add a reading-progress restore test.
- [ ] Add a PDF search test.
- [ ] Add an EPUB search test.
- [ ] Add bookmark add/remove tests.
- [ ] Add highlight add/remove tests.
- [x] Add annotation export tests for Markdown and CSV.
- [ ] Add a drag-and-drop file import test where feasible.

## P1 - PDF Runtime Validation

- [ ] Test large PDF rendering performance.
- [ ] Test image-heavy PDFs.
- [ ] Test PDFs with internal links.
- [ ] Test PDFs with form annotations.
- [ ] Test search result navigation accuracy.
- [ ] Test text selection and highlight placement across zoom levels.
- [ ] Test single-page, continuous, and two-page modes.
- [ ] Test rotation with annotations and search overlays.

## P1 - EPUB Runtime Validation

- [ ] Test long EPUB navigation.
- [ ] Test EPUB TOC navigation.
- [ ] Test EPUB search result navigation.
- [ ] Test EPUB highlights after reload.
- [ ] Test EPUB bookmarks after reload.
- [ ] Test theme switching across chapters.
- [ ] Test paginated and scrolling modes.
- [ ] Test EPUBs with relative images and CSS assets.

## P1 - Tauri Desktop Validation

- [ ] Run and verify `npm run desktop:dev`.
- [ ] Run and verify `npm run desktop:build`.
- [ ] Test native file open behavior.
- [ ] Test native drag-and-drop behavior.
- [ ] Test custom titlebar minimize, maximize, restore, and close.
- [ ] Test deep-link handling.
- [ ] Test tray behavior.
- [ ] Confirm desktop file permissions are scoped correctly.

## P1 - Local-First Compliance

- [x] Remove runtime dependency on external `unpkg.com` PDF font assets.
- [x] Remove runtime dependency on external `unpkg.com` PDF CMap assets.
- [x] Bundle required PDF standard fonts locally.
- [x] Bundle required PDF CMaps locally.
- [ ] Verify PDF and EPUB reading works offline.
- [ ] Document local-first behavior and any remaining exceptions.

## P2 - Performance

- [ ] Code-split `PdfViewer`.
- [ ] Code-split `EpubViewer`.
- [ ] Lazy-load `pdfjs-dist`.
- [ ] Lazy-load EPUB parsing code.
- [ ] Lazy-load dictionary tooling.
- [ ] Lazy-load annotation export tooling.
- [ ] Decide whether to finish or remove the PDF render worker path.
- [ ] If keeping the render worker, make it active and covered by smoke tests.
- [ ] Review the large Vite chunk warning and define an acceptable bundle budget.

## P2 - Product Polish

- [ ] Add clear error states for corrupt PDFs.
- [ ] Add clear error states for corrupt EPUBs.
- [ ] Add unsupported-file messaging.
- [ ] Add annotation search or filtering.
- [ ] Add per-document reader settings.
- [ ] Restore session state per document: page, zoom, theme, layout, and sidebar.
- [ ] Improve keyboard shortcut consistency between PDF and EPUB.
- [ ] Verify responsive layout on mobile and tablet sizes.

## Current Baseline Checks

- [x] `npm run lint` passes.
- [x] `npx tsc --noEmit -p tsconfig.json` passes.
- [x] `npm run build` passes.
- [x] `npm run test` passes.
- [x] `npm run check` passes.
- [x] `npm run test:e2e` passes.
