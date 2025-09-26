import type { Document } from '@langchain/core/documents';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import type { ChainValues } from '@langchain/core/utils/types';
import { PromptTemplate, type BasePromptTemplate } from '@langchain/core/prompts';
import { sleep } from 'n8n-workflow';
import { encodingForModel } from 'js-tiktoken';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { TokenCounterTool, CharacterCounterTool, ResponseValidatorTool } from './countingTools';

import {
	DEFAULT_BATCH_SIZE,
	DEFAULT_DELAY_BETWEEN_BATCHES,
	MIN_BATCH_SIZE,
	MIN_DELAY,
	MAX_BATCH_SIZE,
	MAX_DELAY,
} from './constants';

export type SummarizationType = 'map_reduce' | 'stuff' | 'refine';
export type SizeMeasurement = 'characters' | 'tokens';

interface BatchedSummarizationChainParams {
	model: BaseLanguageModel;
	type: SummarizationType;
	batchSize?: number;
	delayBetweenBatches?: number;
	outputSize?: number;
	sizeMeasurement?: SizeMeasurement;
	useAgent?: boolean; // NEW: Optional flag to use agent with counting tools
	combineMapPrompt?: BasePromptTemplate;
	combinePrompt?: BasePromptTemplate;
	prompt?: BasePromptTemplate;
	refinePrompt?: BasePromptTemplate;
	questionPrompt?: BasePromptTemplate;
	verbose?: boolean;
}

export class BatchedSummarizationChain {
	private model: BaseLanguageModel;
	private type: SummarizationType;
	private batchSize: number;
	private delayBetweenBatches: number;
	private outputSize?: number;
	private sizeMeasurement: SizeMeasurement;
	private useAgent: boolean;
	private combineMapPrompt?: BasePromptTemplate;
	private combinePrompt?: BasePromptTemplate;
	private prompt?: BasePromptTemplate;
	private refinePrompt?: BasePromptTemplate;
	private questionPrompt?: BasePromptTemplate;

	constructor(params: BatchedSummarizationChainParams) {
		this.model = params.model;
		this.type = params.type;

		// Validate and set batchSize with proper bounds
		const rawBatchSize = params.batchSize ?? DEFAULT_BATCH_SIZE;
		this.batchSize = Math.max(MIN_BATCH_SIZE, Math.min(MAX_BATCH_SIZE, Math.floor(rawBatchSize)));

		// Validate and set delayBetweenBatches with proper bounds
		const rawDelay = params.delayBetweenBatches ?? DEFAULT_DELAY_BETWEEN_BATCHES;
		this.delayBetweenBatches = Math.max(MIN_DELAY, Math.min(MAX_DELAY, Math.floor(rawDelay)));

		// Set output size and measurement type
		this.outputSize = params.outputSize;
		this.sizeMeasurement = params.sizeMeasurement ?? 'characters';
		this.useAgent = params.useAgent ?? false;

		this.combineMapPrompt = params.combineMapPrompt;
		this.combinePrompt = params.combinePrompt;
		this.prompt = params.prompt;
		this.refinePrompt = params.refinePrompt;
		this.questionPrompt = params.questionPrompt;
	}

	private measureTextSize(text: string): number {
		if (this.sizeMeasurement === 'tokens') {
			try {
				// Use gpt-3.5-turbo encoding as default
				const encoding = encodingForModel('gpt-3.5-turbo');
				const tokens = encoding.encode(text);
				// Note: js-tiktoken doesn't require manual cleanup
				return tokens.length;
			} catch {
				// Fallback to approximate token count if tiktoken fails
				return Math.ceil(text.length / 4);
			}
		} else {
			return text.length;
		}
	}

