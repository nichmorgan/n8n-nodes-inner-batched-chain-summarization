import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { IExecuteFunctions, INode, INodeExecutionData } from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';
import { describe, it, expect, vi } from 'vitest';

import { processItem } from '../processItem';

vi.mock('@utils/tracing', () => ({
	getTracingConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('@utils/N8nBinaryLoader', () => ({
	N8nBinaryLoader: vi.fn().mockImplementation(() => ({
		processItem: vi
			.fn()
			.mockResolvedValue([{ pageContent: 'Binary content', metadata: { source: 'binary' } }]),
	})),
}));

vi.mock('@utils/N8nJsonLoader', () => ({
	N8nJsonLoader: vi.fn().mockImplementation(() => ({
		processItem: vi
			.fn()
			.mockResolvedValue([{ pageContent: 'JSON content', metadata: { source: 'json' } }]),
	})),
}));

vi.mock('langchain/chains', () => ({
	loadSummarizationChain: vi.fn().mockImplementation(() => ({
		invoke: vi.fn().mockResolvedValue({ output: { text: 'Standard chain summary' } }),
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
		if (connectionType === NodeConnectionType.AiTextSplitter) {
			return new RecursiveCharacterTextSplitter({ chunkSize: 100, chunkOverlap: 20 });
		}
		if (connectionType === NodeConnectionType.AiDocument) {
			return [{ pageContent: 'Document from loader', metadata: { source: 'loader' } }];
		}
		return undefined;
	});

	mockExecuteFunctions.getNodeParameter.mockImplementation((param, _itemIndex, defaultValue) => {
		const paramMap: Record<string, any> = {
			summarizationMethod: parameters.summarizationMethod || 'map_reduce',
			batchSize: parameters.batchSize || 5,
			delayBetweenBatches: parameters.delayBetweenBatches || 0,
			chunkSize: parameters.chunkSize || 1000,
			chunkOverlap: parameters.chunkOverlap || 200,
			'options.customPrompts.values': parameters.customPrompts || {},
			'options.textKey': parameters.textKey || 'text',
			'options.binaryDataKey': parameters.binaryDataKey || 'data',
		};

		return paramMap[param] !== undefined ? paramMap[param] : defaultValue;
	});

	mockExecuteFunctions.getExecutionCancelSignal.mockReturnValue(undefined as any);

	return mockExecuteFunctions;
};

describe('processItem', () => {
	describe('Document Loader Mode', () => {
		it('should process documents from document loader', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				summarizationMethod: 'stuff',
				batchSize: 1,
			});

			const item = { json: { text: 'test' } };
			const result = await processItem(mockExecuteFunctions, 0, item, 'documentLoader', 'simple');

			expect(result).toHaveProperty('output');
			expect(typeof result?.output?.text).toBe('string');
		});

		it('should handle Array<Document> input from document loader', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				summarizationMethod: 'map_reduce',
				batchSize: 2,
			});

			const item = { json: { text: 'test' } };
			const result = await processItem(mockExecuteFunctions, 0, item, 'documentLoader', 'none');

			expect(result).toHaveProperty('output');
		});
	});

	describe('Node Input JSON Mode', () => {
		it('should process JSON input with simple chunking', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				summarizationMethod: 'map_reduce',
				batchSize: 3,
				chunkSize: 500,
				chunkOverlap: 100,
			});

			const item = {
				json: { text: 'This is a long text that needs to be chunked and summarized.' },
			};
			const result = await processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'simple');

			expect(result).toHaveProperty('output');
			expect(mockExecuteFunctions.getNodeParameter).toHaveBeenCalledWith('chunkSize', 0, 1000);
			expect(mockExecuteFunctions.getNodeParameter).toHaveBeenCalledWith('chunkOverlap', 0, 200);
		});

		it('should process JSON input with advanced chunking', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				summarizationMethod: 'refine',
				batchSize: 2,
			});

			const item = { json: { text: 'Text for advanced chunking' } };
			const result = await processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'advanced');

			expect(result).toHaveProperty('output');
			expect(mockExecuteFunctions.getInputConnectionData).toHaveBeenCalledWith(
				NodeConnectionType.AiTextSplitter,
				0,
			);
		});

		it('should process JSON input without chunking', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				summarizationMethod: 'stuff',
				batchSize: 1,
			});

			const item = { json: { text: 'Simple text without chunking' } };
			const result = await processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'none');

			expect(result).toHaveProperty('output');
		});

		it('should use custom text key', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				summarizationMethod: 'stuff',
				textKey: 'content',
			});

			const item = { json: { content: 'Text from custom key' } };
			const result = await processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'simple');

			expect(result).toHaveProperty('output');
		});
	});

	describe('Node Input Binary Mode', () => {
		it('should process binary input', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				summarizationMethod: 'map_reduce',
				batchSize: 2,
				binaryDataKey: 'file',
			});

			const item = {
				json: {},
				binary: {
					file: {
						data: 'SGVsbG8gV29ybGQ=', // Base64 encoded "Hello World"
						mimeType: 'text/plain',
					},
				},
			};

			const result = await processItem(mockExecuteFunctions, 0, item, 'nodeInputBinary', 'simple');

			expect(result).toHaveProperty('output');
			expect(mockExecuteFunctions.getNodeParameter).toHaveBeenCalledWith(
				'options.binaryDataKey',
				0,
				'data',
			);
		});
	});

	describe('Batching Logic', () => {
		it('should use standard chain when batch size is 1', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				summarizationMethod: 'stuff',
				batchSize: 1,
			});

			const item = { json: { text: 'Test text' } };
			const result = await processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'simple');

			expect(result).toHaveProperty('output');
		});

		it('should use batched chain when batch size > 1 and chunking enabled', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				summarizationMethod: 'map_reduce',
				batchSize: 5,
			});

			const item = { json: { text: 'Test text for batching' } };
			const result = await processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'simple');

			expect(result).toHaveProperty('output');
		});

		it('should use standard chain when chunking is disabled', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				summarizationMethod: 'stuff',
				batchSize: 5,
			});

			const item = { json: { text: 'Test text' } };
			const result = await processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'none');

			expect(result).toHaveProperty('output');
		});
	});

	describe('Different Summarization Methods', () => {
		it('should handle map_reduce method', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				summarizationMethod: 'map_reduce',
				batchSize: 3,
			});

			const item = { json: { text: 'Text for map reduce summarization' } };
			const result = await processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'simple');

			expect(result).toHaveProperty('output');
		});

		it('should handle stuff method', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				summarizationMethod: 'stuff',
				batchSize: 2,
			});

			const item = { json: { text: 'Text for stuff summarization' } };
			const result = await processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'simple');

			expect(result).toHaveProperty('output');
		});

		it('should handle refine method', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				summarizationMethod: 'refine',
				batchSize: 2,
				delayBetweenBatches: 100,
			});

			const item = { json: { text: 'Text for refine summarization' } };
			const result = await processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'simple');

			expect(result).toHaveProperty('output');
		});
	});

	describe('Custom Prompts', () => {
		it('should use custom prompts when provided', async () => {
			const customPrompts = {
				combineMapPrompt: 'Custom map prompt: {text}',
				combinePrompt: 'Custom combine prompt: {text}',
				stuffPrompt: 'Custom stuff prompt: {text}',
				refineQuestionPrompt: 'Custom question prompt: {text}',
				refinePrompt: 'Custom refine prompt: {existing_answer} + {text}',
			};

			const mockExecuteFunctions = createExecuteFunctionsMock({
				summarizationMethod: 'map_reduce',
				batchSize: 2,
				customPrompts,
			});

			const item = { json: { text: 'Text with custom prompts' } };
			const result = await processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'simple');

			expect(result).toHaveProperty('output');
			expect(mockExecuteFunctions.getNodeParameter).toHaveBeenCalledWith(
				'options.customPrompts.values',
				0,
				{},
			);
		});
	});

	describe('Edge Cases', () => {
		it('should return undefined for unsupported operation mode', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({});

			const item = { json: { text: 'test' } };
			const result = await processItem(mockExecuteFunctions, 0, item, 'unsupportedMode', 'simple');

			expect(result).toBeUndefined();
		});

		it('should handle empty input gracefully', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				summarizationMethod: 'stuff',
			});

			const item = { json: {} };
			const result = await processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'simple');

			expect(result).toHaveProperty('output');
		});

		it('should handle missing language model', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({});
			mockExecuteFunctions.getInputConnectionData.mockResolvedValue(undefined);

			const item = { json: { text: 'test' } };

			await expect(
				processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'simple'),
			).rejects.toThrow();
		});
	});

	describe('Configuration Parameters', () => {
		it('should respect batch size parameter', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				batchSize: 10,
			});

			const item = { json: { text: 'test' } };
			await processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'simple');

			expect(mockExecuteFunctions.getNodeParameter).toHaveBeenCalledWith('batchSize', 0, 5);
		});

		it('should respect delay between batches parameter', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				delayBetweenBatches: 1000,
			});

			const item = { json: { text: 'test' } };
			await processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'simple');

			expect(mockExecuteFunctions.getNodeParameter).toHaveBeenCalledWith(
				'delayBetweenBatches',
				0,
				0,
			);
		});
	});

	describe('Custom Prompts Coverage', () => {
		it('should handle stuff method custom prompt', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				customPrompts: {
					stuffPrompt: 'Custom stuff prompt: {text}',
				},
			});

			const item = { json: { text: 'test' } };
			await processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'simple');

			expect(mockExecuteFunctions.getNodeParameter).toHaveBeenCalledWith(
				'options.customPrompts.values',
				0,
				{},
			);
		});

		it('should handle refine method custom prompts', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				customPrompts: {
					refinePrompt: 'Custom refine prompt: {existing_answer} + {text}',
					refineQuestionPrompt: 'Custom question prompt: {text}',
				},
			});

			const item = { json: { text: 'test' } };
			await processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'simple');

			expect(mockExecuteFunctions.getNodeParameter).toHaveBeenCalledWith(
				'options.customPrompts.values',
				0,
				{},
			);
		});

		it('should handle map_reduce method custom prompts', async () => {
			const mockExecuteFunctions = createExecuteFunctionsMock({
				customPrompts: {
					combineMapPrompt: 'Custom map prompt: {text}',
					combinePrompt: 'Custom combine prompt: {text}',
				},
			});

			const item = { json: { text: 'test' } };
			await processItem(mockExecuteFunctions, 0, item, 'nodeInputJson', 'simple');

			expect(mockExecuteFunctions.getNodeParameter).toHaveBeenCalledWith(
				'options.customPrompts.values',
				0,
				{},
			);
		});
	});
});
