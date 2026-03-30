package com.papapos.bridge;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.OutputStream;
import java.util.UUID;

/**
 * PapaPrint Android Native Bridge
 * Exposes window.PapaPrint to the WebView
 */
public class PapaPrintBridge {
    private WebView webView;
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805f9b34fb");

    public PapaPrintBridge(WebView webView) {
        this.webView = webView;
    }

    @JavascriptInterface
    public void print(String invoiceJson) {
        try {
            JSONObject invoice = new JSONObject(invoiceJson);
            String macAddress = invoice.optString("macAddress"); // Pre-paired printer MAC
            
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null || !adapter.isEnabled()) {
                sendResultToWeb("FAILURE", "Bluetooth is disabled");
                return;
            }

            BluetoothDevice device = adapter.getRemoteDevice(macAddress);
            BluetoothSocket socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
            socket.connect();

            OutputStream out = socket.getOutputStream();
            
            // ESC/POS Commands
            byte[] ESC_INIT = {0x1B, 0x40};
            byte[] ESC_ALIGN_CENTER = {0x1B, 0x61, 0x01};
            byte[] ESC_ALIGN_LEFT = {0x1B, 0x61, 0x00};
            byte[] GS_FONT_DOUBLE = {0x1D, 0x21, 0x11}; // Double height & width
            byte[] GS_FONT_NORMAL = {0x1D, 0x21, 0x00};
            
            out.write(ESC_INIT);
            out.write(ESC_ALIGN_CENTER);
            out.write(GS_FONT_DOUBLE);
            out.write((invoice.getString("seller_legal_name") + "\n").getBytes());
            out.write(GS_FONT_NORMAL);
            out.write((invoice.getString("seller_trade_name") + "\n").getBytes());
            out.write((invoice.getString("invoice_number") + "\n").getBytes());
            out.write("--------------------------------\n".getBytes());
            
            // Loop through items and print
            org.json.JSONArray items = invoice.getJSONArray("items");
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.getJSONObject(i);
                String name = item.getString("name");
                int qty = item.getInt("quantity");
                double price = item.getDouble("total_amount");
                
                // Format: Item Name (max 20 chars) | Qty | Price
                String namePart = name.length() > 20 ? name.substring(0, 17) + "..." : name;
                String line = String.format("%-20s %2d %8.2f\n", namePart, qty, price);
                out.write(line.getBytes());
            }
            
            out.write("--------------------------------\n".getBytes());
            
            // Totals
            out.write(String.format("SUBTOTAL: %22.2f\n", invoice.getDouble("subtotal")).getBytes());
            out.write(String.format("TAX:      %22.2f\n", invoice.getDouble("total_tax")).getBytes());
            
            out.write(GS_FONT_DOUBLE);
            out.write(String.format("TOTAL:    %10.2f\n", invoice.getDouble("grand_total")).getBytes());
            out.write(GS_FONT_NORMAL);
            
            out.write("--------------------------------\n".getBytes());
            out.write(ESC_ALIGN_CENTER);
            out.write("THANK YOU! VISIT AGAIN\n".getBytes());
            out.write(ESC_ALIGN_LEFT);
            
            out.write("\n\n\n".getBytes());
            byte[] PAPER_CUT = {0x1D, 0x56, 0x00};
            out.write(PAPER_CUT);
            
            out.flush();
            socket.close();
            
            sendResultToWeb("SUCCESS", "Printed successfully");
        } catch (Exception e) {
            sendResultToWeb("FAILURE", e.getMessage());
        }
    }

    private void sendResultToWeb(final String status, final String message) {
        webView.post(() -> {
            webView.evaluateJavascript(
                String.format("window.onPapaPrintResult('%s', '%s')", status, message),
                null
            );
        });
    }
}
