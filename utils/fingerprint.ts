
/**
 * Simple device fingerprint utility for PapaPOS
 * Generates a stable ID based on browser/hardware characteristics
 */
export const getDeviceFingerprint = async (): Promise<string> => {
  const navigator_info = window.navigator;
  const screen_info = window.screen;
  
  let fingerprint = [
    navigator_info.userAgent,
    navigator_info.language,
    screen_info.colorDepth,
    screen_info.width + 'x' + screen_info.height,
    new Date().getTimezoneOffset(),
    navigator_info.platform,
    // Add more entropy if needed
  ].join('###');

  // Simple hash function to create a shorter, cleaner ID
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Return as hex string
  return 'PP-' + Math.abs(hash).toString(16).toUpperCase();
};

/**
 * Get or generate a persistent device ID stored in localStorage
 */
export const getPersistentDeviceId = async (): Promise<string> => {
  let deviceId = localStorage.getItem('papapos_device_id');
  
  if (!deviceId) {
    deviceId = await getDeviceFingerprint();
    localStorage.setItem('papapos_device_id', deviceId);
  }
  
  return deviceId;
};
