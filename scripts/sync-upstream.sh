#!/usr/bin/env bash
# omp upstream → GUI feature-sync.
#
# Merges upstream into the current Core main, then re-provisions the sidecar
# and verifies the GUI. Run from a nested checkout, or set WISA_CORE_ROOT to
# the absolute path of the separate Core checkout.
#
# Steps:
#   1. fetch upstream, show what's incoming
#   2. merge upstream/main (stop on conflict for manual resolution)
#   3. bun install (lockfile may have moved)
#   4. if the omp version bumped, re-provision pi_natives for the new version
#   5. gen:stats (re-embed the stats dashboard client bundle)
#   6. build:omp (rebuild the bundled sidecar with upstream + local changes)
#   7. build the GUI renderer + typecheck + tests
set -euo pipefail
GUI="$(cd "$(dirname "$0")/.." && pwd)"
cd "${WISA_CORE_ROOT:-$GUI/../..}"
if [ ! -f packages/coding-agent/scripts/compile-binary.ts ]; then
	echo "Set WISA_CORE_ROOT to the OMP Core checkout before syncing from a standalone GUI checkout." >&2
	exit 1
fi
export WISA_CORE_ROOT="$(node -p 'process.cwd()')"
# WISA natives cache root. Exported so every child step (bun install, build:omp) sees one value.
export PI_NATIVES_DIR="${PI_NATIVES_DIR:-$HOME/.wisa-studio/natives}"
say() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

if [ "${SKIP_MERGE:-0}" = "1" ]; then
	say "1-2/7 resume after resolved merge"
	if [ -n "$(git diff --name-only --diff-filter=U)" ]; then
		echo "CONFLICT — unresolved files remain; resolve and commit them before resuming"
		git status --short
		exit 1
	fi
else
	say "1/7 fetch upstream"
	target=upstream/main
	if [ -n "${UPSTREAM_TAG:-}" ]; then
		if ! [[ "$UPSTREAM_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
			echo "UPSTREAM_TAG must be a stable upstream version tag" >&2
			exit 1
		fi
		target="refs/tags/$UPSTREAM_TAG"
		git fetch --quiet upstream "$target:$target"
	else
		git fetch upstream --quiet
	fi
	incoming=$(git rev-list --count "HEAD..$target")
	echo "incoming commits: $incoming"
	git log --oneline "HEAD..$target" | head -15 || true

	say "2/7 merge $target"
	if [ "$incoming" = "0" ]; then
		echo "already up to date"
	elif ! git merge "$target" --no-edit; then
		echo "CONFLICT — resolve and commit the listed files, then re-run with SKIP_MERGE=1"
		echo "  SKIP_MERGE=1 bash packages/gui/scripts/sync-upstream.sh"
		echo "  git status --short"
		exit 1
	fi
fi

say "3/7 bun install"
bun install

new_version="$(node -p "require('./packages/natives/package.json').version")"
host="$(node -p '`${process.platform}-${process.arch}`')"
addon="pi_natives.$host"
if [[ "$host" == *-x64 ]]; then addon+=-baseline; fi
addon+=.node
say "4/7 pi_natives for v$new_version ($host)"
native_dir="$PI_NATIVES_DIR/$new_version"
workspace_addon="packages/natives/native/$addon"
valid_addon() {
	[ -f "$1" ] && bun -e '
		const { containsVersionStamp, containsLegacyVersionSentinel } = require("./packages/natives/native/version-sentinel.js");
		const [file, version] = process.argv.slice(1);
		const bytes = await Bun.file(file).bytes();
		process.exit(containsVersionStamp(bytes, version) || containsLegacyVersionSentinel(bytes, version) ? 0 : 1);
	' "$1" "$new_version"
}
if ! valid_addon "$workspace_addon"; then
	if ! valid_addon "$native_dir/$addon"; then
		tmp="$(mktemp -d)"
		trap 'rm -rf -- "$tmp"' EXIT
		leaf="@oh-my-pi/pi-natives-$host"
		(cd "$tmp" && bun add --no-cache --registry=https://registry.npmjs.org "$leaf@$new_version")
		mkdir -p "$native_dir"
		cp "$tmp/node_modules/$leaf/$addon" "$native_dir/$addon"
		valid_addon "$native_dir/$addon"
	fi
	cp "$native_dir/$addon" "$workspace_addon"
	echo "workspace addon refreshed to v$new_version"
else
	echo "workspace addon already matches v$new_version"
fi

say "5/7 gen:stats (embed stats dashboard)"
bun --cwd=packages/stats run gen:stats

say "6/7 build:omp (rebuild bundled sidecar)"
sidecar=omp
build=build:omp
if [[ "$host" == win32-x64 ]]; then
	sidecar=omp.exe
	build=build:omp:win
elif [[ "$host" == win32-* ]]; then
	sidecar=omp.exe
fi
(cd "$GUI" && bun run "$build" && "./resources/$sidecar" --smoke-test)

say "7/7 GUI build + typecheck + tests"
(cd "$GUI" && bun run build && bun run check:types && bun run test)

# Record the monorepo commit the bundled sidecar was built from. The Linux
# release workflow (release-linux.yml) checks this file out at the release tag
# to reproduce the exact sidecar CI-side.
printf '{\n  "repo": "%s",\n  "commit": "%s"\n}\n' \
	"$(git remote get-url origin | sed -E 's#.*github.com[/:]##; s#\.git$##')" \
	"$(git rev-parse HEAD)" > "$GUI/sidecar-source.json"

say "sync complete — review with: git log --oneline -5; git status --short"
