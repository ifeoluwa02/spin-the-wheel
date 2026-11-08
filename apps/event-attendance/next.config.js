/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ['mongodb'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        dns: false,
        fs: false,
        child_process: false,
        timers: false,
        'timers/promises': false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
