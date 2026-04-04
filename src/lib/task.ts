export const TROFEO_AIRTRIBUNE_URL = 'https://api.airtribune.com/feed_task.json';
export const TROFEO_FLYMASTER_FALLBACK_URL = 'https://lt.flymaster.net/json/kml/45511.json';
export const TROFEO_FLYMASTER_GROUP_URL = 'https://lt.flymaster.net/bs.php?grp=7428';

export type DataSource = 'auto' | 'airtribune' | 'flymaster';

export type TaskTag = 'd' | 's' | 't' | 'e' | 'g';

export interface NormalizedTurnpoint {
	id: string;
	tag: TaskTag;
	lat: number;
	lon: number;
	optimizedLat?: number;
	optimizedLon?: number;
	radiusMeters: number;
	sectorType: string;
}

export interface NormalizedTask {
	event: string;
	date: string;
	name: string;
	type: string;
	timezoneOffsetMinutes: number;
	distanceMeters: number;
	speedSectionDistanceMeters: number;
	times: Record<string, string>;
	turnpoints: NormalizedTurnpoint[];
}

interface AirtribuneTaskResponse {
	event: string;
	tzone: number;
	date: string;
	name: string;
	type: string;
	times: Record<string, string>;
	dist: number;
	ssdist: number;
	wpts: Array<{
		id: string;
		tag: TaskTag;
		opt: [number, number];
		sector: {
			type?: string;
			rad?: number;
			ctr?: [number, number];
		};
	}>;
}

interface FlymasterTaskResponse {
	items: Array<{
		n: string;
		type: string;
		s: string;
		a: string;
		o: string;
	}>;
}

export interface XcTaskTurnpoint {
	type?: 'TAKEOFF' | 'SSS' | 'ESS';
	radius: number;
	waypoint: {
		name: string;
		description: string;
		lat: number;
		lon: number;
		altSmoothed: number;
	};
}

export interface XcTaskPayload {
	taskType: 'CLASSIC';
	version: 1;
	turnpoints: XcTaskTurnpoint[];
	takeoff?: { timeOpen?: string; timeClose?: string };
	sss?: { type: 'RACE'; direction: 'ENTER'; timeGates: string[]; timeClose?: string };
	goal?: { type: 'CYLINDER'; deadline?: string };
}

const EARTH_RADIUS_METERS = 6371008.8;
const pad2 = (value: number): string => String(value).padStart(2, '0');

const toUtcTime = (localHHmm: string, offsetMinutes: number): string => {
	const [hoursStr, minutesStr] = localHHmm.split(':');
	const hours = Number(hoursStr);
	const minutes = Number(minutesStr);
	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '00:00:00Z';
	const localTotal = hours * 60 + minutes;
	const utcTotal = ((localTotal - offsetMinutes) % 1440 + 1440) % 1440;
	const utcHour = Math.floor(utcTotal / 60);
	const utcMinute = utcTotal % 60;
	return `${pad2(utcHour)}:${pad2(utcMinute)}:00Z`;
};

const normalizeAirtribuneTask = (input: AirtribuneTaskResponse): NormalizedTask => ({
	event: input.event,
	date: input.date,
	name: input.name,
	type: input.type,
	timezoneOffsetMinutes: input.tzone,
	distanceMeters: input.dist,
	speedSectionDistanceMeters: input.ssdist,
	times: input.times ?? {},
	turnpoints: (input.wpts ?? []).map((wpt) => ({
		id: wpt.id,
		tag: wpt.tag,
		lat: wpt.sector?.ctr?.[0] ?? wpt.opt[0],
		lon: wpt.sector?.ctr?.[1] ?? wpt.opt[1],
		optimizedLat: wpt.opt[0],
		optimizedLon: wpt.opt[1],
		radiusMeters: wpt.sector?.rad ?? 0,
		sectorType: wpt.sector?.type ?? 'unknown'
	}))
});

const mapFlymasterTypeToTag = (type: string): TaskTag => {
	if (type === '0') return 'd';
	if (type === '1') return 's';
	if (type === '5') return 'e';
	if (type === '6') return 'g';
	return 't';
};

const normalizeFlymasterTask = (input: FlymasterTaskResponse): NormalizedTask => ({
	event: 'Trofeo Montegrappa',
	date: new Date().toISOString().slice(0, 10),
	name: 'Current task',
	type: 'race',
	timezoneOffsetMinutes: 120,
	distanceMeters: 0,
	speedSectionDistanceMeters: 0,
	times: {},
	turnpoints: (input.items ?? []).map((item) => ({
		id: item.n,
		tag: mapFlymasterTypeToTag(item.type),
		lat: Number(item.a),
		lon: Number(item.o),
		radiusMeters: Math.round(Number(item.s) * 1000),
		sectorType: 'cy'
	}))
});

