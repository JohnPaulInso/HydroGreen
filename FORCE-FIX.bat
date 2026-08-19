@echo off
echo.
echo ========================================
echo   FORCE FIX - Unlock Gradle Files
echo ========================================
echo.

echo [1/5] Closing Android Studio...
echo Please close Android Studio now and press any key...
pause

echo.
echo [2/5] Killing all Java processes...
taskkill /F /IM java.exe 2>nul
taskkill /F /IM javaw.exe 2>nul
taskkill /F /IM studio64.exe 2>nul

echo.
echo [3/5] Stopping Gradle daemons...
cd "%~dp0android"
call gradlew --stop 2>nul
cd ..

echo.
echo [4/5] Waiting for files to unlock...
timeout /t 3 /nobreak

echo.
echo [5/5] Deleting build folders...
rmdir /s /q "%~dp0android\build" 2>nul
rmdir /s /q "%~dp0android\app\build" 2>nul
rmdir /s /q "%~dp0android\.gradle" 2>nul

echo.
echo ========================================
echo   Files unlocked and cleaned!
echo ========================================
echo.
echo NOW:
echo 1. Open Android Studio again
echo 2. File -^> Sync Project with Gradle Files
echo 3. Build -^> Build APK
echo.
echo (Don't clean, just build directly)
echo.
pause
