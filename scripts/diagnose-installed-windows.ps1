$ErrorActionPreference = 'Stop'
$root = Join-Path $env:RUNNER_TEMP 'wisa-installed-diagnostics'
$evidence = Join-Path $root 'evidence'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null

function Save-Evidence($name, $value) {
  $json = $value | ConvertTo-Json -Depth 12
  [IO.File]::WriteAllText((Join-Path $evidence $name), $json)
  Write-Host "$name $json"
}

function Download-Pinned($name, $sha256) {
  $path = Join-Path $root $name
  Invoke-WebRequest -Uri "https://github.com/smokeyduck/wisa-studio/releases/download/v0.9.52/$name" -OutFile $path
  $actual = (Get-FileHash $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $sha256) { throw "Published asset hash mismatch: $name" }
  Save-Evidence "$name.sha256.json" @{ name = $name; sha256 = $actual; bytes = (Get-Item $path).Length }
  return $path
}

Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class OwnedWindows {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint id);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder text, int max);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder text, int max);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  static string Text(IntPtr h) { var text = new StringBuilder(4096); GetWindowText(h, text, text.Capacity); return text.ToString(); }
  public static List<string> Read(int[] ids) {
    var owned = new HashSet<int>(ids); var result = new List<string>();
    EnumWindows((h, p) => { uint id; GetWindowThreadProcessId(h, out id); if (!owned.Contains((int)id)) return true;
      var cls = new StringBuilder(256); GetClassName(h, cls, cls.Capacity);
      result.Add("pid=" + id + " visible=" + IsWindowVisible(h) + " class=" + cls + " title=" + Text(h));
      if (cls.ToString() == "#32770") EnumChildWindows(h, (c, q) => { var t = Text(c); if (t.Length > 0) result.Add("dialog-child: " + t); return true; }, IntPtr.Zero);
      return true;
    }, IntPtr.Zero);
    return result;
  }
}
'@

function Child-Environment($info, $profile) {
  $info.Environment.Clear()
  # Explicit OS-only allowlist: no CI/provider/GitHub credentials reach installed app.
  foreach ($key in @('SystemRoot','WINDIR','COMSPEC','PATH','PATHEXT','TEMP','TMP','USERPROFILE','HOME','HOMEDRIVE','HOMEPATH','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramFiles(x86)','ProgramData','ALLUSERSPROFILE','PUBLIC','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','USERDOMAIN','USERNAME')) {
    $value = [Environment]::GetEnvironmentVariable($key)
    if ($null -ne $value) { $info.Environment[$key] = $value }
  }
  $info.Environment['WISA_PROFILE_ROOT'] = $profile
}

function Get-Owned($mainId) {
  $all = @(Get-CimInstance Win32_Process)
  $ids = [Collections.Generic.HashSet[int]]::new()
  [void]$ids.Add($mainId)
  do {
    $changed = $false
    foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $changed = $true } }
  } while ($changed)
  return @($all | Where-Object { $ids.Contains([int]$_.ProcessId) })
}

function Get-EffectivePaths {
  $target = @(Invoke-RestMethod 'http://127.0.0.1:9231/json/list' -TimeoutSec 2)[0]
  $socket = [Net.WebSockets.ClientWebSocket]::new()
  $cancel = [Threading.CancellationTokenSource]::new(5000)
  try {
    $socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, $cancel.Token).GetAwaiter().GetResult()
    $expression = "(() => { const app = process.getBuiltinModule('module').createRequire(process.cwd() + '/diagnostic.cjs')('electron').app; return { userData: app.getPath('userData'), sessionData: app.getPath('sessionData'), temp: app.getPath('temp'), logs: app.getPath('logs'), appData: app.getPath('appData'), homedir: process.getBuiltinModule('os').homedir() }; })()"
    $request = @{ id = 1; method = 'Runtime.evaluate'; params = @{ expression = $expression; returnByValue = $true } } | ConvertTo-Json -Depth 5 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($request)
    $socket.SendAsync([ArraySegment[byte]]::new($bytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, $cancel.Token).GetAwaiter().GetResult()
    $buffer = [byte[]]::new(65536)
    do {
      $received = $socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), $cancel.Token).GetAwaiter().GetResult()
      $response = [Text.Encoding]::UTF8.GetString($buffer, 0, $received.Count) | ConvertFrom-Json
    } while ($response.id -ne 1)
    if ($response.result.exceptionDetails) { throw 'Read-only inspector path query failed' }
    $paths = $response.result.result.value
    return @{ userData = $paths.userData; sessionData = $paths.sessionData; temp = $paths.temp; logs = $paths.logs; appData = $paths.appData; homedir = $paths.homedir }
  } finally { $socket.Dispose(); $cancel.Dispose() }
}

