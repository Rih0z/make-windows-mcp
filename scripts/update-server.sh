#!/bin/bash

# Windows MCP Server Update Script for Claude Code
# This script demonstrates the MCP commands to update the Windows server

echo "=== Windows MCP Server Update Commands ==="
echo ""
echo "Choose one of the following commands to run in your Claude Code environment:"
echo ""

echo "1. Recommended: Use npm update command"
echo "   @windows-build-server run_powershell command=\"cd C:\\mcp-server && npm run update\""
echo ""

echo "2. Direct PowerShell script execution"
echo "   @windows-build-server run_powershell command=\"cd C:\\mcp-server && powershell -ExecutionPolicy Bypass -File .\\server\\setup\\update-from-git.ps1\""
echo ""

echo "3. Dangerous mode: Use MCP self-build tool"
echo "   @windows-build-server mcp_self_build action=\"update\" options='{\"autoStart\": true}'"
echo ""

echo "4. Check server status first"
echo "   @windows-build-server run_powershell command=\"cd C:\\mcp-server && npm run dangerous\""
echo ""

echo "=== Expected Update Process ==="
echo "1. Backup current configuration"
echo "2. Clone latest version from GitHub"
echo "3. Clean and refresh server files"
echo "4. Update dependencies"
echo "5. Update environment configuration"
echo "6. Restart server"
echo ""

echo "=== After Update ==="
echo "- Default timeout will be 30 minutes (1800 seconds)"
echo "- All latest features will be available"
echo "- Existing .env settings will be preserved"
echo ""

echo "Please copy and paste one of the above commands into your Claude Code terminal."