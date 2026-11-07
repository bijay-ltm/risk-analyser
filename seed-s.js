import "dotenv/config";
import { MongoClient } from "mongodb";

const MONGO_URI = `mongodb+srv://ms555app_db_user:l5MztOUjHXml6KKI@c0.uoosfng.mongodb.net/`;

const DB_NAME = "retail_inventory_db";

const START_DATE = new Date("2024-01-01T00:00:00.000Z");
const END_DATE = new Date("2026-11-06T23:59:59.999Z");

const SALES_BATCH_SIZE = Number(
  process.env.SALES_BATCH_SIZE || 2000
);

const PRODUCT_BATCH_SIZE = Number(
  process.env.PRODUCT_BATCH_SIZE || 100
);

const PRODUCT_CONCURRENCY = Number(
  process.env.PRODUCT_CONCURRENCY || 5
);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

if (!MONGO_URI) {
  throw new Error("MONGO_URI is missing in the .env file");
}

const client = new MongoClient(MONGO_URI, {
  maxPoolSize: 20,
  minPoolSize: 2
});

const statistics = {
  productsProcessed: 0,
  productsFailed: 0,
  productDaysProcessed: 0,
  salesInsertedOrUpdated: 0,
  normalSales: 0,
  promotionalSales: 0,
  skippedInsufficientStock: 0,
  skippedNoStock: 0
};

/*
Important correction:

Replenishment increases inventory.

Correct equation:
endingStock = currentStock + replenishmentQuantity - saleQuantity

Normal day:
endingStock >= 5

Promotion day:
endingStock >= 0
*/

function startOfUtcDay(value) {
  const date = new Date(value);

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    )
  );
}

function toDayKey(value) {
  return startOfUtcDay(value)
    .toISOString()
    .slice(0, 10);
}

function addUtcDays(date, numberOfDays) {
  return new Date(date.getTime() + numberOfDays * ONE_DAY_MS);
}

function toValidNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function randomInteger(minimum, maximum) {
  if (maximum < minimum) {
    return minimum;
  }

  return Math.floor(
    Math.random() * (maximum - minimum + 1)
  ) + minimum;
}

function createBaseDailySales(product) {
  const sellingPrice = toValidNumber(
    product?.pricing?.sp,
    100
  );

  const categoryMultiplier = {
    Beverages: 1.3,
    Dairy: 1.25,
    Snacks: 1.2,
    Bakery: 1.15,
    Grocery: 1
  };

  const categoryFactor =
    categoryMultiplier[product.category] || 1;

  let baseSales;

  if (sellingPrice <= 100) {
    baseSales = randomInteger(8, 30);
  } else if (sellingPrice <= 300) {
    baseSales = randomInteger(4, 20);
  } else {
    baseSales = randomInteger(2, 12);
  }

  return Math.max(
    1,
    Math.round(baseSales * categoryFactor)
  );
}

function generateCandidateSale({
  baseDailySales,
  availableStock,
  minimumRemainingStock,
  promotion
}) {
  if (availableStock <= minimumRemainingStock) {
    return 0;
  }

  const minimumMultiplier = promotion
    ? 1
    : 0.7;

  const maximumMultiplier = promotion
    ? 1.8
    : 1.3;

  const minimumCandidate = Math.max(
    1,
    Math.floor(baseDailySales * minimumMultiplier)
  );

  const maximumCandidate = Math.max(
    minimumCandidate,
    Math.ceil(baseDailySales * maximumMultiplier)
  );

  const candidateSale = randomInteger(
    minimumCandidate,
    maximumCandidate
  );

  const maximumAllowedSale =
    availableStock - minimumRemainingStock;

  if (maximumAllowedSale <= 0) {
    return 0;
  }

  /*
  A portion of product-days intentionally have no sale,
  which makes the generated data less uniform.
  */
  const noSaleProbability = promotion
    ? 0.02
    : 0.05;

  if (Math.random() < noSaleProbability) {
    return 0;
  }

  return Math.min(candidateSale, maximumAllowedSale);
}

function groupQuantityByDate(records, dateField) {
  const groupedRecords = new Map();

  for (const record of records) {
    const eventDate = record?.[dateField];

    if (!eventDate) {
      continue;
    }

    const dayKey = toDayKey(eventDate);
    const quantity = toValidNumber(record.quantity, 0);

    if (quantity <= 0) {
      continue;
    }

    groupedRecords.set(
      dayKey,
      (groupedRecords.get(dayKey) || 0) + quantity
    );
  }

  return groupedRecords;
}

