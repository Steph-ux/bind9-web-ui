import { db } from "./server/db";
import { users } from "./shared/schema";
import { eq } from "drizzle-orm";

async function run() {
    console.log("Fixing admin password...");
    try {
        const hash = "dba859e69ea0c36aba5dfd87576499883900995af1345597c8d3be82115cc03990626b88d170e53d25cc142c0e465b261905d2672821e3890cf0182ced9b37b0.708d1c0cae1459fea545e8b10b866673";
        const res = await db.update(users)
            .set({ password: hash })
            .where(eq(users.username, "admin"))
            .returning();

        console.log("Updated admin user:", res);
    } catch (e) {
        console.error("Failed to update admin password:", e);
    }
}

run().catch(console.error);
