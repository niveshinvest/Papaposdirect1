<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/2b232d19-02a0-4b6b-b83c-94c1dabe9b9a

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create `.env.local` (or update it) with required values:
   - `GEMINI_API_KEY=<your_gemini_api_key>`
   - `SUPABASE_URL=<your_supabase_project_url>`
   - `SUPABASE_SERVICE_ROLE_KEY=<your_supabase_service_role_key>`
   - `WHATSAPP_VERIFY_TOKEN=<your_webhook_verify_token>`
   - `CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173`
3. Run the app:
   `npm run dev`
