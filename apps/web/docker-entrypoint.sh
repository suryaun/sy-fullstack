#!/bin/sh
set -eu

api_url="${NEXT_PUBLIC_API_URL:-}"
escaped_api_url=$(printf '%s' "$api_url" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\r//g; s/\n/\\n/g')

cat > /app/public/runtime-config.js <<EOF
window.__SEERE_YAANA_RUNTIME_CONFIG__ = { apiUrl: "${escaped_api_url}" };
EOF

exec npm run start