#!/bin/bash
# Apply a SQL file to the Supabase project via the Management API query endpoint.
# Usage: apply-sql.sh <file.sql>
# Token comes from SUPABASE_ACCESS_TOKEN (never committed — see CLAUDE.md §5).
set -e
: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN first (personal access token, sbp_...)}"
REF="${SUPABASE_PROJECT_REF:-bkjqwroclpefwtyxjfkl}"
FILE="$1"
PAY="$LOCALAPPDATA/Temp/sql-payload.json"
python - "$FILE" "$PAY" <<'PYEOF'
import json, sys
sql = open(sys.argv[1], encoding="utf-8").read()
open(sys.argv[2], "w", encoding="utf-8").write(json.dumps({"query": sql}))
PYEOF
curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @"$PAY" | head -c 800