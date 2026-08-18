/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disables the client Router Cache's default 30s reuse window for dynamic routes. Several
  // instructor pages (e.g. the assembled-quiz composition views) fetch their own data in a
  // mount-time useEffect with no cache-busting of their own; without this, navigating away and
  // back within that window (via <Link> or the browser back button) reuses the previously
  // rendered segment instead of remounting, so a mutation made on another page (e.g. adding
  // questions to a linked catalog) doesn't show up until the window expires or a hard reload.
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
};

module.exports = nextConfig;
