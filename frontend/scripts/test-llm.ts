/**
 * @file test-llm
 * @brief LLM 多提供商测试脚本
 * 
 * @usage npx tsx scripts/test-llm.ts
 * 
 * 测试所有配置的 LLM 提供商是否正常工作，验证 API 密钥配置和模型解析
 */

import 'dotenv/config'
import { chat, listProviders, resolveModel } from '../src/lib/llm'

/**
 * 主函数：执行 LLM 提供商测试
 */
async function main() {
  console.log('=== LLM Multi-Provider Test ===\n')

  // 获取所有配置的提供商
  const providers = listProviders()
  console.log('Configured providers:')
  for (const p of providers) {
    console.log(`  ${p.id}: ${p.name} [${p.configured ? 'HAS KEY' : 'no key'}]`)
  }
  console.log()

  // 筛选已配置 API 密钥的提供商
  const configured = providers.filter(p => p.configured)

  if (configured.length === 0) {
    console.error('No provider has an API key configured. Set at least one of:')
    for (const p of providers) {
      console.error(`  ${p.name}: needs env var (see provider config)`)
    }
    process.exit(1)
  }

  // 测试每个已配置的提供商
  for (const provider of configured) {
    console.log(`--- Testing ${provider.name} (${provider.id}) ---`)
    for (const role of ['default', 'thinking', 'quick'] as const) {
      const model = resolveModel(role, provider.id)
      try {
        const result = await chat(
          [
            { role: 'system', content: 'Reply with exactly: OK' },
            { role: 'user', content: 'Ping' },
          ],
          { provider: provider.id, role, maxTokens: 10, temperature: 0 },
        )
        const content = result.choices[0]?.message?.content
        console.log(`  [${role}] model=${model} → "${content?.trim()}" (tokens: ${result.usage?.prompt_tokens}/${result.usage?.completion_tokens})`)
      } catch (err: any) {
        console.log(`  [${role}] model=${model} → FAILED: ${err.message}`)
      }
    }
    console.log()
  }

  console.log('Done.')
  process.exit(0)
}

main()
