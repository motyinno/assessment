/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Allow large file uploads for Excel files
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

module.exports = nextConfig;
