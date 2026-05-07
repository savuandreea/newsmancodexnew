param(
    [string]$PluginName = "newsman-ai-sync"
)

$ErrorActionPreference = "Stop"

$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$homeDir = [Environment]::GetFolderPath("UserProfile")
$pluginRoot = Join-Path $homeDir "plugins\$PluginName"
$marketplaceDir = Join-Path $homeDir ".agents\plugins"
$marketplacePath = Join-Path $marketplaceDir "marketplace.json"

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $pluginRoot) | Out-Null
New-Item -ItemType Directory -Force -Path $marketplaceDir | Out-Null

if (Test-Path -LiteralPath $pluginRoot) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backup = "$pluginRoot.backup-$stamp"
    Move-Item -LiteralPath $pluginRoot -Destination $backup
    Write-Host "Existing plugin backed up to $backup"
}

New-Item -ItemType Directory -Force -Path $pluginRoot | Out-Null
$items = @(
    ".codex-plugin",
    "assets",
    "scripts",
    "skills",
    ".app.json",
    ".mcp.json",
    "README.md",
    ".env.example",
    ".gitignore"
)

foreach ($item in $items) {
    $src = Join-Path $sourceRoot $item
    if (Test-Path -LiteralPath $src) {
        Copy-Item -LiteralPath $src -Destination $pluginRoot -Recurse -Force
    }
}

$marketplace = @{
    name = "andreea-local"
    interface = @{
        displayName = "Andreea Local"
    }
    plugins = @()
}

if (Test-Path -LiteralPath $marketplacePath) {
    $raw = Get-Content -LiteralPath $marketplacePath -Raw
    if ($raw.Trim()) {
        $marketplace = $raw | ConvertFrom-Json -Depth 20
    }
}

$plugins = @($marketplace.plugins | Where-Object { $_.name -ne $PluginName })
$plugins += [pscustomobject]@{
    name = $PluginName
    source = [pscustomobject]@{
        source = "local"
        path = "./plugins/$PluginName"
    }
    policy = [pscustomobject]@{
        installation = "AVAILABLE"
        authentication = "ON_INSTALL"
    }
    category = "Productivity"
}
$marketplace.plugins = $plugins
$marketplace | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $marketplacePath -Encoding UTF8

Write-Host "Installed NewsMAN AI Sync plugin to $pluginRoot"
Write-Host "Updated marketplace at $marketplacePath"
Write-Host ""
Write-Host "Set credentials separately on each PC, then restart Codex:"
Write-Host 'setx NEWSMAN_USER_ID "your-user-id"'
Write-Host 'setx NEWSMAN_API_KEY "your-api-key"'
