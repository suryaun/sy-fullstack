#!/bin/sh
set -eu

api_url="${NEXT_PUBLIC_API_URL:-}"
release_version="${RELEASE_VERSION:-}"
escaped_api_url=$(printf '%s' "$api_url" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\r//g; s/\n/\\n/g')
escaped_release_version=$(printf '%s' "$release_version" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\r//g; s/\n/\\n/g')

cat > /app/public/runtime-config.js <<EOF
window.__SEERE_YAANA_RUNTIME_CONFIG__ = { apiUrl: "${escaped_api_url}", releaseVersion: "${escaped_release_version}" };
EOF

exec npm run start