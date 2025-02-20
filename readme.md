# Tweet Search

> For https://github.com/TheExGenesis/community-archive
> Followed [local setup](https://github.com/TheExGenesis/community-archive/blob/main/docs/local-setup.md)

## Setup

```bash
pip install chromadb

# or via uv
curl -LsSf https://astral.sh/uv/install.sh | sh
# install python
uv python install
# https://docs.trychroma.com/docs/overview/getting-started?lang=typescript
uv tool install chromadb
```

```bash
bun install
# chroma (embeddings server)
uv 
bun run chroma
# server to talk to chroma
bun run dev 
# ui
bun run ui

# import embeddings with path to tweet archive
bun run import-tweets.ts tweet-archives/defenderofbasic-archive.json 
```