function groupInventoryEventsByDate(records) {
  const groupedRecords = new Map();

  for (const record of records) {
    if (!record.created_at) {
      continue;
    }

    const dayKey = toDayKey(record.created_at);
    const quantity = toValidNumber(record.quantity, 0);

    if (quantity <= 0) {
      continue;
    }

    let inventoryChange = 0;

    if (record.type === "add") {
      inventoryChange = quantity;
    } else if (record.type === "remove") {
      inventoryChange = -quantity;
    } else {
      continue;
    }

    groupedRecords.set(
      dayKey,
      (groupedRecords.get(dayKey) || 0) +
        inventoryChange
    );
  }

  return groupedRecords;
}

function createPromotionCalendar(promotions) {
  const promotionCalendar = new Map();

  const sortedPromotions = [...promotions].sort(
    (first, second) => {
      const endDateDifference =
        new Date(first.end_date).getTime() -
        new Date(second.end_date).getTime();

      if (endDateDifference !== 0) {
        return endDateDifference;
      }

      return String(first.promo_code).localeCompare(
        String(second.promo_code)
      );
    }
  );

  for (const promotion of sortedPromotions) {
    if (!promotion.start_date || !promotion.end_date) {
      continue;
    }

    let currentDate = startOfUtcDay(
      promotion.start_date
    );

    const promotionEndDate = startOfUtcDay(
      promotion.end_date
    );

    while (currentDate <= promotionEndDate) {
      const dayKey = toDayKey(currentDate);

      /*
      If multiple promotions are active, retain the
      earliest-ending promotion because the array is sorted.
      */
      if (!promotionCalendar.has(dayKey)) {
        promotionCalendar.set(dayKey, promotion);
      }

      currentDate = addUtcDays(currentDate, 1);
    }
  }

  return promotionCalendar;
}

async function loadProductSourceData(
  database,
  productObjectId
) {
  const [
    inventoryRecords,
    replenishmentRecords,
    promotionRecords
  ] = await Promise.all([
    database
      .collection("inventory")
      .find({
        product_id: productObjectId,
        created_at: {
          $lte: END_DATE
        }
      })
      .sort({
        created_at: 1
      })
      .toArray(),

    database
      .collection("replenishments")
      .find({
        product_id: productObjectId,
        time: {
          $gte: START_DATE,
          $lte: END_DATE
        }
      })
      .sort({
        time: 1
      })
      .toArray(),

    database
      .collection("promotions")
      .find({
        product_id: productObjectId,
        start_date: {
          $lte: END_DATE
        },
        end_date: {
          $gte: START_DATE
        }
      })
      .sort({
        end_date: 1,
        promo_code: 1
      })
      .toArray()
  ]);

  return {
    inventoryRecords,
    replenishmentRecords,
    promotionRecords
  };
}

async function flushSalesOperations(
  salesCollection,
  operations
) {
  if (operations.length === 0) {
    return;
  }

  const result = await salesCollection.bulkWrite(
    operations,
    {
      ordered: false
    }
  );

  statistics.salesInsertedOrUpdated +=
    result.upsertedCount + result.modifiedCount;

  operations.length = 0;
}

async function processProduct(
  database,
  salesCollection,
  product
) {
  const productLabel =
    product.product_id || product._id.toString();

  try {
    const {
      inventoryRecords,
      replenishmentRecords,
      promotionRecords
    } = await loadProductSourceData(
      database,
      product._id
    );

    const inventoryByDate =
      groupInventoryEventsByDate(inventoryRecords);

    const replenishmentsByDate =
      groupQuantityByDate(
        replenishmentRecords,
        "time"
      );

    const promotionsByDate =
      createPromotionCalendar(promotionRecords);

    const baseDailySales =
      createBaseDailySales(product);

    let runningStock = 0;
    let currentDate = startOfUtcDay(START_DATE);

    const salesOperations = [];

    while (currentDate <= END_DATE) {
      statistics.productDaysProcessed++;

      const dayKey = toDayKey(currentDate);

      /*
      Apply inventory ledger changes for this date.
      For type=add, quantity is added.
      For type=remove, quantity is removed.
      */
      const inventoryChange =
        inventoryByDate.get(dayKey) || 0;

      runningStock += inventoryChange;

      /*
      Replenishment adds new available stock.
      */
      const replenishmentQuantity =
        replenishmentsByDate.get(dayKey) || 0;

      runningStock += replenishmentQuantity;

      runningStock = Math.max(0, runningStock);

      const activePromotion =
        promotionsByDate.get(dayKey) || null;

      const minimumRemainingStock =
        activePromotion ? 0 : 5;

      if (runningStock <= minimumRemainingStock) {
        statistics.skippedNoStock++;
        currentDate = addUtcDays(currentDate, 1);
        continue;
      }

      const saleQuantity = generateCandidateSale({
        baseDailySales,
        availableStock: runningStock,
        minimumRemainingStock,
        promotion: activePromotion
      });

      if (saleQuantity <= 0) {
        statistics.skippedInsufficientStock++;
        currentDate = addUtcDays(currentDate, 1);
        continue;
      }

      const endingStock =
        runningStock - saleQuantity;

      const isValidSale = activePromotion
        ? endingStock >= 0
        : endingStock >= 5;

      if (!isValidSale) {
        statistics.skippedInsufficientStock++;
        currentDate = addUtcDays(currentDate, 1);
        continue;
      }

      runningStock = endingStock;

      if (activePromotion) {
        statistics.promotionalSales++;
      } else {
        statistics.normalSales++;
      }

      const saleDate = startOfUtcDay(currentDate);

      salesOperations.push({
        updateOne: {
          filter: {
            product_id: product._id,
            created_at: saleDate
          },

          update: {
            $set: {
              product_id: product._id,
              product_code: product.product_id,
              quantity: saleQuantity,

              promotion_id:
                activePromotion?._id || null,

              promo_code:
                activePromotion?.promo_code || null,

              created_at: saleDate,
              updated_at: new Date()
            },

            $setOnInsert: {
              generated_at: new Date()
            }
          },

          upsert: true
        }
      });

      if (
        salesOperations.length >= SALES_BATCH_SIZE
      ) {
        await flushSalesOperations(
          salesCollection,
          salesOperations
        );
      }

      currentDate = addUtcDays(currentDate, 1);
    }

    await flushSalesOperations(
      salesCollection,
      salesOperations
    );

    statistics.productsProcessed++;

    console.log(
      `[SUCCESS] ${productLabel} | ` +
      `final stock=${runningStock}`
    );
  } catch (error) {
    statistics.productsFailed++;

    console.error(
      `[FAILED] ${productLabel}: ${error.message}`
    );
  }
}

