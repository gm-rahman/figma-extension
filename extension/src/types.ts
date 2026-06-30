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
  viewport: { width: number; height: number };
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
