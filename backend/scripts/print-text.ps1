param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FilePath,
  [string]$PaperSize = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function Resolve-PaperSize {
  param([string]$Value)

  $normalized = [string]::IsNullOrWhiteSpace($Value) ? "" : $Value.ToLowerInvariant()

  switch -Regex ($normalized) {
    "58" { return New-Object System.Drawing.Printing.PaperSize("Receipt58", 228, 1200) }
    "80" { return New-Object System.Drawing.Printing.PaperSize("Receipt80", 315, 1200) }
    "85" { return New-Object System.Drawing.Printing.PaperSize("Receipt85", 335, 1200) }
    "a4" { return New-Object System.Drawing.Printing.PaperSize("A4", 827, 1169) }
    "a3" { return New-Object System.Drawing.Printing.PaperSize("A3", 1169, 1654) }
    default { return $null }
  }
}

$content = Get-Content -LiteralPath $FilePath -Raw -Encoding UTF8
$script:lines = $content -split "`r?`n"
$script:lineIndex = 0

$font = New-Object System.Drawing.Font("Consolas", 9)
$brush = [System.Drawing.Brushes]::Black
$lineHeight = [Math]::Ceiling($font.GetHeight()) + 2

$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = $PrinterName

if (-not $doc.PrinterSettings.IsValid) {
  throw "Printer '$PrinterName' was not found on this machine."
}

$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(12, 12, 12, 12)

$resolvedPaper = Resolve-PaperSize -Value $PaperSize
if ($null -ne $resolvedPaper) {
  $doc.DefaultPageSettings.PaperSize = $resolvedPaper
}

$handler = [System.Drawing.Printing.PrintPageEventHandler]{
  param($sender, $eventArgs)

  $y = $eventArgs.MarginBounds.Top
  while ($script:lineIndex -lt $script:lines.Length) {
    $line = $script:lines[$script:lineIndex]
    $eventArgs.Graphics.DrawString($line, $font, $brush, $eventArgs.MarginBounds.Left, $y)
    $y += $lineHeight
    $script:lineIndex++

    if (($y + $lineHeight) -gt $eventArgs.MarginBounds.Bottom) {
      $eventArgs.HasMorePages = ($script:lineIndex -lt $script:lines.Length)
      return
    }
  }

  $eventArgs.HasMorePages = $false
}

$doc.add_PrintPage($handler)
try {
  $doc.Print()
} finally {
  $doc.remove_PrintPage($handler)
  $font.Dispose()
  $doc.Dispose()
}
