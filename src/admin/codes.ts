import type { Block, BlockResponse } from "@emdash-cms/blocks";

import { STYLE_PRESETS, buildPublicPaths, type PluginSettings } from "../data.js";
import type { QrCodeRecord } from "../types.js";

function styleFields(initial: {
	fg: string;
	bg: string;
	ecc: string;
	size: number;
	margin: number;
}) {
	return [
		{
			type: "select" as const,
			action_id: "preset",
			label: "Style preset",
			options: [
				{ label: "Keep current / custom", value: "custom" },
				...Object.entries(STYLE_PRESETS).map(([value, preset]) => ({
					label: preset.label,
					value,
				})),
			],
			initial_value: "custom",
		},
		{
			type: "text_input" as const,
			action_id: "fg",
			label: "Foreground color",
			initial_value: initial.fg,
			placeholder: "#000000",
		},
		{
			type: "text_input" as const,
			action_id: "bg",
			label: "Background color",
			initial_value: initial.bg,
			placeholder: "#ffffff",
		},
		{
			type: "select" as const,
			action_id: "ecc",
			label: "Error correction",
			options: [
				{ label: "L — 7% recovery", value: "L" },
				{ label: "M — 15% recovery", value: "M" },
				{ label: "Q — 25% recovery", value: "Q" },
				{ label: "H — 30% recovery (best for logos/print)", value: "H" },
			],
			initial_value: initial.ecc,
		},
		{
			type: "select" as const,
			action_id: "size",
			label: "Export size",
			options: [
				{ label: "128px — favicon / small", value: "128" },
				{ label: "256px — web default", value: "256" },
				{ label: "512px — print / posters", value: "512" },
				{ label: "1024px — high-res print", value: "1024" },
			],
			initial_value: String(initial.size),
		},
		{
			type: "number_input" as const,
			action_id: "margin",
			label: "Quiet-zone margin (modules)",
			initial_value: initial.margin,
			min: 0,
			max: 8,
		},
	];
}

function downloadActions(
	paths: ReturnType<typeof buildPublicPaths>,
	hasAbsolute: boolean,
): Block {
	if (!hasAbsolute) {
		return {
			type: "banner",
			variant: "alert",
			title: "Downloads need a public base URL",
			description: "Open Settings and set Public site base URL, then return here.",
		};
	}

	return {
		type: "actions",
		elements: [
			{
				type: "link",
				label: "Preview PNG",
				target: { kind: "external", url: paths.previewUrl },
				appearance: "secondary",
			},
			{
				type: "link",
				label: "Download PNG",
				target: { kind: "external", url: paths.downloadUrl },
				appearance: "primary",
			},
			{
				type: "link",
				label: "Open scan URL",
				target: { kind: "external", url: paths.goUrl },
			},
			{
				type: "link",
				label: "Download 512px",
				target: {
					kind: "external",
					url: `${paths.imageUrl}&size=512&download=1`,
				},
			},
			{
				type: "link",
				label: "Download 1024px",
				target: {
					kind: "external",
					url: `${paths.imageUrl}&size=1024&download=1`,
				},
			},
		],
	};
}

function codeDetailBlocks(
	id: string,
	data: QrCodeRecord,
	settings: PluginSettings,
): Block[] {
	const paths = buildPublicPaths(settings.publicBaseUrl, data.slug);
	const hasAbsolute = Boolean(settings.publicBaseUrl);
	const blocks: Block[] = [
		{
			type: "columns",
			columns: [
				[
					{
						type: "image",
						url: paths.previewPath,
						alt: `QR preview for ${data.slug}`,
						title: data.title,
					},
					{
						type: "context",
						text: "Live preview from the public PNG endpoint. Destination changes keep this QR working when Public base URL is set.",
					},
				],
				[
					{
						type: "fields",
						fields: [
							{ label: "Title", value: data.title },
							{ label: "Slug", value: data.slug },
							{ label: "Status", value: data.enabled ? "Enabled" : "Disabled" },
							{ label: "Scans", value: String(data.scanCount) },
							{ label: "Last scan", value: data.lastScanAt ?? "—" },
							{ label: "Destination", value: data.destination },
							{
								label: "Style",
								value: `${data.style.fg} / ${data.style.bg} · ECC ${data.style.ecc} · ${data.style.size}px · margin ${data.style.margin}`,
							},
						],
					},
					{
						type: "code",
						language: "bash",
						code: [
							`# Scan URL`,
							paths.goUrl,
							``,
							`# PNG`,
							paths.imageUrl,
							``,
							`# Download`,
							paths.downloadUrl,
						].join("\n"),
					},
				],
			],
		},
		downloadActions(paths, hasAbsolute),
		{ type: "divider" },
		{ type: "header", text: "Customize" },
		{
			type: "form",
			block_id: `edit_${id}`,
			fields: [
				{
					type: "text_input",
					action_id: "code_id",
					label: "Code ID",
					initial_value: id,
				},
				{
					type: "text_input",
					action_id: "title",
					label: "Title",
					initial_value: data.title,
				},
				{
					type: "text_input",
					action_id: "destination",
					label: "Destination URL",
					initial_value: data.destination,
				},
				{
					type: "toggle",
					action_id: "enabled",
					label: "Enabled (scan redirects)",
					initial_value: data.enabled,
				},
				...styleFields({
					fg: data.style.fg,
					bg: data.style.bg,
					ecc: data.style.ecc,
					size: data.style.size,
					margin: data.style.margin,
				}),
			],
			submit: { action_id: "update_code", label: "Save & refresh preview" },
		},
		{
			type: "actions",
			elements: [
				{
					type: "button",
					action_id: "refresh_preview",
					label: "Refresh preview",
					style: "secondary",
					value: id,
				},
				{
					type: "button",
					action_id: "delete_code",
					label: "Delete",
					style: "danger",
					value: id,
					confirm: {
						title: "Delete QR code?",
						text: "Scan history for this code is kept in analytics storage.",
						confirm: "Delete",
						deny: "Cancel",
						style: "danger",
					},
				},
			],
		},
	];
	return blocks;
}

