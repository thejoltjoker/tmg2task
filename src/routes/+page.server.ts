import type { PageServerLoad } from './$types';
import {
	buildOptimalRouteCoordinates,
	buildXcTaskPayload,
	fetchCurrentTask,
	xctskFilename,
	type DataSource
} from '$lib/task';
import { toInlineXcTaskQrText, toQrDataUrl } from '$lib/qr';

const EARTH_RADIUS_METERS = 6371008.8;

const turnpointCircleCoordinates = (
	lat: number,
	lon: number,
	radiusMeters: number,
	steps = 64
): [number, number][][] => {
	const angularDistance = radiusMeters / EARTH_RADIUS_METERS;
	const latRad = (lat * Math.PI) / 180;
	const lonRad = (lon * Math.PI) / 180;
	const ring: [number, number][] = [];

	for (let i = 0; i <= steps; i += 1) {
		const bearing = (2 * Math.PI * i) / steps;
		const sinLat2 =
			Math.sin(latRad) * Math.cos(angularDistance) +
			Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing);
		const lat2 = Math.asin(sinLat2);
		const lon2 =
			lonRad +
			Math.atan2(
				Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
				Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(lat2)
			);

		ring.push([((lon2 * 180) / Math.PI + 540) % 360 - 180, (lat2 * 180) / Math.PI]);
	}

	return [ring];
};

export const load: PageServerLoad = async ({ fetch, url }) => {
	const rawSource = url.searchParams.get('source') ?? 'auto';
	const source: DataSource =
		rawSource === 'airtribune' || rawSource === 'flymaster' ? rawSource : 'auto';
	try {
		const task = await fetchCurrentTask(fetch, source);
		const xctskPayload = buildXcTaskPayload(task);
		const xctskJson = JSON.stringify(xctskPayload);
		const downloadUrl = `${url.origin}/download.xctsk`;

		const [inlineQrDataUrl, urlQrDataUrl] = await Promise.all([
			toQrDataUrl(toInlineXcTaskQrText(xctskJson)),
			toQrDataUrl(downloadUrl)
		]);

		const line = {
			type: 'Feature',
			properties: { kind: 'task-line' },
			geometry: {
				type: 'LineString',
				coordinates: buildOptimalRouteCoordinates(task.turnpoints)
			}
		};

		const points = task.turnpoints.map((tp, index) => ({
			type: 'Feature',
			properties: { kind: 'turnpoint', index: index + 1, id: tp.id, tag: tp.tag, radiusMeters: tp.radiusMeters },
			geometry: { type: 'Point', coordinates: [tp.lon, tp.lat] }
		}));

		const turnpointRadiusAreas = task.turnpoints.map((tp, index) => ({
			type: 'Feature',
			properties: {
				kind: 'turnpoint-radius',
				index: index + 1,
				id: tp.id,
				tag: tp.tag,
				radiusMeters: tp.radiusMeters
			},
			geometry: {
				type: 'Polygon',
				coordinates: turnpointCircleCoordinates(tp.lat, tp.lon, tp.radiusMeters)
			}
		}));

		const mapGeojson = {
			type: 'FeatureCollection',
			features: [line, ...turnpointRadiusAreas, ...points]
		};

		return {
			task,
			mapGeojson,
			xctskFilename: xctskFilename(task),
			downloadUrl,
			inlineQrDataUrl,
			urlQrDataUrl,
			source,
			error: null
		};
	} catch (error) {
		return {
			task: null,
			mapGeojson: null,
			xctskFilename: null,
			downloadUrl: null,
			inlineQrDataUrl: null,
			urlQrDataUrl: null,
			source,
			error: error instanceof Error ? error.message : 'Unknown error loading task'
		};
	}
};

