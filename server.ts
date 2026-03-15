import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from '@supabase/supabase-js';
import path from "path";
import fs from "fs";

import { aiGateway } from "./services/aiGateway";
import { whatsappAIService } from "./services/whatsappAIService";

// 1. ENVIRONMENT VALIDATION
function validateEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`Missing required environment variable: ${key}`);
      // Don't exit in dev if we want to allow some functionality, but architect said exit.
      // process.exit(1); 
    }
  }
}

validateEnv();

// 2. CENTRALIZED SUPABASE ADMIN CLIENT
const adminSupabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // 3. API REQUEST LOGGER
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      console.log(
        `[API] ${req.method} ${req.path}`,
        new Date().toISOString()
      );
    }
    next();
  });

  // 7. IMPROVED ADMIN VERIFICATION
  const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const token = authHeader.split(' ')[1];
      const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);

      if (authError || !user) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const { data: profile, error: profileError } = await adminSupabase
        .from('profiles')
        .select('role, company_id')
        .eq('id', user.id)
        .single();

      if (profileError || !profile || !['OWNER', 'ADMIN'].includes(profile.role)) {
        return res.status(403).json({ success: false, error: "Forbidden: Admin access required" });
      }

      (req as any).user = user;
      (req as any).profile = profile;
      next();
    } catch (error) {
      next(error);
    }
  };

  // --- 0. AI & External Integrations ---
  app.post(["/api/ai/generate", "/api/ai/generate/"], async (req, res, next) => {
    try {
      const result = await aiGateway.runAI(req.body);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  app.post(["/api/ai/whatsapp/parse", "/api/ai/whatsapp/parse/"], async (req, res, next) => {
    try {
      const { message, company_id, outlet_id } = req.body;
      if (!message || !company_id || !outlet_id) {
        return res.status(400).json({ success: false, error: "Invalid request payload" });
      }
      const order = await whatsappAIService.parseOrder(message, company_id, outlet_id);
      res.json({ success: true, data: order });
    } catch (error) {
      next(error);
    }
  });

  // --- 1. WhatsApp Webhooks ---
  app.get(["/api/whatsapp/webhook", "/api/whatsapp/webhook/"], (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    
    if (mode === "subscribe" && token === "PAPAPOS_BOT") {
      return res.status(200).send(challenge);
    }
    res.sendStatus(403);
  });

  app.post(["/api/whatsapp/webhook", "/api/whatsapp/webhook/"], async (req, res, next) => {
    try {
      const body = req.body;
      if (body.object === "whatsapp_business_account") {
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const message = value?.messages?.[0];

        if (message) {
          await adminSupabase.from('whatsapp_messages').insert({
            sender: message.from,
            recipient: value?.metadata?.display_phone_number || 'SYSTEM',
            message_body: message.text?.body,
            direction: 'INBOUND',
            status: 'RECEIVED'
          });
        }
      }
      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  });

  // --- 2. Admin Proxy Endpoints ---

  // 2.1 Staff Invitations
  app.post(["/api/admin/invite-staff", "/api/admin/invite-staff/"], verifyAdmin, async (req, res, next) => {
    try {
      const { email, full_name, role, outlet_ids, reason } = req.body;
      
      if (!email || !full_name || !role || !outlet_ids) {
        return res.status(400).json({ success: false, error: "Invalid request payload" });
      }

      const adminProfile = (req as any).profile;
      const adminUser = (req as any).user;

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

      const { error: authError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
        data: { full_name },
        redirectTo: `${process.env.APP_URL || 'http://localhost:3000'}/#/onboarding/${staff.invite_token}`
      });

      if (authError) throw authError;

      res.json({ success: true, data: { staff_id: staff.id } });
    } catch (error) {
      next(error);
    }
  });

  app.post(["/api/admin/resend-staff-invite", "/api/admin/resend-staff-invite/"], verifyAdmin, async (req, res, next) => {
    try {
      const { staff_id } = req.body;
      if (!staff_id) {
        return res.status(400).json({ success: false, error: "Invalid request payload" });
      }

      const { data: staff, error: staffError } = await adminSupabase
        .from('staff_users')
        .select('*')
        .eq('id', staff_id)
        .single();

      if (staffError || !staff) {
        return res.status(404).json({ success: false, error: "Staff record not found" });
      }

      const { data: tokenData, error: tokenError } = await adminSupabase.rpc('generate_staff_invite_token', { p_staff_id: staff_id });
      if (tokenError) throw tokenError;

      const { error: authError } = await adminSupabase.auth.admin.inviteUserByEmail(staff.email, {
        data: { full_name: staff.full_name },
        redirectTo: `${process.env.APP_URL || 'http://localhost:3000'}/#/onboarding/${tokenData.token || staff.invite_token}`
      });

      if (authError) throw authError;

      res.json({ success: true, data: { message: "Invite resent" } });
    } catch (error) {
      next(error);
    }
  });

  // 2.2 Password Management
  app.post(["/api/admin/reset-user-password", "/api/admin/reset-user-password/"], verifyAdmin, async (req, res, next) => {
    try {
      const { user_id, new_password } = req.body;
      if (!user_id || !new_password) {
        return res.status(400).json({ success: false, error: "Invalid request payload" });
      }

      const { error: updateError } = await adminSupabase.auth.admin.updateUserById(user_id, {
        password: new_password
      });

      if (updateError) throw updateError;

      res.json({ success: true, data: { message: "Password updated" } });
    } catch (error) {
      next(error);
    }
  });

  app.post(["/api/admin/send-reset-link", "/api/admin/send-reset-link/"], verifyAdmin, async (req, res, next) => {
    try {
      const { user_id } = req.body;
      if (!user_id) {
        return res.status(400).json({ success: false, error: "Invalid request payload" });
      }

      const { data: { user: authUser }, error: authError } = await adminSupabase.auth.admin.getUserById(user_id);
      if (authError || !authUser || !authUser.email) {
        return res.status(404).json({ success: false, error: "User not found or email missing" });
      }

      const { error: resetError } = await adminSupabase.auth.resetPasswordForEmail(authUser.email, {
        redirectTo: `${process.env.APP_URL || 'http://localhost:3000'}/#/auth/reset-password`
      });

      if (resetError) throw resetError;

      res.json({ success: true, data: { message: "Reset email sent" } });
    } catch (error) {
      next(error);
    }
  });

  // --- 3. Static Assets & SPA Fallback ---
  const isProduction = process.env.NODE_ENV === "production";
  const distPath = path.join(process.cwd(), "dist");
  const hasDist = fs.existsSync(distPath);

  if (!isProduction || !hasDist) {
    if (isProduction && !hasDist) {
      console.warn("Production mode detected but 'dist' folder is missing. Falling back to Vite middleware.");
    }
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // 5. GLOBAL ERROR HANDLER
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Unhandled Server Error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
