# Graph Report - .  (2026-07-03)

## Corpus Check
- 41 files · ~308,071 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 67 nodes · 47 edges · 37 communities (7 shown, 30 thin omitted)
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `capture-core.ts (shared DOM serializer)` - 11 edges
2. `Chrome Extension` - 6 edges
3. `Figma Plugin` - 5 edges
4. `Offline Test Harness` - 4 edges
5. `Selective Rasterization (Gap #3)` - 4 edges
6. `html.to.design Parity Goal` - 4 edges
7. `Selective Rasterization Plan` - 4 edges
8. `Graphify Rules Configuration` - 4 edges
9. `HTML to Figma Project` - 3 edges
10. `Express Backend (in-memory store)` - 3 edges

## Surprising Connections (you probably didn't know these)
- `Extension Popup UI` --semantically_similar_to--> `Figma Plugin UI (capture list / import)`  [INFERRED] [semantically similar]
  extension/popup.html → figma-plugin/ui.html
- `figma-extension README` --conceptually_related_to--> `HTML to Figma Project`  [INFERRED]
  README.md → PROJECT_LOG.md
- `Figma Plugin UI (capture list / import)` --shares_data_with--> `Express Backend (in-memory store)`  [INFERRED]
  figma-plugin/ui.html → PROJECT_LOG.md
- `Test Harness Usage Guide` --references--> `capture-core.ts (shared DOM serializer)`  [EXTRACTED]
  test/README.md → PROJECT_LOG.md
- `Offline Test Harness` --references--> `Stripe Torture-Test Fixture`  [EXTRACTED]
  PROJECT_LOG.md → test/fixture/stripe.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Capture → Backend → Figma Import Pipeline** — project_log_chrome_extension, project_log_express_backend, project_log_figma_plugin, project_log_capture_core [EXTRACTED 1.00]
- **Offline Verification Loop (harness + fixture + preview)** — project_log_test_harness, test_fixture_stripe_torture_fixture, test_preview_capture_preview, test_readme_harness_usage [EXTRACTED 1.00]
- **html.to.design Gap Closure Strategy** — project_log_baked_line_breaks, project_log_full_affine_transforms, project_log_selective_rasterization, project_log_gap_4_font_embedding [EXTRACTED 1.00]
- **Graphify CLI Pipeline** — _agents_rules_graphify_knowledge_graph, _agents_rules_graphify_graphify_query, _agents_rules_graphify_graphify_update [INFERRED 0.85]

## Communities (37 total, 30 thin omitted)

### Community 0 - "DOM Capture Pipeline"
Cohesion: 0.33
Nodes (7): capture-core.ts (shared DOM serializer), Carousel Overflow Clipping (isClippedAway), Colour Filters Baked into Captured Colours, display:contents Hoisting, Ellipsis Truncation (textTruncation ENDING), Icon-Font Glyph Rasterization, Overflow-Clip Awareness (clipWindowFor/measureClipped)

### Community 1 - "Extension UI & Popup"
Cohesion: 0.40
Nodes (6): Extension Popup UI, Viewport Device Selector, Chrome Extension, Google Sheets → Data Table Capture, Multi-Viewport Capture, prepareDomForCapture (auto-scroll + force-reveal)

### Community 2 - "Figma Plugin & Backend"
Cohesion: 0.40
Nodes (6): Figma Plugin UI (capture list / import), CSS filter → Figma Effects Mapping, Express Backend (in-memory store), Figma Plugin, Full Affine Transforms incl. Skew, SVG Backgrounds as Native Vectors

### Community 3 - "Graphify Configuration"
Cohesion: 0.50
Nodes (5): Graphify Rules Configuration, Graphify Query Tool, Graphify Update Command, Knowledge Graph, Graphify Workflow

### Community 4 - "Test & Documentation"
Cohesion: 0.40
Nodes (5): HTML to Figma Project, Offline Test Harness, figma-extension README, Generated Capture Preview (preview.html), Test Harness Usage Guide

### Community 5 - "Selective Rasterization"
Cohesion: 0.60
Nodes (5): Selective Rasterization (Gap #3), captureVisibleTab Screenshot Pipeline, needsRasterization Detection, Selective Rasterization Plan, Stripe Torture-Test Fixture

### Community 6 - "Text & Font Rendering"
Cohesion: 1.00
Nodes (3): Baked Line Breaks (getWrappedText), Gap #4 — Custom Font Embedding, html.to.design Parity Goal

## Knowledge Gaps
- **34 isolated node(s):** `ElementStyle`, `CaptureNode`, `CapturePayload`, `RasterTarget`, `getRasterTargets` (+29 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `capture-core.ts (shared DOM serializer)` connect `DOM Capture Pipeline` to `Extension UI & Popup`, `Test & Documentation`, `Selective Rasterization`, `Text & Font Rendering`?**
  _High betweenness centrality (0.156) - this node is a cross-community bridge._
- **Why does `Chrome Extension` connect `Extension UI & Popup` to `DOM Capture Pipeline`, `Figma Plugin & Backend`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Why does `Express Backend (in-memory store)` connect `Figma Plugin & Backend` to `Extension UI & Popup`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **What connects `ElementStyle`, `CaptureNode`, `CapturePayload` to the rest of the system?**
  _44 weakly-connected nodes found - possible documentation gaps or missing edges._