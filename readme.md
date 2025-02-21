# Vibes Search (local)

> For https://github.com/TheExGenesis/community-archive
> referenced https://github.com/DefenderOfBasic/twitter-semantic-search/
> Followed [local setup](https://github.com/TheExGenesis/community-archive/blob/main/docs/local-setup.md)

## Setup

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
# server to talk to chroma
bun run dev 
# ui
bun run ui

# import embeddings with path to tweet archive
bun run import-tweets tweet-archives/defenderofbasic-archive.json 
```

## local supabase (unncessary)

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