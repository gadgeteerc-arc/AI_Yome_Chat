import json
import uuid
import datetime
import argparse
import tempfile
import shutil
import os
import sys

def append_yome_message(messages_file, text, expression):
    if not text:
        print("Error: Text is required.", file=sys.stderr)
        sys.exit(1)
        
    try:
        # ファイルの読み込み
        messages = []
        if os.path.exists(messages_file):
            with open(messages_file, "r", encoding="utf-8") as f:
                try:
                    messages = json.load(f)
                except json.JSONDecodeError:
                    messages = []

        # 新規メッセージの作成
        new_msg = {
            "id": str(uuid.uuid4()),
            "role": "yome",
            "text": text,
            "expression": expression or "smile",
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        
        messages.append(new_msg)

        # 原子的な(Atomic)書き込みのためのテンポラリファイル処理
        # (同時にサーバー等から書き込まれてファイルが破損するのを防ぐ)
        directory = os.path.dirname(messages_file)
        if not os.path.exists(directory):
            os.makedirs(directory, exist_ok=True)
            
        fd, temp_path = tempfile.mkstemp(dir=directory, suffix=".json", text=True)
        
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(messages, f, indent=2, ensure_ascii=False)
            
        # リネームによって安全に上書き
        shutil.move(temp_path, messages_file)
        
        print(f"Successfully appended message. (expression: {new_msg['expression']})")
        
    except Exception as e:
        print(f"Failed to append message: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Send a message as the Yome agent")
    parser.add_argument("--file", type=str, required=True, help="Path to messages.json")
    
    text_group = parser.add_mutually_exclusive_group(required=True)
    text_group.add_argument("--text", type=str, help="The message text (direct)")
    text_group.add_argument("--from_file", type=str, help="Path to a text file containing the message")
    
    parser.add_argument("--expression", type=str, default="smile", help="The expression/image name for the avatar")
    
    args = parser.parse_args()
    
    # --from_file の場合はファイルから読み込む
    if args.from_file:
        with open(args.from_file, "r", encoding="utf-8") as f:
            text = f.read()
    else:
        text = args.text
    
    append_yome_message(args.file, text, args.expression)
