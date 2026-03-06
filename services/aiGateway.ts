import { createClient } from '@supabase/supabase-js';
import { AIRequest, AIResponse, AIProvider } from '../types';
import { GeminiAdapter, OpenAIAdapter, ClaudeAdapter, OpenRouterAdapter } from './aiAdapters';
import crypto from 'crypto';

const adapters: Record<string, any> = {
  gemini: new GeminiAdapter(),
  openai: new OpenAIAdapter(),
  claude: new ClaudeAdapter(),
  openrouter: new OpenRouterAdapter()
};

export const aiGateway = {
  async runAI(request: AIRequest): Promise<AIResponse> {
    const { company_id, outlet_id, task_type, prompt, parts, context } = request;

    if (!company_id) throw new Error("company_id is required");

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!
    );

    // 1. Check Cache
    const promptHash = crypto.createHash('md5').update(JSON.stringify({ prompt, parts, task_type, context })).digest('hex');
    const { data: cached } = await supabase
      .from('ai_cache')
      .select('response')
      .eq('prompt_hash', promptHash)
      .maybeSingle();

    if (cached) {
      return JSON.parse(cached.response);
    }

    // 2. Detect Active Provider
    const { data: provider, error: pErr } = await supabase
      .from('ai_providers')
      .select('*')
      .eq('company_id', company_id)
      .eq('is_active', true)
      .maybeSingle();

    if (pErr) throw pErr;

    const activeProvider: AIProvider = provider || {
      provider_name: 'gemini',
      model: 'gemini-pro',
      api_key: process.env.GEMINI_API_KEY || process.env.API_KEY
    };

    const adapter = adapters[activeProvider.provider_name];
    if (!adapter) throw new Error(`Unsupported provider: ${activeProvider.provider_name}`);

    // 3. Route AI Request
    const result = await adapter.generateContent(request, activeProvider);

    // 4. Log Usage
    await supabase.from('ai_logs').insert({
      company_id,
      outlet_id,
      task_type,
      prompt: prompt || JSON.stringify(parts),
      response: result.text,
      provider_used: activeProvider.provider_name
    });

    // 5. Cache Response (if successful)
    if (!result.error) {
      await supabase.from('ai_cache').insert({
        prompt_hash: promptHash,
        response: JSON.stringify(result)
      });
    }

    return result;
  }
};
