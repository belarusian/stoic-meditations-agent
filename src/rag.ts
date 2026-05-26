import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { DefaultEmbeddingFunction } from 'chromadb';

// Get the directory of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to meditations (in repo root)
const meditationsPath = join(__dirname, '../meditations.mb.txt');

// Embedding mode configuration
export type EmbeddingMode = 'local' | 'remote';

// Get embedding mode from environment variable (runtime config)
export function getEmbeddingMode(): EmbeddingMode {
  return (process.env.EMBEDDING_MODE as EmbeddingMode) || 'local';
}

// Get remote embedding URL from environment variable (runtime config)
export function getRemoteEmbeddingUrl(): string {
  return process.env.REMOTE_EMBEDDING_URL || 'http://10.106.1.182:8083/v1/embeddings';
}

// In-memory cache for RAG results
let vectorStoreInitialized = false;
let passageEmbeddings: Array<{ id: string; text: string; metadata: { book: string; section: string }; embedding: number[] }> = [];

/**
 * Embed a single text using the configured embedding mode
 */
async function embedText(text: string): Promise<number[]> {
  const mode = getEmbeddingMode();
  const remoteUrl = getRemoteEmbeddingUrl();
  
  if (mode === 'local') {
    const embeddingFunction = new DefaultEmbeddingFunction();
    const embeddings = await embeddingFunction.generate([text]);
    return embeddings[0] || new Array(768).fill(0);
  } else {
    // Remote embedding via OpenAI-compatible API
    try {
      const response = await fetch(remoteUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: text,
          model: 'Qwen3-Embedding-4B-Q4_K_M.gguf'
        })
      });
      
      if (!response.ok) {
        throw new Error(`Remote embedding failed: ${response.status}`);
      }
      
      const data = await response.json();
      return data.data[0]?.embedding || new Array(2560).fill(0); // 2560 is the model's embedding dimension
    } catch (error: any) {
      console.warn('[RAG] Remote embedding failed, falling back to local:', error.message);
      const embeddingFunction = new DefaultEmbeddingFunction();
      const embeddings = await embeddingFunction.generate([text]);
      return embeddings[0] || new Array(768).fill(0);
    }
  }
}

/**
 * Parse meditations into passages (sections)
 * Each passage is a self-contained thought from Marcus Aurelius
 */
export function parseMeditationsIntoPassages(text: string): Array<{ id: string; text: string; metadata: { book: string; section: string } }> {
  const passages: Array<{ id: string; text: string; metadata: { book: string; section: string } }> = [];
  
  // Match patterns like "Book I, Section 1" or "Book 1, Section 1"
  // and extract the text following it
  const passageRegex = /(Book\s+\w+|Book\s+\d+)[,\s]+(?:Section|Chapter)\s+(\d+)[.\s]*\n((?:(?!Book\s+\w+|Book\s+\d+)[\s\S])*?)(?=(?:Book\s+\w+|Book\s+\d+)[,\s]+(?:Section|Chapter)\s+\d+|$)/gi;
  
  let match;
  let passageCount = 0;
  
  while ((match = passageRegex.exec(text)) !== null) {
    const book = match[1];
    const section = match[2];
    const content = match[3].trim();
    
    if (content.length > 20) { // Skip very short passages
      passages.push({
        id: `passage-${passageCount++}`,
        text: content,
        metadata: {
          book: book.replace(/\s+/g, ' '),
          section: section
        }
      });
    }
  }
  
  // Fallback: if regex doesn't match well, try line-based parsing
  if (passages.length < 10) {
    console.log('[RAG] Using fallback passage parsing');
    const lines = text.split('\n');
    let currentBook = 'Unknown';
    let currentSection = '0';
    
    for (const line of lines) {
      // Try to extract book/section from line
      const bookMatch = line.match(/^(Book\s+\w+|Book\s+\d+)/);
      const sectionMatch = line.match(/Section\s+(\d+)/);
      
      if (bookMatch) {
        currentBook = bookMatch[1];
      }
      if (sectionMatch) {
        currentSection = sectionMatch[1];
      }
      
      // Skip empty lines and headers
      if (line.trim().length > 50 && !line.match(/^(Book|Chapter|Section)/i)) {
        passages.push({
          id: `passage-${passageCount++}`,
          text: line.trim(),
          metadata: {
            book: currentBook,
            section: currentSection
          }
        });
      }
    }
  }
  
  console.log(`[RAG] Parsed ${passages.length} passages from Meditations`);
  return passages;
}

