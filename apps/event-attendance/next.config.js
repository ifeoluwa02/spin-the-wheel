/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // HTML5 camera scanners work smoother without double mount/unmount in dev
  poweredByHeader: false,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        dns: false,
        fs: false,
        child_process: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
