#!/usr/bin/env bash
# 用法: ./scripts/metro.sh [start|stop|status]
#
# 讓 Metro 用 nohup 常駐執行，不綁定在啟動它的那個 terminal session 上——
# 關掉 terminal、VS Code 整合終端機、或 IDE 視窗都不會跟著把它殺掉，
# 只有明確執行 stop、或重開機/登出才會停止。
#
# 背景：手機上的 dev build 連不到 Metro 時會直接跳原生錯誤畫面（見 README
# 「常見問題」），根本原因常常是 Metro 綁在某個 terminal tab 上，使用者關掉
# tab 之後 Metro 也跟著死掉，之後開 App 才連不到。用這支 script 啟動可以
# 避免這個情境，不用一直留著一個不能關的 terminal 視窗。

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$PROJECT_ROOT/.metro.pid"
LOG_FILE="$PROJECT_ROOT/.metro.log"
ACTION="${1:-start}"

is_running() {
  [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

case "$ACTION" in
  start)
    if is_running; then
      echo "Metro 已在跑（pid $(cat "$PID_FILE")），不用重複啟動。"
      exit 0
    fi
    cd "$PROJECT_ROOT"
    nohup npx expo start --dev-client >"$LOG_FILE" 2>&1 < /dev/null &
    disown
    echo $! > "$PID_FILE"
    echo "Metro 已在背景啟動（pid $(cat "$PID_FILE")），log: $LOG_FILE"
    echo "關掉這個 terminal 不會影響它，要停止請執行 ./scripts/metro.sh stop"
    ;;
  stop)
    if is_running; then
      kill "$(cat "$PID_FILE")"
      rm -f "$PID_FILE"
      echo "Metro 已停止。"
    else
      echo "Metro 目前沒有在跑。"
    fi
    ;;
  status)
    if is_running; then
      echo "Metro 正在跑（pid $(cat "$PID_FILE")）。"
    else
      echo "Metro 目前沒有在跑。"
    fi
    ;;
  *)
    echo "錯誤：用法為 ./scripts/metro.sh [start|stop|status]" >&2
    exit 1
    ;;
esac
