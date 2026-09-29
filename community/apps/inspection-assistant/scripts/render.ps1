# Render plain-text terminal output into a dark-themed PNG (ASCII-only script).
# Usage: powershell -ExecutionPolicy Bypass -File render.ps1 -InputFile <path> -OutputFile <path> -Title <string>
param(
  [Parameter(Mandatory = $true)][string]$InputFile,
  [Parameter(Mandatory = $true)][string]$OutputFile,
  [string]$Title = ""
)

Add-Type -AssemblyName System.Drawing

$text = [System.IO.File]::ReadAllText($InputFile, [System.Text.Encoding]::UTF8)
# Strip ANSI escape sequences (Nest color codes)
$text = [System.Text.RegularExpressions.Regex]::Replace($text, [char]27 + '\[[0-9;]*[A-Za-z]', '')
$lines = $text -split "`r?`n"

$fontName = 'NSimSun'
$fontSize = 15.0
$font = New-Object System.Drawing.Font($fontName, $fontSize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$fontBold = New-Object System.Drawing.Font($fontName, $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

$padding = 20
$lineHeight = 24
$headerHeight = 0
if ($Title -ne "") { $headerHeight = 44 }

$maxChars = 0
foreach ($line in $lines) {
  if ($line.Length -gt $maxChars) { $maxChars = $line.Length }
}
if ($maxChars -lt 60) { $maxChars = 60 }

$charWidth = [int]$fontSize
$width = [int]($maxChars * $charWidth + $padding * 2)
$height = [int]($lines.Count * $lineHeight + $padding * 2 + $headerHeight)

$white = [System.Drawing.Brushes]::White
$gray = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(139, 148, 158))
$green = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(63, 185, 80))
$red = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(248, 81, 73))
$cyan = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(86, 182, 194))
$yellow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(210, 153, 34))
$headerBg = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(22, 27, 34))
$borderPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(48, 54, 61))

$bmp = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.Clear([System.Drawing.Color]::FromArgb(13, 17, 23))

$y = $padding

if ($Title -ne "") {
  $g.FillRectangle($headerBg, 0, 0, $width, $headerHeight)
  $g.DrawString($Title, $fontBold, $cyan, $padding, 12)
  $g.DrawLine($borderPen, 0, $headerHeight - 1, $width, $headerHeight - 1)
  $y += $headerHeight
}

foreach ($line in $lines) {
  if ($line.Length -eq 0) {
    $y += $lineHeight
    continue
  }
  if ($line -match '^[=]{3,}') {
    $g.DrawString($line, $font, $gray, $padding, $y)
  } elseif ($line -match '^[-]{3,}') {
    $g.DrawString($line, $font, $gray, $padding, $y)
  } elseif ($line -match 'VERIFY|PASS|# pass|# tests|# ok|ok [0-9]|Plugin loaded|completed|Exit status 0|Application context closed|onStop completed|onPluginBootstrap completed|onPluginDestroy completed|onStart completed') {
    $g.DrawString($line, $fontBold, $green, $padding, $y)
  } elseif ($line -match 'FAIL|failed|not ok|error TS|Error:') {
    $g.DrawString($line, $fontBold, $red, $padding, $y)
  } elseif ($line -match '^\[STEP|^\[[0-9]+\]') {
    $g.DrawString($line, $fontBold, $yellow, $padding, $y)
  } elseif ($line -match 'INSP-[0-9]{8}|# duration|# suites|# cancelled|# skipped|# todo') {
    $g.DrawString($line, $font, $green, $padding, $y)
  } else {
    $g.DrawString($line, $font, $white, $padding, $y)
  }
  $y += $lineHeight
}

$g.Dispose()
$bmp.Save($OutputFile, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output ("RENDER_OK {0}x{1}" -f $width, $height)
