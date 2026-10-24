"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const PLUGIN_ROOT = path.resolve(__dirname, "..");
const DATA_ANALYTICS_WIDGET_ASSETS = Object.freeze([
  "datascience-artifact-widget.html",
  "datascience-table-widget.html",
  "datascience-chart-widget.html",
]);

/** Loads packaged renderer bytes only; importing this module never starts MCP or a plugin server. */
function readWidgetHtmlAsset(fileName) {
  if (!DATA_ANALYTICS_WIDGET_ASSETS.includes(fileName)) {
    throw new TypeError(`Unsupported Data Analytics widget asset: ${fileName}`);
  }
  const assetDir = path.join(PLUGIN_ROOT, "assets");
  const prefix = `${fileName}.gz.b64.part`;
  const chunks = fs
    .readdirSync(assetDir)
    .filter((name) => name.startsWith(prefix))
    .sort();
  if (!chunks.length) {
    throw new Error(`Missing packaged Data Analytics widget asset chunks for ${fileName}`);
  }

  const encoded = chunks
    .map((name) => fs.readFileSync(path.join(assetDir, name), "utf8").trim())
    .join("");
  return zlib.gunzipSync(Buffer.from(encoded, "base64")).toString("utf8");
}

// Escape JSON for a script text node, so payload strings cannot terminate the bootstrap script.
function safeHtmlJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

/** Embeds a prevalidated payload in a trusted renderer template. This is not an HTML sanitizer. */
function hostedArtifactHtml(html, payload) {
  const hosting = {
    mode: "site_creator",
    readOnly: true,
    controls: {
      edit: false,
      exportHostedLink: false,
      hostedLink: false,
    },
  };
  const script = [
    "<script>",
    `window.__DATASCIENCE_ARTIFACT_HOSTING__=${safeHtmlJson(hosting)};`,
    "window.xpertai=Object.assign({},window.xpertai,{",
    `toolOutput:${safeHtmlJson(payload)},`,
    `toolResponseMetadata:${safeHtmlJson(payload)},`,
    'availableDisplayModes:["inline","fullscreen"],',
    'displayMode:"fullscreen",',
    'hostContext:{availableDisplayModes:["inline","fullscreen"],displayMode:"fullscreen"}',
    "});",
    "</script>",
  ].join("");
  if (/<head(\s[^>]*)?>/i.test(html)) {
    return html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n${script}`);
  }
  return `${script}\n${html}`;
}

module.exports = { DATA_ANALYTICS_WIDGET_ASSETS, readWidgetHtmlAsset, hostedArtifactHtml };
