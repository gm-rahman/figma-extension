// count-new-fields.mjs — verify new logical-property and CSS4 fields populate
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const payload = JSON.parse(readFileSync(resolve(__dirname, 'capture.json'), 'utf8'));

const FIELDS = [
  // Logical borders
  'borderBlockStartStyle', 'borderBlockEndStyle', 'borderInlineStartStyle', 'borderInlineEndStyle',
  'borderBlockStartWidth', 'borderBlockEndWidth', 'borderInlineStartWidth', 'borderInlineEndWidth',
  'borderBlockStartColor', 'borderBlockEndColor', 'borderInlineStartColor', 'borderInlineEndColor',
  'borderStartStartRadius', 'borderStartEndRadius', 'borderEndStartRadius', 'borderEndEndRadius',
  // Border image
  'borderImageSource', 'borderImageSlice', 'borderImageWidth', 'borderImageRepeat', 'borderImageOutset',
  // Logical padding/margin/inset
  'paddingBlockStart', 'paddingBlockEnd', 'paddingInlineStart', 'paddingInlineEnd',
  'marginBlockStart', 'marginBlockEnd', 'marginInlineStart', 'marginInlineEnd',
  'insetBlockStart', 'insetBlockEnd', 'insetInlineStart', 'insetInlineEnd',
  // Logical box size
  'blockSize', 'inlineSize', 'maxBlockSize', 'maxInlineSize', 'minBlockSize', 'minInlineSize',
  'overflowBlock', 'overflowInline',
  // Scroll
  'scrollMarginTop', 'scrollMarginBottom', 'scrollPaddingTop',
  'overscrollBehaviorX', 'scrollbarWidth',
  // Row-rule
  'rowRuleStyle', 'rowRuleWidth', 'rowRuleColor',
  // Text-decoration
  'textDecoration', 'textDecorationLine', 'textDecorationThickness',
  // Text-emphasis
  'textEmphasisStyle', 'textEmphasisPosition',
  // Text-underline / wrap
  'textUnderlineOffset', 'textWrapMode', 'whiteSpaceCollapse',
  // Timeline / animation-timeline / animation-range
  'scrollTimelineName', 'viewTimelineName', 'animationTimeline', 'animationRangeStart',
  // Anchor positioning / view-transition / reading
  'anchorName', 'positionArea', 'viewTransitionName', 'fieldSizing', 'readingFlow',
];

let nodes = 0;
const counts = Object.fromEntries(FIELDS.map(f => [f, 0]));
function walk(n) {
  nodes++;
  const s = n.style || {};
  for (const f of FIELDS) {
    if (s[f] !== undefined && s[f] !== null && s[f] !== '' && s[f] !== 'default' && s[f] !== '0px' && s[f] !== 'auto' && s[f] !== 'none' && s[f] !== 'normal') {
      counts[f]++;
    }
  }
  for (const c of (n.children || [])) walk(c);
}
for (const root of payload.nodes) walk(root);

console.log(`Total nodes: ${nodes}`);
console.log('\n=== Non-default new-field populations ===');
for (const f of FIELDS) {
  if (counts[f] > 0) console.log(`  ${String(counts[f]).padStart(4)}  ${f}`);
}