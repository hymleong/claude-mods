// The PowerShell that stands behind each terminal tab.
//
// The engine streams a child's output but writes its standard input once and
// closes it, so keystrokes cannot be piped into a shell. Instead the shell
// listens: this script opens one runspace (so variables, functions, modules
// and the current folder last from command to command, as in a PowerShell
// window), starts a small HTTP server on 127.0.0.1 at a free port, and takes
// commands over it. What a command prints goes to this process's stdout and
// stderr, which the hooks module reads; marks on stdout (`\x1e[[wb:...]]`)
// say the server is up, that a command started, and how it ended.
//
// Every request carries the token the hooks module put in WB_TOKEN; the
// variable is cleared at once so no command (or anything it starts) sees it.
//
// A pipe is no terminal, and Node programs that see none leave out what they
// draw for one: Expo its QR code and key menu, chalk its colours. The host
// writes a small preload to the temp folder and names it in NODE_OPTIONS, so
// every Node program run here is told its output is a terminal as wide as the
// pane's screen, and FORCE_COLOR asks for colour of every program that reads it.
// Written to run under Windows PowerShell 5.1 as well as PowerShell 7.

export const HOST_SCRIPT = String.raw`
$ErrorActionPreference = 'Continue'
$utf8 = New-Object System.Text.UTF8Encoding $false
try { [Console]::OutputEncoding = $utf8 } catch {}
$OutputEncoding = $utf8
$token = $env:WB_TOKEN
$env:WB_TOKEN = $null
$isWin = [Environment]::OSVersion.Platform -eq 'Win32NT'
$crlf = [string][char]13 + [char]10
$mark = [string][char]30 + '[[wb:'
function Out-Mark([string]$m) { [Console]::Out.WriteLine($mark + $m + ']]'); [Console]::Out.Flush() }
function To-B64([string]$s) { [Convert]::ToBase64String($utf8.GetBytes($s)) }

$tty = @'
const readline = require('readline')
const columns = Number(process.env.WB_COLUMNS) || 120
for (const s of [process.stdout, process.stderr]) {
  if (s.isTTY) continue
  s.isTTY = true; s.columns = columns; s.rows = 40
  s.getColorDepth = () => 8; s.hasColors = () => true; s.getWindowSize = () => [s.columns, s.rows]
  s.cursorTo = (x, y, cb) => readline.cursorTo(s, x, y, cb)
  s.moveCursor = (dx, dy, cb) => readline.moveCursor(s, dx, dy, cb)
  s.clearLine = (d, cb) => readline.clearLine(s, d, cb)
  s.clearScreenDown = cb => readline.clearScreenDown(s, cb)
}
if (!process.stdin.isTTY) { process.stdin.isTTY = true; process.stdin.isRaw = false; process.stdin.setRawMode = m => { process.stdin.isRaw = m; return process.stdin } }
'@
try {
  $ttyFile = Join-Path ([IO.Path]::GetTempPath()) 'workbench-tty.cjs'
  [IO.File]::WriteAllText($ttyFile, $tty)
  $req = '--require "' + ($ttyFile -replace '\\', '/') + '"'
  if (-not ([string]$env:NODE_OPTIONS).Contains($req)) { $env:NODE_OPTIONS = ($req + ' ' + $env:NODE_OPTIONS).Trim() }
  $env:FORCE_COLOR = '1'
} catch {}

$rs = [runspacefactory]::CreateRunspace($Host)
$rs.Open()

function Invoke-In([string]$code, [object[]]$params) {
  $p = [powershell]::Create(); $p.Runspace = $rs
  [void]$p.AddScript($code)
  foreach ($a in $params) { [void]$p.AddArgument($a) }
  try {
    $r = $p.Invoke()
    foreach ($e in $p.Streams.Error) { Out-Mark ('info:' + (To-B64 ([string]$e))) }
    return $r
  } catch {
    Out-Mark ('info:' + (To-B64 $_.Exception.Message))
  } finally { $p.Dispose() }
}

$start = $env:WB_CWD
if (-not $start) { $start = [Environment]::CurrentDirectory }
$prof = ''
if ($env:WB_PROFILE -eq '1') { try { $prof = [string]$PROFILE.CurrentUserCurrentHost } catch {} }
[void](Invoke-In @'
$ProgressPreference = 'SilentlyContinue'
try { $PSStyle.OutputRendering = 'PlainText' } catch {}
try { Set-Location -LiteralPath $args[0] } catch {}
if ($args[1] -and (Test-Path -LiteralPath $args[1])) { . $args[1] | Out-Null }
'@ @($start, $prof))

$WRAP = @'
$global:LASTEXITCODE = 0
$global:__wbFailed = $false
# An error as PowerShell prints one for a command typed at its prompt. Where the record
# points into this wrapper (Write-Error, a throw), the line it shows would be ours, not
# the person's: those print as one line, "Name: message", as pwsh's concise view does.
function global:__wbError($e) {
  $inv = $e.InvocationInfo
  if ($inv -ne $null -and [string]$inv.Line -like '*__wbCmd*') {
    $name = ''
    if ($inv.MyCommand -ne $null) { $name = [string]$inv.MyCommand.Name }
    if (-not $name) { $name = [string]$e.CategoryInfo.Reason }
    if ($name -eq 'WriteErrorException') { $name = 'Write-Error' }
    $msg = [string]$e.Exception.Message
    if ($e.ErrorDetails -ne $null -and $e.ErrorDetails.Message) { $msg = [string]$e.ErrorDetails.Message }
    if ($name) { return $name + ': ' + $msg }
    return $msg
  }
  return (($e | Out-String -Width $__wbWidth).TrimEnd())
}
# Run as typed, so Get-History, h and r know it, as at a PowerShell prompt.
try { Add-History -InputObject ([pscustomobject]@{ CommandLine = $__wbCmd; ExecutionStatus = 'Completed'; StartExecutionTime = [datetime]::Now; EndExecutionTime = [datetime]::Now }) } catch {}
# A line that does not parse is shown as PowerShell shows it, pointing at the fault.
$__wbParse = $null
[void][System.Management.Automation.Language.Parser]::ParseInput($__wbCmd, [ref]$null, [ref]$__wbParse)
if ($__wbParse -and $__wbParse.Count -gt 0) {
  $global:__wbFailed = $true
  $f = $__wbParse[0]
  $row = [Math]::Max(1, $f.Extent.StartLineNumber)
  $src = [regex]::Split($__wbCmd, '\r?\n')
  $text = ''
  if ($row -le $src.Length) { $text = $src[$row - 1] }
  $mark = (' ' * [Math]::Max(0, $f.Extent.StartColumnNumber - 1)) + ('~' * [Math]::Max(1, [Math]::Min(80, $f.Extent.Text.Length)))
  [Console]::Error.WriteLine('ParserError: ' + [Environment]::NewLine + 'Line |' + [Environment]::NewLine + ('{0,4} |  {1}' -f $row, $text) + [Environment]::NewLine + '     |  ' + $mark + [Environment]::NewLine + '     | ' + $f.Message)
  [Console]::Error.Flush()
  return
}
try {
  . ([scriptblock]::Create($__wbCmd)) *>&1 | ForEach-Object {
    if ($_ -is [System.Management.Automation.ErrorRecord]) {
      if ([string]$_.FullyQualifiedErrorId -like 'NativeCommandError*') { [string]$_.Exception.Message }
      else {
        $global:__wbFailed = $true
        [Console]::Error.WriteLine((__wbError $_))
        [Console]::Error.Flush()
      }
    }
    elseif ($_ -is [System.Management.Automation.WarningRecord]) { 'WARNING: ' + $_.Message }
    elseif ($_ -is [System.Management.Automation.VerboseRecord]) { 'VERBOSE: ' + $_.Message }
    elseif ($_ -is [System.Management.Automation.DebugRecord]) { 'DEBUG: ' + $_.Message }
    elseif ($_ -is [System.Management.Automation.InformationRecord]) { [string]$_.MessageData }
    else { $_ }
  } | Out-String -Stream -Width $__wbWidth | ForEach-Object { [Console]::Out.WriteLine($_); [Console]::Out.Flush() }
} catch {
  $global:__wbFailed = $true
  [Console]::Error.WriteLine((__wbError $_))
  [Console]::Error.Flush()
}
'@

$script:ps = $null
$script:handle = $null
$script:cmdId = ''
$script:stopAt = $null
$script:quit = $false
$script:lastSeen = [DateTime]::UtcNow

# Every process this shell started, and theirs, found from one snapshot before any is
# ended: npx starts cmd starts node, and once the first is gone the rest no longer trace
# back here. Ended deepest first, so nothing is left running without its parent.
function Kill-Children {
  try {
    if ($isWin) {
      $all = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name -ErrorAction Stop)
      $found = New-Object System.Collections.Generic.List[int]
      $seen = New-Object System.Collections.Generic.HashSet[int]
      [void]$seen.Add($PID)
      $queue = New-Object System.Collections.Generic.Queue[int]
      $queue.Enqueue($PID)
      while ($queue.Count -gt 0) {
        $parent = $queue.Dequeue()
        foreach ($p in $all) {
          $id = [int]$p.ProcessId
          if ([int]$p.ParentProcessId -eq $parent -and $seen.Add($id)) {
            if ($p.Name -ne 'conhost.exe') { $found.Add($id) }
            $queue.Enqueue($id)
          }
        }
      }
      for ($i = $found.Count - 1; $i -ge 0; $i--) { try { Stop-Process -Id $found[$i] -Force -ErrorAction Stop } catch {} }
    } else { & pkill -TERM -P $PID 2>&1 | Out-Null }
  } catch {}
}

function Complete-Run {
  $p = $script:ps
  $state = 'ok'
  try { [void]$p.EndInvoke($script:handle) } catch {}
  if ([string]$p.InvocationStateInfo.State -eq 'Stopped') { $state = 'stopped' }
  $exit = ''
  $cwd = ''
  try {
    $le = $rs.SessionStateProxy.GetVariable('LASTEXITCODE')
    if ($le -ne $null) { $exit = [string][int]$le }
    if ($state -eq 'ok' -and (($rs.SessionStateProxy.GetVariable('__wbFailed') -eq $true) -or ($exit -ne '' -and $exit -ne '0'))) { $state = 'fail' }
    $cwd = [string]$rs.SessionStateProxy.Path.CurrentLocation.Path
  } catch {}
  Out-Mark ('end:' + $script:cmdId + ':' + $state + ':' + $exit + ':' + (To-B64 $cwd))
  $p.Dispose()
  $script:ps = $null; $script:handle = $null; $script:cmdId = ''; $script:stopAt = $null
}

function Read-Request($ns) {
  $buf = New-Object byte[] 8192
  $ms = New-Object System.IO.MemoryStream
  $headEnd = -1
  $text = ''
  while ($headEnd -lt 0) {
    $n = $ns.Read($buf, 0, $buf.Length)
    if ($n -le 0) { return $null }
    $ms.Write($buf, 0, $n)
    $text = [Text.Encoding]::ASCII.GetString($ms.GetBuffer(), 0, [int]$ms.Length)
    $headEnd = $text.IndexOf($crlf + $crlf)
    if ($headEnd -lt 0 -and $ms.Length -gt 65536) { return $null }
  }
  $lines = $text.Substring(0, $headEnd).Split([char]10)
  $first = $lines[0].Trim().Split(' ')
  $headers = @{}
  for ($i = 1; $i -lt $lines.Length; $i++) {
    $l = $lines[$i].TrimEnd([char]13)
    $k = $l.IndexOf(':')
    if ($k -gt 0) { $headers[$l.Substring(0, $k).Trim().ToLowerInvariant()] = $l.Substring($k + 1).Trim() }
  }
  $len = 0
  if ($headers.ContainsKey('content-length')) { $len = [int]$headers['content-length'] }
  $bodyAt = $headEnd + 4
  while (($ms.Length - $bodyAt) -lt $len) {
    $n = $ns.Read($buf, 0, $buf.Length)
    if ($n -le 0) { break }
    $ms.Write($buf, 0, $n)
  }
  $body = ''
  if ($len -gt 0) { $body = $utf8.GetString($ms.GetBuffer(), $bodyAt, [Math]::Min($len, [int]$ms.Length - $bodyAt)) }
  return @{ Path = [string]$first[1]; Token = [string]$headers['x-wb-token']; Body = $body }
}

function Send-Reply($ns, [int]$code, [string]$json) {
  $b = $utf8.GetBytes($json)
  $head = "HTTP/1.1 $code OK" + $crlf + 'Content-Type: application/json; charset=utf-8' + $crlf + 'Content-Length: ' + $b.Length + $crlf + 'Connection: close' + $crlf + $crlf
  $h = [Text.Encoding]::ASCII.GetBytes($head)
  $ns.Write($h, 0, $h.Length)
  $ns.Write($b, 0, $b.Length)
  $ns.Flush()
}

function Serve($client) {
  $ns = $null
  try {
    $client.ReceiveTimeout = 3000
    $client.SendTimeout = 3000
    $ns = $client.GetStream()
    $req = Read-Request $ns
    if ($req -eq $null) { return }
    if (-not $token -or $req.Token -ne $token) { Send-Reply $ns 401 '{"error":"token"}'; return }
    $script:lastSeen = [DateTime]::UtcNow
    $body = $null
    if ($req.Body) { $body = $req.Body | ConvertFrom-Json }
    $busy = $script:handle -ne $null
    switch ($req.Path) {
      '/ping' { Send-Reply $ns 200 ('{"ok":true,"busy":' + ([string]$busy).ToLowerInvariant() + '}'); return }
      '/run' {
        if ($busy) { Send-Reply $ns 409 '{"error":"busy"}'; return }
        $id = [string]$body.id
        if ($id -notmatch '^[A-Za-z0-9_-]{1,40}$') { Send-Reply $ns 400 '{"error":"id"}'; return }
        $w = 120
        if ($body.width) { $w = [Math]::Max(40, [Math]::Min(400, [int]$body.width)) }
        $rs.SessionStateProxy.SetVariable('__wbCmd', [string]$body.cmd)
        $rs.SessionStateProxy.SetVariable('__wbWidth', $w)
        $env:WB_COLUMNS = [string]$w
        $p = [powershell]::Create(); $p.Runspace = $rs
        [void]$p.AddScript($WRAP)
        $script:ps = $p; $script:cmdId = $id; $script:stopAt = $null
        Out-Mark ('start:' + $id)
        $script:handle = $p.BeginInvoke()
        Send-Reply $ns 200 '{"ok":true}'
        return
      }
      '/stop' {
        # The programs first, while they still trace back here; then the pipeline.
        if ($busy) { Kill-Children; [void]$script:ps.BeginStop($null, $null); $script:stopAt = [DateTime]::UtcNow }
        Send-Reply $ns 200 '{"ok":true}'
        return
      }
      '/complete' {
        if ($busy) { Send-Reply $ns 200 '{"busy":true,"start":0,"length":0,"items":[]}'; return }
        $p = [powershell]::Create(); $p.Runspace = $rs
        try {
          $r = [System.Management.Automation.CommandCompletion]::CompleteInput([string]$body.text, [int]$body.cursor, $null, $p)
          $found = @($r.CompletionMatches | Select-Object -First 60 | ForEach-Object { $_.CompletionText })
          Send-Reply $ns 200 (ConvertTo-Json -Compress -Depth 3 -InputObject @{ start = $r.ReplacementIndex; length = $r.ReplacementLength; items = $found })
        } finally { $p.Dispose() }
        return
      }
      '/eval' {
        if ($busy) { Send-Reply $ns 409 '{"error":"busy"}'; return }
        $p = [powershell]::Create(); $p.Runspace = $rs
        try {
          [void]$p.AddScript([string]$body.script)
          $out = @($p.Invoke() | ForEach-Object { [string]$_ }) -join [string][char]10
          if ($out -eq '') { $out = 'null' }
          Send-Reply $ns 200 $out
        } finally { $p.Dispose() }
        return
      }
      '/exit' {
        if ($busy) { try { $script:ps.Stop() } catch {} }
        Send-Reply $ns 200 '{"ok":true}'
        $script:quit = $true
        return
      }
      default { Send-Reply $ns 404 '{"error":"route"}'; return }
    }
  } catch {
    if ($ns -ne $null) { try { Send-Reply $ns 500 (ConvertTo-Json -Compress -InputObject @{ error = $_.Exception.Message }) } catch {} }
  } finally { $client.Close() }
}

$listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback), 0
$listener.Start()
Out-Mark ('ready:' + $listener.LocalEndpoint.Port + ':' + $PID)

while (-not $script:quit) {
  if ($script:handle -ne $null -and $script:handle.IsCompleted) { Complete-Run }
  elseif ($script:stopAt -ne $null -and ([DateTime]::UtcNow - $script:stopAt).TotalSeconds -gt 2) {
    Kill-Children
    $script:stopAt = [DateTime]::UtcNow.AddSeconds(30)
  }
  if ($listener.Pending()) { Serve $listener.AcceptTcpClient() }
  else { Start-Sleep -Milliseconds 30 }
  # Nobody has asked anything for two minutes: the session that started this is gone.
  if (([DateTime]::UtcNow - $script:lastSeen).TotalSeconds -gt 120) { $script:quit = $true }
}

try { if ($script:ps -ne $null) { $script:ps.Stop() } } catch {}
Kill-Children
try { $listener.Stop() } catch {}
[Environment]::Exit(0)
`

