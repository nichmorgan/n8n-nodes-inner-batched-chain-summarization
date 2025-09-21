import type { IExecuteFunctions } from 'n8n-workflow';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTracingConfig } from '../tracing';

describe('tracing', () => {
	let mockExecuteFunctions: IExecuteFunctions;

	beforeEach(() => {
		mockExecuteFunctions = {
			getNodeParameter: vi.fn(),
			getNode: vi.fn(),
			getInputData: vi.fn(),
			getInputConnectionData: vi.fn(),
			continueOnFail: vi.fn(),
			getExecutionCancelSignal: vi.fn(),
		} as unknown as IExecuteFunctions;

		vi.clearAllMocks();
	});

	describe('getTracingConfig', () => {
		it('should return empty object as mock implementation', () => {
			const result = getTracingConfig(mockExecuteFunctions);

			expect(result).toEqual({});
			expect(typeof result).toBe('object');
		});

		it('should accept IExecuteFunctions parameter', () => {
			expect(() => getTracingConfig(mockExecuteFunctions)).not.toThrow();
		});

		it('should consistently return same result', () => {
			const result1 = getTracingConfig(mockExecuteFunctions);
			const result2 = getTracingConfig(mockExecuteFunctions);

			expect(result1).toEqual(result2);
		});

		it('should return object type for any IExecuteFunctions input', () => {
			const mockCtx1 = { test: 'value1' } as unknown as IExecuteFunctions;
			const mockCtx2 = { test: 'value2' } as unknown as IExecuteFunctions;

			const result1 = getTracingConfig(mockCtx1);
			const result2 = getTracingConfig(mockCtx2);

			expect(typeof result1).toBe('object');
			expect(typeof result2).toBe('object');
			expect(result1).toEqual({});
			expect(result2).toEqual({});
		});

		it('should not modify the input context', () => {
			const originalContext = { ...mockExecuteFunctions };

			getTracingConfig(mockExecuteFunctions);

			// Context should remain unchanged
			expect(mockExecuteFunctions).toEqual(originalContext);
		});

		it('should handle null or minimal context gracefully', () => {
			const minimalContext = {} as IExecuteFunctions;

			expect(() => getTracingConfig(minimalContext)).not.toThrow();

			const result = getTracingConfig(minimalContext);
			expect(result).toEqual({});
		});
	});

	describe('function signature and behavior', () => {
		it('should be a function', () => {
			expect(typeof getTracingConfig).toBe('function');
		});

		it('should have correct function length (parameter count)', () => {
			expect(getTracingConfig.length).toBe(1);
		});

		it('should return immediately without side effects', () => {
			const startTime = Date.now();
			const result = getTracingConfig(mockExecuteFunctions);
			const endTime = Date.now();

			expect(result).toEqual({});
			expect(endTime - startTime).toBeLessThan(10); // Should be very fast
		});
	});
});
