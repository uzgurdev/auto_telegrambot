import { ObjectId } from "mongodb";

export enum OrderStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  CANCELLED = "CANCELLED",
  DELIVERED = "DELIVERED",
}

// Separate Car Brands from Car Models
export enum CarBrand {
  CHEVROLET = "CHEVROLET",
  DAEWOO = "DAEWOO",
  HYUNDAI = "HYUNDAI",
  KIA = "KIA",
  TOYOTA = "TOYOTA",
  MERCEDES = "MERCEDES",
  BMW = "BMW",
  LADA = "LADA",
  OPEL = "OPEL",
  BYD = "BYD",
  CHERRY = "CHERRY",
  CHANGAN = "CHANGAN",
  HAVAL = "HAVAL",
  JETOUR = "JETOUR",
  JAC = "JAC",
}

// Car Models mapped to their brands
export enum CarModel {
  // Chevrolet models
  NEXIA = "NEXIA",
  COBALT = "COBALT",
  AVEO = "AVEO",
  SPARK = "SPARK",
  MALIBU = "MALIBU",
  ONIX = "ONIX",
  TRACKER = "TRACKER",
  EQUINOX = "EQUINOX",

  // Daewoo models
  MATIZ = "MATIZ",
  LACETTI = "LACETTI",
  GENTRA = "GENTRA",
  LANOS = "LANOS",
  LEGANZA = "LEGANZA",
  DAMAS = "DAMAS",

  // Hyundai models
  ACCENT = "ACCENT",
  ELANTRA = "ELANTRA",
  SOLARIS = "SOLARIS",

  // Kia models
  RIO = "RIO",

  // Other models
  MONZA = "MONZA",
  RAVON = "RAVON",
  VECTRA = "VECTRA",
  HAVAL_JOLION = "HAVAL JOLION",
}

// Car Brand to Models mapping
export const CAR_BRAND_TO_MODELS: { [key in CarBrand]: CarModel[] } = {
  [CarBrand.CHEVROLET]: [
    CarModel.NEXIA,
    CarModel.COBALT,
    CarModel.AVEO,
    CarModel.SPARK,
    CarModel.MALIBU,
    CarModel.ONIX,
    CarModel.TRACKER,
    CarModel.EQUINOX,
    CarModel.RAVON,
    CarModel.MONZA,
  ],
  [CarBrand.DAEWOO]: [
    CarModel.MATIZ,
    CarModel.LACETTI,
    CarModel.GENTRA,
    CarModel.LANOS,
    CarModel.LEGANZA,
    CarModel.DAMAS,
  ],
  [CarBrand.HYUNDAI]: [CarModel.ACCENT, CarModel.ELANTRA, CarModel.SOLARIS],
  [CarBrand.KIA]: [CarModel.RIO],
  [CarBrand.TOYOTA]: [],
  [CarBrand.MERCEDES]: [],
  [CarBrand.BMW]: [],
  [CarBrand.LADA]: [],
  [CarBrand.OPEL]: [CarModel.VECTRA],
  [CarBrand.BYD]: [],
  [CarBrand.CHERRY]: [],
  [CarBrand.CHANGAN]: [],
  [CarBrand.HAVAL]: [CarModel.HAVAL_JOLION],
  [CarBrand.JETOUR]: [],
  [CarBrand.JAC]: [],
};

// Helper function to get car brand from model
export const getCarBrandFromModel = (model: CarModel): CarBrand | null => {
  for (const [brand, models] of Object.entries(CAR_BRAND_TO_MODELS)) {
    if (models.includes(model)) {
      return brand as CarBrand;
    }
  }
  return null;
};

export interface Product {
  name: string;
  images: string[];
  position: string;
  producer: string; // Producer brand (e.g., "GAMMA")
  carBrand: string; // Car manufacturer (e.g., "CHEVROLET")
  carModel: string[]; // Car models (e.g., ["NEXIA", "RAVON"])
  carPartIds: string[];
  price: number;
  currency: string;
  tenantId: ObjectId;
}

export interface Order {
  _id: ObjectId;
  name: string;
  phone: string;
  location: string;
  telegramUsername: string;
  status: OrderStatus;
  totalAmount: number;
  items: OrderItem[];
  tenantId: ObjectId;
  currency: string;
  isNewOrder: boolean;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  carPartIds: string[];
  _id: string;
}

export interface Admin {
  id: string;
  addedBy: string;
  addedAt: string;
}

export interface AdminMap {
  admin_uz: Admin[];
  admin_kz: Admin[];
}

export interface Tenant {
  _id: ObjectId;
  country: "uzbekistan" | "kazakhstan";
  currency: "KZT" | "USD";
  phoneCode: "+7" | "+998";
  status: boolean;
  languageCode: string[];
}

export interface TenantMap {
  [chatId: string]: Tenant;
}
