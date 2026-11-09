import "dotenv/config";
import { MongoClient } from "mongodb";
import cron from "node-cron";
import crypto from "crypto";

const ORANGE = "\x1b[38;5;208m";
const RESET = "\x1b[0m";

const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
    originalLog(`${ORANGE}[LIVE-DB-FEEDER-SERVICE]${RESET}`, ...args);
};

console.error = (...args) => {
    originalError(`${ORANGE}[LIVE-DB-FEEDER-SERVICE]${RESET}`, ...args);
};


const client = new MongoClient(process.env.MONGODB_URI || `mongodb+srv://ms555app_db_user:l5MztOUjHXml6KKI@c0.uoosfng.mongodb.net/`);

const INSERTED_BY = "bijay";

const PRODUCTS_PER_RUN = 5;
const INVENTORY_PER_PRODUCT = 5;
const REPLENISHMENTS_PER_PRODUCT = 5;
const PROMOTIONS_PER_PRODUCT = 2;
const SALES_PER_DAY = 5;
const FUTURE_DAYS = 5;

const randomInt = (min, max) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

const randomItem = (items) => items[randomInt(0, items.length - 1)];

const round2 = (value) => Math.round(value * 100) / 100;

function startOfUtcDay(date) {
    return new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
}

function addDays(date, days) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

function randomDateBetween(start, end) {
    const min = start.getTime();
    const max = end.getTime();

    return new Date(randomInt(min, max));
}

function getWeekBounds(date) {
    const start = startOfUtcDay(date);
    const day = start.getUTCDay();

    start.setUTCDate(start.getUTCDate() - ((day + 6) % 7));

    return {
        start,
        end: addDays(start, 7),
    };
}

function createBatchId(now) {
    const timestamp = now
        .toISOString()
        .replace(/[-:.TZ]/g, "")
        .slice(0, 14);

    const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();

    return `BATCH-${timestamp}-${suffix}`;
}

// -------------------------------------
// Synthetic product catalog
// -------------------------------------

const catalog = [
    {
        name: "Basmati Rice",
        category: "Grocery",
        sub_category: "Rice",
        brands: ["India Gate", "Daawat", "Fortune"],
        units: ["1kg", "5kg", "10kg"],
        pricePerUnit: [100, 150],
        skuPrefix: "GRO-RIC",
        gst: 5,
        shelfLifeDays: [365, 730],
    },
    {
        name: "Wheat Flour",
        category: "Grocery",
        sub_category: "Flour",
        brands: ["Aashirvaad", "Pillsbury", "Fortune"],
        units: ["1kg", "5kg", "10kg"],
        pricePerUnit: [35, 65],
        skuPrefix: "GRO-FLO",
        gst: 5,
        shelfLifeDays: [120, 240],
    },
    {
        name: "Sunflower Oil",
        category: "Grocery",
        sub_category: "Cooking Oil",
        brands: ["Fortune", "Saffola", "Gold Winner"],
        units: ["1L", "2L", "5L"],
        pricePerUnit: [120, 180],
        skuPrefix: "GRO-OIL",
        gst: 5,
        shelfLifeDays: [180, 365],
    },
    {
        name: "Shampoo",
        category: "Personal Care",
        sub_category: "Hair Care",
        brands: ["Dove", "Sunsilk", "Tresemme"],
        units: ["180ml", "340ml", "650ml"],
        pricePerUnit: [0.5, 1.2],
        skuPrefix: "PER-HAI",
        gst: 18,
        shelfLifeDays: [540, 900],
    },
    {
        name: "Toothpaste",
        category: "Personal Care",
        sub_category: "Oral Care",
        brands: ["Colgate", "Pepsodent", "Sensodyne"],
        units: ["100g", "150g", "200g"],
        pricePerUnit: [0.5, 1.5],
        skuPrefix: "PER-ORA",
        gst: 18,
        shelfLifeDays: [540, 900],
    },
    {
        name: "Cookies",
        category: "Grocery",
        sub_category: "Biscuits",
        brands: ["Britannia", "Sunfeast", "Parle"],
        units: ["100g", "200g", "400g"],
        pricePerUnit: [0.15, 0.5],
        skuPrefix: "GRO-BIS",
        gst: 18,
        shelfLifeDays: [120, 270],
    },
    {
        name: "Laundry Detergent",
        category: "Home Care",
        sub_category: "Laundry",
        brands: ["Surf Excel", "Ariel", "Tide"],
        units: ["500g", "1kg", "2kg"],
        pricePerUnit: [80, 200],
        skuPrefix: "HOM-LAU",
        gst: 18,
        shelfLifeDays: [540, 900],
    },
];

