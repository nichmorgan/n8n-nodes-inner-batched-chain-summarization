import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { N8nJsonLoader } from '../N8nJsonLoader';

describe('N8nJsonLoader', () => {
	let mockExecuteFunctions: IExecuteFunctions;
	let mockTextSplitter: any;

	beforeEach(() => {
		mockExecuteFunctions = {
			getNodeParameter: vi.fn(),
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
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.', mockTextSplitter);
			expect(loader).toBeInstanceOf(N8nJsonLoader);
		});
	});

	describe('processItem', () => {
		it('should process JSON data with default text key', async () => {
			mockExecuteFunctions.getNodeParameter = vi.fn().mockReturnValue('text');
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.');
			const item: INodeExecutionData = {
				json: {
					text: 'This is the main content',
					title: 'Test Document',
					id: 123,
				},
			};

			const result = await loader.processItem(item, 0);

			expect(mockExecuteFunctions.getNodeParameter).toHaveBeenCalledWith(
				'options.textKey',
				0,
				'text',
			);
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				pageContent: 'This is the main content',
				metadata: {
					source: 'json',
					itemIndex: 0,
					text: 'This is the main content',
					title: 'Test Document',
					id: 123,
				},
			});
		});

		it('should process JSON data with custom text key', async () => {
			mockExecuteFunctions.getNodeParameter = vi.fn().mockReturnValue('content');
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.');
			const item: INodeExecutionData = {
				json: {
					content: 'Custom content field',
					description: 'Document description',
				},
			};

			const result = await loader.processItem(item, 1);

			expect(mockExecuteFunctions.getNodeParameter).toHaveBeenCalledWith(
				'options.textKey',
				1,
				'text',
			);
			expect(result[0].pageContent).toBe('Custom content field');
			expect(result[0].metadata).toMatchObject({
				source: 'json',
				itemIndex: 1,
				content: 'Custom content field',
				description: 'Document description',
			});
		});

		it('should fallback to JSON string when text key is missing', async () => {
			mockExecuteFunctions.getNodeParameter = vi.fn().mockReturnValue('nonexistent');
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.');
			const item: INodeExecutionData = {
				json: {
					title: 'Test',
					value: 42,
				},
			};

			const result = await loader.processItem(item, 0);

			expect(result[0].pageContent).toBe(JSON.stringify({ title: 'Test', value: 42 }));
			expect(result[0].metadata.source).toBe('json');
		});

		it('should handle non-string text values by converting to string', async () => {
			mockExecuteFunctions.getNodeParameter = vi.fn().mockReturnValue('number');
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.');
			const item: INodeExecutionData = {
				json: {
					number: 12345,
					text: 'Some text',
				},
			};

			const result = await loader.processItem(item, 0);

			expect(result[0].pageContent).toBe('12345');
		});

		it('should handle object values by stringifying them', async () => {
			mockExecuteFunctions.getNodeParameter = vi.fn().mockReturnValue('nested');
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.');
			const item: INodeExecutionData = {
				json: {
					nested: {
						property: 'value',
						array: [1, 2, 3],
					},
				},
			};

			const result = await loader.processItem(item, 0);

			expect(result[0].pageContent).toBe(
				JSON.stringify({
					property: 'value',
					array: [1, 2, 3],
				}),
			);
		});

		it('should handle empty JSON object', async () => {
			mockExecuteFunctions.getNodeParameter = vi.fn().mockReturnValue('text');
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.');
			const item: INodeExecutionData = {
				json: {},
			};

			const result = await loader.processItem(item, 0);

			expect(result[0].pageContent).toBe('{}');
			expect(result[0].metadata).toEqual({
				source: 'json',
				itemIndex: 0,
			});
		});

		it('should use text splitter when provided', async () => {
			mockExecuteFunctions.getNodeParameter = vi.fn().mockReturnValue('text');
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.', mockTextSplitter);
			const item: INodeExecutionData = {
				json: {
					text: 'Long text content that needs to be split into smaller chunks',
					category: 'documents',
				},
			};

			const result = await loader.processItem(item, 0);

			expect(mockTextSplitter.splitDocuments).toHaveBeenCalledWith([
				{
					pageContent: 'Long text content that needs to be split into smaller chunks',
					metadata: {
						source: 'json',
						itemIndex: 0,
						text: 'Long text content that needs to be split into smaller chunks',
						category: 'documents',
					},
				},
			]);
			expect(result).toHaveLength(2);
			expect(result[0].pageContent).toBe('Split chunk 1');
			expect(result[1].pageContent).toBe('Split chunk 2');
		});

		it('should handle text splitter errors', async () => {
			mockExecuteFunctions.getNodeParameter = vi.fn().mockReturnValue('text');
			const errorSplitter = {
				splitDocuments: vi.fn().mockRejectedValue(new Error('Splitting failed')),
			};
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.', errorSplitter);
			const item: INodeExecutionData = {
				json: {
					text: 'Content to split',
				},
			};

			await expect(loader.processItem(item, 0)).rejects.toThrow('Splitting failed');
		});

		it('should preserve all JSON properties in metadata', async () => {
			mockExecuteFunctions.getNodeParameter = vi.fn().mockReturnValue('content');
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.');
			const complexJson = {
				content: 'Main content',
				id: 'doc-123',
				timestamp: '2023-01-01',
				tags: ['tag1', 'tag2'],
				author: {
					name: 'John Doe',
					email: 'john@example.com',
				},
				metrics: {
					views: 100,
					likes: 25,
				},
			};
			const item: INodeExecutionData = {
				json: complexJson,
			};

			const result = await loader.processItem(item, 5);

			expect(result[0].metadata).toEqual({
				source: 'json',
				itemIndex: 5,
				...complexJson,
			});
		});

		it('should handle different item indices correctly', async () => {
			mockExecuteFunctions.getNodeParameter = vi
				.fn()
				.mockReturnValueOnce('text') // First call
				.mockReturnValueOnce('content'); // Second call

			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.');

			const item1: INodeExecutionData = { json: { text: 'First item' } };
			const item2: INodeExecutionData = { json: { content: 'Second item' } };

			const result1 = await loader.processItem(item1, 10);
			const result2 = await loader.processItem(item2, 20);

			expect(mockExecuteFunctions.getNodeParameter).toHaveBeenCalledWith(
				'options.textKey',
				10,
				'text',
			);
			expect(mockExecuteFunctions.getNodeParameter).toHaveBeenCalledWith(
				'options.textKey',
				20,
				'text',
			);

			expect(result1[0].metadata.itemIndex).toBe(10);
			expect(result2[0].metadata.itemIndex).toBe(20);
		});

		it('should handle null and undefined values in JSON', async () => {
			mockExecuteFunctions.getNodeParameter = vi.fn().mockReturnValue('nullable');
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.');
			const item: INodeExecutionData = {
				json: {
					nullable: null,
					undefined: undefined,
					text: 'fallback text',
				},
			};

			const result = await loader.processItem(item, 0);

			// Should fallback to JSON string since nullable field is null
			expect(result[0].pageContent).toBe(
				JSON.stringify({
					nullable: null,
					undefined: undefined,
					text: 'fallback text',
				}),
			);
		});

		it('should handle array values by stringifying them', async () => {
			mockExecuteFunctions.getNodeParameter = vi.fn().mockReturnValue('items');
			const loader = new N8nJsonLoader(mockExecuteFunctions, 'options.');
			const item: INodeExecutionData = {
				json: {
					items: ['item1', 'item2', 'item3'],
					title: 'List document',
				},
			};

			const result = await loader.processItem(item, 0);

			expect(result[0].pageContent).toBe(JSON.stringify(['item1', 'item2', 'item3']));
		});
	});
});
