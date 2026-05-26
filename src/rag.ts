import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ChromaClient, DefaultEmbeddingFunction, IncludeEnum } from 'chromadb';

// Get the directory of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to meditations
const meditationsPath = join(__dirname, '../../Sasha-Malahov/meditations.mb.txt');

// In-memory cache for RAG results
let vectorStoreInitialized = false;
let chromaClient: ChromaClient | null = null;
let collection: any = null;

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
 * Initialize the ChromaDB vector store
 */
export async function initializeVectorStore() {
  if (vectorStoreInitialized) {
    console.log('[RAG] Vector store already initialized');
    return collection;
  }
  
  console.log('[RAG] Initializing vector store...');
  
  // Read and parse meditations
  const meditationsText = readFileSync(meditationsPath, 'utf-8');
  const passages = parseMeditationsIntoPassages(meditationsText);
  
  if (passages.length === 0) {
    throw new Error('Failed to parse meditations into passages');
  }
  
  // Initialize ChromaDB client (in-memory by default)
  chromaClient = new ChromaClient();
  
  // Get or create collection
  collection = await chromaClient.getOrCreateCollection({
    name: 'meditations',
    metadata: { 'hnsw:space': 'cosine' }
  });
  
  // Check if collection is already populated
  const count = await collection.count();
  if (count > 0) {
    console.log(`[RAG] Vector store already contains ${count} passages`);
    vectorStoreInitialized = true;
    return collection;
  }
  
  // Use the model's embedding capability
  console.log('[RAG] Embedding passages...');
  
  // Get embedding dimension by embedding a test text
  console.log('[RAG] Determining embedding dimension...');
  try {
    // Using DefaultEmbeddingFunction, we don't need to call ai.embed
    console.log('[RAG] Using DefaultEmbeddingFunction for embeddings');
  } catch (error: any) {
    console.warn('[RAG] Embed error:', error);
    // Default to 768 dimensions
  }
  
  // Use DefaultEmbeddingFunction as fallback
  const embeddingFunction = new DefaultEmbeddingFunction();
  
  // Embed all passages
  const passagesText = passages.map(p => p.text);
  const embeddings = await embeddingFunction.generate(passagesText);
  
  // Add to vector store
  console.log('[RAG] Adding passages to vector store...');
  await collection.add({
    ids: passages.map(p => p.id),
    embeddings: embeddings,
    metadatas: passages.map(p => p.metadata),
    documents: passagesText
  });
  
  vectorStoreInitialized = true;
  console.log(`[RAG] Vector store initialized with ${passages.length} passages`);
  
  return collection;
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
  
  if (!collection) {
    throw new Error('Vector store not initialized');
  }
  
  // Get the embedding function and embed the query
  const embeddingFunction = new DefaultEmbeddingFunction();
  const queryEmbeddings = await embeddingFunction.generate([query]);
  const queryVector = queryEmbeddings[0];
  
  // Query the collection
  const results: any = await collection.query({
    queryEmbeddings: [queryVector],
    nResults: k,
    include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances]
  });
  
  // Format results
  const formattedResults: Array<{ text: string; score: number; book: string; section: string }> = [];
  
  if (results.documents && results.documents[0]) {
    for (let i = 0; i < results.documents[0].length; i++) {
      const text = results.documents[0][i];
      const metadata = results.metadatas ? results.metadatas[0][i] : {};
      const distances = results.distances ? results.distances[0][i] : 0;
      const distance = Array.isArray(distances) ? distances[i] : distances;
      
      // Convert distance to similarity score (cosine distance -> similarity)
      const score = distance !== undefined ? 1 - distance : 0;
      
      formattedResults.push({
        text,
        score,
        book: metadata?.book || 'Unknown',
        section: metadata?.section || '0'
      });
    }
  }
  
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
 * Clean up vector store (for testing)
 */
export async function clearVectorStore() {
  if (chromaClient) {
    try {
      await chromaClient.deleteCollection({ name: 'meditations' });
    } catch (e) {
      // Collection might not exist
    }
  }
  vectorStoreInitialized = false;
  collection = null;
}