// -------------------------------------
// Product generation
// -------------------------------------

function calculatePrice(item, unit) {
    const quantity = parseFloat(unit);

    let multiplier = quantity;

    if (unit.endsWith("kg") || unit.endsWith("L")) {
        multiplier = quantity;
    } else if (unit.endsWith("g") || unit.endsWith("ml")) {
        multiplier = quantity;
    }

    const basePrice =
        randomInt(
            Math.round(item.pricePerUnit[0] * 100),
            Math.round(item.pricePerUnit[1] * 100),
        ) / 100;

    const sp = Math.round(basePrice * multiplier);

    const margin = randomInt(12, 30);

    const cp = round2(sp / (1 + margin / 100));

    const mrp = round2(sp * (1 + randomInt(5, 20) / 100));

    return {
        mrp,
        cp,
        sp,
        currency: "INR",
        margin_percentage: round2(((sp - cp) / cp) * 100),
        gst_percentage: item.gst,
    };
}

function createProduct(productCode, now, metadata) {
    const item = randomItem(catalog);
    const brand = randomItem(item.brands);
    const unit = randomItem(item.units);

    const manufacturedAt = addDays(now, -randomInt(10, 90));

    const shelfLife = randomInt(item.shelfLifeDays[0], item.shelfLifeDays[1]);

    const expiryDate = addDays(manufacturedAt, shelfLife);

    const pricing = calculatePrice(item, unit);

    return {
        product_id: productCode,

        sku: `${item.skuPrefix}-${productCode.split("-")[1]}`,

        name: `${brand} ${item.name} ${unit}`,

        description: `${brand} ${item.name}, ${unit} pack`,

        category: item.category,
        sub_category: item.sub_category,
        brand,
        variant: "Regular",

        // Synthetic manufacturer information
        manufacturer: `${brand} Consumer Products India Ltd`,

        pricing,

        unit,

        inventory: {
            stock_quantity: 0,
            minimum_stock_level: randomInt(15, 30),
            stock_status: "out_of_stock",
            warehouse_code: `WH-0${randomInt(1, 3)}`,
        },

        batch: {
            batch_number: `BATCH-${randomInt(100000, 999999)}`,
            manufactured_at: manufacturedAt,
            expiry_date: expiryDate,
        },

        status: "active",
        created_at: now,
        updated_at: now,

        ...metadata,
    };
}

// -------------------------------------
// Generate next product ID
// -------------------------------------

async function getNextProductNumber(db) {
    const products = await db
        .collection("products")
        .find({
            product_id: /^PROD-\d+$/,
        })
        .project({ product_id: 1 })
        .toArray();

    let maxNumber = 0;

    for (const product of products) {
        const number = Number(product.product_id.split("-")[1]);

        if (number > maxNumber) {
            maxNumber = number;
        }
    }

    return maxNumber + 1;
}

// -------------------------------------
// Main generation
// -------------------------------------

