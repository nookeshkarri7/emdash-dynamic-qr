import type { SandboxedPlugin } from "emdash/plugin";

import { handleAdminRoute } from "./routes/admin.js";
import { goRoute, imageRoute } from "./routes/public.js";

const plugin: SandboxedPlugin = {
	routes: {
		admin: {
			permission: "plugins:manage",
			handler: handleAdminRoute,
		},
		go: goRoute,
		image: imageRoute,
	},
};

export default plugin;
