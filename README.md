# Flaxh Trade API

A robust NestJS-based REST API for Solana blockchain trading operations. This API provides comprehensive user management, wallet integration, and trading functionality on the Solana network.

## 🚀 Features

- **User Management**: Complete user registration, authentication, and profile management
- **JWT Authentication**: Secure authentication with JWT tokens and refresh functionality
- **Solana Integration**: Native Solana blockchain integration for wallet operations
- **Wallet Management**: Create, manage, and track Solana wallets
- **Transaction History**: Track and retrieve transaction history
- **Token Balance Tracking**: Real-time token balance monitoring
- **Database Integration**: PostgreSQL with TypeORM for data persistence
- **Comprehensive Logging**: Winston-based logging system
- **Security**: BCrypt password hashing, JWT guards, and validation
- **API Versioning**: Versioned API endpoints for backwards compatibility

## 🛠 Tech Stack

- **Framework**: NestJS
- **Database**: PostgreSQL with TypeORM
- **Blockchain**: Solana Web3.js & SPL Token
- **Authentication**: JWT with Passport
- **Validation**: Class Validator & Joi
- **Logging**: Winston
- **Package Manager**: pnpm
- **Language**: TypeScript

## 📋 Prerequisites

- Node.js (v18 or higher)
- PostgreSQL
- pnpm
- Solana CLI (optional, for development)

## 🔧 Installation

1. **Clone the repository**

    ```bash
    git clone <repository-url>
    cd flaxh-trade-api
    ```

2. **Install dependencies**

    ```bash
    pnpm install
    ```

3. **Environment Setup**
   Create a `.env` file in the root directory:

    ```bash
    # Server Configuration
    PORT=3000
    NODE_ENV=development
    API_PREFIX=api
    API_VERSION=v1

    # Database Configuration
    DATABASE_HOST=localhost
    DATABASE_PORT=5432
    DATABASE_USERNAME=postgres
    DATABASE_PASSWORD=your_password
    DATABASE_NAME=flaxh_trade

    # JWT Configuration
    JWT_SECRET=your-super-secret-jwt-key
    JWT_EXPIRES_IN=7d

    # Solana Configuration
    SOLANA_NETWORK=devnet
    SOLANA_PROGRAM_ID=your_program_id

    # CORS Configuration
    CORS_ORIGIN=http://localhost:3000

    # Logging Configuration
    LOG_LEVEL=info
    LOG_FORMAT=json
    ```

4. **Database Setup**

    ```bash
    # Create database
    createdb flaxh_trade

    # Run migrations (if any)
    pnpm run migration:run
    ```

## 🚀 Running the Application

```bash
# Development mode
pnpm run start:dev

# Production mode
pnpm run start:prod

# Debug mode
pnpm run start:debug
```

The API will be available at `http://localhost:3000`

## 📚 API Documentation

### Base URL

```
http://localhost:3000/api/v1
```

### Authentication Endpoints

| Method | Endpoint         | Description                   |
| ------ | ---------------- | ----------------------------- |
| POST   | `/auth/register` | Register a new user           |
| POST   | `/auth/login`    | User login                    |
| GET    | `/auth/profile`  | Get user profile (protected)  |
| POST   | `/auth/refresh`  | Refresh JWT token (protected) |

### User Management Endpoints

| Method | Endpoint                       | Description               |
| ------ | ------------------------------ | ------------------------- |
| POST   | `/users`                       | Create a new user         |
| GET    | `/users`                       | Get all users (paginated) |
| GET    | `/users/:id`                   | Get user by ID            |
| PUT    | `/users/:id`                   | Update user               |
| DELETE | `/users/:id`                   | Delete user               |
| POST   | `/users/verify-email/:token`   | Verify email address      |
| POST   | `/users/forgot-password`       | Request password reset    |
| POST   | `/users/reset-password/:token` | Reset password            |

### Wallet Management Endpoints

