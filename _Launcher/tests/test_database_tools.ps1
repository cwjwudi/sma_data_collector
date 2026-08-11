$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path (Split-Path -Parent $ScriptDir) "scripts\database_tools.ps1")

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) {
        throw $Message
    }
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("sd-sma-db-tools-" + [guid]::NewGuid().ToString("N"))
$savedPath = $env:PATH
try {
    $pathBin = Join-Path $tempRoot "environment\mariadb\bin"
    $pluginDir = Join-Path $tempRoot "environment\mariadb\lib\plugin"
    $repoRoot = Join-Path $tempRoot "repo"
    $projectsRoot = Join-Path $tempRoot "package\_Prj"
    New-Item -ItemType Directory -Force -Path $pathBin, $pluginDir, (Join-Path $projectsRoot "SD_SMA_DB_ADMIN") | Out-Null

    $source = @"
using System;
public static class Program {
    public static int Main(string[] args) {
        Console.WriteLine("mariadb-dump.exe Ver 10.19 Distrib 10.11.11-MariaDB, for Win64");
        return 0;
    }
}
"@
    $stub = Join-Path $pathBin "client-stub.exe"
    Add-Type -TypeDefinition $source -Language CSharp -OutputAssembly $stub -OutputType ConsoleApplication
    Copy-Item -LiteralPath $stub -Destination (Join-Path $pathBin "mariadb-dump.exe")
    Copy-Item -LiteralPath $stub -Destination (Join-Path $pathBin "mariadb.exe")
    Set-Content -LiteralPath (Join-Path $pathBin "client-runtime.dll") -Value "runtime" -Encoding ASCII
    Set-Content -LiteralPath (Join-Path $pluginDir "caching_sha2_password.dll") -Value "plugin" -Encoding ASCII

    $mysqlBin = Join-Path $tempRoot "environment\mysql\bin"
    $incompleteBin = Join-Path $tempRoot "environment\incomplete\bin"
    $mysqlProjects = Join-Path $tempRoot "mysql-package\_Prj"
    New-Item -ItemType Directory -Force -Path $mysqlBin, $incompleteBin, (Join-Path $mysqlProjects "SD_SMA_DB_ADMIN") | Out-Null
    $mysqlSource = @"
using System;
public static class MySqlProgram {
    public static int Main(string[] args) {
        Console.WriteLine("mysqldump  Ver 8.0.42 for Win64 on x86_64 (MySQL Community Server - GPL)");
        return 0;
    }
}
"@
    $mysqlStub = Join-Path $mysqlBin "mysql-stub.exe"
    Add-Type -TypeDefinition $mysqlSource -Language CSharp -OutputAssembly $mysqlStub -OutputType ConsoleApplication
    Copy-Item -LiteralPath $mysqlStub -Destination (Join-Path $mysqlBin "mysqldump.exe")
    Copy-Item -LiteralPath $mysqlStub -Destination (Join-Path $mysqlBin "mysql.exe")
    Set-Content -LiteralPath (Join-Path $mysqlBin "libcrypto-runtime.dll") -Value "runtime" -Encoding ASCII
    Copy-Item -LiteralPath $stub -Destination (Join-Path $incompleteBin "mariadb-dump.exe")

    $env:PATH = $incompleteBin + ";" + $mysqlBin
    $mysqlResult = Install-DatabaseClientTools -RepoRoot $repoRoot -ProjectsRoot $mysqlProjects
    Assert-True $mysqlResult.Included "PATH MySQL client was not included after an incomplete candidate"
    Assert-True ($mysqlResult.Family -eq "MySQL") "MySQL family was not detected"
    Assert-True (Test-Path -LiteralPath (Join-Path $mysqlProjects "SD_SMA_DB_ADMIN\_tools\database-client\bin\mysqldump.exe")) "MySQL dump was not copied"
    Assert-True (Test-Path -LiteralPath (Join-Path $mysqlProjects "SD_SMA_DB_ADMIN\_tools\database-client\bin\mysql.exe")) "MySQL client was not copied"
    Assert-True (Test-Path -LiteralPath (Join-Path $mysqlProjects "SD_SMA_DB_ADMIN\_tools\database-client\bin\libcrypto-runtime.dll")) "MySQL runtime DLL was not copied"

    $env:PATH = $pathBin
    $result = Install-DatabaseClientTools -RepoRoot $repoRoot -ProjectsRoot $projectsRoot
    Assert-True $result.Included "PATH MariaDB client was not included"
    Assert-True ($result.Family -eq "MariaDB") "MariaDB family was not detected"
    Assert-True (Test-Path -LiteralPath (Join-Path $projectsRoot "SD_SMA_DB_ADMIN\_tools\database-client\bin\mariadb-dump.exe")) "dump was not copied"
    Assert-True (Test-Path -LiteralPath (Join-Path $projectsRoot "SD_SMA_DB_ADMIN\_tools\database-client\bin\mariadb.exe")) "client was not copied"
    Assert-True (Test-Path -LiteralPath (Join-Path $projectsRoot "SD_SMA_DB_ADMIN\_tools\database-client\bin\client-runtime.dll")) "runtime DLL was not copied"
    Assert-True (Test-Path -LiteralPath (Join-Path $projectsRoot "SD_SMA_DB_ADMIN\_tools\database-client\lib\plugin\caching_sha2_password.dll")) "authentication plugin was not copied"

    $emptyProjects = Join-Path $tempRoot "empty-package\_Prj"
    New-Item -ItemType Directory -Force -Path (Join-Path $emptyProjects "SD_SMA_DB_ADMIN") | Out-Null
    $env:PATH = ""
    $missing = Install-DatabaseClientTools -RepoRoot (Join-Path $tempRoot "empty-repo") -ProjectsRoot $emptyProjects
    Assert-True (-not $missing.Included) "missing client should warn and continue without including tools"

    Write-Host "database tool packaging tests passed"
}
finally {
    $env:PATH = $savedPath
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
