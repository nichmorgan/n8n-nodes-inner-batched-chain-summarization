import type { Document } from '@langchain/core/documents';
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

export class N8nJsonLoader {
	constructor(
		private ctx: IExecuteFunctions,
		private prefix: string,
		private textSplitter?: any,
	) {}

	async processItem(item: INodeExecutionData, itemIndex: number): Promise<Document[]> {
		// Mock implementation - in real n8n this would extract text from JSON data
		const textKey = this.ctx.getNodeParameter(`${this.prefix}textKey`, itemIndex, 'text') as string;
		const text = item.json[textKey] || JSON.stringify(item.json);

		const document: Document = {
			pageContent: typeof text === 'string' ? text : JSON.stringify(text),
			metadata: { source: 'json', itemIndex, ...item.json },
		};

		if (this.textSplitter) {
			return await this.textSplitter.splitDocuments([document]);
		}

		return [document];
	}
}
