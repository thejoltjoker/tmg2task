<script lang="ts">
	import { goto } from '$app/navigation';
	import { Tabs } from 'bits-ui';
	import {
		CircleLayer,
		FillLayer,
		GeoJSONSource,
		LineLayer,
		MapLibre,
		NavigationControl
	} from 'svelte-maplibre-gl';

	let { data } = $props();
	type BasemapKey = 'openfreemap' | 'topo';

	const basemapStyles: Record<BasemapKey, string | object> = {
		openfreemap: 'https://tiles.openfreemap.org/styles/liberty',
		topo: {
			version: 8,
			sources: {
				opentopomap: {
					type: 'raster',
					tiles: [
						'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
						'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
						'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'
					],
					tileSize: 256,
					attribution:
						'Map data: OpenStreetMap contributors, SRTM | Map style: OpenTopoMap (CC-BY-SA)'
				}
			},
			layers: [{ id: 'opentopomap-layer', type: 'raster', source: 'opentopomap' }]
		}
	};
	let basemap = $state<BasemapKey>('openfreemap');
	const mapStyle = $derived(basemapStyles[basemap]);

	const center = $derived.by(() => {
		if (!data.task || data.task.turnpoints.length === 0) return { lat: 45.76, lon: 11.72 };
		const turnpoints = data.task.turnpoints as Array<{ lat: number; lon: number }>;
		const total = turnpoints.reduce(
			(acc, turnpoint) => ({ lat: acc.lat + turnpoint.lat, lon: acc.lon + turnpoint.lon }),
			{
				lat: 0,
				lon: 0
			}
		);
		return {
			lat: total.lat / turnpoints.length,
			lon: total.lon / turnpoints.length
		};
	});

	const mapGeojson = $derived(data.mapGeojson ?? { type: 'FeatureCollection', features: [] });

	let qrTab = $state('full-task');

	function handleSourceChange(event: Event) {
		const source = (event.currentTarget as HTMLSelectElement).value;
		goto(`?source=${source}`, { invalidateAll: true });
	}
</script>

