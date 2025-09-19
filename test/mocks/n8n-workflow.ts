import { vi } from 'vitest';

// Mock n8n-workflow types and functions
export const NodeConnectionType = {
  AiLanguageModel: 'ai_language_model',
  AiDocument: 'ai_document',
  AiTextSplitter: 'ai_text_splitter',
  AiChain: 'ai_chain',
  AiAgent: 'ai_agent',
  AiVectorStore: 'ai_vector_store',
  AiRetriever: 'ai_retriever',
} as const;

export const sleep = vi.fn().mockResolvedValue(undefined);

// Mock types
export interface IExecuteFunctions {
  getInputData(): any[];
  getNode(): any;
  getInputConnectionData(type: string, index: number): Promise<any>;
  getNodeParameter(param: string, itemIndex: number, defaultValue?: any): any;
  continueOnFail(): boolean;
  getExecutionCancelSignal(): any;
}

export interface INode {
  name: string;
  parameters: any;
  typeVersion?: number;
}

export interface INodeExecutionData {
  json: any;
  binary?: any;
}

export interface INodeTypeDescription {
  displayName: string;
  name: string;
  version: number;
  description: string;
  group: string[];
  inputs: any[];
  outputs: any[];
  properties: any[];
  defaults?: any;
  codex?: any;
  icon?: string;
  iconColor?: string;
}

export interface INodeType {
  description: INodeTypeDescription;
  execute(this: IExecuteFunctions): Promise<any[]>;
}

export interface INodeTypeBaseDescription {
  displayName: string;
  name: string;
  icon?: string;
  iconColor?: string;
  group: string[];
  description: string;
  codex?: any;
  defaultVersion?: number;
}

export interface IDisplayOptions {
  show?: Record<string, any>;
  hide?: Record<string, any>;
}

export interface INodeProperties {
  displayName: string;
  name: string;
  type: string;
  default?: any;
  description?: string;
  options?: any[];
  displayOptions?: IDisplayOptions;
  typeOptions?: any;
  placeholder?: string;
  required?: boolean;
  noDataExpression?: boolean;
}

export interface INodeInputConfiguration {
  displayName: string;
  type: string;
  required?: boolean;
}

export class VersionedNodeType {
  constructor(nodeVersions: any, baseDescription: any) {
    // Mock implementation
  }
}

// Export everything that might be imported
export * from './n8n-workflow';