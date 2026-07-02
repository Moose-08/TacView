param(
  [int]$Port = 3111,
  [string]$IconPath = ''
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$mutex = New-Object System.Threading.Mutex($false, 'TacViewTrayMutex')
if (-not $mutex.WaitOne(0)) { exit }

$base = "http://127.0.0.1:$Port"

$tray = New-Object System.Windows.Forms.NotifyIcon
if ($IconPath -and (Test-Path $IconPath)) {
  $tray.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($IconPath)
} else {
  $tray.Icon = [System.Drawing.SystemIcons]::Application
}
$tray.Text = 'TACVIEW'
$tray.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$openItem = $menu.Items.Add('Open TACVIEW')
$openItem.Add_Click({ Start-Process "$base/" })

$overlayItem = $menu.Items.Add('Launch overlay')
$overlayItem.Add_Click({ try { Invoke-RestMethod -Uri "$base/sync/overlay" -Method Post -TimeoutSec 3 | Out-Null } catch {} })

[void]$menu.Items.Add('-')

$quitItem = $menu.Items.Add('Quit')
$quitItem.Add_Click({
  try { Invoke-RestMethod -Uri "$base/sync/shutdown" -Method Post -TimeoutSec 2 | Out-Null } catch {}
  $tray.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

$tray.ContextMenuStrip = $menu
$tray.Add_DoubleClick({ Start-Process "$base/" })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$script:misses = 0
$timer.Add_Tick({
  try {
    Invoke-RestMethod -Uri "$base/sync/overlay-config" -TimeoutSec 2 | Out-Null
    $script:misses = 0
  } catch {
    $script:misses++
    if ($script:misses -ge 3) {
      $tray.Visible = $false
      [System.Windows.Forms.Application]::Exit()
    }
  }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()
$tray.Dispose()
