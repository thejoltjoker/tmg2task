declare module 'qrcode';

declare module 'qrcode/lib/server.js' {
	interface QrStringOptions {
		type?: 'utf8' | 'svg' | 'terminal';
		errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
		margin?: number;
		width?: number;
	}

	const QRCode: {
		toString(text: string, options?: QrStringOptions): Promise<string>;
	};
	export default QRCode;
}

