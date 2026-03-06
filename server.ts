import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from '@supabase/supabase-js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
