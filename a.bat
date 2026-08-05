@echo off
REM Ultra-quick command: just type "a" to build and open Android Studio
REM (2026-07-13) Update for HydroTrack build/sync; previously called scripts\dev.bat
call npm run sync
call npx cap open android

