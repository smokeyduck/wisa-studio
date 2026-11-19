// Interface tests must not depend on the host's system language. Individual
// localization tests can still replace navigator or the stored preference.
const testNavigator = typeof navigator === "undefined" ? {} : navigator;
Object.defineProperty(testNavigator, "language", { configurable: true, value: "en-US" });
if (typeof navigator === "undefined") {
	Object.defineProperty(globalThis, "navigator", { configurable: true, value: testNavigator });
}

// Node reads TZ at runtime; without this the language probe below falls
// through to the host's IANA zone and a Vietnamese/Thai machine renders a
// non-English UI in every unrelated component test.
process.env.TZ = "UTC";
