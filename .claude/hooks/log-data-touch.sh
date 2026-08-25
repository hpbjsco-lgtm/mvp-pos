#!/bin/bash
# Appends a line to .claude/data-touch.log whenever a Bash/Edit/Write tool call
# looks like it touched the app's data (SQLite db files or src/db/**).
input=$(cat)
tool=$(echo "$input" | jq -r '.tool_name // empty')
cmd=$(echo "$input" | jq -r '.tool_input.command // empty')
file=$(echo "$input" | jq -r '.tool_input.file_path // empty')

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log="$script_dir/../data-touch.log"

is_data_touch=false
reason=""

if [ "$tool" = "Bash" ] && [ -n "$cmd" ]; then
  if echo "$cmd" | grep -qiE 'sqlite|\.db\b|\.sqlite\b|drop[[:space:]]+table|delete[[:space:]]+from|update[[:space:]].*[[:space:]]set|insert[[:space:]]+into|migrate'; then
    is_data_touch=true
    reason="bash-data-keyword"
  fi
fi

if { [ "$tool" = "Edit" ] || [ "$tool" = "Write" ]; } && [ -n "$file" ]; then
  if echo "$file" | grep -qE '(^|/)src/db/|\.db$|\.sqlite$'; then
    is_data_touch=true
    reason="data-file-edit"
  fi
fi

if [ "$is_data_touch" = true ]; then
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  detail="${cmd:-$file}"
  detail=$(echo "$detail" | tr '\n' ' ' | cut -c1-300)
  echo "[$ts] tool=$tool reason=$reason detail=\"$detail\"" >> "$log"
fi

exit 0
