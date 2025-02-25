# Qdrant-Local

A local implementation of Qdrant vector database with automatic binary download and management.

## Features

- Extends the official `@qdrant/js-client-rest` client
- Automatically downloads and manages the Qdrant binary for your platform
- Provides a simple API to start a local Qdrant instance
- Compatible with the latest Qdrant version (1.13.0)

## Usage

```javascript
import { QdrantExtended } from "qdrant-local";

// Start a local Qdrant instance
const client = new QdrantExtended(":local:");

// Or connect to an existing Qdrant instance
const client = new QdrantExtended({ url: "http://localhost:6333" });

// Use the client just like the regular Qdrant client
await client.createCollection("my_collection", {
  vectors: {
    size: 384,
    distance: "Cosine",
  },
});
```

## Configuration

You can configure the local Qdrant instance by passing a configuration object to the `runQdrant` function:

```javascript
import { runQdrant } from "qdrant-local";

const port = runQdrant({
  httpPort: 6333, // Specify a port (0 for random)
  enableStaticContent: true, // Enable static content serving
  dataPath: "/path/to/data", // Specify a data directory
});

console.log(`Qdrant is running on port ${port}`);
```

## API

### `QdrantExtended`

Extends the official `QdrantClient` with local support.

```typescript
constructor(opt: string | { url: string } | { host: string; port: number } | QdrantConfig);
```

### `runQdrant`

Starts a local Qdrant instance.

```typescript
function runQdrant(config?: QdrantConfig): number;
```

### `QdrantConfig`

Configuration options for the local Qdrant instance.

```typescript
interface QdrantConfig {
  httpPort?: number; // HTTP port (0 for random)
  enableStaticContent?: boolean; // Enable static content serving
  dataPath?: string; // Data directory path
}
``` 