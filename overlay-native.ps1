param(
  [string]$Mode = 'full',
  [int]$SyncPort = 3111
)

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
Add-Type -AssemblyName System.Net.Http

$mutexName = if ($Mode -eq 'nav') { 'TacViewNavOverlayMutex' } else { 'TacViewOverlayMutex' }
$script:mutex = New-Object System.Threading.Mutex($false, $mutexName)
if (-not $script:mutex.WaitOne(0)) { exit }

$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="TacView Overlay" WindowStyle="None" AllowsTransparency="True"
        Background="Transparent" Topmost="True" ShowInTaskbar="False"
        Width="450" SizeToContent="Height" ResizeMode="NoResize" Left="80" Top="80">
  <Border x:Name="Root" Background="#BF04070A" BorderBrush="#FF1F4A56" BorderThickness="1"
          CornerRadius="6" Padding="12,4,12,8">
    <StackPanel>
      <DockPanel Margin="0,0,0,2">
        <Button x:Name="BtnClose" DockPanel.Dock="Right" Content="X" Width="18" Height="14"
                Background="Transparent" Foreground="#FF4E6F6C" BorderThickness="0"
                FontFamily="Consolas" FontSize="10" Cursor="Hand" Padding="0"/>
        <TextBlock x:Name="TitleText" Text="TACVIEW OVERLAY" Foreground="#FF2B5A52"
                   FontFamily="Consolas" FontSize="9" VerticalAlignment="Center"/>
      </DockPanel>
      <StackPanel x:Name="NavRow" Orientation="Horizontal" Margin="0,2">
        <Grid Width="22" Height="22" Margin="0,0,8,0" VerticalAlignment="Center">
          <Path x:Name="NavArrow" Data="M 11,1 L 19,20 L 11,14.5 L 3,20 Z" Fill="#FF35C4E8"
                Visibility="Hidden" RenderTransformOrigin="0.5,0.5">
            <Path.Effect>
              <DropShadowEffect Color="#35C4E8" BlurRadius="8" ShadowDepth="0" Opacity="0.8"/>
            </Path.Effect>
            <Path.RenderTransform>
              <RotateTransform Angle="0"/>
            </Path.RenderTransform>
          </Path>
        </Grid>
        <TextBlock x:Name="NavText" Foreground="#FF35C4E8" FontFamily="Consolas"
                   FontSize="16" VerticalAlignment="Center" Text="NAV --"/>
      </StackPanel>
      <TextBlock x:Name="ThreatText" Foreground="#FF4E6F6C" FontFamily="Consolas"
                 FontSize="13" Margin="0,2" Text="THR --"/>
      <TextBlock x:Name="ShipText" Foreground="#FFDFFEF2" FontFamily="Consolas"
                 FontSize="13" Margin="0,2" Text="SHIP --"/>
      <TextBlock x:Name="FuelText" Foreground="#FF29FF9E" FontFamily="Consolas"
                 FontSize="13" Margin="0,2" Text="FUEL --" Visibility="Collapsed"/>
      <TextBlock x:Name="CautionText" Foreground="#FFFF3B3B" FontFamily="Consolas"
                 FontSize="13" Margin="0,2" Text="" Visibility="Collapsed"/>
      <TextBlock x:Name="FeedText" Foreground="#FFB8D4CD" FontFamily="Consolas"
                 FontSize="11" Margin="0,2" Text="" Visibility="Collapsed"/>
    </StackPanel>
  </Border>
</Window>
'@

$window = [Windows.Markup.XamlReader]::Parse($xaml)
$root = $window.FindName('Root')
$rows = @{
  title   = $window.FindName('TitleText')
  nav     = $window.FindName('NavText')
  threat  = $window.FindName('ThreatText')
  ship    = $window.FindName('ShipText')
  fuel    = $window.FindName('FuelText')
  caution = $window.FindName('CautionText')
  feed    = $window.FindName('FeedText')
}
$btnClose = $window.FindName('BtnClose')
$navRow = $window.FindName('NavRow')
$navArrow = $window.FindName('NavArrow')
$navRot = $navArrow.RenderTransform
$script:arrowAngle = 0.0

if ($Mode -eq 'nav') {
  $window.Title = 'TacView Nav'
  $window.Width = 330
  $rows.title.Text = 'TACVIEW NAV'
  foreach ($k in @('threat', 'ship', 'fuel', 'caution', 'feed')) { $rows[$k].Visibility = 'Collapsed' }
}

