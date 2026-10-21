@echo off
rem Starts the JudgeHint dev stack: Postgres + Redis (Docker), migrations, sandbox images, then web + api + judge-worker.
rem Usage: start.bat          normal start
rem        start.bat seed     also (re)load demo data
setlocal
cd /d "%~dp0"

set "COMPOSE=docker compose -f docker/compose/docker-compose.dev.yml"
set "DO_SEED="
if /i "%~1"=="seed" set "DO_SEED=1"

echo [1/6] Kiem tra cong cu...
where node >nul 2>&1 || (echo Khong tim thay Node.js - cai Node 20 tro len. & goto :fail)
where pnpm >nul 2>&1 || (echo Khong tim thay pnpm - chay: npm i -g pnpm@9 & goto :fail)
docker info >nul 2>&1 || (echo Docker chua chay - hay mo Docker Desktop roi chay lai. & goto :fail)

echo [2/6] Kiem tra file .env...
if not exist .env (
  copy /y .env.example .env >nul
  node -e "const fs=require('fs'),c=require('crypto');const s=fs.readFileSync('.env','utf8').replace(/^(JWT_(ACCESS|REFRESH)_SECRET)=(?=\r?$)/gm,(m,k)=>k+'='+c.randomBytes(32).toString('hex'));fs.writeFileSync('.env',s)" || goto :fail
  echo Da tao .env tu .env.example voi JWT secret ngau nhien.
  set "DO_SEED=1"
)

echo [3/6] Cai dependency...
if not exist node_modules (
  call pnpm install || goto :fail
)

echo [4/6] Khoi dong Postgres + Redis...
%COMPOSE% up -d --wait || goto :fail

echo [5/6] Ap migration...
call pnpm db:deploy || goto :fail
if defined DO_SEED (
  echo Nap du lieu demo...
  call pnpm db:seed || goto :fail
)

echo [6/6] Kiem tra image sandbox...
set "NEED_SANDBOX="
for %%I in (judgehint/py:3.12 judgehint/node:20 judgehint/gcc:13) do (
  docker image inspect %%I >nul 2>&1 || set "NEED_SANDBOX=1"
)
if defined NEED_SANDBOX (
  echo Thieu image sandbox, dang build - lan dau mat vai phut...
  call pnpm build:sandbox || goto :fail
)

echo.
echo Dang chay web :5173, api :4000, judge-worker. Nhan Ctrl+C de dung.
echo Postgres/Redis van chay nen sau khi dung - tat bang: pnpm db:down
start "" cmd /c "timeout /t 8 >nul & start http://localhost:5173"
call pnpm dev
goto :eof

:fail
echo.
echo Khoi dong that bai.
pause
exit /b 1
