#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$DIR/verification.log"

echo "=======================================================" >> "$LOG_FILE"
echo "Verification started at $(date -u)" >> "$LOG_FILE"

# 1. Run Backend Pytest Suite with isolated test database
cd "$DIR/backend"
if DATABASE_URL="postgresql+asyncpg://brightloop_user:brightloop_password@localhost:5432/thakurdwara_erp_test" "$DIR/backend/venv/bin/pytest" >> "$LOG_FILE" 2>&1; then
    echo "Backend pytest: PASSED" >> "$LOG_FILE"
else
    echo "Backend pytest: FAILED" >> "$LOG_FILE"
    exit 1
fi

# 2. Run Frontend Build Check
cd "$DIR/frontend"
if npm run build >> "$LOG_FILE" 2>&1; then
    echo "Frontend build: PASSED" >> "$LOG_FILE"
else
    echo "Frontend build: FAILED" >> "$LOG_FILE"
    exit 1
fi

# 3. Check Live HTTP Endpoints
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health || echo "000")
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 || echo "000")

echo "Backend HTTP: $BACKEND_STATUS" >> "$LOG_FILE"
echo "Frontend HTTP: $FRONTEND_STATUS" >> "$LOG_FILE"

if [ "$BACKEND_STATUS" = "200" ] && [ "$FRONTEND_STATUS" = "200" ]; then
    echo "Overall Verification: HEALTHY" >> "$LOG_FILE"
else
    echo "Overall Verification: UNHEALTHY" >> "$LOG_FILE"
fi

echo "Verification completed at $(date -u)" >> "$LOG_FILE"