const resolveFlymasterTaskUrl = async (fetchFn: typeof fetch): Promise<string> => {
	try {
		const ts = Math.floor(Date.now() / 1000);
		const response = await fetchFn(`${TROFEO_FLYMASTER_GROUP_URL}&_=${ts}`);
		if (!response.ok) return TROFEO_FLYMASTER_FALLBACK_URL;

		const html = await response.text();
		const match = html.match(/https?:\/\/lt\.flymaster\.net\/json\/kml\/\d+\.json/i);
		if (match?.[0]) return match[0];

		const relativeMatch = html.match(/\/?json\/kml\/(\d+)\.json/i);
		if (relativeMatch?.[0]) {
			const path = relativeMatch[0].startsWith('/') ? relativeMatch[0] : `/${relativeMatch[0]}`;
			return `https://lt.flymaster.net${path}`;
		}
	} catch {
		// Keep fallback behavior when group page is unavailable.
	}

	return TROFEO_FLYMASTER_FALLBACK_URL;
};

export const fetchAirtribuneTask = async (fetchFn: typeof fetch): Promise<NormalizedTask> => {
	const ts = Math.floor(Date.now() / 1000);
	const response = await fetchFn(`${TROFEO_AIRTRIBUNE_URL}?ts=${ts}`);
	if (!response.ok) throw new Error(`Airtribune returned ${response.status}`);
	const data = (await response.json()) as AirtribuneTaskResponse;
	return normalizeAirtribuneTask(data);
};

export const fetchFlymasterTask = async (fetchFn: typeof fetch): Promise<NormalizedTask> => {
	const url = await resolveFlymasterTaskUrl(fetchFn);
	const response = await fetchFn(url);
	if (!response.ok) throw new Error(`Flymaster returned ${response.status}`);
	const data = (await response.json()) as FlymasterTaskResponse;
	return normalizeFlymasterTask(data);
};

export const fetchCurrentTask = async (
	fetchFn: typeof fetch,
	source: DataSource = 'auto'
): Promise<NormalizedTask> => {
	if (source === 'airtribune') return fetchAirtribuneTask(fetchFn);
	if (source === 'flymaster') return fetchFlymasterTask(fetchFn);

	// auto: try Airtribune first, fall back to Flymaster
	const ts = Math.floor(Date.now() / 1000);
	const primary = await fetchFn(`${TROFEO_AIRTRIBUNE_URL}?ts=${ts}`);
	if (primary.ok) {
		const data = (await primary.json()) as AirtribuneTaskResponse;
		return normalizeAirtribuneTask(data);
	}

	const fallbackUrl = await resolveFlymasterTaskUrl(fetchFn);
	const fallback = await fetchFn(fallbackUrl);
	if (fallback.ok) {
		const data = (await fallback.json()) as FlymasterTaskResponse;
		return normalizeFlymasterTask(data);
	}

	throw new Error('Unable to load Trofeo task from Airtribune or Flymaster');
};

const mapTagToXcType = (tag: TaskTag): XcTaskTurnpoint['type'] => {
	if (tag === 'd') return 'TAKEOFF';
	if (tag === 's') return 'SSS';
	if (tag === 'e') return 'ESS';
	return undefined;
};

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

const haversineMeters = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
	const dLat = toRadians(b.lat - a.lat);
	const dLon = toRadians(b.lon - a.lon);
	const lat1 = toRadians(a.lat);
	const lat2 = toRadians(b.lat);

	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
};

const destinationPoint = (
	lat: number,
	lon: number,
	distanceMeters: number,
	bearingRadians: number
): { lat: number; lon: number } => {
	const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
	const latRad = toRadians(lat);
	const lonRad = toRadians(lon);

	const sinLat2 =
		Math.sin(latRad) * Math.cos(angularDistance) +
		Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRadians);
	const lat2 = Math.asin(sinLat2);
	const lon2 =
		lonRad +
		Math.atan2(
			Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(latRad),
			Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(lat2)
		);

	return {
		lat: toDegrees(lat2),
		lon: ((toDegrees(lon2) + 540) % 360) - 180
	};
};

const toLocalMeters = (
	center: { lat: number; lon: number },
	point: { lat: number; lon: number }
): { x: number; y: number } => {
	const latScale = (Math.PI / 180) * EARTH_RADIUS_METERS;
	const lonScale = latScale * Math.cos(toRadians(center.lat));
	return {
		x: (point.lon - center.lon) * lonScale,
		y: (point.lat - center.lat) * latScale
	};
};

const fromLocalMeters = (
	center: { lat: number; lon: number },
	local: { x: number; y: number }
): { lat: number; lon: number } => {
	const latScale = (Math.PI / 180) * EARTH_RADIUS_METERS;
	const lonScale = latScale * Math.cos(toRadians(center.lat));
	return {
		lat: center.lat + local.y / latScale,
		lon: center.lon + local.x / lonScale
	};
};

