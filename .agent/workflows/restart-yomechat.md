---
description: AI嫁チャのバックエンド＆フロントエンドの安全な再起動手順
---
// turbo-all

# AI嫁チャ サーバー再起動

バックエンドの再起動時、`send_command_input` のTerminateはWindows環境でタイムアウトする。
代わりに `taskkill` + `Start-Sleep` でクリーンに再起動すること。

## 手順

1. 既存のnodeプロセスをすべて終了する
```powershell
Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
```

2. ポートが解放されるまで5秒待つ（TIME_WAIT回避）
```powershell
Start-Sleep -Seconds 5
```

3. バックエンドを起動する
```powershell
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "cd backend; node server.js"
```

4. フロントエンドを起動する
```powershell
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"
```

## 注意事項
- ステップ1でnodeプロセスが他にある場合も全部止まるので注意。
- このワークフローはターミナルウィンドウ（黒窓）を2つポップアップしてサーバーを起動します。
- バックエンドのプロセスIDは保持せず、毎回 `Get-Process` でkillする方式。
