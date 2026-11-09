; Script de Inno Setup para Safe-PayMatch
; Permite generar el instalador Safe-PayMatch-Setup-v1.0.0.exe con soporte de actualizaciones in-place

#define MyAppName "Safe-PayMatch"
#ifndef MyAppVersion
#define MyAppVersion "1.3.0"
#endif
#define MyAppPublisher "rybak.Software"
#define MyAppURL "https://github.com/javsent/Safe-PayMatch"
#define MyAppExeName "Safe-PayMatch.exe"

[Setup]
AppId={{D37E8A12-88B4-4B21-9952-4752BC42A944}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
; Permitir instalación sin privilegios de administrador si el usuario no tiene permisos
PrivilegesRequired=lowest
OutputDir=..\installer_output
OutputBaseFilename=Safe-PayMatch-Setup-v{#MyAppVersion}
SetupIconFile=app.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; Mutex para evitar instalar mientras la app está abierta
AppMutex=SafePayMatchRunningMutex

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Copiar todo el contenido de la carpeta compilada por PyInstaller
Source: "..\dist\Safe-PayMatch\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; NOTA CRÍTICA: La base de datos safe_paymatch.db NO se incluye aquí,
; se crea y reside automáticamente en %APPDATA%\Safe-PayMatch para que
; nunca se borre al reinstalar o actualizar.

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