const bestPointOnSegmentInsideDisk = (
	prev: { lat: number; lon: number },
	next: { lat: number; lon: number },
	center: { lat: number; lon: number },
	radiusMeters: number
): { lat: number; lon: number } | null => {
	const p1 = toLocalMeters(center, prev);
	const p2 = toLocalMeters(center, next);
	const dx = p2.x - p1.x;
	const dy = p2.y - p1.y;
	const radiusSquared = radiusMeters * radiusMeters;
	const a = dx * dx + dy * dy;
	const c = p1.x * p1.x + p1.y * p1.y - radiusSquared;

	if (a === 0) {
		if (p1.x * p1.x + p1.y * p1.y > radiusSquared) return null;
		return prev;
	}

	const b = 2 * (p1.x * dx + p1.y * dy);
	const discriminant = b * b - 4 * a * c;
	if (discriminant < 0) return null;

	const sqrtDiscriminant = Math.sqrt(discriminant);
	const t1 = (-b - sqrtDiscriminant) / (2 * a);
	const t2 = (-b + sqrtDiscriminant) / (2 * a);
	const entry = Math.min(t1, t2);
	const exit = Math.max(t1, t2);

	const clampedEntry = Math.max(0, entry);
	const clampedExit = Math.min(1, exit);
	if (clampedEntry > clampedExit) return null;

	const t = clampedEntry;
	return fromLocalMeters(center, {
		x: p1.x + t * dx,
		y: p1.y + t * dy
	});
};

const optimizeTurnpointOnCylinder = (
	center: { lat: number; lon: number },
	radiusMeters: number,
	prev: { lat: number; lon: number },
	next: { lat: number; lon: number },
	samples = 180
): { lat: number; lon: number } => {
	const segmentPoint = bestPointOnSegmentInsideDisk(prev, next, center, radiusMeters);
	if (segmentPoint) {
		return segmentPoint;
	}

	let bestPoint = destinationPoint(center.lat, center.lon, radiusMeters, 0);
	let bestDistance = Number.POSITIVE_INFINITY;

	for (let i = 0; i < samples; i += 1) {
		const bearing = (2 * Math.PI * i) / samples;
		const point = destinationPoint(center.lat, center.lon, radiusMeters, bearing);
		const distance = haversineMeters(prev, point) + haversineMeters(point, next);
		if (distance < bestDistance) {
			bestDistance = distance;
			bestPoint = point;
		}
	}

	return bestPoint;
};

export const buildOptimalRouteCoordinates = (turnpoints: NormalizedTurnpoint[]): [number, number][] => {
	if (turnpoints.length === 0) return [];

	const points: Array<{ lat: number; lon: number }> = turnpoints.map((tp) => ({
		lat: tp.optimizedLat ?? tp.lat,
		lon: tp.optimizedLon ?? tp.lon
	}));

	const isFixedPoint = (tp: NormalizedTurnpoint): boolean =>
		Number.isFinite(tp.optimizedLat) && Number.isFinite(tp.optimizedLon);

	// A few forward passes produce stable "best line through cylinders" points.
	for (let pass = 0; pass < 6; pass += 1) {
		for (let i = 1; i < turnpoints.length - 1; i += 1) {
			const tp = turnpoints[i];
			if (isFixedPoint(tp)) continue;
			if (!Number.isFinite(tp.radiusMeters) || tp.radiusMeters <= 0) continue;

			const prev = points[i - 1];
			const next = points[i + 1];
			const center = { lat: tp.lat, lon: tp.lon };
			points[i] = optimizeTurnpointOnCylinder(center, tp.radiusMeters, prev, next);
		}
	}

	return points.map((point) => [point.lon, point.lat]);
};

export const buildXcTaskPayload = (task: NormalizedTask): XcTaskPayload => {
	const payload: XcTaskPayload = {
		taskType: 'CLASSIC',
		version: 1,
		turnpoints: task.turnpoints.map((tp) => ({
			type: mapTagToXcType(tp.tag),
			radius: Math.max(1, Math.round(tp.radiusMeters)),
			waypoint: {
				name: tp.id,
				description: `${tp.sectorType.toUpperCase()} ${Math.round(tp.radiusMeters)}m`,
				lat: tp.lat,
				lon: tp.lon,
				altSmoothed: 0
			}
		}))
	};

	const takeoff: XcTaskPayload['takeoff'] = {};
	if (task.times.wo) takeoff.timeOpen = toUtcTime(task.times.wo, task.timezoneOffsetMinutes);
	if (task.times.wc) takeoff.timeClose = toUtcTime(task.times.wc, task.timezoneOffsetMinutes);
	if (takeoff.timeOpen || takeoff.timeClose) payload.takeoff = takeoff;

	if (task.times.so) {
		payload.sss = {
			type: 'RACE',
			direction: 'ENTER',
			timeGates: [toUtcTime(task.times.so, task.timezoneOffsetMinutes)],
			timeClose: task.times.tc ? toUtcTime(task.times.tc, task.timezoneOffsetMinutes) : undefined
		};
	}

	if (task.times.tc) {
		payload.goal = {
			type: 'CYLINDER',
			deadline: toUtcTime(task.times.tc, task.timezoneOffsetMinutes)
		};
	}

	return payload;
};

export const xctskFilename = (task: NormalizedTask): string => {
	const safeDate = task.date || new Date().toISOString().slice(0, 10);
	return `trofeo-montegrappa-${safeDate}.xctsk`;
};

