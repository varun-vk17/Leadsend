import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // Request basic profile info for app login
          // Gmail send scope is requested separately in Step 4
          scope: "openid email profile",
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      // Include user ID and Gmail connection status in the session
      if (session.user) {
        session.user.id = user.id;

        // Check if Gmail is connected
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { gmailConnected: true },
        });
        (session.user as unknown as Record<string, unknown>).gmailConnected =
          dbUser?.gmailConnected ?? false;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "database",
  },
});
