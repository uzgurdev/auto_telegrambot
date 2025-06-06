import { ObjectId } from "mongodb";

export enum OrderStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  CANCELLED = "CANCELLED",
  DELIVERED = "DELIVERED",
}

export enum CarModel {
  ACCENT = "ACCENT",
  AVEO = "AVEO",
  BYD = "BYD",
  COBALT = "COBALT",
  CHERRY = "CHERRY",
  CHANGAN = "CHANGAN",
  DAMAS = "DAMAS",
  EQUINOX = "EQUINOX",
  ELANTRA = "ELANTRA",
  GENTRA = "GENTRA",
  HYUNDAI = "HYUNDAI",
  HAVAL_JOLION = "HAVAL JOLION",
  KIA = "KIA",
  LACETTI = "LACETTI",
  LADA = "LADA",
  LANOS = "LANOS",
  LEGANZA = "LEGANZA",
  MATIZ = "MATIZ",
  MALIBU = "MALIBU",
  MONZA = "MONZA",
  MERCEDES = "MERCEDES",
  NEXIA = "NEXIA",
  OPEL = "OPEL",
  ONIX = "ONIX",
  RIO = "RIO",
  RAVON = "RAVON",
  SOLARIS = "SOLARIS",
  SPARK = "SPARK",
  TRACKER = "TRACKER",
  VECTRA = "VECTRA",
  JETOUR = "JETOUR",
  JAC = "JAC",
}

export interface Product {
  name: string;
  images: string[];
  position: string;
  carModel: string[];
  producer: string;
  carPartIds: string[];
  price: number;
  currency: string;
  inStock: number;
  lowStockAlert: number;
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
  isNew: boolean;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
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
