#!/bin/bash
# One-click startup script for OpenCode platform development environment

# Color formatting
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}==================================================${NC}"
echo -e "${GREEN}      OpenCode Platform - Development Mode        ${NC}"
echo -e "${BLUE}==================================================${NC}"

# 1. Clean up ports 3000, 5173, 8765 to prevent port conflicts
echo -e "${YELLOW}[1/4] Cleaning up existing ports (3000, 5173, 8765)...${NC}"
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true
fuser -k 8765/tcp 2>/dev/null || true

# 2. Check & Start Redis
echo -e "${YELLOW}[2/4] Verifying Redis connection...${NC}"
if redis-cli ping &>/dev/null; then
    echo -e "${GREEN}Redis is already running!${NC}"
else
    echo -e "${YELLOW}Redis is not running. Attempting to start locally...${NC}"
    if which redis-server &>/dev/null; then
        redis-server --daemonize yes
        sleep 1
        if redis-cli ping &>/dev/null; then
            echo -e "${GREEN}Redis started successfully in background!${NC}"
        else
            echo -e "${RED}Failed to start local Redis server. Please start it manually.${NC}"
            exit 1
        fi
    else
        echo -e "${RED}redis-server not found. Please start Redis or run 'docker compose up -d redis'.${NC}"
        exit 1
    fi
fi

# 3. Start Backend
echo -e "${YELLOW}[3/4] Starting Backend (FastAPI on Port 3000)...${NC}"
LOG_DIR="logs"
mkdir -p "$LOG_DIR"
uv run --project backend uvicorn backend.main:app --reload --port 3000 > "$LOG_DIR/backend-dev.log" 2>&1 &
BACKEND_PID=$!
sleep 2

if ps -p $BACKEND_PID > /dev/null; then
    echo -e "${GREEN}Backend started! (PID: $BACKEND_PID, logs: $LOG_DIR/backend-dev.log)${NC}"
else
    echo -e "${RED}Backend failed to start. Check $LOG_DIR/backend-dev.log for details.${NC}"
    exit 1
fi

# 4. Start Worker Agent
echo -e "${YELLOW}[4/4] Starting Worker Agent (Port 8765)...${NC}"
python3 ~/.opencode-agent/agent.py > "$LOG_DIR/agent-dev.log" 2>&1 &
AGENT_PID=$!
sleep 2

if ps -p $AGENT_PID > /dev/null; then
    echo -e "${GREEN}Worker Agent started! (PID: $AGENT_PID, logs: $LOG_DIR/agent-dev.log)${NC}"
else
    echo -e "${RED}Worker Agent failed to start. Check $LOG_DIR/agent-dev.log for details.${NC}"
fi

# 5. Start Frontend
echo -e "${YELLOW}[*] Starting Frontend Dev Server (Vite on Port 5173)...${NC}"
cd frontend
npm run dev > "../$LOG_DIR/frontend-dev.log" 2>&1 &
FRONTEND_PID=$!
cd ..
sleep 2

if ps -p $FRONTEND_PID > /dev/null; then
    echo -e "${GREEN}Frontend started! (PID: $FRONTEND_PID, logs: $LOG_DIR/frontend-dev.log)${NC}"
else
    echo -e "${RED}Frontend failed to start. Check $LOG_DIR/frontend-dev.log for details.${NC}"
fi

echo -e "${BLUE}==================================================${NC}"
echo -e "${GREEN}🚀 All services successfully started in Dev Mode!${NC}"
echo -e "${BLUE}--------------------------------------------------${NC}"
echo -e "Dashboard Link:  ${GREEN}http://localhost:5173${NC}"
echo -e "Backend API:     ${GREEN}http://localhost:3000/docs${NC}"
echo -e "Worker Agent:    ${GREEN}http://localhost:8765/health${NC}"
echo -e "Redis Port:      ${GREEN}6379${NC}"
echo -e "${BLUE}==================================================${NC}"
echo -e "${YELLOW}To stop all dev services, you can run: kill -9 $BACKEND_PID $FRONTEND_PID $AGENT_PID${NC}"
