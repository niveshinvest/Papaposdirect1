import net from "net"
import os from "os"
import path from "path"
import { promises as fs } from "fs"
import { spawn } from "child_process"

export type LocalPrintJob = {
  documentType: "invoice" | "kot"
  printerName?: string | null
  printerType?: "LAN" | "USB" | "SYSTEM" | "BLUETOOTH" | null
  connectionHint?: string | null
  paperSize?: string | null
  plainText: string
}

type PrinterStatusRow = {
  Name?: string
  PortName?: string
  DriverName?: string
  Default?: boolean
}

const PRINT_SCRIPT_CANDIDATES = [
  path.resolve(__dirname, "..", "scripts", "print-text.ps1"),
  path.resolve(__dirname, "..", "..", "scripts", "print-text.ps1"),
  path.resolve(process.cwd(), "scripts", "print-text.ps1"),
  path.resolve(process.cwd(), "backend", "scripts", "print-text.ps1"),
]

async function resolvePrintScriptPath() {
  for (const candidate of PRINT_SCRIPT_CANDIDATES) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      continue
    }
  }

  throw new Error("Local print script not found.")
}

function runPowerShell(args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", ...args], {
      windowsHide: true,
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", chunk => {
      stdout += chunk.toString()
    })

    child.stderr.on("data", chunk => {
      stderr += chunk.toString()
    })

    child.on("error", reject)
    child.on("close", code => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error(stderr || `PowerShell exited with code ${code}`))
    })
  })
}

async function listWindowsPrinters() {
  if (process.platform !== "win32") {
    return []
  }

  const { stdout } = await runPowerShell([
    "-Command",
    "Get-Printer | Select-Object Name,PortName,DriverName,@{Name='Default';Expression={$_.Default}} | ConvertTo-Json -Depth 3",
  ])

  if (!stdout.trim()) {
    return []
  }

  const parsed = JSON.parse(stdout) as PrinterStatusRow | PrinterStatusRow[]
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows
    .filter(row => row?.Name)
    .map(row => ({
      name: String(row.Name),
      port: row.PortName ? String(row.PortName) : "",
      driver: row.DriverName ? String(row.DriverName) : "",
      isDefault: Boolean(row.Default),
    }))
}

function resolveLanDestination(connectionHint?: string | null) {
  const raw = String(connectionHint || "").trim()
  if (!raw) return null

  const normalized = raw
    .replace(/^tcp:\/\//i, "")
    .replace(/^socket:\/\//i, "")
    .replace(/^raw:\/\//i, "")

  const [hostPart, portPart] = normalized.split(":")
  if (!hostPart) return null

  const port = portPart ? Number(portPart) : 9100
  if (!Number.isFinite(port) || port <= 0) return null

  return {
    host: hostPart,
    port,
  }
}

async function printToLan(connectionHint: string, plainText: string) {
  const destination = resolveLanDestination(connectionHint)
  if (!destination) {
    throw new Error("LAN printer connection hint must be an IP or hostname, optionally with :port.")
  }

  const payload = Buffer.concat([
    Buffer.from([0x1b, 0x40]),
    Buffer.from(plainText.replace(/\n/g, "\r\n"), "ascii"),
    Buffer.from("\n\n\n", "ascii"),
    Buffer.from([0x1d, 0x56, 0x00]),
  ])

  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection(destination.port, destination.host, () => {
      socket.write(payload)
      socket.end()
    })

    socket.setTimeout(5000)
    socket.on("close", hadError => {
      if (!hadError) resolve()
    })
    socket.on("timeout", () => {
      socket.destroy(new Error("LAN printer connection timed out."))
    })
    socket.on("error", reject)
  })
}

async function printToWindowsPrinter(printerName: string, plainText: string, paperSize?: string | null) {
  if (process.platform !== "win32") {
    throw new Error("Silent Windows printing is only available on Windows.")
  }

  const tempFilePath = path.join(os.tmpdir(), `papapos-print-${Date.now()}.txt`)

  try {
    await fs.writeFile(tempFilePath, plainText, "utf8")
    const printScriptPath = await resolvePrintScriptPath()
    await runPowerShell([
      "-File",
      printScriptPath,
      "-PrinterName",
      printerName,
      "-FilePath",
      tempFilePath,
      "-PaperSize",
      String(paperSize || ""),
    ])
  } finally {
    await fs.unlink(tempFilePath).catch(() => undefined)
  }
}

export async function getLocalPrintAgentStatus() {
  if (process.platform !== "win32") {
    return {
      available: false,
      platform: process.platform,
      mode: "unsupported",
      supportsSilentSystemPrint: false,
      supportsLanRawPrint: false,
      message: "Local print agent is currently implemented for Windows only.",
      printers: [],
    }
  }

  const printers = await listWindowsPrinters()
  return {
    available: true,
    platform: process.platform,
    mode: "windows-local-agent",
    supportsSilentSystemPrint: true,
    supportsLanRawPrint: true,
    message: "Local print agent is online. Browser direct print is available for Windows system, USB, and supported LAN receipt printers.",
    printers,
  }
}

export async function printWithLocalAgent(job: LocalPrintJob) {
  const printerType = String(job.printerType || "").toUpperCase()

  if (printerType === "LAN" && job.connectionHint) {
    await printToLan(job.connectionHint, job.plainText)
    return {
      route: "lan-raw",
      printer: job.connectionHint,
    }
  }

  let printerName = String(job.printerName || "").trim()
  if (!printerName) {
    const printers = await listWindowsPrinters()
    printerName = printers.find(printer => printer.isDefault)?.name || printers[0]?.name || ""
  }
  if (!printerName) {
    throw new Error("A printer name is required for Windows spool printing.")
  }

  await printToWindowsPrinter(printerName, job.plainText, job.paperSize)
  return {
    route: "windows-spooler",
    printer: printerName,
  }
}
