#!/usr/bin/env bash
# Start Study Buddy (and the free local AI) and open it in the browser.
cd "$(dirname "$0")"
curl -s -o /dev/null http://127.0.0.1:11434/ || (nohup ollama serve >/dev/null 2>&1 &)
(sleep 2; xdg-open http://127.0.0.1:8001 >/dev/null 2>&1) &
exec .venv/bin/python app.py --port 8001
