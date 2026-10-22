import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["exceljs", "pdfkit", "pg", "@prisma/client", "@prisma/adapter-pg"],
};

export default nextConfig;
