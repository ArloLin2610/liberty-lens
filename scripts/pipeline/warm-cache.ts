// Dev helper: download every history into LL_CACHE_DIR so rule research can iterate offline.
import { loadUniverse } from './universe';
import { fetchAll } from './yahoo';
const universe = await loadUniverse();
console.log(universe.source, universe.note, universe.items.length);
const tickers = [...universe.items.map((item) => item.ticker), '^VIX', '^TNX', '^IRX', '^GSPC'];
const { data, failed } = await fetchAll(tickers, 6, (done) => { if (done % 50 === 0) console.log(done); });
console.log('ok', data.size, 'failed', failed);