| Method | Endpoint                                  | Description             |
| ------ | ----------------------------------------- | ----------------------- |
| POST   | `/wallets/user/:userId`                   | Create wallet for user  |
| GET    | `/wallets/user/:userId`                   | Get user's wallets      |
| GET    | `/wallets/:id`                            | Get wallet by ID        |
| GET    | `/wallets/address/:address`               | Get wallet by address   |
| PUT    | `/wallets/:id`                            | Update wallet           |
| DELETE | `/wallets/:id`                            | Delete wallet           |
| POST   | `/wallets/:id/update-balance`             | Update wallet balance   |
| GET    | `/wallets/:id/token-balance/:mintAddress` | Get token balance       |
| GET    | `/wallets/:id/transactions`               | Get transaction history |
| POST   | `/wallets/:id/verify`                     | Verify wallet           |
| POST   | `/wallets/:id/activate`                   | Activate wallet         |
| POST   | `/wallets/:id/deactivate`                 | Deactivate wallet       |

### Example Requests

#### Register User

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

#### Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123"
  }'
```

#### Create Wallet (requires authentication)

```bash
curl -X POST http://localhost:3000/api/v1/wallets/user/USER_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "My Trading Wallet",
    "publicKey": "SOLANA_PUBLIC_KEY"
  }'
```

## 🧪 Testing

```bash
# Unit tests
pnpm run test

# E2E tests
pnpm run test:e2e

# Test coverage
pnpm run test:cov

# Watch mode
pnpm run test:watch
```

## 🏗 Project Structure

```
src/
├── app.module.ts              # Main application module
├── main.ts                    # Application entry point
├── audit/                     # Audit logging functionality
├── common/                    # Shared utilities and components
│   ├── decorators/           # Custom decorators
│   ├── exceptions/           # Custom exceptions
│   ├── filters/              # Exception filters
│   ├── guards/               # Route guards
│   ├── interceptors/         # Request/response interceptors
│   ├── logger/               # Logging service
│   ├── middleware/           # Custom middleware
│   ├── pipes/                # Validation pipes
│   └── utils/                # Utility functions
├── config/                    # Configuration files
├── database/                  # Database configuration and migrations
├── infra/                     # Infrastructure services
│   └── solana/               # Solana blockchain integration
└── modules/                   # Feature modules
    ├── auth/                 # Authentication module
    ├── users/                # User management module
    ├── wallets/              # Wallet management module
    └── transactions/         # Transaction handling module
```

## 🔒 Security Features

- **Password Hashing**: BCrypt for secure password storage
- **JWT Authentication**: Stateless authentication with refresh tokens
- **Input Validation**: Comprehensive validation using Class Validator
- **CORS Protection**: Configurable CORS settings
- **Rate Limiting**: Built-in protection against abuse
- **Environment Variables**: Secure configuration management

## 🌐 Solana Integration

The API integrates with the Solana blockchain to provide:

- Wallet creation and management
- Token balance tracking
- Transaction history retrieval
- SPL token support
- Network flexibility (devnet/mainnet)

## 📝 Development

### Code Style

```bash
# Format code
pnpm run format

# Lint code
pnpm run lint
```

### Database Migrations

```bash
# Generate migration
pnpm run migration:generate -- --name=MigrationName

# Run migrations
pnpm run migration:run

# Revert migration
pnpm run migration:revert
```

## 🚀 Deployment

### Environment Variables for Production

Ensure all environment variables are properly set for production:

- Set `NODE_ENV=production`
- Use strong `JWT_SECRET`
- Configure production database credentials
- Configure proper CORS origins

### Build for Production

```bash
pnpm run build
pnpm run start:prod
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the UNLICENSED License.

## 🔗 Related Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [Solana Web3.js Documentation](https://solana-labs.github.io/solana-web3.js/)
- [TypeORM Documentation](https://typeorm.io/)
- [Solana Developer Documentation](https://docs.solana.com/)

## 📞 Support

For support and questions, please open an issue in the repository.
