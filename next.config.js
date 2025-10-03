/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/tts-voicevox/:path*',
        destination: 'https://voicevox-engine-l6ll.onrender.com/:path*',
      },
    ];
  },
};
module.exports = nextConfig;
