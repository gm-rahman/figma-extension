# Graph Report - .  (2026-07-15)

## Corpus Check
- Corpus is ~33,691 words - fits in a single context window. You may not need a graph.

## Summary
- 342 nodes · 544 edges · 21 communities (20 shown, 1 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.7)
- Token cost: 75,519 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Figma Node Builder|Figma Node Builder]]
- [[_COMMUNITY_DOM Capture Core|DOM Capture Core]]
- [[_COMMUNITY_Element Picker & Content Script|Element Picker & Content Script]]
- [[_COMMUNITY_Capture Types & Plugin UI|Capture Types & Plugin UI]]
- [[_COMMUNITY_Background Worker & Image Capture|Background Worker & Image Capture]]
- [[_COMMUNITY_Backend Dependencies|Backend Dependencies]]
- [[_COMMUNITY_Color Filter Transforms|Color Filter Transforms]]
- [[_COMMUNITY_Docs & Project Concepts|Docs & Project Concepts]]
- [[_COMMUNITY_Extension Popup Logic|Extension Popup Logic]]
- [[_COMMUNITY_Extension TS Config|Extension TS Config]]
- [[_COMMUNITY_Chrome Extension Manifest|Chrome Extension Manifest]]
- [[_COMMUNITY_Plugin TS Config|Plugin TS Config]]
- [[_COMMUNITY_Root Package Scripts|Root Package Scripts]]
- [[_COMMUNITY_Figma Plugin Manifest|Figma Plugin Manifest]]
- [[_COMMUNITY_Figma Plugin Package|Figma Plugin Package]]
- [[_COMMUNITY_Vite Package Config|Vite Package Config]]
- [[_COMMUNITY_Backend TS Config|Backend TS Config]]
- [[_COMMUNITY_Backend Server Entry|Backend Server Entry]]
- [[_COMMUNITY_Plugin Build Script|Plugin Build Script]]
- [[_COMMUNITY_Main Sync Script|Main Sync Script]]

## God Nodes (most connected - your core abstractions)
1. `serializeElement()` - 29 edges
2. `buildNode()` - 23 edges
3. `compilerOptions` - 10 edges
4. `buildColorXform()` - 10 edges
5. `compilerOptions` - 10 edges
6. `getStyleFromComputed()` - 8 edges
7. `makeLeafTextChild()` - 8 edges
8. `captureMulti()` - 7 edges
9. `trySheetCapture()` - 7 edges
10. `captureAndSend()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Extension popup UI` --semantically_similar_to--> `Figma plugin UI panel`  [INFERRED] [semantically similar]
  extension/popup.html → figma-plugin/ui.html
- `typecheck.yml CI gate` --references--> `Chrome extension (DOM capturer)`  [INFERRED]
  docs/superpowers/specs/2026-07-05-phase0-typecheck-gate-design.md → README.md
- `Extension popup UI` --conceptually_related_to--> `Chrome extension (DOM capturer)`  [INFERRED]
  extension/popup.html → README.md
- `RTK (Rust Token Killer)` --conceptually_related_to--> `Branch Restructure Implementation Plan`  [INFERRED]
  CLAUDE.md → docs/superpowers/plans/2026-07-05-branch-restructure.md
- `Runnable core (main branch)` --references--> `Chrome extension (DOM capturer)`  [INFERRED]
  docs/superpowers/specs/2026-07-05-branch-restructure-design.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **HTML-to-Figma capture pipeline** — readme_extension, readme_backend, readme_figma_plugin, readme_capture_flow, readme_html_to_figma [EXTRACTED 0.95]
- **Branch restructure effort (main=core, development=everything)** — docs_superpowers_plans_2026_07_05_branch_restructure_plan, docs_superpowers_specs_2026_07_05_branch_restructure_design_spec, docs_superpowers_specs_2026_07_05_phase0_typecheck_gate_design_spec, docs_superpowers_specs_2026_07_05_branch_restructure_design_runnable_core [INFERRED 0.85]

## Communities (21 total, 1 thin omitted)

### Community 0 - "Figma Node Builder"
Cohesion: 0.08
Nodes (50): applyAutoLayout(), applyBorderStroke(), applyCornerRadii(), applyPerChildExtras(), applyTransform(), buildFigmaNodes(), buildMultiViewport(), buildNode() (+42 more)

### Community 1 - "DOM Capture Core"
Cohesion: 0.09
Nodes (47): ancestorVisibleFraction(), appendChildNodes(), attachPseudos(), capturePseudo(), classifyElement(), clipWindowFor(), ColorXform, countLines() (+39 more)

