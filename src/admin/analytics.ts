import type { Block, BlockResponse } from "@emdash-cms/blocks";

import { summarizeScans } from "../analytics/summarize.js";
import type { QrCodeRecord, ScanRecord } from "../types.js";

export function buildAnalyticsPage(opts: {
	codes: Array<{ id: string; data: QrCodeRecord }>;
	selectedId: string | null;
	scans: ScanRecord[];
}): BlockResponse {
	const totalScans = opts.codes.reduce((sum, c) => sum + c.data.scanCount, 0);
	const selected = opts.codes.find((c) => c.id === opts.selectedId) ?? opts.codes[0] ?? null;
	const summary = summarizeScans(opts.scans);

	const blocks: Block[] = [
		{ type: "header", text: "QR analytics" },
		{
			type: "section",
			text: "Scan performance across codes — trends, geography, devices, and traffic sources.",
		},
		{
			type: "stats",
			items: [
				{ label: "Codes", value: String(opts.codes.length) },
				{
					label: "Total scans",
					value: String(totalScans),
					description: "All codes combined",
				},
				{
					label: "Selected (7d)",
					value: String(summary.last7d),
					trend: summary.last7d >= summary.last24h ? "up" : "neutral",
					description: `${summary.last24h} in last 24h`,
				},
				{
					label: "Selected (30d)",
					value: String(summary.last30d),
					description: `${summary.uniqueDays} active days in sample`,
				},
			],
		},
	];

	if (opts.codes.length === 0) {
		blocks.push({
			type: "empty",
			title: "No data yet",
			description: "Create a QR code and share its scan URL to collect analytics.",
		});
		return { blocks };
	}

	blocks.push({
		type: "form",
		block_id: "select_code",
		fields: [
			{
				type: "select",
				action_id: "code_id",
				label: "Inspect code",
				options: opts.codes.map(({ id, data }) => ({
					label: `${data.title} (${data.slug}) — ${data.scanCount} scans`,
					value: id,
				})),
				initial_value: selected?.id,
			},
		],
		submit: { action_id: "select_analytics", label: "Update dashboard" },
	});

	blocks.push({
		type: "table",
		block_id: "codes_summary",
		page_action_id: "analytics_summary",
		empty_text: "No codes",
		columns: [
			{ key: "title", label: "Title" },
			{ key: "slug", label: "Slug" },
			{ key: "scans", label: "Scans" },
			{ key: "last", label: "Last scan" },
			{ key: "status", label: "Status" },
		],
		rows: opts.codes.map(({ data }) => ({
			title: data.title,
			slug: data.slug,
			scans: String(data.scanCount),
			last: data.lastScanAt ?? "—",
			status: data.enabled ? "enabled" : "disabled",
		})),
	});

	if (!selected) return { blocks };

	blocks.push({
		type: "header",
		text: `Detail · ${selected.data.title}`,
	});

	if (opts.scans.length === 0) {
		blocks.push({
			type: "empty",
			title: "No scans for this code",
			description: "Share the scan URL or open it once to seed analytics.",
		});
		return { blocks };
	}

	blocks.push({
		type: "chart",
		config: {
			chart_type: "timeseries",
			style: "bar",
			gradient: true,
			height: 280,
			x_axis_name: "Day",
			y_axis_name: "Scans",
			series: [
				{
					name: "Scans",
					data: summary.timeseries,
					color: "#0ea5e9",
				},
			],
		},
	});

	blocks.push({
		type: "columns",
		columns: [
			[
				{ type: "header", text: "Devices" },
				{
					type: "chart",
					config: {
						chart_type: "custom",
						height: 260,
						options: {
							tooltip: { trigger: "item" },
							series: [
								{
									type: "pie",
									radius: ["35%", "70%"],
									data: summary.byDevice,
								},
							],
						},
					},
				},
			],
			[
				{ type: "header", text: "Countries" },
				{
					type: "chart",
					config: {
						chart_type: "custom",
						height: 260,
						options: {
							tooltip: { trigger: "item" },
							series: [
								{
									type: "pie",
									radius: "65%",
									data: summary.byCountry,
								},
							],
						},
					},
				},
			],
		],
	});

	blocks.push({
		type: "columns",
		columns: [
			[
				{ type: "header", text: "Top referrers" },
				{
					type: "fields",
					fields: summary.byReferer.map((row) => ({
						label: row.name,
						value: String(row.value),
					})),
				},
			],
			[
				{ type: "header", text: "Top cities" },
				{
					type: "fields",
					fields: summary.byCity.map((row) => ({
						label: row.name,
						value: String(row.value),
					})),
				},
			],
		],
	});

	blocks.push({ type: "header", text: "Recent scan log" });
	blocks.push({
		type: "table",
		block_id: "scans_table",
		page_action_id: "scans_page",
		empty_text: "No scans",
		columns: [
			{ key: "when", label: "When" },
			{ key: "device", label: "Device" },
			{ key: "country", label: "Country" },
			{ key: "city", label: "City" },
			{ key: "referer", label: "Referer" },
			{ key: "ua", label: "User agent" },
		],
		rows: opts.scans.slice(0, 50).map((scan) => {
			const device =
				!scan.userAgent
					? "unknown"
					: /bot|crawl|spider/i.test(scan.userAgent)
						? "bot"
						: /mobi|iphone|android.*mobile/i.test(scan.userAgent)
							? "mobile"
							: /ipad|tablet/i.test(scan.userAgent)
								? "tablet"
								: "desktop";
			return {
				when: scan.createdAt,
				device,
				country: scan.country ?? "—",
				city: scan.city ?? "—",
				referer: scan.referer ?? "(direct)",
				ua: (scan.userAgent ?? "—").slice(0, 72),
			};
		}),
	});

	return { blocks };
}
