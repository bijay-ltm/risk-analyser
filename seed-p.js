import { MongoClient } from "mongodb";
import dotenv from "dotenv";

const MONGODB_URI = `mongodb+srv://ms555app_db_user:l5MztOUjHXml6KKI@c0.uoosfng.mongodb.net/`;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not configured in .env");
}

const DB_NAME = "retail_inventory_db";
const COLLECTION_NAME = "products";

const TOTAL_PRODUCTS = 500;
const BATCH_SIZE = 100;

/*
 * Product configuration.
 *
 * Units and realistic price ranges vary by product instead of being
 * completely random.
 */
const catalog = {
  Dairy: {
    Milk: {
      units: ["250ml", "500ml", "1L"],
      price: [20, 90],
      gst: 5,
      shelfLifeDays: [3, 15],
    },
    Cheese: {
      units: ["100g", "200g", "500g"],
      price: [80, 450],
      gst: 12,
      shelfLifeDays: [30, 180],
    },
    Butter: {
      units: ["100g", "250g", "500g"],
      price: [50, 350],
      gst: 12,
      shelfLifeDays: [60, 180],
    },
    Yogurt: {
      units: ["100g", "250g", "500g"],
      price: [20, 150],
      gst: 5,
      shelfLifeDays: [7, 30],
    },
    Cream: {
      units: ["100ml", "250ml", "500ml"],
      price: [40, 250],
      gst: 5,
      shelfLifeDays: [10, 60],
    },
  },

  Beverages: {
    Juice: {
      units: ["200ml", "500ml", "1L"],
      price: [30, 180],
      gst: 12,
      shelfLifeDays: [90, 270],
    },
    Cola: {
      units: ["250ml", "500ml", "1L", "2L"],
      price: [20, 120],
      gst: 28,
      shelfLifeDays: [120, 270],
    },
    Water: {
      units: ["500ml", "1L", "2L"],
      price: [10, 50],
      gst: 18,
      shelfLifeDays: [180, 365],
    },
    Coffee: {
      units: ["100g", "250g", "500g"],
      price: [100, 650],
      gst: 18,
      shelfLifeDays: [180, 365],
    },
    Tea: {
      units: ["100g", "250g", "500g", "1kg"],
      price: [70, 700],
      gst: 5,
      shelfLifeDays: [180, 365],
    },
  },

  Snacks: {
    Chips: {
      units: ["50g", "100g", "200g"],
      price: [10, 120],
      gst: 12,
      shelfLifeDays: [60, 180],
    },
    Cookies: {
      units: ["100g", "250g", "500g"],
      price: [20, 220],
      gst: 18,
      shelfLifeDays: [90, 270],
    },
    Popcorn: {
      units: ["50g", "100g", "250g"],
      price: [20, 180],
      gst: 12,
      shelfLifeDays: [90, 270],
    },
    Crackers: {
      units: ["100g", "250g", "500g"],
      price: [25, 250],
      gst: 18,
      shelfLifeDays: [90, 270],
    },
    Nuts: {
      units: ["100g", "250g", "500g", "1kg"],
      price: [100, 1200],
      gst: 12,
      shelfLifeDays: [120, 365],
    },
  },

  Bakery: {
    Bread: {
      units: ["200g", "400g", "500g"],
      price: [25, 100],
      gst: 5,
      shelfLifeDays: [3, 10],
    },
    Bun: {
      units: ["200g", "400g"],
      price: [20, 80],
      gst: 5,
      shelfLifeDays: [3, 7],
    },
    Cake: {
      units: ["250g", "500g", "1kg"],
      price: [150, 1000],
      gst: 18,
      shelfLifeDays: [3, 15],
    },
    Muffin: {
      units: ["100g", "250g", "500g"],
      price: [40, 350],
      gst: 18,
      shelfLifeDays: [5, 20],
    },
    Croissant: {
      units: ["100g", "250g"],
      price: [50, 250],
      gst: 18,
      shelfLifeDays: [3, 10],
    },
  },

  Grocery: {
    Rice: {
      units: ["500g", "1kg", "5kg"],
      price: [40, 700],
      gst: 5,
      shelfLifeDays: [180, 730],
    },
    Flour: {
      units: ["500g", "1kg", "5kg"],
      price: [30, 450],
      gst: 5,
      shelfLifeDays: [120, 365],
    },
    Sugar: {
      units: ["500g", "1kg", "5kg"],
      price: [30, 350],
      gst: 5,
      shelfLifeDays: [180, 730],
    },
    Salt: {
      units: ["500g", "1kg"],
      price: [10, 80],
      gst: 5,
      shelfLifeDays: [365, 730],
    },
    Oil: {
      units: ["500ml", "1L", "5L"],
      price: [70, 900],
      gst: 5,
      shelfLifeDays: [180, 540],
    },
  },
};

const brands = [
  "FreshMart",
  "DailyChoice",
  "ValuePlus",
  "UrbanFresh",
  "PrimeFoods",
  "NatureBest",
  "GoodLife",
  "SmartChoice",
];

const variants = [
  "Classic",
  "Premium",
  "Regular",
  "Natural",
  "Select",
  "Gold",
  "Everyday",
  "Original",
];

