import { DatabaseSync } from "node:sqlite";
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  database: new DatabaseSync("database.sqlite"),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
},
});