	private async createSizeConstrainedAgentExecutor(): Promise<AgentExecutor | null> {
		if (!this.outputSize) {
			return null;
		}

		const sizeUnit = this.sizeMeasurement === 'tokens' ? 'tokens' : 'characters';

		// Create tools that the agent can use
		const tools = [
			this.sizeMeasurement === 'tokens' ? new TokenCounterTool() : new CharacterCounterTool(),
			new ResponseValidatorTool(this.outputSize, this.sizeMeasurement)
		];

		// Create agent prompt with tool instructions
		const agentPrompt = ChatPromptTemplate.fromMessages([
			["system", `You are a text summarization assistant with access to counting tools.

CRITICAL SIZE LIMIT: Your response MUST NOT exceed ${this.outputSize} ${sizeUnit}.

AVAILABLE TOOLS:
- ${this.sizeMeasurement === 'tokens' ? 'token_counter' : 'character_counter'}: Count ${sizeUnit} in text
- response_validator: Check if text meets size requirements

INSTRUCTIONS:
1. Write your summary
2. BEFORE finalizing, use the counting tool to check your response size
3. If it exceeds ${this.outputSize} ${sizeUnit}, revise and shorten
4. Use response_validator to confirm it meets requirements
5. Only provide the final summary that fits within the limit

Remember: Use your tools to verify size compliance!`],
			["human", "{input}"],
			["placeholder", "{agent_scratchpad}"]
		]);

		// Create the agent
		const agent = await createToolCallingAgent({
			llm: this.model,
			tools,
			prompt: agentPrompt
		});

		// Create agent executor
		return new AgentExecutor({
			agent,
			tools,
			verbose: false
		});
	}

	private createSizeConstrainedPrompt(baseTemplate: string): string {
		if (!this.outputSize) {
			return baseTemplate;
		}

		const sizeUnit = this.sizeMeasurement === 'tokens' ? 'tokens' : 'characters';

		const systemGuidelines = `CRITICAL SIZE LIMIT: Your response MUST NOT exceed ${this.outputSize} ${sizeUnit}.

SIZE REQUIREMENTS:
- Maximum allowed: ${this.outputSize} ${sizeUnit} (STRICT LIMIT)
- This limit will be automatically validated after generation
- Responses exceeding the limit will trigger retry with stricter constraints
- Prioritize staying within bounds over including additional details

WRITING STRATEGY:
- Plan your response to fit within ${this.outputSize} ${sizeUnit}
- Use concise, direct language
- Focus on the most essential information first
- If necessary, use bullet points, abbreviations, or shorter sentences
- End responses naturally, even if under the limit

QUALITY EXPECTATIONS:
- Maintain coherence and clarity within the size constraints
- Avoid unnecessary words or redundant phrases
- Use precise, impactful language

---

TASK:
${baseTemplate}

---

STRICT REMINDER: Keep your response ≤ ${this.outputSize} ${sizeUnit}. Exceeding this limit will require automatic retry.`;

		return systemGuidelines;
	}

	private async invokeSummarizationWithAgent(inputText: string, taskDescription: string): Promise<string> {
		if (!this.outputSize || !this.useAgent) {
			// Fallback to regular model invocation
			const prompt = new PromptTemplate({
				template: `${taskDescription}\n\n{text}`,
				inputVariables: ['text'],
			});
			const formattedPrompt = await prompt.format({ text: inputText });
			const result = await this.model.invoke(formattedPrompt);
			return typeof result === 'string' ? result : result.content;
		}

		// Use agent with counting tools
		const agentExecutor = await this.createSizeConstrainedAgentExecutor();
		if (!agentExecutor) {
			// Fallback if agent creation fails
			const prompt = this.createSizeConstrainedPrompt(taskDescription);
			const formattedPrompt = new PromptTemplate({
				template: prompt + '\n\n{text}',
				inputVariables: ['text'],
			});
			const promptText = await formattedPrompt.format({ text: inputText });
			const result = await this.model.invoke(promptText);
			return typeof result === 'string' ? result : result.content;
		}

		// Execute with agent
		const agentInput = `${taskDescription}\n\nText to summarize:\n${inputText}`;
		const agentResult = await agentExecutor.invoke({ input: agentInput });
		return agentResult.output || '';
	}

