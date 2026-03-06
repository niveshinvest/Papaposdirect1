import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from '@supabase/supabase-js';

import { GeminiAdapter, OpenAIAdapter, ClaudeAdapter, OpenRouterAdapter } from "./services/aiAdapters";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // AI Adapters Registry
  const adapters: Record<string, any> = {
    gemini: new GeminiAdapter(),
    openai: new OpenAIAdapter(),
    claude: new ClaudeAdapter(),
    openrouter: new OpenRouterAdapter()
  };

  // 0. AI Generation Endpoint
  app.post("/api/ai/generate", async (req, res) => {
    const { prompt, parts, system_prompt, temperature, max_tokens, response_mime_type, response_schema, company_id } = req.body;

    if (!company_id) return res.status(400).json({ error: "company_id required" });

    try {
      const supabase = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.VITE_SUPABASE_ANON_KEY!
      );

      // 1. Fetch Active Provider
      const { data: provider, error: pErr } = await supabase
        .from('ai_providers')
        .select('*')
        .eq('company_id', company_id)
        .eq('is_active', true)
        .maybeSingle();

      if (pErr) throw pErr;
      
      // Default to Gemini if no provider configured
      const activeProvider = provider || {
        provider_name: 'gemini',
        model_name: 'gemini-pro',
        api_key: process.env.GEMINI_API_KEY || process.env.API_KEY
      };

      const adapter = adapters[activeProvider.provider_name];
      if (!adapter) throw new Error(`Unsupported provider: ${activeProvider.provider_name}`);

      const result = await adapter.generateContent({
        prompt,
        parts,
        system_prompt,
        temperature,
        max_tokens,
        response_mime_type,
        response_schema
      }, activeProvider);

      res.json(result);
    } catch (error: any) {
      console.error("AI Route Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // 1. WhatsApp Webhook (Verification)
  app.get("/api/whatsapp/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    // In a real app, verify against process.env.WHATSAPP_VERIFY_TOKEN
    if (mode === "subscribe" && token === "PAPAPOS_BOT") {
      console.log("WHATSAPP_WEBHOOK: VERIFIED");
      return res.status(200).send(challenge);
    }
    res.sendStatus(403);
  });

  // 2. WhatsApp Webhook (Message Receiver)
  app.post("/api/whatsapp/webhook", async (req, res) => {
    const body = req.body;
    console.log("WHATSAPP_WEBHOOK: RECEIVED", JSON.stringify(body, null, 2));

    if (body.object === "whatsapp_business_account") {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (message) {
        const phone = message.from;
        const text = message.text?.body;
        const wabaId = value?.metadata?.display_phone_number;

        // Initialize Supabase (Admin/Service Role if needed, or use public if RLS allows)
        const supabase = createClient(
          process.env.VITE_SUPABASE_URL!,
          process.env.VITE_SUPABASE_ANON_KEY!
        );

        // Log Inbound Message
        await supabase.from('whatsapp_messages').insert({
          sender: phone,
          recipient: wabaId || 'SYSTEM',
          message_body: text,
          direction: 'INBOUND',
          status: 'RECEIVED'
        });
      }
    }

    res.sendStatus(200);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
