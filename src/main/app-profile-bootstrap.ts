// Must be the first main-process import: other modules create electron-store eagerly.
import { applyAppProfile } from "./dev-profile";

applyAppProfile();
