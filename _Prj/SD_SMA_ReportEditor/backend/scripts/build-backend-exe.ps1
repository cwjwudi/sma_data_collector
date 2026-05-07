# Builds backend/dist/report_backend/ for electron-builder extraResources
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    Write-Error "Python launcher (py) not found. Install Python 3.10+ and add to PATH."
}

$venvPy = Join-Path $PWD "venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    Write-Host "Creating venv..."
    py -3 -m venv venv
}

& $venvPy -m pip install -q -r requirements-dev.txt

Write-Host "Running PyInstaller..."
$pyiArgs = @(
    "-m", "PyInstaller",
    "--noconfirm", "--clean", "--onedir",
    "--name", "report_backend",
    "--paths", ".",
    "run_backend.py",
    "--hidden-import", "uvicorn.logging",
    "--hidden-import", "uvicorn.loops",
    "--hidden-import", "uvicorn.loops.auto",
    "--hidden-import", "uvicorn.protocols",
    "--hidden-import", "uvicorn.protocols.http",
    "--hidden-import", "uvicorn.protocols.http.auto",
    "--hidden-import", "uvicorn.protocols.websockets",
    "--hidden-import", "uvicorn.protocols.websockets.auto",
    "--hidden-import", "uvicorn.lifespan",
    "--hidden-import", "uvicorn.lifespan.on",
    "--hidden-import", "pydantic.deprecated.decorator",
    "--hidden-import", "pymysql",
    "--collect-all", "uvicorn",
    "--collect-all", "fastapi",
    "--collect-all", "starlette",
    "--collect-all", "pydantic",
    "--collect-all", "sqlalchemy",
    "--collect-all", "cryptography",
    "--collect-all", "asyncua"
)
& $venvPy @pyiArgs

$exe = Join-Path $PWD "dist\report_backend\report_backend.exe"
if (-not (Test-Path $exe)) {
    Write-Error "Build failed: missing $exe"
}
Write-Host "OK: $exe"
