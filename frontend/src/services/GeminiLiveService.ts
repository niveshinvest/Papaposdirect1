
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from "@google/genai";
import { MenuItem } from "../types";

//const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
/* const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!
})*/
const ai = new GoogleGenAI({
  apiKey: import.meta.env.VITE_GEMINI_KEY
})

/*export const ai = async (prompt: string) => {
  const response = await fetch(
    "http://localhost:10000/api/admin/generate",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt })
    }
  )

  const data = await response.json()

  return data.text
} */

export interface GeminiLiveCallbacks {
  onStatusChange: (status: string) => void;
  onTranscript: (text: string, isUser: boolean) => void;
  onToolCall: (name: string, args: any) => void;
  onError: (error: string) => void;
  onClose: () => void;
}

export class GeminiLiveService {
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private audioQueue: Float32Array[] = [];
  private isPlaying = false;

  constructor(private menuItems: MenuItem[], private callbacks: GeminiLiveCallbacks) {}

  private getToolDeclarations(): FunctionDeclaration[] {
    return [
      {
        name: "addItem",
        description: "Add one or more items to the shopping cart.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "The name of the item to add." },
            quantity: { type: Type.NUMBER, description: "The quantity to add (default is 1)." }
          },
          required: ["name"]
        }
      },
      {
        name: "removeItem",
        description: "Remove an item from the shopping cart.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "The name of the item to remove." }
          },
          required: ["name"]
        }
      },
      {
        name: "updateQuantity",
        description: "Update the quantity of an item already in the cart.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "The name of the item to update." },
            quantity: { type: Type.NUMBER, description: "The new total quantity." }
          },
          required: ["name", "quantity"]
        }
      },
      {
        name: "confirmBill",
        description: "Finalize the order and print the bill.",
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: "openCart",
        description: "Open the cart or checkout panel for the cashier.",
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: "openPayments",
        description: "Open the payment mode picker.",
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: "showTables",
        description: "Open the table selector for dine-in orders.",
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: "focusSearch",
        description: "Search the menu for a requested item or category.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: "The search term to apply in the POS menu search." }
          },
          required: ["query"]
        }
      }
    ];
  }

  async connect() {
    try {
      this.callbacks.onStatusChange("Connecting...");
      
      const menuContext = this.menuItems.map(item => `${item.name} (₹${item.price})`).join(", ");
      const systemInstruction = `You are PapaPOS Voice Assistant. You help restaurant staff manage orders and navigate the POS. 
      Available menu: ${menuContext}. 
      Be concise and professional. Confirm actions clearly. 
      Greet the user warmly when the session begins and offer help with billing, tables, payments, cart, and search.
      If an item is not in the menu, inform the user.
      Use tools whenever the user wants to open cart, payment options, tables, or search results.`;

      this.sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } }
          },
          systemInstruction,
          tools: [{ functionDeclarations: this.getToolDeclarations() }]
        },
        callbacks: {
          onopen: () => {
            this.callbacks.onStatusChange("Listening...");
            this.startAudioCapture();
          },
          onmessage: async (message: LiveServerMessage) => {
            this.handleMessage(message);
          },
          onerror: (error) => {
            this.callbacks.onError(error.message);
          },
          onclose: () => {
            this.stopAudioCapture();
            this.callbacks.onClose();
          }
        }
      });
    } catch (error: any) {
      this.callbacks.onError(error.message);
    }
  }

  private async handleMessage(message: LiveServerMessage) {
    // Handle Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      this.queueAudio(base64Audio);
    }

    // Handle Interruption
    if (message.serverContent?.interrupted) {
      this.audioQueue = [];
      this.isPlaying = false;
    }

    // Handle Tool Calls
    const toolCalls = message.toolCall?.functionCalls;
    if (toolCalls && this.sessionPromise) {
      const session = await this.sessionPromise;
      for (const call of toolCalls) {
        this.callbacks.onToolCall(call.name, call.args);
        // Send response back to Gemini
        session.sendToolResponse({
          functionResponses: [{
            name: call.name,
            response: { result: "success" },
            id: call.id
          }]
        });
      }
    }
  }

  private async startAudioCapture() {
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.source = this.audioContext.createMediaStreamSource(stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      // Convert Float32 to Int16 PCM
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
      }
      // Convert to Base64
      const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
      
      if (this.sessionPromise) {
        this.sessionPromise.then(session => {
          session.sendRealtimeInput({
            media: { data: base64Data, mimeType: "audio/pcm;rate=16000" }
          });
        });
      }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  private stopAudioCapture() {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.audioContext?.close();
  }

  private queueAudio(base64Data: string) {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const pcmData = new Int16Array(bytes.buffer);
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 0x7FFF;
    }
    this.audioQueue.push(floatData);
    if (!this.isPlaying) {
      this.playNextInQueue();
    }
  }

  private async playNextInQueue() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const data = this.audioQueue.shift()!;
    const context = new AudioContext({ sampleRate: 24000 });
    const buffer = context.createBuffer(1, data.length, 24000);
    buffer.getChannelData(0).set(data);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => {
      context.close();
      this.playNextInQueue();
    };
    source.start();
  }

  disconnect() {
    if (this.sessionPromise) {
      this.sessionPromise.then(session => session.close());
    }
    this.stopAudioCapture();
  }
}
