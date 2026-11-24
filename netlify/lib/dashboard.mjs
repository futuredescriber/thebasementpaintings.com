const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const style = `:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#111715;color:#e0e9e4}body{max-width:1200px;margin:0 auto;padding:24px}h1{font-size:1.5rem}h2{font-size:1.15rem;margin-top:32px}p{color:#aebeb5;line-height:1.5}button,input,select,a{font:inherit}button,input,select{background:#202a25;color:inherit;border:1px solid #596b60;border-radius:4px;padding:10px}button,a{cursor:pointer}a{color:#b8e1cb}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid #b8e1cb;outline-offset:3px}header,form,.filters{display:flex;gap:14px;align-items:end;flex-wrap:wrap}header{justify-content:space-between}label{display:flex;gap:5px;flex-direction:column;font-size:.9rem}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:24px}.metric{background:#1b2520;padding:16px;border:1px solid #33473b}.metric strong{display:block;font-size:1.5rem;margin-top:6px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #33473b;white-space:nowrap}th{color:#b8cbbf}td:first-child{white-space:normal;min-width:120px}#status{min-height:1.5em}.error{color:#ffb9b9}.login{max-width:420px}.login form{display:grid}.note{font-size:.85rem}@media(max-width:500px){body{padding:16px}.summary{grid-template-columns:repeat(2,1fr)}}`;
const shell = (title, content, script = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} · The Basement Paintings</title><style>${style}</style></head><body>${content}${script}</body></html>`;

export function loginPage(error = '') {
  return shell('Private listening stats', `<main class="login"><h1>Private listening stats</h1><p>Sign in to view anonymous listening totals.</p>${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}<form method="post" action="/stats/login"><label>Password<input type="password" name="password" autocomplete="current-password" required autofocus maxlength="1024"></label><button type="submit">Sign in</button></form></main>`);
}

export function dashboardPage(nonce) {
  return shell('Listening stats', `<header><h1>Listening stats</h1><form action="/stats/logout" method="post"><button type="submit">Sign out</button></form></header><main><p>A qualified play means at least 30 seconds of listening. Attempts include shorter starts. Completion requires an ended track and at least 90% of its duration listened.</p><form id="filters"><label>From (UTC)<input id="from" type="date" required></label><label>To (UTC)<input id="to" type="date" required></label><button type="submit">Load totals</button></form><p id="status" role="status" aria-live="polite"></p><div id="summary" class="summary"></div><div class="filters"><label>CSV table<select id="csv-view"><option value="tracks">Tracks</option><option value="albums">Albums</option><option value="days">Days</option><option value="sources">Sources</option><option value="dailyAlbums">Daily albums</option></select></label><a id="export" href="/stats/export.csv">Download CSV</a></div><p class="note">Dates use UTC, up to 31 days per report. Counts belong to the play’s start day; listening time is split across the days it occurred. Anonymous browser reports can be incomplete or blocked.</p><div id="tables"></div></main>`, `<script nonce="${escape(nonce)}">${String.raw`
(() => {
  const $ = id => document.getElementById(id);
  const columns = [['qualifiedPlays','Qualified plays'],['listeningMs','Listening time'],['completions','Completions'],['skips','Skips'],['plays','Attempts'],['sessions','Sessions']];
  function duration(ms) { const s = Math.floor((ms || 0) / 1000); return Math.floor(s / 3600) + 'h ' + Math.floor(s % 3600 / 60) + 'm ' + s % 60 + 's'; }
  const value = (key, row) => key === 'listeningMs' ? duration(row[key]) : String(row[key] ?? 0);
  function cell(tag, text) { const node = document.createElement(tag); node.textContent = text; return node; }
  function params() { return new URLSearchParams({from:$('from').value,to:$('to').value}); }
  function exportLink() { const query = params(); query.set('view', $('csv-view').value); $('export').href = '/stats/export.csv?' + query; }
  const utc = date => date.toISOString().slice(0,10), today = new Date();
  $('to').value = utc(today); $('from').value = utc(new Date(today.getTime() - 6 * 86400000));
  let requestNumber = 0, controller;
  async function load(event) {
    if (event) event.preventDefault();
    const from = $('from').value, to = $('to').value;
    const range = Date.parse(to) - Date.parse(from);
    if (!from || !to || !Number.isFinite(range) || range < 0 || range > 30 * 86400000) { $('status').textContent = 'Choose a date range of 1–31 days.'; return; }
    if (controller) controller.abort(); controller = new AbortController(); const request = ++requestNumber;
    $('status').textContent = 'Loading…'; exportLink();
    try {
      const response = await fetch('/stats/data?' + params(), {credentials:'same-origin',cache:'no-store',signal:controller.signal});
      if (response.status === 401) { location.assign('/stats'); return; }
      if (!response.ok) throw new Error('Could not load listening totals. Try again.');
      const report = await response.json(); if (request !== requestNumber) return;
      $('summary').replaceChildren();
      columns.forEach(([key,title]) => { const metric = cell('div', title); metric.className = 'metric'; metric.append(cell('strong',value(key,report.overview))); $('summary').append(metric); });
      $('tables').replaceChildren();
      [['tracks','Tracks',[['name','Track'],['album','Album']]],['albums','Albums',[['album','Album']]],['days','Days',[['day','Day (UTC)']]],['sources','Sources',[['source','Source']]],['dailyAlbums','Daily albums',[['day','Day (UTC)'],['album','Album']]]].forEach(([key,title,identity]) => {
        const section = document.createElement('section'); section.append(cell('h2',title));
        const wrap = document.createElement('div'); wrap.className = 'scroll'; wrap.tabIndex = 0; wrap.setAttribute('role','region'); wrap.setAttribute('aria-label',title + ' table');
        const table = document.createElement('table'), head = document.createElement('thead'), header = document.createElement('tr'), body = document.createElement('tbody');
        [...identity,...columns].forEach(([,label]) => { const th = cell('th',label); th.scope = 'col'; header.append(th); }); head.append(header);
        (report[key] || []).forEach(row => { const tr = document.createElement('tr'); identity.forEach(([field]) => tr.append(cell('td',String(row[field] ?? '')))); columns.forEach(([field]) => tr.append(cell('td',value(field,row)))); body.append(tr); });
        table.append(head,body); wrap.append(table); section.append(wrap); $('tables').append(section);
      });
      $('status').textContent = 'Showing ' + report.from + ' through ' + report.to + ' (UTC).';
    } catch (error) { if (error.name !== 'AbortError' && request === requestNumber) $('status').textContent = error.message; }
  }
  $('filters').addEventListener('submit',load); $('csv-view').addEventListener('change',exportLink);
  $('from').addEventListener('change',exportLink); $('to').addEventListener('change',exportLink);
  exportLink(); load();
})();
`}</script>`);
}
