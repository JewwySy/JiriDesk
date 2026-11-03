' Starts the signaling server with no window, so there is no console for anyone to close by accident.
Set shell = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WScript.Quit shell.Run("powershell.exe -NoProfile -File """ & dir & "\Start-TailscaleSignaling.ps1""", 0, True)
