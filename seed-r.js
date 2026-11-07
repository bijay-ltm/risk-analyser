import { MongoClient } from "mongodb";

const MONGO_URI = `mongodb+srv://ms555app_db_user:l5MztOUjHXml6KKI@c0.uoosfng.mongodb.net/`;

const DB_NAME = "retail_inventory_db";

const BATCH_SIZE = 1000;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

async function seedReplenishments() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();

    console.log("Connected to MongoDB");

    const db = client.db(DB_NAME);

    const inventoryCollection = db.collection("inventory");
    const replenishmentsCollection = db.collection("replenishments");

    const inventoryCursor = inventoryCollection.find(
      {},
      {
        projection: {
          product_id: 1,
          created_at: 1,
        },
      },
    );

    let batch = [];
    let processed = 0;
    let inserted = 0;

    for await (const inventory of inventoryCursor) {
      if (!inventory.product_id || !inventory.created_at) {
        console.warn(`Skipping inventory record ${inventory._id}`);

        continue;
      }

      // Replenishment happens exactly 4 days
      // after the inventory record.
      const replenishmentTime = addDays(inventory.created_at, 4);

      batch.push({
        product_id: inventory.product_id,

        // Random quantity between 10 and 20 inclusive
        quantity: randomInt(10, 20),

        time: replenishmentTime,

        created_at: replenishmentTime,

        updated_at: replenishmentTime,
      });

      processed++;

      if (batch.length >= BATCH_SIZE) {
        const result = await replenishmentsCollection.insertMany(batch);

        inserted += result.insertedCount;

        console.log(`Processed: ${processed}, Inserted: ${inserted}`);

        batch = [];
      }
    }

    // Insert remaining documents
    if (batch.length > 0) {
      const result = await replenishmentsCollection.insertMany(batch);

      inserted += result.insertedCount;
    }

    await replenishmentsCollection.createIndex({
      product_id: 1,
      time: 1,
    });

    console.log("\n==========================");
    console.log("Replenishment seed complete");
    console.log(`Inventory processed: ${processed}`);
    console.log(`Replenishments inserted: ${inserted}`);
    console.log("==========================");
  } catch (error) {
    console.error("Failed to generate replenishments:", error);
  } finally {
    await client.close();
  }
}

seedReplenishments();
