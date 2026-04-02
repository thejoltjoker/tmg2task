import QRCode from 'qrcode';

export const toInlineXcTaskQrText = (xctskJson: string): string => `XCTSK:${xctskJson}`;

export const toQrDataUrl = async (text: string): Promise<string> =>
	QRCode.toDataURL(text, {
		errorCorrectionLevel: 'M',
		margin: 1,
		width: 320
	});

