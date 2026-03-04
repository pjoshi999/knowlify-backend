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

## Progress

### Completed Phases

- ✅ Phase 1: Project Setup (8/8 tasks)
- ✅ Phase 2: Database Setup (7/7 tasks)
- ✅ Phase 3: Redis Setup (7/7 tasks)
- ✅ Phase 4: Development Environment (5/5 tasks)
- ✅ Phase 5: Domain Layer (3/3 tasks)
- ✅ Phase 6: Application Layer (2/2 tasks)
- ✅ Phase 7: Infrastructure Adapters (2/2 tasks)
- ✅ Phase 8: API Layer (4/4 tasks)

### Authentication Phase Complete

The authentication system is fully implemented with:

- User registration with validation
- Login with JWT tokens
- Token-based authentication
- Password reset flow
- Secure password hashing with bcrypt
- Token blacklisting for logout
- **Google OAuth via Supabase**
- **GitHub OAuth via Supabase**

## License

MIT
