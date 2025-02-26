# Vibe Search (local)

![88735](https://github.com/user-attachments/assets/b511ae6b-1c5e-47d9-8845-dd24f441f0d3)

- for: https://github.com/TheExGenesis/community-archive
- referenced: https://github.com/DefenderOfBasic/twitter-semantic-search.
- follow: [local setup](https://github.com/TheExGenesis/community-archive/blob/main/docs/local-setup.md). 


## Quick Start (Recommended)

```bash
# if no bun
curl -fsSL https://bun.sh/install | bash
# Install dependencies (also installs qdrant binary ~70mb)
bun install
# add .env for community archive supabase
# VITE_PUBLIC_SUPABASE_URL=
# VITE_PUBLIC_SUPABASE_ANON_KEY=
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

### Import History

The system now maintains an import history file (`packages/server/import-history.json`) that tracks:
- Last import date for each username
- Latest tweet date for each username
- Total tweet count imported for each username

This makes subsequent imports much faster as the system can immediately determine which tweets are new without querying the database.

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

### Test embeds

```bash
# Test qdrant
bun run test:qdrant
```

## using local supabase (defaults to public archive)

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
