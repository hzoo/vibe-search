# Vibe Search (local)

![88735](https://github.com/user-attachments/assets/b511ae6b-1c5e-47d9-8845-dd24f441f0d3)

- for: https://github.com/TheExGenesis/community-archive
- referenced: https://github.com/DefenderOfBasic/twitter-semantic-search.
- follow: [local setup](https://github.com/TheExGenesis/community-archive/blob/main/docs/local-setup.md). 


## Quick Start (Recommended)

This project includes a unified startup script that runs all services in a single terminal.

```bash
# Install dependencies (also installs qdrant binary ~70mb)
bun install

# Start all services in one terminal
bun start
```

The script will:
1. Start the Qdrant vector database
2. Start the API server that talks to Qdrant
3. Start the UI server

Once everything is running, open http://localhost:5173 in your browser.

## Importing Tweets

You can import tweets directly from the UI:

1. Click the import button in the top-right corner of the UI
2. Choose between importing by username or uploading a Twitter/X archive JSON file
3. Follow the prompts to complete the import

### Advanced Import Options

For large archives or when you want to bypass duplicate checking:

```bash
# Normal import (checks for duplicates)
bun run import:qdrant path/to/archive.json

# Force import (skips duplicate checking for faster imports)
bun run import:qdrant path/to/archive.json --force
```

The `--force` flag is useful for:
- Initial imports of large archives
- Re-importing after clearing the database
- When you're sure there are no duplicates

## Manual Setup (Alternative)

If you prefer to run services separately, you can use the following commands:

### Setup Qdrant

This project includes a custom local implementation of Qdrant that automatically downloads and manages the Qdrant binary.

```bash
# also installs qdrant binary (~70mb) and data folder to packages/qdrant-local/bin
bun install

# terminal #1: qdrant binary (uses local implementation)
bun run qdrant

# terminal #2: start server that talks between qdrant and ui
bun run dev:qdrant

# terminal #3: run the UI
bun run ui
```

## Setup Chroma

```bash
# install chroma for embeddings db
pip install chromadb

# or via uv
curl -LsSf https://astral.sh/uv/install.sh | sh
uv python install
# https://docs.trychroma.com/docs/overview/getting-started?lang=typescript
uv tool install chromadb
```

```bash
bun install
# chroma (embeddings server)
bun run chroma

# import embeddings with path to tweet archive
# chroma db folder at packages/server/tweets
bun run import:chroma archives/defenderofbasic-archive.json 

# server to talk to chroma
bun run dev:chroma
# ui
bun run ui

```

### Test embeds

```bash
# Test qdrant
bun run test:qdrant
# Test chroma
bun run test:chroma
```

## local supabase (defaults to public)

```bash
# run supabase (need Docker)
# dashboard: http://localhost:54323
bunx supabase login
bunx supabase start
```

```bash
# add to ui/.env
VITE_LOCAL_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<anon key>
```
