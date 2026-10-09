param(
  [switch]$Run,
  [string]$PairingCode
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$BaseDir = Join-Path $env:LOCALAPPDATA "ShiftboardCameraBridge"
$InstallScript = Join-Path $BaseDir "chester-camera-bridge.ps1"
$SettingsFile = Join-Path $BaseDir "settings.json"
$PasswordFile = Join-Path $BaseDir "dvr-password.dpapi"
$BridgeTokenFile = Join-Path $BaseDir "bridge-token.dpapi"
$Go2RtcExe = Join-Path $BaseDir "go2rtc.exe"
$Go2RtcConfig = Join-Path $BaseDir "go2rtc.yaml"
$Go2RtcOut = Join-Path $BaseDir "go2rtc.out.log"
$Go2RtcErr = Join-Path $BaseDir "go2rtc.err.log"
$CloudflaredExe = Join-Path $BaseDir "cloudflared.exe"
$CloudflaredOut = Join-Path $BaseDir "cloudflared.out.log"
$CloudflaredErr = Join-Path $BaseDir "cloudflared.err.log"
$BridgeLog = Join-Path $BaseDir "bridge.log"

$SupabaseFunction = "https://disgpocvqitpeceqhuim.supabase.co/functions/v1/camera-bridge"
$PublishableKey = "sb_publishable_4L6l31SywNvyXrYQdXj4DQ_yz-Td6Xk"

$Go2RtcZipUrl = "https://github.com/AlexxIT/go2rtc/releases/download/v1.9.14/go2rtc_win64.zip"
$Go2RtcZipSha256 = "dd4167d75cb04abe618855b7c71f8658bd009f60c1a71835d134d2c11c939907"
$CloudflaredUrl = "https://github.com/cloudflare/cloudflared/releases/download/2026.10.0/cloudflared-windows-amd64.exe"
$CloudflaredSha256 = "86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c"

$DvrHost = "192.168.1.10"
$DvrPort = 34567
$DvrUser = "admin"
$ChannelCount = 16

function Write-BridgeLog([string]$Message) {
  try {
    New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null
    Add-Content -Path $BridgeLog -Value ("{0:u} {1}" -f (Get-Date), $Message)
  } catch {}
}

function Protect-String([string]$Plain, [string]$Path) {
  $Secure = ConvertTo-SecureString -String $Plain -AsPlainText -Force
  $Secure | ConvertFrom-SecureString | Set-Content -Path $Path -Encoding UTF8
}

function Unprotect-String([string]$Path) {
  if (!(Test-Path $Path)) { return $null }
  $Cipher = (Get-Content -Path $Path -Raw).Trim()
  if (!$Cipher) { return $null }
  $Secure = ConvertTo-SecureString -String $Cipher
  $Cred = New-Object System.Management.Automation.PSCredential("x", $Secure)
  return $Cred.GetNetworkCredential().Password
}

function New-HexToken([int]$Bytes = 32) {
  $Buffer = New-Object byte[] $Bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($Buffer)
  return -join ($Buffer | ForEach-Object { $_.ToString("x2") })
}

function Get-Sha256([string]$Path) {
  return (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Download-Verified([string]$Url, [string]$Path, [string]$Sha256) {
  if ((Test-Path $Path) -and ((Get-Sha256 $Path) -eq $Sha256.ToLowerInvariant())) {
    return
  }
  $Tmp = "$Path.download"
  Remove-Item $Tmp -Force -ErrorAction SilentlyContinue
  Write-Host "Downloading $([IO.Path]::GetFileName($Path))..."
  Invoke-WebRequest -Uri $Url -OutFile $Tmp -UseBasicParsing
  $Actual = Get-Sha256 $Tmp
  if ($Actual -ne $Sha256.ToLowerInvariant()) {
    Remove-Item $Tmp -Force -ErrorAction SilentlyContinue
    throw "Download verification failed for $Url"
  }
  Move-Item -Path $Tmp -Destination $Path -Force
}

function Ensure-Dependencies {
  New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null

  if (!(Test-Path $Go2RtcExe)) {
    $Zip = Join-Path $BaseDir "go2rtc_win64.zip"
    Download-Verified $Go2RtcZipUrl $Zip $Go2RtcZipSha256
    $Extract = Join-Path $BaseDir "go2rtc-extract"
    Remove-Item $Extract -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $Extract | Out-Null
    Expand-Archive -Path $Zip -DestinationPath $Extract -Force
    $Found = Get-ChildItem -Path $Extract -Recurse -Filter "go2rtc.exe" | Select-Object -First 1
    if (!$Found) { throw "go2rtc.exe was not found in the verified download." }
    Copy-Item $Found.FullName $Go2RtcExe -Force
    Remove-Item $Extract -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $Zip -Force -ErrorAction SilentlyContinue
  }

  Download-Verified $CloudflaredUrl $CloudflaredExe $CloudflaredSha256
}

function Invoke-BridgeApi([hashtable]$Payload) {
  $Headers = @{
    "apikey" = $PublishableKey
    "Content-Type" = "application/json"
  }
  return Invoke-RestMethod -Uri $SupabaseFunction -Method Post -Headers $Headers -Body ($Payload | ConvertTo-Json -Compress -Depth 5)
}

function Get-Settings {
  if (!(Test-Path $SettingsFile)) { return $null }
  try { return (Get-Content -Path $SettingsFile -Raw | ConvertFrom-Json) } catch { return $null }
}

function Save-Settings([string]$PathToken) {
  @{
    site_id = "chester"
    path_token = $PathToken
    channels = $ChannelCount
    recorder = ($DvrHost + ":" + $DvrPort)
    installed_at = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json | Set-Content -Path $SettingsFile -Encoding UTF8
}

function Write-Go2RtcConfig([string]$PathToken) {
  $Lines = New-Object System.Collections.Generic.List[string]
  $Lines.Add('log:')
  $Lines.Add('  level: warn')
  $Lines.Add('api:')
  $Lines.Add('  listen: "127.0.0.1:1984"')
  $Lines.Add(('  base_path: "/{0}"' -f $PathToken))
  $Lines.Add('  allow_paths:')
  $Lines.Add(('    - "/{0}/api/stream.mp4"' -f $PathToken))
  $Lines.Add('rtsp:')
  $Lines.Add('  listen: ""')
  $Lines.Add('webrtc:')
  $Lines.Add('  listen: ""')
  $Lines.Add('streams:')
  $Template = '  {0}: dvrip://{1}:$' + '{DVR_PASS_URI}@{2}:{3}?channel={4}&subtype=1'
  for ($i = 0; $i -lt $ChannelCount; $i++) {
    $Name = "cam{0:d2}" -f ($i + 1)
    $Lines.Add(($Template -f $Name, $DvrUser, $DvrHost, $DvrPort, $i))
  }
  $Lines | Set-Content -Path $Go2RtcConfig -Encoding UTF8
}

function Install-StartupLauncher {
  $Startup = [Environment]::GetFolderPath("Startup")
  $Launcher = Join-Path $Startup "Shiftboard Chester Camera Bridge.cmd"
  $Content = '@echo off' + [Environment]::NewLine +
             'start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $InstallScript + '" -Run'
  Set-Content -Path $Launcher -Value $Content -Encoding ASCII
}

function Wait-ForTunnelUrl([Diagnostics.Process]$Process) {
  $Deadline = (Get-Date).AddSeconds(50)
  while ((Get-Date) -lt $Deadline) {
    if ($Process.HasExited) {
      throw "Cloudflare tunnel stopped before a public address was created. Check $CloudflaredErr"
    }
    foreach ($LogPath in @($CloudflaredOut, $CloudflaredErr)) {
      if (Test-Path $LogPath) {
        $Text = Get-Content -Path $LogPath -Raw -ErrorAction SilentlyContinue
        $Match = [regex]::Match($Text, 'https://[a-z0-9-]+\.trycloudflare\.com', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if ($Match.Success) { return $Match.Value.TrimEnd('/') }
      }
    }
    Start-Sleep -Milliseconds 750
  }
  throw "Timed out waiting for the Cloudflare tunnel address. Check $CloudflaredErr"
}

function Stop-Child([Diagnostics.Process]$Process) {
  if ($null -ne $Process) {
    try {
      if (!$Process.HasExited) { Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue }
    } catch {}
  }
}

function Run-Bridge {
  New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null
  Ensure-Dependencies

  $Settings = Get-Settings
  if (!$Settings -or !$Settings.path_token) {
    Write-BridgeLog "No bridge settings found. Run setup again."
    return
  }
  $PathToken = [string]$Settings.path_token
  if ($PathToken -notmatch '^[a-f0-9]{64}$') {
    Write-BridgeLog "Invalid local path token. Run setup again."
    return
  }

  $DvrPassword = Unprotect-String $PasswordFile
  if ($null -eq $DvrPassword) {
    Write-BridgeLog "DVR password is not available for this Windows user. Run setup again."
    return
  }

  Write-Go2RtcConfig $PathToken
  $env:DVR_PASS_URI = [Uri]::EscapeDataString($DvrPassword)
  $DvrPassword = $null
  $FirstPairingCode = $PairingCode

  while ($true) {
    $GoProc = $null
    $CfProc = $null
    try {
      Remove-Item $Go2RtcOut, $Go2RtcErr, $CloudflaredOut, $CloudflaredErr -Force -ErrorAction SilentlyContinue

      $GoProc = Start-Process -FilePath $Go2RtcExe -ArgumentList @("-config", $Go2RtcConfig) -WorkingDirectory $BaseDir -WindowStyle Hidden -RedirectStandardOutput $Go2RtcOut -RedirectStandardError $Go2RtcErr -PassThru
      Remove-Item Env:DVR_PASS_URI -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
      if ($GoProc.HasExited) { throw "go2rtc stopped. Check $Go2RtcErr" }

      $CfProc = Start-Process -FilePath $CloudflaredExe -ArgumentList @("tunnel", "--url", "http://127.0.0.1:1984", "--no-autoupdate", "--loglevel", "info") -WorkingDirectory $BaseDir -WindowStyle Hidden -RedirectStandardOutput $CloudflaredOut -RedirectStandardError $CloudflaredErr -PassThru

      $BaseUrl = Wait-ForTunnelUrl $CfProc
      Write-BridgeLog "Tunnel online: $BaseUrl"

      $BridgeToken = Unprotect-String $BridgeTokenFile
      if (!$BridgeToken) {
        if (!$FirstPairingCode -or $FirstPairingCode -notmatch '^\d{8}$') {
          throw "This PC is not paired. Generate a new Chester setup code in Shiftboard and run setup again."
        }
        $Registration = Invoke-BridgeApi @{
          action = "register"
          site_id = "chester"
          pairing_code = $FirstPairingCode
          base_url = $BaseUrl
          path_token = $PathToken
          channels = $ChannelCount
        }
        if (!$Registration.ok -or !$Registration.bridge_token) { throw "Pairing failed." }
        $BridgeToken = [string]$Registration.bridge_token
        Protect-String $BridgeToken $BridgeTokenFile
        $FirstPairingCode = $null
        Write-BridgeLog "Chester bridge paired successfully."
      }

      while (!$GoProc.HasExited -and !$CfProc.HasExited) {
        try {
          Invoke-BridgeApi @{
            action = "heartbeat"
            site_id = "chester"
            bridge_token = $BridgeToken
            base_url = $BaseUrl
            path_token = $PathToken
          } | Out-Null
        } catch {
          Write-BridgeLog ("Heartbeat failed: " + $_.Exception.Message)
        }
        Start-Sleep -Seconds 30
      }

      Write-BridgeLog "A bridge process stopped; restarting tunnel."
    } catch {
      Write-BridgeLog ("Bridge error: " + $_.Exception.Message)
    } finally {
      Stop-Child $CfProc
      Stop-Child $GoProc
    }

    try {
      $PW = Unprotect-String $PasswordFile
      if ($null -eq $PW) { return }
      $env:DVR_PASS_URI = [Uri]::EscapeDataString($PW)
      $PW = $null
    } catch { return }

    Start-Sleep -Seconds 5
  }
}

function Run-Setup {
  New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null
  Clear-Host
  Write-Host "Shiftboard - Chester Camera Bridge" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "This links the Chester DVR to the Tony-only Cameras page."
  Write-Host "The DVR password stays encrypted on this PC and is never uploaded to Shiftboard."
  Write-Host ""

  Ensure-Dependencies
  Copy-Item -Path $PSCommandPath -Destination $InstallScript -Force

  if (!$PairingCode) {
    $PairingCode = (Read-Host "Enter the 8-digit Chester setup code shown in Shiftboard").Trim()
  }
  if ($PairingCode -notmatch '^\d{8}$') {
    throw "The setup code must be exactly 8 digits."
  }

  Write-Host ""
  $SecurePassword = Read-Host "Enter the Chester DVR admin password" -AsSecureString
  $Cred = New-Object System.Management.Automation.PSCredential("admin", $SecurePassword)
  $PlainPassword = $Cred.GetNetworkCredential().Password
  if ([string]::IsNullOrEmpty($PlainPassword)) { throw "The DVR password cannot be blank." }
  Protect-String $PlainPassword $PasswordFile
  $PlainPassword = $null
  $Cred = $null
  $SecurePassword = $null

  $PathToken = New-HexToken 32
  Save-Settings $PathToken
  Remove-Item $BridgeTokenFile -Force -ErrorAction SilentlyContinue
  Install-StartupLauncher

  Write-Host ""
  Write-Host "Starting the Chester bridge..." -ForegroundColor Green
  Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $InstallScript, "-Run", "-PairingCode", $PairingCode) -WindowStyle Hidden

  Write-Host ""
  Write-Host "Setup is installed." -ForegroundColor Green
  Write-Host "Wait about 20 seconds, then return to Shiftboard > Cameras and press Refresh status."
  Write-Host "The bridge will start automatically whenever this Windows user signs in."
  Write-Host ""
  Write-Host "Press Enter to close."
  [void](Read-Host)
}

try {
  if ($Run) { Run-Bridge } else { Run-Setup }
} catch {
  Write-BridgeLog ("Fatal setup error: " + $_.Exception.Message)
  Write-Host ""
  Write-Host ("Setup failed: " + $_.Exception.Message) -ForegroundColor Red
  Write-Host "Nothing was changed on the DVR."
  Write-Host "Press Enter to close."
  [void](Read-Host)
  exit 1
}
