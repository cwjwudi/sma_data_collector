#ifndef SourceRoot
  #error SourceRoot must be supplied by build_installer_package.ps1
#endif
#ifndef OutputDir
  #error OutputDir must be supplied by build_installer_package.ps1
#endif
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

#define AppName "SD SMA Runtime"
#define AppPublisher "SmartData"
#define LauncherRelativePath "_Launcher\SD_SMA_Launcher.exe"

[Setup]
AppId={{C54F5E47-9517-4D29-9E4B-7380996A19C4}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\SmartData\SD SMA
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=SD_SMA_Setup_{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\{#LauncherRelativePath}
SetupLogging=yes

[Files]
Source: "{#SourceRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#LauncherRelativePath}"; WorkingDir: "{app}\_Launcher"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#LauncherRelativePath}"; WorkingDir: "{app}\_Launcher"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加快捷方式："

[Run]
Filename: "{app}\{#LauncherRelativePath}"; Description: "启动 {#AppName}"; WorkingDir: "{app}\_Launcher"; Flags: nowait postinstall skipifsilent unchecked
