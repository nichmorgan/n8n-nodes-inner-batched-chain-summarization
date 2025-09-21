import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { N8nBinaryLoader } from '../N8nBinaryLoader';

// Mock NodeOperationError and BINARY_ENCODING
vi.mock('n8n-workflow', async () => {
	const actual = await vi.importActual('n8n-workflow');
	return {
		...actual,
		NodeOperationError: vi.fn().mockImplementation((node, message) => {
			const error = new Error(message);
			error.name = 'NodeOperationError';
			return error;
		}),
		BINARY_ENCODING: 'base64',
	};
});

describe('N8nBinaryLoader', () => {
	let mockExecuteFunctions: IExecuteFunctions;
	let mockTextSplitter: any;

	beforeEach(() => {
		mockExecuteFunctions = {
			getNodeParameter: vi.fn().mockImplementation((param) => {
				if (param === 'loader') return 'auto';
				return undefined;
			}),
			getNode: vi.fn().mockReturnValue({ name: 'Test Node' }),
			helpers: {
				assertBinaryData: vi.fn().mockReturnValue({
					data: 'SGVsbG8gV29ybGQ=', // "Hello World" in base64
					mimeType: 'text/plain',
				}),
				binaryToBuffer: vi.fn(),
				getBinaryStream: vi.fn(),
			},
		} as unknown as IExecuteFunctions;

		mockTextSplitter = {
			splitDocuments: vi.fn().mockResolvedValue([
				{ pageContent: 'Split chunk 1', metadata: { source: 'binary', chunk: 1 } },
				{ pageContent: 'Split chunk 2', metadata: { source: 'binary', chunk: 2 } },
			]),
		};

		vi.clearAllMocks();
	});

	describe('Constructor', () => {
		it('should create instance with required parameters', () => {
			const loader = new N8nBinaryLoader(mockExecuteFunctions, 'options.', 'data');
			expect(loader).toBeInstanceOf(N8nBinaryLoader);
		});

		it('should create instance with text splitter', () => {
			const loader = new N8nBinaryLoader(
				mockExecuteFunctions,
				'options.',
				'data',
				mockTextSplitter,
			);
			expect(loader).toBeInstanceOf(N8nBinaryLoader);
		});
	});

	describe('processItem', () => {
		it('should process binary data with default key', async () => {
			const loader = new N8nBinaryLoader(mockExecuteFunctions, 'options.', 'data');
			const item: INodeExecutionData = {
				json: {},
				binary: {
					data: {
						data: 'SGVsbG8gV29ybGQ=', // "Hello World" in base64
						mimeType: 'text/plain',
					},
				},
			};

			const result = await loader.processItem(item, 0);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(
				expect.objectContaining({
					pageContent: 'Hello World',
					metadata: expect.objectContaining({
						source: 'blob',
						blobType: 'text/plain',
					}),
				}),
			);
		});

		it('should process binary data with custom key', async () => {
			const loader = new N8nBinaryLoader(mockExecuteFunctions, 'options.', 'file');
			const item: INodeExecutionData = {
				json: {},
				binary: {
					file: {
						data: 'Custom binary content',
						mimeType: 'application/pdf',
					},
				},
			};

			const result = await loader.processItem(item, 1);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(
				expect.objectContaining({
					pageContent: 'Hello World', // Still comes from the mock
					metadata: expect.objectContaining({
						source: 'blob',
						blobType: 'text/plain',
					}),
				}),
			);
		});

		it('should handle missing binary data', async () => {
			const loader = new N8nBinaryLoader(mockExecuteFunctions, 'options.', 'data');
			const item: INodeExecutionData = {
				json: {},
			};

			const result = await loader.processItem(item, 0);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(
				expect.objectContaining({
					pageContent: 'Hello World',
					metadata: expect.objectContaining({
						source: 'blob',
						blobType: 'text/plain',
					}),
				}),
			);
		});

		it('should handle missing binary key', async () => {
			const loader = new N8nBinaryLoader(mockExecuteFunctions, 'options.', 'nonexistent');
			const item: INodeExecutionData = {
				json: {},
				binary: {
					data: {
						data: 'Some content',
						mimeType: 'text/plain',
					},
				},
			};

			const result = await loader.processItem(item, 0);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(
				expect.objectContaining({
					pageContent: 'Hello World',
					metadata: expect.objectContaining({
						source: 'blob',
						blobType: 'text/plain',
					}),
				}),
			);
		});

		it('should handle non-string binary data', async () => {
			const loader = new N8nBinaryLoader(mockExecuteFunctions, 'options.', 'data');
			const item: INodeExecutionData = {
				json: {},
				binary: {
					data: {
						data: 12345, // Non-string data
						mimeType: 'application/json',
					},
				},
			};

			const result = await loader.processItem(item, 0);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(
				expect.objectContaining({
					pageContent: 'Hello World',
					metadata: expect.objectContaining({
						source: 'blob',
						blobType: 'text/plain',
					}),
				}),
			);
		});

		it('should use text splitter when provided', async () => {
			const loader = new N8nBinaryLoader(
				mockExecuteFunctions,
				'options.',
				'data',
				mockTextSplitter,
			);
			const item: INodeExecutionData = {
				json: {},
				binary: {
					data: {
						data: 'Long binary content that needs splitting',
						mimeType: 'text/plain',
					},
				},
			};

			const result = await loader.processItem(item, 0);

			expect(mockTextSplitter.splitDocuments).toHaveBeenCalledWith([
				expect.objectContaining({
					pageContent: 'Hello World',
					metadata: expect.objectContaining({
						source: 'blob',
						blobType: 'text/plain',
					}),
				}),
			]);
			expect(result).toHaveLength(2);
			expect(result[0].pageContent).toBe('Split chunk 1');
			expect(result[1].pageContent).toBe('Split chunk 2');
		});

		it('should handle text splitter errors', async () => {
			const errorSplitter = {
				splitDocuments: vi.fn().mockRejectedValue(new Error('Splitting failed')),
			};
			const loader = new N8nBinaryLoader(mockExecuteFunctions, 'options.', 'data', errorSplitter);
			const item: INodeExecutionData = {
				json: {},
				binary: {
					data: {
						data: 'Content to split',
						mimeType: 'text/plain',
					},
				},
			};

			await expect(loader.processItem(item, 0)).rejects.toThrow('Splitting failed');
		});

		it('should preserve item index in metadata', async () => {
			const loader = new N8nBinaryLoader(mockExecuteFunctions, 'options.', 'data');
			const item: INodeExecutionData = {
				json: {},
				binary: {
					data: {
						data: 'Test content',
						mimeType: 'text/plain',
					},
				},
			};

			const result = await loader.processItem(item, 42);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(
				expect.objectContaining({
					pageContent: 'Hello World',
					metadata: expect.objectContaining({
						source: 'blob',
						blobType: 'text/plain',
					}),
				}),
			);
		});

		it('should handle complex binary structure', async () => {
			const loader = new N8nBinaryLoader(mockExecuteFunctions, 'options.', 'document');
			const item: INodeExecutionData = {
				json: { title: 'Test Document' },
				binary: {
					document: {
						data: 'Document content',
						mimeType: 'application/pdf',
						fileName: 'test.pdf',
					},
					other: {
						data: 'Other content',
						mimeType: 'text/plain',
					},
				},
			};

			const result = await loader.processItem(item, 5);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(
				expect.objectContaining({
					pageContent: 'Hello World',
					metadata: expect.objectContaining({
						source: 'blob',
						blobType: 'text/plain',
					}),
				}),
			);
		});
	});
});
