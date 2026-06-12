import runMigrationsForSchemas from "./migration-runner";

runMigrationsForSchemas().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
