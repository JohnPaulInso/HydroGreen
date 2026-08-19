@echo off
echo.
echo ========================================
echo   FIXING SSL CERTIFICATE ISSUE
echo ========================================
echo.

echo [1/4] Stopping Gradle daemons...
cd android
call gradlew --stop
cd ..

echo.
echo [2/4] Clearing Gradle cache...
rmdir /s /q "%USERPROFILE%\.gradle\caches" 2>nul

echo.
echo [3/4] Configuration updated...
echo - gradle.properties now points to Android Studio JBR-21
echo - Removed WINDOWS-ROOT certificate settings

echo.
echo ========================================
echo   NOW DO THIS IN ANDROID STUDIO:
echo ========================================
echo.
echo 1. File -^> Invalidate Caches
echo    Check all boxes, click Invalidate and Restart
echo.
echo 2. After restart:
echo    File -^> Settings -^> Gradle
echo    Set "Gradle JDK" to "jbr-21"
echo.
echo 3. Build -^> Clean Project
echo.
echo 4. Build -^> Build APK
echo.
echo ========================================
echo.
pause
