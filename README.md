# 🌿 Farmers Marketplace

A minimal MVP marketplace where farmers list products and buyers pay using the **Stellar Network (XLM)**.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: SQLite (via better-sqlite3)
- Payments: Stellar Testnet (XLM)

## Project Structure

```
FarmersMarketplace/
├── backend/
│   ├── src/
│   │   ├── index.js          # Express app entry
│   │   ├── stellar.js        # Stellar SDK helpers
│   │   ├── middleware/auth.js
│   │   ├── db/schema.js      # SQLite schema + connection
│   │   └── routes/
│   │       ├── auth.js       # register, login
│   │       ├── products.js   # CRUD listings
│   │       ├── orders.js     # place order + pay
│   │       └── wallet.js     # balance, transactions, fund
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── api/client.js     # API wrapper
    │   ├── context/AuthContext.jsx
    │   ├── components/Navbar.jsx
    │   └── pages/
    │       ├── Auth.jsx      # Login + Register
    │       ├── Dashboard.jsx # Farmer: add/view products
    │       ├── Marketplace.jsx # Buyer: browse
    │       ├── ProductDetail.jsx # Buy flow
    │       └── Wallet.jsx    # Balance + transactions
    └── package.json
```

## Quick Start

### 1. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Runs on http://localhost:4000

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on http://localhost:3000

## Payment Flow

1. Register as a **buyer** and a **farmer** (two separate accounts)
2. Go to **Wallet** → click "Fund with Testnet XLM" (uses Stellar Friendbot, free testnet tokens)
3. As a farmer, go to **Dashboard** and list a product priced in XLM
4. As a buyer, browse the **Marketplace**, open a product, set quantity, click **Buy Now**
5. The backend signs and submits a real Stellar transaction on testnet
6. View the transaction hash in **Wallet → Transaction History** or on [stellar.expert](https://stellar.expert/explorer/testnet)

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | — | Register user |
| POST | /api/auth/login | — | Login |
| GET | /api/products | — | Browse all products |
| GET | /api/products/:id | — | Product detail |
| POST | /api/products | farmer | Create listing |
| GET | /api/products/mine/list | farmer | My listings |
| DELETE | /api/products/:id | farmer | Remove listing |
| POST | /api/orders | buyer | Place + pay order |
| GET | /api/orders | buyer | Order history |
| GET | /api/orders/sales | farmer | Incoming sales |
| GET | /api/wallet | auth | Balance |
| GET | /api/wallet/transactions | auth | TX history |
| POST | /api/wallet/fund | auth | Fund via Friendbot (testnet) |

## Soroban Escrow Contract (`contract/`)

The `contract/` directory contains a Soroban smart contract that provides on-chain escrow for marketplace orders.

### Functions

| Function | Description |
|----------|-------------|
| `deposit(order_id, buyer, farmer, amount, timeout_unix)` | Lock funds in escrow |
| `release(order_id)` | Buyer releases funds to farmer |
| `refund(order_id)` | Anyone refunds buyer after timeout |
| `get_escrow(order_id)` | Read-only view of an escrow record |

### Error Codes

| Error | Meaning |
|-------|---------|
| `AlreadyExists` | Duplicate deposit for same order_id |
| `NotFound` | No escrow record for order_id |
| `Unauthorized` | Caller not permitted |
| `NotTimedOut` | Refund called before timeout |
| `AlreadySettled` | Escrow already released or refunded |
| `InvalidParties` | buyer and farmer must be different addresses |

### Build & Test

```bash
cd contract
cargo test --features testutils
cargo build --target wasm32-unknown-unknown --release
```

### Design Notes

- **#468** — Every function that reads/writes an escrow entry calls `extend_ttl(TTL_MIN=100_000, TTL_MAX=200_000)` so entries never expire and lock funds.
- **#469** — `deposit` rejects calls where `buyer == farmer` with `EscrowError::InvalidParties`.
- **#470** — `deposit` panics if `timeout_unix` is not at least 1 hour (`3600 s`) in the future.
- **#471** — `deposit`, `release`, and `refund` each emit a Soroban event so the backend can subscribe to the RPC event stream instead of polling.

## Notes

- Stellar wallets are auto-created on registration
- All payments use **XLM on Stellar Testnet** — no real money involved
- SQLite database file (`market.db`) is created automatically on first run
- To reset: delete `backend/market.db`
