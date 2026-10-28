function parseCsv(text) {
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++) {const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}
  if(quoted)throw Error('Invalid CSV');if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
function amount(value) { const text=String(value).trim(); if(!/^\$?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(text)) return NaN; return Number(text.replace(/[$,]/g, '')); }
function leaderboardRows(csv) {
 const [headers,...rows]=parseCsv(csv.replace(/^\uFEFF/,''));
 if(!headers)throw Error('Missing CSV headers');
 const field=name=>headers.findIndex(h=>h.trim().toLowerCase()===name);
 const rank=field('rank'),user=field('user_name'),wagered=field('total_wagered_amount (usd)'),weighted=field('total_weighted_amount (usd)');
 if([rank,user,wagered,weighted].some(i=>i<0))throw Error('Unexpected CSV format');
 return rows.map(row=>{const name=Array.from(row[user]||'');const values=[Number(row[rank]),amount(row[wagered]),amount(row[weighted])];if(values.some(v=>!Number.isFinite(v)||v<0)||values[0]<1)throw Error('Invalid leaderboard row');return {rank:values[0],name:(name[0]||'')+'***'+(name.length>2?name.at(-1):''),wagered:values[1],weighted:values[2]};}).sort((a,b)=>a.rank-b.rank);
}
function registerLeaderboard(app) {
 const cache=new Map(),pending=new Map();
 app.get('/api/stake/leaderboard',async(req,res)=>{
  const period='allTime';
  res.set('Cache-Control','no-store');
  const token=process.env.STAKE_AFFILIATE_TOKEN;
  if(!token)return res.status(503).json({error:'The leaderboard is not configured yet.'});
  try{
   let entry=cache.get(period);
   if(!entry||Date.now()-entry.time>300000){
    if(!pending.has(period))pending.set(period,(async()=>{
      const url=new URL('https://api.stake.com/affiliate/leaderboard');url.search=new URLSearchParams({timePeriod:period,isStakeExclusive:'false',limit:'50'});
      const response=await fetch(url,{headers:{'x-access-token':token,Accept:'text/csv'},signal:AbortSignal.timeout(15000),redirect:'error'});
      if(!response.ok)throw Error('Stake HTTP '+response.status);
      const text=await response.text();if(text.length>2000000)throw Error('Unexpected response size');
      const next={time:Date.now(),data:{period,rows:leaderboardRows(text),updatedAt:new Date().toISOString()}};cache.set(period,next);return next;
    })().finally(()=>pending.delete(period)));
    entry=await pending.get(period);
   }
   res.json(entry.data);
  }catch(error){console.error('Stake leaderboard:',error.message.startsWith('Stake HTTP')?error.message:'Fetch or data error');res.status(502).json({error:'Stake leaderboard is temporarily unavailable. Please try again shortly.'});}
 });
}
module.exports={parseCsv,leaderboardRows,registerLeaderboard};
