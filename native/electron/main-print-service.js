const { ipcMain, BrowserWindow } = require('electron');
const path = require('path');

/**
 * Electron Print Service (Main Process)
 * Handles silent printing via IPC
 */
ipcMain.handle('print-invoice', async (event, { html, printerName, silent = true, pageSize }) => {
    try {
        // Create a hidden window for printing
        let printWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: false
            }
        });

        // Load the HTML content
        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

        // Wait for content to be ready
        await new Promise(resolve => {
            printWindow.webContents.once('did-finish-load', resolve);
        });

        // Execute print
        return new Promise((resolve, reject) => {
            printWindow.webContents.print({
                silent: silent,
                printBackground: true,
                deviceName: printerName || '', // Uses default if empty
                pageSize: pageSize || undefined,
            }, (success, failureReason) => {
                printWindow.close();
                if (success) {
                    resolve({ success: true });
                } else {
                    reject(new Error(failureReason));
                }
            });
        });
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-printers', async () => {
    const win = BrowserWindow.getFocusedWindow();
    return await win.webContents.getPrintersAsync();
});