### Community 2 - "Element Picker & Content Script"
Cohesion: 0.14
Nodes (29): buildPayload(), getRasterTargets(), captureAndSend(), cleanupRasterTags(), createOverlay(), onEscape(), onMouseOver(), onPickerClick() (+21 more)

### Community 3 - "Capture Types & Plugin UI"
Cohesion: 0.15
Nodes (20): CaptureNode, CapturePayload, CaptureSummary, ElementStyle, FontSubstitution, FrameImport, PluginMessage, UIToPlugin (+12 more)

### Community 4 - "Background Worker & Image Capture"
Cohesion: 0.18
Nodes (19): attachedTabs, bytesToBase64(), captureElement(), captureMulti(), collectImageUrls(), cropDataUrl(), dbgAttach(), dbgDetach() (+11 more)

### Community 5 - "Backend Dependencies"
Cohesion: 0.12
Nodes (16): dependencies, cors, express, uuid, devDependencies, tsx, @types/cors, @types/express (+8 more)

### Community 6 - "Color Filter Transforms"
Cohesion: 0.18
Nodes (14): applyXformToStyle(), brightness(), buildColorXform(), COLOR_FNS, composeXform(), contrast(), hueRotate(), invert() (+6 more)

### Community 7 - "Docs & Project Concepts"
Cohesion: 0.21
Nodes (15): RTK (Rust Token Killer), Branch Restructure Implementation Plan, Runnable core (main branch), Branch Restructure Design Spec, sync-main-from-dev.sh script, typecheck.yml CI gate, Phase 0 Type-check Gate Spec, Extension popup UI (+7 more)

### Community 8 - "Extension Popup Logic"
Cohesion: 0.13
Nodes (6): btnCapture, btnSelect, DEVICES, devicesEl, selected, statusEl

### Community 9 - "Extension TS Config"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, lib, module, outDir, resolveJsonModule, rootDir, skipLibCheck (+4 more)

### Community 10 - "Chrome Extension Manifest"
Cohesion: 0.15
Nodes (12): action, default_popup, background, service_worker, type, content_scripts, description, host_permissions (+4 more)

### Community 11 - "Plugin TS Config"
Cohesion: 0.17
Nodes (11): compilerOptions, esModuleInterop, lib, module, moduleResolution, outDir, skipLibCheck, strict (+3 more)

### Community 12 - "Root Package Scripts"
Cohesion: 0.17
Nodes (11): description, devDependencies, concurrently, name, private, scripts, build, dev (+3 more)

### Community 13 - "Figma Plugin Manifest"
Cohesion: 0.20
Nodes (9): api, editorType, id, main, name, networkAccess, allowedDomains, devAllowedDomains (+1 more)

### Community 14 - "Figma Plugin Package"
Cohesion: 0.20
Nodes (9): devDependencies, esbuild, @figma/plugin-typings, typescript, name, scripts, build, dev (+1 more)

### Community 15 - "Vite Package Config"
Cohesion: 0.22
Nodes (8): devDependencies, typescript, vite, name, scripts, build, dev, version

### Community 16 - "Backend TS Config"
Cohesion: 0.22
Nodes (8): compilerOptions, lib, module, moduleResolution, skipLibCheck, strict, target, include

### Community 17 - "Backend Server Entry"
Cohesion: 0.33
Nodes (5): app, captures, CaptureNode, CapturePayload, ElementStyle

### Community 18 - "Plugin Build Script"
Cohesion: 0.33
Nodes (5): { execSync }, fs, output, uiHtml, uiJs

## Knowledge Gaps
- **125 isolated node(s):** `name`, `version`, `dev`, `build`, `start` (+120 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `prepareDomForCapture()` connect `Element Picker & Content Script` to `Background Worker & Image Capture`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `sleep()` connect `Background Worker & Image Capture` to `Element Picker & Content Script`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `buildColorXform()` connect `Color Filter Transforms` to `DOM Capture Core`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `name`, `version`, `dev` to the rest of the system?**
  _125 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Figma Node Builder` be split into smaller, more focused modules?**
  _Cohesion score 0.0784313725490196 - nodes in this community are weakly interconnected._
- **Should `DOM Capture Core` be split into smaller, more focused modules?**
  _Cohesion score 0.09485815602836879 - nodes in this community are weakly interconnected._
- **Should `Element Picker & Content Script` be split into smaller, more focused modules?**
  _Cohesion score 0.1350806451612903 - nodes in this community are weakly interconnected._