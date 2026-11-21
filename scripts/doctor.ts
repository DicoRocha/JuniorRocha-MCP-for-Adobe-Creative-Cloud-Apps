import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { detectInstalledAdobeApps } from "../src/core/adobe-detector.js";

async function runDoctor() {
  console.log("=== Junior Rocha MCP - Environment Doctor ===\n");
  const apps = await detectInstalledAdobeApps(true);

  for (const app of apps) {
    const status = app.installed ? "INSTALLED" : "NOT FOUND";
    const runState = app.running ? "RUNNING" : "stopped";
    console.log(
      `- ${app.app.padEnd(15)} : ${status} (${runState}) ${app.executablePath ? `-> ${app.executablePath}` : ""}`
    );
  }

  const home = os.homedir();
  // macOS: Adobe and Claude keep their per-user folders under ~/Library/Application Support (not AppData).
  const appData =
    process.platform === "darwin"
      ? path.join(home, "Library", "Application Support")
      : process.env.APPDATA || path.join(home, "AppData", "Roaming");
  const cepDir = path.join(appData, "Adobe", "CEP", "extensions", "com.jradbmcp.universal");
  const psUxpDir = path.join(appData, "Adobe", "UXP", "Plugins", "External", "com.jradbmcp.photoshop.uxp");
  const prUxpDir = path.join(appData, "Adobe", "UXP", "Plugins", "External", "com.jradbmcp.premiere.uxp");
  const udtWs = path.join(appData, "Adobe", "Adobe UXP Developer Tool", "plugins_workspace.json");

  console.log(`\n=== Installed Adobe Application Bridges ===`);
  console.log(`- Universal CEP Extension (AE/PPro/AI/PS) : ${fs.existsSync(cepDir) ? "INSTALLED" : "MISSING"} -> ${cepDir}`);
  console.log(`- Photoshop UXP External Plugin           : ${fs.existsSync(psUxpDir) ? "INSTALLED" : "MISSING"} -> ${psUxpDir}`);
  console.log(`- Premiere Pro UXP External Plugin        : ${fs.existsSync(prUxpDir) ? "INSTALLED" : "MISSING"} -> ${prUxpDir}`);
  console.log(`- UXP Developer Tool Workspace Registered : ${fs.existsSync(udtWs) ? "YES" : "NO"} -> ${udtWs}`);

  const agyPlugin = path.join(home, ".gemini", "config", "plugins", "jr-adb-mcp-bridge", "plugin.json");
  const claudeDesktop = path.join(appData, "Claude", "claude_desktop_config.json");
  const claudeCodeSkills = path.join(home, ".claude", "skills", "jrmcp-photoshop-expert", "SKILL.md");
  const codexToml = path.join(home, ".codex", "config.toml");

  console.log(`\n=== Installed AI Client Integrations (MCP + Skills + Rules) ===`);
  console.log(`- Antigravity Native Plugin   : ${fs.existsSync(agyPlugin) ? "INSTALLED" : "MISSING"} -> ${agyPlugin}`);
  console.log(`- Claude Desktop MCP Config   : ${fs.existsSync(claudeDesktop) ? "INSTALLED" : "MISSING"} -> ${claudeDesktop}`);
  console.log(`- Claude Code Global Skills   : ${fs.existsSync(claudeCodeSkills) ? "INSTALLED" : "MISSING"} -> ${path.dirname(path.dirname(claudeCodeSkills))}`);
  console.log(`- OpenAI GPT Codex Config     : ${fs.existsSync(codexToml) ? "INSTALLED" : "MISSING"} -> ${codexToml}`);
}

runDoctor().catch((err) => {
  console.error("Doctor failed:", err);
  process.exit(1);
});
