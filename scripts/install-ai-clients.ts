import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const distIndexJs = path.join(repoRoot, "dist", "index.js").replace(/\\/g, "/");

function copyDirectoryRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function installAntigravityPlugin(): string {
  const home = os.homedir();
  const pluginDir = path.join(home, ".gemini", "config", "plugins", "jr-adb-mcp-bridge");
  fs.mkdirSync(path.join(pluginDir, "assets"), { recursive: true });
  fs.mkdirSync(path.join(pluginDir, "rules"), { recursive: true });
  fs.mkdirSync(path.join(pluginDir, "skills"), { recursive: true });

  const pluginJson = {
    name: "jr-adb-mcp-bridge",
    displayName: "JuniorRocha MCP for Adobe Creative Cloud",
    version: "1.0.0",
    description:
      "Full 100% API control of Adobe Photoshop, After Effects, Premiere Pro, and Illustrator via MCP, with specialized domain skills and cheatsheets.",
    logo: "assets/logo.svg",
    suggestedPrompts: [
      "Check the status of all installed Adobe applications using jradb_get_status",
      "Create a 1920x1080 composition in After Effects with a smooth Bezier-animated shape layer",
      "Create a vector illustration in Illustrator using Bezier curves and show me the artboard preview"
    ]
  };
  fs.writeFileSync(path.join(pluginDir, "plugin.json"), JSON.stringify(pluginJson, null, 2), "utf-8");

  const mcpConfig = {
    mcpServers: {
      "jr-adb-mcp-bridge": {
        command: "node",
        args: [distIndexJs, "--apps", "all"]
      }
    }
  };
  fs.writeFileSync(path.join(pluginDir, "mcp_config.json"), JSON.stringify(mcpConfig, null, 2), "utf-8");

  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <rect x="12" y="12" width="104" height="104" rx="22" fill="#0F172A" stroke="#38BDF8" stroke-width="6"/>
  <path d="M42 92L64 36L86 92H73L68 78H52L59 60L65 76" fill="none" stroke="#F43F5E" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="92" cy="38" r="8" fill="#A855F7"/>
</svg>`;
  fs.writeFileSync(path.join(pluginDir, "assets", "logo.svg"), logoSvg, "utf-8");

  const agentsMd = fs.readFileSync(path.join(repoRoot, "AGENTS.md"), "utf-8");
  fs.writeFileSync(path.join(pluginDir, "rules", "AGENTS.md"), agentsMd, "utf-8");
  fs.writeFileSync(path.join(pluginDir, "README.md"), agentsMd, "utf-8");

  const workspaceSkillsDir = path.join(repoRoot, ".agents", "skills");
  copyDirectoryRecursive(workspaceSkillsDir, path.join(pluginDir, "skills"));

  return pluginDir;
}

function installClaudeDesktopAndCode(): { desktopConfigPath: string; claudeCodeDir: string } {
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  const claudeDesktopDir = path.join(appData, "Claude");
  fs.mkdirSync(claudeDesktopDir, { recursive: true });
  const desktopConfigPath = path.join(claudeDesktopDir, "claude_desktop_config.json");

  let configObj: Record<string, any> = { mcpServers: {} };
  if (fs.existsSync(desktopConfigPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(desktopConfigPath, "utf-8"));
      if (parsed && typeof parsed === "object") {
        configObj = parsed;
      }
    } catch (err) {
      // Never overwrite a config we could not read: that would silently drop the user's other MCP servers.
      throw new Error(
        `${desktopConfigPath} is not valid JSON (${err instanceof Error ? err.message : String(err)}). Fix it and run again; nothing was changed.`
      );
    }
  }
  if (!configObj.mcpServers || typeof configObj.mcpServers !== "object") {
    configObj.mcpServers = {};
  }
  configObj.mcpServers["jr-adb-mcp-bridge"] = {
    command: "node",
    args: [distIndexJs, "--apps", "all"]
  };
  fs.writeFileSync(desktopConfigPath, JSON.stringify(configObj, null, 2), "utf-8");

  // Also install into ~/.claude/skills and ~/.claude/CLAUDE.md for Claude Code
  const claudeCodeDir = path.join(home, ".claude");
  fs.mkdirSync(path.join(claudeCodeDir, "skills"), { recursive: true });
  copyDirectoryRecursive(path.join(repoRoot, ".agents", "skills"), path.join(claudeCodeDir, "skills"));

  const claudeMdPath = path.join(claudeCodeDir, "CLAUDE.md");
  const marker = "<!-- ADOBE-UNIFIED-MCP-RULES -->";
  const agentsContent = `\n${marker}\n${fs.readFileSync(path.join(repoRoot, "AGENTS.md"), "utf-8")}\n`;
  if (fs.existsSync(claudeMdPath)) {
    const existing = fs.readFileSync(claudeMdPath, "utf-8");
    if (!existing.includes(marker)) {
      fs.writeFileSync(claudeMdPath, existing + agentsContent, "utf-8");
    }
  } else {
    fs.writeFileSync(claudeMdPath, agentsContent.trimStart(), "utf-8");
  }

  return { desktopConfigPath, claudeCodeDir };
}

function installCodexConfig(): string {
  const home = os.homedir();
  const codexDir = path.join(home, ".codex");
  fs.mkdirSync(path.join(codexDir, "skills"), { recursive: true });

  // 1. Copy skills to ~/.codex/skills
  copyDirectoryRecursive(path.join(repoRoot, ".agents", "skills"), path.join(codexDir, "skills"));

  // 2. Append/Create ~/.codex/AGENTS.md
  const codexAgentsPath = path.join(codexDir, "AGENTS.md");
  const marker = "<!-- ADOBE-UNIFIED-MCP-RULES -->";
  const agentsContent = `\n${marker}\n${fs.readFileSync(path.join(repoRoot, "AGENTS.md"), "utf-8")}\n`;
  if (fs.existsSync(codexAgentsPath)) {
    const existing = fs.readFileSync(codexAgentsPath, "utf-8");
    if (!existing.includes(marker)) {
      fs.writeFileSync(codexAgentsPath, existing + agentsContent, "utf-8");
    }
  } else {
    fs.writeFileSync(codexAgentsPath, agentsContent.trimStart(), "utf-8");
  }

  // 3. Configure ~/.codex/config.toml
  const configTomlPath = path.join(codexDir, "config.toml");
  const tomlBlock = `\n[mcp_servers.jr-adb-mcp-bridge]\ncommand = "node"\nargs = ["${distIndexJs}", "--apps", "all"]\n`;
  if (fs.existsSync(configTomlPath)) {
    const existingToml = fs.readFileSync(configTomlPath, "utf-8");
    if (!existingToml.includes("[mcp_servers.jr-adb-mcp-bridge]")) {
      fs.writeFileSync(configTomlPath, existingToml + tomlBlock, "utf-8");
    }
  } else {
    fs.writeFileSync(configTomlPath, tomlBlock.trimStart(), "utf-8");
  }

  return codexDir;
}

function main() {
  console.log("=== Junior Rocha MCP - AI Clients & Skills Installer ===");

  const agyPluginDir = installAntigravityPlugin();
  console.log(`[OK] Installed Native Antigravity Plugin (MCP + 5 Skills + Rules) at:\n     ${agyPluginDir}`);

  const claudeResult = installClaudeDesktopAndCode();
  console.log(`[OK] Configured Claude Desktop MCP at:\n     ${claudeResult.desktopConfigPath}`);
  console.log(`[OK] Installed Claude Code Global Skills & CLAUDE.md at:\n     ${claudeResult.claudeCodeDir}`);

  const codexDir = installCodexConfig();
  console.log(`[OK] Configured OpenAI GPT Codex (config.toml + AGENTS.md + skills/) at:\n     ${codexDir}`);
}

main();
