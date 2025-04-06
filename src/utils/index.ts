import axios from "axios";
import { formatOrderMessage } from "./formmatters";
import { getDB } from "../db/connect";
import https from "https";

const Tenants = async (admin_ids: string[]): Promise<any> => {
  const db = await getDB();
  const tenants = db.collection("tenants");

  let result: any[] = [];
  result = await tenants.find({}).toArray();

  return {
    [admin_ids[0]]: result[0],
    [admin_ids[1]]: result[0],
    [admin_ids[2]]: result[1],
    [admin_ids[3]]: result[1],
  };
};

const requests = {
  get: async (url: string) =>
    await axios({
      url: url,
      method: "GET",
      responseType: "stream",
    }),
  post: async (url: string, data: any) =>
    await axios.post(url, data, {
      headers: data.getHeaders(),
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    }),
};

export { formatOrderMessage, Tenants, requests };
