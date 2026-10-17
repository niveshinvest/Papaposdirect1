export function extractRateLimitsFromAuth(auth: any) {
  if (!auth) return { rate_limit: 0, rate_limit_window: 'day' }
  return { rate_limit: Number(auth.rate_limit) || 0, rate_limit_window: auth.rate_limit_window || 'day' }
}
