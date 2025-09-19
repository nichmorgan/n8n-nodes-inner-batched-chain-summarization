import type {
	IExecuteFunctions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';

import { processItem } from './processItem';

export class BatchedChainSummarization implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Batched Summarization Chain',
		name: 'batchedChainSummarization',
		icon: 'fa:link',
		iconColor: 'black',
		group: ['transform'],
		version: 1,
		description: 'Transforms text into a concise summary with intelligent batching',
		defaults: {
			name: 'Batched Summarization Chain',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Chains', 'Root Nodes'],
			},
		},
		inputs: [
			{
				displayName: '',
				type: NodeConnectionType.AiLanguageModel,
				required: true,
			},
			{
				displayName: '',
				type: NodeConnectionType.AiDocument,
			},
			{
				displayName: '',
				type: NodeConnectionType.AiTextSplitter,
			},
		],
		outputs: [NodeConnectionType.AiChain],
		properties: [
			{
				displayName: 'Operation Mode',
				name: 'operationMode',
				type: 'options',
				noDataExpression: true,
				default: 'nodeInputJson',
				options: [
					{
						name: 'Take From Document Loader',
						value: 'documentLoader',
						description: 'Documents from a connected Document Loader',
					},
					{
						name: 'Take From Node Input (JSON)',
						value: 'nodeInputJson',
						description: 'Documents from node input (e.g. for multiple documents)',
					},
					{
						name: 'Take From Node Input (Binary)',
						value: 'nodeInputBinary',
						description: 'Documents from node input binary data',
					},
				],
			},
			{
				displayName: 'Chunking Mode',
				name: 'chunkingMode',
				type: 'options',
				noDataExpression: true,
				default: 'simple',
				displayOptions: {
					show: {
						operationMode: ['nodeInputJson', 'nodeInputBinary'],
					},
				},
				options: [
					{
						name: 'Simple',
						value: 'simple',
						description: 'Split text by characters, optionally by separators',
					},
					{
						name: 'Advanced',
						value: 'advanced',
						description: 'Use a text splitter connected to the input',
					},
					{
						name: 'None',
						value: 'none',
						description: 'Do not split text',
					},
				],
			},
			{
				displayName: 'Chunk Size',
				name: 'chunkSize',
				type: 'number',
				default: 1000,
				description:
					'Number of characters per chunk to split the document into. This is an approximation, actual chunks might be slightly larger or smaller.',
				displayOptions: {
					show: {
						chunkingMode: ['simple'],
					},
				},
			},
			{
				displayName: 'Chunk Overlap',
				name: 'chunkOverlap',
				type: 'number',
				default: 200,
				description:
					'Number of characters to overlap between consecutive chunks. This helps maintain context across chunks.',
				displayOptions: {
					show: {
						chunkingMode: ['simple'],
					},
				},
			},
			{
				displayName: 'Summarization Method',
				name: 'summarizationMethod',
				type: 'options',
				default: 'map_reduce',
				options: [
					{
						name: 'Map Reduce',
						value: 'map_reduce',
						description: 'Summarize each chunk individually, then combine the summaries',
					},
					{
						name: 'Stuff',
						value: 'stuff',
						description: 'Concatenate all chunks and summarize at once',
					},
					{
						name: 'Refine',
						value: 'refine',
						description: 'Iteratively refine the summary by processing chunks sequentially',
					},
				],
			},
			{
				displayName: 'Batch Size',
				name: 'batchSize',
				type: 'number',
				default: 5,
				description:
					'How many chunks to process in parallel. Higher values process faster but may hit rate limits.',
				displayOptions: {
					show: {
						chunkingMode: ['simple', 'advanced'],
					},
				},
			},
			{
				displayName: 'Delay Between Batches (Ms)',
				name: 'delayBetweenBatches',
				type: 'number',
				default: 0,
				description: 'Delay in milliseconds between batches. Useful for rate limiting.',
				displayOptions: {
					show: {
						chunkingMode: ['simple', 'advanced'],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				placeholder: 'Add Option',
				description: 'Additional options to configure',
				type: 'collection',
				default: {},
				options: [
					{
						displayName: 'Custom Prompts',
						name: 'customPrompts',
						type: 'fixedCollection',
						default: { values: {} },
						placeholder: 'Add Custom Prompts',
						options: [
							{
								displayName: 'Values',
								name: 'values',
								values: [
							{
								displayName: 'Final Combination Prompt',
								name: 'combinePrompt',
								type: 'string',
								default: 'Write a concise summary of the following text:\\n\\n{text}\\n\\nCONCISE SUMMARY:',
								description: 'Prompt to combine the individual summaries into a final summary. Use {text} to reference the combined text.',
							},
							{
								displayName: 'Individual Summary Prompt',
								name: 'combineMapPrompt',
								type: 'string',
								default: 'Write a concise summary of the following:\\n\\n{text}\\n\\nCONCISE SUMMARY:',
								description: 'Prompt to summarize each individual chunk. Use {text} to reference the chunk content.',
							},
							{
								displayName: 'Initial Question Prompt',
								name: 'refineQuestionPrompt',
								type: 'string',
								default: 'Write a concise summary of the following:\\n\\n{text}\\n\\nCONCISE SUMMARY:',
								description: 'Prompt to generate the initial summary from the first chunk. Use {text} to reference the chunk content.',
							},
							{
								displayName: 'Refinement Prompt',
								name: 'refinePrompt',
								type: 'string',
								default: 'Your job is to produce a final summary.\\nWe have provided an existing summary up to a certain point:	{existing_answer}\\nWe have the opportunity to refine the existing summary (only if needed) with some more context below.\\n------------\\n{text}\\n------------\\nGiven the new context, refine the original summary. If the context isn\'t useful, return the original summary.',
								description: 'Prompt to refine the existing summary with new information. Use {existing_answer} for the current summary and {text} for the new chunk.',
							},
							{
								displayName: 'Stuff Prompt',
								name: 'stuffPrompt',
								type: 'string',
								default: 'Write a concise summary of the following:\\n\\n{text}\\n\\nCONCISE SUMMARY:',
								description: 'Prompt for stuff method. Use {text} to reference the content.',
							},
						],
							},
						],
					},
					{
						displayName: 'Document Property Name',
						name: 'textKey',
						type: 'string',
						default: 'text',
						description:
							'The name of the property which contains the text to summarize',
						displayOptions: {
							show: {
								'/operationMode': ['nodeInputJson'],
							},
						},
					},
					{
						displayName: 'Binary Data Key',
						name: 'binaryDataKey',
						type: 'string',
						default: 'data',
						description: 'The key to get the binary data from',
						displayOptions: {
							show: {
								'/operationMode': ['nodeInputBinary'],
							},
						},
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions) {
		const operationMode = this.getNodeParameter('operationMode', 0, 'nodeInputJson') as string;
		const chunkingMode = this.getNodeParameter('chunkingMode', 0, 'simple') as
			| 'simple'
			| 'advanced'
			| 'none';

		const items = this.getInputData();
		const returnData: any[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const result = await processItem(this, itemIndex, items[itemIndex], operationMode, chunkingMode);
				if (result) {
					returnData.push({ json: result });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: error.message } });
					continue;
				}
				throw error;
			}
		}

		return returnData;
	}
}