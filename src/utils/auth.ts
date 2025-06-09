import dotenv from "dotenv";

dotenv.config();

const devIds = (process.env.DEV_IDS || "").split(",").map((id) => parseInt(id));

export const isDevUser = (userId: number): boolean => {
  return devIds.includes(userId);
};
