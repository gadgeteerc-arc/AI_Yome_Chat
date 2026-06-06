import json
import time
import sys
import argparse
import os
import traceback
import threading
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# スレッド間の競合を防ぐためのロックと、クリーン終了用のイベント
lock = threading.Lock()
exit_event = threading.Event()

def read_messages_with_retry(messages_file, max_retries=12, initial_delay=0.01):
    """
    Windowsのファイルロック競合や一時的なファイル空白状態に対応するため、
    指数バックオフ（Exponential Backoff）リトライ付きで messages.json を安全に読み込むお！
    """
    last_exception = None
    delay = initial_delay
    
    for attempt in range(max_retries):
        try:
            if not os.path.exists(messages_file):
                # 一時的にファイルがリネームで消失している可能性を考慮して少し待つお
                time.sleep(delay)
                delay *= 2 # 指数バックオフ
                continue
                
            with open(messages_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                # パースされたデータが空、またはリスト形式でない場合はまだ書き込み途中とみなすお
                if not isinstance(data, list):
                    time.sleep(delay)
                    delay *= 2
                    continue
                return data
        except (PermissionError, FileNotFoundError, json.JSONDecodeError) as e:
            last_exception = e
            time.sleep(delay)
            delay *= 2  # バックオフでディレイを徐々に伸ばすお（最大で約2.5秒カバーできるお）
        except Exception as e:
            last_exception = e
            time.sleep(delay)
            delay *= 2
            
    if last_exception:
        print(f"[Warning] Failed to read messages file after {max_retries} attempts: {last_exception}", file=sys.stderr)
    return []

class MessageHandler(FileSystemEventHandler):
    def __init__(self, messages_file, check_callback):
        # 比較用パスは初期化時に一度だけ正規化・小文字化しておくお！
        self.messages_file = os.path.normpath(os.path.abspath(messages_file)).lower()
        self.check_callback = check_callback

    def is_target_file(self, src_path):
        if not src_path:
            return False
        # イベントごとの os.path.abspath を排除して高速化！
        # watchdogのイベントパスは基本絶対パスなので normpath だけで十分だお
        return os.path.normpath(src_path).lower() == self.messages_file

    def handle_event(self, event):
        # 移動イベントの場合、移動先が messages.json かどうかチェックするお
        target_path = event.dest_path if event.event_type == 'moved' else event.src_path
        if self.is_target_file(target_path):
            self.check_callback("watchdog")

    def on_modified(self, event):
        self.handle_event(event)

    def on_created(self, event):
        self.handle_event(event)

    def on_moved(self, event):
        self.handle_event(event)

class MessageChecker:
    def __init__(self, messages_file, initial_last_id):
        self.messages_file = os.path.abspath(messages_file)
        self.last_processed_id = initial_last_id

    def check(self, source_label=""):
        # スレッドの終了イベントがセットされていたら即リターン
        if exit_event.is_set():
            return False

        # スレッドロックを取得して、IDチェックと更新・出力をアトミック（不可分）にするお！
        with lock:
            try:
                # 終了イベントの再チェック（ロック獲得の狭間用）
                if exit_event.is_set():
                    return False

                messages = read_messages_with_retry(self.messages_file)
                if not messages:
                    return False
                
                latest_message = messages[-1]
                latest_id = latest_message.get("id")

                # 前回処理したIDと異なるかチェック
                if latest_id != self.last_processed_id:
                    self.last_processed_id = latest_id
                    
                    # 新しいメッセージがuserから送られたものである場合
                    if latest_message.get("role") == "user":
                        # メイン出力（エージェントが受け取るメッセージ）
                        print(latest_message.get("text", ""))
                        sys.stdout.flush()
                        
                        # 検出成功フラグをセットして、メインスレッドに終了を知らせるお！
                        exit_event.set()
                        return True
                return False
            except Exception as e:
                print(f"[Error in check]: {e}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)
                return False

def main():
    parser = argparse.ArgumentParser(description="Wait for user message using watchdog & polling hybrid (Thread-Safe)")
    parser.add_argument("--file", type=str, required=True, help="Path to messages.json")
    args = parser.parse_args()

    messages_file = args.file

    if not os.path.exists(messages_file):
        print(f"Error: {messages_file} not found.", file=sys.stderr)
        sys.exit(1)

    initial_messages = read_messages_with_retry(messages_file)
    last_processed_id = None
    if initial_messages:
        last_processed_id = initial_messages[-1].get("id")

    checker = MessageChecker(messages_file, last_processed_id)
    
    # watchdogのイベントハンドラーをセットアップ
    event_handler = MessageHandler(messages_file, checker.check)
    observer = Observer()
    
    # ディレクトリ監視
    target_dir = os.path.dirname(os.path.abspath(messages_file))
    observer.schedule(event_handler, target_dir, recursive=False)
    observer.start()

    try:
        # メインスレッドは終了イベントを監視しつつ、1.5秒間隔でポーリングバックアップを行うお
        while not exit_event.is_set():
            # time.sleepを短く刻み、終了イベントへの反応性を高めるお
            for _ in range(15):
                if exit_event.is_set():
                    break
                time.sleep(0.1)
                
            if exit_event.is_set():
                break
                
            # watchdogの取りこぼし対策ポーリング
            checker.check("polling")
            
    except KeyboardInterrupt:
        pass
    finally:
        # クリーンアップ処理を確実に通すお！OSのリソースハンドルもこれで安心！
        observer.stop()
        observer.join()
        
    # クリーンに終了コード0でプロセスを閉じるお！
    sys.exit(0)

if __name__ == "__main__":
    main()
