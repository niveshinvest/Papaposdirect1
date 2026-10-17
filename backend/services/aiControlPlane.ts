import { createHash } from "crypto"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { supabaseAdmin } from "../lib/supabaseAdmin"

type AIPart = {
  text?: string
  inline_data?: {
    mime_type: string
    data: string
  }
}

type AIRequest = {
  company_id: string
  outlet_id?: string | null
  task_type?: string
  prompt?: string
  parts?: AIPart[]
  context?: any
  system_prompt?: string
  temperature?: number
  max_tokens?: number
  response_mime_type?: string
  response_schema?: any
  provider_name?: string
  provider_override?: Partial<ProviderRow>
}

type AIResponse = {
  text: string
  raw?: any
  error?: string
  provider_used?: string
}

type ProviderRow = {
  id?: string
  company_id?: string
  provider_name?: string
  api_key?: string | null
  model?: string | null
  base_url?: string | null
  is_default?: boolean | null
  is_active?: boolean | null
  updated_at?: string | null
}

const providerAliasMap: Record<string, string> = {
  gemini: "gemini",
  google: "gemini",
  google_gemini: "gemini",
  openai: "openai_compatible",
  chatgpt: "openai_compatible",
  claude: "claude",
  anthropic: "claude",
  openrouter: "openrouter",
  perplexity: "openai_compatible",
  hermes: "openai_compatible",
  xai: "openai_compatible",
  grok: "openai_compatible",
  deepseek: "openai_compatible",
  mistral: "openai_compatible",
  cohere: "openai_compatible",
  local: "openai_compatible",
  ollama: "openai_compatible",
  custom: "openai_compatible",
  openai_compatible: "openai_compatible",
}

const resolveProviderFamily = (providerName?: string | null) => {
  const normalized = String(providerName || "").trim().toLowerCase()
  return providerAliasMap[normalized] || "openai_compatible"
}

const flattenPrompt = (request: AIRequest) => {
  if (request.prompt?.trim()) return request.prompt.trim()
  return (request.parts || [])
    .map(part => part.text || "")
    .filter(Boolean)
    .join("\n")
    .trim()
}

const createPromptHash = (request: AIRequest) =>
  createHash("md5")
    .update(JSON.stringify({
      task_type: request.task_type,
      prompt: request.prompt,
      parts: request.parts,
      context: request.context,
      system_prompt: request.system_prompt,
      provider_name: request.provider_name || null,
    }))
    .digest("hex")

async function runGemini(request: AIRequest, provider: ProviderRow): Promise<AIResponse> {
  const apiKey = provider.api_key || process.env.GEMINI_API_KEY || process.env.API_KEY
  if (!apiKey) throw new Error("Gemini API Key missing")

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: provider.model || "gemini-1.5-flash",
  })

  const prompt = flattenPrompt(request)
  const fullPrompt = request.system_prompt
    ? `${request.system_prompt}\n\n${prompt}`
    : prompt

  const result = await model.generateContent(fullPrompt)
  return {
    text: result.response.text(),
    provider_used: provider.provider_name || "gemini",
  }
}

async function runOpenAICompatible(request: AIRequest, provider: ProviderRow): Promise<AIResponse> {
  const apiKey = provider.api_key || process.env.OPENAI_API_KEY || process.env.API_KEY
  if (!apiKey) throw new Error(`${provider.provider_name || "Provider"} API key missing`)

  const prompt = flattenPrompt(request)
  const body: any = {
    model: provider.model || "gpt-4o-mini",
    messages: [
      ...(request.system_prompt ? [{ role: "system", content: request.system_prompt }] : []),
      { role: "user", content: prompt },
    ],
    temperature: request.temperature,
    max_tokens: request.max_tokens,
  }

  if (request.response_mime_type === "application/json") {
    body.response_format = { type: "json_object" }
  }

  const response = await fetch(
    provider.base_url || "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    }
  )

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error?.message || `${provider.provider_name || "Provider"} request failed`)
  }

  return {
    text: data?.choices?.[0]?.message?.content || "",
    raw: data,
    provider_used: provider.provider_name || "openai",
  }
}