function Set-NavArrow($relDeg, $aligned) {
  $navArrow.Visibility = 'Visible'
  $delta = ((($relDeg - $script:arrowAngle) % 360) + 540) % 360 - 180
  $target = $script:arrowAngle + $delta
  $script:arrowAngle = $target
  $anim = New-Object Windows.Media.Animation.DoubleAnimation
  $anim.To = $target
  $anim.Duration = New-Object Windows.Duration([TimeSpan]::FromMilliseconds(300))
  $anim.EasingFunction = New-Object Windows.Media.Animation.QuadraticEase
  $navRot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $anim)
  if ($aligned) {
    $navArrow.Fill = $colors.green
    try { $navArrow.Effect.Color = [Windows.Media.Color]::FromRgb(0x29, 0xFF, 0x9E) } catch {}
  } else {
    $navArrow.Fill = $script:theme.nav
    try { $navArrow.Effect.Color = $script:theme.nav.Color } catch {}
  }
}

$shared = [hashtable]::Synchronized(@{
  stop = $false
  ind = $null; st = $null; objs = $null; info = $null; nav = $null; cfg = $null
  feedOn = $false
  hudNew = @()
})

$runspace = [runspacefactory]::CreateRunspace()
$runspace.ApartmentState = 'MTA'
$runspace.Open()
$runspace.SessionStateProxy.SetVariable('shared', $shared)
$runspace.SessionStateProxy.SetVariable('syncPort', $SyncPort)
$poller = [powershell]::Create()
$poller.Runspace = $runspace
[void]$poller.AddScript({
  Add-Type -AssemblyName System.Net.Http
  $http = New-Object System.Net.Http.HttpClient
  $http.Timeout = [TimeSpan]::FromMilliseconds(1500)
  $GAME = 'http://127.0.0.1:8111'
  $SYNC = "http://127.0.0.1:$syncPort"
  function Get-Json($url) {
    try { ($http.GetStringAsync($url).GetAwaiter().GetResult()) | ConvertFrom-Json } catch { $null }
  }
  $i = 0
  $lastDmg = 0
  while (-not $shared.stop) {
    $i++
    $shared.ind = Get-Json "$GAME/indicators"
    $shared.st = Get-Json "$GAME/state"
    if ($i % 2 -eq 1) {
      $shared.objs = Get-Json "$GAME/map_obj.json"
      $shared.info = Get-Json "$GAME/map_info.json"
    }
    $shared.nav = Get-Json "$SYNC/sync/nav"
    if ($i % 4 -eq 0 -or $null -eq $shared.cfg) {
      $cfg = Get-Json "$SYNC/sync/overlay-config"
      if ($cfg) { $shared.cfg = $cfg }
    }
    if ($shared.feedOn -and $i % 4 -eq 2) {
      $hud = Get-Json "$GAME/hudmsg?lastEvt=0&lastDmg=$lastDmg"
      if ($hud -and $hud.damage) {
        $fresh = @()
        foreach ($e in $hud.damage) {
          if ($e.id -gt $lastDmg) { $lastDmg = $e.id }
          $fresh += $e
        }
        if ($fresh.Count -gt 0) { $shared.hudNew = @($shared.hudNew) + $fresh }
      }
    }
    Start-Sleep -Milliseconds 450
  }
  $http.Dispose()
})
[void]$poller.BeginInvoke()

$httpUi = New-Object System.Net.Http.HttpClient
$httpUi.Timeout = [TimeSpan]::FromMilliseconds(800)
function Post-Json($url, $obj) {
  try {
    $content = New-Object System.Net.Http.StringContent(($obj | ConvertTo-Json -Compress), [Text.Encoding]::UTF8, 'application/json')
    [void]$httpUi.PostAsync($url, $content)
  } catch {}
}

function Fmt-Range($m) {
  if ($m -ge 1000) { '{0:N1}KM' -f ($m / 1000) } else { '{0}M' -f [math]::Round($m) }
}
function Pad3($deg) { '{0:000}' -f (([math]::Round($deg) % 360 + 360) % 360) }
function SVal($st, $prefix) {
  if ($null -eq $st) { return $null }
  $p = $st.PSObject.Properties | Where-Object { $_.Name -like "$prefix*" } | Select-Object -First 1
  if ($p) { $p.Value } else { $null }
}

