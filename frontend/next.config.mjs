/** @type {import('next').NextConfig} */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const parentEnvPath = path.resolve(process.cwd(), '../.env');
if (fs.existsSync(parentEnvPath)) {
  const parentEnv = dotenv.parse(fs.readFileSync(parentEnvPath));
  for (const [key, value] of Object.entries(parentEnv)) {
    process.env[key] = value;
  }
}

const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8686';

const parseRemotePatterns = (patterns) => {
  if (!patterns) {
    return undefined;
  }

  const patternList = patterns.split(',');
  return patternList.map(pattern => {
    pattern = pattern.trim();
    if (pattern.startsWith('http://') || pattern.startsWith('https://')) {
      const url = new URL(pattern);
      return {
        protocol: url.protocol.replace(':', ''),
        hostname: url.hostname
      };
    }

    return {
      protocol: 'http',
      hostname: pattern
    };
  });
};

const remotePatterns = parseRemotePatterns(process.env.NEXT_PUBLIC_REMOTE_PATTERNS);

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: remotePatterns
  },
  env: {
    NEXT_PUBLIC_REMOTE_PATTERNS: process.env.NEXT_PUBLIC_REMOTE_PATTERNS || '',
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/images/:path*',
        destination: `${backendUrl}/images/:path*`,
      },
    ];
  },
};

export default nextConfig;
