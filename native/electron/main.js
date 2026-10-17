const { app, BrowserWindow } = require('electron');
const path = require('path');

// Import the Print Service
require('./main-print-service');

/**
 * Electron Main Process
 * Bootstraps the PapaPOS desktop experience
 */
function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            // Preload script is required for secure IPC communication
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Replace with your actual hosted URL or local build path
    win.loadURL('https://ais-pre-du5fsgxou56ptfxwxgdin7-31083452987.asia-southeast1.run.app');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
