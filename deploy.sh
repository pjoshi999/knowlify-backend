#!/bin/bash

# Deployment script for Knowlify Backend
# Usage: ./deploy.sh

set -e  # Exit on error

echo "🚀 Starting Knowlify Backend Deployment..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Stop existing processes
echo "⏹️  Stopping existing PM2 processes..."
pm2 delete all 2>/dev/null || echo "No existing processes to stop"
echo ""

# Step 2: Check Node version
echo "🔍 Checking Node.js version..."
NODE_VERSION=$(node --version)
echo "Node version: $NODE_VERSION"
if [[ ! "$NODE_VERSION" =~ ^v(18|20|22) ]]; then
    echo -e "${YELLOW}⚠️  Warning: Node.js 18+ recommended. Current: $NODE_VERSION${NC}"
fi
echo ""

# Step 3: Install dependencies
echo "📦 Installing dependencies..."
if command -v pnpm &> /dev/null; then
    echo "Using pnpm..."
    pnpm install --frozen-lockfile
elif command -v npm &> /dev/null; then
    echo "Using npm..."
    npm install
else
    echo -e "${RED}❌ Error: No package manager found (npm or pnpm required)${NC}"
    exit 1
fi
echo ""

# Step 4: Build application
echo "🔨 Building application..."
if command -v pnpm &> /dev/null; then
    pnpm run build
else
    npm run build
fi

# Verify build output
if [ ! -f "./dist/index.js" ]; then
    echo -e "${RED}❌ Error: Build failed - dist/index.js not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Build successful${NC}"
echo ""

# Step 5: Create logs directory
echo "📁 Creating logs directory..."
mkdir -p logs
echo ""

# Step 6: Check environment variables
echo "🔍 Checking environment variables..."
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    exit 1
fi

# Check critical env vars
REQUIRED_VARS=("DATABASE_URL" "JWT_SECRET" "AWS_REGION")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^${var}=" .env; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Warning: Missing environment variables: ${MISSING_VARS[*]}${NC}"
else
    echo -e "${GREEN}✅ Environment variables OK${NC}"
fi
echo ""

# Step 7: Run database migrations (optional)
echo "🗄️  Running database migrations..."
if command -v pnpm &> /dev/null; then
    pnpm run migrate || echo -e "${YELLOW}⚠️  Migrations failed (non-fatal)${NC}"
else
    npm run migrate || echo -e "${YELLOW}⚠️  Migrations failed (non-fatal)${NC}"
fi
echo ""

# Step 8: Start application
echo "▶️  Starting application with PM2..."
pm2 start ecosystem.simple.cjs

# Wait a bit for startup
sleep 3
echo ""

# Step 9: Check status
echo "📊 Checking application status..."
pm2 status
echo ""

# Step 10: Test health endpoint
echo "🏥 Testing health endpoint..."
sleep 2
if curl -f http://localhost:8080/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Health check passed${NC}"
else
    echo -e "${YELLOW}⚠️  Health check failed - check logs with: pm2 logs${NC}"
fi
echo ""

# Step 11: Save PM2 configuration
echo "💾 Saving PM2 configuration..."
pm2 save
echo ""

# Step 12: Setup PM2 startup (optional)
echo "🔄 Setting up PM2 startup script..."
pm2 startup || echo -e "${YELLOW}⚠️  Run the command above to enable PM2 on system startup${NC}"
echo ""

# Final summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Useful commands:"
echo "  • View logs:        pm2 logs knowlify-api"
echo "  • Monitor:          pm2 monit"
echo "  • Restart:          pm2 restart knowlify-api"
echo "  • Stop:             pm2 stop knowlify-api"
echo "  • Status:           pm2 status"
echo ""
echo "🌐 Application URLs:"
echo "  • API:              http://localhost:8080"
echo "  • Health:           http://localhost:8080/health"
echo "  • Metrics:          http://localhost:8080/metrics"
echo "  • Bull Board:       http://localhost:8080/admin/queues"
echo ""
echo "📚 Documentation:"
echo "  • Deployment Fix:   cat DEPLOYMENT_FIX.md"
echo "  • Production Guide: cat PRODUCTION_DEPLOYMENT.md"
echo ""
