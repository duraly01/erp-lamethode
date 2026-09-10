import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit charge ses polices .afm depuis node_modules à l'exécution :
  // il ne doit pas être inclus dans le bundle serveur (sinon ENOENT sur *.afm).
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
