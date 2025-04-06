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
  COBALT = "COBALT",
  ELANTRA = "ELANTRA",
  GENTRA = "GENTRA",
  HYUNDAI = "HYUNDAI",
  KIA = "KIA",
  LACETTI = "LACETTI",
  LEGANZA = "LEGANZA",
  MATIZ = "MATIZ",
  NEXIA = "NEXIA",
  OPEL = "OPEL",
  RIO = "RIO",
  RAVON = "RAVON",
  SOLARIS = "SOLARIS",
  SPARK = "SPARK",
  VECTRA = "VECTRA",
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
