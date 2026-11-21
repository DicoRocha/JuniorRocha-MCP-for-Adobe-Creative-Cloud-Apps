// Adiciona o servidor MCP "jr-adb-mcp-bridge" ao Claude Desktop.
// Mexe apenas em claude_desktop_config.json (com backup), nos locais que o app pode ler:
//   1. %APPDATA%\Claude\                                  (instalador comum)
//   2. %LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\   (app da Microsoft Store / MSIX,
//      que le a configuracao de dentro do pacote e ignora o local 1)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "jr-adb-mcp-bridge";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distIndexJs = path.join(repoRoot, "dist", "index.js").replace(/\\/g, "/");
const out = [];
const say = (s = "") => { out.push(s); console.log(s); };

if (!fs.existsSync(distIndexJs)) {
  console.error(`[ERRO] Nao encontrei ${distIndexJs}. Rode "npm run build" antes.`);
  process.exit(1);
}

const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");

// macOS (escrito em 19/11/2026, ainda NAO validado num Mac): o app le ~/Library/Application Support/Claude.
const isMac = process.platform === "darwin";
const targets = isMac
  ? [{ dir: path.join(os.homedir(), "Library", "Application Support", "Claude"), kind: "macOS", create: true }]
  : [{ dir: path.join(appData, "Claude"), kind: "instalador comum", create: true }];
try {
  if (isMac) throw Object.assign(new Error("skip"), { skip: true });
  const packages = path.join(localAppData, "Packages");
  if (fs.existsSync(packages)) {
    for (const d of fs.readdirSync(packages)) {
      if (!/^(AnthropicPBC\.)?Claude/i.test(d)) continue;
      // O pacote existe, logo o app e o da Store: a pasta virtualizada e a que ele le.
      targets.push({ dir: path.join(packages, d, "LocalCache", "Roaming", "Claude"), kind: `Microsoft Store (${d})`, create: true });
    }
  }
} catch (err) {
  if (!err.skip) say(`[AVISO] Nao consegui procurar o pacote da Microsoft Store: ${err.message}`);
}

let failures = 0;
for (const target of targets) {
  const file = path.join(target.dir, "claude_desktop_config.json");
  say(`\n== ${target.kind}\n   ${file}`);
  try {
    fs.mkdirSync(target.dir, { recursive: true });
    let config = {};
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf-8").replace(/^﻿/, "");
      if (raw.trim() !== "") {
        try {
          config = JSON.parse(raw);
        } catch (err) {
          say(`   [ERRO] JSON invalido (${err.message}). Este arquivo NAO foi alterado; corrija-o e rode de novo.`);
          failures++;
          continue;
        }
        if (!config || typeof config !== "object" || Array.isArray(config)) {
          say("   [ERRO] O arquivo nao contem um objeto JSON. NAO foi alterado.");
          failures++;
          continue;
        }
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        fs.copyFileSync(file, `${file}.backup-${stamp}`);
        say(`   [OK] Backup: claude_desktop_config.json.backup-${stamp}`);
      }
    }
    if (!config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)) {
      config.mcpServers = {};
    }
    for (const legacyName of ["adobe-" + "creative-suite", "adobe-" + "unified-mcp"]) {
      if (config.mcpServers[legacyName]) {
        delete config.mcpServers[legacyName];
        say(`   [OK] Entrada antiga removida: ${legacyName}`);
      }
    }
    config.mcpServers[NAME] = { command: "node", args: [distIndexJs, "--apps", "all"] };
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n", "utf-8");
    say(`   [OK] ${NAME} configurado. Servidores MCP neste arquivo: ${Object.keys(config.mcpServers).join(", ")}`);
  } catch (err) {
    say(`   [ERRO] ${err.message}`);
    failures++;
  }
}

say("\nFeche o Claude Desktop pela bandeja (botao direito no icone > Sair) e abra de novo.");
try {
  fs.mkdirSync(path.join(repoRoot, "logs"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, "logs", "claude-desktop-install.txt"), `${new Date().toISOString()}\n${out.join("\n")}\n`, "utf-8");
} catch {
  // o log e apenas informativo
}
process.exit(failures > 0 ? 1 : 0);
