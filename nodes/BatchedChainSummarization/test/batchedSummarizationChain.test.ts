import type { Document } from '@langchain/core/documents';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { PromptTemplate } from '@langchain/core/prompts';
import { sleep } from 'n8n-workflow';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { BatchedSummarizationChain, type SummarizationType } from '../batchedSummarizationChain';

vi.mock('n8n-workflow', () => ({
	sleep: vi.fn().mockResolvedValue(undefined),
}));

const mockSleep = vi.mocked(sleep);

describe('BatchedSummarizationChain', () => {
	let mockModel: FakeListChatModel;
	let documents: Document[];

	beforeEach(() => {
		mockModel = new FakeListChatModel({
			responses: ['Summary 1', 'Summary 2', 'Summary 3', 'Final combined summary'],
		});

		documents = [
			{ pageContent: 'Document 1 content', metadata: { id: 1 } },
			{ pageContent: 'Document 2 content', metadata: { id: 2 } },
			{ pageContent: 'Document 3 content', metadata: { id: 3 } },
		];

		vi.clearAllMocks();
	});

	describe('Constructor', () => {
		it('should initialize with default values', () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'map_reduce',
			});

			expect(chain).toBeInstanceOf(BatchedSummarizationChain);
		});

		it('should initialize with custom values', () => {
			const customPrompt = new PromptTemplate({
				template: 'Custom template: {text}',
				inputVariables: ['text'],
			});

			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'stuff',
				batchSize: 10,
				delayBetweenBatches: 1000,
				prompt: customPrompt,
			});

			expect(chain).toBeInstanceOf(BatchedSummarizationChain);
		});
	});

	describe('Map Reduce Method', () => {
		it('should process documents with default batch size', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'map_reduce',
				batchSize: 1,
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result).toHaveProperty('output_text');
			expect(typeof result.output_text).toBe('string');
			expect(result.output_text).toBe('Final combined summary');
		});

		it('should process documents in batches', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'map_reduce',
				batchSize: 2,
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result).toHaveProperty('output_text');
			expect(result.output_text).toBe('Final combined summary');
		});

		it('should respect delay between batches', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'map_reduce',
				batchSize: 1,
				delayBetweenBatches: 500,
			});

			await chain.invoke({ input_documents: documents });

			// Should be called for delays between batches (documents.length - 1) / batchSize times
			expect(mockSleep).toHaveBeenCalledWith(500);
			expect(mockSleep).toHaveBeenCalledTimes(2); // 3 documents, batch size 1 = 2 delays
		});

		it('should use custom prompts when provided', async () => {
			const customMapPrompt = new PromptTemplate({
				template: 'Summarize this: {text}',
				inputVariables: ['text'],
			});

			const customCombinePrompt = new PromptTemplate({
				template: 'Combine these summaries: {text}',
				inputVariables: ['text'],
			});

			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'map_reduce',
				batchSize: 1,
				combineMapPrompt: customMapPrompt,
				combinePrompt: customCombinePrompt,
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result).toHaveProperty('output_text');
			expect(result.output_text).toBe('Final combined summary');
		});
	});

	describe('Stuff Method', () => {
		it('should process all documents together', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'stuff',
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result).toHaveProperty('output_text');
			expect(result.output_text).toBe('Summary 1'); // First response from mock
		});

		it('should use custom prompt when provided', async () => {
			const customPrompt = new PromptTemplate({
				template: 'Summarize all: {text}',
				inputVariables: ['text'],
			});

			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'stuff',
				prompt: customPrompt,
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result).toHaveProperty('output_text');
			expect(result.output_text).toBe('Summary 1');
		});
	});

	describe('Refine Method', () => {
		it('should process documents sequentially', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'refine',
				batchSize: 1,
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result).toHaveProperty('output_text');
			expect(result.output_text).toBe('Summary 3'); // Last response from sequential processing
		});

		it('should handle empty documents', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'refine',
			});

			const result = await chain.invoke({ input_documents: [] });

			expect(result).toEqual({ output_text: '' });
		});

		it('should handle single document', async () => {
			const singleDocument = [documents[0]];
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'refine',
			});

			const result = await chain.invoke({ input_documents: singleDocument });

			expect(result).toHaveProperty('output_text');
			expect(result.output_text).toBe('Summary 1');
		});

		it('should respect batch size and delay', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'refine',
				batchSize: 1,
				delayBetweenBatches: 300,
			});

			await chain.invoke({ input_documents: documents });

			expect(mockSleep).toHaveBeenCalledWith(300);
			expect(mockSleep).toHaveBeenCalledTimes(1); // 3 docs, first is initial, remaining 2 in batches of 1
		});

		it('should use custom prompts when provided', async () => {
			const customQuestionPrompt = new PromptTemplate({
				template: 'Initial summary: {text}',
				inputVariables: ['text'],
			});

			const customRefinePrompt = new PromptTemplate({
				template: 'Refine: {existing_answer} with {text}',
				inputVariables: ['existing_answer', 'text'],
			});

			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'refine',
				questionPrompt: customQuestionPrompt,
				refinePrompt: customRefinePrompt,
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result).toHaveProperty('output_text');
		});
	});

	describe('withConfig method', () => {
		it('should apply config to model if model has withConfig method', () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'stuff',
			});

			const config = { temperature: 0.5 };
			const chainWithConfig = chain.withConfig(config);

			expect(chainWithConfig).toBeInstanceOf(BatchedSummarizationChain);
		});

		it('should handle model without withConfig method gracefully', () => {
			const modelWithoutConfig = {
				invoke: vi.fn().mockResolvedValue('test response'),
			} as any;

			const chain = new BatchedSummarizationChain({
				model: modelWithoutConfig,
				type: 'stuff',
			});

			const config = { temperature: 0.5 };
			const chainWithConfig = chain.withConfig(config);

			expect(chainWithConfig).toBeInstanceOf(BatchedSummarizationChain);
		});
	});

	describe('Error Handling', () => {
		it('should throw error for unknown summarization type', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'unknown' as SummarizationType,
			});

			await expect(chain.invoke({ input_documents: documents })).rejects.toThrow(
				'Unknown summarization type: unknown'
			);
		});

		it('should handle model errors gracefully', async () => {
			const errorModel = {
				invoke: vi.fn().mockRejectedValue(new Error('Model error')),
			} as any;

			const chain = new BatchedSummarizationChain({
				model: errorModel,
				type: 'stuff',
			});

			await expect(chain.invoke({ input_documents: documents })).rejects.toThrow('Model error');
		});
	});

	describe('Large Batch Processing', () => {
		it('should handle large batches efficiently', async () => {
			const largeBatchDocuments = Array.from({ length: 10 }, (_, i) => ({
				pageContent: `Document ${i + 1} content`,
				metadata: { id: i + 1 },
			}));

			const manyResponsesModel = new FakeListChatModel({
				responses: Array.from({ length: 12 }, (_, i) => `Response ${i + 1}`),
			});

			const chain = new BatchedSummarizationChain({
				model: manyResponsesModel,
				type: 'map_reduce',
				batchSize: 3,
				delayBetweenBatches: 100,
			});

			const result = await chain.invoke({ input_documents: largeBatchDocuments });

			expect(result).toHaveProperty('output_text');
			expect(mockSleep).toHaveBeenCalledWith(100);
		});
	});

	describe('Performance and Batching Logic', () => {
		it('should minimize model calls with appropriate batching', async () => {
			const spyModel = {
				invoke: vi.fn().mockResolvedValue('test response'),
			} as any;

			const chain = new BatchedSummarizationChain({
				model: spyModel,
				type: 'map_reduce',
				batchSize: 5, // Larger batch size
			});

			const manyDocuments = Array.from({ length: 10 }, (_, i) => ({
				pageContent: `Document ${i + 1}`,
				metadata: { id: i + 1 },
			}));

			await chain.invoke({ input_documents: manyDocuments });

			// Should be called once per document for map phase + once for reduce phase
			expect(spyModel.invoke).toHaveBeenCalledTimes(11);
		});

		it('should handle batch size larger than document count', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'map_reduce',
				batchSize: 10, // Larger than document count
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result).toHaveProperty('output_text');
			expect(mockSleep).not.toHaveBeenCalled(); // No delays needed
		});
	});
});