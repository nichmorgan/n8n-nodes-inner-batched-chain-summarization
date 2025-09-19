import type { Document } from '@langchain/core/documents';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

export class N8nBinaryLoader {
	constructor(
		_ctx: IExecuteFunctions,
		_prefix: string,
		private binaryDataKey: string,
		private textSplitter?: any,
	) {}

	async processItem(item: INodeExecutionData, itemIndex: number): Promise<Document[]> {
		// Mock implementation - in real n8n this would load binary data
		// and convert it to documents
		const mockText = item.binary?.[this.binaryDataKey]?.data || 'Mock binary content';

		const document: Document = {
			pageContent: typeof mockText === 'string' ? mockText : 'Mock content',
			metadata: { source: 'binary', itemIndex },
		};

		if (this.textSplitter) {
			return await this.textSplitter.splitDocuments([document]);
		}

		return [document];
	}
}