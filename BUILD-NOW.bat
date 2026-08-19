@echo off
color 0A
echo.
echo ================================================================
echo   HYDROTRACK - BUILD YOUR APK NOW
echo ================================================================
echo.
echo Command-line build WON'T WORK because:
echo   - Capacitor needs Java 21 (you have Java 17)
echo   - SSL certificate issues
echo.
echo ================================================================
echo   SOLUTION: USE ANDROID STUDIO
echo ================================================================
echo.
echo I'm opening Android Studio for you now...
echo.
echo WHEN ANDROID STUDIO OPENS, DO THIS:
echo.
echo [1] File -^> Settings -^> Build Tools -^> Gradle
echo     Set "Gradle JDK" to "Embedded JDK" ^<-- CRITICAL!
echo     Click Apply, then OK
echo.
echo [2] File -^> Invalidate Caches (check all boxes, restart)
echo.
echo [3] Build -^> Build Bundle(s) / APK(s) -^> Build APK(s)
echo     Wait 3-5 minutes
echo.
echo [4] Click "locate" link to find: hydrotrack.apk
echo.
echo SSL ERROR? See: docs\QUICK_FIX_STEPS.md (2 min fix!)
echo.
echo ================================================================
echo.
pause
echo.
rem (2026-07-13) Sync logo icons before studio launch; previous: launch directly
powershell -ExecutionPolicy Bypass -File scripts\set-app-icons.ps1
call npm run sync
echo Opening Android Studio...
echo.

REM Try to find and launch Android Studio
set "STUDIO_PATH="

if exist "C:\Program Files\Android\Android Studio\bin\studio64.exe" (
    set "STUDIO_PATH=C:\Program Files\Android\Android Studio\bin\studio64.exe"
) else if exist "C:\Program Files (x86)\Android\Android Studio\bin\studio64.exe" (
    set "STUDIO_PATH=C:\Program Files (x86)\Android\Android Studio\bin\studio64.exe"
) else if exist "%LOCALAPPDATA%\Programs\Android Studio\bin\studio64.exe" (
    set "STUDIO_PATH=%LOCALAPPDATA%\Programs\Android Studio\bin\studio64.exe"
) else if exist "C:\Program Files\JetBrains\Android Studio\bin\studio64.exe" (
    set "STUDIO_PATH=C:\Program Files\JetBrains\Android Studio\bin\studio64.exe"
)

if defined STUDIO_PATH (
    echo Found Android Studio!
    echo.
    start "" "%STUDIO_PATH%" "%~dp0android"
    echo.
    echo ================================================================
    echo   Android Studio is opening your project...
    echo   
    echo   REMEMBER THE 4 STEPS ABOVE!
    echo   
    echo   If SSL error: docs\QUICK_FIX_STEPS.md
    echo   Full guide: docs\BUILD_IN_ANDROID_STUDIO_NOW.md
    echo ================================================================
    echo.
) else (
    echo.
    echo ERROR: Could not find Android Studio!
    echo.
    echo Please open Android Studio manually:
    echo 1. Launch Android Studio from Start Menu
    echo 2. File -^> Open
    echo 3. Select: %~dp0android
    echo.
    echo Then follow the 4 steps above.
    echo.
)

pause