async function generateData() {
    const db = client.db(process.env.DB_NAME || `retail_inventory_db`);

    const productsCollection = db.collection("products");
    const inventoryCollection = db.collection("inventory");
    const replenishmentsCollection = db.collection("replenishments");
    const promotionsCollection = db.collection("promotions");
    const salesCollection = db.collection("sales");

    const now = new Date();
    const today = startOfUtcDay(now);
    const week = getWeekBounds(now);

    const batchId = createBatchId(now);

    const metadata = {
        inserted_by: INSERTED_BY,
        generation_batch_id: batchId,
    };

    console.log(`\nJob Live DB feeder started: ${now.toISOString()}`);
    console.log(`Batch: ${batchId}`);

    const nextProductNumber = await getNextProductNumber(db);

    // -------------------------------------
    // 1. Generate products
    // -------------------------------------

    const products = [];

    for (let i = 0; i < PRODUCTS_PER_RUN; i++) {
        const productCode = `PROD-${String(nextProductNumber + i).padStart(5, "0")}`;

        products.push(createProduct(productCode, now, metadata));
    }

    const productResult = await productsCollection.insertMany(products);

    const inventoryRecords = [];
    const replenishmentRecords = [];
    const promotionRecords = [];
    const salesRecords = [];

    // Product stock updates are deferred until
    // related records have been generated.
    const stockUpdates = [];

    for (let i = 0; i < products.length; i++) {
        const product = products[i];
        const productObjectId = productResult.insertedIds[i];

        // -------------------------------------
        // 2. Inventory
        // -------------------------------------

        let initialStock = 0;

        for (let j = 0; j < INVENTORY_PER_PRODUCT; j++) {
            const quantity = randomInt(5, 20);

            initialStock += quantity;

            inventoryRecords.push({
                product_id: productObjectId,
                quantity,
                type: "add",
                created_at: now,
                updated_at: now,
                ...metadata,
            });
        }

        // -------------------------------------
        // 3. Future replenishments
        // -------------------------------------

        const productReplenishments = [];

        for (let day = 1; day <= FUTURE_DAYS; day++) {
            const date = addDays(today, day);

            // Replenishment occurs in the morning.
            const start = new Date(date);
            start.setUTCHours(6, 0, 0, 0);

            const end = new Date(date);
            end.setUTCHours(10, 0, 0, 0);

            const time = randomDateBetween(start, end);

            const quantity = randomInt(5, 20);

            const replenishment = {
                product_id: productObjectId,
                quantity,
                time,
                created_at: now,
                updated_at: now,
                ...metadata,
            };

            replenishmentRecords.push(replenishment);
            productReplenishments.push(replenishment);
        }

        // -------------------------------------
        // 4. Promotions
        // -------------------------------------

        const productPromotions = [];

        for (let j = 0; j < PROMOTIONS_PER_PRODUCT; j++) {
            const startDay = randomInt(0, 5);

            const startDate = addDays(week.start, startDay);

            const maxDuration = 7 - startDay;

            const duration = randomInt(1, maxDuration);

            const endDate = addDays(startDate, duration);

            const promotion = {
                product_id: productObjectId,

                promo_code: `PROMO-${product.product_id}-${batchId.slice(-8)}-${j + 1}`,

                discount_percentage: randomInt(10, 50),

                start_date: startDate,
                end_date: endDate,

                active: now >= startDate && now < endDate,

                created_at: now,
                updated_at: now,

                ...metadata,
            };

            promotionRecords.push(promotion);
            productPromotions.push(promotion);
        }

        // -------------------------------------
        // 5. Sales
        // -------------------------------------

        let simulatedStock = initialStock;
        let todaySalesQuantity = 0;

        for (let day = 0; day <= FUTURE_DAYS; day++) {
            const saleDate = addDays(today, day);

            const dayStart = new Date(saleDate);
            dayStart.setUTCHours(10, 0, 0, 0);

            const dayEnd = new Date(saleDate);
            dayEnd.setUTCHours(22, 0, 0, 0);

            // Apply replenishments available before sales.
            if (day > 0) {
                const availableReplenishments = productReplenishments.filter(
                    (r) => r.time >= saleDate && r.time < addDays(saleDate, 1),
                );

                for (const replenishment of availableReplenishments) {
                    simulatedStock += replenishment.quantity;
                }
            }

            // Generate sales in chronological order.
            const saleTimes = [];

            for (let j = 0; j < SALES_PER_DAY; j++) {
                const saleTime = randomDateBetween(dayStart, dayEnd);

                // Avoid generating today's sales in the past.
                if (day === 0 && saleTime < now) {
                    saleTimes.push(new Date(now));
                } else {
                    saleTimes.push(saleTime);
                }
            }

            saleTimes.sort((a, b) => a - b);

            for (const saleTime of saleTimes) {
                if (simulatedStock <= 0) {
                    break;
                }

                const maxSaleQuantity = Math.min(10, simulatedStock);

                const quantity = randomInt(1, maxSaleQuantity);

                const applicablePromotions = productPromotions.filter(
                    (promo) => saleTime >= promo.start_date && saleTime < promo.end_date,
                );

                const selectedPromo =
                    applicablePromotions.length > 0
                        ? randomItem(applicablePromotions)
                        : null;

                salesRecords.push({
                    product_id: productObjectId,
                    product_code: product.product_id,

                    quantity,

                    promo_code: selectedPromo?.promo_code ?? null,

                    promotion_id: null,

                    created_at: saleTime,
                    generated_at: now,
                    updated_at: now,

                    ...metadata,
                });

                simulatedStock -= quantity;

                if (day === 0) {
                    todaySalesQuantity += quantity;
                }
            }
        }

        // -------------------------------------
        // 6. Current stock calculation
        // -------------------------------------

        const currentStock = initialStock - todaySalesQuantity;

        const minimumStock = product.inventory.minimum_stock_level;

        const stockStatus =
            currentStock <= 0
                ? "out_of_stock"
                : currentStock <= minimumStock
                    ? "low_stock"
                    : "in_stock";

        stockUpdates.push({
            updateOne: {
                filter: {
                    _id: productObjectId,
                    inserted_by: INSERTED_BY,
                    generation_batch_id: batchId,
                },
                update: {
                    $set: {
                        "inventory.stock_quantity": currentStock,
                        "inventory.stock_status": stockStatus,
                        updated_at: now,
                    },
                },
            },
        });
    }

    // -------------------------------------
    // 7. Insert generated records
    // -------------------------------------

    if (inventoryRecords.length > 0) {
        await inventoryCollection.insertMany(inventoryRecords);
    }

    if (replenishmentRecords.length > 0) {
        await replenishmentsCollection.insertMany(replenishmentRecords);
    }

    const promoResult = await promotionsCollection.insertMany(promotionRecords);

    // Map promotion IDs.
    const promoIdByCode = new Map();

    promotionRecords.forEach((promo, index) => {
        promoIdByCode.set(promo.promo_code, promoResult.insertedIds[index]);
    });

    for (const sale of salesRecords) {
        if (sale.promo_code) {
            sale.promotion_id = promoIdByCode.get(sale.promo_code) ?? null;
        }
    }

    if (salesRecords.length > 0) {
        await salesCollection.insertMany(salesRecords);
    }

    if (stockUpdates.length > 0) {
        await productsCollection.bulkWrite(stockUpdates);
    }

    // -------------------------------------
    // Summary
    // -------------------------------------

    console.log("\nGeneration completed successfully.");

    console.log(`Batch: ${batchId}`);
    console.log(`Products: ${products.length}`);
    console.log(`Inventory: ${inventoryRecords.length}`);
    console.log(`Replenishments: ${replenishmentRecords.length}`);
    console.log(`Promotions: ${promotionRecords.length}`);
    console.log(`Sales: ${salesRecords.length}`);
}

// -------------------------------------
// Scheduler
// -------------------------------------

let isRunning = false;

async function executeJob() {
    if (isRunning) {
        console.log("Live DB feeder still running. Skipping.");
        return;
    }

    isRunning = true;

    try {
        await generateData();
    } catch (error) {
        console.error("Live DB feeder failed:", error);
    } finally {
        isRunning = false;
    }
}

async function start() {

    await client.connect();

    await client.db("admin").command({ ping: 1 });

    console.log("MongoDB connected.");

    cron.schedule("*/5 * * * *", executeJob, { timezone: "UTC" });

    console.log("Cron scheduled: every 5 minutes.");

    // Run immediately on startup.
    await executeJob();
}

async function shutdown() {
    console.log("Shutting down Live DB feeder ...");

    await client.close();

    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start().catch(async (error) => {
    console.error("Live DB feeder Startup failed:", error);

    await client.close();

    process.exit(1);
});
