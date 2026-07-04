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
  /** Per-side border style. */
  borderTopStyle?: string; borderRightStyle?: string; borderBottomStyle?: string; borderLeftStyle?: string;
  /** Per-side border width. */
  borderTopWidth?: string; borderRightWidth?: string; borderBottomWidth?: string; borderLeftWidth?: string;
  /** Per-side border colour. */
  borderTopColor?: string; borderRightColor?: string; borderBottomColor?: string; borderLeftColor?: string;
  /** CSS4 logical-property borders (`border-block-*` / `border-inline-*`). */
  borderBlockStartStyle?: string; borderBlockStartWidth?: string; borderBlockStartColor?: string;
  borderBlockEndStyle?: string; borderBlockEndWidth?: string; borderBlockEndColor?: string;
  borderInlineStartStyle?: string; borderInlineStartWidth?: string; borderInlineStartColor?: string;
  borderInlineEndStyle?: string; borderInlineEndWidth?: string; borderInlineEndColor?: string;
  /** CSS4 logical `border-radius` (start/end per writing mode). */
  borderStartStartRadius?: string; borderStartEndRadius?: string;
  borderEndStartRadius?: string; borderEndEndRadius?: string;
  /** CSS `border-image-*` source/slice/width/repeat/outset. */
  borderImageSource?: string; borderImageSlice?: string; borderImageWidth?: string;
  borderImageRepeat?: string; borderImageOutset?: string;
  /** CSS `corner-shape` per corner (CSS4). */
  cornerTopLeftShape?: string; cornerTopRightShape?: string;
  cornerBottomRightShape?: string; cornerBottomLeftShape?: string;
  /** CSS `animation-*` longhands. */
  animationName?: string; animationDuration?: string; animationTimingFunction?: string;
  animationIterationCount?: string; animationDelay?: string; animationDirection?: string;
  animationFillMode?: string; animationPlayState?: string;
  /** CSS `font-stretch` + `font-variant-*`. */
  fontStretch?: string; fontVariant?: string;
  fontVariantCaps?: string; fontVariantNumeric?: string; fontVariantLigatures?: string;
  /** CSS `column-rule-*` shorthand split. */
  columnRuleStyle?: string; columnRuleWidth?: string; columnRuleColor?: string;
  /** SVG fills / strokes. */
  fill?: string;
  stroke?: string; strokeWidth?: string; strokeDasharray?: string;
  strokeLinecap?: string; strokeLinejoin?: string;
  fillRule?: string;
  /** Misc metadata. */
  appearance?: string;
  backfaceVisibility?: string;
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
  /** CSS `top` value (positioned elements only). */
  top?: string;
  /** CSS `right` value (positioned elements only). */
  right?: string;
  /** CSS `bottom` value (positioned elements only). */
  bottom?: string;
  /** CSS `left` value (positioned elements only). */
  left?: string;
  /** CSS `inset` shorthand. */
  inset?: string;
  /** CSS4 logical `inset-block-*` / `inset-inline-*`. */
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
  /** CSS `box-sizing`. */
  boxSizing?: string;
  /** CSS `aspect-ratio`. */
  aspectRatio?: string;
  /** CSS `object-fit` for image/video fills. */
  objectFit?: string;
  /** CSS `object-position`. */
  objectPosition?: string;
  /** CSS `cursor` value. */
  cursor?: string;
  /** CSS `will-change` hint. */
  willChange?: string;
  /** CSS `contain` value. */
  contain?: string;
  /** CSS `mix-blend-mode` → Figma `BlendMode`. */
  mixBlendMode?: string;
  /** CSS `isolation`. */
  isolation?: string;
  /** CSS `clip-path` value. */
  clipPath?: string;
  /** CSS `mask-image` value. */
  maskImage?: string;
  /** CSS `transform-style` value. */
  transformStyle?: string;
  /** CSS `writing-mode` value. */
  writingMode?: string;
  /** CSS `text-orientation` value. */
  textOrientation?: string;
  /** CSS `caret-color`. */
  caretColor?: string;
  /** CSS `scroll-margin-*` per-side. */
  scrollMarginTop?: string; scrollMarginRight?: string;
  scrollMarginBottom?: string; scrollMarginLeft?: string;
  scrollMarginBlockStart?: string; scrollMarginBlockEnd?: string;
  scrollMarginInlineStart?: string; scrollMarginInlineEnd?: string;
  /** CSS `scroll-padding-*` per-side. */
  scrollPaddingTop?: string; scrollPaddingRight?: string;
  scrollPaddingBottom?: string; scrollPaddingLeft?: string;
  scrollPaddingBlockStart?: string; scrollPaddingBlockEnd?: string;
  scrollPaddingInlineStart?: string; scrollPaddingInlineEnd?: string;
  /** CSS `row-rule-*` shorthand split. */
  rowRuleStyle?: string; rowRuleWidth?: string; rowRuleColor?: string;
  /** CSS `text-decoration-*` longhands. */
  textDecoration?: string;
  textDecorationLine?: string; textDecorationStyle?: string;
  textDecorationColor?: string; textDecorationThickness?: string;
  textDecorationSkipInk?: string;
  /** CSS `text-emphasis-*` longhands. */
  textEmphasisColor?: string; textEmphasisStyle?: string;
  textEmphasisPosition?: string;
  /** CSS `text-underline-offset` / `text-underline-position`. */
  textUnderlineOffset?: string; textUnderlinePosition?: string;
  /** CSS `text-wrap-mode` / `text-wrap-style`. */
  textWrapMode?: string; textWrapStyle?: string;
  /** CSS `white-space-collapse`. */
  whiteSpaceCollapse?: string;
  /** CSS `overscroll-behavior-*`. */
  overscrollBehaviorX?: string; overscrollBehaviorY?: string;
  overscrollBehaviorBlock?: string; overscrollBehaviorInline?: string;
  /** CSS `scrollbar-color` / `scrollbar-gutter` / `scrollbar-width`. */
  scrollbarColor?: string; scrollbarGutter?: string; scrollbarWidth?: string;
  /** CSS4 `scroll-timeline-*` / `view-timeline-*`. */
  scrollTimelineName?: string; scrollTimelineAxis?: string;
  viewTimelineName?: string; viewTimelineAxis?: string; viewTimelineInset?: string;
  /** CSS4 `timeline-trigger-*`. */
  timelineTriggerName?: string; timelineTriggerSource?: string; timelineTriggerScope?: string;
  timelineTriggerActiveRangeStart?: string; timelineTriggerActiveRangeEnd?: string;
  timelineTriggerActivationRangeStart?: string; timelineTriggerActivationRangeEnd?: string;
  /** CSS4 `animation-timeline` / `animation-range-*`. */
  animationTimeline?: string;
  animationRangeStart?: string; animationRangeEnd?: string;
  /** CSS4 `position-anchor` / `position-area` / `position-try-fallbacks`. */
  positionAnchor?: string; positionArea?: string;
  positionTryFallbacks?: string; positionTryOrder?: string;
  positionVisibility?: string;
  /** CSS4 `anchor-name` / `anchor-scope`. */
  anchorName?: string; anchorScope?: string;
  /** CSS4 `view-transition-*`. */
  viewTransitionName?: string; viewTransitionClass?: string;
  viewTransitionGroup?: string; viewTransitionScope?: string;
  /** CSS `field-sizing`. */
  fieldSizing?: string;
  /** CSS `reading-flow` / `reading-order`. */
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
  /** `-webkit-text-fill-color` value — when transparent, text colour is
   *  supplied by `background-clip: text` + a gradient. */
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
  id: string;
  url: string;
  title: string;
  timestamp: number;
  mode: 'full-page' | 'selected-element';
  viewport: { width: number; height: number };
  nodes: CaptureNode[];
  images?: Record<string, string>;
}

export interface CaptureSummary {
  id: string;
  title: string;
  url: string;
  timestamp: number;
  mode: string;
}

/** One viewport's render in a multi-viewport import. */
export interface FrameImport {
  label: string;
  width: number;
  payload: CapturePayload;
  imageMap?: Record<string, number[]>;
}

export type UIToPlugin =
  | { type: 'CREATE_NODES'; payload: CapturePayload; imageMap?: Record<string, number[]> }
  | { type: 'CREATE_NODES_MULTI'; frames: FrameImport[] };

export interface FontSubstitution {
  /** What the page asked for, e.g. "Geist Sans SemiBold" */
  requested: string;
  /** What we actually loaded in Figma, e.g. "Inter SemiBold" */
  loaded: string;
}

export type PluginMessage =
  | { type: 'IMPORT_DONE'; name: string; substitutions?: FontSubstitution[] }
  | { type: 'ERROR'; message: string };
