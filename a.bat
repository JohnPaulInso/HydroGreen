@echo off
rem (2026-07-13) Compile fresh APK and open output folder; prev state: launch studio
call npm run sync
cd android
rem (2026-07-13) Direct assembleDebug call without daemon stop; prev: daemon stop
call gradlew.bat assembleDebug
explorer app\build\outputs\apk\debug
rem (2026-07-13) Exit cleanly with code 0; prev: no explicit exit
exit /b 0
