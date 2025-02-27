# Vibe Search (local)

![88735](https://github.com/user-attachments/assets/b511ae6b-1c5e-47d9-8845-dd24f441f0d3)

- for: https://github.com/TheExGenesis/community-archive
- ref: https://github.com/DefenderOfBasic/twitter-semantic-search

## Quick Start

```bash
# install Bun
curl -fsSL https://bun.sh/install | bash
# install dependencies, qdrant binary is ~70mb
bun install
# add .env for community archive supabase
# VITE_PUBLIC_SUPABASE_URL=
# VITE_PUBLIC_SUPABASE_ANON_KEY=
# start all services in one terminal
bun start
```

The script will:
1. Start the Qdrant vector database
2. Start the API server that talks to Qdrant
3. Start the UI server

Once everything is running, open http://localhost:5173 in your browser

## Importing Your Own Archive

You can import your own Twitter archive by following these steps:

1. Download your Twitter archive:
   - Go to https://x.com/settings/download_your_data
   - Request your archive and wait for the email (can take a few days)
   - Download the `zip` file from the email link

2. Import the archive using the UI:
     - Click the import button in the top-right corner of the UI (or press `⌘ + I`)
     - Select "Upload File" tab
     - Drag and drop your Twitter archive ZIP file or click to select it
     - Optionally provide a custom username for your archive
     - Click "Import"

## Importing Tweets

You can import tweets directly from the UI:

1. Click the import button in the top-right corner of the UI (or press `⌘ + I`)
2. Choose between importing by username or uploading a Twitter/X archive JSON file

### Import History

The system now maintains an import history file (`packages/server/import-history.json`) that tracks:
- Last import date for each username
- Latest tweet date for each username
- Total tweet count imported for each username

This makes subsequent imports much faster by skipping over processed tweets

---

### Manual Setup (Alternative)

If you prefer to run services separately, you can use the following commands:

```bash
# qdrant binary (~70mb) + data folder is in packages/qdrant-local/bin
bun install
# terminal #1: run qdrant
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

### using local supabase (defaults to public archive)

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
