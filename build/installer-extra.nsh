; 安装期附加动作（b6 收尾：补「接入说明」桌面快捷方式）
; 由 electron-builder 的 nsis.include 引入；只在安装/卸载时执行两条 CreateShortCut/Delete。
; 说明文件为随包资源（extraResources: docs/guide → resources/guide），用系统 .md 关联打开。

!macro customInstall
  CreateShortCut "$DESKTOP\免费外包 接入说明.lnk" "$INSTDIR\resources\guide\agent-onboarding.md"
!macroend

!macro customUnInstall
  Delete "$DESKTOP\免费外包 接入说明.lnk"
!macroend
