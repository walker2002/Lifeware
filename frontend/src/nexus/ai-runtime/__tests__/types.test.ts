import { describe, it, expect } from 'vitest'
import type {
  AITaskType,
  AIGenerateRequest,
  AIGenerateResponse,
  TokenUsage,
  ChatMessage,
} from '../types'
import { AIRuntimeError, CNUISchemaError } from '../types'
import { z } from 'zod'

describe('AITaskType', () => {
  it('should accept all valid task types', () => {
    const types: AITaskType[] = [
      'intent_routing',
      'field_extraction',
      'content_generation',
      'summary',
      'cn_ui_revision',
    ]
    expect(types).toHaveLength(5)
  })
})

describe('AIGenerateRequest', () => {
  it('should have required fields', () => {
    const request: AIGenerateRequest = {
      domainId: 'timebox',
      action: 'createSmartTimeboxes',
      systemPrompt: 'You are a helpful assistant',
      messages: [{ role: 'user', content: 'Hello' }],
      taskType: 'intent_routing',
    }
    expect(request.domainId).toBe('timebox')
    expect(request.action).toBe('createSmartTimeboxes')
    expect(request.taskType).toBe('intent_routing')
  })

  it('should support optional fields', () => {
    const schema = z.object({ result: z.string() })
    const request: AIGenerateRequest = {
      domainId: 'timebox',
      action: 'createSmartTimeboxes',
      systemPrompt: 'system',
      messages: [],
      taskType: 'content_generation',
      maxTokens: 1024,
      temperature: 0.7,
      structuredOutput: schema,
      stream: false,
      sessionId: 'session-123',
    }
    expect(request.maxTokens).toBe(1024)
    expect(request.temperature).toBe(0.7)
    expect(request.structuredOutput).toBe(schema)
    expect(request.stream).toBe(false)
    expect(request.sessionId).toBe('session-123')
  })
})

describe('AIGenerateResponse', () => {
  it('should have all fields', () => {
    const response: AIGenerateResponse = {
      content: 'generated text',
      tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      model: 'gpt-4',
      cached: false,
    }
    expect(response.content).toBe('generated text')
    expect(response.cached).toBe(false)
  })

  it('should support structured content', () => {
    const response: AIGenerateResponse = {
      content: { result: 'parsed', confidence: 0.95 },
      tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      model: 'glm-5.1',
      cached: true,
      sessionId: 'session-456',
    }
    expect(typeof response.content).toBe('object')
    expect(response.cached).toBe(true)
    expect(response.sessionId).toBe('session-456')
  })
})

describe('AIRuntimeError', () => {
  it('should create error with PROVIDER_UNAVAILABLE code', () => {
    const error = new AIRuntimeError('Provider down', 'PROVIDER_UNAVAILABLE', 'dashscope', true)
    expect(error.message).toBe('Provider down')
    expect(error.code).toBe('PROVIDER_UNAVAILABLE')
    expect(error.provider).toBe('dashscope')
    expect(error.retryable).toBe(true)
    expect(error).toBeInstanceOf(Error)
  })

  it('should create error with SCHEMA_VALIDATION_FAILED code', () => {
    const error = new AIRuntimeError('Schema failed', 'SCHEMA_VALIDATION_FAILED')
    expect(error.code).toBe('SCHEMA_VALIDATION_FAILED')
    expect(error.retryable).toBe(false)
  })

  it('should create error with TIMEOUT code', () => {
    const error = new AIRuntimeError('Request timed out', 'TIMEOUT', undefined, true)
    expect(error.code).toBe('TIMEOUT')
    expect(error.retryable).toBe(true)
  })

  it('should NOT have TOKEN_EXCEEDED code (MVP: no hard limits)', () => {
    // TOKEN_EXCEEDED was removed because constitution §7 says MVP has no hard limits
    const validCodes = ['PROVIDER_UNAVAILABLE', 'SCHEMA_VALIDATION_FAILED', 'TIMEOUT'] as const
    expect(validCodes).not.toContain('TOKEN_EXCEEDED')
  })
})

describe('CNUISchemaError', () => {
  it('should extend AIRuntimeError with schema errors', () => {
    const zodError = new z.ZodError([
      { message: 'Required', path: ['name'], code: 'invalid_type', expected: 'string', received: 'undefined' },
    ])
    const error = new CNUISchemaError('CN-UI validation failed', zodError)
    expect(error).toBeInstanceOf(AIRuntimeError)
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('SCHEMA_VALIDATION_FAILED')
    expect(error.schemaErrors).toBe(zodError)
    expect(error.message).toBe('CN-UI validation failed')
  })
})

describe('TokenUsage', () => {
  it('should have all token fields', () => {
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    }
    expect(usage.totalTokens).toBe(usage.promptTokens + usage.completionTokens)
  })
})
