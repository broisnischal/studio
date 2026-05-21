# DB Studio

A desktop database studio built with **Tauri**, **Svelte 5**, and **Rust (SQLx)**.

## Tech stack

| Component | Tech |
|-----------|------|
| Frontend | Tauri + Svelte 5 + Tailwind CSS v4 + shadcn-svelte |
| Backend | Rust, Tokio, SQLx (PostgreSQL) |
| DB (current) | PostgreSQL |

## Getting started

```bash
npm install
npm run tauri dev
```

On first launch, use **Connect to PostgreSQL** to add a connection. Saved connections are stored locally (including password) for convenience.

### Connection defaults

- Host: `127.0.0.1`
- Port: `5432`
- Database: `postgres`

## Agent / AI instructions

See **[AGENT.md](./AGENT.md)** for conventions: Tailwind-only styling, shadcn-svelte components, Tauri command patterns, and what not to change.

## Features (current)

- PostgreSQL connect / test / disconnect
- Schema explorer with table list and row counts
- Paginated table data grid with column types
- Dark studio UI (sidebar + data table)

## Planned

| Component | Recommended Tech |
|-----------|------------------|
| AI Integration | Local LLMs or API-based |
| ORM Support | Drizzle / Prisma adapters |
| Query Parser | sqlparser-rs |
| SQL console | Raw query editor |
| More databases | MySQL, SQLite, etc. |