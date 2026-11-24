# AvieBoter - release build (Windows PowerShell 5.1 or 7).
#   powershell -NoProfile -ExecutionPolicy Bypass -File source\build\build.ps1
# 1. refuses a version that already has an installer, and uncommitted changes
# 2. fetches SecondBot at the pinned commit, applies bot\avieboter.patch, publishes it (self-contained)
# 3. runs the signing test against the patched bot, checks commands.json is current
# 4. publishes the manager (self-contained), builds the installer NNN_AvieBoter-Setup-<ver>.exe,
#    the source snapshot AvieBoter-Source-<ver>.zip and SHA256SUMS-<ver>.txt in ..\installers, tags v<ver>.
# Nothing in installers\ is ever overwritten.
param([switch]$SkipInstaller)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$src   = Split-Path -Parent $PSScriptRoot
$proj  = Split-Path -Parent $src
$cache = Join-Path $proj 'build-cache'
$out   = Join-Path $proj 'installers'
$stage = Join-Path $cache 'stage'
New-Item -ItemType Directory -Force $cache, $out | Out-Null

function Step($m) { Write-Host ("== {0:HH:mm:ss} {1}" -f (Get-Date), $m) }
function Run([string]$exe, [string[]]$a) {
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & $exe @a 2>&1 | ForEach-Object { "$_" } | Where-Object { $_ -match '\S' } | ForEach-Object { Write-Host $_ }
    $code = $LASTEXITCODE; $ErrorActionPreference = $old
    if ($code -ne 0) { throw "$exe $($a -join ' ') failed (exit $code)" }
}
function GitOut([string[]]$a) {
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $r = & git @a 2>$null; $code = $LASTEXITCODE; $ErrorActionPreference = $old
    if ($code -ne 0) { throw "git $($a -join ' ') failed (exit $code)" }
    return $r
}

$ver = ([xml](Get-Content (Join-Path $src 'manager\AvieBoter.csproj'))).Project.PropertyGroup[0].Version
if (-not $ver) { throw 'No <Version> in AvieBoter.csproj' }
Step "AvieBoter $ver"
if (Get-ChildItem $out -Filter "*_AvieBoter-Setup-$ver.exe" -ErrorAction SilentlyContinue) { throw "Version $ver already has an installer in $out - bump the version." }
if (GitOut @('-C', $src, 'status', '--porcelain')) { throw 'Uncommitted changes in source - commit first.' }

# ---- SecondBot (upstream + our patch) ----
$commit = (Get-Content (Join-Path $src 'bot\UPSTREAM_COMMIT') -Raw).Trim()
$up = Join-Path $cache 'SecondBot'
if (-not (Test-Path (Join-Path $up '.git'))) {
    Step 'Cloning SecondBot'
    Run git @('-c', 'core.autocrlf=false', 'clone', '--no-checkout', 'https://github.com/Madpeterz/SecondBot.git', $up)
}
Run git @('-C', $up, 'config', 'core.autocrlf', 'false')
$have = $false
try { GitOut @('-C', $up, 'cat-file', '-e', "$commit^{commit}") | Out-Null; $have = $true } catch { }
if (-not $have) { Step 'Fetching SecondBot'; Run git @('-C', $up, 'fetch', 'origin') }
Step "SecondBot at $($commit.Substring(0,7)) + patch"
Run git @('-C', $up, 'checkout', '-q', '-f', $commit)
Run git @('-C', $up, 'clean', '-q', '-fdx')
Run git @('-C', $up, 'apply', '--whitespace=nowarn', (Join-Path $src 'bot\avieboter.patch'))

if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
Step 'Publishing the bot'
Run dotnet @('publish', (Join-Path $up 'SecondBotEvents\SecondBotEvents.csproj'), '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true',
    # a normal folder, not single-file: LibreMetaverse finds its data through Assembly.Location
    '-p:PublishSingleFile=false', '-p:DebugType=none', '-p:GenerateDocumentationFile=false',
    '-nologo', '-v', 'q', '-o', (Join-Path $stage 'bot'))
Get-ChildItem (Join-Path $stage 'bot') -Include *.pdb, *.xml -Recurse | Remove-Item -Force
foreach ($f in 'bot\SecondBotEvents.exe', 'bot\SecondBotEvents.dll', 'bot\LibreMetaverse.dll', 'bot\linden\character') {
    if (-not (Test-Path (Join-Path $stage $f))) { throw "Missing in bot build: $f" }
}

Step 'Signing test (app + HUD formats against the bot)'
Run dotnet @('run', '--project', (Join-Path $src 'tests\signtest\signtest.csproj'), '-c', 'Release', "-p:BotSrc=$up", '-nologo', '-v', 'q')

Step 'Core test (manager storage)'
$env:AVIEBOTER_DATA = Join-Path $cache 'coretest-data'
Run dotnet @('run', '--project', (Join-Path $src 'tests\coretest\coretest.csproj'), '-c', 'Release', '-nologo', '-v', 'q')
Remove-Item Env:AVIEBOTER_DATA