$bc = New-Object Windows.Media.BrushConverter
$colors = @{
  cyan   = $bc.ConvertFromString('#FF35C4E8')
  green  = $bc.ConvertFromString('#FF29FF9E')
  amber  = $bc.ConvertFromString('#FFFFB02E')
  red    = $bc.ConvertFromString('#FFFF3B3B')
  redDim = $bc.ConvertFromString('#FF7A2020')
  dim    = $bc.ConvertFromString('#FF4E6F6C')
  text   = $bc.ConvertFromString('#FFDFFEF2')
}

$script:theme = @{ nav = $colors.cyan; text = $colors.green }

function Parse-Brush($hex, $fallback) {
  if ($hex) {
    try { return $bc.ConvertFromString($hex) } catch {}
  }
  $fallback
}

$script:cfg = @{
  widgets = @{ nav = $true; threat = $true; ship = $true; fuel = $false; caution = $true; feed = $false }
  opacity = 75; fontScale = 100; playerName = ''
}
$script:cfgStamp = ''
$script:tickCount = 0
$script:fuelHist = New-Object System.Collections.Generic.Queue[object]
$script:feedMsg = ''
$script:feedBrush = $colors.dim
$script:feedAt = [DateTime]::MinValue

function Apply-Config($c) {
  if ($null -eq $c) { return }
  $stamp = $c | ConvertTo-Json -Compress
  if ($stamp -eq $script:cfgStamp) { return }
  $script:cfgStamp = $stamp
  $script:cfg = @{
    widgets = @{
      nav = [bool]$c.widgets.nav; threat = [bool]$c.widgets.threat; ship = [bool]$c.widgets.ship
      fuel = [bool]$c.widgets.fuel; caution = [bool]$c.widgets.caution; feed = [bool]$c.widgets.feed
    }
    opacity = [int]$c.opacity; fontScale = [int]$c.fontScale
    playerName = [string]$c.playerName
    navColor = [string]$c.navColor; textColor = [string]$c.textColor
    navPopout = [bool]$c.navPopout
  }
  $script:theme.nav = Parse-Brush $script:cfg.navColor $colors.cyan
  $script:theme.text = Parse-Brush $script:cfg.textColor $colors.green
  $shared.feedOn = if ($Mode -eq 'nav') { $false } else { $script:cfg.widgets.feed }
  $alpha = [math]::Max(20, [math]::Min(100, $script:cfg.opacity))
  $hex = '{0:X2}' -f [int][math]::Round($alpha * 2.55)
  $root.Background = $bc.ConvertFromString("#$($hex)04070A")
  $s = [math]::Max(70, [math]::Min(160, $script:cfg.fontScale)) / 100.0
  $rows.title.FontSize = 9 * $s
  $rows.nav.FontSize = 16 * $s
  foreach ($k in @('threat', 'ship', 'fuel', 'caution')) { $rows[$k].FontSize = 13 * $s }
  $rows.feed.FontSize = 11 * $s
  if ($Mode -eq 'nav') {
    $navRow.Visibility = 'Visible'
  } else {
    if ($script:cfg.widgets.nav -and -not $script:cfg.navPopout) { $navRow.Visibility = 'Visible' } else { $navRow.Visibility = 'Collapsed' }
    foreach ($k in @('threat', 'ship', 'fuel')) {
      if ($script:cfg.widgets[$k]) { $rows[$k].Visibility = 'Visible' } else { $rows[$k].Visibility = 'Collapsed' }
    }
    if (-not $script:cfg.widgets.caution) { $rows.caution.Visibility = 'Collapsed' }
    if (-not $script:cfg.widgets.feed) { $rows.feed.Visibility = 'Collapsed' }
  }
}

$window.Add_MouseLeftButtonDown({
  try { $window.DragMove() } catch {}
  $pos = if ($Mode -eq 'nav') {
    @{ navLeft = [math]::Round($window.Left); navTop = [math]::Round($window.Top) }
  } else {
    @{ left = [math]::Round($window.Left); top = [math]::Round($window.Top) }
  }
  Post-Json "http://127.0.0.1:$SyncPort/sync/overlay-config" $pos
})
$window.Add_KeyDown({ if ($_.Key -eq 'Escape') { $window.Close() } })
$btnClose.Add_Click({ $window.Close() })

