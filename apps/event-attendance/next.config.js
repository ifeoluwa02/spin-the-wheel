/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // HTML5 camera scanners work smoother without double mount/unmount in dev
  poweredByHeader: false,
};

module.exports = nextConfig;
