// Global test setup for Vitest
import { vi } from 'vitest';

// Make vitest globals available
global.vi = vi;

// Mock console methods to reduce noise in tests
global.console = {
	...console,
	log: vi.fn(),
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
};