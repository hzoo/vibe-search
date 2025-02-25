#!/usr/bin/env bun
import { QdrantExtended } from "qdrant-local";
import { pipeline } from '@xenova/transformers';

async function testQdrantEmbeddings() {
  console.log("Testing Qdrant embeddings...");
  
  // Initialize the embedding model
  console.log("Loading embedding model...");
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  
  // Generate a test embedding
  console.log("Generating test embedding...");
  const startTime = performance.now();
  const result = await embedder("This is a test tweet");
  const embedding = Array.from(result.data);
  const time = performance.now() - startTime;
  
  console.log(`Generated embedding in ${time.toFixed(0)}ms`);
  console.log(`Embedding length: ${embedding.length}`);
  console.log(`Sample values: ${embedding.slice(0, 5).map(v => v.toFixed(4))}`);
  
  // Test Qdrant connection
  console.log("\nTesting Qdrant connection...");
  const client = new QdrantExtended({ url: "http://127.0.0.1:6333" });
  
  // Get collections
  const collections = await client.getCollections();
  console.log(`Found ${collections.collections.length} collections`);
  
  // Check if test collection exists
  const testCollectionName = "test_embeddings";
  const collectionExists = collections.collections.some(c => c.name === testCollectionName);
  
  // Create or recreate test collection
  if (collectionExists) {
    console.log(`Deleting existing collection: ${testCollectionName}`);
    await client.deleteCollection(testCollectionName);
  }
  
  console.log(`Creating collection: ${testCollectionName}`);
  await client.createCollection(testCollectionName, {
    vectors: {
      size: embedding.length,
      distance: "Cosine",
      on_disk: true, // Store vectors directly on disk
    },
    optimizers_config: {
      indexing_threshold: 0, // Disable indexing during upload
    },
    shard_number: 2, // Use multiple shards for parallel uploads
  });
  
  // Insert test point
  console.log("Inserting test point...");
  try {
    await client.upsert(testCollectionName, {
      points: [
        {
          id: 1, // Changed from string "test1" to numeric ID
          vector: embedding,
          payload: {
            text: "This is a test tweet",
            username: "testuser",
            created_at: new Date().toISOString(),
          },
        },
      ],
      wait: true,
    });
    console.log("Point inserted successfully");
  } catch (error: unknown) {
    console.error("Error inserting point:", error);
    // Log more details about the error
    if (error && typeof error === 'object' && 'data' in error) {
      console.error("Error details:", JSON.stringify((error as { data: unknown }).data, null, 2));
    }
    throw error;
  }
  
  // Re-enable indexing after upload
  console.log("Re-enabling indexing...");
  await client.updateCollection(testCollectionName, {
    optimizers_config: {
      indexing_threshold: 20000, // Default value
    },
  });
  
  // Search for similar points
  console.log("Searching for similar points...");
  const searchResults = await client.search(testCollectionName, {
    vector: embedding,
    limit: 1,
  });
  
  console.log("Search results:", searchResults);
  
  // Clean up
  console.log("Cleaning up...");
  await client.deleteCollection(testCollectionName);
  
  console.log("Test completed successfully!");
}

testQdrantEmbeddings().catch(console.error); 