"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../extension/src/sheet-table.ts
var sheet_table_exports = {};
__export(sheet_table_exports, {
  buildSheetPayload: () => buildSheetPayload,
  isGoogleSheet: () => isGoogleSheet,
  parseCsv: () => parseCsv,
  sheetIdAndGid: () => sheetIdAndGid
});
module.exports = __toCommonJS(sheet_table_exports);
function isGoogleSheet() {
  return location.hostname === "docs.google.com" && location.pathname.includes("/spreadsheets/");
}
function sheetIdAndGid(href) {
  const m = href.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!m) return null;
  const g = href.match(/[#&?]gid=(\d+)/);
  return { id: m[1], gid: g ? g[1] : "0" };
}
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  return rows;
}
var ROW_H = 30;
var PAD = 8;
var FS = 13;
var LH = 18;
var CHAR_W = 7;
var MIN_W = 90;
var MAX_W = 340;
function baseStyle() {
  return {
    backgroundColor: "rgba(0, 0, 0, 0)",
    backgroundImage: "none",
    backgroundImageUrl: void 0,
    color: "rgb(32, 33, 36)",
    fontSize: `${FS}px`,
    fontFamily: "Arial, sans-serif",
    fontWeight: "400",
    textAlign: "left",
    lineHeight: `${LH}px`,
    letterSpacing: "normal",
    borderRadius: "0px",
    borderTopLeftRadius: "0px",
    borderTopRightRadius: "0px",
    borderBottomRightRadius: "0px",
    borderBottomLeftRadius: "0px",
    borderColor: "rgb(218, 220, 224)",
    borderWidth: "0px",
    borderStyle: "none",
    paddingTop: "0px",
    paddingRight: "0px",
    paddingBottom: "0px",
    paddingLeft: "0px",
    marginTop: "0px",
    marginRight: "0px",
    marginBottom: "0px",
    marginLeft: "0px",
    boxShadow: "none",
    opacity: "1",
    display: "block",
    position: "static",
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "stretch",
    alignContent: "normal",
    flexWrap: "nowrap",
    flexGrow: "0",
    flexShrink: "1",
    flexBasis: "auto",
    gap: "normal",
    rowGap: "normal",
    columnGap: "normal",
    gridTemplateColumns: "none",
    gridTemplateRows: "none",
    overflowX: "visible",
    overflowY: "visible",
    backdropFilter: "none",
    transform: "none",
    transformOrigin: "50% 50%",
    zIndex: "auto"
  };
}
var nodeSeq = 0;
var nid = () => `sheet-${++nodeSeq}`;
function buildSheetPayload(rows, url, title) {
  nodeSeq = 0;
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const colW = [];
  for (let c = 0; c < cols; c++) {
    let maxChars = 0;
    for (const r of rows) maxChars = Math.max(maxChars, (r[c] || "").length);
    colW[c] = Math.min(MAX_W, Math.max(MIN_W, maxChars * CHAR_W + PAD * 2));
  }
  const colX = [];
  let x = 0;
  for (let c = 0; c < cols; c++) {
    colX[c] = x;
    x += colW[c];
  }
  const totalW = x || MIN_W;
  const totalH = Math.max(rows.length * ROW_H, ROW_H);
  const rowNodes = rows.map((r, ri) => {
    const isHeader = ri === 0;
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const val = r[c] || "";
      const cellStyle = baseStyle();
      cellStyle.borderStyle = "solid";
      cellStyle.borderWidth = "1px";
      cellStyle.backgroundColor = isHeader ? "rgb(232, 240, 254)" : "rgb(255, 255, 255)";
      const cell = {
        id: nid(),
        tagName: "div",
        type: "frame",
        name: `Cell ${ri},${c}`,
        x: colX[c],
        y: 0,
        width: colW[c],
        height: ROW_H,
        style: cellStyle,
        children: []
      };
      if (val) {
        const ts = baseStyle();
        ts.fontWeight = isHeader ? "700" : "400";
        cell.children.push({
          id: nid(),
          tagName: "#text",
          type: "text",
          name: "Value",
          x: PAD,
          y: Math.round((ROW_H - LH) / 2),
          width: Math.max(colW[c] - PAD * 2, 1),
          height: LH,
          style: ts,
          text: val.slice(0, 500),
          lines: 1,
          textWidth: Math.min(colW[c] - PAD * 2, val.length * CHAR_W),
          children: []
        });
      }
      cells.push(cell);
    }
    return {
      id: nid(),
      tagName: "div",
      type: "frame",
      name: `Row ${ri}`,
      x: 0,
      y: ri * ROW_H,
      width: totalW,
      height: ROW_H,
      style: baseStyle(),
      children: cells
    };
  });
  const tableStyle = baseStyle();
  tableStyle.backgroundColor = "rgb(255, 255, 255)";
  const table = {
    id: nid(),
    tagName: "div",
    type: "frame",
    name: "Sheet Table",
    x: 0,
    y: 0,
    width: totalW,
    height: totalH,
    style: tableStyle,
    children: rowNodes
  };
  return {
    url,
    title: title || "Google Sheet",
    mode: "full-page",
    viewport: { width: totalW, height: totalH },
    nodes: [table]
  };
}
