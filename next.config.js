/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // Disables X-Powered-By: Next.js to prevent runtime fingerprinting
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff", // Blocks MIME-type sniffing
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN", // Clickjacking mitigation
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
