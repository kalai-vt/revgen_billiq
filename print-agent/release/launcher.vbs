' Launches the agent with no visible console window — node.exe run directly always opens one,
' and this is meant to be a silent background service (spec §19), not a terminal app. wscript.exe
' running this file is what both the Start Menu shortcut and the Windows Startup entry point at;
' `0` is WshShell.Run's hidden-window flag, `False` means don't wait for it to exit.
Dim objShell, objFSO, scriptDir
Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")
scriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
objShell.CurrentDirectory = scriptDir
objShell.Run """" & scriptDir & "\node.exe"" ""app\dist\index.js""", 0, False
