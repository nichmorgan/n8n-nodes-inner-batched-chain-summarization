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

		it('should initialize with outputSize and sizeMeasurement parameters', () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'map_reduce',
				outputSize: 500,
				sizeMeasurement: 'tokens',
			});

			expect(chain).toBeInstanceOf(BatchedSummarizationChain);
		});

		it('should default sizeMeasurement to characters', () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'map_reduce',
				outputSize: 200,
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

			expect(result).toHaveProperty('output');
			expect(result.output).toHaveProperty('text');
			expect(typeof result.output.text).toBe('string');
			expect(result.output.text).toBe('Final combined summary');
		});

		it('should process documents in batches', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'map_reduce',
				batchSize: 2,
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result).toHaveProperty('output');
			expect(result.output.text).toBe('Final combined summary');
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

			expect(result).toHaveProperty('output');
			expect(result.output.text).toBe('Final combined summary');
		});
	});

	describe('Stuff Method', () => {
		it('should process all documents together', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'stuff',
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result).toHaveProperty('output');
			expect(result.output.text).toBe('Summary 1'); // First response from mock
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

			expect(result).toHaveProperty('output');
			expect(result.output.text).toBe('Summary 1');
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

			expect(result).toHaveProperty('output');
			expect(result.output.text).toBe('Summary 3'); // Last response from sequential processing
		});

		it('should handle empty documents', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'refine',
			});

			const result = await chain.invoke({ input_documents: [] });

			expect(result).toHaveProperty('output');
			expect(result.output).toHaveProperty('text', '');
			expect(result.output).toHaveProperty('sizeValidation');
			expect(result.output.sizeValidation).toHaveProperty('isValid', true);
			expect(result.output.sizeValidation).toHaveProperty('retryCount', 0);
		});

		it('should handle single document', async () => {
			const singleDocument = [documents[0]];
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'refine',
			});

			const result = await chain.invoke({ input_documents: singleDocument });

			expect(result).toHaveProperty('output');
			expect(result.output.text).toBe('Summary 1');
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

			expect(result).toHaveProperty('output');
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
				'Unknown summarization type: unknown',
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

		it('should handle errors during map phase in map_reduce', async () => {
			const errorModel = {
				invoke: vi
					.fn()
					.mockRejectedValueOnce(new Error('Map phase error'))
					.mockResolvedValue('Recovery response'),
			} as any;

			const chain = new BatchedSummarizationChain({
				model: errorModel,
				type: 'map_reduce',
				batchSize: 1,
			});

			await expect(chain.invoke({ input_documents: documents })).rejects.toThrow('Map phase error');
		});

		it('should handle errors during reduce phase in map_reduce', async () => {
			const errorModel = {
				invoke: vi
					.fn()
					.mockResolvedValueOnce('Map success')
					.mockResolvedValueOnce('Map success')
					.mockResolvedValueOnce('Map success')
					.mockRejectedValueOnce(new Error('Reduce phase error')),
			} as any;

			const chain = new BatchedSummarizationChain({
				model: errorModel,
				type: 'map_reduce',
				batchSize: 1,
			});

			await expect(chain.invoke({ input_documents: documents })).rejects.toThrow(
				'Reduce phase error',
			);
		});

		it('should handle errors during initial step in refine', async () => {
			const errorModel = {
				invoke: vi.fn().mockRejectedValue(new Error('Initial refine error')),
			} as any;

			const chain = new BatchedSummarizationChain({
				model: errorModel,
				type: 'refine',
			});

			await expect(chain.invoke({ input_documents: documents })).rejects.toThrow(
				'Initial refine error',
			);
		});

		it('should handle errors during refinement steps in refine', async () => {
			const errorModel = {
				invoke: vi
					.fn()
					.mockResolvedValueOnce('Initial summary')
					.mockRejectedValue(new Error('Refinement error')),
			} as any;

			const chain = new BatchedSummarizationChain({
				model: errorModel,
				type: 'refine',
				batchSize: 1,
			});

			await expect(chain.invoke({ input_documents: documents })).rejects.toThrow(
				'Refinement error',
			);
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

			expect(result).toHaveProperty('output');
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

			expect(result).toHaveProperty('output');
			expect(mockSleep).not.toHaveBeenCalled(); // No delays needed
		});

		it('should call sleep with correct delay values in map_reduce', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'map_reduce',
				batchSize: 2,
				delayBetweenBatches: 150,
			});

			const manyDocuments = Array.from({ length: 5 }, (_, i) => ({
				pageContent: `Document ${i + 1}`,
				metadata: { id: i + 1 },
			}));

			await chain.invoke({ input_documents: manyDocuments });

			// With 5 docs and batch size 2: batch1(2 docs), sleep, batch2(2 docs), sleep, batch3(1 doc)
			// = 2 sleep calls between 3 batches
			expect(mockSleep).toHaveBeenCalledWith(150);
			expect(mockSleep).toHaveBeenCalledTimes(2);
		});

		it('should validate exact sleep call sequence in refine method', async () => {
			const spyModel = {
				invoke: vi.fn().mockResolvedValue('test response'),
			} as any;

			const chain = new BatchedSummarizationChain({
				model: spyModel,
				type: 'refine',
				batchSize: 2,
				delayBetweenBatches: 250,
			});

			const testDocs = Array.from({ length: 6 }, (_, i) => ({
				pageContent: `Document ${i + 1} content`,
				metadata: { id: i + 1 },
			}));

			await chain.invoke({ input_documents: testDocs });

			// Refine: 1 initial doc + 5 remaining docs
			// Remaining docs in batches of 2: batch1(2), sleep, batch2(2), sleep, batch3(1)
			// = 2 sleep calls
			expect(mockSleep).toHaveBeenCalledWith(250);
			expect(mockSleep).toHaveBeenCalledTimes(2);
		});

		it('should not call sleep when only one batch needed', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'map_reduce',
				batchSize: 5,
				delayBetweenBatches: 100,
			});

			const smallDocuments = Array.from({ length: 3 }, (_, i) => ({
				pageContent: `Document ${i + 1}`,
				metadata: { id: i + 1 },
			}));

			await chain.invoke({ input_documents: smallDocuments });

			// Only one batch (3 docs fit in batch size 5), so no delays
			expect(mockSleep).not.toHaveBeenCalled();
		});
	});

	describe('Edge Cases and Context Limits', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		it('should handle very large documents in stuff method', async () => {
			const largeText = 'This is a very long document '.repeat(1000);
			const largeDocument = {
				pageContent: largeText,
				metadata: { id: 'large' },
			};

			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'stuff',
			});

			const result = await chain.invoke({ input_documents: [largeDocument] });

			expect(result).toHaveProperty('output');
			expect(result.output.text).toBe('Summary 1');
		});

		it('should handle zero batch size gracefully', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'map_reduce',
				batchSize: 0, // Invalid batch size
			});

			// Should still work, treating 0 as 1
			const result = await chain.invoke({ input_documents: documents });

			expect(result).toHaveProperty('output');
		});

		it('should handle negative batch size gracefully', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'refine',
				batchSize: -1, // Invalid batch size
			});

			// Should still work with some default behavior
			const result = await chain.invoke({ input_documents: documents });

			expect(result).toHaveProperty('output');
		});

		it('should handle very long delay times with mocked sleep', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'map_reduce',
				batchSize: 1,
				delayBetweenBatches: 10000, // Very long delay (but mocked)
			});

			await chain.invoke({ input_documents: documents.slice(0, 2) });

			expect(mockSleep).toHaveBeenCalledWith(10000);
			expect(mockSleep).toHaveBeenCalledTimes(1);
		});

		it('should handle documents with complex metadata', async () => {
			const complexDocuments = [
				{
					pageContent: 'Document with complex metadata',
					metadata: {
						id: 1,
						nested: { property: 'value' },
						array: [1, 2, 3],
						nullValue: null,
						undefinedValue: undefined,
					},
				},
			];

			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'stuff',
			});

			const result = await chain.invoke({ input_documents: complexDocuments });

			expect(result).toHaveProperty('output');
		});

		it('should handle documents with special characters', async () => {
			const specialCharDocuments = [
				{
					pageContent: 'Document with émojis 🚀 and special chars: áéíóú ñ ç §±∞',
					metadata: { id: 'special' },
				},
			];

			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'stuff',
			});

			const result = await chain.invoke({ input_documents: specialCharDocuments });

			expect(result).toHaveProperty('output');
		});

		it('should handle very small documents with batching', async () => {
			const tinyDocuments = [
				{ pageContent: 'A', metadata: { id: 1 } },
				{ pageContent: 'B', metadata: { id: 2 } },
				{ pageContent: 'C', metadata: { id: 3 } },
			];

			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'map_reduce',
				batchSize: 2,
				delayBetweenBatches: 100,
			});

			const result = await chain.invoke({ input_documents: tinyDocuments });

			expect(result).toHaveProperty('output');
			// Should call sleep once (between 2 batches: first with 2 docs, second with 1 doc)
			expect(mockSleep).toHaveBeenCalledWith(100);
			expect(mockSleep).toHaveBeenCalledTimes(1);
		});

		it('should handle documents with only whitespace', async () => {
			const whitespaceDocuments = [
				{ pageContent: '   ', metadata: { id: 1 } },
				{ pageContent: '\n\n\n', metadata: { id: 2 } },
				{ pageContent: '\t\t\t', metadata: { id: 3 } },
			];

			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'refine',
				batchSize: 2,
				delayBetweenBatches: 50,
			});

			const result = await chain.invoke({ input_documents: whitespaceDocuments });

			expect(result).toHaveProperty('output');
			// Refine: 1 initial + 2 remaining docs in 1 batch = no sleep needed
			expect(mockSleep).not.toHaveBeenCalled();
		});
	});

	describe('Output Size Validation', () => {
		it('should include size validation in output when outputSize is set', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'stuff',
				outputSize: 50,
				sizeMeasurement: 'characters',
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result).toHaveProperty('output');
			expect(result.output).toHaveProperty('text');
			expect(result.output).toHaveProperty('sizeValidation');
			expect(result.output.sizeValidation).toHaveProperty('isValid');
			expect(result.output.sizeValidation).toHaveProperty('actualSize');
			expect(result.output.sizeValidation).toHaveProperty('maxSize', 50);
			expect(result.output.sizeValidation).toHaveProperty('unit', 'characters');
		});

		it('should include size validation for token measurement', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'map_reduce',
				outputSize: 100,
				sizeMeasurement: 'tokens',
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result.output.sizeValidation).toHaveProperty('unit', 'tokens');
		});

		it('should include warning when output exceeds size limit', async () => {
			const longResponse = 'A'.repeat(200); // Long response
			const mockLongModel = new FakeListChatModel({
				responses: [longResponse, longResponse, longResponse, longResponse],
			});

			const chain = new BatchedSummarizationChain({
				model: mockLongModel,
				type: 'stuff',
				outputSize: 50,
				sizeMeasurement: 'characters',
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result.output.sizeValidation.isValid).toBe(false);
			expect(result.output.sizeValidation.actualSize).toBeGreaterThan(50);
			expect(result.output.sizeValidation).toHaveProperty('warning');
			expect(result.output.sizeValidation.warning).toContain('exceeds limit');
		});

		it('should work without outputSize set', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'stuff',
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result.output.sizeValidation.isValid).toBe(true);
			expect(result.output.sizeValidation).not.toHaveProperty('maxSize');
			expect(result.output.sizeValidation).not.toHaveProperty('warning');
		});

		it('should retry with shorter prompts when output exceeds limit', async () => {
			// Create a model that first returns long text, then shorter text on retry
			const mockRetryModel = new FakeListChatModel({
				responses: [
					'A'.repeat(200), // First response is too long
					'Short summary', // Retry response fits
				],
			});

			const chain = new BatchedSummarizationChain({
				model: mockRetryModel,
				type: 'stuff',
				outputSize: 50,
				sizeMeasurement: 'characters',
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result.output.text).toBe('Short summary');
			expect(result.output.sizeValidation.isValid).toBe(true);
			expect(result.output.sizeValidation.retryCount).toBe(1);
			expect(result.output.sizeValidation.actualSize).toBeLessThanOrEqual(50);
		});

		it('should include retryCount in sizeValidation when no retry needed', async () => {
			const chain = new BatchedSummarizationChain({
				model: mockModel,
				type: 'stuff',
				outputSize: 500, // Large enough to not trigger retry
				sizeMeasurement: 'characters',
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result.output.sizeValidation.retryCount).toBe(0);
		});

		it('should include system guidelines in prompts when outputSize is set', async () => {
			const mockModelWithPromptCapture = {
				invoke: vi.fn().mockResolvedValue('Short summary'),
			};

			const chain = new BatchedSummarizationChain({
				model: mockModelWithPromptCapture as any,
				type: 'stuff',
				outputSize: 100,
				sizeMeasurement: 'tokens',
			});

			await chain.invoke({ input_documents: documents });

			// Verify that the model was called with a prompt containing system guidelines
			expect(mockModelWithPromptCapture.invoke).toHaveBeenCalled();
			const calledPrompt = mockModelWithPromptCapture.invoke.mock.calls[0][0];

			expect(calledPrompt).toContain('CRITICAL SIZE LIMIT');
			expect(calledPrompt).toContain('100 tokens');
			expect(calledPrompt).toContain('STRICT LIMIT');
			expect(calledPrompt).toContain('automatically validated');
		});

		it('should use agent with counting tools when useAgent is true', async () => {
			const mockModelWithAgent = {
				invoke: vi.fn().mockResolvedValue('Agent-generated summary within limit'),
			};

			const chain = new BatchedSummarizationChain({
				model: mockModelWithAgent as any,
				type: 'stuff',
				outputSize: 100,
				sizeMeasurement: 'characters',
				useAgent: true, // Enable agent mode
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result.output.text).toBe('Agent-generated summary within limit');
			expect(result.output.sizeValidation.actualSize).toBeLessThanOrEqual(100);
		});

		it('should fallback to traditional approach when useAgent is false', async () => {
			const mockModelTraditional = {
				invoke: vi.fn().mockResolvedValue('Traditional summary'),
			};

			const chain = new BatchedSummarizationChain({
				model: mockModelTraditional as any,
				type: 'stuff',
				outputSize: 100,
				sizeMeasurement: 'characters',
				useAgent: false, // Disable agent mode (default)
			});

			const result = await chain.invoke({ input_documents: documents });

			expect(result.output.text).toBe('Traditional summary');
			// Should still have size validation but use traditional retry if needed
			expect(result.output.sizeValidation).toHaveProperty('actualSize');
		});

		it('should use progressively stricter retry prompts', async () => {
			const mockModelWithStrictPrompts = {
				invoke: vi.fn()
					.mockResolvedValueOnce('A'.repeat(200)) // First response too long
					.mockResolvedValueOnce('B'.repeat(150)) // Second response still too long
					.mockResolvedValueOnce('Short final'), // Third response fits
			};

			const chain = new BatchedSummarizationChain({
				model: mockModelWithStrictPrompts as any,
				type: 'stuff',
				outputSize: 50,
				sizeMeasurement: 'characters',
			});

			const result = await chain.invoke({ input_documents: documents });

			// Should have made 3 calls (initial + 2 retries)
			expect(mockModelWithStrictPrompts.invoke).toHaveBeenCalledTimes(3);

			// Verify retry prompts get progressively stricter
			const calls = mockModelWithStrictPrompts.invoke.mock.calls;

			// Second call should be retry attempt 1
			expect(calls[1][0]).toContain('SIZE VIOLATION');
			expect(calls[1][0]).toContain('RETRY ATTEMPT 1');

			// Third call should be retry attempt 2
			expect(calls[2][0]).toContain('FINAL WARNING');
			expect(calls[2][0]).toContain('RETRY ATTEMPT 2');

			expect(result.output.text).toBe('Short final');
			expect(result.output.sizeValidation.retryCount).toBe(1);
		});
	});
});
