// Prevent bigint-buffer warning on Windows when C++ build tools are missing
const originalWarn = console.warn;
console.warn = (...args) => {
    if (args[0] && typeof args[0] === "string") {
        if (args[0].includes("bigint: Failed to load bindings")) {
            return;
        }
    }
    originalWarn(...args);
};

// Prevent expected PortfolioService fetch errors caused by mocked on-chain wallet activity and statistics data
const originalError = console.error;
console.error = (...args) => {
    if (args[0] && typeof args[0] === "string") {
        if (args[0].includes("Failed to fetch activities") || args[0].includes("Failed to fetch transaction stats")) {
            return;
        }
    }
    originalError(...args);
};
