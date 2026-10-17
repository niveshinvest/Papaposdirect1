import express from "express"
import { getLocalPrintAgentStatus, printWithLocalAgent } from "../services/localPrintAgent"

const router = express.Router()

router.get("/status", async (_req, res) => {
  try {
    const status = await getLocalPrintAgentStatus()
    res.json(status)
  } catch (error: any) {
    res.status(500).json({
      available: false,
      error: error.message,
    })
  }
})

router.post("/print", async (req, res) => {
  const body = req.body || {}

  if (!body.plainText) {
    return res.status(400).json({ error: "plainText is required" })
  }

  try {
    const result = await printWithLocalAgent({
      documentType: body.documentType === "kot" ? "kot" : "invoice",
      printerName: body.printerName || null,
      printerType: body.printerType || null,
      connectionHint: body.connectionHint || null,
      paperSize: body.paperSize || null,
      plainText: String(body.plainText),
    })

    res.json({
      success: true,
      ...result,
    })
  } catch (error: any) {
    res.status(400).json({
      error: error.message,
    })
  }
})

export default router
