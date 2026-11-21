#!/usr/bin/env node
/**
 * JuniorRocha MCP for Adobe Creative Cloud - installer for the ChatGPT desktop app.
 *
 * 1. Copies the server (the "server" folder next to this file) to a fixed folder:
 *      Windows: %LOCALAPPDATA%\JuniorRocha-MCP\server
 *      macOS:   ~/Library/Application Support/JuniorRocha-MCP/server
 * 2. Adds the server to the MCP settings that the ChatGPT desktop app shares with Codex
 *    (~/.codex/config.toml, or $CODEX_HOME/config.toml), after a backup copy of that file.
 *    Running it again replaces only its own entry.
 *
 * Needs Node.js 20 or newer. Run it with INSTALL-CHATGPT.bat (Windows) or INSTALL-CHATGPT.command (macOS).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const SERVER_NAME = "junior-rocha-mcp";

/** TOML table for the server. JSON string escapes are valid TOML basic-string escapes. */
export function serverBlock({ node, entry }) {
  return [
    `[mcp_servers.${SERVER_NAME}]`,
    `command = ${JSON.stringify(node)}`,
    `args = [${JSON.stringify(entry)}]`,
    // the server answers its first request after loading the tool catalogue
    "startup_timeout_sec = 30",
    // renders, exports and multi-step scripts take longer than the 60 s default
    "tool_timeout_sec = 900",
    ""
  ].join("\n");
}

const header = (line) => {
  const m = /^\s*\[\s*([^\]]+?)\s*\]\s*(#.*)?$/.exec(line);
  return m ? m[1].replace(/"/g, "") : null;
};
const isOurs = (name) => name === `mcp_servers.${SERVER_NAME}` || name.startsWith(`mcp_servers.${SERVER_NAME}.`);

/** Removes our table and its sub-tables, then appends the new block; every other line stays as it was. */
export function upsertServerBlock(text, block) {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const kept = [];
  let skipping = false;
  for (const line of lines) {
    const h = header(line);
    if (h !== null) skipping = isOurs(h);
    if (!skipping) kept.push(line);
  }
  const body = kept.join("\n").replace(/\s+$/, "");
  return (body ? body + "\n\n" : "") + block;
}

/** Names of other mcp_servers tables whose command or args mention this server (an older manual setup). */
export function findOtherEntries(text) {
  const found = [];
  let current = null;
  for (const line of (text || "").replace(/\r\n/g, "\n").split("\n")) {
    const h = header(line);
    if (h !== null) {
      const m = /^mcp_servers\.([^.]+)$/.exec(h);
      current = m && m[1] !== SERVER_NAME ? m[1] : null;
      continue;
    }
    if (current && /jr-adb-mcp-bridge|MCPS ADOBE|JuniorRocha-MCP|JuniorRocha MCP/i.test(line) && !found.includes(current)) {
      found.push(current);
    }
  }
  return found;
}

export function defaultDest() {
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "JuniorRocha-MCP", "server");
  }
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "JuniorRocha-MCP", "server");
  return path.join(os.homedir(), ".local", "share", "JuniorRocha-MCP", "server");
}

export function install({ serverSrc, dest, codexHome, node, log = console.log }) {
  if (!fs.existsSync(path.join(serverSrc, "dist", "index.js"))) {
    throw new Error(`The server folder was not found next to the installer (${serverSrc}). Extract the whole zip first.`);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(serverSrc, dest, { recursive: true });
  log(`Server copied to ${dest}`);

  fs.mkdirSync(codexHome, { recursive: true });
  const configPath = path.join(codexHome, "config.toml");
  let backup = null;
  let text = "";
  if (fs.existsSync(configPath)) {
    text = fs.readFileSync(configPath, "utf8");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    backup = `${configPath}.bak-${stamp}`;
    fs.copyFileSync(configPath, backup);
    log(`Backup of your settings: ${backup}`);
  }
  const block = serverBlock({ node, entry: path.join(dest, "dist", "index.js") });
  fs.writeFileSync(configPath, upsertServerBlock(text, block));
  log(`Added "${SERVER_NAME}" to ${configPath}`);

  const otherEntries = findOtherEntries(text);
  if (otherEntries.length) {
    log(`Note: your settings also start this server under another name (${otherEntries.join(", ")}). ` +
      "Remove that entry in ChatGPT (Settings > MCP servers) so the tools do not appear twice.");
  }
  return { dest, configPath, backup, otherEntries };
}

function main() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) {
    console.error(`Node.js 20 or newer is needed (this is ${process.versions.node}). Get it from https://nodejs.org`);
    process.exit(1);
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  try {
    install({ serverSrc: path.join(here, "server"), dest: defaultDest(), codexHome, node: process.execPath });
  } catch (err) {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  }
  console.log("");
  console.log("Done. Restart the ChatGPT desktop app (or select Restart in Settings > MCP servers).");
  console.log('Then open your creative apps and ask: "Check the status of my creative apps."');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
