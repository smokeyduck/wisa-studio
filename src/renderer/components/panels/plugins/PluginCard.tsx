import { useT } from "../../../lib/i18n";
import { CatalogCard } from "../../common/CatalogCard";
import type { CatalogPlugin } from "./catalog-model";
import { PluginCategoryLabel } from "./PluginCategoryLabel";
import { PluginErrorNote } from "./PluginErrorNote";
import { PluginLogo } from "./PluginLogo";
import type { PluginCatalogError } from "./use-plugin-catalog";

export function PluginCard({
	plugin,
	showCatalog,
	installing,
	disabled,
	disabledReason,
	error,
	onOpen,
	onInstall,
}: {
	plugin: CatalogPlugin;
	/** More than one catalog is configured, so say which this came from. */
	showCatalog: boolean;
	installing: boolean;
	disabled: boolean;
	disabledReason?: string;
	error?: PluginCatalogError;
	onOpen: () => void;
	onInstall: () => void;
}) {
	const t = useT();
	const { info } = plugin;
	return (
		<CatalogCard
			byline={info.author ?? plugin.logoOwner}
			description={info.description ?? t("plugins.noDescription")}
			error={error && <PluginErrorNote error={error} />}
			install={
				info.installed
					? { installed: true, label: t("marketplace.installed") }
					: {
							installed: false,
							label: t("marketplace.install"),
							disabled,
							loading: installing,
							title: disabled ? disabledReason : t("plugins.installName", { name: plugin.title }),
							onClick: onInstall,
						}
			}
			logo={<PluginLogo owner={plugin.logoOwner} title={plugin.title} />}
			metadata={
				<>
					{info.category && <PluginCategoryLabel category={info.category} />}
					{showCatalog && <span className="ml-auto truncate">{plugin.marketplace}</span>}
				</>
			}
			onOpen={onOpen}
			openLabel={t("plugins.openDetail", { name: plugin.title })}
			title={plugin.title}
		/>
	);
}
