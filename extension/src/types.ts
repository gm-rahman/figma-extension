export interface ElementStyle {
  // Backgrounds
  backgroundColor: string;
  backgroundImage: string;
  backgroundImageUrl?: string;
  // Text
  color: string;
  fontSize: string;
  fontFamily: string;
  fontWeight: string;
  textAlign: string;
  lineHeight: string;
  letterSpacing: string;
  // Box model
  borderRadius: string;
  borderTopLeftRadius: string;
  borderTopRightRadius: string;
  borderBottomRightRadius: string;
  borderBottomLeftRadius: string;
  borderColor: string;
  borderWidth: string;
  borderStyle: string;
  /** Per-side border-style shorthand split (`1px solid rgb(...) 2px dashed ...`). */
  borderTopStyle?: string; borderRightStyle?: string; borderBottomStyle?: string; borderLeftStyle?: string;
  /** Per-side border-width. */
  borderTopWidth?: string; borderRightWidth?: string; borderBottomWidth?: string; borderLeftWidth?: string;
  /** Per-side border-color. */
  borderTopColor?: string; borderRightColor?: string; borderBottomColor?: string; borderLeftColor?: string;
  /** CSS4 logical-property borders (`border-block-*` / `border-inline-*`).
   *  Resolve to the physical side based on `writing-mode`/`direction` when
   *  not redundantly captured above. */
  borderBlockStartStyle?: string; borderBlockStartWidth?: string; borderBlockStartColor?: string;
  borderBlockEndStyle?: string; borderBlockEndWidth?: string; borderBlockEndColor?: string;
  borderInlineStartStyle?: string; borderInlineStartWidth?: string; borderInlineStartColor?: string;
  borderInlineEndStyle?: string; borderInlineEndWidth?: string; borderInlineEndColor?: string;
  /** CSS4 logical `border-radius` (start/end per writing mode). */
  borderStartStartRadius?: string; borderStartEndRadius?: string;
  borderEndStartRadius?: string; borderEndEndRadius?: string;
  /** CSS `border-image-*` source/slice/width/repeat/outset. Rasterised
   *  borders cannot be reproduced in Figma without materialising the
   *  source image, so we keep them as metadata. */
  borderImageSource?: string; borderImageSlice?: string; borderImageWidth?: string;
  borderImageRepeat?: string; borderImageOutset?: string;
  /** CSS `corner-shape` per corner (CSS4 — `round | squircle | bevel | scoop |
   *  notch | superellipse(...)`). Figma currently only knows ROUND; we keep
   *  the value as metadata so designers can see the declared intent. */
  cornerTopLeftShape?: string; cornerTopRightShape?: string;
  cornerBottomRightShape?: string; cornerBottomLeftShape?: string;
  /** CSS `animation-*` longhands. CSS animations are time-based and not
   *  reproducible in Figma; we record them for inspection only. */
  animationName?: string; animationDuration?: string; animationTimingFunction?: string;
  animationIterationCount?: string; animationDelay?: string; animationDirection?: string;
  animationFillMode?: string; animationPlayState?: string;
  /** CSS `font-stretch` (variable-font width axis). */
  fontStretch?: string;
  /** CSS `font-variant` shorthand + per-longhand. */
  fontVariant?: string;
  fontVariantCaps?: string; fontVariantNumeric?: string; fontVariantLigatures?: string;
  /** CSS `column-rule-*` shorthand split. */
  columnRuleStyle?: string; columnRuleWidth?: string; columnRuleColor?: string;
  /** SVG `fill` / `stroke` colours. Captured from inline SVG nodes so
   *  theming details survive the round-trip into Figma vector layers. */
  fill?: string;
  stroke?: string; strokeWidth?: string; strokeDasharray?: string;
  strokeLinecap?: string; strokeLinejoin?: string;
  /** SVG `clip-rule` / `fill-rule` / `flood-color` for completeness. */
  fillRule?: string;
  /** CSS `appearance` (none | auto | <compat-auto>). Drives native form-control
   *  chrome — kept as metadata since Figma has no native form-control rendering. */
  appearance?: string;
  /** CSS `backface-visibility` (visible | hidden). Has 3D-transform implications. */
  backfaceVisibility?: string;
  /** CSS `container-type` / `container-name` for container-query detection. */
  containerType?: string; containerName?: string;
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
  // Effects
  boxShadow: string;
  opacity: string;
  // Layout
  display: string;
  position: string;
  flexDirection: string;
  justifyContent: string;
  alignItems: string;
  alignContent: string;
  alignSelf?: string;          // flex/grid item cross-axis override
  flexWrap: string;
  flexGrow: string;
  flexShrink: string;
  flexBasis: string;
  gap: string;
  rowGap: string;
  columnGap: string;
  gridTemplateColumns: string;
  gridTemplateRows: string;
  overflowX: string;
  overflowY: string;
  /** CSS `top` value (positioned elements only). Used to resolve
   *  position:absolute/fixed offsets in the Figma renderer. */
  top?: string;
  /** CSS `right` value (positioned elements only). */
  right?: string;
  /** CSS `bottom` value (positioned elements only). */
  bottom?: string;
  /** CSS `left` value (positioned elements only). */
  left?: string;
  /** CSS `inset` shorthand (`auto`, `1px`, `1px 2px`, etc.). */
  inset?: string;
  /** CSS4 logical `inset-block-*` / `inset-inline-*` resolved to top/bottom/left/right. */
  insetBlockStart?: string; insetBlockEnd?: string;
  insetInlineStart?: string; insetInlineEnd?: string;
  /** CSS4 logical `padding-block-*` / `padding-inline-*`. */
  paddingBlockStart?: string; paddingBlockEnd?: string;
  paddingInlineStart?: string; paddingInlineEnd?: string;
  /** CSS4 logical `margin-block-*` / `margin-inline-*`. */
  marginBlockStart?: string; marginBlockEnd?: string;
  marginInlineStart?: string; marginInlineEnd?: string;
  /** CSS `block-size` / `inline-size` logical box-model dimensions. */
  blockSize?: string; inlineSize?: string;
  maxBlockSize?: string; maxInlineSize?: string;
  minBlockSize?: string; minInlineSize?: string;
  /** CSS `overflow-block` / `overflow-inline` logical overflow axes. */
  overflowBlock?: string; overflowInline?: string;
  /** CSS `box-sizing` (content-box | border-box). Drives whether
   *  padding/border are included in the captured width/height. */
  boxSizing?: string;
  /** CSS `aspect-ratio` (e.g. `1 / 1`, `16 / 9`). Honours intrinsic
   *  ratios on replaced elements and modern flex items. */
  aspectRatio?: string;
  /** CSS `object-fit` (fill | contain | cover | none | scale-down).
   *  Applied to image/video fills so they match the live element. */
  objectFit?: string;
  /** CSS `object-position` (e.g. `center`, `50% 50%`). */
  objectPosition?: string;
  /** CSS `cursor` value. Affects affordance perception but not visual
   *  layout — kept as metadata for future hotspot/interaction work. */
  cursor?: string;
  /** CSS `will-change` hint. Not directly mappable to Figma, but
   *  sometimes signals a stacking context or compositing layer. */
  willChange?: string;
  /** CSS `contain` value (none | strict | content | size | layout |
   *  paint | etc.). Used to keep container subtrees compact. */
  contain?: string;
  /** CSS `mix-blend-mode` value (normal | multiply | screen …). Drives
   *  Figma blendMode on the node for proper overlay behaviour. */
  mixBlendMode?: string;
  /** CSS `isolation` value (auto | isolate). Marks a stacking context
   *  so blend modes don't bleed past the node boundary. */
  isolation?: string;
  /** CSS `clip-path` value (none | polygon(...) | circle(...)). Used to
   *  shape the Figma node bounds for non-rectangular sections. */
  clipPath?: string;
  /** CSS `mask-image` value (none | url(...) | gradient(...)). Drives
   *  Figma mask fills. */
  maskImage?: string;
  /** CSS `transform-style` value (flat | preserve-3d). Currently kept as
   *  metadata — Figma has limited 3D transform support. */
  transformStyle?: string;
  /** CSS `writing-mode` value (horizontal-tb | vertical-rl | vertical-lr |
   *  sideways-rl | sideways-lr). Drives textAutoResize rotation. */
  writingMode?: string;
  /** CSS `text-orientation` value (mixed | upright | sideways). Used with
   *  writing-mode for vertical text runs. */
  textOrientation?: string;
  /** CSS `caret-color` (e.g. `rgb(13,13,13)`). Drives input/textarea caret
   *  appearance when those are rendered as native Figma controls. */
  caretColor?: string;
  /** CSS `scroll-margin-*` per-side (logical + physical). Captured so snap
   *  targets can be reconstructed with the same breathing room. */
  scrollMarginTop?: string; scrollMarginRight?: string;
  scrollMarginBottom?: string; scrollMarginLeft?: string;
  scrollMarginBlockStart?: string; scrollMarginBlockEnd?: string;
  scrollMarginInlineStart?: string; scrollMarginInlineEnd?: string;
  /** CSS `scroll-padding-*` per-side. Captured for completeness; the Figma
   *  viewport itself is a static rectangle so these have no rendering
   *  effect today. */
  scrollPaddingTop?: string; scrollPaddingRight?: string;
  scrollPaddingBottom?: string; scrollPaddingLeft?: string;
  scrollPaddingBlockStart?: string; scrollPaddingBlockEnd?: string;
  scrollPaddingInlineStart?: string; scrollPaddingInlineEnd?: string;
  /** CSS `row-rule-*` shorthand split — CSS4 multi-column row separators.
   *  Currently no Figma equivalent; kept as metadata. */
  rowRuleStyle?: string; rowRuleWidth?: string; rowRuleColor?: string;
  /** CSS `text-decoration-*` longhands (line, color, style, thickness,
   *  skip-ink). Drives native Figma text decoration properties. */
  textDecoration?: string;
  textDecorationLine?: string; textDecorationStyle?: string;
  textDecorationColor?: string; textDecorationThickness?: string;
  textDecorationSkipInk?: string;
  /** CSS `text-emphasis-*` longhands (color, style, position). Used for
   *  East-Asian emphasis marks — no Figma equivalent today. */
  textEmphasisColor?: string; textEmphasisStyle?: string;
  textEmphasisPosition?: string;
  /** CSS `text-underline-offset` / `text-underline-position` for fine-grained
   *  underline placement (drives UNDERLINE_OFFSET in Figma). */
  textUnderlineOffset?: string; textUnderlinePosition?: string;
  /** CSS `text-wrap-mode` / `text-wrap-style` (modern Word-Break replacement). */
  textWrapMode?: string; textWrapStyle?: string;
  /** CSS `white-space-collapse` (preserve | collapse | preserve-break | break-spaces). */
  whiteSpaceCollapse?: string;
  /** CSS `overscroll-behavior-*` per-side. Captured so future scroll-area
   *  emulation can reproduce bounce behaviour. */
  overscrollBehaviorX?: string; overscrollBehaviorY?: string;
  overscrollBehaviorBlock?: string; overscrollBehaviorInline?: string;
  /** CSS `scrollbar-color` / `scrollbar-gutter` / `scrollbar-width` — custom
   *  scrollbar styling. Figma doesn't render native scrollbars so these are
   *  informational. */
  scrollbarColor?: string; scrollbarGutter?: string; scrollbarWidth?: string;
  /** CSS4 `scroll-timeline-*` / `view-timeline-*` (scroll-driven animations). */
  scrollTimelineName?: string; scrollTimelineAxis?: string;
  viewTimelineName?: string; viewTimelineAxis?: string; viewTimelineInset?: string;
  /** CSS4 `timeline-trigger-*` (named activation sources for timelines). */
  timelineTriggerName?: string; timelineTriggerSource?: string; timelineTriggerScope?: string;
  timelineTriggerActiveRangeStart?: string; timelineTriggerActiveRangeEnd?: string;
  timelineTriggerActivationRangeStart?: string; timelineTriggerActivationRangeEnd?: string;
  /** CSS4 `animation-timeline` / `animation-range-*` (scroll-bound keyframes). */
  animationTimeline?: string;
  animationRangeStart?: string; animationRangeEnd?: string;
  /** CSS4 `position-anchor` / `position-area` / `position-try-fallbacks` and
   *  related (CSS Anchor Positioning). Anchor targets resolve against
   *  names declared in the document. */
  positionAnchor?: string; positionArea?: string;
  positionTryFallbacks?: string; positionTryOrder?: string;
  positionVisibility?: string;
  /** CSS4 `anchor-name` / `anchor-scope` (declarative anchor positioning). */
  anchorName?: string; anchorScope?: string;
  /** CSS4 `view-transition-*` (cross-document state-transition API). */
  viewTransitionName?: string; viewTransitionClass?: string;
  viewTransitionGroup?: string; viewTransitionScope?: string;
  /** CSS `field-sizing` (fixed | content). Lets inputs size to their content. */
  fieldSizing?: string;
  /** CSS `reading-flow` / `reading-order` (logical document order). */
  readingFlow?: string; readingOrder?: string;
  // Effects
  backdropFilter: string;
  /** CSS transform (matrix or function list). Applied to Figma via relativeTransform (incl. skew). */
  transform: string;
  /** CSS transform-origin (e.g. "280px 95px") so the matrix is anchored correctly. */
  transformOrigin: string;
  /** CSS z-index ('auto' or numeric string). Drives child paint order so decorative
   *  pseudos with negative z-index render BEHIND content like the original page. */
  zIndex: string;
  /** CSS filter on the element. blur()/drop-shadow() → Figma LAYER_BLUR/DROP_SHADOW;
   *  other functions (hue-rotate, contrast…) trigger rasterization instead. */
  filter: string;
  /** `background-clip` value (e.g. 'border-box' | 'text'). Required to detect
   *  Fresha's "gradient text" pattern: parent gradient + child `bgClip:text` +
   *  child transparent text → render text in the parent gradient. */
  backgroundClip?: string;
  /** WebKit-specific `background-clip` (legacy alias). */
  webkitBackgroundClip?: string;
  /** `-webkit-text-fill-color` value — when 'rgba(0,0,0,0)' or 'transparent',
   *  the text colour is supplied by `background-clip: text` + a gradient. */
  webkitTextFillColor?: string;
}

