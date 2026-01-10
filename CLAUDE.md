# Jupalyse - AI Assistant Guide

## Project Overview

Jupalyse is a web-based analytics and tracking tool for Jupiter DCAs (Dollar Cost Averaging) on Solana. It helps users monitor, analyze, and download data from their Jupiter recurring and trigger orders for tax reporting and personal record-keeping.

**Key Features:**

- View all Jupiter DCAs for any Solana address
- Display all trades in an interactive, feature-rich table
- Download CSV data suitable for tax preparation
- Optional USD price fetching for comprehensive reporting
- **Privacy-first**: Runs entirely locally, user data never sent to external servers

**Live Site:** https://jupalyse.vercel.app

## Tech Stack

### Frontend

- **React 18.3.1** - Core UI framework
- **React Router 6.27.0** - Client-side routing with data loaders
- **Vite 5.4.8** - Build tool and dev server with fast HMR
- **TypeScript 5.5.3** - Strict type checking enabled
- **Mantine 7.13.3** - Component library with dark mode support
- **Tabler Icons React 3.19.0** - Icon library

### State Management & Data Fetching

- **React Query (TanStack Query) 5.62.0** - Server state management with caching
- **React Query Persist Client** - localStorage persistence for cached queries
- **React Query DevTools** - Development debugging tools

### Blockchain Integration

- **@solana/web3.js 2.0.0-rc.1** - Solana blockchain interaction

### Utilities

- **jdenticon 3.3.0** - Visual identicons for order keys
- **js-big-decimal 2.1.0** - Precise decimal arithmetic for token amounts

### Development & Deployment

- **Vercel** - Serverless API routes and hosting
- **pnpm** - Package manager (required, not npm/yarn)
- **ESLint 9.11.1** - Code linting with React plugins
- **Prettier 3.3.3** - Code formatting

## Project Structure

```
/home/sol/projects/Jupalyse/
├── src/                          # Frontend source code
│   ├── main.tsx                  # React app entry point with routing
│   ├── types.ts                  # Core TypeScript type definitions
│   ├── query-client.ts           # React Query configuration with persistence
│   ├── jupiter-api.ts            # Jupiter API client functions
│   ├── mint-data.ts              # Token metadata fetching
│   ├── token-prices.ts           # USD token price management (243 lines)
│   ├── number-display.ts         # Number formatting utilities
│   └── routes/                   # Page components
│       ├── root.tsx              # Root layout wrapper
│       ├── home.tsx              # Landing page with address input
│       ├── orders.tsx            # Order selection page
│       ├── trades.tsx            # Main trades table view (1,287 lines)
│       ├── trades-csv.ts         # CSV export logic
│       └── fetch-usd-prices.tsx  # USD price fetching action
├── api/                          # Vercel serverless API routes
│   ├── recurring-orders.ts       # Proxy for Jupiter recurring orders API
│   ├── trigger-orders.ts         # Proxy for Jupiter trigger orders API
│   └── token-search.ts           # Token search endpoint
├── public/                       # Static assets
├── dist/                         # Build output directory
├── vite.config.js                # Vite configuration with API proxy
├── tsconfig.json                 # TypeScript strict mode config
├── eslint.config.js              # ESLint flat config
├── postcss.config.cjs            # PostCSS & Mantine styling
├── vercel.json                   # Vercel deployment config
├── package.json                  # Dependencies and scripts
├── README.md                     # User-facing documentation
└── .env.copy                     # Environment variable template
```

## Development Setup

### Prerequisites

- **Node.js** (recent version)
- **pnpm** (REQUIRED - do not use npm or yarn)
- **Jupiter API key** from https://portal.jup.ag/api-keys

### Initial Setup

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Configure environment:**

   ```bash
   cp .env.copy .env
   # Edit .env and set JUPITER_API_KEY
   ```

3. **Run local development (requires 2 terminals):**

   Terminal 1 - API routes:

   ```bash
   pnpm dev:api
   ```

   Terminal 2 - Frontend:

   ```bash
   pnpm dev
   ```

### Available Scripts

| Command         | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `pnpm dev`      | Start Vite dev server with hot module replacement              |
| `pnpm dev:api`  | Start Vercel local development for API routes (localhost:3000) |
| `pnpm build`    | TypeScript compilation + Vite production build                 |
| `pnpm lint`     | Check code with ESLint and Prettier                            |
| `pnpm lint:fix` | **Auto-fix linting and formatting issues**                     |
| `pnpm preview`  | Preview production build locally                               |

