const { contextBridge, ipcRenderer } = require('electron');

/**
 * Electron Preload Script
 * Safely exposes IPC to the WebView
 */
contextBridge.exposeInMainWorld('ipcRenderer', {
    invoke: (channel, data) => {
        const validChannels = ['print-invoice', 'get-printers'];
        if (validChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, data);
        }
        return Promise.reject(new Error(`Invalid IPC channel: ${channel}`));
    }
});
