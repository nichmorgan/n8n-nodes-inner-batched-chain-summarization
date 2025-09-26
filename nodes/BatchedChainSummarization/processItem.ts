import type { Document } from '@langchain/core/documents';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import type { ChainValues } from '@langchain/core/utils/types';
import { RecursiveCharacterTextSplitter, type TextSplitter } from '@langchain/textsplitters';
import { type IExecuteFunctions, type INodeExecutionData, NodeConnectionType } from 'n8n-workflow';

import { N8nBinaryLoader } from '../utils/N8nBinaryLoader';
import { N8nJsonLoader } from '../utils/N8nJsonLoader';
import { getTracingConfig } from '../utils/tracing';

import { BatchedSummarizationChain } from './batchedSummarizationChain';
import { getChainPromptsArgs } from './helpers';
import { DEFAULT_BATCH_SIZE, DEFAULT_DELAY_BETWEEN_BATCHES } from './constants';

export async function processItem(
	ctx: IExecuteFunctions,
	itemIndex: number,
	item: INodeExecutionData,
	operationMode: string,
	chunkingMode: 'simple' | 'advanced' | 'none',
): Promise<ChainValues | undefined> {
	const model = (await ctx.getInputConnectionData(
		NodeConnectionType.AiLanguageModel,
		0,
	)) as BaseLanguageModel;

	const summarizationMethod = ctx.getNodeParameter(
		'summarizationMethod',
		itemIndex,
		'map_reduce',
	) as 'map_reduce' | 'stuff' | 'refine';

	// Get custom prompts if provided
	const customPrompts = ctx.getNodeParameter('options.customPrompts.values', itemIndex, {}) as {
		combineMapPrompt?: string;
		combinePrompt?: string;
		stuffPrompt?: string;
		refineQuestionPrompt?: string;
		refinePrompt?: string;
	};

	// Get batching parameters using shared constants
	const batchSize = ctx.getNodeParameter('batchSize', itemIndex, DEFAULT_BATCH_SIZE) as number;
	const delayBetweenBatches = ctx.getNodeParameter(
		'delayBetweenBatches',
		itemIndex,
		DEFAULT_DELAY_BETWEEN_BATCHES,
	) as number;

	// Get output size parameters
	const outputSize = ctx.getNodeParameter('outputSize', itemIndex, undefined) as number | undefined;
	const sizeMeasurement = ctx.getNodeParameter('sizeMeasurement', itemIndex, 'characters') as 'characters' | 'tokens';

	const chainArgs = getChainPromptsArgs(summarizationMethod, customPrompts);
	const chain = new BatchedSummarizationChain({
		model,
		type: summarizationMethod,
		batchSize,
		delayBetweenBatches,
		outputSize,
		sizeMeasurement,
		...chainArgs,
	});

	let processedDocuments: Document[];

	// Use dedicated document loader input to load documents
	if (operationMode === 'documentLoader') {
		const documentInput = (await ctx.getInputConnectionData(NodeConnectionType.AiDocument, 0)) as
			| N8nJsonLoader
			| Array<Document<Record<string, unknown>>>;

		const isN8nLoader =
			documentInput instanceof N8nJsonLoader ||
			documentInput instanceof N8nBinaryLoader ||
			(typeof documentInput === 'object' &&
				'processItem' in documentInput &&
				typeof documentInput.processItem === 'function');

		processedDocuments =
			isN8nLoader && 'processItem' in documentInput
				? await documentInput.processItem(item, itemIndex)
				: (documentInput as Document[]);

		return await chain.withConfig(getTracingConfig(ctx)).invoke({
			input_documents: processedDocuments,
		});
	} else if (['nodeInputJson', 'nodeInputBinary'].indexOf(operationMode) !== -1) {
		// Take the input and use binary or json loader
		let textSplitter: TextSplitter | undefined;

		switch (chunkingMode) {
			// In simple mode we use recursive character splitter with default settings
			case 'simple':
				const chunkSize = ctx.getNodeParameter('chunkSize', itemIndex, 1000) as number;
				const chunkOverlap = ctx.getNodeParameter('chunkOverlap', itemIndex, 200) as number;

				textSplitter = new RecursiveCharacterTextSplitter({ chunkOverlap, chunkSize });
				break;

			// In advanced mode user can connect text splitter node so we just retrieve it
			case 'advanced':
				textSplitter = (await ctx.getInputConnectionData(NodeConnectionType.AiTextSplitter, 0)) as
					| TextSplitter
					| undefined;
				break;
			default:
				break;
		}

		let processor: N8nJsonLoader | N8nBinaryLoader;
		if (operationMode === 'nodeInputBinary') {
			const binaryDataKey = ctx.getNodeParameter(
				'options.binaryDataKey',
				itemIndex,
				'data',
			) as string;
			processor = new N8nBinaryLoader(ctx, 'options.', binaryDataKey, textSplitter);
		} else {
			processor = new N8nJsonLoader(ctx, 'options.', textSplitter);
		}

		const processedItem = await processor.processItem(item, itemIndex);
		return await chain.invoke(
			{
				input_documents: processedItem,
			},
			{ signal: ctx.getExecutionCancelSignal() },
		);
	}
	return undefined;
}
