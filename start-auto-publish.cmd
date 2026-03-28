@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File ".\scripts\watch-and-publish.ps1"
