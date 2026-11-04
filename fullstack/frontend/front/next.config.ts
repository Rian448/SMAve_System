import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  // Online ordering, customer accounts and appointments were retired: old links
  // go to the promotional website (or the dashboard) instead of a 404
  async redirects() {
    return [
      { source: "/place-order", destination: "/#products", permanent: false },
      { source: "/my-orders/:path*", destination: "/#contact", permanent: false },
      { source: "/register", destination: "/#contact", permanent: false },
      { source: "/appointments/:path*", destination: "/dashboard", permanent: false },
    ];
  },
};

export default nextConfig;
