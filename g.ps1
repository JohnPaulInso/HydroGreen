param(
    [Parameter(Position=0, ValueFromRemainingArguments=$true)]
    [string]$msg
)

$today = Get-Date -Format "yyyy-MM-dd HH:mm"
if (-not $msg) {
    $commitMsg = "Update: $today"
} else {
    $commitMsg = $msg
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " GitHub Auto-Upload: $today" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host " Commit: `"$commitMsg`"" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] Staging all changes..." -ForegroundColor Yellow
git add .

Write-Host "[2/3] Committing..." -ForegroundColor Yellow
git commit -m "$commitMsg"

Write-Host "[3/3] Pushing to GitHub..." -ForegroundColor Yellow
git push -u origin main

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Done! Changes pushed to GitHub." -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
