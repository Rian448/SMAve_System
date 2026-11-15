import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  // Online ordering, customer accounts and appointments were retired: old links
  // go to the sign-in page (or the dashboard) instead of a 404
  async redirects() {
    return [
      { source: "/place-order", destination: "/login", permanent: false },
      { source: "/my-orders/:path*", destination: "/login", permanent: false },
      { source: "/register", destination: "/login", permanent: false },
      { source: "/appointments/:path*", destination: "/dashboard", permanent: false },
      // Purchase Orders and Suppliers moved out of Inventory into their own pages
      { source: "/inventory/purchase-orders", destination: "/purchase-orders", permanent: true },
      { source: "/inventory/purchase-orders/:path*", destination: "/purchase-orders/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