## Code Quality Guidelines

### After Making Changes

**ALWAYS run before committing:**

```bash
pnpm lint:fix
```

This auto-fixes:

- ESLint violations
- Prettier formatting issues

### TypeScript

- **Strict mode enabled** - all code must pass strict type checking
- Target: ES2020
- Module: ESNext with bundler resolution
- JSX: react-jsx (automatic React imports)

### Code Style

- Follow existing patterns in the codebase
- ESLint React 18.3 recommended rules
- React Hooks best practices enforced
- Consistent formatting via Prettier

### API Security

- **NEVER expose API keys client-side**
- Use Vercel API routes (`/api/*`) to proxy external API calls
- Jupiter API key stored in `.env` (server-side only)
- Optional Birdeye API key stored in browser localStorage (user-provided)

## Architecture & Data Flow

### Request Flow

1. User enters Solana address on home page ([home.tsx](src/routes/home.tsx))
2. App redirects to `/orders/:address` ([orders.tsx](src/routes/orders.tsx))
3. User selects recurring/trigger orders to analyze
4. App loads `/trades` route ([trades.tsx](src/routes/trades.tsx)) which:
   - Fetches selected orders via API proxies
   - Transforms data into deposits and trades
   - Fetches mint metadata (token names, decimals, logos)
   - Displays interactive table with all transactions

### API Architecture

```
Frontend → Vercel API Routes → Jupiter APIs (with API key)
```

- API routes in `api/` forward requests to Jupiter APIs
- Protects API key from client-side exposure
- Vite dev server proxies `/api` to `localhost:3000` (Vercel dev)

### State Management

- **React Query** caches all Jupiter API responses
- **localStorage** persists React Query cache across sessions
- **React Router loaders** (`useLoaderData`) for initial data
- **React Router actions** (`useFetcher`) for CSV generation and USD price fetching

### Key Implementation Details

**Main Trades Table** ([trades.tsx](src/routes/trades.tsx) - 1,287 lines):

- Interactive table with deposits and trades
- Toggle between different rate calculations
- Optional fee inclusion/exclusion in output amounts
- Copy transaction hashes and mint addresses
- Links to Solana Explorer

**CSV Export** ([trades-csv.ts](src/routes/trades-csv.ts)):

- Converts trades/deposits to CSV format
- Includes USD prices when available
- Tax-professional-friendly format

**Token Price Management** ([token-prices.ts](src/token-prices.ts)):

- Fetches historical prices from Birdeye API
- Optional Birdeye API key in localStorage
- Calculates USD amounts based on trade timestamps

**Visual Identicons**:

- Uses jdenticon to generate unique visual identifiers for order keys
- Helps users distinguish between multiple orders

## Configuration Files

### Vite ([vite.config.js](vite.config.js))

- React plugin for JSX support
- API proxy: `/api` → `http://localhost:3000` (local dev only)

### TypeScript ([tsconfig.json](tsconfig.json))

- Strict mode enabled
- All strict type checking options on
- No unused locals/params allowed

### ESLint ([eslint.config.js](eslint.config.js))

- Flat config format (ESLint 9+)
- React 18.3 recommended rules
- React Hooks rules enforced
- React Refresh for HMR

### PostCSS ([postcss.config.cjs](postcss.config.cjs))

- Mantine preset for component styling
- CSS variables support

### Vercel ([vercel.json](vercel.json))

- Build: `vite build`
- Install: `pnpm install`
- SPA rewrite: all routes → `index.html`

## Important Notes

### Testing

- **No testing framework currently configured**
- No Jest, Vitest, or testing dependencies in package.json

### Package Manager

- **Must use pnpm** (not npm or yarn)
- Vercel deployment configured for pnpm

### Deployment

- **Platform**: Vercel
- **Architecture**: SPA + serverless API routes
- **Environment variables**: Set `JUPITER_API_KEY` in Vercel dashboard

### Privacy & Security

- Runs entirely in user's browser
- No user data sent to external servers (except Jupiter/Birdeye APIs for quotes)
- API keys never exposed client-side

### Git Workflow

- **Main branch**: `main`
- **Current branch**: `jup-token-api` (migration to Jupiter Ultra API)
- Recent work: Migrated to Jupiter Ultra token API with API key authentication

## License

MIT

## Credits

- [Jupiter](https://jup.ag) for all the APIs
- [Solflare](https://github.com/solflare-wallet/utl-api) for token metadata API
