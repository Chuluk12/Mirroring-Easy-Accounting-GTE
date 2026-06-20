#!/bin/bash
set -e

DESTINATION="$(cd "$(dirname "$0")" && pwd)"

# Get local IP
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP=$(ip -4 route get 8.8.8.8 2>/dev/null | awk '{print $7}' | head -n 1)
fi
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP="localhost"
fi

cat <<EOF > "$DESTINATION/backend/.env"
EASY_DB_HOST=127.0.0.1
EASY_DB_PORT=3999
EASY_DB_PATH=D:/EASY/AQPA.EASY6
EASY_DB_USER=SYSDBA
EASY_DB_PASSWORD=NewPassword123
EASY_BACKEND_PORT=5001
EOF

cat <<EOF > "$DESTINATION/frontend/.env"
VITE_API_BASE_URL=http://$LOCAL_IP:5001
VITE_API_PORT=5001
VITE_DEV_PORT=5175
VITE_PREVIEW_PORT=4175
EOF

echo "Selesai setup AQPA di: $DESTINATION"
echo "Backend AQPA : http://0.0.0.0:5001"
echo "Frontend AQPA: http://0.0.0.0:5175"
