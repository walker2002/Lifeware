import 'dotenv/config'
import { chat, listProviders, resolveModel } from '../src/lib/llm'

async function main() {
  console.log('=== LLM Multi-Provider Test ===\n')

  const providers = listProviders()
  console.log('Configured providers:')
  for (const p of providers) {
    console.log(`  ${p.id}: ${p.name} [${p.configured ? 'HAS KEY' : 'no key'}]`)
  }
  console.log()

  const configured = providers.filter(p => p.configured)

  if (configured.length === 0) {
    console.error('No provider has an API key configured. Set at least one of:')
    for (const p of providers) {
      console.error(`  ${p.name}: needs env var (see provider config)`)
    }
    process.exit(1)
  }

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
