import json
import time
import sys
import argparse
import os

def read_messages(messages_file):
    try:
        with open(messages_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        return []

def main():
    parser = argparse.ArgumentParser(description="Wait for user message from messages.json")
    parser.add_argument("--file", type=str, required=True, help="Path to messages.json")
    args = parser.parse_args()

    messages_file = args.file

    if not os.path.exists(messages_file):
        print(f"Error: {messages_file} not found.", file=sys.stderr)
        sys.exit(1)

    # 起動時の最後のメッセージIDを記憶
    initial_messages = read_messages(messages_file)
    last_processed_id = None
    if initial_messages:
        last_processed_id = initial_messages[-1].get("id")

    # print(f"監視を開始します... (Last ID: {last_processed_id})", file=sys.stderr)
    
    last_mtime = os.path.getmtime(messages_file)

    while True:
        time.sleep(1) # 1秒ポーリング
        
        try:
            current_mtime = os.path.getmtime(messages_file)
            if current_mtime != last_mtime:
                last_mtime = current_mtime
                messages = read_messages(messages_file)
                
                if not messages:
                    continue
                
                latest_message = messages[-1]
                
                # 新しいメッセージが追加されており、それが user のものか判定
                if latest_message.get("id") != last_processed_id:
                    last_processed_id = latest_message.get("id")
                    
                    if latest_message.get("role") == "user":
                        # userのメッセージであれば標準出力にテキストのみを出力して終了
                        print(latest_message.get("text", ""))
                        sys.exit(0)
                        
        except FileNotFoundError:
            pass # ファイルが一時的に存在しない(リネーム等)場合はスルー
        except Exception as e:
            # print(f"Error during polling: {e}", file=sys.stderr)
            pass

if __name__ == "__main__":
    main()