function Trace-Launch($exe, $label, $arguments = '', $normalPaths = $false) {
  $profile = if ($normalPaths) { Join-Path $root 'normal user Người dùng có dấu' } else { Join-Path $root "profile-$label" }
  New-Item -ItemType Directory -Path $profile -Force | Out-Null
  $info = [Diagnostics.ProcessStartInfo]::new($exe)
  $info.UseShellExecute = $false
  $info.RedirectStandardError = $true
  $info.RedirectStandardOutput = $true
  $info.WorkingDirectory = $root
  $info.Arguments = $arguments
  Child-Environment $info $profile
  if ($normalPaths) {
    [void]$info.Environment.Remove('WISA_PROFILE_ROOT')
    $info.Environment['HOME'] = $profile
    $info.Environment['USERPROFILE'] = $profile
    $info.Environment['APPDATA'] = Join-Path $profile 'AppData\Roaming'
    $info.Environment['LOCALAPPDATA'] = Join-Path $profile 'AppData\Local'
    New-Item -ItemType Directory -Path $info.Environment['APPDATA'], $info.Environment['LOCALAPPDATA'] -Force | Out-Null
  }
  $process = [Diagnostics.Process]::Start($info)
  $stderr = $process.StandardError.ReadToEndAsync()
  $stdout = $process.StandardOutput.ReadToEndAsync()
  $history = [Collections.Generic.List[object]]::new()
  $windows = [Collections.Generic.HashSet[string]]::new()
  $ownedIds = [Collections.Generic.HashSet[int]]::new()
  [void]$ownedIds.Add($process.Id)
  $timer = [Diagnostics.Stopwatch]::StartNew()
  $rendererSeen = $false
  $pathsCaptured = $false
  try {
    while ($timer.Elapsed.TotalSeconds -lt 35) {
      $owned = @(Get-Owned $process.Id)
      foreach ($p in $owned) { [void]$ownedIds.Add([int]$p.ProcessId) }
      foreach ($window in [OwnedWindows]::Read([int[]]@($ownedIds))) { [void]$windows.Add($window) }
      $renderers = @($owned | Where-Object { $_.CommandLine -match '--type=renderer' })
      if ($renderers.Count -gt 0) { $rendererSeen = $true }
      $process.Refresh()
      if ($arguments -match '--inspect=' -and -not $pathsCaptured -and $timer.Elapsed.TotalSeconds -gt 3) {
        try { Save-Evidence "$label-effective-paths.json" (Get-EffectivePaths); $pathsCaptured = $true } catch { Save-Evidence "$label-path-query-error.json" @{ failure = $_.Exception.GetType().Name; message = 'Read-only effective-path inspector query did not complete' } }
      }
      $history.Add(@{ elapsedMs = $timer.ElapsedMilliseconds; exited = $process.HasExited; ownedProcesses = @($owned | ForEach-Object { @{ pid = $_.ProcessId; parent = $_.ParentProcessId; executable = $_.ExecutablePath; role = if ($_.CommandLine -match '--type=([^ ]+)') { $Matches[1] } else { 'main-or-sidecar' } } }); rendererCount = $renderers.Count })
      if ($process.HasExited -and $owned.Count -eq 0) { break }
      Start-Sleep -Milliseconds 1000
    }
    $process.Refresh()
    $result = @{ label = $label; executable = $exe; arguments = $arguments; mainPid = $process.Id; mainAlive = -not $process.HasExited; exitCode = if ($process.HasExited) { $process.ExitCode } else { $null }; rendererSeen = $rendererSeen; windows = @($windows); samples = @($history.ToArray()) }
    Save-Evidence "$label-process.json" $result
    $runtime = Join-Path $profile 'appData\wisa-studio\logs\gui-runtime.jsonl'
    if (Test-Path $runtime) { Copy-Item $runtime (Join-Path $evidence "$label-runtime.jsonl") }
    Save-Evidence "$label-profile-files.json" @(Get-ChildItem $profile -Recurse -File | ForEach-Object { @{ path = $_.FullName.Substring($profile.Length); bytes = $_.Length } })
    if ($normalPaths) {
      $realUserData = Join-Path $env:APPDATA 'wisa-studio'
      Save-Evidence "$label-knownfolder-files.json" @(Get-ChildItem $realUserData -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { @{ path = $_.FullName.Substring($realUserData.Length); bytes = $_.Length } })
      $normalRuntime = Join-Path $realUserData 'logs\gui-runtime.jsonl'
      if (Test-Path $normalRuntime) { Copy-Item $normalRuntime (Join-Path $evidence "$label-normal-runtime.jsonl") }
    }
    return $result
  } finally {
    foreach ($id in @($ownedIds)) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
    if ($stderr.Wait(5000)) { [IO.File]::WriteAllText((Join-Path $evidence "$label-stderr.txt"), $stderr.Result) }
    if ($stdout.Wait(5000)) { [IO.File]::WriteAllText((Join-Path $evidence "$label-stdout.txt"), $stdout.Result) }
  }
}

