import fs from "fs";
import path from "path";

import config from "../config";
import { requests } from "../utils";

const downloadFile = async (
  fileUrl: string,
  filName: string,
  method: "get" | "post" = "get",
  data?: any
): Promise<string> => {
  const filePath = path.join(config.paths.uploads, filName);

  if (!fs.existsSync(path.dirname(filePath))) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  try {
    const fileStream = fs.createWriteStream(filePath);
    const response = await requests[method](fileUrl, data);

    return new Promise((resolve, reject) => {
      fileStream.on("finish", () => resolve(filePath));
      fileStream.on("error", reject);
      response.data.pipe(fileStream);
    });
  } catch (error) {
    console.error("Error downloading file:", error);
    return "";
  }
};

const deleteFile = (filePath: string): void => {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

export { downloadFile, deleteFile };
