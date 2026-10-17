// routes/externalApi.ts
import express from "express";
import { apiKeyMiddleware } from "../middleware/apiKeyMiddleware";
import  getSales  from "./public-api/sales";
import  getProducts  from "./public-api/products";
import  getInventory  from "./public-api/inventory";


const router = express.Router();

// 🔐 apply API key middleware to EVERYTHING in /api
router.use(apiKeyMiddleware);

router.get("/sales", getSales);
router.get("/products", getProducts);
router.get("/inventory", getInventory);

export default router;