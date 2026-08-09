@echo off
echo.
echo ====================================
echo   HydroTrack Icon Generator
echo ====================================
echo.

REM Check if node_modules/sharp exists
if not exist "node_modules\sharp" (
    echo [1/3] Installing sharp image processor...
    call npm install sharp
    echo.
)

echo [2/3] Generating icons from logo.png...
node scripts/generate-icons.js

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Icon generation failed!
    echo.
    pause
    exit /b 1
)

echo.
echo [3/3] Syncing with Capacitor...
call npx cap sync android

echo.
echo ====================================
echo   SUCCESS! Icons generated.
echo ====================================
echo.
echo Your logo is now integrated:
echo   - Web app favicon
echo   - Auth overlay
echo   - App headers
echo   - Android launcher icon
echo.
echo To build APK:
echo   cd android
echo   gradlew assembleDebug
echo.
pause
