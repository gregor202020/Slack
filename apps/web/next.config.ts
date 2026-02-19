import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Transpile the shared monorepo package
  transpilePackages: ['@smoker/shared'],
}

export default nextConfig
