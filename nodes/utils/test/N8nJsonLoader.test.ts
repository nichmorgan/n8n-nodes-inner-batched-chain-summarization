import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { N8nJsonLoader } from '../N8nJsonLoader';

// Mock NodeOperationError
vi.mock('n8n-workflow', async () => {
	const actual = await vi.importActual('n8n-workflow');
	return {
		...actual,
		NodeOperationError: vi.fn().mockImplementation((node, message) => {
			const error = new Error(message);
			error.name = 'NodeOperationError';
			return error;
		}),
	};
});

// Mock LangChain document loaders
vi.mock('langchain/document_loaders/fs/json', () => ({
	JSONLoader: vi.fn().mockImplementation(() => ({
		load: vi.fn().mockResolvedValue([
			{ pageContent: 'Mocked JSON content', metadata: { source: 'json' } },
		]),
	})),
}));

vi.mock('langchain/document_loaders/fs/text', () => ({
	TextLoader: vi.fn().mockImplementation(() => ({
		load: vi.fn().mockResolvedValue([
			{ pageContent: 'Mocked text content', metadata: { source: 'text' } },
		]),
	})),
}));

// Mock helpers
vi.mock('../helpers', () => ({
	getMetadataFiltersValues: vi.fn().mockReturnValue({}),
}));

describe('N8nJsonLoader', () => {
	let mockExecuteFunctions: IExecuteFunctions;
	let mockTextSplitter: any;

	beforeEach(() => {
		mockExecuteFunctions = {
			getNodeParameter: vi.fn().mockImplementation((param, itemIndex, defaultValue) => {
				if (param === 'jsonMode') return 'allInputData';
				if (param === 'options.pointers' || param === 'pointers') return '';
				if (param === 'jsonData') return {};
				return defaultValue;
			}),
			getNode: vi.fn().mockReturnValue({ name: 'Test Node' }),
		} as unknown as IExecuteFunctions;

		mockTextSplitter = {
			splitDocuments: vi.fn().mockResolvedValue([
				{ pageContent: 'Split chunk 1', metadata: { source: 'json', chunk: 1 } },
				{ pageContent: 'Split chunk 2', metadata: { source: 'json', chunk: 2 } },
			]),
		};

		vi.clearAllMocks();
	});

	describe('Constructor', () => {
		it('should create instance with required parameters', () => {
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.');
			expect(loader).toBeInstanceOf(N8nJsonLoader);
		});

		it('should create instance with text splitter', () => {
			const loader = new N8nJsonLoader(
				mockExecuteFunctions,
				'options.',
				mockTextSplitter,
			);
			expect(loader).toBeInstanceOf(N8nJsonLoader);
		});
	});

	describe('processItem', () => {
		it('should process JSON data successfully', async () => {
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.');
			const item: INodeExecutionData = {
				json: {
					text: 'This is the main content',
					title: 'Test Document',
					id: 123,
				},
			};

			const result = await loader.processItem(item, 0);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(
				expect.objectContaining({
					pageContent: 'Mocked JSON content',
					metadata: expect.objectContaining({
						source: 'json',
					}),
				}),
			);
		});

		it('should handle empty JSON object', async () => {
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.');
			const item: INodeExecutionData = {
				json: {},
			};

			const result = await loader.processItem(item, 0);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(
				expect.objectContaining({
					pageContent: 'Mocked JSON content',
				}),
			);
		});

		it('should use text splitter when provided', async () => {
			const loader = new N8nJsonLoader(
				mockExecuteFunctions,
				'options.',
				mockTextSplitter,
			);
			const item: INodeExecutionData = {
				json: {
					text: 'This is a long text that needs splitting',
				},
			};

			const result = await loader.processItem(item, 0);

			expect(mockTextSplitter.splitDocuments).toHaveBeenCalled();
			expect(result).toHaveLength(2);
			expect(result[0].pageContent).toBe('Split chunk 1');
			expect(result[1].pageContent).toBe('Split chunk 2');
		});
	});

	describe('processAll', () => {
		it('should process multiple items', async () => {
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.');
			const items: INodeExecutionData[] = [
				{ json: { text: 'First document' } },
				{ json: { text: 'Second document' } },
			];

			const result = await loader.processAll(items);

			expect(result).toHaveLength(2);
			expect(result.every(doc => doc.pageContent === 'Mocked JSON content')).toBe(true);
		});

		it('should handle empty items array', async () => {
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.');

			const result = await loader.processAll([]);

			expect(result).toHaveLength(0);
		});

		it('should handle undefined items', async () => {
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.');

			const result = await loader.processAll(undefined);

			expect(result).toHaveLength(0);
		});
	});
});