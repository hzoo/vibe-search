declare const self: Worker;

import { ChromaClient } from "chromadb";

interface ThreadEmbed {
  id: string;
  text: string;
  metadata: {
    username: string;
    displayName: string;
    created_at: string;
    id: string;
  };
}

interface BatchData {
  batch: ThreadEmbed[];
  collectionName: string;
  embeddings: number[][];
}

self.onmessage = async (event: MessageEvent<BatchData>) => {
  try {
    const { batch, collectionName, embeddings } = event.data;
    
    console.log(`Worker received batch of ${batch.length} items`);
    
    const client = new ChromaClient();
    console.log('Created ChromaClient');
    
    const collection = await client.getOrCreateCollection({
      name: collectionName,
    });
    console.log('Got collection');

    console.log('Starting upsert...');
    await collection.upsert({
      ids: batch.map(t => t.id),
      documents: batch.map(t => t.text),
      metadatas: batch.map(t => t.metadata),
      embeddings,
    });
    console.log('Completed upsert');

    self.postMessage({ 
      success: true, 
      count: batch.length,
      firstId: batch[0].id,
      lastId: batch[batch.length - 1].id,
    });
  } catch (error) {
    console.error('Worker error:', error);
    self.postMessage({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    });
  }
}; 