	private validateOutputSize(text: string): {
		isValid: boolean;
		actualSize: number;
		maxSize?: number;
		unit: string;
		warning?: string;
	} {
		if (!this.outputSize) {
			return {
				isValid: true,
				actualSize: this.measureTextSize(text),
				unit: this.sizeMeasurement
			};
		}

		const actualSize = this.measureTextSize(text);
		const isValid = actualSize <= this.outputSize;
		const unit = this.sizeMeasurement;

		const result = {
			isValid,
			actualSize,
			maxSize: this.outputSize,
			unit,
		};

		if (!isValid) {
			return {
				...result,
				warning: `Output size (${actualSize} ${unit}) exceeds limit (${this.outputSize} ${unit}). Consider increasing the limit or using shorter prompts.`
			};
		}

		return result;
	}

	private async retryWithShorterPrompt(
		text: string,
		promptTemplate: BasePromptTemplate,
		attempt: number = 1
	): Promise<string> {
		const maxAttempts = 3;
		const sizeUnit = this.sizeMeasurement === 'tokens' ? 'tokens' : 'characters';

		// Create increasingly strict prompts with system-like instructions
		const strictPrompts = [
			`SIZE VIOLATION - RETRY ATTEMPT ${attempt}

ALERT: Previous response exceeded ${this.outputSize} ${sizeUnit} limit. Your response was automatically rejected.

STRICTER REQUIREMENTS:
- Maximum: ${this.outputSize} ${sizeUnit} (ABSOLUTE LIMIT)
- Be extremely concise and direct
- Eliminate all unnecessary words
- Use shorter sentences and phrases
- Focus only on core information

TASK: Summarize the following text within the strict size limit:

{text}

CONCISE SUMMARY (≤${this.outputSize} ${sizeUnit}):`,

			`FINAL WARNING - RETRY ATTEMPT ${attempt}

SIZE LIMIT STILL EXCEEDED. This is attempt ${attempt}/${maxAttempts}.

EMERGENCY CONSTRAINTS:
- ${this.outputSize} ${sizeUnit} MAXIMUM (NO EXCEPTIONS)
- Use bullet points or fragments if needed
- Abbreviate words where possible
- Remove all filler words (the, and, etc.)
- Use telegraphic style if necessary

TEXT TO SUMMARIZE:
{text}

ULTRA-BRIEF SUMMARY (≤${this.outputSize} ${sizeUnit}):`,

			`LAST CHANCE - ATTEMPT ${attempt}/${maxAttempts}

CRITICAL SIZE ENFORCEMENT - FINAL ATTEMPT

EXTREME CONSTRAINTS:
- Absolute maximum: ${this.outputSize} ${sizeUnit}
- Use only essential keywords
- Single words or short phrases only
- No complete sentences if necessary
- Telegraphic/note-taking style acceptable

INPUT: {text}

KEYWORDS ONLY (≤${this.outputSize} ${sizeUnit}):`
		];

		const retryPrompt = new PromptTemplate({
			template: strictPrompts[Math.min(attempt - 1, strictPrompts.length - 1)],
			inputVariables: ['text'],
		});

		const formattedPrompt = await retryPrompt.format({ text });
		const result = await this.model.invoke(formattedPrompt);
		const resultText = typeof result === 'string' ? result : result.content;

		// Check if this attempt fits the size limit
		const validation = this.validateOutputSize(resultText);

		if (validation.isValid || attempt >= maxAttempts) {
			return resultText;
		}

		// Retry with next attempt
		return this.retryWithShorterPrompt(text, promptTemplate, attempt + 1);
	}

	async invoke(input: { input_documents: Document[] }, config?: any): Promise<ChainValues> {
		const { input_documents: documents } = input;

		switch (this.type) {
			case 'map_reduce':
				return await this.mapReduce(documents);
			case 'stuff':
				return await this.stuff(documents);
			case 'refine':
				return await this.refine(documents);
			default:
				throw new Error(`Unknown summarization type: ${this.type}`);
		}
	}

