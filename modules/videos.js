// ============================================================
// Gerador de vídeo de produto (fotos → MP4) — 100% no servidor
// Pega as fotos do próprio cadastro, aplica movimento suave
// (Ken Burns), transições e um encerramento com a marca.
// Formatos: quadrado 1080x1080 (Shopee/feed) e vertical 1080x1920
// (Reels/TikTok/Stories). Sem serviço externo, sem créditos.
// ============================================================
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { readData } = require('../db');

let FFMPEG = 'ffmpeg';
try { FFMPEG = require('ffmpeg-static'); } catch (_) {}

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'uploads', 'videos');

// Artes fixas de marca (geradas em assets/video) — usadas como overlay porque
// o ffmpeg embutido do ffmpeg-static vem SEM o filtro de texto (drawtext).
const ENDCARD = f => path.join(ROOT, 'assets', 'video', `endcard-${f}.png`);
const TARJA   = path.join(ROOT, 'assets', 'video', 'tarja-site.png');

// jobs em memória: chave produto|formato -> { status, error, file, ts }
const jobs = {};
const jobKey = (id, fmt) => id + '|' + fmt;

function fotosLocais(product) {
  const lista = (product.images && product.images.length ? product.images : (product.image ? [product.image] : []));
  return lista
    .map(im => path.join(ROOT, String(im).replace(/^https?:\/\/[^/]+\//i, '').replace(/^\//, '')))
    .filter(p => { try { return fs.existsSync(p); } catch { return false; } })
    .slice(0, 5);
}

function buildArgs(product, formato, outFile) {
  const [W, H] = formato === 'vertical' ? [1080, 1920] : [1080, 1080];
  const fotos = fotosLocais(product);
  if (!fotos.length) throw new Error('Produto sem fotos no servidor');

  const DUR = 3, FADE = 0.5, FPS = 25;
  const temEndcard = fs.existsSync(ENDCARD(formato));
  const temTarja = fs.existsSync(TARJA);

  const args = [];
  fotos.forEach(f => { args.push('-loop', '1', '-t', String(DUR), '-i', f); });
  const idxEnd = fotos.length;
  if (temEndcard) args.push('-loop', '1', '-t', '3', '-i', ENDCARD(formato));
  const idxTarja = idxEnd + (temEndcard ? 1 : 0);
  if (temTarja) args.push('-i', TARJA);

  const fc = [];
  fotos.forEach((_, i) => {
    fc.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
            `zoompan=z='min(zoom+0.0016,1.12)':d=1:s=${W}x${H}:fps=${FPS},setsar=1[v${i}]`);
  });

  // encadeia as fotos com crossfade
  let atual = 'v0';
  for (let i = 1; i < fotos.length; i++) {
    const off = (i * (DUR - FADE)).toFixed(2);
    fc.push(`[${atual}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${off}[x${i}]`);
    atual = 'x' + i;
  }

  // tarja do site na parte de baixo, durante as fotos
  if (temTarja) {
    fc.push(`[${atual}][${idxTarja}:v]overlay=x=(W-w)/2:y=H-h-${Math.round(H*0.04)}[comtarja]`);
    atual = 'comtarja';
  }

  // encerramento com a arte da marca
  if (temEndcard) {
    fc.push(`[${idxEnd}:v]scale=${W}:${H},setsar=1,fps=${FPS}[endcard]`);
    const offFinal = (fotos.length * (DUR - FADE)).toFixed(2);
    fc.push(`[${atual}][endcard]xfade=transition=fade:duration=${FADE}:offset=${offFinal}[fim]`);
    atual = 'fim';
  }

  args.push('-filter_complex', fc.join(';'), '-map', `[${atual}]`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart', '-an', '-y', outFile);
  return args;
}

function gerar(product, formato) {
  const key = jobKey(product.id, formato);
  if (jobs[key] && jobs[key].status === 'gerando') return jobs[key];
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${product.id}-${formato}.mp4`);
  const job = { status: 'gerando', file: outFile, error: null, ts: Date.now() };
  jobs[key] = job;
  try {
    const args = buildArgs(product, formato, outFile);
    const p = spawn(FFMPEG, args);
    let stderr = '';
    p.stderr.on('data', d => { stderr += d; if (stderr.length > 8000) stderr = stderr.slice(-8000); });
    p.on('error', e => { job.status = 'erro'; job.error = e.message; });
    p.on('close', code => {
      if (code === 0 && fs.existsSync(outFile) && fs.statSync(outFile).size > 10000) {
        job.status = 'pronto';
        console.log(`🎬 [video] ${product.id} ${formato} pronto (${Math.round(fs.statSync(outFile).size/1024)} KB)`);
      } else {
        job.status = 'erro';
        job.error = 'ffmpeg saiu com código ' + code + ': ' + stderr.slice(-300);
        console.error('[video] erro:', job.error);
      }
    });
  } catch (e) { job.status = 'erro'; job.error = e.message; }
  return job;
}

function registerVideoRoutes(app, requireAuth) {
  // Dispara a geração (assíncrona — o painel consulta o status)
  app.post('/api/eco/video/:productId', requireAuth, (req, res) => {
    const formato = req.body?.formato === 'vertical' ? 'vertical' : 'quadrado';
    const product = (readData('products.json') || []).find(p => p.id === req.params.productId);
    if (!product) return res.status(404).json({ ok: false, error: 'Produto não encontrado' });
    if (!fotosLocais(product).length) return res.status(400).json({ ok: false, error: 'Este produto não tem fotos salvas no servidor' });
    const job = gerar(product, formato);
    res.json({ ok: true, status: job.status });
  });

  app.get('/api/eco/video/:productId/status', requireAuth, (req, res) => {
    const formato = req.query.formato === 'vertical' ? 'vertical' : 'quadrado';
    const job = jobs[jobKey(req.params.productId, formato)];
    if (!job) return res.json({ ok: true, status: 'nenhum' });
    res.json({ ok: true, status: job.status, error: job.error });
  });

  app.get('/api/eco/video/:productId/download', requireAuth, (req, res) => {
    const formato = req.query.formato === 'vertical' ? 'vertical' : 'quadrado';
    const job = jobs[jobKey(req.params.productId, formato)];
    const file = job?.file || path.join(OUT_DIR, `${req.params.productId}-${formato}.mp4`);
    if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'Vídeo ainda não gerado' });
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="video-${req.params.productId}-${formato}.mp4"`);
    fs.createReadStream(file).pipe(res);
  });

  console.log('🎬 Gerador de vídeo de produto registrado (ffmpeg: ' + (FFMPEG !== 'ffmpeg' ? 'embutido' : 'sistema') + ')');
}

module.exports = { registerVideoRoutes };
