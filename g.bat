@echo off
:: =============================================
:: g.bat - Quick GitHub Upload Script
:: Created: 2026-08-19
:: Usage:
::   .\g                        -> commits with auto-timestamp
::   .\g "your commit message"  -> commits with your custom message
:: Function: Stages all changes, commits, and pushes to main branch on GitHub.
:: Remote: https://github.com/JohnPaulInso/HydroGreen.git
:: =============================================

:: -- Element: commit message builder --
for /f "tokens=1-4 delims=/ " %%a in ('date /t') do set TODAY=%%a %%b %%c %%d
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set NOW=%%a:%%b

:: -- Element: commitMsg - uses %~1 (first argument) if provided, else auto-timestamp --
if "%~1"=="" (
    set "commitMsg=Update: %TODAY% %NOW%"
) else (
    set "commitMsg=%~1"
)

echo.
echo ============================================
echo  GitHub Auto-Upload
echo  %TODAY% %NOW%
echo ============================================
echo.
echo  Commit: "%commitMsg%"
echo.

echo [1/3] Staging all changes...
git add .

echo [2/3] Committing...
git commit -m "%commitMsg%"

echo [3/3] Pushing to GitHub...
git push -u origin main

echo.
echo ============================================
echo  Done! Changes pushed to GitHub.
echo ============================================
echo.
