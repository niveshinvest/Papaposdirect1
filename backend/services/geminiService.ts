import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY as string
)

export const generateAI = async (prompt: string) => {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash"
  })

  const result = await model.generateContent(prompt)

  return result.response.text()
}