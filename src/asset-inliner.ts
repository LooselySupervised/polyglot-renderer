import type { App } from "obsidian";
import { normalizePath } from "obsidian";

const ABSOLUTE_URL = /^(https?:\/\/|\/\/|data:|blob:)/i;

const MIME_TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	svg: "image/svg+xml",
	webp: "image/webp",
	ico: "image/x-icon",
	bmp: "image/bmp",
	avif: "image/avif",
};

/**
 * Inline relative CSS, JS, and image assets into an HTML string so it
 * can be rendered in a srcdoc iframe (which has no base URL).
 *
 * Absolute URLs (http://, data:, etc.) are left unchanged.
 * Missing files are silently skipped — the original reference stays.
 */
export async function inlineAssets(
	html: string,
	app: App,
	filePath: string
): Promise<string> {
	const dir = filePath.contains("/")
		? filePath.substring(0, filePath.lastIndexOf("/"))
		: "";

	html = await inlineStylesheets(html, app, dir);
	html = await inlineScripts(html, app, dir);
	html = await inlineImages(html, app, dir);

	return html;
}

function resolvePath(dir: string, href: string): string {
	const raw = dir ? `${dir}/${href}` : href;
	return normalizePath(raw);
}

async function readText(app: App, path: string): Promise<string | null> {
	try {
		return await app.vault.adapter.read(path);
	} catch {
		return null;
	}
}

async function readBinaryAsBase64(app: App, path: string): Promise<string | null> {
	try {
		const buf = await app.vault.adapter.readBinary(path);
		const bytes = new Uint8Array(buf);
		let binary = "";
		for (let i = 0; i < bytes.length; i++) {
			binary += String.fromCharCode(bytes[i] as number);
		}
		return btoa(binary);
	} catch {
		return null;
	}
}

/**
 * Replace <link rel="stylesheet" href="relative.css"> with <style>...</style>
 */
async function inlineStylesheets(html: string, app: App, dir: string): Promise<string> {
	const regex = /<link\s[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi;
	const matches = Array.from(html.matchAll(regex));

	for (const match of matches.reverse()) {
		const tag = match[0];
		const idx = match.index;
		if (idx === undefined) continue;

		const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i);
		if (!hrefMatch || !hrefMatch[1]) continue;

		const href = hrefMatch[1];
		if (ABSOLUTE_URL.test(href)) continue;

		const resolved = resolvePath(dir, href);
		const css = await readText(app, resolved);
		if (css === null) continue;

		const replacement = `<style>/* inlined: ${href} */\n${css}\n</style>`;
		html = html.substring(0, idx) + replacement + html.substring(idx + tag.length);
	}

	return html;
}

/**
 * Replace <script src="relative.js"></script> with <script>...</script>
 */
async function inlineScripts(html: string, app: App, dir: string): Promise<string> {
	const regex = /<script\s[^>]*src\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi;
	const matches = Array.from(html.matchAll(regex));

	for (const match of matches.reverse()) {
		const fullMatch = match[0];
		const src = match[1];
		const idx = match.index;
		if (!src || idx === undefined) continue;
		if (ABSOLUTE_URL.test(src)) continue;

		const resolved = resolvePath(dir, src);
		const js = await readText(app, resolved);
		if (js === null) continue;

		const replacement = `<script>/* inlined: ${src} */\n${js}\n</script>`;
		html = html.substring(0, idx) + replacement + html.substring(idx + fullMatch.length);
	}

	return html;
}

/**
 * Replace <img src="relative.png"> with <img src="data:image/png;base64,...">
 */
async function inlineImages(html: string, app: App, dir: string): Promise<string> {
	const regex = /<img\s[^>]*src\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;
	const matches = Array.from(html.matchAll(regex));

	for (const match of matches.reverse()) {
		const fullMatch = match[0];
		const src = match[1];
		const idx = match.index;
		if (!src || idx === undefined) continue;
		if (ABSOLUTE_URL.test(src)) continue;

		const ext = src.split(".").pop()?.toLowerCase() ?? "";
		const mime = MIME_TYPES[ext];
		if (!mime) continue;

		const resolved = resolvePath(dir, src);
		const base64 = await readBinaryAsBase64(app, resolved);
		if (base64 === null) continue;

		const dataUri = `data:${mime};base64,${base64}`;
		const replacement = fullMatch.replace(
			/src\s*=\s*["'][^"']+["']/i,
			`src="${dataUri}"`
		);
		html = html.substring(0, idx) + replacement + html.substring(idx + fullMatch.length);
	}

	return html;
}
