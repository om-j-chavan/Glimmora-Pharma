/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      // next-auth's built-in sign-in page (GET /api/auth/signin) shouldn't
      // ever be seen by users — we have our own /login page. If anything
      // navigates there (stale bookmark, OAuth error, etc.), bounce to /login.
      // IMPORTANT: /api/auth/signout is NOT redirected because its POST
      // endpoint is what actually clears the session cookie. /api/auth/callback/*
      // is also not redirected for the same reason.
      {
        source: "/api/auth/signin",
        destination: "/login",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
