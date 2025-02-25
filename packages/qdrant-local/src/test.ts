#!/usr/bin/env bun
import { QdrantExtended, runQdrant } from "./index.js";

async function main() {
  console.log("Testing Qdrant-Local TypeScript implementation");
  
  // Start a local Qdrant instance
  const port = await runQdrant({
    httpPort: 0, // Use a random port
    enableStaticContent: true,
    dataPath: "./test-data",
  });
  
  console.log(`Qdrant is running on port ${port}`);
  
  // Create a client
  const client = new QdrantExtended({ url: `http://localhost:${port}` });
  
  // Test the client
  try {
    // Get collections
    const collections = await client.getCollections();
    console.log(`Found ${collections.collections.length} collections`);
    
    // Create a test collection
    const testCollectionName = "test_collection";
    
    // Check if collection exists
    const collectionExists = collections.collections.some(c => c.name === testCollectionName);
    
    // Delete if exists
    if (collectionExists) {
      console.log(`Deleting existing collection: ${testCollectionName}`);
      await client.deleteCollection(testCollectionName);
    }
    
    // Create collection
    console.log(`Creating collection: ${testCollectionName}`);
    await client.createCollection(testCollectionName, {
      vectors: {
        size: 4,
        distance: "Cosine",
      },
    });
    
    // Insert test points
    console.log("Inserting test points");
    await client.upsert(testCollectionName, {
      wait: true,
      points: [
        {
          id: 1,
          vector: [0.1, 0.2, 0.3, 0.4],
          payload: {
            text: "Test point 1",
          },
        },
        {
          id: 2,
          vector: [0.2, 0.3, 0.4, 0.5],
          payload: {
            text: "Test point 2",
          },
        },
      ],
    });
    
    // Search
    console.log("Searching for similar points");
    const results = await client.search(testCollectionName, {
      vector: [0.1, 0.2, 0.3, 0.4],
      limit: 2,
    });
    
    console.log("Search results:", results);
    
    // Clean up
    console.log("Cleaning up");
    await client.deleteCollection(testCollectionName);
    
    console.log("Test completed successfully!");
  } catch (error) {
    console.error("Test failed:", error);
  }
}

main().catch(console.error); 