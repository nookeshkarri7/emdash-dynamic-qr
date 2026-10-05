import type { BlockResponse } from "@emdash-cms/blocks";

import type { PluginSettings } from "../data.js";

export function buildSettingsPage(settings: PluginSettings, message?: string): BlockResponse {
	const blocks: BlockResponse["blocks"] = [
		{ type: "header", text: "Dynamic QR settings" },
		{
			type: "section",
			text: "Set the public base URL of your EmDash site so admin pages can show absolute scan and PNG links.",
		},
	];

	if (message) {
		blocks.push({ type: "banner", variant: "default", title: message });
	}

	blocks.push({
		type: "form",
		block_id: "qr_settings",
		fields: [
			{
				type: "text_input",
				action_id: "publicBaseUrl",
				label: "Public site base URL",
				initial_value: settings.publicBaseUrl,
				placeholder: "https://example.com",
			},
			{
				type: "text_input",
				action_id: "defaultFg",
				label: "Default foreground",
				initial_value: settings.defaultFg,
			},
			{
				type: "text_input",
				action_id: "defaultBg",
				label: "Default background",
				initial_value: settings.defaultBg,
			},
			{
				type: "select",
				action_id: "defaultEcc",
				label: "Default error correction",
				options: [
					{ label: "L", value: "L" },
					{ label: "M", value: "M" },
					{ label: "Q", value: "Q" },
					{ label: "H", value: "H" },
				],
				initial_value: settings.defaultEcc,
			},
		],
		submit: { action_id: "save_settings", label: "Save settings" },
	});

	return { blocks };
}

export function buildOverviewWidget(opts: {
	codeCount: number;
	scanCount: number;
}): BlockResponse {
	return {
		blocks: [
			{ type: "header", text: "Dynamic QR" },
			{
				type: "stats",
				items: [
					{ label: "Codes", value: String(opts.codeCount) },
					{ label: "Scans", value: String(opts.scanCount) },
				],
			},
			{
				type: "actions",
				elements: [
					{
						type: "link",
						label: "Manage codes",
						target: { kind: "plugin-page", path: "/codes" },
					},
					{
						type: "link",
						label: "Analytics",
						target: { kind: "plugin-page", path: "/analytics" },
					},
				],
			},
		],
	};
}
