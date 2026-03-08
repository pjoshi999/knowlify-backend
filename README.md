# Course Marketplace Platform - Backend

A production-grade course marketplace backend built with Node.js, TypeScript, and hexagonal architecture.

## Features

- Hexagonal architecture (ports and adapters)
- TypeScript with strict mode
- PostgreSQL with Supabase
- Redis caching
- JWT authentication with bcrypt
- Functional programming approach
- Comprehensive testing setup
- Code quality tools (ESLint, Prettier, Husky)
- **Scalable Video Upload System** - Production-grade video upload with multipart chunking, resumability, rate limiting, and cost optimization

## Tech Stack

- Node.js 20+
- TypeScript 5+
- Express.js
- PostgreSQL (Supabase)
- Redis 7+
- JWT + bcrypt for authentication
- BullMQ for job queues (coming soon)
- AWS S3 for storage (coming soon)
- Stripe for payments (coming soon)
- OpenAI for AI chatbot (coming soon)

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- Redis 7+
- Supabase account

### Installation

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Start Redis
brew services start redis  # macOS
# or
sudo systemctl start redis-server  # Linux

# Run database migrations
pnpm run migrate

# Start development server
pnpm run dev
```

The server will start at `http://localhost:3000`

## API Endpoints

### Authentication

All auth endpoints are prefixed with `/api/auth`

#### Traditional Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user (requires Bearer token)
- `POST /api/auth/reset-password` - Request password reset
- `PUT /api/auth/reset-password` - Complete password reset

#### OAuth Authentication (Supabase)

- `POST /api/auth/oauth/google` - Google OAuth login
- `POST /api/auth/oauth/github` - GitHub OAuth login

### Health Check

- `GET /health` - Server health status

## Project Structure

```
src/
├── domain/          # Business logic, entities, value objects
│   ├── types/       # Domain types and interfaces
│   ├── validation/  # Domain validation logic
│   └── errors/      # Domain error types
├── application/     # Use cases, application services
│   ├── ports/       # Port interfaces (repository, services)
│   └── use-cases/   # Business use cases
├── infrastructure/  # External adapters (DB, cache, APIs)
│   ├── database/    # Database connection and migrations
│   ├── cache/       # Redis cache implementation
│   ├── repositories/# Repository implementations
│   └── auth/        # Auth service implementation
├── api/            # HTTP controllers, routes
│   ├── routes/      # Express routes
│   └── middleware/  # Express middleware
└── shared/         # Shared utilities, config
```

## Available Scripts

- `pnpm dev` - Start development server with hot reload
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm format` - Format code with Prettier
- `pnpm type-check` - Run TypeScript type checking
- `pnpm test` - Run tests
- `pnpm test:unit` - Run unit tests with coverage
- `pnpm migrate` - Run database migrations

## Architecture

The project follows hexagonal architecture principles:

- **Domain Layer**: Pure business logic, no external dependencies
- **Application Layer**: Use cases that orchestrate domain logic
- **Infrastructure Layer**: Adapters for external services (DB, cache, APIs)
- **API Layer**: HTTP interface for the application

## Development

### Code Quality

Pre-commit hooks automatically run:

- ESLint for code linting
- Prettier for code formatting
- TypeScript type checking

### Testing

```bash
# Run all tests
pnpm test

# Run unit tests with coverage
pnpm test:unit

# Run integration tests
pnpm test:integration
```

## Documentation

- [Setup Guide](docs/SETUP.md)
- [Supabase Setup](docs/SUPABASE_SETUP.md)
- [Supabase OAuth Setup](docs/SUPABASE_OAUTH_SETUP.md)
- [Redis Setup](docs/REDIS_SETUP.md)
- [Video Upload API](docs/api/upload-api.md)
- [Infrastructure Requirements](docs/deployment/infrastructure.md)
- [Operations Runbook](docs/operations/runbook.md)

## Video Upload System

The platform includes a production-grade scalable video upload system designed to handle petabyte-scale storage with hundreds of thousands of concurrent instructors.

### Key Features

- **Direct-to-S3 Uploads**: Pre-signed URLs for direct uploads, bypassing application servers
- **Multipart Chunking**: 100MB chunks with resumability for large files (up to 50GB)
- **Global Edge Acceleration**: S3 Transfer Acceleration for optimal upload speeds worldwide
- **Rate Limiting**: Token bucket algorithm with tier-based limits (premium, standard, free)
- **Intelligent Scheduling**: Priority queues with starvation prevention
- **Cost Optimization**:
  - Deduplication using SHA-256 hashes
  - Automatic storage tiering (Standard → Standard-IA → Glacier)
  - Compression for metadata
- **Async Transcoding**: SQS-based job queue with priority levels
- **Comprehensive Monitoring**: Prometheus metrics for uploads, costs, and system health
- **Audit Logging**: 1-year retention for compliance

### Quick Start

1. **Configure environment variables:**

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET_NAME=your-bucket-name
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/account/queue

# Video Upload Configuration
VIDEO_UPLOAD_CHUNK_SIZE=104857600  # 100MB
VIDEO_UPLOAD_SESSION_TTL=86400     # 24 hours
VIDEO_UPLOAD_MAX_CONCURRENT=3
VIDEO_UPLOAD_DAILY_QUOTA_GB=100
VIDEO_UPLOAD_ENABLE_ACCELERATION=true
```

2. **Run database migrations:**

```bash
pnpm run migrate
```

3. **Start the server:**

```bash
pnpm run dev
```

### API Endpoints

- `POST /api/v1/video-uploads/initiate` - Initiate multipart upload
- `POST /api/v1/video-uploads/:sessionId/chunks/:chunkNumber` - Report chunk completion
- `GET /api/v1/video-uploads/:sessionId/progress` - Get upload progress
- `POST /api/v1/video-uploads/:sessionId/refresh-url` - Refresh expired pre-signed URL
- `DELETE /api/v1/video-uploads/:sessionId` - Cancel upload
- `GET /api/v1/video-uploads` - List uploads

### Monitoring

- `GET /metrics` - Prometheus metrics endpoint
- `GET /health` - Health check (database, Redis, S3, SQS)
- `GET /ready` - Kubernetes readiness probe
- `GET /live` - Kubernetes liveness probe

### Background Jobs

Automated jobs run on schedule:

- **Hourly**: Abandoned session cleanup
- **Daily**: Storage tiering, deletion queue processing
- **Monthly**: Backup verification

For more details, see the [Video Upload API documentation](docs/api/upload-api.md).
