import express from 'express'
import salesRoutes from './sales'
import productsRoutes from './products'
import inventoryRoutes from './inventory'
import aiInventoryRoutes from './ai-inventory'

const router = express.Router()

router.use('/sales', salesRoutes)
router.use('/products', productsRoutes)
router.use('/inventory', inventoryRoutes)
router.use('/inventory/ai', aiInventoryRoutes)

// Generic health
router.get('/', (_, res) => res.json({ ok: true, version: '1.0' }))

export default router
