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

  try {
    // Ensure uploads directory exists
    if (!fs.existsSync(path.dirname(filePath))) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }

    const fileStream = fs.createWriteStream(filePath);
    const response = await requests[method](fileUrl, data);

    if (!response || !response.data) {
      throw new Error("Invalid response from Telegram API");
    }

    return new Promise((resolve, reject) => {
      // Set timeouts to avoid hanging
      const timeout = setTimeout(() => {
        fileStream.destroy();
        reject(new Error("File download timeout"));
      }, 30000); // 30 seconds timeout

      fileStream.on("finish", () => {
        clearTimeout(timeout);
        fileStream.close(() => resolve(filePath));
      });

      fileStream.on("error", (err: Error) => {
        clearTimeout(timeout);
        fileStream.destroy();
        fs.unlink(filePath, () => reject(err)); // Clean up partial file
      });

      response.data.on("error", (err: Error) => {
        clearTimeout(timeout);
        fileStream.destroy();
        fs.unlink(filePath, () => reject(err)); // Clean up partial file
      });

      response.data.pipe(fileStream);
    });
  } catch (error) {
    // Clean up any partial file that might have been created
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupError) {
        console.error("Error cleaning up partial file:", cleanupError);
      }
    }
    console.error("Error downloading file:", error);
    throw error; // Re-throw to be handled by caller
  }
};

const deleteFile = (filePath: string): void => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("Error deleting file:", error);
    throw error;
  }
};

export { downloadFile, deleteFile };
