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
  // Validate environment variables
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("CRITICAL ERROR: Supabase environment variables missing!");
    console.error("VITE_SUPABASE_URL:", process.env.VITE_SUPABASE_URL ? "SET" : "MISSING");
    console.error("SUPABASE_SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "SET" : "MISSING");
  }

  const adminSupabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
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

  app.post(["/api/admin/reset-user-password", "/api/admin/reset-user-password/"], verifyAdmin, async (req, res) => {
    const { user_id, new_password } = req.body;
    const adminUser = (req as any).user;
    const adminProfile = (req as any).profile;

    try {
      // 1. Find user email
      const { data: { user: authUser }, error: authError } = await adminSupabase.auth.admin.getUserById(user_id);
      if (authError || !authUser) {
        return res.status(404).json({ error: "User not found in auth layer" });
      }

      // 2. Update password
      const { error: updateError } = await adminSupabase.auth.admin.updateUserById(user_id, {
        password: new_password
      });

      if (updateError) throw updateError;

      // 3. Log action
      await adminSupabase.from('security_logs').insert({
        company_id: adminProfile.company_id,
        actor_user_id: adminUser.id,
        target_user_id: user_id,
        action: "PASSWORD_RESET",
        metadata: { method: "DIRECT_SET" }
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Admin Password Reset Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post(["/api/admin/send-reset-link", "/api/admin/send-reset-link/"], verifyAdmin, async (req, res) => {
    const { user_id } = req.body;
    const adminUser = (req as any).user;
    const adminProfile = (req as any).profile;

    try {
      // 1. Get user email
      const { data: { user: authUser }, error: authError } = await adminSupabase.auth.admin.getUserById(user_id);
      if (authError || !authUser || !authUser.email) {
        return res.status(404).json({ error: "User not found or email missing" });
      }

      // 2. Trigger Supabase Password Reset Email
      const { error: resetError } = await adminSupabase.auth.resetPasswordForEmail(authUser.email, {
        redirectTo: `${process.env.APP_URL || 'http://localhost:3000'}/#/auth/reset-password`
      });

      if (resetError) throw resetError;

      // 3. Log action
      await adminSupabase.from('security_logs').insert({
        company_id: adminProfile.company_id,
        actor_user_id: adminUser.id,
        target_user_id: user_id,
        action: "PASSWORD_RESET",
        metadata: { method: "SUPABASE_AUTH_RESET" }
      });

      res.json({ success: true, message: "Reset email sent via Supabase" });
    } catch (error: any) {
      console.error("Admin Send Reset Link Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post(["/api/admin/invite-staff", "/api/admin/invite-staff/"], verifyAdmin, async (req, res) => {
    const { email, full_name, role, outlet_ids, reason } = req.body;
    const adminUser = (req as any).user;
    const adminProfile = (req as any).profile;

    try {
      // 1. Create staff_users record first to get the invite_token
      const { data: staff, error: staffError } = await adminSupabase
        .from('staff_users')
        .insert({
          email,
          full_name,
          role,
          company_id: adminProfile.company_id,
          outlet_ids,
          status: 'invited',
          created_by: adminUser.id
        })
        .select()
        .single();

      if (staffError) throw staffError;

      // 2. Invite user via Supabase Auth (Sends email automatically)
      const { data: authData, error: authError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
        data: { full_name },
        redirectTo: `${process.env.APP_URL || 'http://localhost:3000'}/#/onboarding/${staff.invite_token}`
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          return res.status(400).json({ error: "A user with this email already exists." });
        }
        throw authError;
      }

      res.json({ success: true, staff_id: staff.id });
    } catch (error: any) {
      console.error("Staff Invite Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post(["/api/admin/resend-staff-invite", "/api/admin/resend-staff-invite/"], verifyAdmin, async (req, res) => {
    const { staff_id } = req.body;
    const adminUser = (req as any).user;
    const adminProfile = (req as any).profile;

    try {
      // 1. Get staff record
      const { data: staff, error: staffError } = await adminSupabase
        .from('staff_users')
        .select('*')
        .eq('id', staff_id)
        .single();

      if (staffError || !staff) {
        return res.status(404).json({ error: "Staff record not found" });
      }

      // 2. Refresh the invite token in the database (optional but good for security)
      const { data: tokenData, error: tokenError } = await adminSupabase.rpc('generate_staff_invite_token', { p_staff_id: staff_id });
      if (tokenError) throw tokenError;

      // 3. Trigger Supabase Invite (Smart Resend)
      // This works whether the user exists in auth.users or not.
      // If they don't exist, it creates them. If they do, it resends the invite.
      const { error: authError } = await adminSupabase.auth.admin.inviteUserByEmail(staff.email, {
        data: { full_name: staff.full_name },
        redirectTo: `${process.env.APP_URL || 'http://localhost:3000'}/#/onboarding/${tokenData.token || staff.invite_token}`
      });

      if (authError) throw authError;

      // 4. Log action
      await adminSupabase.from('security_logs').insert({
        company_id: adminProfile.company_id,
        actor_user_id: adminUser.id,
        target_user_id: staff.auth_user_id, // Might be null for legacy
        action: "INVITE_RESENT",
        metadata: { staff_id: staff.id, email: staff.email }
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Staff Resend Invite Error:", error);
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
