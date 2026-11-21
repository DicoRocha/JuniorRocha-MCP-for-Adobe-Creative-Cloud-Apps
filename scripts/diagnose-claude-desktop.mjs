// Diagnostico (somente leitura) da integracao com o Claude Desktop.
// Grava logs/claude-desktop-diagnosis.txt com: nomes dos servidores MCP configurados,
// a entrada jr-adb-mcp-bridge e as ultimas linhas do log desse servidor.
// Nao copia variaveis de ambiente nem dados de outros servidores.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = [];
const say = (s = "") => { out.push(s); console.log(s); };
const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
const NAME = "jr-adb-mcp-bridge";

say(`Diagnostico em ${new Date().toISOString()}`);
say(`node ${process.version}`);

const candidates = [
  path.join(appData, "Claude", "claude_desktop_config.json"),
  path.join(process.env.LOCALAPPDATA || "", "Packages")
];
const configFile = candidates[0];
say(`\n== Config: ${configFile}`);
if (!fs.existsSync(configFile)) {
  say("NAO EXISTE");
} else {
  const stat = fs.statSync(configFile);
  say(`existe, ${stat.size} bytes, modificado em ${stat.mtime.toISOString()}`);
  try {
    const cfg = JSON.parse(fs.readFileSync(configFile, "utf-8").replace(/^﻿/, ""));
    say(`chaves de topo: ${Object.keys(cfg).join(", ")}`);
    const servers = cfg.mcpServers && typeof cfg.mcpServers === "object" ? cfg.mcpServers : {};
    say(`mcpServers: ${Object.keys(servers).join(", ") || "(nenhum)"}`);
    if (servers[NAME]) {
      const e = servers[NAME];
      say(`entrada ${NAME}: command=${JSON.stringify(e.command)} args=${JSON.stringify(e.args)}`);
      const script = Array.isArray(e.args) ? e.args[0] : null;
      say(`arquivo do servidor existe: ${script ? fs.existsSync(script) : "?"}`);
    } else {
      say(`entrada ${NAME}: AUSENTE`);
    }
  } catch (err) {
    say(`JSON INVALIDO: ${err.message}`);
  }
}

// Instalacoes da Microsoft Store guardam os dados em outro lugar
try {
  const pk = candidates[1];
  if (pk && fs.existsSync(pk)) {
    const hits = fs.readdirSync(pk).filter((d) => /claude/i.test(d));
    say(`\n== Pacotes da Store com 'claude' no nome: ${hits.join(", ") || "(nenhum)"}`);
    for (const h of hits) {
      const altDir = path.join(pk, h, "LocalCache", "Roaming", "Claude");
      const alt = path.join(altDir, "claude_desktop_config.json");
      say(`   pasta ${altDir} -> ${fs.existsSync(altDir) ? "EXISTE" : "nao existe"}`);
      if (fs.existsSync(altDir)) {
        say(`   conteudo: ${fs.readdirSync(altDir).slice(0, 60).join(", ")}`);
      }
      say(`   ${alt} -> ${fs.existsSync(alt) ? "EXISTE" : "nao existe"}`);
      if (fs.existsSync(alt)) {
        try {
          const c = JSON.parse(fs.readFileSync(alt, "utf-8").replace(/^\uFEFF/, ""));
          say(`   mcpServers neste arquivo: ${Object.keys(c.mcpServers || {}).join(", ") || "(nenhum)"}`);
        } catch (err) {
          say(`   JSON INVALIDO: ${err.message}`);
        }
      }
      const altLogs = path.join(altDir, "logs");
      if (fs.existsSync(altLogs)) {
        const lf = fs.readdirSync(altLogs).filter((f) => /^mcp/i.test(f));
        say(`   logs mcp* da Store: ${lf.join(", ") || "(nenhum)"}`);
        for (const f of lf.filter((x) => x.toLowerCase().includes(NAME))) {
          const lines = fs.readFileSync(path.join(altLogs, f), "utf-8").split(/\r?\n/).filter(Boolean);
          say(`\n-- ${f} (ultimas 40 de ${lines.length} linhas)`);
          for (const l of lines.slice(-40)) say(l.slice(0, 600));
        }
      }
    }
  }
} catch (err) {
  say(`(nao consegui listar pacotes da Store: ${err.message})`);
}

const logsDir = path.join(appData, "Claude", "logs");
say(`\n== Logs: ${logsDir}`);
if (!fs.existsSync(logsDir)) {
  say("pasta nao existe");
} else {
  const files = fs.readdirSync(logsDir).filter((f) => /^mcp/i.test(f));
  say(`arquivos mcp*: ${files.join(", ") || "(nenhum)"}`);
  const own = files.filter((f) => f.toLowerCase().includes(NAME));
  for (const f of own) {
    const lines = fs.readFileSync(path.join(logsDir, f), "utf-8").split(/\r?\n/).filter(Boolean);
    say(`\n-- ${f} (ultimas 40 de ${lines.length} linhas)`);
    for (const l of lines.slice(-40)) say(l.slice(0, 600));
  }
  const main = files.find((f) => f.toLowerCase() === "mcp.log");
  if (main) {
    const lines = fs.readFileSync(path.join(logsDir, main), "utf-8").split(/\r?\n/).filter((l) => l.toLowerCase().includes("adobe"));
    say(`\n-- mcp.log: ${lines.length} linhas mencionam 'adobe' (ultimas 20)`);
    for (const l of lines.slice(-20)) say(l.slice(0, 600));
  }
}

fs.mkdirSync(path.join(repoRoot, "logs"), { recursive: true });
fs.writeFileSync(path.join(repoRoot, "logs", "claude-desktop-diagnosis.txt"), out.join("\n") + "\n", "utf-8");
