import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildXcTaskPayload, fetchCurrentTask, xctskFilename } from '$lib/task';

export const GET: RequestHandler = async ({ fetch }) => {
	const task = await fetchCurrentTask(fetch);
	const payload = buildXcTaskPayload(task);
	const fileName = xctskFilename(task);

	return json(payload, {
		headers: {
			'content-type': 'application/xctsk; charset=utf-8',
			'content-disposition': `attachment; filename="${fileName}"`,
			'cache-control': 'no-store'
		}
	});
};

