
/**
 * Generic PostgreSQL Sync Service
 * This service uses standard fetch calls to communicate with a RESTful proxy 
 * that connects to a native PostgreSQL database.
 */

export interface PostgresConfig {
  baseUrl: string;
  authToken: string;
}

let config: PostgresConfig | null = null;

export const initPostgresSync = (url: string, token: string) => {
  if (!url) return;
  config = {
    baseUrl: url.endsWith('/') ? url.slice(0, -1) : url,
    authToken: token
  };
};

export const testPostgresConnection = async (url: string, token: string) => {
  try {
    const response = await fetch(`${url}/health`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    return { success: true };
  } catch (e: any) {
    // Note: If the user hasn't built their backend yet, this will fail.
    // For the demo, we'll return success if the URL "looks" valid but provide a warning.
    console.warn("Postgres Proxy check failed. Ensure your backend is running at:", url);
    return { success: false, message: e.message };
  }
};

/**
 * Pushes local Dexie data to the Postgres Proxy
 */
export const syncTableToPostgres = async (tableName: string, data: any[]) => {
  if (!config) return;

  try {
    const response = await fetch(`${config.baseUrl}/sync/${tableName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Postgres Sync Failed: ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Postgres Sync Error [${tableName}]:`, error);
    throw error;
  }
};
