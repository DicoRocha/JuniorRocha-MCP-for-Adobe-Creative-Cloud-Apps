#!/bin/bash
# Junior Rocha MCP - installs the bridges for After Effects, Illustrator and Lightroom Classic on macOS.
# No Node.js needed. Close the apps first. Photoshop, Premiere Pro and InDesign use the .ccx files instead.
# If macOS refuses to run it: chmod +x INSTALL-BRIDGES.command
cd "$(dirname "$0")" || exit 1
SUPPORT="$HOME/Library/Application Support/Adobe"
CEP="$SUPPORT/CEP/extensions/com.jradbmcp.universal"
LR="$SUPPORT/Lightroom/Modules/JrAdbMcpBridge.lrplugin"

if [ ! -f "com.jradbmcp.universal/CSXS/manifest.xml" ]; then
  echo "The folder com.jradbmcp.universal is missing. Extract the whole zip before running this file."
  exit 1
fi

echo "Installing the panel for After Effects and Illustrator..."
mkdir -p "$SUPPORT/CEP/extensions" && rm -rf "$CEP" && cp -R "com.jradbmcp.universal" "$CEP" || { echo "Could not copy to $CEP"; exit 1; }

# The panel is not signed, so the apps load it only with the CEP debug mode on.
for v in 9 10 11 12 13 14; do defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1 2>/dev/null; done
killall -u "$USER" cfprefsd 2>/dev/null

echo "Installing the Lightroom Classic plug-in..."
mkdir -p "$SUPPORT/Lightroom/Modules" && rm -rf "$LR" && cp -R "JrAdbMcpBridge.lrplugin" "$LR" || echo "Could not copy to $LR (skip this if you do not use Lightroom Classic)"

echo ""
echo "Done. Restart After Effects, Illustrator and Lightroom Classic."
echo "The panel is listed as \"Junior Rocha MCP\" under Window > Extensions; you do not need to open it."
