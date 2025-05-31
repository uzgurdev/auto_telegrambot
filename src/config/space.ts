import AWS from "aws-sdk";

const spacesEndpoint = new AWS.Endpoint("blr1.digitaloceanspaces.com");
const s3 = new AWS.S3({
  endpoint: spacesEndpoint,
  accessKeyId: process.env.SPACES_KEY,
  secretAccessKey: process.env.SPACES_SECRET,
});

export default s3;
