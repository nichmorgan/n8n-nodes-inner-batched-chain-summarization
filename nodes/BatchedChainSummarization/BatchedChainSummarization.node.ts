import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeInputConfiguration,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';

import { processItem } from './processItem';
import { DEFAULT_PROMPT_TEMPLATE, REFINE_PROMPT_TEMPLATE } from './prompt';
import { DEFAULT_BATCH_SIZE, DEFAULT_DELAY_BETWEEN_BATCHES } from './constants';

function getInputs(parameters: IDataObject) {
	const chunkingMode = parameters?.chunkingMode;
	const operationMode = parameters?.operationMode;
	const inputs: INodeInputConfiguration[] = [
		{ displayName: '', type: NodeConnectionType.Main },
		{
			displayName: 'Model',
			maxConnections: 1,
			type: NodeConnectionType.AiLanguageModel,
			required: true,
		},
	];

	if (operationMode === 'documentLoader') {
		inputs.push({
			displayName: 'Document',
			type: NodeConnectionType.AiDocument,
			required: true,
			maxConnections: 1,
		});
	}

	if (chunkingMode === 'advanced') {
		inputs.push({
			displayName: 'Text Splitter',
			type: NodeConnectionType.AiTextSplitter,
			required: false,
			maxConnections: 1,
		});
	}

	return inputs;
}

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
		inputs: `={{ ((parameter) => { ${getInputs.toString()}; return getInputs(parameter) })($parameter) }}`,
		outputs: [NodeConnectionType.Main],
		credentials: [],
		properties: [
			{
				displayName: 'Data to Summarize',
				name: 'operationMode',
				noDataExpression: true,
				type: 'options',
				description: 'How to pass data into the summarization chain',
				default: 'nodeInputJson',
				options: [
					{
						name: 'Use Node Input (JSON)',
						value: 'nodeInputJson',
						description: 'Summarize the JSON data coming into this node from the previous one',
					},
					{
						name: 'Use Node Input (Binary)',
						value: 'nodeInputBinary',
						description: 'Summarize the binary data coming into this node from the previous one',
					},
					{
						name: 'Use Document Loader',
						value: 'documentLoader',
						description: 'Use a loader sub-node with more configuration options',
					},
				],
			},
			{
				displayName: 'Chunking Strategy',
				name: 'chunkingMode',
				noDataExpression: true,
				type: 'options',
				description: 'Chunk splitting strategy',
				default: 'simple',
				options: [
					{
						name: 'Simple (Define Below)',
						value: 'simple',
					},
					{
						name: 'Advanced',
						value: 'advanced',
						description: 'Use a splitter sub-node with more configuration options',
					},
				],
				displayOptions: {
					show: {
						'/operationMode': ['nodeInputJson', 'nodeInputBinary'],
					},
				},
			},
			{
				displayName: 'Characters Per Chunk',
				name: 'chunkSize',
				description:
					'Controls the max size (in terms of number of characters) of the final document chunk',
				type: 'number',
				default: 1000,
				displayOptions: {
					show: {
						'/chunkingMode': ['simple'],
					},
				},
			},
			{
				displayName: 'Chunk Overlap (Characters)',
				name: 'chunkOverlap',
				type: 'number',
				description: 'Specifies how much characters overlap there should be between chunks',
				default: 200,
				displayOptions: {
					show: {
						'/chunkingMode': ['simple'],
					},
				},
			},
			{
				displayName: 'Batch Size',
				name: 'batchSize',
				type: 'number',
				default: DEFAULT_BATCH_SIZE,
				description:
					'How many items to process in parallel. This is useful for rate limiting, but might impact the log output ordering.',
			},
			{
				displayName: 'Delay Between Batches',
				name: 'delayBetweenBatches',
				type: 'number',
				default: DEFAULT_DELAY_BETWEEN_BATCHES,
				description: 'Delay in milliseconds between batches. This is useful for rate limiting.',
			},
			{
				displayName: 'Output Size Limit',
				name: 'outputSize',
				type: 'number',
				default: 1000,
				description: 'Maximum size for the final summary output',
			},
			{
				displayName: 'Size Measurement',
				name: 'sizeMeasurement',
				type: 'options',
				default: 'characters',
				description: 'How to measure the output size limit',
				options: [
					{
						name: 'Characters',
						value: 'characters',
						description: 'Count by number of characters',
					},
					{
						name: 'Tokens',
						value: 'tokens',
						description: 'Count by number of tokens',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				default: {},
				placeholder: 'Add Option',
				options: [
					{
						displayName: 'Input Data Field Name',
						name: 'binaryDataKey',
						type: 'string',
						default: 'data',
						description:
							'The name of the field in the agent or chain’s input that contains the binary file to be processed',
						displayOptions: {
							show: {
								'/operationMode': ['nodeInputBinary'],
							},
						},
					},
					{
						displayName: 'Summarization Method and Prompts',
						name: 'summarizationMethodAndPrompts',
						type: 'fixedCollection',
						default: {
							values: {
								summarizationMethod: 'map_reduce',
								prompt: DEFAULT_PROMPT_TEMPLATE,
								combineMapPrompt: DEFAULT_PROMPT_TEMPLATE,
							},
						},
						placeholder: 'Add Option',
						typeOptions: {},
						options: [
							{
								name: 'values',
								displayName: 'Values',
								values: [
									{
										displayName: 'Summarization Method',
										name: 'summarizationMethod',
										type: 'options',
										description: 'The type of summarization to run',
										default: 'map_reduce',
										options: [
											{
												name: 'Map Reduce (Recommended)',
												value: 'map_reduce',
												description:
													'Summarize each document (or chunk) individually, then summarize those summaries',
											},
											{
												name: 'Refine',
												value: 'refine',
												description:
													'Summarize the first document (or chunk). Then update that summary based on the next document (or chunk), and repeat.',
											},
											{
												name: 'Stuff',
												value: 'stuff',
												description:
													'Pass all documents (or chunks) at once. Ideal for small datasets.',
											},
										],
									},
									{
										displayName: 'Individual Summary Prompt',
										name: 'combineMapPrompt',
										type: 'string',
										hint: 'The prompt to summarize an individual document (or chunk)',
										displayOptions: {
											hide: {
												'/options.summarizationMethodAndPrompts.values.summarizationMethod': [
													'stuff',
													'refine',
												],
											},
										},
										default: DEFAULT_PROMPT_TEMPLATE,
										typeOptions: {
											rows: 9,
										},
									},
									{
										displayName: 'Final Prompt to Combine',
										name: 'prompt',
										type: 'string',
										default: DEFAULT_PROMPT_TEMPLATE,
										hint: 'The prompt to combine individual summaries',
										displayOptions: {
											hide: {
												'/options.summarizationMethodAndPrompts.values.summarizationMethod': [
													'stuff',
													'refine',
												],
											},
										},
										typeOptions: {
											rows: 9,
										},
									},
									{
										displayName: 'Prompt',
										name: 'prompt',
										type: 'string',
										default: DEFAULT_PROMPT_TEMPLATE,
										displayOptions: {
											hide: {
												'/options.summarizationMethodAndPrompts.values.summarizationMethod': [
													'refine',
													'map_reduce',
												],
											},
										},
										typeOptions: {
											rows: 9,
										},
									},
									{
										displayName: 'Subsequent (Refine) Prompt',
										name: 'refinePrompt',
										type: 'string',
										displayOptions: {
											hide: {
												'/options.summarizationMethodAndPrompts.values.summarizationMethod': [
													'stuff',
													'map_reduce',
												],
											},
										},
										default: REFINE_PROMPT_TEMPLATE,
										hint: 'The prompt to refine the summary based on the next document (or chunk)',
										typeOptions: {
											rows: 9,
										},
									},
									{
										displayName: 'Initial Prompt',
										name: 'refineQuestionPrompt',
										type: 'string',
										displayOptions: {
											hide: {
												'/options.summarizationMethodAndPrompts.values.summarizationMethod': [
													'stuff',
													'map_reduce',
												],
											},
										},
										default: DEFAULT_PROMPT_TEMPLATE,
										hint: 'The prompt for the first document (or chunk)',
										typeOptions: {
											rows: 9,
										},
									},
								],
							},
						],
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions) {
		const operationMode = this.getNodeParameter('operationMode', 0, 'nodeInputJson') as
			| 'nodeInputJson'
			| 'nodeInputBinary'
			| 'documentLoader';
		const chunkingMode = this.getNodeParameter('chunkingMode', 0, 'simple') as
			| 'simple'
			| 'advanced';

		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const result = await processItem(
					this,
					itemIndex,
					items[itemIndex],
					operationMode,
					chunkingMode,
				);
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

		return [returnData];
	}
}