/** A script as `-EncodedCommand` takes it: UTF-16LE, base64. */
export function encodeCommand(script: string): string {
  let bytes = ''
  for (let at = 0; at < script.length; at += 1) {
    const code = script.charCodeAt(at)
    bytes += String.fromCharCode(code & 0xff, code >> 8)
  }

  return btoa(bytes)
}

/**
 * What pwsh is given to run: a few words that take the host script from WB_HOST, clear
 * the variable so no command sees it, and run it. The script itself rides in the
 * environment, which holds 32,767 characters of it; encoded on the command line it
 * would take nearly three times that, past what Windows lets a command line hold.
 */
export const HOST_BOOT = encodeCommand('$wbHost = $env:WB_HOST; $env:WB_HOST = $null; . ([scriptblock]::Create($wbHost))')

/**
 * For the hidden host that answers the Ports view: every process's id, parent
 * and name, and for the listening ones their command line, start time and
 * memory, as one compact JSON array of arrays.
 */
export function processScript(pids: readonly number[]): string {
  const ids = pids.filter(pid => Number.isInteger(pid) && pid > 0).join(',')

  return [
    `$ids = @(${ids})`,
    `$rows = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,CommandLine,CreationDate,WorkingSetSize | ForEach-Object {`,
    `  $c = ''; $t = 0; $m = 0`,
    `  if ($ids -contains [int]$_.ProcessId) {`,
    `    $c = [string]$_.CommandLine`,
    `    if ($_.CreationDate) { $t = [long]([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() }`,
    `    $m = [long]$_.WorkingSetSize`,
    `  }`,
    `  ,@([int]$_.ProcessId, [int]$_.ParentProcessId, [string]$_.Name, $c, $t, $m)`,
    `})`,
    `ConvertTo-Json -InputObject $rows -Compress -Depth 3`,
  ].join('\n')
}
