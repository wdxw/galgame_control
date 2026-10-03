const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = require('child_process').spawnSync(require('electron'), [__filename], { env, stdio: 'inherit', windowsHide: true, timeout: 180000 });
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow, protocol, shell } = require('electron');
const Module = require('module');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
const testDir = fs.mkdtempSync(path.join(root, 'build', 'ratings-ui-'));
app.setPath('appData', testDir);
app.setPath('userData', path.join(testDir, 'profile'));
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{ scheme: 'local-file', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
require.extensions['.ts'] = (module, filename) => module._compile(require('esbuild').transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code, filename);
const originalLoad = Module._load;
const links = [];
shell.openExternal = async url => { links.push(url); };
let restricted = false;
let stale = false;
let noVotes = false;
let slowSubject = null;
const snapshot = data => ({ data, updatedAt: Date.now(), stale });
const candidates = [10,20].map(id => ({ id, title: id === 10 ? '时空轮回（原版）' : '时空轮回（另一版本）', originalTitle: 'Ever17', releaseDate: id === 10 ? '2002-08-29' : '2011-12-01', imageUrl: null }));
const clients = {
  getVndbRatingDetails: async id => snapshot({id,title:id==='v18'?'New Game':'Ever17',alttitle:'Ever17',aliases:[],released:'2002-08-29',rating:85,votecount:900,extlinks:id==='v18'?[{url:'https://bgm.tv/subject/40'}]:[]}),
  getBangumiSubject: async id => {
    if(slowSubject && id===20) await slowSubject;
    if(restricted) throw new (require('../src/main/services/ratingNetwork.ts').RatingHttpError)(403);
    return snapshot({id,type:4,name:'Ever17',name_cn:'时空轮回',rating:{score:id===30?7.3:id===40?8.8:9.1,total:noVotes?0:456}});
  },
  searchBangumi: async names => ({ candidates: names.includes('missing')?[]:candidates, complete:true })
};
Module._load = function(request,parent,isMain) {
  if(request==='./ratingClients' && parent.filename.endsWith('ratings.ts')) return clients;
  if(request==='../services/vndbClient' && parent.filename.endsWith('cover.ipc.ts')) return {
    searchVndb: async()=>[{id:'v18',title:'New Game',originalTitle:'New Game',imageUrl:'local-file:///'+path.join(root,'resources/icon.png').replaceAll('\\','/'),imageNSFW:false,releaseDate:'2003-01-01',developer:'Developer',description:'Imported from VNDB',aliases:[],rating:85,voteCount:900}],
    downloadVndbCover: async(gameId,_url,dir)=>{const file=path.join(dir,gameId+'.png');fs.copyFileSync(path.join(root,'resources/icon.png'),file);return file;}
  };
  return originalLoad.call(this,request,parent,isMain);
};
const pause = ms=>new Promise(resolve=>setTimeout(resolve,ms));
const {zh,en} = require('../src/renderer/i18n/translations.ts');
app.whenReady().then(async()=>{
  protocol.handle('local-file',request=>new Response(fs.readFileSync(decodeURI(request.url.slice('local-file:///'.length))),{headers:{'Content-Type':'image/png'}}));
  const egsRequests=[];
  require('electron').session.defaultSession.webRequest.onBeforeRequest({urls:['*://koko.kyara.top/*','*://erogamescape.org/*','*://erogamescape.dyndns.org/*']},(details,done)=>{egsRequests.push(details.url);done({cancel:true})});
  const db = require('../src/main/services/library.db.ts');
  db.initDatabase();
  const fixture={id:'a',title:'Ever17',originalTitle:'时空轮回',exePath:'a.exe',gameDir:'',coverPath:path.join(root,'resources/icon.png'),coverSource:'vndb',vndbId:'v17',bangumiId:null,developer:'Developer',description:'选择正确的游戏版本后，将保存评分网站关联。',releaseDate:'2002-08-29',playTime:0,lastPlayed:null,dateAdded:'2026-09-20',isFavorite:false,notes:null,exeArgs:null};
  db.addGame(fixture); db.addGame({...fixture,id:'b',title:'Another Game',exePath:'b.exe',vndbId:'v19',bangumiId:30});
  db.setSetting('theme','soft-pink'); db.setSetting('language','zh');
  require('../src/main/ipc/index.ts').registerAllHandlers();
  const win=new BrowserWindow({width:1280,height:960,frame:false,show:false,webPreferences:{preload:path.join(root,'out/preload/preload.js'),sandbox:false,contextIsolation:true,offscreen:true}});
  const errors=[];
  win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message)});
  const run=async code=>{try{return await win.webContents.executeJavaScript(code)}catch(error){throw new Error(code+'\n'+error.message)}};
  async function waitFor(code){for(let i=0;i<100;i++){if(await run(code))return;await pause(80)}throw Error('Timeout: '+code)}
  const clickText=async(selector,label)=>{const find=`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(b=>b.textContent.trim()===${JSON.stringify(label)})`;await waitFor(`!!(${find}) && !(${find}).disabled`);return run(`${find}.click()`)};
  const card=async title=>{const find=`Array.from(document.querySelectorAll('.game-card')).find(c=>c.querySelector('h3').textContent===${JSON.stringify(title)})`;await waitFor(`!!(${find})`);return run(`${find}.click()`)};
  const close=()=>run("document.querySelector('.detail-panel button').click()");
  const fill=async(name,value)=>run(`(()=>{const input=document.querySelector('[data-egs-form] input[name="'+${JSON.stringify(name)}+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const egs='[data-rating-provider="erogamescape"]';
  const bgm='[data-rating-provider="bangumi"]';
  await win.loadFile(path.join(root,'out/renderer/index.html'));
  await waitFor("document.querySelectorAll('.game-card').length===2");
  await card('Ever17');
  await waitFor(`document.querySelector('${bgm}')?.textContent.includes(${JSON.stringify(zh['ratings.needsMatch'])})`);
  assert.ok(await run("document.querySelector('[data-rating-provider=vndb]').textContent.includes('8.5 / 10')"));
  await clickText(bgm+' button',zh['ratings.find']);
  await waitFor("!!document.querySelector('[data-rating-matcher]')");
  assert.ok(await run("document.querySelector('[data-rating-matcher]').textContent.includes('2011-12-01')"));
  await run("Array.from(document.querySelectorAll('[data-rating-matcher] button')).find(b=>b.textContent.includes('#20')).click()");
  await waitFor(`document.querySelector('${bgm}')?.textContent.includes('9.1 / 10')`);
  assert.equal(db.getGameById('a').bangumiId,20);
  await clickText('[data-rating-provider=vndb] button',zh['ratings.view']);
  await clickText(bgm+' button',zh['ratings.view']);
  assert.deepEqual(links,['https://vndb.org/v17','https://bgm.tv/subject/20']);
  await clickText(bgm+' button',zh['ratings.rematch']);
  await waitFor("!!document.querySelector('[data-rating-matcher]')");
  await clickText('[data-rating-matcher] button',zh['ratings.cancel']);
  assert.equal(db.getGameById('a').bangumiId,20);
  restricted=true;
  await clickText(bgm+' button',zh['ratings.refresh']);
  await waitFor(`document.querySelector('${bgm}').textContent.includes(${JSON.stringify(zh['ratings.restricted'])})`);
  assert.ok(await run("document.querySelector('[data-rating-provider=vndb]').textContent.includes('8.5 / 10')"));
  restricted=false; stale=true;
  await clickText(bgm+' button',zh['ratings.retry']);
  await waitFor(`document.querySelector('${bgm}').textContent.includes('离线缓存')`);
  stale=false; noVotes=true;
  await clickText(bgm+' button',zh['ratings.refresh']);
  await waitFor(`document.querySelector('${bgm}').textContent.includes(${JSON.stringify(zh['ratings.unrated'])})`);
  noVotes=false;
  await clickText(bgm+' button',zh['ratings.refresh']);
  await waitFor(`document.querySelector('${bgm}').textContent.includes('9.1 / 10')`);

  await clickText(egs+' button',zh['egs.add']);
  await fill('entry','https://evil.example/game.php?game=123');await fill('score','82');await fill('votes','120');
  await clickText('[data-egs-form] button',zh['egs.save']);
  await waitFor(`document.querySelector('${egs} [role=alert]')?.textContent.includes(${JSON.stringify(zh['egs.saveError'])})`);
  assert.equal(db.getManualEgsRating('a'),null);
  await fill('entry','https://erogamescape.org/~ap2/ero/toukei_kaiseki/game.php?game=123');
  await fill('votes','1.5');assert.equal(await run("document.querySelector('[data-egs-form]').checkValidity()"),false);
  await run("document.querySelector('[data-egs-form]').scrollIntoView({block:'center'})");await pause(450);fs.writeFileSync(path.join(testDir,'manual-form.png'),(await win.webContents.capturePage()).toPNG());
  await fill('votes','120');await clickText('[data-egs-form] button',zh['egs.save']);
  await waitFor(`!document.querySelector('[data-egs-form]') && document.querySelector('${egs}').textContent.includes('82 / 100')`);
  assert.equal(db.getManualEgsRating('a').site,'official');
  await clickText(egs+' button',zh['ratings.view']);assert.equal(links.at(-1),'https://erogamescape.org/~ap2/ero/toukei_kaiseki/game.php?game=123');
  await clickText(egs+' button',zh['egs.edit']);await fill('score','99');
  await clickText('[data-egs-form] button',zh['ratings.cancel']);assert.equal(db.getManualEgsRating('a').score,82);
  await clickText(egs+' button',zh['egs.clear']);await clickText(egs+' [role=alertdialog] button',zh['ratings.cancel']);assert.equal(db.getManualEgsRating('a').score,82);
  await clickText(egs+' button',zh['egs.edit']);await fill('entry','456');await fill('score','0');await fill('votes','0');await clickText('[data-egs-form] button',zh['egs.save']);
  await waitFor(`!document.querySelector('[data-egs-form]') && document.querySelector('${egs}').textContent.includes('0 / 100')`);
  await close();await win.loadFile(path.join(root,'out/renderer/index.html'));await card('Ever17');
  await waitFor(`document.querySelector('${egs}')?.textContent.includes('0 / 100')`);
  await clickText(egs+' button',zh['ratings.view']);assert.equal(links.at(-1),'https://koko.kyara.top/game.php?game=456');
  await clickText(egs+' button',zh['egs.clear']);await clickText(egs+' [role=alertdialog] button',zh['egs.confirmClear']);
  await waitFor(`document.querySelector('${egs}')?.textContent.includes(${JSON.stringify(zh['egs.empty'])})`);assert.equal(db.getManualEgsRating('a'),null);
  await clickText(egs+' button',zh['egs.add']);await fill('entry','789');await clickText('[data-egs-form] button',zh['egs.save']);
  await waitFor("!document.querySelector('[data-egs-form]')");assert.equal(db.getManualEgsRating('a').score,null);assert.equal(db.getManualEgsRating('a').voteCount,null);
  assert.equal(egsRequests.length,0);

  // Visibility is independent per source, survives reopening, and keeps saved data.
  const toggle=async(provider)=>{
    await run("document.querySelector('[data-rating-visibility]').open=true");
    await waitFor(`!document.querySelector('[data-rating-toggle="${provider}"]').disabled`);
    await run(`document.querySelector('[data-rating-toggle="${provider}"]').click()`);
    await waitFor(`!document.querySelector('[data-rating-toggle="${provider}"]').disabled`);
  };
  for(const provider of ['vndb','bangumi','erogamescape']){
    await toggle(provider);await waitFor(`!document.querySelector('[data-rating-provider="${provider}"]')`);
  }
  assert.equal(await run("document.querySelectorAll('[data-rating-provider]').length"),0);
  assert.ok(await run("!!document.querySelector('[data-rating-visibility]')"));
  assert.equal(db.getManualEgsRating('a').externalId,'789');assert.equal(db.getGameById('a').bangumiId,20);
  await win.loadFile(path.join(root,'out/renderer/index.html'));await card('Ever17');
  await waitFor("!!document.querySelector('[data-rating-toggle]') && !document.querySelector('[data-rating-toggle]').disabled");
  assert.equal(await run("document.querySelectorAll('[data-rating-provider]').length"),0);
  assert.deepEqual(await run("window.api.getSettings().then(s=>s.hiddenRatingProviders)"),['vndb','bangumi','erogamescape']);
  await toggle('erogamescape');await waitFor(`document.querySelector('${egs}')?.textContent.includes('#789')`);
  assert.equal(await run("document.querySelectorAll('[data-rating-provider]').length"),1);
  for(const provider of ['vndb','bangumi']){await toggle(provider);await waitFor(`!!document.querySelector('[data-rating-provider="${provider}"]')`);}
  assert.deepEqual(await run("window.api.getSettings().then(s=>s.hiddenRatingProviders)"),[]);
  for(const theme of ['soft-pink','anime','dark','darker','pink']){
    await run(`document.body.dataset.theme=${JSON.stringify(theme)}; document.querySelector('.detail-panel').scrollTop=260`);
    await pause(250);
    fs.writeFileSync(path.join(testDir,theme+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  // Switch languages through the real settings UI.
  await close();
  await clickText('.app-sidebar button',zh['sidebar.settings']);
  await waitFor("!!document.querySelector('.modal-panel')");
  await run("const language=Array.from(document.querySelectorAll('.modal-panel select')).find(s=>s.value==='zh');language.value='en';language.dispatchEvent(new Event('change',{bubbles:true}))");
  await clickText('.modal-panel button',zh['settings.save']);
  await waitFor("!document.querySelector('.modal-panel')");
  await card('Ever17');
  await waitFor(`document.querySelector('${bgm}')?.textContent.includes('9.1 / 10')`);
  assert.ok(await run(`document.querySelector('${bgm}').textContent.includes(${JSON.stringify(en['ratings.view'])})`));
  // A late response from the previous game must not replace the current game's score.
  let release; slowSubject=new Promise(resolve=>release=resolve);
  await clickText(bgm+' button',en['ratings.refresh']);
  await close(); await card('Another Game');
  await waitFor(`document.querySelector('${bgm}')?.textContent.includes('7.3 / 10')`);
  release(); slowSubject=null; await pause(200);
  assert.ok(await run(`document.querySelector('${bgm}').textContent.includes('7.3 / 10')`));
  // Exercise the existing VNDB cover import flow all the way through IPC and database update.
  await close(); await card('Ever17');
  await waitFor("!!document.querySelector('[data-rating-provider=vndb]')");
  await clickText('[data-rating-provider=vndb] button',en['ratings.rematch']);
  await clickText('.detail-panel button',en['cover.vndbSearch']);
  await waitFor("Array.from(document.querySelectorAll('.detail-panel button')).some(b=>b.textContent.includes('New Game'))");
  await run("Array.from(document.querySelectorAll('.detail-panel button')).find(b=>b.textContent.includes('New Game')).click()");
  await waitFor(`document.querySelector('${bgm}')?.textContent.includes('8.8 / 10')`);
  assert.equal(db.getManualEgsRating('a'),null);
  assert.equal(db.getGameById('a').vndbId,'v18'); assert.equal(db.getGameById('a').bangumiId,40);
  // Reload to verify the stored manual/automatic identity survives app reopening.
  await win.loadFile(path.join(root,'out/renderer/index.html'));
  await waitFor("document.querySelectorAll('.game-card').length===2");
  await card('New Game'); await waitFor(`document.querySelector('${bgm}')?.textContent.includes('8.8 / 10')`);

  // Manual input stays usable when automatic lookups are disabled.
  await close();db.setSetting('vndbEnabled','false');await win.loadFile(path.join(root,'out/renderer/index.html'));await card('New Game');
  await waitFor(`document.querySelector('${bgm}')?.textContent.includes(${JSON.stringify(en['ratings.disabled'])})`);
  await clickText(egs+' button',en['egs.add']);await fill('entry','321');await fill('score','95');await clickText('[data-egs-form] button',en['egs.save']);
  await waitFor(`!document.querySelector('[data-egs-form]') && document.querySelector('${egs}').textContent.includes('95 / 100')`);
  assert.equal(db.getManualEgsRating('a').score,95);
  const coverChecks=[];
  for(const [shape,w,h] of [['landscape',2400,1200],['portrait',1200,2400],['square',1600,1600],['icon',64,64]]){
    const file=path.join(testDir,shape+'.png');
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#abc1dc"/><rect x="2" y="2" width="${w-4}" height="${h-4}" fill="none" stroke="#26324c" stroke-width="4"/><circle cx="${w/2}" cy="${h/2}" r="${Math.min(w,h)/4}" fill="#f59bb8"/><rect width="${w/6}" height="${h/6}" fill="#e53e3e"/><rect x="${w*5/6}" width="${w/6}" height="${h/6}" fill="#2f855a"/><rect y="${h*5/6}" width="${w/6}" height="${h/6}" fill="#2b6cb0"/><rect x="${w*5/6}" y="${h*5/6}" width="${w/6}" height="${h/6}" fill="#d69e2e"/></svg>`;
    await require('sharp')(Buffer.from(svg)).png().toFile(file);db.updateGame('a',{coverPath:file});
    await win.loadFile(path.join(root,'out/renderer/index.html'));await card('New Game');
    await waitFor(`document.querySelector('.detail-cover-image')?.naturalWidth===${w}`);
    for(const [width,height] of [[900,600],[1280,800],[1920,1080]]){
      win.setSize(width,height);await pause(600);
      const measure=()=>run(`(()=>{const i=document.querySelector('.detail-cover-image'),r=i.getBoundingClientRect(),p=document.querySelector('.detail-panel').getBoundingClientRect(),preview=document.querySelector('.detail-cover-preview');const scale=Math.min(1,r.width/i.naturalWidth,r.height/i.naturalHeight);return {x:r.x,y:r.y,w:r.width,h:r.height,panelX:p.x,viewH:innerHeight,fit:getComputedStyle(i).objectFit,scale,previewFit:getComputedStyle(preview).objectFit,previewW:preview.width,previewH:preview.height};})()`);
      const before=await measure();assert.equal(before.fit,'scale-down');assert.equal(before.previewFit,'scale-down');assert.ok(before.x>=16&&before.y>=56);assert.ok(before.x+before.w<=before.panelX-15);assert.ok(before.y+before.h<=before.viewH-15);assert.ok(before.scale>0&&before.scale<=1);assert.ok(before.previewW<=w&&before.previewH<=h);if(shape==='icon')assert.equal(before.scale,1);
      await run("document.querySelector('.detail-panel').scrollTop=700");assert.deepEqual(await measure(),before);
      coverChecks.push({shape,width,height,...before});
      fs.writeFileSync(path.join(testDir,`cover-${shape}-${width}.png`),(await win.webContents.capturePage()).toPNG());
    }
    await run("document.elementFromPoint(100,100).click()");await waitFor("!document.querySelector('.detail-panel')");
  }
  await card('New Game');await waitFor("!!document.querySelector('.detail-cover-image')");
  await run("document.querySelector('.detail-cover-image').dispatchEvent(new Event('error'))");await waitFor("!document.querySelector('.detail-cover-image') && !document.querySelector('.detail-cover-preview')");
  await close();assert.ok(await run("Array.from(document.querySelectorAll('.game-card img')).every(i=>!i.className.includes('scale-') && getComputedStyle(i).transform==='none')"));
  assert.equal(egsRequests.length,0);
  fs.writeFileSync(path.join(testDir,'cover-report.json'),JSON.stringify(coverChecks,null,2));
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(testDir,'report.json'),JSON.stringify({passed:true,links,themes:5,coverImport:true,rapidSwitch:true,errors,manualEgs:true,egsRequests,coverChecks:coverChecks.length},null,2));
  console.log('PASS Electron UI: candidate selection, persistence, website buttons, error/stale/unrated states, 5 themes, English, rapid switching, VNDB cover import, manual EGS CRUD/offline, independent persistent rating visibility and 12 cover layouts.');
  console.log('Screenshots: '+testDir);
  app.exit(0);
}).catch(error=>{console.error(error);fs.writeFileSync(path.join(testDir,'error.txt'),error.stack);app.exit(1)});