const manufacturers = [
  "FreshMart Foods Pvt Ltd",
  "DailyChoice Consumer Products",
  "Prime Foods India Ltd",
  "UrbanFresh Retail Foods",
  "NatureBest Foods Pvt Ltd",
];

const categoryNames = Object.keys(catalog);

function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start, end) {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime()),
  );
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function roundPrice(value) {
  return Math.round(value * 100) / 100;
}

function generateProduct(index) {
  const category = randomItem(categoryNames);

  const subCategories = Object.keys(catalog[category]);
  const subCategory = randomItem(subCategories);

  const config = catalog[category][subCategory];

  const brand = randomItem(brands);
  const variant = randomItem(variants);
  const unit = randomItem(config.units);

  /*
   * Generate realistic retail pricing:
   *
   * CP  = Cost Price
   * SP  = Selling Price
   * MRP = Maximum Retail Price
   */
  const targetPrice = randomNumber(config.price[0], config.price[1]);

  const marginPercentage = randomNumber(10, 30);

  const cp = roundPrice(targetPrice / (1 + marginPercentage / 100));

  const sp = roundPrice(targetPrice);

  const mrpMarkupPercentage = randomNumber(5, 20);

  const mrp = roundPrice(sp * (1 + mrpMarkupPercentage / 100));

  const productId = `PROD-${String(index).padStart(5, "0")}`;

  const categoryCode = category.substring(0, 3).toUpperCase();

  const sku =
    `${categoryCode}-${brand.substring(0, 3).toUpperCase()}-` +
    `${String(index).padStart(5, "0")}`;

  /*
   * Manufacturing dates within approximately
   * the last six months.
   */
  const today = new Date();

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(today.getMonth() - 6);

  const manufacturedAt = randomDate(sixMonthsAgo, today);

  const shelfLifeDays = randomNumber(
    config.shelfLifeDays[0],
    config.shelfLifeDays[1],
  );

  const expiryDate = addDays(manufacturedAt, shelfLifeDays);

  const createdAt = randomDate(sixMonthsAgo, today);

  /*
   * Simulate stock.
   * Roughly 5% products will be out of stock.
   */
  const isOutOfStock = Math.random() < 0.05;

  const stockQuantity = isOutOfStock ? 0 : randomNumber(5, 500);

  let stockStatus;

  if (stockQuantity === 0) {
    stockStatus = "out_of_stock";
  } else if (stockQuantity < 20) {
    stockStatus = "low_stock";
  } else {
    stockStatus = "in_stock";
  }

  return {
    product_id: productId,

    sku,

    name: `${brand} ${variant} ${subCategory} ${unit}`,

    description: `${brand} ${variant} ${subCategory}, ${unit} pack`,

    category,

    sub_category: subCategory,

    brand,

    variant,

    manufacturer: randomItem(manufacturers),

    pricing: {
      mrp,
      cp,
      sp,
      currency: "INR",
      margin_percentage: marginPercentage,
      gst_percentage: config.gst,
    },

    unit,

    inventory: {
      stock_quantity: stockQuantity,
      minimum_stock_level: randomNumber(10, 30),
      stock_status: stockStatus,
      warehouse_code: `WH-${randomNumber(1, 10).toString().padStart(2, "0")}`,
    },

    batch: {
      batch_number: `BATCH-${randomNumber(100000, 999999)}`,

      manufactured_at: manufacturedAt,

      expiry_date: expiryDate,
    },

    status: Math.random() < 0.98 ? "active" : "inactive",

    created_at: createdAt,

    updated_at: new Date(),
  };
}

async function seedProducts() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log("Connecting to MongoDB...");

    await client.connect();

    console.log("MongoDB connected.");

    const db = client.db(DB_NAME);
    const products = db.collection(COLLECTION_NAME);

    /*
     * Remove this if you DO NOT want existing
     * product data deleted.
     */
    console.log("Removing existing products...");

    await products.deleteMany({});

    /*
     * Useful indexes for typical product APIs.
     */
    await products.createIndex({ product_id: 1 }, { unique: true });

    await products.createIndex({ sku: 1 }, { unique: true });

    await products.createIndex({
      category: 1,
      sub_category: 1,
    });

    await products.createIndex({
      brand: 1,
    });

    await products.createIndex({
      "pricing.sp": 1,
    });

    await products.createIndex({
      "inventory.stock_status": 1,
    });

    console.log(`Generating ${TOTAL_PRODUCTS} products...`);

    for (let start = 1; start <= TOTAL_PRODUCTS; start += BATCH_SIZE) {
      const batch = [];

      const end = Math.min(start + BATCH_SIZE - 1, TOTAL_PRODUCTS);

      for (let i = start; i <= end; i++) {
        batch.push(generateProduct(i));
      }

      const result = await products.insertMany(batch, {
        ordered: false,
      });

      console.log(
        `Inserted ${result.insertedCount} products ` + `(${start}-${end})`,
      );
    }

    const total = await products.countDocuments();

    console.log("----------------------------------");
    console.log("Seeding completed successfully.");
    console.log(`Database   : ${DB_NAME}`);
    console.log(`Collection : ${COLLECTION_NAME}`);
    console.log(`Products   : ${total}`);
    console.log("----------------------------------");
  } catch (error) {
    console.error("Seeding failed:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await client.close();
    console.log("MongoDB connection closed.");
  }
}

seedProducts();
