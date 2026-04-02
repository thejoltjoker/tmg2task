// Use server build: the package `browser` field maps the main entry to canvas-based
// code, which breaks in Cloudflare Workers (no document / canvas).
import QRCode from 'qrcode/lib/server.js';

export const toInlineXcTaskQrText = (xctskJson: string): string => `XCTSK:${xctskJson}`;

export const toQrDataUrl = async (text: string): Promise<string> => {
	const svg = await QRCode.toString(text, {
		type: 'svg',
		errorCorrectionLevel: 'M',
		margin: 1,
		width: 320
	});
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

