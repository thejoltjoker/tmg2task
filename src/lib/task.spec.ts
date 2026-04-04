import { describe, it, expect, vi } from 'vitest';
import {
	fetchAirtribuneTask,
	fetchFlymasterTask,
	fetchCurrentTask,
	TROFEO_AIRTRIBUNE_URL,
	TROFEO_FLYMASTER_FALLBACK_URL
} from './task';

const mockAirtribuneResponse = {
	event: 'Test Event',
	tzone: 120,
	date: '2024-07-01',
	name: 'Task 1',
	type: 'race',
	times: { wo: '09:00', wc: '12:00', so: '10:00', tc: '18:00' },
	dist: 50000,
	ssdist: 45000,
	wpts: [
		{
			id: 'D01',
			tag: 'd',
			opt: [45.76, 11.72],
			sector: { type: 'cy', rad: 400, ctr: [45.76, 11.72] }
		},
		{
			id: 'T01',
			tag: 't',
			opt: [45.8, 11.75],
			sector: { type: 'cy', rad: 400, ctr: [45.8, 11.75] }
		},
		{
			id: 'G01',
			tag: 'e',
			opt: [45.9, 11.8],
			sector: { type: 'cy', rad: 200, ctr: [45.9, 11.8] }
		}
	]
};

const mockFlymasterResponse = {
	items: [
		{ n: 'D01', type: '0', s: '0.4', a: '45.76', o: '11.72' },
		{ n: 'T01', type: '2', s: '0.4', a: '45.80', o: '11.75' },
		{ n: 'G01', type: '5', s: '0.2', a: '45.90', o: '11.80' }
	]
};

type MockResponse = {
	ok: boolean;
	status?: number;
	json?: () => Promise<unknown>;
	text?: () => Promise<string>;
};

const makeMockFetch = (responses: Record<string, MockResponse>) => {
	return vi.fn(async (url: string | URL | Request) => {
		const urlStr = url.toString();
		for (const [key, value] of Object.entries(responses)) {
			if (urlStr.includes(key)) return value as Response;
		}
		return { ok: false, status: 404 } as Response;
	}) as unknown as typeof fetch;
};

describe('fetchAirtribuneTask', () => {
	it('fetches and normalizes an airtribune task', async () => {
		const mockFetch = makeMockFetch({
			'airtribune.com': { ok: true, json: async () => mockAirtribuneResponse }
		});
		const task = await fetchAirtribuneTask(mockFetch);
		expect(task.event).toBe('Test Event');
		expect(task.date).toBe('2024-07-01');
		expect(task.turnpoints).toHaveLength(3);
		expect(task.turnpoints[0].tag).toBe('d');
	});

	it('includes a cache-busting timestamp in the request URL', async () => {
		const mockFetch = makeMockFetch({
			'airtribune.com': { ok: true, json: async () => mockAirtribuneResponse }
		});
		await fetchAirtribuneTask(mockFetch);
		const calledUrl = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(calledUrl).toContain(`${TROFEO_AIRTRIBUNE_URL}?ts=`);
	});

	it('throws when airtribune returns a non-ok response', async () => {
		const mockFetch = makeMockFetch({
			'airtribune.com': { ok: false, status: 503 }
		});
		await expect(fetchAirtribuneTask(mockFetch)).rejects.toThrow();
	});
});

describe('fetchFlymasterTask', () => {
	it('fetches and normalizes a flymaster task using the fallback URL', async () => {
		const mockFetch = makeMockFetch({
			'bs.php': { ok: false },
			'json/kml': { ok: true, json: async () => mockFlymasterResponse }
		});
		const task = await fetchFlymasterTask(mockFetch);
		expect(task.turnpoints).toHaveLength(3);
		expect(task.turnpoints[0].tag).toBe('d');
		expect(task.turnpoints[0].radiusMeters).toBe(400);
		expect(task.turnpoints[2].tag).toBe('e');
	});

	it('uses the URL discovered from the group page when available', async () => {
		const discoveredUrl = 'https://lt.flymaster.net/json/kml/99999.json';
		const mockFetch = makeMockFetch({
			'bs.php': {
				ok: true,
				text: async () => `<a href="${discoveredUrl}">task</a>`
			},
			'json/kml': { ok: true, json: async () => mockFlymasterResponse }
		});
		await fetchFlymasterTask(mockFetch);
		const calls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
		expect(calls.some((u) => u.includes('99999'))).toBe(true);
	});

	it('throws when flymaster returns a non-ok response', async () => {
		const mockFetch = makeMockFetch({
			'bs.php': { ok: false },
			'json/kml': { ok: false, status: 503 }
		});
		await expect(fetchFlymasterTask(mockFetch)).rejects.toThrow();
	});
});

describe('fetchCurrentTask', () => {
	it('uses airtribune when source is "airtribune"', async () => {
		const mockFetch = makeMockFetch({
			'airtribune.com': { ok: true, json: async () => mockAirtribuneResponse }
		});
		const task = await fetchCurrentTask(mockFetch, 'airtribune');
		expect(task.event).toBe('Test Event');
	});

	it('uses flymaster when source is "flymaster"', async () => {
		const mockFetch = makeMockFetch({
			'bs.php': { ok: false },
			'json/kml': { ok: true, json: async () => mockFlymasterResponse }
		});
		const task = await fetchCurrentTask(mockFetch, 'flymaster');
		expect(task.turnpoints[0].tag).toBe('d');
	});

	it('prefers airtribune in auto mode when it succeeds', async () => {
		const mockFetch = makeMockFetch({
			'airtribune.com': { ok: true, json: async () => mockAirtribuneResponse },
			'json/kml': { ok: true, json: async () => mockFlymasterResponse }
		});
		const task = await fetchCurrentTask(mockFetch, 'auto');
		expect(task.event).toBe('Test Event');
	});

	it('falls back to flymaster in auto mode when airtribune fails', async () => {
		const mockFetch = makeMockFetch({
			'airtribune.com': { ok: false },
			'bs.php': { ok: false },
			'json/kml': { ok: true, json: async () => mockFlymasterResponse }
		});
		const task = await fetchCurrentTask(mockFetch, 'auto');
		expect(task.turnpoints[0].tag).toBe('d');
	});

	it('defaults to auto mode when no source is provided', async () => {
		const mockFetch = makeMockFetch({
			'airtribune.com': { ok: true, json: async () => mockAirtribuneResponse }
		});
		const task = await fetchCurrentTask(mockFetch);
		expect(task.event).toBe('Test Event');
	});

	it('throws when both sources fail in auto mode', async () => {
		const mockFetch = makeMockFetch({
			'airtribune.com': { ok: false },
			'bs.php': { ok: false },
			[TROFEO_FLYMASTER_FALLBACK_URL]: { ok: false }
		});
		await expect(fetchCurrentTask(mockFetch, 'auto')).rejects.toThrow(
			'Unable to load Trofeo task from Airtribune or Flymaster'
		);
	});
});
