@echo off
echo.
echo ========================================
echo   NUCLEAR OPTION - Delete Everything
echo ========================================
echo.
echo This will:
echo - Kill all Java/Gradle processes
echo - Delete ALL Gradle caches
echo - Delete ALL build folders
echo - Force fresh start
echo.
echo CLOSE ANDROID STUDIO NOW!
echo.
pause

echo.
echo [1/6] Killing processes...
taskkill /F /IM java.exe 2>nul
taskkill /F /IM javaw.exe 2>nul
taskkill /F /IM studio64.exe 2>nul
timeout /t 2 /nobreak

echo.
echo [2/6] Stopping Gradle...
cd "%~dp0android"
call gradlew --stop 2>nul
cd ..
timeout /t 2 /nobreak

echo.
echo [3/6] Deleting user Gradle cache...
rmdir /s /q "%USERPROFILE%\.gradle" 2>nul

echo.
echo [4/6] Deleting project Gradle folders...
rmdir /s /q "%~dp0android\.gradle" 2>nul
rmdir /s /q "%~dp0android\.idea" 2>nul
rmdir /s /q "%~dp0android\build" 2>nul
rmdir /s /q "%~dp0android\app\build" 2>nul

echo.
echo [5/6] Deleting Android Studio cache...
rmdir /s /q "%LOCALAPPDATA%\Google\AndroidStudio2024.2\caches" 2>nul

echo.
echo [6/6] Creating fresh gradle folder...
mkdir "%USERPROFILE%\.gradle"

echo.
echo ========================================
echo   DONE! Everything deleted.
echo ========================================
echo.
echo NOW:
echo 1. Open Android Studio: .\a
echo 2. Wait for Gradle to re-download (5-10 min)
echo 3. File -^> Sync Project
echo 4. Build -^> Build APK
echo.
pause
