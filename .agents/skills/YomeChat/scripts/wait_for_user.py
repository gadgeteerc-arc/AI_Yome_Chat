import json
import time
import sys
import argparse
import os
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

def read_messages(messages_file):
    try:
        with open(messages_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        return []

class MessageHandler(FileSystemEventHandler):
    def __init__(self, messages_file, initial_last_id):
        self.messages_file = os.path.abspath(messages_file)
        self.last_processed_id = initial_last_id

    def on_modified(self, event):
        # フォルダ内の他ファイルの更新イベントは無視
        if os.path.abspath(event.src_path) != self.messages_file:
            return

        # Node.js側が書き込み中のファイルロックを回避するため0.1秒待つ
        time.sleep(0.1)

        try:
            messages = read_messages(self.messages_file)
            if not messages:
                return
            
            latest_message = messages[-1]

            # 前回処理したIDと異なるかチェック
            if latest_message.get("id") != self.last_processed_id:
                self.last_processed_id = latest_message.get("id")
                
                # 新しいメッセージがuserから送られたものである場合
                if latest_message.get("role") == "user":
                    print(latest_message.get("text", ""))
                    sys.stdout.flush()
                    
                    # 別スレッドからプロセス全体を終了させるお！
                    os._exit(0)
        except FileNotFoundError:
            pass
        except Exception:
            pass

def main():
    parser = argparse.ArgumentParser(description="Wait for user message using watchdog (Event-driven)")
    parser.add_argument("--file", type=str, required=True, help="Path to messages.json")
    args = parser.parse_args()

    messages_file = args.file

    if not os.path.exists(messages_file):
        print(f"Error: {messages_file} not found.", file=sys.stderr)
        sys.exit(1)

    initial_messages = read_messages(messages_file)
    last_processed_id = None
    if initial_messages:
        last_processed_id = initial_messages[-1].get("id")

    event_handler = MessageHandler(messages_file, last_processed_id)
    observer = Observer()
    
    # ファイル一つだけではなく、そのファイルが存在するディレクトリを監視対象にする
    target_dir = os.path.dirname(os.path.abspath(messages_file))
    observer.schedule(event_handler, target_dir, recursive=False)
    observer.start()

    try:
        # メインスレッドはここで緩やかに待機。
        # 実際の処理は observer スレッドの on_modified で爆速で走るお！
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

if __name__ == "__main__":
    main()
