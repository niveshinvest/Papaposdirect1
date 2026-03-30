import { Router } from "express"

const router = Router()

router.get("/staff", async (req, res) => {
  res.status(410).json({
    error: "Deprecated route. Staff data must be served through the backend central authority.",
  })
})

export default router