$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(400)
$timer.Add_Tick({
  try {
  $script:tickCount++
  Apply-Config $shared.cfg
  $w = if ($Mode -eq 'nav') {
    @{ nav = $true; threat = $false; ship = $false; fuel = $false; caution = $false; feed = $false }
  } else {
    $script:cfg.widgets
  }

  $ind = $shared.ind
  $st = $shared.st
  $objs = $shared.objs
  $info = $shared.info

  $isAir = ($ind -and $ind.valid -and $ind.army -ne 'tank')
  $isTank = ($ind -and $ind.valid -and $ind.army -eq 'tank')

  if ($w.nav) {
    $nav = $shared.nav
    $arrowSet = $false
    if ($nav -and $nav.updated -gt 0 -and ([DateTimeOffset]::Now.ToUnixTimeMilliseconds() - $nav.updated) -lt 6000) {
      if ($nav.notice) {
        $rows.nav.Text = "NAV  OK $($nav.notice)"
        $rows.nav.Foreground = $colors.green
      } elseif ($nav.active) {
        $a = $nav.active
        if ($a.kind -eq 'poi' -and $a.arrived) {
          $rows.nav.Text = "NAV  AT $($a.label)"
          $rows.nav.Foreground = $colors.amber
        } else {
          $rel = ''
          if ($ind -and $null -ne $ind.compass) {
            $r = ((($a.bearing - $ind.compass) + 540) % 360) - 180
            $side = if ($r -lt 0) { 'L' } else { 'R' }
            $rel = '  {0}{1}' -f $side, [math]::Abs([math]::Round($r))
            Set-NavArrow $r ([math]::Abs($r) -lt 8)
            $arrowSet = $true
          }
          $rows.nav.Text = "NAV  $($a.label) $(Pad3 $a.bearing) $(Fmt-Range $a.range)$rel"
          $rows.nav.Foreground = $script:theme.nav
        }
      } else {
        $rows.nav.Text = 'NAV  NO WAYPOINT'
        $rows.nav.Foreground = $colors.dim
      }
    } else {
      $rows.nav.Text = 'NAV  NO NAV LINK'
      $rows.nav.Foreground = $colors.dim
    }
    if (-not $arrowSet) { $navArrow.Visibility = 'Hidden' }
  }

  if ($w.threat) {
    $best = $null
    if ($objs -and $info -and $info.valid -and $null -ne $info.map_max -and $null -ne $info.map_min) {
      $player = $objs | Where-Object { $_.icon -eq 'Player' } | Select-Object -First 1
      $world = $info.map_max[0] - $info.map_min[0]
      if ($player -and $world -gt 0) {
        foreach ($o in $objs) {
          if ($o.type -ne 'aircraft' -and $o.type -ne 'ground_model') { continue }
          $c = $o.'color[]'
          if (-not $c -or $c[0] -le 180 -or $c[1] -ge 110 -or $c[2] -ge 110) { continue }
          if ($null -eq $o.x) { continue }
          $dx = ($o.x - $player.x) * $world
          $dy = ($o.y - $player.y) * $world
          $range = [math]::Sqrt($dx * $dx + $dy * $dy)
          if ($null -eq $best -or $range -lt $best.range) {
            $hot = $false
            if ($o.type -eq 'aircraft' -and $null -ne $o.dx) {
              $hdg = [math]::Atan2($o.dy, $o.dx)
              $toP = [math]::Atan2(($player.y - $o.y), ($player.x - $o.x))
              $diff = [math]::Abs($hdg - $toP)
              if ($diff -gt [math]::PI) { $diff = 2 * [math]::PI - $diff }
              $hot = $diff -lt ([math]::PI / 5)
            }
            $brg = (([math]::Atan2($dx, -$dy) * 180 / [math]::PI) + 360) % 360
            $lbl = if ($o.icon -and $o.icon -ne 'none') { $o.icon.ToUpper() } elseif ($o.type -eq 'aircraft') { 'AIR' } else { 'GND' }
            $best = @{ range = $range; bearing = $brg; hot = $hot; air = ($o.type -eq 'aircraft'); label = $lbl }
          }
        }
      }
    }
    if ($best) {
      $asp = if ($best.air) { if ($best.hot) { ' HOT' } else { ' COLD' } } else { '' }
      $rows.threat.Text = "THR  $($best.label) $(Fmt-Range $best.range) BRG $(Pad3 $best.bearing)$asp"
      $rows.threat.Foreground = if ($best.hot) { $colors.red } else { $colors.amber }
    } else {
      $rows.threat.Text = 'THR  NO HOSTILE CONTACTS'
      $rows.threat.Foreground = $colors.dim
    }
  }

  if ($w.ship) {
    if ($ind -and $ind.valid) {
      $hdgTxt = Pad3 ($ind.compass)
      if ($isTank) {
        $rows.ship.Text = 'SPD  {0}  HDG {1}' -f [math]::Round($ind.speed), $hdgTxt
      } else {
        $ias = SVal $st 'IAS,'
        $alt = SVal $st 'H,'
        $iasTxt = if ($null -ne $ias) { [math]::Round($ias) } else { '--' }
        $altTxt = if ($null -ne $alt) { [math]::Round($alt) } else { '--' }
        $rows.ship.Text = "IAS  $iasTxt  ALT $altTxt  HDG $hdgTxt"
      }
      $rows.ship.Foreground = $script:theme.text
    } else {
      $rows.ship.Text = 'SHIP NO VEHICLE FEED'
      $rows.ship.Foreground = $colors.dim
    }
  }

  $fuelPct = $null
  $fuel = SVal $st 'Mfuel,'
  $fuelMax = SVal $st 'Mfuel0,'
  if ($null -ne $fuel -and $null -ne $fuelMax -and $fuelMax -gt 0) {
    $fuel = [double]$fuel
    $fuelPct = $fuel / [double]$fuelMax * 100
    $now = [DateTime]::UtcNow
    $script:fuelHist.Enqueue(@{ t = $now; f = $fuel })
    while ($script:fuelHist.Count -gt 0 -and ($now - $script:fuelHist.Peek().t).TotalSeconds -gt 40) {
      [void]$script:fuelHist.Dequeue()
    }
    if ($w.fuel) {
      $endTxt = ''
      if ($script:fuelHist.Count -ge 4) {
        $oldest = $script:fuelHist.Peek()
        $spanMin = ($now - $oldest.t).TotalMinutes
        if ($spanMin -gt 0.2) {
          $burn = ($oldest.f - $fuel) / $spanMin
          if ($burn -gt 0.5) { $endTxt = '  ~{0}MIN' -f [math]::Floor($fuel / $burn) }
        }
      }
      $rows.fuel.Text = 'FUEL {0} {1:N0}%{2}' -f [math]::Round($fuel), $fuelPct, $endTxt
      $rows.fuel.Foreground = if ($fuelPct -lt 8) { $colors.red } elseif ($fuelPct -lt 20) { $colors.amber } else { $script:theme.text }
    }
  } elseif ($w.fuel) {
    $rows.fuel.Text = 'FUEL --'
    $rows.fuel.Foreground = $colors.dim
  }

  if ($w.caution) {
    $alerts = @()
    $sev = 'amber'
    if ($isAir) {
      $oil = SVal $st 'oil temp 1,'
      if ($null -ne $oil) {
        if ($oil -gt 110) { $alerts += ('OIL {0}C' -f [math]::Round($oil)); $sev = 'red' }
        elseif ($oil -gt 96) { $alerts += ('OIL {0}C' -f [math]::Round($oil)) }
      }
      if ($null -ne $fuelPct) {
        if ($fuelPct -lt 8) { $alerts += 'FUEL CRIT'; $sev = 'red' }
        elseif ($fuelPct -lt 15) { $alerts += 'FUEL LOW' }
      }
      $g = $ind.g_meter
      if ($null -ne $g) {
        if ([math]::Abs($g) -gt 10) { $alerts += ('G {0:N1}' -f $g); $sev = 'red' }
        elseif ([math]::Abs($g) -gt 8) { $alerts += ('G {0:N1}' -f $g) }
      }
      $aoa = $ind.aoa
      if ($null -ne $aoa) {
        if ([math]::Abs($aoa) -gt 22) { $alerts += ('AOA {0:N0}' -f $aoa); $sev = 'red' }
        elseif ([math]::Abs($aoa) -gt 15) { $alerts += ('AOA {0:N0}' -f $aoa) }
      }
      $ias = SVal $st 'IAS,'
      $alt = SVal $st 'H,'
      $vy = SVal $st 'Vy,'
      $gearDown = ($null -ne $ind.gears -and $ind.gears -gt 0.5)
      if ($gearDown -and $null -ne $ias -and $ias -gt 450) { $alerts += 'GEAR DN FAST'; $sev = 'red' }
      if (-not $gearDown -and $null -ne $alt -and $alt -lt 250 -and $null -ne $vy -and $vy -lt -8) { $alerts += 'CHECK GEAR' }
    } elseif ($isTank) {
      if ($null -ne $ind.lws -and $ind.lws) { $alerts += 'LASER WARNING'; $sev = 'red' }
      if ($null -ne $ind.crew_total -and $null -ne $ind.crew_current -and $ind.crew_current -lt $ind.crew_total) {
        $alerts += ('CREW {0}/{1}' -f $ind.crew_current, $ind.crew_total)
      }
    }
    if ($alerts.Count -gt 0) {
      $rows.caution.Text = '!!  ' + ($alerts -join '  |  ')
      if ($sev -eq 'red') {
        $rows.caution.Foreground = if ($script:tickCount % 2 -eq 0) { $colors.red } else { $colors.redDim }
      } else {
        $rows.caution.Foreground = $colors.amber
      }
      $rows.caution.Visibility = 'Visible'
    } else {
      $rows.caution.Visibility = 'Collapsed'
    }
  }

  if ($w.feed) {
    $incoming = $shared.hudNew
    if ($incoming -and $incoming.Count -gt 0) {
      $shared.hudNew = @()
      $name = $script:cfg.playerName
      foreach ($e in $incoming) {
        if ($e.msg -match 'NET_PLAYER_') { continue }
        if ($name -and $e.msg.IndexOf($name, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
        $msg = $e.msg
        if ($msg.Length -gt 56) { $msg = $msg.Substring(0, 55) + '~' }
        $script:feedMsg = $msg
        $script:feedAt = [DateTime]::UtcNow
        $verbIdx = $msg.IndexOf('shot down')
        if ($verbIdx -lt 0) { $verbIdx = $msg.IndexOf('destroyed') }
        $nameIdx = -1
        if ($name) { $nameIdx = $msg.IndexOf($name, [StringComparison]::OrdinalIgnoreCase) }
        if ($verbIdx -ge 0 -and $nameIdx -ge 0 -and $nameIdx -lt $verbIdx) {
          $script:feedBrush = $colors.green
        } elseif ($verbIdx -ge 0) {
          $script:feedBrush = $colors.red
        } else {
          $script:feedBrush = $colors.text
        }
      }
    }
    $age = ([DateTime]::UtcNow - $script:feedAt).TotalSeconds
    if ($script:feedMsg -and $age -lt 20) {
      $rows.feed.Text = $script:feedMsg
      $rows.feed.Foreground = if ($age -gt 10) { $colors.dim } else { $script:feedBrush }
      $rows.feed.Visibility = 'Visible'
    } else {
      $rows.feed.Visibility = 'Collapsed'
    }
  }
  } catch {}
})

try {
  $bootHttp = New-Object System.Net.Http.HttpClient
  $bootHttp.Timeout = [TimeSpan]::FromMilliseconds(700)
  $bootJson = $bootHttp.GetStringAsync("http://127.0.0.1:$SyncPort/sync/overlay-config").GetAwaiter().GetResult()
  $boot = $bootJson | ConvertFrom-Json
  if ($boot) {
    if ($Mode -eq 'nav') {
      if ($null -ne $boot.navLeft) { $window.Left = $boot.navLeft }
      if ($null -ne $boot.navTop) { $window.Top = $boot.navTop }
    } else {
      if ($null -ne $boot.left) { $window.Left = $boot.left }
      if ($null -ne $boot.top) { $window.Top = $boot.top }
    }
    Apply-Config $boot
  }
  $bootHttp.Dispose()
} catch {}

try {
  $timer.Start()
  $null = $window.ShowDialog()
} finally {
  $timer.Stop()
  $shared.stop = $true
  Start-Sleep -Milliseconds 300
  try { $poller.Stop() } catch {}
  $poller.Dispose()
  $runspace.Dispose()
  $httpUi.Dispose()
  try { $script:mutex.ReleaseMutex() } catch {}
}
