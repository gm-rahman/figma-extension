# Graph Report - newProject  (2026-07-03)

## Corpus Check
- 38 files · ~308,508 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 479 nodes · 631 edges · 57 communities (26 shown, 31 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.63)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b78736a7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_DOM Capture Pipeline|DOM Capture Pipeline]]
- [[_COMMUNITY_Extension UI & Popup|Extension UI & Popup]]
- [[_COMMUNITY_Figma Plugin & Backend|Figma Plugin & Backend]]
- [[_COMMUNITY_Graphify Configuration|Graphify Configuration]]
- [[_COMMUNITY_Test & Documentation|Test & Documentation]]
- [[_COMMUNITY_Selective Rasterization|Selective Rasterization]]
- [[_COMMUNITY_Text & Font Rendering|Text & Font Rendering]]
- [[_COMMUNITY_Backend CaptureNode|Backend CaptureNode]]
- [[_COMMUNITY_Backend CapturePayload|Backend CapturePayload]]
- [[_COMMUNITY_Backend ElementStyle|Backend ElementStyle]]
- [[_COMMUNITY_Capture BuildPayload|Capture BuildPayload]]
- [[_COMMUNITY_Raster Target Detection|Raster Target Detection]]
- [[_COMMUNITY_RasterTarget Type|RasterTarget Type]]
- [[_COMMUNITY_Color XForm Apply|Color XForm Apply]]
- [[_COMMUNITY_Color XForm Build|Color XForm Build]]
- [[_COMMUNITY_Color XForm Compose|Color XForm Compose]]
- [[_COMMUNITY_Color Filter Check|Color Filter Check]]
- [[_COMMUNITY_Sheet Payload Builder|Sheet Payload Builder]]
- [[_COMMUNITY_Google Sheet Detection|Google Sheet Detection]]
- [[_COMMUNITY_CSV Parser|CSV Parser]]
- [[_COMMUNITY_Sheet ID Extraction|Sheet ID Extraction]]
- [[_COMMUNITY_Extension CaptureNode|Extension CaptureNode]]
- [[_COMMUNITY_Extension CapturePayload|Extension CapturePayload]]
- [[_COMMUNITY_Capture Phase Enum|Capture Phase Enum]]
- [[_COMMUNITY_Capture Progress|Capture Progress]]
- [[_COMMUNITY_Extension ElementStyle|Extension ElementStyle]]
- [[_COMMUNITY_Content Message Out|Content Message Out]]
- [[_COMMUNITY_Content Message In|Content Message In]]
- [[_COMMUNITY_Viewport Spec Type|Viewport Spec Type]]
- [[_COMMUNITY_Figma CaptureNode|Figma CaptureNode]]
- [[_COMMUNITY_Figma CapturePayload|Figma CapturePayload]]
- [[_COMMUNITY_Capture Summary|Capture Summary]]
- [[_COMMUNITY_Figma ElementStyle|Figma ElementStyle]]
- [[_COMMUNITY_Font Substitution|Font Substitution]]
- [[_COMMUNITY_Frame Import Type|Frame Import Type]]
- [[_COMMUNITY_Plugin Message Type|Plugin Message Type]]
- [[_COMMUNITY_UI-to-Plugin Message|UI-to-Plugin Message]]
- [[_COMMUNITY_Carousel Overflow Clipping (isClippedAway)|Carousel Overflow Clipping (isClippedAway)]]
- [[_COMMUNITY_Colour Filters Baked into Captured Colours|Colour Filters Baked into Captured Colours]]
- [[_COMMUNITY_displaycontents Hoisting|display:contents Hoisting]]
- [[_COMMUNITY_Ellipsis Truncation (textTruncation ENDING)|Ellipsis Truncation (textTruncation ENDING)]]
- [[_COMMUNITY_Full Affine Transforms incl. Skew|Full Affine Transforms incl. Skew]]
- [[_COMMUNITY_Gap 4 — Custom Font Embedding|Gap #4 — Custom Font Embedding]]
- [[_COMMUNITY_Google Sheets → Data Table Capture|Google Sheets → Data Table Capture]]
- [[_COMMUNITY_html.to.design Parity Goal|html.to.design Parity Goal]]
- [[_COMMUNITY_HTML to Figma Project|HTML to Figma Project]]
- [[_COMMUNITY_Icon-Font Glyph Rasterization|Icon-Font Glyph Rasterization]]
- [[_COMMUNITY_Overflow-Clip Awareness (clipWindowFormeasureClipped)|Overflow-Clip Awareness (clipWindowFor/measureClipped)]]
- [[_COMMUNITY_prepareDomForCapture (auto-scroll + force-reveal)|prepareDomForCapture (auto-scroll + force-reveal)]]
- [[_COMMUNITY_Selective Rasterization (Gap 3)|Selective Rasterization (Gap #3)]]
- [[_COMMUNITY_SVG Backgrounds as Native Vectors|SVG Backgrounds as Native Vectors]]
- [[_COMMUNITY_Offline Test Harness|Offline Test Harness]]
- [[_COMMUNITY_captureVisibleTab Screenshot Pipeline|captureVisibleTab Screenshot Pipeline]]
- [[_COMMUNITY_Selective Rasterization Plan|Selective Rasterization Plan]]
- [[_COMMUNITY_Generated Capture Preview (preview.html)|Generated Capture Preview (preview.html)]]
- [[_COMMUNITY_Test Harness Usage Guide|Test Harness Usage Guide]]

## God Nodes (most connected - your core abstractions)
1. `3. Implemented — full history` - 35 edges
2. `serializeElement()` - 29 edges
3. `buildNode()` - 15 edges
4. `Plan — Selective Rasterization (Gap #3)` - 11 edges
5. `compilerOptions` - 10 edges
6. `buildColorXform()` - 10 edges
7. `compilerOptions` - 10 edges
8. `makeLeafTextChild()` - 8 edges
9. `scripts` - 8 edges
10. `HTML → Figma — Project Log` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Extension Popup UI` --semantically_similar_to--> `Figma Plugin UI (capture list / import)`  [INFERRED] [semantically similar]
  extension/popup.html → figma-plugin/ui.html
- `collectImageUrls()` --calls--> `walk()`  [INFERRED]
  extension/src/background.ts → test/run-capture.mjs
- `Figma Plugin UI (capture list / import)` --shares_data_with--> `Express Backend (in-memory store)`  [INFERRED]
  figma-plugin/ui.html → PROJECT_LOG.md
- `Viewport Device Selector` --implements--> `Multi-Viewport Capture`  [INFERRED]
  extension/popup.html → PROJECT_LOG.md
- `Stripe Torture-Test Fixture` --conceptually_related_to--> `needsRasterization Detection`  [INFERRED]
  test/fixture/stripe.html → RASTERIZATION_PLAN.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Capture → Backend → Figma Import Pipeline** — project_log_chrome_extension, project_log_express_backend, project_log_figma_plugin, project_log_capture_core [EXTRACTED 1.00]
- **Offline Verification Loop (harness + fixture + preview)** — project_log_test_harness, test_fixture_stripe_torture_fixture, test_preview_capture_preview, test_readme_harness_usage [EXTRACTED 1.00]
- **html.to.design Gap Closure Strategy** — project_log_baked_line_breaks, project_log_full_affine_transforms, project_log_selective_rasterization, project_log_gap_4_font_embedding [EXTRACTED 1.00]
- **Graphify CLI Pipeline** — _agents_rules_graphify_knowledge_graph, _agents_rules_graphify_graphify_query, _agents_rules_graphify_graphify_update [INFERRED 0.85]

## Communities (57 total, 31 thin omitted)

### Community 1 - "Extension UI & Popup"
Cohesion: 0.29
Nodes (7): Extension Popup UI, Viewport Device Selector, Figma Plugin UI (capture list / import), Chrome Extension, Express Backend (in-memory store), Figma Plugin, Multi-Viewport Capture

### Community 7 - "Backend CaptureNode"
Cohesion: 0.33
Nodes (5): app, captures, CaptureNode, CapturePayload, ElementStyle

### Community 8 - "Backend CapturePayload"
Cohesion: 0.06
Nodes (35): 3. Implemented — full history, Foundations (early sessions), Gap #3 — Selective rasterization (all 4 steps complete), Phase 0 — Test harness, Phase 1 — Pseudo-elements (`::before` / `::after`), Phase 2 — Web fonts, Phase 3 — Inline-row text width, Phase 4 — Input-with-icon (+27 more)

### Community 9 - "Backend ElementStyle"
Cohesion: 0.09
Nodes (21): COMPARE_FIELDS, COMPARE_STYLE_FIELDS, consoleErrors, coreEntry, diffNodeList(), diffPayloads(), __dirname, explicitUrl (+13 more)

### Community 10 - "Capture BuildPayload"
Cohesion: 0.14
Nodes (29): buildPayload(), getRasterTargets(), captureAndSend(), cleanupRasterTags(), createOverlay(), onEscape(), onMouseOver(), onPickerClick() (+21 more)

### Community 11 - "Raster Target Detection"
Cohesion: 0.19
Nodes (18): bytesToBase64(), captureElement(), captureMulti(), collectImageUrls(), cropDataUrl(), dbgAttach(), dbgDetach(), dbgSend() (+10 more)

### Community 12 - "RasterTarget Type"
Cohesion: 0.10
Nodes (46): ancestorVisibleFraction(), appendChildNodes(), attachPseudos(), capturePseudo(), classifyElement(), clipWindowFor(), ColorXform, countLines() (+38 more)

### Community 13 - "Color XForm Apply"
Cohesion: 0.19
Nodes (13): applyXformToStyle(), brightness(), buildColorXform(), COLOR_FNS, contrast(), hueRotate(), invert(), parseAmount() (+5 more)

### Community 14 - "Color XForm Build"
Cohesion: 0.13
Nodes (18): backdropNodes, bgImageMissed, counts, __dirname, firstFamily(), flexInfo(), fontFamilies, gradientInfo() (+10 more)

### Community 15 - "Color XForm Compose"
Cohesion: 0.12
Nodes (16): dependencies, cors, express, uuid, devDependencies, tsx, @types/cors, @types/express (+8 more)

### Community 16 - "Color Filter Check"
Cohesion: 0.12
Nodes (16): 1. Architecture overview, 2. The test harness (how we verify WITHOUT Figma), 4. Current status, 5. Known limitations, 6. TODO / future work, 7. Reference docs in repo, Build commands, Capture fidelity (+8 more)

### Community 17 - "Sheet Payload Builder"
Cohesion: 0.13
Nodes (6): btnCapture, btnSelect, DEVICES, devicesEl, selected, statusEl

### Community 18 - "Google Sheet Detection"
Cohesion: 0.13
Nodes (14): devDependencies, esbuild, playwright, name, private, scripts, analyze, capture (+6 more)

### Community 19 - "CSV Parser"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, lib, module, outDir, resolveJsonModule, rootDir, skipLibCheck (+4 more)

### Community 20 - "Sheet ID Extraction"
Cohesion: 0.15
Nodes (12): action, default_popup, background, service_worker, type, content_scripts, description, host_permissions (+4 more)

### Community 21 - "Extension CaptureNode"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, lib, module, moduleResolution, outDir, skipLibCheck, strict (+3 more)

### Community 22 - "Extension CapturePayload"
Cohesion: 0.17
Nodes (11): Build order (each step verified by the harness before moving on), Capture pipeline (the screenshot), Data model changes, Explicitly NOT in this phase, Fixture additions (to prove it), Goal, Offline test harness (verify WITHOUT Chrome), Plan — Selective Rasterization (Gap #3) (+3 more)

### Community 23 - "Capture Phase Enum"
Cohesion: 0.20
Nodes (9): api, editorType, id, main, name, networkAccess, allowedDomains, devAllowedDomains (+1 more)

### Community 24 - "Capture Progress"
Cohesion: 0.20
Nodes (9): devDependencies, esbuild, @figma/plugin-typings, typescript, name, scripts, build, dev (+1 more)

### Community 25 - "Extension ElementStyle"
Cohesion: 0.22
Nodes (8): devDependencies, typescript, vite, name, scripts, build, dev, version

### Community 26 - "Content Message Out"
Cohesion: 0.22
Nodes (8): compilerOptions, lib, module, moduleResolution, skipLibCheck, strict, target, include

### Community 27 - "Content Message In"
Cohesion: 0.31
Nodes (8): __dirname, esc(), inner, outPath, payload, renderNode(), sortByZIndex(), styleFromNode()

### Community 28 - "Viewport Spec Type"
Cohesion: 0.33
Nodes (5): { execSync }, fs, output, uiHtml, uiJs

### Community 29 - "Figma CaptureNode"
Cohesion: 0.06
Nodes (58): applyAutoLayout(), applyCornerRadii(), applyTransform(), buildFigmaNodes(), buildMultiViewport(), buildNode(), CLIP_VALUES, CornerNode (+50 more)

### Community 30 - "Figma CapturePayload"
Cohesion: 0.33
Nodes (5): Capture test harness, Commands, Custom URL / viewport, Quick start, Workflow

## Knowledge Gaps
- **232 isolated node(s):** `name`, `version`, `dev`, `build`, `start` (+227 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `prepareDomForCapture()` connect `Capture BuildPayload` to `Raster Target Detection`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `sleep()` connect `Raster Target Detection` to `Capture BuildPayload`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `collectImageUrls()` connect `Raster Target Detection` to `Backend ElementStyle`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `name`, `version`, `dev` to the rest of the system?**
  _250 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Backend CapturePayload` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._
- **Should `Backend ElementStyle` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Capture BuildPayload` be split into smaller, more focused modules?**
  _Cohesion score 0.1350806451612903 - nodes in this community are weakly interconnected._