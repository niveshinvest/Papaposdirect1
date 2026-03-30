import express from "express"
import { generateAI } from "../services/geminiService"

const router = express.Router()

router.post("/generate", async (req, res) => {
  try {
    const { prompt } = req.body

    const response = await generateAI(prompt)

    res.json({ text: response })

  } catch (error:any) {
    res.status(500).json({
      error: error.message
    })
  }
})

export default router