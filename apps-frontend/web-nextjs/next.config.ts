import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        hostname: 'nlowbwnnzyywftsseamc.supabase.co',
        protocol: 'https',
      },
    ],
  },
  reactStrictMode: true,
};

export default nextConfig;
