// Select the application before Studio initializes its profile, IPC or sidecars.
if (process.argv.includes("--wisa-browser-companion")) {
	await import("./browser-companion");
} else {
	await import("./studio");
}

export {};