	private async mapReduce(documents: Document[]): Promise<ChainValues> {
		// Map phase: summarize each document with batching
		const summaries = await this.processDocumentsInBatches(documents, this.combineMapPrompt);

		// Reduce phase: combine summaries
		const summaryDocs = summaries.map((summary, index) => ({
			pageContent: summary,
			metadata: { index },
		}));

		const combinedText = summaryDocs.map((doc) => doc.pageContent).join('\\n\\n');

		// Use agent for the final combine step when both outputSize and useAgent are set
		let outputText: string;

		if (this.outputSize && this.useAgent) {
			try {
				const taskDescription = 'Write a concise summary of the following summaries:';
				outputText = await this.invokeSummarizationWithAgent(combinedText, taskDescription);
			} catch (error) {
				// Fallback to traditional approach
				const combinePrompt = this.combinePrompt ?? this.getDefaultCombinePrompt();
				const finalSummary = await combinePrompt.format({ text: combinedText });
				const result = await this.model.invoke(finalSummary);
				outputText = typeof result === 'string' ? result : result.content;
			}
		} else {
			// Traditional approach (default behavior)
			const combinePrompt = this.combinePrompt ?? this.getDefaultCombinePrompt();
			const finalSummary = await combinePrompt.format({ text: combinedText });
			const result = await this.model.invoke(finalSummary);
			outputText = typeof result === 'string' ? result : result.content;
		}

		// Validate output size and retry if needed
		let sizeValidation = this.validateOutputSize(outputText);
		let retryCount = 0;

		if (!sizeValidation.isValid && this.outputSize) {
			const combinePrompt = this.combinePrompt ?? this.getDefaultCombinePrompt();
			outputText = await this.retryWithShorterPrompt(combinedText, combinePrompt);
			sizeValidation = this.validateOutputSize(outputText);
			retryCount = 1;
		}

		return {
			output: {
				text: outputText,
				sizeValidation: {
					...sizeValidation,
					retryCount
				}
			}
		};
	}

	private async stuff(documents: Document[]): Promise<ChainValues> {
		const combinedText = documents.map((doc) => doc.pageContent).join('\\n\\n');

		// Use agent-based approach when both outputSize and useAgent are set
		let outputText: string;
		let retryCount = 0;

		if (this.outputSize && this.useAgent) {
			try {
				const taskDescription = 'Write a concise summary of the following text:';
				outputText = await this.invokeSummarizationWithAgent(combinedText, taskDescription);
			} catch (error) {
				// Fallback to traditional approach on error
				const prompt = this.prompt ?? this.getDefaultPrompt();
				const formattedPrompt = await prompt.format({ text: combinedText });
				const result = await this.model.invoke(formattedPrompt);
				outputText = typeof result === 'string' ? result : result.content;
			}
		} else {
			// Traditional approach (default behavior)
			const prompt = this.prompt ?? this.getDefaultPrompt();
			const formattedPrompt = await prompt.format({ text: combinedText });
			const result = await this.model.invoke(formattedPrompt);
			outputText = typeof result === 'string' ? result : result.content;
		}

		// Validate output size and retry if needed (as backup)
		let sizeValidation = this.validateOutputSize(outputText);

		if (!sizeValidation.isValid && this.outputSize) {
			// If agent failed to meet size requirements, use traditional retry
			const prompt = this.prompt ?? this.getDefaultPrompt();
			outputText = await this.retryWithShorterPrompt(combinedText, prompt);
			sizeValidation = this.validateOutputSize(outputText);
			retryCount = 1;
		}

		return {
			output: {
				text: outputText,
				sizeValidation: {
					...sizeValidation,
					retryCount
				}
			}
		};
	}

