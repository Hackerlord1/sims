# check-mustchange.ps1 — Windows PowerShell 5.1 compatible, prune-before-descend
# Scans the SIMS project for remaining references to mustChangePassword and
# reports every file with line numbers, context, and the shape of the usage.
#
# Unlike the earlier version, this walks the tree manually and prunes skip
# directories BEFORE descending into them. On a Next.js project this is the
# difference between seconds and ten minutes.

[CmdletBinding()]
param(
    [string]$Root = (Get-Location).Path,
    [switch]$SummaryOnly
)

$ErrorActionPreference = 'Stop'

# Directories we never want to scan. Matched by leaf name at any depth.
$skipDirs = @(
    'node_modules',
    '.next',
    '.git',
    '.pgdata',
    'mariadb-data',
    'storage',
    'test-results',
    'samples',
    'docs',
    '.vscode',
    '.idea',
    'dist',
    'build',
    'coverage',
    'out',
    '.turbo',
    '.cache'
)

# File extensions worth scanning.
$extensions = @('*.ts', '*.tsx', '*.mts', '*.mjs', '*.js', '*.jsx', '*.prisma', '*.sql')

Write-Host ""
Write-Host "Scanning: $Root" -ForegroundColor Cyan
Write-Host ("Skipping: " + ($skipDirs -join ', ')) -ForegroundColor DarkGray
Write-Host ("Extensions: " + ($extensions -join ', ')) -ForegroundColor DarkGray
Write-Host ""

# ── File discovery: manual stack walk, pruned before descending ──────────────

$files = New-Object System.Collections.ArrayList
$stack = New-Object System.Collections.Stack
$stack.Push($Root)

while ($stack.Count -gt 0) {
    $dir = $stack.Pop()

    # Prune by leaf name before doing anything else
    $leaf = Split-Path -Leaf $dir
    if ($skipDirs -contains $leaf) { continue }

    # Collect matching files in this directory
    foreach ($ext in $extensions) {
        $found = Get-ChildItem -LiteralPath $dir -File -Filter $ext -ErrorAction SilentlyContinue
        if ($found) { [void]$files.AddRange(@($found)) }
    }

    # Queue subdirectories for later
    $subdirs = Get-ChildItem -LiteralPath $dir -Directory -ErrorAction SilentlyContinue
    foreach ($sd in $subdirs) { $stack.Push($sd.FullName) }
}

if ($files.Count -eq 0) {
    Write-Host "No source files matched." -ForegroundColor Yellow
    exit 0
}

Write-Host ("Discovered {0} source file(s)." -f $files.Count) -ForegroundColor DarkGray
Write-Host ""

# ── Scan for mustChangePassword ──────────────────────────────────────────────

$hits       = @()
$fileCounts = @{}

