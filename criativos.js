// ============================================================
// M13 — Gerador de Criativos de Anúncio (HTML5 Canvas)
// Monta a arte (foto do produto + logo + preço + chamada) em
// Feed 1080x1080 e Story 1080x1920. Exporta PNG. 100% no navegador.
// ============================================================
(function () {
  const RED = '#CC0000', DARK = '#1a1a1a', YELLOW = '#FFC400', WHITE = '#ffffff';
  let cv, ctx, prodImg = null, curProd = null;

  const state = {
    formato: 'feed',      // feed | story
    tema: 'vermelho',     // vermelho | escuro | amarelo
    badge: 'PROMOÇÃO',
    chamada: '',
    precoIdx: 0
  };

  function dims() { return state.formato === 'story' ? [1080, 1920] : [1080, 1080]; }

  function themeColors() {
    if (state.tema === 'escuro')  return { bg1: '#000000', bg2: '#2a2a2a', accent: YELLOW, text: WHITE };
    if (state.tema === 'amarelo') return { bg1: '#FFB300', bg2: '#FF8F00', accent: '#1a1a1a', text: '#1a1a1a' };
    return { bg1: '#E10000', bg2: '#8B0000', accent: YELLOW, text: WHITE };
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    if (!cv) return;
    const [W, H] = dims();
    cv.width = W; cv.height = H;
    const c = themeColors();

    // fundo gradiente
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, c.bg1); g.addColorStop(1, c.bg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // logo topo
    ctx.textAlign = 'center';
    ctx.fillStyle = c.text;
    ctx.font = '800 76px Arial';
    ctx.fillText('TopFood', W / 2, 130);
    ctx.font = '600 26px Arial';
    ctx.fillStyle = c.accent;
    ctx.fillText('EMBALAGENS QUE VALORIZAM SEU ALIMENTO', W / 2, 172);

    // área da foto (quadro branco arredondado)
    const photoY = 230;
    const photoH = state.formato === 'story' ? 900 : 560;
    const pad = 70;
    ctx.fillStyle = WHITE;
    roundRect(pad, photoY, W - pad * 2, photoH, 36); ctx.fill();

    if (prodImg) {
      // desenha a foto "contain" dentro do quadro
      const bx = pad + 24, by = photoY + 24, bw = W - pad * 2 - 48, bh = photoH - 48;
      const r = Math.min(bw / prodImg.width, bh / prodImg.height);
      const iw = prodImg.width * r, ih = prodImg.height * r;
      ctx.drawImage(prodImg, bx + (bw - iw) / 2, by + (bh - ih) / 2, iw, ih);
    } else {
      ctx.fillStyle = '#bbb'; ctx.font = '600 32px Arial';
      ctx.fillText('Selecione um produto', W / 2, photoY + photoH / 2);
    }

    // selo de badge (canto superior do quadro)
    if (state.badge) {
      ctx.save();
      ctx.translate(pad + 110, photoY + 20);
      ctx.rotate(-0.12);
      ctx.fillStyle = RED;
      roundRect(-100, -34, 200, 68, 12); ctx.fill();
      ctx.fillStyle = WHITE; ctx.font = '800 30px Arial'; ctx.textAlign = 'center';
      ctx.fillText(state.badge.toUpperCase(), 0, 10);
      ctx.restore();
    }

    // chamada (título)
    const txtY = photoY + photoH + 90;
    ctx.fillStyle = c.text; ctx.textAlign = 'center';
    ctx.font = '800 64px Arial';
    wrapText(state.chamada || (curProd ? curProd.name : 'Sua embalagem aqui'), W / 2, txtY, W - 140, 70);

    // selo de preço (círculo amarelo)
    if (curProd) {
      const v = curProd.variants[state.precoIdx] || curProd.variants[0];
      const cx = state.formato === 'story' ? W - 230 : W - 200;
      const cy = state.formato === 'story' ? H - 430 : H - 350;
      ctx.beginPath(); ctx.arc(cx, cy, 130, 0, Math.PI * 2);
      ctx.fillStyle = YELLOW; ctx.fill();
      ctx.fillStyle = DARK; ctx.textAlign = 'center';
      ctx.font = '600 24px Arial'; ctx.fillText('A partir de', cx, cy - 42);
      ctx.font = '800 58px Arial'; ctx.fillText('R$ ' + Math.round(v.price), cx, cy + 14);
      ctx.font = '700 26px Arial'; ctx.fillText(v.units + ' unidades', cx, cy + 56);
    }

    // rodapé
    ctx.fillStyle = c.text; ctx.textAlign = 'center';
    ctx.font = '700 30px Arial';
    ctx.fillText('topfoodembalagens.com.br', W / 2, H - 90);
    ctx.font = '600 28px Arial';
    ctx.fillText('📱 (11) 98885-6367', W / 2, H - 48);
  }

  function wrapText(text, x, y, maxW, lh) {
    const words = String(text).split(' ');
    let line = '', yy = y;
    for (const w of words) {
      const test = line + w + ' ';
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line.trim(), x, yy); line = w + ' '; yy += lh; }
      else line = test;
    }
    ctx.fillText(line.trim(), x, yy);
  }

  function loadProdImage(src) {
    prodImg = null; draw();
    const img = new Image();
    img.onload = function () { prodImg = img; draw(); };
    img.onerror = function () { prodImg = null; draw(); };
    img.src = src; // same-origin → toDataURL funciona sem taint
  }

  // ── API pública chamada pelo admin ──────────────────────────
  window.Criativos = {
    init: function () {
      cv = document.getElementById('cr-canvas');
      if (!cv) return;
      ctx = cv.getContext('2d');
      this.fillProdSelect();
      draw();
    },
    fillProdSelect: function () {
      const sel = document.getElementById('cr-produto');
      if (!sel || !window.ALL_PRODUCTS) return;
      sel.innerHTML = (window.ALL_PRODUCTS || []).map(function (p, i) {
        return '<option value="' + i + '">' + p.name + '</option>';
      }).join('');
      if (window.ALL_PRODUCTS.length) this.selectProd(0);
    },
    selectProd: function (i) {
      curProd = (window.ALL_PRODUCTS || [])[i];
      if (!curProd) return;
      state.precoIdx = 0;
      // preenche o select de pacote
      const ps = document.getElementById('cr-pack');
      if (ps) ps.innerHTML = curProd.variants.map(function (v, j) {
        return '<option value="' + j + '">' + v.units + ' un — R$ ' + v.price + '</option>';
      }).join('');
      // badge sugerido a partir do produto
      if (curProd.badge) { state.badge = curProd.badge; const b = document.getElementById('cr-badge'); if (b) b.value = curProd.badge; }
      const img = curProd.image.indexOf('http') === 0 ? curProd.image : ('/' + curProd.image.replace(/^\//, ''));
      loadProdImage(img);
    },
    set: function (k, v) { state[k] = v; draw(); },
    baixar: function () {
      const a = document.createElement('a');
      a.download = 'anuncio-' + (curProd ? curProd.id : 'topfood') + '-' + state.formato + '.png';
      a.href = cv.toDataURL('image/png');
      a.click();
    }
  };
})();
