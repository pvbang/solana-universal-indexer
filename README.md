# 🔍 Solana Universal Indexer

A universal Solana blockchain indexer with dynamic schema support and REST API. Built for the [Superteam Ukraine bounty](https://superteam.fun/earn/listing/build-universal-solana-indexer-with-dynamic-schema-api).

## Features

- **Dynamic Schema**: Define custom schemas for any Solana program without redeployment
- **Real-time Indexing**: Subscribe to Solana transactions via WebSocket and index in real-time
- **REST API**: Query indexed data with filtering, pagination, and aggregation
- **Multi-program Support**: Index multiple Solana programs simultaneously
- **TypeScript**: Fully typed with comprehensive type definitions

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  Solana RPC/WS  │────▶│   Indexer    │────▶│  PostgreSQL  │
│  (Helius/etc)   │     │   Engine     │     │  + pgvector  │
└─────────────────┘     └──────────────┘     └─────────────┘
                              │                      │
                              ▼                      ▼
                        ┌──────────────┐     ┌─────────────┐
                        │ Schema Mgr   │     │  REST API   │
                        │ (Dynamic)    │     │  (Express)  │
                        └──────────────┘     └─────────────┘
```

## Tech Stack

- **Runtime**: Node.js 20+ / TypeScript 5.x
- **Blockchain**: @solana/web3.js, Helius SDK
- **Database**: PostgreSQL 15+ with dynamic schema migration
- **API**: Express.js with OpenAPI/Swagger docs
- **Queue**: BullMQ (Redis) for reliable transaction processing
- **Monitoring**: Prometheus metrics + health checks

## Quick Start

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your Solana RPC URL and database credentials

# Run database migrations
pnpm db:migrate

# Start the indexer
pnpm dev
```

## API Endpoints

### Schema Management
- `POST /api/schemas` - Create a new indexing schema
- `GET /api/schemas` - List all schemas
- `GET /api/schemas/:id` - Get schema details
- `PUT /api/schemas/:id` - Update schema
- `DELETE /api/schemas/:id` - Delete schema

### Data Querying
- `GET /api/data/:schema` - Query indexed data with filters
- `GET /api/data/:schema/:id` - Get specific record
- `GET /api/data/:schema/aggregate` - Aggregation queries

### Indexer Control
- `POST /api/indexer/start` - Start indexing for a schema
- `POST /api/indexer/stop` - Stop indexing
- `GET /api/indexer/status` - Get indexer status

### System
- `GET /health` - Health check
- `GET /metrics` - Prometheus metrics

## Schema Definition Example

```json
{
  "name": "token-transfers",
  "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "instructions": ["transfer", "transferChecked"],
  "fields": [
    { "name": "source", "type": "publicKey", "indexed": true },
    { "name": "destination", "type": "publicKey", "indexed": true },
    { "name": "amount", "type": "u64", "indexed": false },
    { "name": "mint", "type": "publicKey", "indexed": true }
  ]
}
```

## License

MIT
