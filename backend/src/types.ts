export interface ElementStyle {
  backgroundColor: string;
  backgroundImage: string;  // full CSS value
  backgroundImageUrl?: string; // extracted url() src
  color: string;
  fontSize: string;
  fontFamily: string;
  fontWeight: string;
  textAlign: string;
  lineHeight: string;
  letterSpacing: string;
  borderRadius: string;
  borderColor: string;
  borderWidth: string;
  borderStyle: string;
  boxShadow: string;
  opacity: string;
  display: string;
  overflowX: string;
  overflowY: string;
  backgroundClip?: string;
  webkitBackgroundClip?: string;
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
  src?: string;           // <img> src
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
  images?: Record<string, string>; // url → base64 data-URL
}
