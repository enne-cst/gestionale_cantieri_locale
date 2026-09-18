@echo off
title FIDA EDILE - Gestione Cantieri
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode

echo Avvio del server locale... lascia aperta questa finestra.
start "" http://localhost:8765
node server.js %*
goto fine

:nonode
echo.
echo Node.js NON risulta installato su questo PC.
echo Senza Node.js i dati NON vengono salvati nella cartella dell'app: restano
echo dentro il browser di questo PC (modalita file) e non sono condivisibili.
echo Per avere l'archivio in data\database.json installa Node.js (gratuito, versione LTS)
echo da https://nodejs.org e riavvia questo file.
echo.
echo Intanto apro l'app in modalita file.
start "" "%~dp0app\index.html"
pause

:fine
pause
