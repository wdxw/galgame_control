// Run under Electron's Node runtime to exercise the packaged SQLite ABI.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');
if (!process.versions.electron) {
  const child = spawnSync(require('electron'), [__filename], {
    stdio: 'inherit', windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 90000
  });
  process.exit(child.status ?? 1);
}
const Module = require('module');
const { EventEmitter } = require('events');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
const testDir = fs.mkdtempSync(path.join(root, 'build', 'ratings-test-'));
require.extensions['.ts'] = (module, filename) => module._compile(require('esbuild').transformSync(
  fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs', target: 'es2022' }
).code, filename);
let queryData;
let subjectData;
let subjectError;
let vndbGate;
let subjectGate;
let searches = [];
let lookups = [];
const snapshot = data => ({ data, updatedAt: 100000, stale: false });
const vn = { id: 'v17', title: 'Ever17', alttitle: 'Ever17', aliases: ['Ever 17'], released: '2002-08-29', rating: 85, votecount: 900, extlinks: [] };
const candidate = (id, title = 'Ever17', date = '2002-08-29') => ({ id, title, originalTitle: title, releaseDate: date, imageUrl: null });
const clientsMock = {
  getVndbRatingDetails: async id => { lookups.push(id); if (vndbGate) await vndbGate; return snapshot({ ...vn, id }); },
  getBangumiSubject: async id => { lookups.push(id); if (subjectGate) await subjectGate; if (subjectError) throw subjectError; return subjectData || snapshot({ id, type: 4, rating: { score: 8.2, total: 123 } }); },
  searchBangumi: async names => { searches.push(names); return queryData || { candidates: [candidate(10)], complete: true }; }
};
let apiResponse;
const apiRequests = [];
const parserNetwork = {
  cachedRating: async (_key, _force, fetcher) => snapshot(await fetcher()),
  requestRatingJson: async (url, body) => { apiRequests.push({ url, body }); return apiResponse; }
};
let httpMode = 'success';
const httpCalls = [];
const httpMock = { request(url, options, callback) {
  const request = new EventEmitter();
  request.destroy = error => { request.emit('error', error); return request; };
  request.end = payload => {
    httpCalls.push({ url, options, payload, at: Date.now() });
    if (httpMode === 'timeout') return;
    const response = new EventEmitter();
    response.statusCode = httpMode === 'rate-limit' ? 429 : 200;
    response.headers = { 'retry-after': '0.1' };
    response.setEncoding = () => {};
    response.resume = () => {};
    setImmediate(() => {
      callback(response);
      response.emit('data', '{"ok":true}');
      response.emit('end');
    });
  };
  return request;
}};
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'electron') return { app: { getPath: () => testDir } };
  if (request === './ratingClients' && parent.filename.endsWith('ratings.ts')) return clientsMock;
  if (request === './ratingNetwork' && parent.filename.endsWith('ratingClients.ts')) return { ...parserNetwork, RatingHttpError: require('../src/main/services/ratingNetwork.ts').RatingHttpError };
  if (request === 'https' && parent.filename.endsWith('ratingNetwork.ts')) return httpMock;
  return originalLoad.call(this, request, parent, isMain);
};
const db = require('../src/main/services/library.db.ts');
const ratings = require('../src/main/services/ratings.ts');
const matching = require('../src/main/services/ratingMatching.ts');
const clients = require('../src/main/services/ratingClients.ts');
const network = require('../src/main/services/ratingNetwork.ts');
const manual = require('../src/main/services/manualRatings.ts');
const egs = require('../src/main/services/egsSources.ts');
const database = db.getDb();
let count = 0;
async function test(name, fn) { await fn(); console.log('PASS ' + name); count++; }
function reset() {
  vn.extlinks = []; vn.rating = 85; vn.votecount = 900;
  queryData = undefined; subjectData = undefined; subjectError = undefined; vndbGate = undefined; subjectGate = undefined;
  lookups = []; searches = [];
  db.setSetting('vndbEnabled', 'true');
  database.prepare('UPDATE games SET vndb_id = ?, bangumi_id = NULL WHERE id = ?').run('v17', 'game');
}
async function main() {
  await test('v2 migration preserves games and is idempotent', () => {
    database.exec(`CREATE TABLE schema_version(version INTEGER PRIMARY KEY); INSERT INTO schema_version VALUES(2);
      CREATE TABLE games(id TEXT PRIMARY KEY, title TEXT, original_title TEXT, exe_path TEXT, game_dir TEXT,
        cover_path TEXT, cover_source TEXT, vndb_id TEXT, developer TEXT, description TEXT, release_date TEXT,
        play_time INTEGER, last_played TEXT, date_added TEXT, is_favorite INTEGER, notes TEXT, exe_args TEXT);
      INSERT INTO games(id,title,exe_path,vndb_id) VALUES('game','Ever17','game.exe','v17');`);
    db.initDatabase(); db.initDatabase();
    assert.equal(db.getGameById('game').title, 'Ever17');
    assert.equal(db.getGameById('game').bangumiId, null);
    assert.equal(database.prepare('SELECT version FROM schema_version').get().version, 5);
    assert.deepEqual(db.getGameById('game').worldTags, []);
  });
  await test('strict identity matching rejects sequels, remakes, dates and ambiguous names', () => {
    assert.equal(matching.uniqueExactMatch(['Ｅｖｅｒ１７'], '2002', [candidate(1)]).id, 1);
    assert.equal(matching.uniqueExactMatch(['Ever17'], null, [candidate(1), candidate(2)]), null);
    assert.equal(matching.uniqueExactMatch(['Ever17'], null, [candidate(1, 'Ever17 Remake')]), null);
    assert.equal(matching.uniqueExactMatch(['Ever17'], null, [candidate(1, 'Ever17 2')]), null);
    assert.equal(matching.uniqueExactMatch(['Ever17'], '2011', [candidate(1)]), null);
  });
  await test('only canonical rating pages and supported external associations are accepted', () => {
    assert.equal(matching.ratingSourceUrl('vndb','v17'), 'https://vndb.org/v17');
    assert.equal(matching.ratingSourceUrl('bangumi','10'), 'https://bgm.tv/subject/10');
    for(const id of ['javascript:alert(1)', '../x', '10?url=evil', '0']) assert.throws(()=>matching.ratingSourceUrl('bangumi',id));
    assert.throws(()=>matching.ratingSourceUrl('unknown','10'));
    assert.equal(matching.linkedBangumiId([{url:'https://bgm.tv/subject/10'}]),10);
    assert.equal(matching.linkedBangumiId([{url:'https://bgm.tv.evil/subject/10'}]),null);
  });
  await test('Bangumi client excludes animation and requests games only', async () => {
    apiResponse = { data: [{id:1,type:2,name:'Ever17'}, {id:10,type:4,name:'Ever17',name_cn:'时空轮回',date:'2002-08-29'}] };
    assert.equal((await clients.searchBangumi(['Ever17'])).candidates.length,1);
    assert.deepEqual(apiRequests.at(-1).body.filter.type,[4]);
    apiResponse = {id:1,type:2};
    await assert.rejects(clients.getBangumiSubject(1));
    apiResponse = {results:[{...vn}]};
    await clients.getVndbRatingDetails('v17');
    assert.deepEqual(apiRequests.at(-1).body.filters,['id','=','v17']);
  });
  await test('VNDB looks up the saved ID and formats its score without selecting search result one', async () => {
    reset(); const result = await ratings.getGameRating('game','vndb');
    assert.equal(result.score,8.5); assert.equal(result.voteCount,900); assert.deepEqual(lookups,['v17']);
    db.updateGame('game',{vndbId:null});
    assert.equal((await ratings.getGameRating('game','vndb')).status,'unmatched');
  });
  await test('explicit cross-site link beats title search; manual choice persists and wins later', async () => {
    reset(); vn.extlinks=[{url:'https://bgm.tv/subject/10'}];
    assert.equal((await ratings.getGameRating('game','bangumi')).score,8.2);
    assert.equal(db.getGameById('game').bangumiId,10); assert.equal(searches.length,0);
    await ratings.selectRatingCandidate('game','v17',20);
    lookups=[]; assert.equal((await ratings.getGameRating('game','bangumi')).externalId,'20'); assert.deepEqual(lookups,[20]);
    db.updateGame('game',{isFavorite:true,vndbId:'v17'}); assert.equal(db.getGameById('game').bangumiId,20);
    db.updateGame('game',{vndbId:'v18'}); assert.equal(db.getGameById('game').bangumiId,null);
  });
  await test('unique title auto-links while multiple candidates and partial searches require confirmation', async () => {
    reset(); assert.equal((await ratings.getGameRating('game','bangumi')).status,'ready');
    assert.equal(db.getGameById('game').bangumiId,10);
    reset(); queryData={candidates:[candidate(10),candidate(20)],complete:true};
    assert.equal((await ratings.getGameRating('game','bangumi')).status,'needs-match'); assert.equal(db.getGameById('game').bangumiId,null);
    queryData={candidates:[candidate(10)],complete:false};
    assert.equal((await ratings.getGameRating('game','bangumi')).status,'needs-match');
    queryData={candidates:[],complete:true}; assert.equal((await ratings.getGameRating('game','bangumi')).status,'unmatched');
  });
  await test('restricted links stay navigable; no votes is unrated; stale cache exposes its timestamp', async () => {
    reset(); vn.extlinks=[{url:'https://bgm.tv/subject/10'}]; subjectError=new network.RatingHttpError(403);
    const restricted=await ratings.getGameRating('game','bangumi'); assert.equal(restricted.status,'restricted'); assert.equal(restricted.externalId,'10');
    subjectError=undefined; subjectData=snapshot({rating:{score:0,total:0}});
    assert.equal((await ratings.getGameRating('game','bangumi')).status,'unrated');
    subjectData={...snapshot({rating:{score:8,total:1}}),stale:true};
    const stale=await ratings.getGameRating('game','bangumi'); assert.equal(stale.stale,true); assert.equal(stale.updatedAt,100000);
  });
  await test('online switch blocks reads and candidate searches without network calls', async () => {
    reset(); db.setSetting('vndbEnabled','false');
    assert.equal((await ratings.getGameRating('game','bangumi')).status,'disabled');
    await assert.rejects(ratings.searchRatingCandidates('game','Ever17')); assert.equal(lookups.length,0);
  });
  await test('late automatic requests and manual selections cannot bind to a changed VNDB identity', async () => {
    reset(); let release; vndbGate=new Promise(resolve=>release=resolve);
    const work=ratings.getGameRating('game','bangumi'); db.updateGame('game',{vndbId:'v18'}); release(); await work;
    assert.equal(db.getGameById('game').bangumiId,null);
    reset(); subjectGate=new Promise(resolve=>release=resolve);
    const selection=ratings.selectRatingCandidate('game','v17',20); db.updateGame('game',{vndbId:'v18'}); release();
    await assert.rejects(selection); assert.equal(db.getGameById('game').bangumiId,null);
  });
  await test('disk cache deduplicates concurrent reads, refreshes and falls back offline', async () => {
    let calls=0;
    const loader=async()=>{calls++;return {score:8};};
    await Promise.all([network.cachedRating('test:1',false,loader),network.cachedRating('test:1',false,loader)]);
    assert.equal(calls,1); await network.cachedRating('test:1',false,loader); assert.equal(calls,1);
    const stale=await network.cachedRating('test:1',true,async()=>{throw Error('offline')}); assert.equal(stale.stale,true); assert.equal(stale.data.score,8);
    const fresh=await network.cachedRating('test:1',true,loader); assert.equal(fresh.stale,false); assert.equal(calls,2);
  });
  await test('HTTP requests deduplicate, space starts, and honor rate-limit backoff', async () => {
    const url='https://api.bgm.tv/test';
    await Promise.all([network.requestRatingJson(url),network.requestRatingJson(url)]); assert.equal(httpCalls.length,1);
    await network.requestRatingJson(url+'2'); assert.ok(httpCalls[1].at-httpCalls[0].at>=1000);
    httpMode='rate-limit'; await assert.rejects(network.requestRatingJson(url+'3'), error=>error.status===429);
    httpMode='success'; await network.requestRatingJson(url+'4'); assert.ok(httpCalls[3].at-httpCalls[2].at>=4900);
    assert.match(httpCalls[0].options.headers['User-Agent'],/wdxw\/GalController/);
  });
  await test('hung HTTP requests time out instead of blocking the detail page indefinitely', async () => {
    httpMode='timeout'; await assert.rejects(network.requestRatingJson('https://timeout.test/rating'),/timed out/);
  });
  await test('form music searches preserve Unicode and deduplicate by their encoded payload', async () => {
    httpMode='success'; const before=httpCalls.length;
    const url='https://music.163.com/api/cloudsearch/pc';
    const form=()=>new URLSearchParams({s:'装甲悪鬼村正',type:'10'});
    await Promise.all([network.requestRatingJson(url,form()),network.requestRatingJson(url,form()),network.requestRatingJson(url,new URLSearchParams({s:'CLANNAD',type:'1'}))]);
    assert.equal(httpCalls.length-before,2);
    const first=httpCalls[before];
    assert.equal(first.options.headers['Content-Type'],'application/x-www-form-urlencoded');
    assert.equal(new URLSearchParams(first.payload).get('s'),'装甲悪鬼村正');
    await network.requestRatingJson('https://json.test/vn',{filters:['id','=','v2016']});
    assert.equal(httpCalls.at(-1).options.headers['Content-Type'],'application/json');
    assert.equal(JSON.parse(httpCalls.at(-1).payload).filters[2],'v2016');
  });

  await test('manual EGS accepts canonical sites and IDs while rejecting arbitrary URLs', () => {
    assert.deepEqual(egs.parseEgsEntry(' 00123 '),{externalId:'123',site:'koko'});
    for(const site of ['koko','official','legacy']) {
      const url=egs.egsSourceUrl('123',site);
      assert.deepEqual(egs.parseEgsEntry(url),{externalId:'123',site});
      assert.equal(matching.ratingSourceUrl('erogamescape','123',site),url);
    }
    assert.equal(egs.parseEgsEntry('http://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=123').site,'legacy');
    for(const value of ['0','-1','1.2','9007199254740992','https://koko.kyara.top.evil/game.php?game=1','https://evil/game.php?game=1','https://koko.kyara.top/','https://koko.kyara.top/game.php?game=1&game=2','https://koko.kyara.top/game.php?game=1&url=evil','https://user@koko.kyara.top/game.php?game=1','https://koko.kyara.top:444/game.php?game=1','javascript:alert(1)','file:///game.php?game=1']) assert.throws(()=>egs.parseEgsEntry(value),value);
    assert.throws(()=>matching.ratingSourceUrl('erogamescape','123','__proto__'));
    assert.throws(()=>matching.ratingSourceUrl('erogamescape','123'));
  });
  await test('manual ratings work offline, preserve zero/empty values and never request ratings', async () => {
    reset();db.setSetting('vndbEnabled','false');const before=httpCalls.length;
    const zero=manual.saveManualRating('game','v17',{entry:'123',score:0,voteCount:0});
    assert.equal(zero.score,0);assert.equal(zero.voteCount,0);assert.equal(zero.status,'ready');assert.equal(zero.source,'manual');assert.equal(zero.maxScore,100);
    const read=await ratings.getGameRating('game','erogamescape');assert.deepEqual(read,zero);
    assert.ok(read.updatedAt>0);assert.equal(read.egsSite,'koko');
    const blank=manual.saveManualRating('game','v17',{entry:egs.egsSourceUrl('456','official'),score:null,voteCount:null});
    assert.equal(blank.status,'unrated');assert.equal(blank.egsSite,'official');assert.equal(blank.score,null);assert.equal(blank.voteCount,null);
    for(const score of [-1,101,NaN,Infinity,'50']) assert.throws(()=>manual.saveManualRating('game','v17',{entry:'123',score,voteCount:null}));
    for(const voteCount of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'5']) assert.throws(()=>manual.saveManualRating('game','v17',{entry:'123',score:50,voteCount}));
    assert.throws(()=>manual.saveManualRating('game','v17',{entry:'https://evil/',score:50,voteCount:1}));
    assert.deepEqual(manual.getManualRating('game'),blank);
    assert.equal(lookups.length,0);assert.equal(searches.length,0);assert.equal(httpCalls.length,before);
  });
  await test('manual identity survives ordinary edits and clears on changing works or deletion', () => {
    reset();manual.saveManualRating('game','v17',{entry:'123',score:100,voteCount:10});
    db.updateGame('game',{title:'Edited title',coverPath:'new-cover.png',vndbId:'v17'});
    assert.equal(manual.getManualRating('game').score,100);
    db.updateGame('game',{vndbId:'v18'});assert.equal(manual.getManualRating('game').externalId,null);
    assert.throws(()=>manual.saveManualRating('game','v17',{entry:'123',score:1,voteCount:null}));
    manual.saveManualRating('game','v18',{entry:'123',score:80,voteCount:null});
    assert.throws(()=>manual.clearManualRating('game','v17'));assert.equal(manual.getManualRating('game').score,80);
    manual.clearManualRating('game','v18');assert.equal(manual.getManualRating('game').externalId,null);
    database.prepare("INSERT INTO games(id,title,exe_path,vndb_id) VALUES('delete-me','Delete','delete.exe','v1')").run();
    manual.saveManualRating('delete-me','v1',{entry:'123',score:90,voteCount:1});db.deleteGame('delete-me');
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM manual_ratings WHERE game_id=?').get('delete-me').n,0);
  });
  await test('manual rating and selected source persist after database reopening', () => {
    manual.saveManualRating('game','v18',{entry:egs.egsSourceUrl('789','legacy'),score:85.5,voteCount:500});
    const before=manual.getManualRating('game');db.closeDatabase();db.initDatabase();
    assert.deepEqual(manual.getManualRating('game'),before);
  });
  console.log(`\n${count} rating checks passed.`);
  db.closeDatabase();
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{Module._load=originalLoad;});
