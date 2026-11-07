import { MongoClient } from "mongodb";

const MONGO_URI = `mongodb+srv://ms555app_db_user:l5MztOUjHXml6KKI@c0.uoosfng.mongodb.net/`;

const DB_NAME = "retail_inventory_db";

const START_YEAR = 2021;
const START_MONTH = 0; // January

const END_YEAR = 2026;
const END_MONTH = 10; // November

const MIN_PROMOS_PER_MONTH = 1;
const MAX_PROMOS_PER_MONTH = 4;

const MIN_DISCOUNT = 10;
const MAX_DISCOUNT = 50;

const TODAY = new Date("2026-11-06T00:00:00.000Z");

const BATCH_SIZE = 1000;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getDaysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function randomDateInMonth(year, month) {
  const daysInMonth = getDaysInMonth(year, month);

  return new Date(
    Date.UTC(
      year,
      month,
      randomInt(1, daysInMonth),
      randomInt(0, 23),
      randomInt(0, 59),
      randomInt(0, 59),
    ),
  );
}

function addDays(date, days) {
  const result = new Date(date);

  result.setUTCDate(result.getUTCDate() + days);

  return result;
}

function generatePromoCode(productId, year, month) {
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();

  return (
    `PROMO-${year}` +
    `${String(month + 1).padStart(2, "0")}-` +
    `${String(productId).slice(-6).toUpperCase()}-` +
    randomPart
  );
}

function isPromoActive(startDate, endDate) {
  return TODAY >= startDate && TODAY <= endDate;
}

async function seedPromotions() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();

    console.log("Connected to MongoDB");

    const db = client.db(DB_NAME);

    const productsCollection = db.collection("products");

    const promotionsCollection = db.collection("promotions");

    const productCursor = productsCollection.find(
      {},
      {
        projection: {
          _id: 1,
        },
      },
    );

    let batch = [];
    let totalInserted = 0;
    let productsProcessed = 0;

    async function flushBatch() {
      if (batch.length === 0) {
        return;
      }

      const result = await promotionsCollection.insertMany(batch, {
        ordered: false,
      });

      totalInserted += result.insertedCount;

      console.log(`Inserted: ${result.insertedCount}`);

      batch = [];
    }

    for await (const product of productCursor) {
      productsProcessed++;

      const productId = product._id;

      console.log(`Processing product: ${productId}`);

      for (let year = START_YEAR; year <= END_YEAR; year++) {
        const firstMonth = year === START_YEAR ? START_MONTH : 0;

        const lastMonth = year === END_YEAR ? END_MONTH : 11;

        for (let month = firstMonth; month <= lastMonth; month++) {
          const promoCount = randomInt(
            MIN_PROMOS_PER_MONTH,
            MAX_PROMOS_PER_MONTH,
          );

          for (let i = 0; i < promoCount; i++) {
            const startDate = randomDateInMonth(year, month);

            /*
             * Promo lasts randomly between
             * 7 and 30 days.
             */
            const endDate = addDays(startDate, randomInt(7, 30));

            const now = new Date();

            batch.push({
              product_id: productId,

              promo_code: generatePromoCode(productId, year, month),

              discount_percentage: randomInt(MIN_DISCOUNT, MAX_DISCOUNT),

              start_date: startDate,

              end_date: endDate,

              active: isPromoActive(startDate, endDate),

              created_at: now,

              updated_at: now,
            });

            if (batch.length >= BATCH_SIZE) {
              await flushBatch();
            }
          }
        }
      }
    }

    await flushBatch();

    await promotionsCollection.createIndex({
      product_id: 1,
      start_date: 1,
      end_date: 1,
    });

    await promotionsCollection.createIndex(
      {
        promo_code: 1,
      },
      {
        unique: true,
      },
    );

    console.log("\n============================");
    console.log("Promotion generation complete");
    console.log(`Products processed: ${productsProcessed}`);
    console.log(`Promotions inserted: ${totalInserted}`);
    console.log("============================");
  } catch (error) {
    console.error("Promotion generation failed:", error);
  } finally {
    await client.close();
  }
}

seedPromotions();
