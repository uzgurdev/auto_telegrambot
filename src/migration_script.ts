import * as connect from "./db/connect";
import { closeDB } from "./db/connect";
import { CarBrand, CarModel, getCarBrandFromModel } from "./types";

const migrateToHierarchy = async () => {
  try {
    const db = await connect.getDB();
    const products = db.collection("products");

    console.log("Starting migration to hierarchy system...");

    const allProducts = await products.find({}).toArray();
    let updatedCount = 0;

    for (const product of allProducts) {
      let carBrand = "";

      // Try to detect car brand from existing car models
      if (product.carModel && product.carModel.length > 0) {
        for (const model of product.carModel) {
          const brandFromModel = getCarBrandFromModel(model as CarModel);
          if (brandFromModel) {
            carBrand = brandFromModel;
            break;
          }
        }
      }

      // If no brand detected from models, try from producer
      if (!carBrand && product.producer) {
        const producer = product.producer.toUpperCase();
        for (const brand of Object.values(CarBrand)) {
          if (producer.includes(brand)) {
            carBrand = brand;
            break;
          }
        }
      }

      // Default to UNIVERSAL if no brand detected
      if (!carBrand) {
        carBrand = "UNIVERSAL";
      }

      // Update product with carBrand field
      await products.updateOne(
        { _id: product._id },
        { $set: { carBrand: carBrand } }
      );

      updatedCount++;

      if (updatedCount % 100 === 0) {
        console.log(`Updated ${updatedCount} products...`);
      }
    }

    console.log(`Migration completed! Updated ${updatedCount} products.`);
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await closeDB();
  }
};

// Run migration
migrateToHierarchy();
