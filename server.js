const fs = require('fs');
for (const line of (fs.existsSync(require('path').join(__dirname,'.env')) ? fs.readFileSync(require('path').join(__dirname,'.env'),'utf8') : '').split(/\r?\n/)) { const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if(match && process.env[match[1]] === undefined) process.env[match[1]]=match[2].trim(); }
const express = require('express');
const path = require('path');
const app = express();
app.enable('strict routing');
app.disable('x-powered-by');
require('./stake-leaderboard.cjs').registerLeaderboard(app);
require('./giveaway-system.cjs').registerGiveaways(app,express);
app.get(['/', '/index.html'], (req,res) => res.sendFile(path.join(__dirname,'index.html')));
app.get(['/stake','/stake.html'], (req,res) => res.sendFile(path.join(__dirname,'stake.html')));
app.get(['/stake/','/leaderboard.html','/leaderboard'], (req,res) => res.redirect(302,'/stake'));
app.get(['/giveaway.html','/giveaway'], (req,res) => res.sendFile(path.join(__dirname,'giveaway.html')));
app.get(['/giveaway-admin','/giveaway-admin.html'], (req,res) => {res.set('Cache-Control','no-store');res.set('X-Robots-Tag','noindex');res.sendFile(path.join(__dirname,'giveaway-admin.html'));});
app.get('/giveaway.js', (req,res) => res.sendFile(path.join(__dirname,'giveaway.js')));
app.get('/giveaway-admin.js', (req,res) => res.sendFile(path.join(__dirname,'giveaway-admin.js')));
app.get('/leaderboard.js', (req,res) => res.sendFile(path.join(__dirname,'leaderboard.js')));
app.get('/site.js', (req,res) => res.sendFile(path.join(__dirname,'site.js')));
app.get('/styles.css', (req,res) => res.sendFile(path.join(__dirname,'styles.css')));
for (const dir of ['assets','favicon','uploads']) app.use('/'+dir,express.static(path.join(__dirname,dir),{dotfiles:'deny',index:false}));
// Casino pages reuse the current homepage cards, keeping offers in one place.
const casinoSlugs = ['gambid','moon','stakeprix','lollyspins','shakebet','pubs','flush','ivibet','duelbits','thunderpick','duel','ritzo'];
for (const slug of casinoSlugs) {
  app.get(['/'+slug+'/', '/'+slug+'.html'], (req,res) => res.redirect(302,'/'+slug));
  app.get('/'+slug, (req,res,next) => {
    const home = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
    const cards = [...home.matchAll(/<div class="floating-slot"[^>]*><article\b[^>]*data-provider="([^"]+)"[\s\S]*?<\/article><\/div>/g)];
    const card = cards.find(match => match[1] === slug);
    if (!card) return next();
    const name = card[0].match(/data-name="([^"]+)"/)[1];
    const main = '<main class="casino-landing"><div class="page-title"><div><a class="casino-back" href="/">← Casino bonuses</a><h1>'+name+'</h1></div></div><div class="offers casino-single">'+card[0]+'</div></main>';
    res.type('html').send(home.replace(/<title>[\s\S]*?<\/title>/,'<title>'+name+' — AntonGambles</title>').replace(/<main[\s\S]*?<\/main>/,main).replace(' aria-current="page"',''));
  });
}
app.use((req,res) => res.status(404).send('Sidan finns inte.'));
app.listen(process.env.PORT || 8000);
