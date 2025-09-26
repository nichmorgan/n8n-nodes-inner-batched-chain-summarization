import { Tool } from '@langchain/core/tools';
import { encodingForModel } from 'js-tiktoken';

export class TokenCounterTool extends Tool {
	name = 'token_counter';
	description = 'Count the number of tokens in a given text. Use this to check if your response fits within token limits.';

	constructor() {
		super();
	}

	async _call(text: string): Promise<string> {
		try {
			const encoding = encodingForModel('gpt-3.5-turbo');
			const tokens = encoding.encode(text);
			return tokens.length.toString();
		} catch {
			// Fallback to approximate token count
			const approximateTokens = Math.ceil(text.length / 4);
			return approximateTokens.toString();
		}
	}
}

export class CharacterCounterTool extends Tool {
	name = 'character_counter';
	description = 'Count the number of characters in a given text. Use this to check if your response fits within character limits.';

	constructor() {
		super();
	}

	async _call(text: string): Promise<string> {
		return text.length.toString();
	}
}

export class ResponseValidatorTool extends Tool {
	name = 'response_validator';
	description = 'Check if a text meets the specified size requirements. Provide the text and size limit to validate.';

	private maxSize: number;
	private unit: 'tokens' | 'characters';

	constructor(maxSize: number, unit: 'tokens' | 'characters') {
		super();
		this.maxSize = maxSize;
		this.unit = unit;
	}

	async _call(input: string): Promise<string> {
		// Input format: just the text to validate
		const text = input;

		let actualSize: number;
		if (this.unit === 'tokens') {
			try {
				const encoding = encodingForModel('gpt-3.5-turbo');
				const tokens = encoding.encode(text);
				actualSize = tokens.length;
			} catch {
				actualSize = Math.ceil(text.length / 4);
			}
		} else {
			actualSize = text.length;
		}

		const isValid = actualSize <= this.maxSize;

		return JSON.stringify({
			isValid,
			actualSize,
			maxSize: this.maxSize,
			unit: this.unit,
			message: isValid
				? `✅ Text fits within limit (${actualSize}/${this.maxSize} ${this.unit})`
				: `❌ Text exceeds limit (${actualSize}/${this.maxSize} ${this.unit}). Need to shorten by ${actualSize - this.maxSize} ${this.unit}.`
		});
	}
}