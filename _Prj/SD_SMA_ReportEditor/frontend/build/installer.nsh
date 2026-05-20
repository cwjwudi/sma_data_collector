; Custom NSIS hooks for SD SMA Report Editor (electron-builder)
; Ensures running app/backend are stopped before uninstall.

!macro customUnInstall
  nsExec::ExecToLog 'taskkill /F /IM "SD SMA Report Editor.exe" /T 2>nul'
  nsExec::ExecToLog 'taskkill /F /IM report_backend.exe /T 2>nul'
  Sleep 500
!macroend

!macro customInstall
  ; Register uninstall entry is handled by electron-builder NSIS template.
!macroend
