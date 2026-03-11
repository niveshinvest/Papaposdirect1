import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from '@supabase/supabase-js';

import { aiGateway } from "./services/aiGateway";
import { whatsappAIService } from "./services/whatsappAIService";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 0. AI Generation Endpoint (AI-ROS Gateway)
  app.post("/api/ai/generate", async (req, res) => {
    try {
      const result = await aiGateway.runAI(req.body);
      res.json(result);
    } catch (error: any) {
      console.error("AI Gateway Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // 0.1 WhatsApp Order AI Endpoint
  app.post("/api/ai/whatsapp/parse", async (req, res) => {
    const { message, company_id, outlet_id } = req.body;
    try {
      const order = await whatsappAIService.parseOrder(message, company_id, outlet_id);
      res.json(order);
    } catch (error: any) {
      console.error("WhatsApp AI Error:", error);
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

  // 3. Admin Password Reset Endpoints
  const adminSupabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await adminSupabase.auth.getUser(token);

    if (error || !user) return res.status(401).json({ error: "Unauthorized" });

    // Check role in profiles
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role, company_id')
      .eq('id', user.id)
      .single();

    if (!profile || !['OWNER', 'ADMIN'].includes(profile.role)) {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    (req as any).user = user;
    (req as any).profile = profile;
    next();
  };

  app.post("/api/admin/reset-user-password", verifyAdmin, async (req, res) => {
    const { user_id, new_password } = req.body;
    const adminUser = (req as any).user;
    const adminProfile = (req as any).profile;

    try {
      // 1. Try to find in staff_users first (since UserManagement uses staff_users.id)
      let { data: staff, error: staffError } = await adminSupabase
        .from('staff_users')
        .select('email, company_id')
        .eq('id', user_id)
        .maybeSingle();

      let targetEmail = staff?.email;
      let targetCompanyId = staff?.company_id;

      // 2. Fallback to profiles if not found in staff_users
      if (!staff) {
        const { data: profile, error: profileError } = await adminSupabase
          .from('profiles')
          .select('company_id')
          .eq('id', user_id)
          .maybeSingle();
        
        if (profile) {
          targetCompanyId = profile.company_id;
          // Get email from auth.admin
          const { data: { user: authUser }, error: authError } = await adminSupabase.auth.admin.getUserById(user_id);
          if (authUser) targetEmail = authUser.email;
        }
      }

      if (!targetEmail || !targetCompanyId) {
        return res.status(404).json({ error: "Target user not found" });
      }

      if (targetCompanyId !== adminProfile.company_id) {
        return res.status(403).json({ error: "Forbidden: Cross-company operation rejected" });
      }

      // 3. Find Auth User by Email
      const { data: { users }, error: listError } = await adminSupabase.auth.admin.listUsers();
      if (listError) throw listError;
      
      const authUser = (users as any[]).find(u => u.email === targetEmail);

      if (!authUser) {
        return res.status(400).json({ error: "User has not completed onboarding yet. They must use the invite link first." });
      }

      // 4. Update password
      const { error: updateError } = await adminSupabase.auth.admin.updateUserById(authUser.id, {
        password: new_password
      });

      if (updateError) throw updateError;

      // Log action
      await adminSupabase.from('security_logs').insert({
        company_id: adminProfile.company_id,
        actor_user_id: adminUser.id,
        target_user_id: authUser.id,
        action: "PASSWORD_RESET",
        metadata: { method: "DIRECT_SET", staff_id: user_id }
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Admin Password Reset Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/send-reset-link", verifyAdmin, async (req, res) => {
    const { user_id } = req.body;
    const adminUser = (req as any).user;
    const adminProfile = (req as any).profile;

    try {
      // 1. Try to find in staff_users first
      let { data: staff, error: staffError } = await adminSupabase
        .from('staff_users')
        .select('email, company_id')
        .eq('id', user_id)
        .maybeSingle();

      let targetEmail = staff?.email;
      let targetCompanyId = staff?.company_id;

      // 2. Fallback to profiles
      if (!staff) {
        const { data: profile, error: profileError } = await adminSupabase
          .from('profiles')
          .select('company_id')
          .eq('id', user_id)
          .maybeSingle();
        
        if (profile) {
          targetCompanyId = profile.company_id;
          const { data: { user: authUser }, error: authError } = await adminSupabase.auth.admin.getUserById(user_id);
          if (authUser) targetEmail = authUser.email;
        }
      }

      if (!targetEmail || !targetCompanyId) {
        return res.status(404).json({ error: "Target user not found" });
      }

      if (targetCompanyId !== adminProfile.company_id) {
        return res.status(403).json({ error: "Forbidden: Cross-company operation rejected" });
      }

      // 3. Find Auth User by Email
      const { data: { users: usersList }, error: listError2 } = await adminSupabase.auth.admin.listUsers();
      if (listError2) throw listError2;
      
      const authUser = (usersList as any[]).find(u => u.email === targetEmail);

      if (!authUser) {
        return res.status(400).json({ error: "User has not completed onboarding yet. They must use the invite link first." });
      }

      // Generate recovery link
      const { data, error: linkError } = await adminSupabase.auth.admin.generateLink({
        type: "recovery",
        email: targetEmail
      });

      if (linkError) throw linkError;

      // Log action
      await adminSupabase.from('security_logs').insert({
        company_id: adminProfile.company_id,
        actor_user_id: adminUser.id,
        target_user_id: user_id,
        action: "PASSWORD_RESET",
        metadata: { method: "RESET_LINK" }
      });

      res.json({ success: true, message: "Reset link generated" });
    } catch (error: any) {
      console.error("Admin Send Reset Link Error:", error);
      res.status(500).json({ error: error.message });
    }
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