/**
 * Simple cosine similarity calculator
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }
  
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

/**
 * Initialize the in-memory vector store
 * Uses configured embedding mode (local or remote)
 */
export async function initializeVectorStore() {
  if (vectorStoreInitialized) {
    console.log('[RAG] Vector store already initialized');
    return passageEmbeddings;
  }
  
  console.log('[RAG] Initializing vector store...');
  
  // Read and parse meditations
  const meditationsText = readFileSync(meditationsPath, 'utf-8');
  const passages = parseMeditationsIntoPassages(meditationsText);
  
  if (passages.length === 0) {
    throw new Error('Failed to parse meditations into passages');
  }
  
  const batchSize = 10;
  const totalPassages = passages.length;
  const mode = getEmbeddingMode();
  
  if (mode === 'remote') {
    console.log(`[RAG] Embedding ${totalPassages} passages using remote embedding server...`);
  } else {
    console.log(`[RAG] Embedding ${totalPassages} passages using DefaultEmbeddingFunction...`);
  }
  
  for (let i = 0; i < totalPassages; i += batchSize) {
    const batch = passages.slice(i, i + batchSize);
    
    try {
      // Embed each passage in the batch
      const batchEmbeddings: number[][] = [];
      for (const passage of batch) {
        const embedding = await embedText(passage.text);
        batchEmbeddings.push(embedding);
      }
      
      for (let j = 0; j < batch.length; j++) {
        passageEmbeddings.push({
          id: batch[j].id,
          text: batch[j].text,
          metadata: batch[j].metadata,
          embedding: batchEmbeddings[j]
        });
      }
      
      console.log(`[RAG] Embedded ${Math.min(i + batchSize, totalPassages)}/${totalPassages} passages`);
    } catch (error: any) {
      console.warn(`[RAG] Failed to embed batch:`, error.message);
    }
  }
  
  vectorStoreInitialized = true;
  console.log(`[RAG] Vector store initialized with ${passageEmbeddings.length} passages`);
  
  return passageEmbeddings;
}

/**
 * Query the vector store for relevant passages
 * @param query The user's query
 * @param k Number of passages to retrieve
 * @returns Array of relevant passages with relevance scores
 */
export async function queryVectorStore(query: string, k: number = 5): Promise<Array<{ text: string; score: number; book: string; section: string }>> {
  if (!vectorStoreInitialized) {
    await initializeVectorStore();
  }
  
  if (passageEmbeddings.length === 0) {
    return [];
  }
  
  // Use the same embedding function
  const embeddingFunction = new DefaultEmbeddingFunction();
  
  // Embed the query
  const queryEmbeddings = await embeddingFunction.generate([query]);
  const queryEmbedding = queryEmbeddings[0];
  
  // Calculate similarity with all passages
  const scores = passageEmbeddings.map(p => ({
    ...p,
    score: cosineSimilarity(queryEmbedding, p.embedding)
  }));
  
  // Sort by score and take top k
  scores.sort((a, b) => b.score - a.score);
  const topScores = scores.slice(0, k);
  
  // Format results
  const formattedResults: Array<{ text: string; score: number; book: string; section: string }> = topScores.map(s => ({
    text: s.text,
    score: s.score,
    book: s.metadata.book,
    section: s.metadata.section
  }));
  
  console.log(`[RAG] Retrieved ${formattedResults.length} relevant passages`);
  return formattedResults;
}

/**
 * Get a formatted prompt context with relevant meditations passages
 */
export async function getMeditationContext(userQuery: string, maxPassages: number = 3): Promise<string> {
  if (!vectorStoreInitialized) {
    await initializeVectorStore();
  }
  
  const relevantPassages = await queryVectorStore(userQuery, maxPassages);
  
  if (relevantPassages.length === 0) {
    return '';
  }
  
  let context = 'Relevant passages from Marcus Aurelius\' Meditations:\n\n';
  
  for (const passage of relevantPassages) {
    context += `Book: ${passage.book}, Section: ${passage.section}\n`;
    context += `Passage: ${passage.text}\n\n`;
  }
  
  return context;
}

/**
 * Clear vector store (for testing)
 */
export function clearVectorStore() {
  passageEmbeddings = [];
  vectorStoreInitialized = false;
}