foreach ($f in $files) {
    $lineNo = 0
    Get-Content -LiteralPath $f.FullName -ErrorAction SilentlyContinue | ForEach-Object {
        $lineNo++
        if ($_ -match 'mustChangePassword') {
            $rel = $f.FullName.Substring($Root.Length).TrimStart('\', '/')
            $hits += [pscustomobject]@{
                File = $rel
                Line = $lineNo
                Text = $_.TrimEnd()
            }
            if (-not $fileCounts.ContainsKey($rel)) { $fileCounts[$rel] = 0 }
            $fileCounts[$rel]++
        }
    }
}

# ── Report ───────────────────────────────────────────────────────────────────

Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor DarkCyan
Write-Host " Files referencing mustChangePassword" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor DarkCyan
Write-Host ""

if ($hits.Count -eq 0) {
    Write-Host "  No references found. The removal is complete." -ForegroundColor Green
    Write-Host ""
}
else {
    $grouped = $hits | Group-Object File | Sort-Object Name

    foreach ($g in $grouped) {
        $count = $g.Count
        if ($count -eq 1) {
            $suffix = "1 reference"
        } else {
            $suffix = "$count references"
        }
        Write-Host ("  {0}  ({1})" -f $g.Name, $suffix) -ForegroundColor Yellow

        if (-not $SummaryOnly) {
            foreach ($h in ($g.Group | Sort-Object Line)) {
                $shown = $h.Text
                if ($shown.Length -gt 160) {
                    $shown = $shown.Substring(0, 157) + "..."
                }
                Write-Host ("      L{0,-5} {1}" -f $h.Line, $shown) -ForegroundColor Gray
            }
            Write-Host ""
        }
    }
}

# ── Summary ──────────────────────────────────────────────────────────────────

Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor DarkCyan
Write-Host " Summary" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor DarkCyan
Write-Host ""

if ($hits.Count -gt 0) {
    $totalFiles = ($hits | Group-Object File).Count
    $totalHits  = $hits.Count
    Write-Host ("  Files to edit : {0}" -f $totalFiles) -ForegroundColor White
    Write-Host ("  Total sites   : {0}" -f $totalHits)  -ForegroundColor White
    Write-Host ""

    # Categorise each hit into an edit shape.
    $shapes = @{}
    foreach ($h in $hits) {
        $t = $h.Text
        $shape = 'other (inspect)'

        if ($t -match 'mustChangePassword\s*:\s*(true|false)\s*,?\s*$') {
            $shape = 'literal (delete line)'
        }
        elseif ($t -match 'expect\(.+mustChangePassword') {
            $shape = 'test assertion (rewrite)'
        }
        elseif ($t -match 'user\.mustChangePassword') {
            $shape = 'property read (rewrite)'
        }
        elseif ($t -match 'CurrentUser' -and $t -match 'mustChangePassword') {
            $shape = 'type reference (rewrite)'
        }
        elseif ($t -match 'mustChangePassword' -and $t -match '\?\s*"') {
            $shape = 'ternary (rewrite)'
        }

        if (-not $shapes.ContainsKey($shape)) { $shapes[$shape] = @() }
        $shapes[$shape] += $h
    }

    Write-Host "  Breakdown by edit shape:" -ForegroundColor White
    Write-Host ""
    foreach ($k in ($shapes.Keys | Sort-Object)) {
        Write-Host ("    {0,-32} {1}" -f $k, $shapes[$k].Count) -ForegroundColor Gray
    }
    Write-Host ""

    Write-Host "  Files ranked by number of edits:" -ForegroundColor White
    Write-Host ""
    $fileCounts.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object {
        Write-Host ("    {0,-50} {1}" -f $_.Key, $_.Value) -ForegroundColor Gray
    }
    Write-Host ""
}

# ── Related leftover symbols ─────────────────────────────────────────────────

Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor DarkCyan
Write-Host " Related leftover symbols" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor DarkCyan
Write-Host ""

$relatedPatterns = @(
    'allowPendingPasswordChange',
    'PASSWORD_MIN_LENGTH'
)

foreach ($pat in $relatedPatterns) {
    $matches = @()
    foreach ($f in $files) {
        $lineNo = 0
        Get-Content -LiteralPath $f.FullName -ErrorAction SilentlyContinue | ForEach-Object {
            $lineNo++
            if ($_ -match $pat) {
                $rel = $f.FullName.Substring($Root.Length).TrimStart('\', '/')
                $matches += [pscustomobject]@{ File = $rel; Line = $lineNo; Text = $_.TrimEnd() }
            }
        }
    }
    Write-Host ("  {0}  ->  {1} hit(s)" -f $pat, $matches.Count) -ForegroundColor Yellow
    foreach ($m in ($matches | Select-Object -First 8)) {
        $shown = $m.Text
        if ($shown.Length -gt 120) {
            $shown = $shown.Substring(0, 117) + "..."
        }
        Write-Host ("      {0}:{1}  {2}" -f $m.File, $m.Line, $shown) -ForegroundColor DarkGray
    }
    Write-Host ""
}

Write-Host "Done." -ForegroundColor Cyan
Write-Host ""