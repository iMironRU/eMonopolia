import type { NextConfig } from 'next';

// На GitHub Pages сайт живёт по адресу https://<user>.github.io/eMonopolia/,
// поэтому в CI нужен basePath. Локально (npm run dev) basePath пустой.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  // YAML и markdown читаются из ../../data и ../../content на этапе сборки
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
