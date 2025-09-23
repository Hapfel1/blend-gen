import fs from 'fs';
import fsp from 'fs/promises';

export function readConfig(path, fallback = {}) {
	try {
		const raw = fs.readFileSync(path, 'utf8');
		return JSON.parse(raw);
	} catch (err) {
		return fallback;
	}
}

export async function readHistory(path) {
	try {
		const raw = await fsp.readFile(path, 'utf8');
		return JSON.parse(raw);
	} catch (err) {
		return null;
	}
}

export async function writeHistory(path, data) {
	try {
		await fsp.writeFile(path, JSON.stringify(data), 'utf8');
	} catch (err) {
		// Ignore write errors
	}
}