$setup = Download-Pinned 'wisa-studio-0.9.52-setup.exe' '204a98919f6ebea002ea8ee55694a764d773cbfde4b65e332192f9a47553de10'
$installed = Join-Path $root 'installed WISA STUDIO'
$installInfo = [Diagnostics.ProcessStartInfo]::new($setup)
$installInfo.UseShellExecute = $false
$installInfo.Arguments = "/S /currentuser /D=$installed"
Child-Environment $installInfo (Join-Path $root 'profile-install')
$install = [Diagnostics.Process]::Start($installInfo)
$installHistory = [Collections.Generic.List[object]]::new()
$installWindows = [Collections.Generic.HashSet[string]]::new()
$installTimer = [Diagnostics.Stopwatch]::StartNew()
$autoLaunchAt = $null
while (-not $install.HasExited -and $installTimer.Elapsed.TotalSeconds -lt 300) {
  $owned = @(Get-Owned $install.Id)
  foreach ($window in [OwnedWindows]::Read([int[]]@($owned | ForEach-Object { $_.ProcessId }))) { [void]$installWindows.Add($window) }
  $autoApp = @($owned | Where-Object { $_.ExecutablePath -eq (Join-Path $installed 'WISA STUDIO.exe') })
  $installHistory.Add(@{ elapsedMs = $installTimer.ElapsedMilliseconds; processes = @($owned | ForEach-Object { @{ pid = $_.ProcessId; parent = $_.ParentProcessId; name = $_.Name; executable = $_.ExecutablePath; renderer = $_.CommandLine -match '--type=renderer' } }); installedFiles = @(Get-ChildItem $installed -File -ErrorAction SilentlyContinue).Count; installedExeExists = Test-Path (Join-Path $installed 'WISA STUDIO.exe'); autoAppCount = $autoApp.Count })
  if ($autoApp.Count -gt 0 -and $null -eq $autoLaunchAt) { $autoLaunchAt = $installTimer.Elapsed.TotalSeconds }
  if ($autoApp.Count -gt 0 -and ($installTimer.Elapsed.TotalSeconds - $autoLaunchAt) -gt 12) {
    Save-Evidence 'installer-auto-launched-app.json' @{ windows = @($installWindows); samples = @($installHistory.ToArray()); note = 'Installer-owned app observed before installer exit; stopping only that owned app to release run-after-finish wait.' }
    foreach ($p in $autoApp) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
  }
  Start-Sleep -Seconds 2
  $install.Refresh()
}
Save-Evidence 'installation.json' @{ exited = $install.HasExited; exitCode = if ($install.HasExited) { $install.ExitCode } else { $null }; destination = $installed; switches = '/S /currentuser /D=<runner-owned path> (D last, no quotes)'; windows = @($installWindows); samples = @($installHistory.ToArray()) }
if (-not $install.HasExited) { $install.Kill($true); throw 'NSIS install timeout; see installation.json owned dialogs/processes' }
if ($install.ExitCode -ne 0) { throw "NSIS installation failed: $($install.ExitCode)" }
$exe = Join-Path $installed 'WISA STUDIO.exe'
if (-not (Test-Path $exe)) { throw 'Installed GUI executable missing' }
Save-Evidence 'installed-payload.json' @(Get-ChildItem $installed -Recurse -File | ForEach-Object { @{ path = $_.FullName.Substring($installed.Length); bytes = $_.Length; sha256 = if ($_.Extension -in @('.exe','.dll','.asar')) { (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() } else { $null } } })
$shell = New-Object -ComObject WScript.Shell
Save-Evidence 'shortcuts.json' @(foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('StartMenu'))) { Get-ChildItem $folder -Recurse -Filter '*WISA*.lnk' -ErrorAction SilentlyContinue | ForEach-Object { $shortcut = $shell.CreateShortcut($_.FullName); @{ path = $_.FullName; target = $shortcut.TargetPath; arguments = $shortcut.Arguments; workingDirectory = $shortcut.WorkingDirectory } } })
$plain = Trace-Launch $exe 'normal-plain' '' $true
# The separate inspector launch reads only effective app paths, after plain startup evidence.
$null = Trace-Launch $exe 'normal-path-inspector' '--inspect=127.0.0.1:9231' $true
if (-not $plain.mainAlive -or -not $plain.rendererSeen -or ($plain.windows -join "`n") -match '#32770') {
  $null = Trace-Launch $exe 'normal-logging' '--enable-logging=stderr --v=1' $true
}
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
$dumpbin = Get-ChildItem "$vs\VC\Tools\MSVC\*\bin\Hostx64\x64\dumpbin.exe" | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if ($dumpbin) {
  foreach ($binary in @($exe, (Join-Path $installed 'resources\omp.exe')) + @(Get-ChildItem (Join-Path $root 'normal user Người dùng có dấu') -Recurse -Filter '*.node' | Select-Object -ExpandProperty FullName)) {
    & $dumpbin /nologo /dependents $binary | Out-File (Join-Path $evidence "$([IO.Path]::GetFileName($binary))-dependents.txt")
  }
}
Save-Evidence 'diagnostic-summary.json' @{ plainInstalledMainAlive = $plain.mainAlive; plainInstalledRendererSeen = $plain.rendererSeen; plainInstalledWindows = $plain.windows; release = 'v0.9.52'; scope = 'exact public NSIS, real installed path, WISA_PROFILE_ROOT absent, process-only APPDATA/USERPROFILE/HOME fixture with spaces and Unicode, no app arguments on first launch'; runner = $env:ImageOS }
