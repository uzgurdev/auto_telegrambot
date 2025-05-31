import axios from "axios";
import s3 from "../config/space";
import { v4 as uuidv4 } from "uuid";

export const uploadImageFromTelegram = async (
  telegramFileUrl: string
): Promise<string> => {
  const response = await axios.get(telegramFileUrl, { responseType: "stream" });
  const fileName = `${uuidv4()}.jpg`; // adjust based on actual file type

  await s3
    .upload({
      Bucket: "auto-parts-images",
      Key: fileName,
      Body: response.data,
      ACL: "public-read", // or private
      ContentType: response.headers["content-type"],
    })
    .promise();

  return `https://auto-parts-images.blr1.digitaloceanspaces.com/${fileName}`;
};
