@echo off
:: =============================================
:: a.bat - Build HydroTrack Web & Convert to Android APK
:: =============================================
echo.
echo ============================================
echo  HydroTrack - Android APK Build & Sync
echo ============================================
echo.

echo [1/3] Building Web Assets & Syncing Capacitor...
call npm run sync
if errorlevel 1 (
    echo [ERROR] Web build / Capacitor sync failed!
    exit /b %errorlevel%
)

echo.
echo [2/3] Compiling Android Debug APK via Gradle...
cd android
call gradlew.bat assembleDebug
cd ..

if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    echo.
    echo ============================================
    echo  SUCCESS! Android APK Generated:
    echo  android\app\build\outputs\apk\debug\app-debug.apk
    echo ============================================
    echo.
    echo Opening APK output directory...
    explorer "android\app\build\outputs\apk\debug"
) else (
    echo.
    echo [INFO] Opening Android Studio...
    call npx cap open android
)

echo Done!
