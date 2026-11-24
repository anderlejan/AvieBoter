; AvieBoter installer (Inno Setup 6). Built by build\build.ps1.
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef StageDir
  #define StageDir "..\..\build-cache\stage"
#endif
#ifndef OutDir
  #define OutDir "..\..\installers"
#endif
#ifndef OutName
  #define OutName "AvieBoter-Setup-" + AppVersion
#endif
#ifndef RedistDir
  #define RedistDir "..\..\build-cache"
#endif

[Setup]
AppId={{B7E4C1A2-5D3F-4E8B-9A61-2C7F0D93E415}
AppName=AvieBoter
AppVersion={#AppVersion}
AppVerName=AvieBoter {#AppVersion}
AppPublisher=AvieBoter
AppPublisherURL=https://github.com/anderlejan/AvieBoter
AppSupportURL=https://github.com/anderlejan/AvieBoter
AppUpdatesURL=https://github.com/anderlejan/AvieBoter/releases
; the app was called "SL Bot Manager" before 1.0: same AppId, so it is upgraded in place; its old folder is removed below
UsePreviousAppDir=no
DefaultDirName={autopf}\AvieBoter
DefaultGroupName=AvieBoter
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir={#OutDir}
OutputBaseFilename={#OutName}
SetupIconFile=..\manager\Assets\AvieBoter.ico
UninstallDisplayIcon={app}\AvieBoter.exe
LicenseFile=..\LICENSE
InfoBeforeFile=before-install.txt
Compression=lzma2/max
LZMAUseSeparateProcess=yes
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
VersionInfoVersion={#AppVersion}
VersionInfoProductName=AvieBoter
VersionInfoDescription=AvieBoter installer

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "autostart"; Description: "Start AvieBoter when I sign in to Windows (in the tray)"; GroupDescription: "Options:"; Flags: unchecked
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Options:"

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#RedistDir}\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: NeedsWebView2

[InstallDelete]
; old program files must not mix with new ones (user data lives in %LOCALAPPDATA%\AvieBoter and is kept)
Type: files; Name: "{autoprograms}\SL Bot Manager.lnk"
Type: files; Name: "{autodesktop}\SL Bot Manager.lnk"
Type: filesandordirs; Name: "{app}\bot"
Type: filesandordirs; Name: "{app}\wwwroot"

[Icons]
Name: "{autoprograms}\AvieBoter"; Filename: "{app}\AvieBoter.exe"
Name: "{autodesktop}\AvieBoter"; Filename: "{app}\AvieBoter.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "AvieBoter"; ValueData: """{app}\AvieBoter.exe"" --tray"; Tasks: autostart; Flags: uninsdeletevalue

[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Installing Microsoft Edge WebView2 Runtime…"; Flags: waituntilterminated; Check: NeedsWebView2
Filename: "{app}\AvieBoter.exe"; Description: "Start AvieBoter now"; Flags: nowait postinstall

[UninstallRun]
Filename: "{app}\AvieBoter.exe"; Parameters: "--quit"; Flags: runhidden waituntilterminated; RunOnceId: "QuitApp"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
function WebView2Version(): String;
var v: String;
begin
  Result := '';
  if RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', v) then Result := v
  else if RegQueryStringValue(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', v) then Result := v;
  if Result = '0.0.0.0' then Result := '';
end;

function NeedsWebView2(): Boolean;
begin
  Result := WebView2Version() = '';
end;

function OldDir(): String;
begin
  // where the app lived under its former name (SL Bot Manager, before 1.0)
  Result := ExpandConstant('{autopf}\SL Bot Manager');
end;

procedure QuitRunningCopy();
var Code: Integer; Quit: Boolean;
begin
  Quit := False;
  if FileExists(ExpandConstant('{app}\AvieBoter.exe')) then
  begin
    Exec(ExpandConstant('{app}\AvieBoter.exe'), '--quit --update', '', SW_HIDE, ewWaitUntilTerminated, Code);
    Quit := True;
  end;
  if FileExists(OldDir() + '\SLBotManager.exe') then
  begin
    Exec(OldDir() + '\SLBotManager.exe', '--quit --update', '', SW_HIDE, ewWaitUntilTerminated, Code);
    Quit := True;
  end;
  if Quit then Sleep(8000);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  QuitRunningCopy();
  Result := '';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // "Start with Windows" belongs to the app's Settings: an update (which runs without the task) must keep it.
    // The former name's entry is carried over to the new name.
    if RegValueExists(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'SLBotManager') then
    begin
      RegWriteStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'AvieBoter', '"' + ExpandConstant('{app}\AvieBoter.exe') + '" --tray');
      RegDeleteValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'SLBotManager');
    end;
    // the former name's program folder (only when it really is that program)
    if FileExists(OldDir() + '\SLBotManager.exe') and (CompareText(OldDir(), ExpandConstant('{app}')) <> 0) then
      DelTree(OldDir(), True, True, True);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  // the app's own "Start with Windows" entry goes with the app
  if CurUninstallStep = usPostUninstall then
    RegDeleteValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'AvieBoter');
end;
