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
  const testCollectionName = "tweets";
  const collectionExists = collections.collections.some(c => c.name === testCollectionName);
  
  // del
  if (collectionExists) {
    console.log(`Deleting collection: ${testCollectionName}`);
    await client.deleteCollection(testCollectionName);
  }
}

testQdrantEmbeddings().catch(console.error);