	private async refine(documents: Document[]): Promise<ChainValues> {
		if (documents.length === 0) {
			const sizeValidation = this.validateOutputSize('');
			return {
				output: {
					text: '',
					sizeValidation: {
						...sizeValidation,
						retryCount: 0
					}
				}
			};
		}

		const questionPrompt = this.questionPrompt ?? this.getDefaultPrompt();
		const refinePrompt = this.refinePrompt ?? this.getDefaultRefinePrompt();

		// Initial summary from first document
		const firstDoc = documents[0];
		const initialPrompt = await questionPrompt.format({ text: firstDoc.pageContent });
		const currentSummary = await this.model.invoke(initialPrompt);
		let currentSummaryText =
			typeof currentSummary === 'string' ? currentSummary : currentSummary.content;

		// Process remaining documents with batching
		if (documents.length > 1) {
			const remainingDocs = documents.slice(1);

			for (let i = 0; i < remainingDocs.length; i += this.batchSize) {
				const batch = remainingDocs.slice(i, i + this.batchSize);

				for (const doc of batch) {
					const refineFormatted = await refinePrompt.format({
						existing_answer: currentSummaryText,
						text: doc.pageContent,
					});

					const refined = await this.model.invoke(refineFormatted);
					currentSummaryText = typeof refined === 'string' ? refined : refined.content;
				}

				// Add delay between batches if not the last batch
				if (i + this.batchSize < remainingDocs.length && this.delayBetweenBatches > 0) {
					await sleep(this.delayBetweenBatches);
				}
			}
		}

		// Validate output size and retry if needed
		let sizeValidation = this.validateOutputSize(currentSummaryText);
		let retryCount = 0;

		if (!sizeValidation.isValid && this.outputSize) {
			// For refine, we retry with the final summary text
			currentSummaryText = await this.retryWithShorterPrompt(currentSummaryText, refinePrompt);
			sizeValidation = this.validateOutputSize(currentSummaryText);
			retryCount = 1;
		}

		return {
			output: {
				text: currentSummaryText,
				sizeValidation: {
					...sizeValidation,
					retryCount
				}
			}
		};
	}

	private async processDocumentsInBatches(
		documents: Document[],
		promptTemplate?: BasePromptTemplate,
	): Promise<string[]> {
		const prompt = promptTemplate ?? this.getDefaultPrompt();
		const summaries: string[] = [];

		for (let i = 0; i < documents.length; i += this.batchSize) {
			const batch = documents.slice(i, i + this.batchSize);

			const batchPromises = batch.map(async (doc) => {
				const formatted = await prompt.format({ text: doc.pageContent });
				const result = await this.model.invoke(formatted);
				return typeof result === 'string' ? result : result.content;
			});

			const batchResults = await Promise.all(batchPromises);
			summaries.push(...batchResults);

			// Add delay between batches if not the last batch
			if (i + this.batchSize < documents.length && this.delayBetweenBatches > 0) {
				await sleep(this.delayBetweenBatches);
			}
		}

		return summaries;
	}

	private getDefaultPrompt(): PromptTemplate {
		const template = this.createSizeConstrainedPrompt(
			'Write a concise summary of the following:\\n\\n{text}\\n\\nCONCISE SUMMARY:'
		);
		return new PromptTemplate({
			template,
			inputVariables: ['text'],
		});
	}

	private getDefaultCombinePrompt(): PromptTemplate {
		const template = this.createSizeConstrainedPrompt(
			'Write a concise summary of the following text:\\n\\n{text}\\n\\nCONCISE SUMMARY:'
		);
		return new PromptTemplate({
			template,
			inputVariables: ['text'],
		});
	}

	private getDefaultRefinePrompt(): PromptTemplate {
		const baseTemplate = `Your job is to produce a final summary.
We have provided an existing summary up to a certain point: {existing_answer}
We have the opportunity to refine the existing summary (only if needed) with some more context below.
------------
{text}
------------
Given the new context, refine the original summary. If the context isn't useful, return the original summary.`;

		const template = this.createSizeConstrainedPrompt(baseTemplate);
		return new PromptTemplate({
			template,
			inputVariables: ['existing_answer', 'text'],
		});
	}

	withConfig(config: any): BatchedSummarizationChain {
		// Apply config to the underlying model to preserve tracing/telemetry
		if (config && typeof this.model.withConfig === 'function') {
			this.model = this.model.withConfig(config) as BaseLanguageModel;
		}
		return this;
	}
}
