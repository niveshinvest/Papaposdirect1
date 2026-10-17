export const webauthnService = {
  async registerOptions() {
    const res = await fetch('/webauthn/register/options', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    return res.json();
  },

  async registerVerify(attestation: any) {
    const res = await fetch('/webauthn/register/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attestation) });
    return res.json();
  },

  async authOptions(email: string) {
    const res = await fetch('/webauthn/authenticate/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    return res.json();
  },

  async authVerify(profile_id: string, assertion: any) {
    const res = await fetch('/webauthn/authenticate/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile_id, assertion }) });
    return res.json();
  }
,

  async exchangeToken(exchange_token: string) {
    const res = await fetch('/webauthn/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exchange_token }) });
    return res.json();
  }
}
