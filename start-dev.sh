#!/bin/bash
# Start the local development environment for Video Scavenger Hunt
# For macOS, Linux, and Windows x64 (native setup)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FUNCTIONS_PORT=${1:-7071}

echo ""
echo "🎮 Video Scavenger Hunt - Local Development Setup"
echo "================================================"
echo ""

# Check prerequisites
echo "🔧 Checking dependencies..."

if ! command -v node &> /dev/null; then
    echo "   ✗ Node.js not found. Install from https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node --version)
echo "   ✓ Node.js: $NODE_VERSION"

if ! command -v func &> /dev/null; then
    echo "   ✗ Azure Functions Core Tools not found."
    echo "     Install: npm install -g azure-functions-core-tools@4"
    exit 1
fi
FUNC_VERSION=$(func --version)
echo "   ✓ Azure Functions Core Tools: $FUNC_VERSION"

if ! command -v azurite &> /dev/null; then
    echo "   ✗ Azurite not found."
    echo "     Install: npm install -g azurite"
    exit 1
fi
echo "   ✓ Azurite is installed"

# Kill any existing processes
echo ""
echo "🧹 Cleaning up existing processes..."
pkill -f azurite 2>/dev/null || true
pkill -f "func start" 2>/dev/null || true
sleep 1
echo "   ✓ Cleaned up"

# Start Azurite in background
echo ""
echo "📦 Starting Azurite (Storage Emulator)..."
mkdir -p "$SCRIPT_DIR/.azurite"
azurite --location "$SCRIPT_DIR/.azurite" --blobPort 10000 --queuePort 10001 --tablePort 10002 --silent &
AZURITE_PID=$!
sleep 2

if ps -p $AZURITE_PID > /dev/null 2>&1; then
    echo "   ✓ Azurite started (ports 10000-10002)"
else
    echo "   ✗ Failed to start Azurite"
    exit 1
fi

# Install functions dependencies if needed
if [ ! -d "$SCRIPT_DIR/functions/node_modules" ]; then
    echo ""
    echo "📦 Installing functions dependencies..."
    cd "$SCRIPT_DIR/functions"
    npm install
    echo "   ✓ Dependencies installed"
fi

# Build functions
echo ""
echo "🔨 Building Azure Functions..."
cd "$SCRIPT_DIR/functions"
npm run build
echo "   ✓ Build complete"

# Start Azure Functions in background
echo ""
echo "⚡ Starting Azure Functions on port $FUNCTIONS_PORT..."
func start --port $FUNCTIONS_PORT &
FUNC_PID=$!

# Wait for functions to start
echo -n "   Waiting for functions to initialize"
MAX_RETRIES=30
RETRY=0
READY=false

while [ $RETRY -lt $MAX_RETRIES ] && [ "$READY" = "false" ]; do
    sleep 1
    if curl -s "http://localhost:$FUNCTIONS_PORT/api/me" > /dev/null 2>&1; then
        READY=true
    fi
    echo -n "."
    RETRY=$((RETRY + 1))
done
echo ""

if [ "$READY" = "true" ]; then
    echo "   ✓ Azure Functions started"
else
    echo "   ✗ Azure Functions failed to start"
    kill $AZURITE_PID 2>/dev/null || true
    exit 1
fi

# Seed database
echo ""
echo "🌱 Seeding database..."
curl -s -X POST "http://localhost:$FUNCTIONS_PORT/api/scenarios/seed" > /dev/null
echo "   ✓ Scenarios seeded"
curl -s -X POST "http://localhost:$FUNCTIONS_PORT/api/gamekeepers/seed" > /dev/null
echo "   ✓ Game keeper seeded"

# Install web dependencies if needed
if [ ! -d "$SCRIPT_DIR/web/node_modules" ]; then
    echo ""
    echo "📦 Installing web dependencies..."
    cd "$SCRIPT_DIR/web"
    npm install
    echo "   ✓ Dependencies installed"
fi

# Cleanup function
cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    kill $FUNC_PID 2>/dev/null || true
    kill $AZURITE_PID 2>/dev/null || true
    pkill -f azurite 2>/dev/null || true
    pkill -f "func start" 2>/dev/null || true
    echo "   ✓ All services stopped"
}

trap cleanup EXIT INT TERM

# Start Vite dev server
echo ""
echo "🚀 Starting Vite dev server..."
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Development environment is ready!"
echo ""
echo "  🌐 Web App:     http://localhost:5173"
echo "  ⚡ Functions:   http://localhost:$FUNCTIONS_PORT"
echo "  📦 Azurite:     Ports 10000-10002"
echo ""
echo "  Press Ctrl+C to stop all services"
echo "═══════════════════════════════════════════════════════════════"
echo ""

cd "$SCRIPT_DIR/web"
npm run dev