export function buildCodesPage(opts: {
	codes: Array<{ id: string; data: QrCodeRecord }>;
	settings: PluginSettings;
	message?: string;
	error?: string;
	focusId?: string | null;
}): BlockResponse {
	const focus =
		opts.focusId && opts.codes.find((c) => c.id === opts.focusId)
			? opts.codes.find((c) => c.id === opts.focusId)!
			: null;

	const createForm = {
		type: "form" as const,
		block_id: "create_code",
		fields: [
			{
				type: "text_input" as const,
				action_id: "title",
				label: "Title",
				placeholder: "Spring campaign",
			},
			{
				type: "text_input" as const,
				action_id: "slug",
				label: "Slug (optional)",
				placeholder: "spring-2026",
			},
			{
				type: "text_input" as const,
				action_id: "destination",
				label: "Destination URL",
				placeholder: "https://example.com/landing",
			},
			...styleFields({
				fg: opts.settings.defaultFg,
				bg: opts.settings.defaultBg,
				ecc: opts.settings.defaultEcc,
				size: 256,
				margin: 2,
			}),
		],
		submit: { action_id: "create_code", label: "Create QR code" },
	};

	const libraryBlocks: Block[] =
		opts.codes.length === 0
			? [
					{
						type: "empty",
						title: "No QR codes yet",
						description: "Create your first dynamic code from the Create tab.",
					},
				]
			: [
					{
						type: "table",
						block_id: "codes_table",
						page_action_id: "codes_page",
						empty_text: "No codes",
						columns: [
							{ key: "title", label: "Title" },
							{ key: "slug", label: "Slug" },
							{ key: "scans", label: "Scans" },
							{ key: "enabled", label: "Status" },
							{ key: "size", label: "Size" },
						],
						rows: opts.codes.map(({ data }) => ({
							title: data.title,
							slug: data.slug,
							scans: String(data.scanCount),
							enabled: data.enabled ? "enabled" : "disabled",
							size: `${data.style.size}px`,
						})),
					},
					{
						type: "actions",
						elements: opts.codes.slice(0, 12).map(({ id, data }) => ({
							type: "button" as const,
							action_id: "view_code",
							label: `Open ${data.slug}`,
							value: id,
							style: "secondary" as const,
						})),
					},
				];

	const blocks: Block[] = [
		{ type: "header", text: "Dynamic QR" },
		{
			type: "section",
			text: "Build printable codes that point at a stable scan URL. Customize colors, quiet zone, and export size — then preview or download PNG files.",
		},
	];

	if (!opts.settings.publicBaseUrl) {
		blocks.push({
			type: "banner",
			variant: "alert",
			title: "Public base URL not set",
			description:
				"Set it under Settings so previews encode the scan URL and download links work in a new tab.",
		});
	}

	if (opts.error) {
		blocks.push({ type: "banner", variant: "error", title: opts.error });
	} else if (opts.message) {
		blocks.push({ type: "banner", variant: "default", title: opts.message });
	}

	if (focus) {
		blocks.push({ type: "header", text: `Editing: ${focus.data.title}` });
		blocks.push(...codeDetailBlocks(focus.id, focus.data, opts.settings));
		blocks.push({ type: "divider" });
		blocks.push({
			type: "actions",
			elements: [
				{
					type: "button",
					action_id: "clear_focus",
					label: "Back to library",
					style: "secondary",
				},
			],
		});
	}

	blocks.push({
		type: "tab",
		default_tab: focus ? 1 : 0,
		panels: [
			{ label: "Create", blocks: [createForm] },
			{ label: "Library", blocks: libraryBlocks },
		],
	});

	return { blocks };
}
