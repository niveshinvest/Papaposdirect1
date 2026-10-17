import express from 'express'
import adminRoutes from './admin'

const router = express.Router()

router.use('/admin', adminRoutes)

router.get('/', (_, res) => res.json({ ok: true }))

export default router
