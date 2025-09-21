/**
 * Default configuration constants for BatchedSummarizationChain
 */

// Batching configuration
export const DEFAULT_BATCH_SIZE = 5; // Default used in n8n node UI
export const DEFAULT_DELAY_BETWEEN_BATCHES = 0;

// Validation limits
export const MIN_BATCH_SIZE = 1;
export const MIN_DELAY = 0;
export const MAX_BATCH_SIZE = 1000; // Reasonable upper limit
export const MAX_DELAY = 600000; // 10 minutes max delay

// Default summarization method
export const DEFAULT_SUMMARIZATION_METHOD = 'map_reduce' as const;