<svelte:head>
	<title>Trofeo Montegrappa Task QR</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-6 p-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-3xl font-bold">Trofeo Montegrappa - Current Task</h1>
		<label class="flex items-center gap-2 text-sm text-slate-700">
			Data source
			<select
				class="rounded border border-slate-300 px-2 py-1"
				value={data.source}
				onchange={handleSourceChange}
			>
				<option value="auto">Auto</option>
				<option value="airtribune">Airtribune</option>
				<option value="flymaster">Flymaster</option>
			</select>
		</label>
	</div>

	{#if data.error}
		<p class="rounded border border-red-300 bg-red-50 p-4 text-red-800">{data.error}</p>
	{:else if data.task}
		<section class="grid gap-4 md:grid-cols-2">
			<div class="rounded border border-slate-200 p-4">
				<h2 class="mb-4 text-xl font-semibold">Task metadata</h2>
				<dl class="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
					<dt class="font-medium text-slate-600">Event</dt>
					<dd>{data.task.event}</dd>
					<dt class="font-medium text-slate-600">Date</dt>
					<dd>{data.task.date}</dd>
					<dt class="font-medium text-slate-600">Name</dt>
					<dd>{data.task.name}</dd>
					<dt class="font-medium text-slate-600">Type</dt>
					<dd>{data.task.type}</dd>
					<dt class="font-medium text-slate-600">Distance</dt>
					<dd>{(data.task.distanceMeters / 1000).toFixed(1)} km</dd>
					<dt class="font-medium text-slate-600">SS distance</dt>
					<dd>{(data.task.speedSectionDistanceMeters / 1000).toFixed(1)} km</dd>
					<dt class="font-medium text-slate-600">Windows</dt>
					<dd>
						WO {data.task.times.wo ?? '-'} / WC {data.task.times.wc ?? '-'} / SO {data.task.times
							.so ?? '-'} / TC {data.task.times.tc ?? '-'}
					</dd>
				</dl>
			</div>

			<div class="rounded border border-slate-200 p-4">
				<h2 class="mb-4 text-xl font-semibold">XCTSK download</h2>
				<p class="mb-4 text-sm text-slate-700">
					Use this file if scanning is unreliable in bright light. Import the downloaded `.xctsk`
					into FlySkyHy.
				</p>
				<a
					class="inline-block rounded bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
					href={data.downloadUrl ?? '/download.xctsk'}
				>
					Download {data.xctskFilename}
				</a>
			</div>
		</section>

		<section class="rounded border border-slate-200 p-4">
			<h2 class="mb-4 text-xl font-semibold">Task QR</h2>

			<div class="md:hidden">
				<Tabs.Root bind:value={qrTab} class="space-y-3">
					<Tabs.List
						class="inline-flex w-full max-w-md gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm font-medium"
					>
						<Tabs.Trigger
							value="full-task"
							class="flex-1 rounded-md px-3 py-2 text-slate-700 transition-colors data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
						>
							Full task (XCTSK)
						</Tabs.Trigger>
						<Tabs.Trigger
							value="download"
							class="flex-1 rounded-md px-3 py-2 text-slate-700 transition-colors data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
						>
							Download link
						</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Content value="full-task" class="outline-none">
						<p class="mb-4 text-sm text-slate-700">
							Primary QR with `XCTSK:` prefixed full task payload.
						</p>
						{#if data.inlineQrDataUrl}
							<img
								class="h-72 w-72 border border-slate-200"
								alt="Inline XCTSK QR code"
								src={data.inlineQrDataUrl}
							/>
						{/if}
					</Tabs.Content>
					<Tabs.Content value="download" class="outline-none">
						<p class="mb-4 text-sm text-slate-700">
							Fallback QR encoding a URL to download the `.xctsk` file.
						</p>
						{#if data.urlQrDataUrl}
							<img
								class="h-72 w-72 border border-slate-200"
								alt="Download URL QR code"
								src={data.urlQrDataUrl}
							/>
						{/if}
					</Tabs.Content>
				</Tabs.Root>
			</div>

			<div class="hidden gap-8 md:grid md:grid-cols-2">
				<div>
					<h3 class="mb-2 text-sm font-semibold text-slate-900">Full task (XCTSK)</h3>
					<p class="mb-4 text-sm text-slate-700">
						Primary QR with `XCTSK:` prefixed full task payload.
					</p>
					{#if data.inlineQrDataUrl}
						<img
							class="h-72 w-72 border border-slate-200"
							alt="Inline XCTSK QR code"
							src={data.inlineQrDataUrl}
						/>
					{/if}
				</div>
				<div>
					<h3 class="mb-2 text-sm font-semibold text-slate-900">Download link</h3>
					<p class="mb-4 text-sm text-slate-700">
						Fallback QR encoding a URL to download the `.xctsk` file.
					</p>
					{#if data.urlQrDataUrl}
						<img
							class="h-72 w-72 border border-slate-200"
							alt="Download URL QR code"
							src={data.urlQrDataUrl}
						/>
					{/if}
				</div>
			</div>
		</section>

		<section class="space-y-3 rounded border border-slate-200 p-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<h2 class="text-xl font-semibold">Task map</h2>
				<label class="flex items-center gap-2 text-sm text-slate-700">
					Basemap
					<select class="rounded border border-slate-300 px-2 py-1" bind:value={basemap}>
						<option value="openfreemap">OpenFreeMap</option>
						<option value="topo">Topo (OpenTopoMap)</option>
					</select>
				</label>
			</div>
			<MapLibre
				style={mapStyle as any}
				center={[center.lon, center.lat]}
				zoom={10}
				inlineStyle="height: 420px; width: 100%; border-radius: 0.5rem;"
			>
				<NavigationControl />
				<GeoJSONSource id="task-geojson" data={mapGeojson as any}>
					<FillLayer
						id="turnpoint-radius-fill"
						filter={['==', ['get', 'kind'], 'turnpoint-radius']}
						paint={{
							'fill-color': [
								'match',
								['get', 'tag'],
								'd',
								'#86efac',
								's',
								'#fcd34d',
								't',
								'#93c5fd',
								'e',
								'#fca5a5',
								'g',
								'#c4b5fd',
								'#cbd5e1'
							],
							'fill-opacity': 0.2
						}}
					/>
					<LineLayer
						id="turnpoint-radius-outline"
						filter={['==', ['get', 'kind'], 'turnpoint-radius']}
						paint={{
							'line-color': [
								'match',
								['get', 'tag'],
								'd',
								'#16a34a',
								's',
								'#d97706',
								't',
								'#2563eb',
								'e',
								'#dc2626',
								'g',
								'#7c3aed',
								'#475569'
							],
							'line-width': 2,
							'line-opacity': 0.9
						}}
					/>
					<LineLayer
						id="task-line"
						filter={['==', ['get', 'kind'], 'task-line']}
						paint={{ 'line-color': '#334155', 'line-width': 3 }}
					/>
					<CircleLayer
						id="task-points"
						filter={['==', ['get', 'kind'], 'turnpoint']}
						paint={{
							'circle-color': [
								'match',
								['get', 'tag'],
								'd',
								'#16a34a',
								's',
								'#d97706',
								't',
								'#2563eb',
								'e',
								'#dc2626',
								'g',
								'#7c3aed',
								'#475569'
							],
							'circle-radius': 5,
							'circle-stroke-color': '#ffffff',
							'circle-stroke-width': 1
						}}
					/>
				</GeoJSONSource>
			</MapLibre>
		</section>

		<section class="rounded border border-slate-200 p-4">
			<h2 class="mb-4 text-xl font-semibold">Turnpoints</h2>
			<div class="overflow-x-auto">
				<table class="min-w-full border-collapse text-sm">
					<thead>
						<tr class="border-b border-slate-200 text-left">
							<th class="px-2 py-2">#</th>
							<th class="px-2 py-2">Name</th>
							<th class="px-2 py-2">Tag</th>
							<th class="px-2 py-2">Sector</th>
							<th class="px-2 py-2">Radius (m)</th>
							<th class="px-2 py-2">Lat</th>
							<th class="px-2 py-2">Lon</th>
						</tr>
					</thead>
					<tbody>
						{#each data.task.turnpoints as tp, index (index)}
							<tr class="border-b border-slate-100">
								<td class="px-2 py-2">{index + 1}</td>
								<td class="px-2 py-2">{tp.id}</td>
								<td class="px-2 py-2">
									<span
										class={[
											'inline-flex min-w-6 justify-center rounded px-2 py-0.5 text-xs font-semibold uppercase',
											tp.tag === 'd' && 'bg-green-100 text-green-800',
											tp.tag === 's' && 'bg-amber-100 text-amber-800',
											tp.tag === 't' && 'bg-blue-100 text-blue-800',
											tp.tag === 'e' && 'bg-red-100 text-red-800',
											tp.tag === 'g' && 'bg-violet-100 text-violet-800'
										]}
									>
										{tp.tag}
									</span>
								</td>
								<td class="px-2 py-2">{tp.sectorType}</td>
								<td class="px-2 py-2">{Math.round(tp.radiusMeters)}</td>
								<td class="px-2 py-2">{tp.lat.toFixed(6)}</td>
								<td class="px-2 py-2">{tp.lon.toFixed(6)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</main>
