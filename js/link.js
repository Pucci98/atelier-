// ALMYGO — écran lié : l'iPhone crée, un autre écran (ordi, TV, tablette) affiche en direct
const PREFIX = 'atelier-ecran-';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const code = () => Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

function waitPeer() {
  return new Promise((res, rej) => {
    if (window.Peer) return res(window.Peer);
    let n = 0; const t = setInterval(() => { if (window.Peer) { clearInterval(t); res(window.Peer); } else if (++n > 50) { clearInterval(t); rej(new Error('Module de liaison indisponible')); } }, 100);
  });
}

// Côté écran d'affichage : attend une connexion et applique ce qu'il reçoit
export async function hostDisplay(onCode, onData, onStatus) {
  const Peer = await waitPeer();
  let attempt = 0;
  const open = () => new Promise((res, rej) => {
    const c = code(); const peer = new Peer(PREFIX + c, { debug: 0 });
    peer.on('open', () => res({ peer, c }));
    peer.on('error', e => { peer.destroy(); rej(e); });
  });
  let p;
  while (!p && attempt++ < 4) { try { p = await open(); } catch (e) { if (attempt >= 4) throw e; } }
  onCode(p.c);
  let current = null;
  p.peer.on('connection', conn => {
    if (current?.open) { conn.on('open', () => conn.close()); return; } // un seul appareil peut piloter l'écran
    current = conn;
    conn.on('open', () => { onStatus('connected'); try { conn.send({ t: 'need' }); } catch { } });
    conn.on('data', d => { if (d?.t !== 'ping') onData(d); });
    conn.on('close', () => onStatus('waiting'));
  });
  hostDisplay.reply = d => { try { if (current?.open) current.send(d); } catch { } };
  p.peer.on('disconnected', () => { try { p.peer.reconnect(); } catch { } });
  return p.peer;
}

// Côté création : se connecte à l'écran dont on a tapé le code
export async function connectTo(c, onStatus, onData) {
  const Peer = await waitPeer();
  const peer = new Peer(undefined, { debug: 0 });
  await new Promise((res, rej) => { peer.on('open', res); peer.on('error', rej); });
  const conn = peer.connect(PREFIX + c.toUpperCase().trim(), { reliable: true });
  await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('Écran introuvable. Vérifie le code.')), 9000);
    conn.on('open', () => { clearTimeout(to); res(); });
    peer.on('error', e => { clearTimeout(to); rej(e.type === 'peer-unavailable' ? new Error('Écran introuvable. Vérifie le code.') : e); });
  });
  conn.on('close', () => onStatus('closed'));
  conn.on('data', d => onData?.(d));
  return { peer, conn, send: d => { if (conn.open) conn.send(d); } };
}
