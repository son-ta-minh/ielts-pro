#!/bin/zsh

INTERVAL_MIN=15

RANGES=(
  "6:00-11:00"
  "13:00-17:00"
  "19:00-22:00"
)

APP_DIR="/Users/tmson/Server/ielts-pro/server"
CMD="node ./index.js --public --log=1"
LOOP_INTERVAL=5
LAST_WAKE_TIME=""
LAST_SLEEP_TIME=""
LAST_NO_WAKE_MSG=""
LAST_LOOP_TS=$(date +%s)
WAKE_THRESHOLD=15
SERVER_CHECK_INTERVAL=300
LAST_SERVER_CHECK=0

schedule_next_wake() {
  now_epoch=$(date +%s)

  next_epoch=0
  current_range_end=0

  for range in "${RANGES[@]}"; do
    start="${range%-*}"
    end="${range#*-}"

    today=$(date +%Y-%m-%d)
    tomorrow=$(date -v+1d +%Y-%m-%d)

    start_epoch=$(date -j -f "%Y-%m-%d %H:%M" "$today $start" "+%s")
    end_epoch=$(date -j -f "%Y-%m-%d %H:%M" "$today $end" "+%s")

    if [ $now_epoch -ge $start_epoch ] && [ $now_epoch -lt $end_epoch ]; then
      current_range_end=$end_epoch
    fi

    if [ $now_epoch -lt $start_epoch ]; then
      time_until_start=$((start_epoch - now_epoch))

      if [ $time_until_start -gt 300 ]; then
        if [ "$LAST_SLEEP_TIME" != "PRE_SLEEP_$start_epoch" ]; then
          echo "Outside active range -> forcing sleep until next wake"
          LAST_SLEEP_TIME="PRE_SLEEP_$start_epoch"
        fi

        osascript -e 'tell application "System Events" to sleep'
        return
      fi
    fi

    if [ $start_epoch -gt $now_epoch ]; then
      if [ $next_epoch -eq 0 ] || [ $start_epoch -lt $next_epoch ]; then
        next_epoch=$start_epoch
      fi
    fi
  done

  sudo pmset schedule cancelall

  if [ $next_epoch -eq 0 ]; then
    first_range="${RANGES[1]}"
    tomorrow_start="${first_range%-*}"

    tomorrow_epoch=$(date -j -f "%Y-%m-%d %H:%M" "$tomorrow $tomorrow_start" "+%s")

    next_epoch=$tomorrow_epoch
  fi

  wake_time=$(date -r $next_epoch "+%m/%d/%y %H:%M:00")

  if [ "$LAST_WAKE_TIME" != "$wake_time" ]; then
    echo "Scheduling wake at $wake_time"
    LAST_WAKE_TIME="$wake_time"
  fi

  sudo pmset schedule wakeorpoweron "$wake_time"

  if [ $current_range_end -ne 0 ]; then
    sleep_time=$(date -r $current_range_end "+%m/%d/%y %H:%M:00")

    if [ "$LAST_SLEEP_TIME" != "$sleep_time" ]; then
      echo "Current active range -> will sleep at $sleep_time"
      LAST_SLEEP_TIME="$sleep_time"
    fi

    target_epoch=$current_range_end

    while true; do
      now=$(date +%s)

      if [ $now -ge $target_epoch ]; then
        if [ "$LAST_SLEEP_TIME" != "SLEEP_TRIGGERED_$target_epoch" ]; then
          echo "Stop time reached -> forcing sleep now"
          LAST_SLEEP_TIME="SLEEP_TRIGGERED_$target_epoch"
        fi

        osascript -e 'tell application "System Events" to sleep'
        break
      fi

      sleep 1
    done
  fi
}

run_commands() {
  echo "Wake detected at $(date)"

  cd "$APP_DIR" || exit 1

  echo "Restarting existing node process if any"

  pkill -f "node ./index.js --public --log=1" 2>/dev/null

  sleep 2

  echo "Running: $CMD"

  nohup zsh -c "$CMD" > wake.log 2>&1 &
}

ensure_server_running() {
  now_ts=$(date +%s)

  if [ $((now_ts - LAST_SERVER_CHECK)) -lt $SERVER_CHECK_INTERVAL ]; then
    return
  fi

  LAST_SERVER_CHECK=$now_ts

  if pgrep -f "node ./index.js --public --log=1" > /dev/null; then
    return
  fi

  echo "Node server is not running -> starting"

  cd "$APP_DIR" || return

  nohup zsh -c "$CMD" > wake.log 2>&1 &
}

if [ "$1" = "wake" ]; then
  run_commands
fi

while true; do
  now_ts=$(date +%s)
  delta=$((now_ts - LAST_LOOP_TS))

  if [ $delta -gt $WAKE_THRESHOLD ]; then
    echo "Wake detected after sleep gap (${delta}s)"
    run_commands
  fi

  LAST_LOOP_TS=$now_ts

  ensure_server_running

  schedule_next_wake

  sleep $LOOP_INTERVAL
done