$py = (Get-Command python -ErrorAction SilentlyContinue)
if ($py) {
    Step 'Checking commands.json against the patched bot'
    $tmp = Join-Path $cache 'commands.check.json'
    Run $py.Source @('-I', (Join-Path $src 'build\extract-commands.py'), (Join-Path $up 'SecondBotEvents'), $tmp)
    $a = (Get-Content $tmp -Raw | ConvertFrom-Json | ForEach-Object { $_.name }) -join ','
    $b = (Get-Content (Join-Path $src 'manager\wwwroot\commands.json') -Raw | ConvertFrom-Json | ForEach-Object { $_.name }) -join ','
    if ($a -ne $b) { throw 'manager\wwwroot\commands.json is out of date - regenerate it with build\extract-commands.py' }
    Step 'Checking hud\hud.json (the HUD manifest the app reads from GitHub)'
    Run $py.Source @('-I', (Join-Path $src 'build\hud-manifest.py'), '--check')
} else { Write-Host 'python not found - commands.json not re-checked' }

# ---- manager ----
Step 'Publishing the manager'
Run dotnet @('publish', (Join-Path $src 'manager\AvieBoter.csproj'), '-c', 'Release', '-nologo', '-v', 'q', '-o', $stage)
Get-ChildItem $stage -Filter *.pdb | Remove-Item -Force
Copy-Item (Join-Path $src 'LICENSE') (Join-Path $stage 'LICENSE.txt')
Copy-Item (Join-Path $src 'THIRD-PARTY-NOTICES.md') (Join-Path $stage 'THIRD-PARTY-NOTICES.txt')
Copy-Item (Join-Path $src 'manager\Assets') (Join-Path $stage 'Assets') -Recurse -Force
if (Test-Path (Join-Path $stage 'wwwroot\usernotes\README.md')) { throw 'usernotes\README.md must not ship' }
foreach ($f in 'AvieBoter.exe', 'THIRD-PARTY-NOTICES.txt', 'wwwroot\index.html', 'wwwroot\hud\AvieBoterHUD.lsl', 'wwwroot\commands.json', 'wwwroot\usernotes\usernotes-ui.js', 'Microsoft.Web.WebView2.Core.dll') {
    if (-not (Test-Path (Join-Path $stage $f))) { throw "Missing in build: $f" }
}
# The HUD script shipped in the app must be the one in source\hud
foreach ($h in 'AvieBoterHUD.lsl', 'AvieBoterHUDMenu.lsl', 'AvieBoterHUDUpdater.lsl') {
    if ((Get-FileHash (Join-Path $src "hud\$h")).Hash -ne (Get-FileHash (Join-Path $stage "wwwroot\hud\$h")).Hash) { throw "wwwroot\hud\$h differs from hud\$h" }
}

if ($SkipInstaller) { Step "Done (no installer). Stage: $stage"; return }

# ---- WebView2 bootstrapper (used by the installer only on PCs without the runtime) ----
$wv = Join-Path $cache 'MicrosoftEdgeWebview2Setup.exe'
if (-not (Test-Path $wv)) {
    Step 'Downloading the WebView2 bootstrapper'
    Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $wv -UseBasicParsing
}
$sig = Get-AuthenticodeSignature $wv
if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') { throw 'WebView2 bootstrapper signature is not a valid Microsoft signature' }

# ---- installer, source snapshot, checksums ----
$n = @(Get-ChildItem $out -Filter '*_AvieBoter-Setup-*.exe' -ErrorAction SilentlyContinue).Count + 1
$name = ('{0:D3}_AvieBoter-Setup-{1}' -f $n, $ver)
$iscc = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'
$made = @()
try {
    Step "Installer $name.exe"
    Run $iscc @('/Q', "/DAppVersion=$ver", "/DStageDir=$stage", "/DOutDir=$out", "/DOutName=$name", "/DRedistDir=$cache", (Join-Path $src 'installer\AvieBoter.iss'))
    $made += Join-Path $out "$name.exe"
    $zip = Join-Path $out "AvieBoter-Source-$ver.zip"
    if (Test-Path $zip) { throw "$zip already exists" }
    Step 'Source snapshot'
    Run git @('-C', $src, 'archive', '--format', 'zip', '--prefix', "AvieBoter-$ver/", '-o', $zip, 'HEAD')
    $made += $zip
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $z = [IO.Compression.ZipFile]::OpenRead($zip)
    $inZip = @($z.Entries | Where-Object { $_.FullName -notmatch '/$' } | ForEach-Object { $_.FullName.Substring("AvieBoter-$ver/".Length) }) | Sort-Object
    $z.Dispose()
    $inGit = @(GitOut @('-C', $src, 'ls-tree', '-r', '--name-only', 'HEAD')) | Sort-Object
    if (($inZip -join "`n") -ne ($inGit -join "`n")) { throw 'Source zip does not match git ls-tree' }
    $sums = Join-Path $out "SHA256SUMS-$ver.txt"
    ($made | ForEach-Object { '{0}  {1}' -f (Get-FileHash $_ -Algorithm SHA256).Hash.ToLower(), (Split-Path -Leaf $_) }) | Set-Content -Encoding ascii $sums
    Run git @('-C', $src, 'tag', "v$ver")
}
catch {
    foreach ($f in $made) { Remove-Item -Force $f -ErrorAction SilentlyContinue }
    throw
}
Step "Done: $out\$name.exe"
