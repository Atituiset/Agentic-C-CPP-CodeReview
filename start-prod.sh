#!/bin/bash
# One-click startup script for OpenCode platform deployment/production environment

# Color formatting
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}==================================================${NC}"
echo -e "${GREEN}     OpenCode Platform - Deployment/Prod Mode     ${NC}"
echo -e "${BLUE}==================================================${NC}"

# Check if Docker daemon is running
DOCKER_RUNNING=false
if docker info >/dev/null 2>&1; then
    DOCKER_RUNNING=true
fi

if [ "$DOCKER_RUNNING" = true ]; then
    echo -e "${GREEN}Docker daemon detected. Starting via containerization (Docker Compose)...${NC}"
    echo -e "${YELLOW}Building and starting containers...${NC}"
    docker compose up --build -d
    
    # Start the worker agent locally as well
    echo -e "${YELLOW}Starting local Worker Agent daemon...${NC}"
    mkdir -p logs
    fuser -k 8765/tcp 2>/dev/null || true
    python3 ~/.opencode-agent/agent.py > logs/agent-prod.log 2>&1 &
    AGENT_PID=$!
    sleep 2
    
    echo -e "${BLUE}==================================================${NC}"
    echo -e "${GREEN}🚀 Services successfully started in Docker!${NC}"
    echo -e "${BLUE}--------------------------------------------------${NC}"
    echo -e "Dashboard Link:  ${GREEN}http://localhost:8000${NC} (Served by Uvicorn)"
    echo -e "Backend API:     ${GREEN}http://localhost:8000/docs${NC}"
    echo -e "Worker Agent:    ${GREEN}http://localhost:8765/health${NC}"
    echo -e "${BLUE}==================================================${NC}"
else
    echo -e "${YELLOW}Docker is not running or available. Running local Production build...${NC}"
    
    # 1. Port cleanup
    echo -e "${YELLOW}[1/4] Freeing ports (3000, 8765)...${NC}"
    fuser -k 3000/tcp 2>/dev/null || true
    fuser -k 8765/tcp 2>/dev/null || true

    # 2. Redis Check
    echo -e "${YELLOW}[2/4] Checking Redis...${NC}"
    if ! redis-cli ping &>/dev/null; then
        if which redis-server &>/dev/null; then
            redis-server --daemonize yes
            sleep 1
        else
            echo -e "${RED}Redis is not running and redis-server binary not found. Please start Redis.${NC}"
            exit 1
        fi
    fi

    # 3. Build frontend static files
    echo -e "${YELLOW}[3/4] Building Frontend static files (dist)...${NC}"
    cd frontend
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing frontend dependencies first...${NC}"
        npm ci
    fi
    npm run build
    cd ..

    # 4. Start Production Backend
    # Production backend automatically mounts and serves the static files in frontend/dist
    echo -e "${YELLOW}[4/4] Starting production Backend on Port 3000...${NC}"
    mkdir -p logs
    uv run --project backend uvicorn backend.main:app --port 3000 --host 0.0.0.0 > logs/backend-prod.log 2>&1 &
    BACKEND_PID=$!
    sleep 2

    # 5. Start Worker Agent
    echo -e "${YELLOW}[*] Starting Worker Agent daemon on Port 8765...${NC}"
    python3 ~/.opencode-agent/agent.py > logs/agent-prod.log 2>&1 &
    AGENT_PID=$!
    sleep 2

    echo -e "${BLUE}==================================================${NC}"
    echo -e "${GREEN}🚀 Services successfully started in Local Production Mode!${NC}"
    echo -e "${BLUE}--------------------------------------------------${NC}"
    echo -e "Dashboard Link:  ${GREEN}http://localhost:3000${NC} (Served by Uvicorn)"
    echo -e "Backend API:     ${GREEN}http://localhost:3000/docs${NC}"
    echo -e "Worker Agent:    ${GREEN}http://localhost:8765/health${NC}"
    echo -e "${BLUE}==================================================${NC}"
    echo -e "${YELLOW}To stop production services: kill -9 $BACKEND_PID $AGENT_PID${NC}"
fi
