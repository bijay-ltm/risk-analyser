import { MongoClient } from "mongodb";
const MONGO_URI = "mongodb+srv://ms555app_db_user:l5MztOUjHXml6KKI@c0.uoosfng.mongodb.net/";
const DB_NAME = "retail_inventory_db";

const START_YEAR = 2025;
const START_MONTH = 0; // January

const END_YEAR = 2026;
const END_MONTH = 10; // November

const MIN_RECORDS_PER_MONTH = 10;
const MAX_RECORDS_PER_MONTH = 30;

const MIN_DATES_PER_MONTH = 4;
const MAX_DATES_PER_MONTH = 5;

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 100;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomType() {
  return Math.random() < 0.5 ? "add" : "subtract";
}

function getDaysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function generateRandomDates(year, month, count) {
  const daysInMonth = getDaysInMonth(year, month);
  const selectedDays = new Set();

  while (selectedDays.size < count) {
    selectedDays.add(randomInt(1, daysInMonth));
  }

  return [...selectedDays].map(
    (day) =>
      new Date(
        Date.UTC(
          year,
          month,
          day,
          randomInt(0, 23),
          randomInt(0, 59),
          randomInt(0, 59)
        )
      )
  );
}

async function seedInventory() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();

    console.log("Connected to MongoDB");

    const db = client.db(DB_NAME);

    const productsCollection = db.collection("products");
    const inventoryCollection = db.collection("inventory");

    // Fetch only product IDs
    const products = await productsCollection
      .find({}, { projection: { _id: 1 } })
      .toArray();

    console.log(`Found ${products.length} products`);

    if (products.length === 0) {
      console.log("No products found.");
      return;
    }

    let totalInserted = 0;

    for (const product of products) {
      // Keeps MongoDB ObjectId as ObjectId
      const productId = product._id;

      console.log(`\nProcessing product: ${productId}`);

      for (let year = START_YEAR; year <= END_YEAR; year++) {
        const firstMonth =
          year === START_YEAR ? START_MONTH : 0;

        const lastMonth =
          year === END_YEAR ? END_MONTH : 11;

        for (
          let month = firstMonth;
          month <= lastMonth;
          month++
        ) {
          const recordCount = randomInt(
            MIN_RECORDS_PER_MONTH,
            MAX_RECORDS_PER_MONTH
          );

          const dateCount = randomInt(
            MIN_DATES_PER_MONTH,
            MAX_DATES_PER_MONTH
          );

          const dates = generateRandomDates(
            year,
            month,
            dateCount
          );

          const records = [];

          for (let i = 0; i < recordCount; i++) {
            const createdAt =
              dates[randomInt(0, dates.length - 1)];

            records.push({
              product_id: productId,
              quantity: randomInt(
                MIN_QUANTITY,
                MAX_QUANTITY
              ),
              type: randomType(),
              created_at: createdAt,
              updated_at: createdAt
            });
          }

          await inventoryCollection.insertMany(records);

          totalInserted += records.length;

          console.log(
            `${productId} | ` +
            `${year}-${String(month + 1).padStart(2, "0")} | ` +
            `${records.length} records | ` +
            `${dateCount} dates`
          );
        }
      }
    }

    // Useful for inventory history queries
    await inventoryCollection.createIndex({
      product_id: 1,
      created_at: -1
    });

    console.log("\n================================");
    console.log("Seeding completed");
    console.log(`Products: ${products.length}`);
    console.log(`Inventory records: ${totalInserted}`);
    console.log("================================");
  } catch (error) {
    console.error("Seeding failed:", error);
  } finally {
    await client.close();
  }
}

seedInventory();