export interface CaptureNode {
  id: string;
  tagName: string;
  type: 'frame' | 'text' | 'image' | 'rectangle';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style: ElementStyle;
  text?: string;
  /** Actual rendered line count (from Range.getClientRects) — drives Figma text sizing */
  lines?: number;
  /** Actual rendered text width (max line-box width from Range.getClientRects, in px).
   *  Lets the plugin pick sizing mode and centering offset without guessing. */
  textWidth?: number;
  /** CSS text-overflow:ellipsis was clipping this single-line text — render at the
   *  captured width with Figma textTruncation:'ENDING' instead of auto-hug. */
  truncate?: boolean;
  src?: string;
  /** Raw SVG markup — when present, the plugin builds native Figma vector layers from it */
  svgMarkup?: string;
  /** Marks this node as a synthesized ::before / ::after pseudo-element */
  pseudo?: 'before' | 'after';
  /** This element uses Figma-impossible CSS → render it as a browser-captured image */
  rasterize?: boolean;
  /** Reason it was flagged for rasterization (diagnostic) */
  rasterReason?: string;
  /** Key into the images map holding this element's captured PNG */
  rasterId?: string;
  children: CaptureNode[];
}

export interface CapturePayload {
  url: string;
  title: string;
  mode: 'full-page' | 'selected-element';
  // `viewport` is the **full document** size (used for canvas sizing).
  // `browserViewport` is the **actual browser viewport** at capture time —
  // required to resolve CSS vh/vw units (which are relative to the browser
  // viewport, not the document). Older payloads without it fall back to
  // `viewport`.
  viewport: { width: number; height: number };
  browserViewport?: { width: number; height: number };
  nodes: CaptureNode[];
  images?: Record<string, string>;
}

export type MessageToContent =
  | { type: 'CAPTURE_FULL_PAGE' }
  | { type: 'START_ELEMENT_PICKER' }
  | { type: 'CANCEL_PICKER' }
  | { type: 'CAPTURE_VIEWPORT'; label: string; width: number };

export interface ViewportSpec { label: string; width: number; height: number; }

// ── Capture progress (content → popup) ───────────────────────────────────────
export type CapturePhase = 'preparing' | 'reading' | 'rasterizing' | 'saving';

export interface CaptureProgressMessage {
  type: 'CAPTURE_PROGRESS';
  phase: CapturePhase;
  /** Pre-formatted, user-facing string the popup renders verbatim. */
  message: string;
  /** Present only for the 'rasterizing' phase. */
  current?: number;
  total?: number;
}

export type MessageFromContent =
  | { type: 'CAPTURE_DONE'; id: string }
  | { type: 'CAPTURE_ERROR'; message: string }
  | CaptureProgressMessage;
