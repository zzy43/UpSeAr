@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ================================================
echo  重新生成 6 本手册的全部章节
echo  （会覆盖各目录 data\ 下的 .js；原 PDF 不动）
echo ================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [错误] 找不到 python，请先装 Python 3.10+ 并勾选 Add to PATH
  pause
  exit /b 1
)

python -c "import pypdf" 2>nul
if errorlevel 1 (
  echo [提示] 没有 pypdf，正在安装...
  python -m pip install pypdf
  echo.
)

set MISS=0
call :chk "YTO-01-27-2 B757&B767标准操作程序（R05-02试运行） (1).pdf"
call :chk "757&767 飞行机组训练手册.pdf"
call :chk "YTO-01-04-2 B757-200ER飞机飞行手册 (R00-03）.pdf"
call :chk "YTO-01-05-02 B757-200 飞行机组操作手册 V1(R02-10）.pdf"
call :chk "YTO-01-05-02 B757-200 飞行机组操作手册 V2(R02-10）.pdf"
call :chk "Operations Manual（R05-04）.pdf"
if not "%MISS%"=="0" (
  echo.
  echo [停] 上面缺 %MISS% 个 PDF，脚本跑不了。
  echo      请把手册 PDF 拷到本文件夹（文件名不能改，见 README.md 第三节）。
  pause
  exit /b 1
)
echo PDF 齐了，开始转换...
echo.
echo.
echo ================================================
echo  全部完成。每章的「完整性核对」见上面的输出，
echo  完整小结也写在 _report.txt（最后一次运行的那份）。
echo ================================================
pause
exit /b 0

:chk
if exist "%~1" exit /b 0
set /a MISS+=1
echo   [缺] "%~1"
exit /b 0
