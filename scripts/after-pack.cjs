const fs = require("node:fs/promises");
const path = require("node:path");
const plist = require("plist");

/**
 * The bundle directory is named after `productName` ("Wisa.app"), so it
 * cannot be hardcoded. electron-builder writes exactly one `.app` per pack into
 * `appOutDir`; finding it there also keeps this hook correct if the product name
 * changes again.
 */
async function findAppBundle(appOutDir) {
	const entries = await fs.readdir(appOutDir, { withFileTypes: true });
	const bundles = entries.filter(entry => entry.isDirectory() && entry.name.endsWith(".app")).map(entry => entry.name);
	if (bundles.length !== 1) {
		throw new Error(`afterPack: expected exactly one .app in ${appOutDir}, found ${bundles.length} (${bundles.join(", ")})`);
	}
	return path.join(appOutDir, bundles[0]);
}

/**
 * electron-builder enables arbitrary ATS loads after applying mac.extendInfo so
 * its localhost updater exception works. Restore the app's explicit policy
 * after that mutation and before the bundle is signed.
 */
async function afterPack(context) {
	if (context.electronPlatformName !== "darwin") return;

	const infoPath = path.join(await findAppBundle(context.appOutDir), "Contents", "Info.plist");
	const info = plist.parse(await fs.readFile(infoPath, "utf8"));
	const transport = info.NSAppTransportSecurity;
	info.NSAppTransportSecurity = {
		...(transport && typeof transport === "object" ? transport : {}),
		NSAllowsArbitraryLoads: false,
		NSAllowsLocalNetworking: true,
	};
	await fs.writeFile(infoPath, plist.build(info));
}

module.exports = { afterPack };
