import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type { IExecuteFunctions, INode, INodeExecutionData } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { BatchedChainSummarization } from '../BatchedChainSummarization.node';

vi.mock('@utils/tracing', () => ({
	getTracingConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('@utils/N8nBinaryLoader', () => ({
	N8nBinaryLoader: vi.fn().mockImplementation(() => ({
		processItem: vi
			.fn()
			.mockResolvedValue([
				{ pageContent: 'Processed binary content', metadata: { source: 'binary' } },
			]),
	})),
}));

vi.mock('@utils/N8nJsonLoader', () => ({
	N8nJsonLoader: vi.fn().mockImplementation(() => ({
		processItem: vi
			.fn()
			.mockResolvedValue([{ pageContent: 'Processed JSON content', metadata: { source: 'json' } }]),
	})),
}));

vi.mock('langchain/chains', () => ({
	loadSummarizationChain: vi.fn().mockImplementation(() => ({
		invoke: vi.fn().mockResolvedValue({ output_text: 'Standard chain summary' }),
		withConfig: vi.fn().mockReturnThis(),
	})),
}));

const createExecuteFunctionsMock = (
	parameters: any,
	inputData: INodeExecutionData[] = [
		{ json: { text: 'This is a test document that needs summarization.' } },
	],
) => {
	const mockExecuteFunctions = {
		getInputData: vi.fn(),
		getNode: vi.fn(),
		getInputConnectionData: vi.fn(),
		getNodeParameter: vi.fn(),
		continueOnFail: vi.fn(),
		getExecutionCancelSignal: vi.fn(),
	} as unknown as IExecuteFunctions;
	const mockLlm = {
		invoke: vi.fn().mockResolvedValue({ content: 'Summary of chunk 1' }),
		withConfig: vi.fn().mockReturnThis(),
	} as any;

	mockExecuteFunctions.getInputData.mockReturnValue(inputData);
	mockExecuteFunctions.getNode.mockReturnValue({
		name: 'Batched Summarization Chain',
		parameters: {},
	} as INode);

	mockExecuteFunctions.getInputConnectionData.mockImplementation(async (connectionType) => {
		if (connectionType === NodeConnectionType.AiLanguageModel) {
			return mockLlm as BaseLanguageModel;
		}
		if (connectionType === NodeConnectionType.AiDocument) {
			return [{ pageContent: 'Document from loader', metadata: { source: 'loader' } }];
		}
		if (connectionType === NodeConnectionType.AiTextSplitter) {
			return {
				splitDocuments: vi
					.fn()
					.mockResolvedValue([{ pageContent: 'Split document', metadata: { source: 'splitter' } }]),
			};
		}
		return undefined;
	});

	mockExecuteFunctions.getNodeParameter.mockImplementation((param, _itemIndex, defaultValue) => {
		const paramMap: Record<string, any> = {
			operationMode: parameters.operationMode || 'nodeInputJson',
			chunkingMode: parameters.chunkingMode || 'simple',
			batchSize: parameters.batchSize || 5,
			delayBetweenBatches: parameters.delayBetweenBatches || 0,
			chunkSize: parameters.chunkSize || 1000,
			chunkOverlap: parameters.chunkOverlap || 200,
			'options.summarizationMethodAndPrompts.values': parameters.customPrompts || {
				summarizationMethod: parameters.summarizationMethod || 'map_reduce',
				prompt: 'Write a concise summary of the following:\n\n{text}\n\nCONCISE SUMMARY:',
				combineMapPrompt: 'Write a concise summary of the following:\n\n{text}\n\nCONCISE SUMMARY:',
			},
			'options.textKey': parameters.textKey || 'text',
			'options.binaryDataKey': parameters.binaryDataKey || 'data',
		};

		return paramMap[param] !== undefined ? paramMap[param] : defaultValue;
	});

	mockExecuteFunctions.continueOnFail.mockReturnValue(false);
	mockExecuteFunctions.getExecutionCancelSignal.mockReturnValue(undefined as any);

	return mockExecuteFunctions;
};

describe('BatchedChainSummarization', () => {
	let node: BatchedChainSummarization;

	beforeEach(() => {
		node = new BatchedChainSummarization();
		vi.clearAllMocks();
	});

	describe('Node Description', () => {
		it('should have correct node description', () => {
			expect(node.description.displayName).toBe('Batched Summarization Chain');
			expect(node.description.name).toBe('batchedChainSummarization');
			expect(node.description.version).toBe(1);
			expect(node.description.group).toContain('transform');
		});

		it('should have correct inputs and outputs', () => {
			// Inputs are dynamic based on parameters, so we check the structure
			expect(typeof node.description.inputs).toBe('string');
			expect(node.description.inputs).toContain('getInputs');
			expect(node.description.outputs).toEqual([NodeConnectionType.Main]);
		});

		it('should have all required properties', () => {
			const properties = node.description.properties;
			expect(properties).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: 'operationMode' }),
					expect.objectContaining({ name: 'chunkingMode' }),
					expect.objectContaining({ name: 'chunkSize' }),
					expect.objectContaining({ name: 'chunkOverlap' }),
					expect.objectContaining({ name: 'batchSize' }),
					expect.objectContaining({ name: 'delayBetweenBatches' }),
					expect.objectContaining({ name: 'options' }),
				]),
			);
		});
	});

	describe('Execute Method', () => {
		it('should execute successfully with default parameters', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({});

			const result = await node.execute.call(mockExecuteFunctions);

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveLength(1);
			expect(result[0][0]).toHaveProperty('json');
			expect(result[0][0].json).toHaveProperty('output_text');
		});

		it('should process multiple input items', async () => {
			const inputData = [
				{ json: { text: 'First document to summarize' } },
				{ json: { text: 'Second document to summarize' } },
				{ json: { text: 'Third document to summarize' } },
			];

			const mockExecuteFunctions = createExecuteFunctionsMock({}, inputData);

			const result = await node.execute.call(mockExecuteFunctions);

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveLength(3);
			expect(result[0].every((item) => item.json && 'output_text' in item.json)).toBe(true);
		});

		it('should handle different operation modes', async () => {
			// Test nodeInputJson mode
			const mockExecuteFunctions1 = createExecuteFunctionsMock({
				operationMode: 'nodeInputJson',
			});

			const result1 = await node.execute.call(mockExecuteFunctions1);
			expect(result1).toHaveLength(1);
			expect(result1[0]).toHaveLength(1);

			// Test nodeInputBinary mode
			const mockExecuteFunctions2 = createExecuteFunctionsMock({
				operationMode: 'nodeInputBinary',
			});

			const result2 = await node.execute.call(mockExecuteFunctions2);
			expect(result2).toHaveLength(1);
			expect(result2[0]).toHaveLength(1);

			// Test documentLoader mode
			const mockExecuteFunctions3 = createExecuteFunctionsMock({
				operationMode: 'documentLoader',
			});

			const result3 = await node.execute.call(mockExecuteFunctions3);
			expect(result3).toHaveLength(1);
			expect(result3[0]).toHaveLength(1);
		});

		it('should handle different chunking modes', async () => {
			// Test simple chunking
			const mockExecuteFunctions1 = createExecuteFunctionsMock({
				chunkingMode: 'simple',
			});

			const result1 = await node.execute.call(mockExecuteFunctions1);
			expect(result1).toHaveLength(1);

			// Test advanced chunking
			const mockExecuteFunctions2 = createExecuteFunctionsMock({
				chunkingMode: 'advanced',
			});

			const result2 = await node.execute.call(mockExecuteFunctions2);
			expect(result2).toHaveLength(1);

			// Test no chunking
			const mockExecuteFunctions3 = createExecuteFunctionsMock({
				chunkingMode: 'none',
			});

			const result3 = await node.execute.call(mockExecuteFunctions3);
			expect(result3).toHaveLength(1);
		});

		it('should handle different summarization methods', async () => {
			// Test map_reduce
			const mockExecuteFunctions1 = createExecuteFunctionsMock({
				summarizationMethod: 'map_reduce',
				batchSize: 3,
			});

			const result1 = await node.execute.call(mockExecuteFunctions1);
			expect(result1).toHaveLength(1);

			// Test stuff
			const mockExecuteFunctions2 = createExecuteFunctionsMock({
				summarizationMethod: 'stuff',
			});

			const result2 = await node.execute.call(mockExecuteFunctions2);
			expect(result2).toHaveLength(1);

			// Test refine
			const mockExecuteFunctions3 = createExecuteFunctionsMock({
				summarizationMethod: 'refine',
				batchSize: 2,
			});

			const result3 = await node.execute.call(mockExecuteFunctions3);
			expect(result3).toHaveLength(1);
		});
	});

	describe('Batching Configuration', () => {
		it('should respect batch size configuration', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				batchSize: 10,
				delayBetweenBatches: 500,
			});

			const result = await node.execute.call(mockExecuteFunctions);

			expect(result).toHaveLength(1);
			expect(mockExecuteFunctions.getNodeParameter).toHaveBeenCalledWith('batchSize', 0, 5);
			expect(mockExecuteFunctions.getNodeParameter).toHaveBeenCalledWith(
				'delayBetweenBatches',
				0,
				0,
			);
		});

		it('should use batched processing when batch size > 1 and chunking enabled', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				batchSize: 5,
				chunkingMode: 'simple',
				summarizationMethod: 'map_reduce',
			});

			const result = await node.execute.call(mockExecuteFunctions);

			expect(result).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('output_text');
		});
	});

	describe('Custom Prompts', () => {
		it('should handle custom prompts for different methods', async () => {
			const customPrompts = {
				combineMapPrompt: 'Custom map prompt: {text}',
				combinePrompt: 'Custom combine prompt: {text}',
				stuffPrompt: 'Custom stuff prompt: {text}',
				refineQuestionPrompt: 'Custom question: {text}',
				refinePrompt: 'Custom refine: {existing_answer} with {text}',
			};

			const mockExecuteFunctions = createExecuteFunctionsMock({
				summarizationMethod: 'map_reduce',
				customPrompts,
			});

			const result = await node.execute.call(mockExecuteFunctions);

			expect(result).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('output_text');
		});
	});

	describe('Error Handling', () => {
		it('should handle errors gracefully when continueOnFail is true', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({});

			// Mock an error in processItem
			mockExecuteFunctions.getInputConnectionData.mockRejectedValue(new Error('Connection error'));
			mockExecuteFunctions.continueOnFail.mockReturnValue(true);

			const result = await node.execute.call(mockExecuteFunctions);

			expect(result).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('error');
			expect(result[0][0].json.error).toBe('Connection error');
		});

		it('should throw error when continueOnFail is false', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({});

			mockExecuteFunctions.getInputConnectionData.mockRejectedValue(new Error('Connection error'));
			mockExecuteFunctions.continueOnFail.mockReturnValue(false);

			await expect(node.execute.call(mockExecuteFunctions)).rejects.toThrow('Connection error');
		});

		it('should handle empty input data', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({}, []);

			const result = await node.execute.call(mockExecuteFunctions);

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveLength(0);
		});
	});

	describe('Integration Scenarios', () => {
		it('should handle large document processing with batching', async () => {
			const largeDocument = {
				json: {
					text:
						'This is a very long document '.repeat(100) + 'that needs to be processed in batches.',
				},
			};

			const mockExecuteFunctions = createExecuteFunctionsMock(
				{
					summarizationMethod: 'map_reduce',
					batchSize: 3,
					delayBetweenBatches: 100,
					chunkSize: 500,
					chunkOverlap: 50,
				},
				[largeDocument],
			);

			const result = await node.execute.call(mockExecuteFunctions);

			expect(result).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('output_text');
			expect(typeof result[0][0].json.output_text).toBe('string');
		});

		it('should handle mixed input types correctly', async () => {
			const mixedInputs = [
				{ json: { text: 'Short text' } },
				{ json: { content: 'Text with different key' } },
				{ json: { text: 'Another short text' } },
			];

			const mockExecuteFunctions = createExecuteFunctionsMock(
				{
					summarizationMethod: 'stuff',
					batchSize: 2,
				},
				mixedInputs,
			);

			const result = await node.execute.call(mockExecuteFunctions);

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveLength(3);
			expect(result[0].every((item) => item.json && 'output_text' in item.json)).toBe(true);
		});

		it('should process binary data correctly', async () => {
			const binaryInput = {
				json: {},
				binary: {
					data: {
						data: 'SGVsbG8gV29ybGQ=', // "Hello World" in base64
						mimeType: 'text/plain',
					},
				},
			};

			const mockExecuteFunctions = createExecuteFunctionsMock(
				{
					operationMode: 'nodeInputBinary',
					summarizationMethod: 'stuff',
				},
				[binaryInput],
			);

			const result = await node.execute.call(mockExecuteFunctions);

			expect(result).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('output_text');
		});
	});

	describe('Performance and Edge Cases', () => {
		it('should handle very small batch sizes', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				batchSize: 1,
				delayBetweenBatches: 50,
			});

			const result = await node.execute.call(mockExecuteFunctions);

			expect(result).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('output_text');
		});

		it('should handle very large batch sizes', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				batchSize: 100,
			});

			const result = await node.execute.call(mockExecuteFunctions);

			expect(result).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('output_text');
		});

		it('should handle zero delay between batches', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				batchSize: 3,
				delayBetweenBatches: 0,
			});

			const result = await node.execute.call(mockExecuteFunctions);

			expect(result).toHaveLength(1);
			expect(result[0][0].json).toHaveProperty('output_text');
		});
	});
});
