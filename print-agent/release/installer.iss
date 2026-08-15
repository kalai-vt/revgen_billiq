; RevGenAI Print Agent — Windows installer (Inno Setup).
;
; Installs to {localappdata} (no admin rights needed — spec §19: "Do not require administrator
; privileges unless genuinely necessary"), bundles a portable Node runtime + production
; node_modules (including native binaries for better-sqlite3/usb/pdf-to-printer/systray2) so a
; customer's machine needs nothing pre-installed, and adds a Startup-folder shortcut for
; "start with Windows" rather than a registry Run key — a Startup shortcut is visible/removable by
; the user in File Explorer and is exactly what Inno's own uninstaller tracks and cleans up
; automatically, unlike a hand-written registry entry.
;
; Build with: "C:\Program Files\Inno Setup 7\ISCC.exe" release\installer.iss
; (see release/README.md for the full build sequence — staging app/, downloading the portable
; Node runtime, then this step).

#define MyAppName "RevGenAI Print Agent"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "RevGenAI"
#define MyAppURL "https://revgenai.in"

[Setup]
AppId={{B4C8F2A1-5E3D-4A9B-9C7F-1D6E8A2B4C9F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={localappdata}\RevGenAI Print Agent
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=dist-installer
OutputBaseFilename=RevGenAI-Print-Agent-Setup-{#MyAppVersion}
SetupIconFile=assets\icon.ico
UninstallDisplayIcon={app}\assets\icon.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "startupicon"; Description: "Start RevGenAI Print Agent automatically when Windows starts"; GroupDescription: "Startup:"; Flags: checkedonce

[Files]
Source: "stage\node.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "launcher.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "assets\icon.ico"; DestDir: "{app}\assets"; Flags: ignoreversion
Source: "stage\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Straight under Start Menu > Programs, not a submenu folder — DisableProgramGroupPage with an
; unset {group} name otherwise lands these in a literal "(Default)" folder, which is confusing
; for two shortcuts that don't need a group of their own.
Name: "{userprograms}\{#MyAppName}"; Filename: "wscript.exe"; Parameters: """{app}\launcher.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\assets\icon.ico"
Name: "{userprograms}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{userstartup}\{#MyAppName}"; Filename: "wscript.exe"; Parameters: """{app}\launcher.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\assets\icon.ico"; Tasks: startupicon

[Run]
Filename: "wscript.exe"; Parameters: """{app}\launcher.vbs"""; WorkingDir: "{app}"; Description: "Launch {#MyAppName} now"; Flags: postinstall skipifsilent nowait
Filename: "http://127.0.0.1:47812/"; Description: "Open the Print Agent page"; Flags: postinstall skipifsilent shellexec nowait unchecked
