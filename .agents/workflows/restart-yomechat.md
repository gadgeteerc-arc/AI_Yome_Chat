---
description: AI嫁チャのバックエンド＆フロントエンドの安全な再起動手順
---
// turbo-all

# AI嫁チャ サーバー再起動

バックエンドの再起動時、`send_command_input` のTerminateはWindows環境でタイムアウトする。
代わりに `taskkill` + `Start-Sleep` でクリーンに再起動すること。

## 手順

1. 既存のnodeプロセスを終了する（PID指定でスマートに狙い撃ちキル）
```powershell
$pidPath = "d:\AntigravityProject\Daru\AI_Yome_Chat\data\server.pid"
if (Test-Path $pidPath) {
    $targetPid = Get-Content $pidPath -Raw
    $targetPid = $targetPid.Trim()
    if ($targetPid) {
        Write-Host "Killing Node process with PID: $targetPid"
        Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
    }
} else {
    # フォールバック：3001ポートを使用しているnodeプロセスをキル
    Write-Host "PID file not found. Falling back to port 3001 check..."
    $proc = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "Killing process with PID: $($proc.OwningProcess) occupying port 3001"
        Stop-Process -Id $proc.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}
```

2. ポートが解放されるまで5秒待つ（TIME_WAIT回避）
```powershell
Start-Sleep -Seconds 5
```

3. バックエンドを起動する（コンフィグパスは状況に応じて変更）
```powershell
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "cd d:\AntigravityProject\Daru\AI_Yome_Chat\backend; node server.js --config data/agent_mio.json"
```

4. フロントエンドを起動する
```powershell
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "cd d:\AntigravityProject\Daru\AI_Yome_Chat\frontend; npm run dev"
```

## 注意事項
- ステップ1では、`server.pid` ファイルに記録されたプロセスID（PID）をスマートに狙い撃ちしてキルします。
- `server.pid` が存在しない場合のフォールバック時も、ポート3001を使用しているNodeプロセスのみをピンポイントで特定して終了するため、関係のない他のNodeプロセスを巻き込む心配はありません。
- このワークフローを実行すると、バックエンドとフロントエンドがそれぞれ新しいPowerShellウィンドウ（黒窓）で自動起動します。
- **【重要：起動エラー 0x800700e8 発生時の対策】**
  Windowsの環境（セッション分離等）によっては、ステップ3・4の `Start-Process powershell.exe` 実行時にエラー `0x800700e8`（パイプが閉じられました）が発生し、別窓が起動しない場合があります。
  その場合は、GUIウィンドウのポップアップ起動を諦め、Antigravity（エージェント）のバックグラウンドタスク（`run_command`）で以下を直接バックグラウンド常駐起動させてください：
  - バックエンド: `node server.js --config data/agent_mio.json` (ディレクトリ: `AI_Yome_Chat/backend`)
  - フロントエンド: `npm run dev` (ディレクトリ: `AI_Yome_Chat/frontend`)
