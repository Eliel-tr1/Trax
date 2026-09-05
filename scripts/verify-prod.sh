#!/bin/bash
# Verify prod bundle is live and non-empty (past incident: 0-byte bundle)
cd ~/Trax
ASSET=$(curl -s https://trax-crm.pages.dev/ | grep -o 'index-[^"]*\.js' | head -1)
echo "prod serves: $ASSET"
curl -s -o /dev/null -w "bundle: %{http_code} %{size_download} bytes\n" "https://trax-crm.pages.dev/assets/$ASSET"
grep -c "bkjqwroclpefwtyxjfkl" <(curl -s "https://trax-crm.pages.dev/assets/$ASSET") | xargs echo "supabase refs in bundle:"
