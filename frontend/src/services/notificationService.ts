
import { getSupabase, authService } from './supabaseService';
import { AIInsight, NotificationPrefs } from '../types';

export const notificationService = {
  /**
   * Dispatches alerts based on severity and owner preferences.
   */
  async dispatchAlert(insight: AIInsight) {
    const client = getSupabase();
    if (!client) return;

    // 1. Fetch Owner Profile & Preferences
    const profile = await authService.getProfile();
    if (!profile || !profile.companies) return;
    
    const prefs: NotificationPrefs = profile.companies.notification_prefs;
    const ownerEmail = profile.email;
    const ownerPhone = profile.companies.owner_phone || profile.phone || ""; // Fallback to profile phone
    
    // 2. Check Severity Threshold
    const severityValues = { 'LOW': 0, 'MEDIUM': 1, 'HIGH': 2, 'CRITICAL': 3 };
    if (severityValues[insight.severity] < severityValues[prefs.min_severity]) return;

    // 3. Check Quiet Hours
    if (this.isQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end)) {
      // Logic for quiet hours: we only bypass for CRITICAL alerts
      if (insight.severity !== 'CRITICAL') return;
    }

    // 4. Determine Channels
    const channels: string[] = [];
    if (insight.severity === 'CRITICAL') {
      if (prefs.whatsapp_enabled) channels.push('WHATSAPP');
      if (prefs.email_enabled) channels.push('EMAIL');
    } else if (insight.severity === 'HIGH') {
      if (prefs.whatsapp_enabled) channels.push('WHATSAPP');
    } else if (insight.severity === 'MEDIUM') {
      if (prefs.email_enabled) channels.push('EMAIL');
    }

    // 5. Execute Deliveries
    for (const channel of channels) {
      await this.deliver(insight, channel as any, channel === 'EMAIL' ? ownerEmail : ownerPhone);
    }
  },

  isQuietHours(start: string, end: string): boolean {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    if (start <= end) {
      return currentTime >= start && currentTime <= end;
    } else {
      // Over midnight case
      return currentTime >= start || currentTime <= end;
    }
  },

  async deliver(insight: AIInsight, channel: 'WHATSAPP' | 'EMAIL', target: string) {
    const client = getSupabase();
    if (!client) return;

    // Log the delivery attempt immediately
    const { data: log, error: logError } = await client
      .from('alert_deliveries')
      .insert({
        company_id: insight.company_id,
        insight_id: insight.id,
        channel,
        recipient_identity: target,
        status: 'SENT'
      })
      .select()
      .single();

    if (logError) {
      console.error("Failed to log delivery:", logError.message);
      return;
    }

    try {
      if (channel === 'WHATSAPP') {
        await this.sendWhatsApp(insight, target);
      } else {
        await this.sendEmail(insight, target);
      }

      // Mark success
      await client.from('alert_deliveries').update({ status: 'DELIVERED', delivered_at: new Date().toISOString() }).eq('id', log.id);
    } catch (e: any) {
      console.error(`Delivery failed on ${channel}:`, e.message);
      await client.from('alert_deliveries').update({ status: 'FAILED', error_message: e.message }).eq('id', log.id);
      
      // Fallback logic
      if (channel === 'WHATSAPP') {
        await this.deliver(insight, 'EMAIL', target); // Simple recursion fallback
      }
    }
  },

  async sendWhatsApp(insight: AIInsight, phone: string) {
    const client = getSupabase();
    if (!client) return;

    // 1. Log Outbound Message
    const { error: msgErr } = await client.from('whatsapp_messages').insert({
      company_id: insight.company_id,
      sender: 'SYSTEM',
      recipient: phone,
      message_body: `[ALERT] ${insight.title}: ${insight.summary}`,
      direction: 'OUTBOUND',
      status: 'SENT'
    });

    if (msgErr) console.error("WhatsApp Log Error:", msgErr.message);

    // 2. Simulated Meta API Call
    console.log(`[WHATSAPP-API] Sending Template to ${phone}: ${insight.title}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  },

  async sendEmail(insight: AIInsight, email: string) {
    // Simulated SMTP / SendGrid Handshake
    console.log(`[SMTP-API] Sending HTML Report to ${email}: ${insight.title}`);
    await new Promise(resolve => setTimeout(resolve, 800));
  }
};
