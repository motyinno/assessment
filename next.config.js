/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow large file uploads for Excel files
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

module.exports = nextConfig;