async function processProductBatch(
  database,
  salesCollection,
  products
) {
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < products.length) {
      const productIndex = currentIndex;
      currentIndex++;

      const product = products[productIndex];

      await processProduct(
        database,
        salesCollection,
        product
      );
    }
  }

  const workerCount = Math.min(
    PRODUCT_CONCURRENCY,
    products.length
  );

  const workers = Array.from(
    {
      length: workerCount
    },
    () => worker()
  );

  await Promise.all(workers);
}

async function createIndexes(database) {
  /*
  If duplicate sales records already exist for the same
  product/date, clean those duplicates before creating
  this unique index.
  */
  await Promise.all([
    database.collection("inventory").createIndex({
      product_id: 1,
      created_at: 1
    }),

    database.collection("replenishments").createIndex({
      product_id: 1,
      time: 1
    }),

    database.collection("promotions").createIndex({
      product_id: 1,
      start_date: 1,
      end_date: 1
    }),

    database.collection("sales").createIndex(
      {
        product_id: 1,
        created_at: 1
      },
      {
        unique: true
      }
    )
  ]);
}

async function main() {
  const processingStartedAt = Date.now();

  try {
    await client.connect();

    console.log("MongoDB connected");

    const database = client.db(DB_NAME);
    const productsCollection =
      database.collection("products");

    const salesCollection =
      database.collection("sales");

    await createIndexes(database);

    const productCursor = productsCollection
      .find({
        status: "active"
      })
      .sort({
        _id: 1
      })
      .batchSize(PRODUCT_BATCH_SIZE);

    let productBatch = [];

    for await (const product of productCursor) {
      productBatch.push(product);

      if (
        productBatch.length >= PRODUCT_BATCH_SIZE
      ) {
        await processProductBatch(
          database,
          salesCollection,
          productBatch
        );

        productBatch = [];

        console.log(
          `Progress: ${statistics.productsProcessed} products processed`
        );
      }
    }

    if (productBatch.length > 0) {
      await processProductBatch(
        database,
        salesCollection,
        productBatch
      );
    }

    const processingDurationSeconds =
      (Date.now() - processingStartedAt) / 1000;

    console.log("");
    console.log("Sales generation completed");
    console.log(
      `Products processed: ${statistics.productsProcessed}`
    );
    console.log(
      `Products failed: ${statistics.productsFailed}`
    );
    console.log(
      `Product-days processed: ${statistics.productDaysProcessed}`
    );
    console.log(
      `Sales inserted/updated: ${statistics.salesInsertedOrUpdated}`
    );
    console.log(
      `Normal sales: ${statistics.normalSales}`
    );
    console.log(
      `Promotional sales: ${statistics.promotionalSales}`
    );
    console.log(
      `Skipped for insufficient stock: ${statistics.skippedInsufficientStock}`
    );
    console.log(
      `Skipped because stock was unavailable: ${statistics.skippedNoStock}`
    );
    console.log(
      `Duration: ${processingDurationSeconds.toFixed(2)} seconds`
    );
  } catch (error) {
    console.error("Fatal error:", error);
    process.exitCode = 1;
  } finally {
    await client.close();
    console.log("MongoDB connection closed");
  }
}

main();