async function runClaude(request: AIRequest, provider: ProviderRow): Promise<AIResponse> {
  const apiKey = provider.api_key || process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("Anthropic API key missing")

  const response = await fetch(
    provider.base_url || "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: provider.model || "claude-3-5-sonnet-latest",
        system: request.system_prompt,
        messages: [{ role: "user", content: flattenPrompt(request) }],
        max_tokens: request.max_tokens || 4096,
        temperature: request.temperature,
      }),
    }
  )

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error?.message || "Claude request failed")
  }

  return {
    text: data?.content?.map((item: any) => item?.text || "").join("\n") || "",
    raw: data,
    provider_used: provider.provider_name || "claude",
  }
}

async function runProvider(request: AIRequest, provider: ProviderRow): Promise<AIResponse> {
  const family = resolveProviderFamily(provider.provider_name)
  if (family === "gemini") return runGemini(request, provider)
  if (family === "claude") return runClaude(request, provider)
  return runOpenAICompatible(request, provider)
}

async function fetchCompanyAiState(companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("ai_kill_switch")
    .eq("id", companyId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load AI company state: ${error.message}`)
  }

  return {
    ai_kill_switch: Boolean(data?.ai_kill_switch),
  }
}

async function fetchProviders(companyId: string, requestedProviderName?: string) {
  let query = supabaseAdmin
    .from("ai_providers")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false })

  if (requestedProviderName) {
    query = query.eq("provider_name", requestedProviderName)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to load AI providers: ${error.message}`)
  }

  return (data || []) as ProviderRow[]
}

async function fetchCachedResponse(promptHash: string) {
  const { data } = await supabaseAdmin
    .from("ai_cache")
    .select("response")
    .eq("prompt_hash", promptHash)
    .maybeSingle()

  return data?.response ? JSON.parse(data.response) : null
}

async function cacheResponse(promptHash: string, response: AIResponse) {
  await supabaseAdmin
    .from("ai_cache")
    .upsert({
      prompt_hash: promptHash,
      response: JSON.stringify(response),
    })
}

async function logExecution(request: AIRequest, response: AIResponse) {
  await supabaseAdmin
    .from("ai_logs")
    .insert({
      company_id: request.company_id,
      outlet_id: request.outlet_id || null,
      task_type: request.task_type || "GENERAL",
      prompt: request.prompt || JSON.stringify(request.parts || []),
      response: response.text || response.error || "",
      provider_used: response.provider_used || request.provider_name || "unknown",
    })
}

export async function runCentralAI(request: AIRequest): Promise<AIResponse> {
  if (!request.company_id) {
    throw new Error("company_id is required")
  }

  const companyState = await fetchCompanyAiState(request.company_id)
  if (companyState.ai_kill_switch) {
    throw new Error("AI services are disabled by the owner kill switch.")
  }

  const promptHash = createPromptHash(request)
  const cached = await fetchCachedResponse(promptHash)
  if (cached) return cached

  const configuredProviders = request.provider_override?.provider_name
    ? [{
        provider_name: request.provider_override.provider_name,
        model: request.provider_override.model || null,
        api_key: request.provider_override.api_key || null,
        base_url: request.provider_override.base_url || null,
        is_default: true,
        is_active: true,
      } as ProviderRow]
    : await fetchProviders(request.company_id, request.provider_name)
  const fallbackProviders = configuredProviders.length
    ? configuredProviders
    : [{
        provider_name: "gemini",
        model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
        api_key: process.env.GEMINI_API_KEY || process.env.API_KEY || null,
        is_default: true,
        is_active: true,
      }]

  const errors: string[] = []
  for (const provider of fallbackProviders) {
    try {
      const response = await runProvider(request, provider)
      await logExecution(request, response)
      if (!response.error) {
        await cacheResponse(promptHash, response)
      }
      return response
    } catch (error: any) {
      errors.push(`${provider.provider_name || "provider"}: ${error.message}`)
    }
  }

  const failedResponse: AIResponse = {
    text: "",
    error: `All AI providers failed. ${errors.join(" | ")}`,
  }
  await logExecution(request, failedResponse)
  return failedResponse
}
