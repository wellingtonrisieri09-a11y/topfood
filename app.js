/* TopFood — JavaScript principal (extraído de index.html) */
  const WHATSAPP_NUMBER = '5511988856367';

  // PRICES é populado dinamicamente via API — fallback embutido caso offline
  let PRICES = {
    pastel:  { values:[45,85,195],  units:[50,100,250], weight_per_unit:12 },
    churros: { values:[50,95,220],  units:[50,100,250], weight_per_unit:18 },
    burger:  { values:[42,80,185],  units:[50,100,250], weight_per_unit:25 },
    fritas:  { values:[38,72,168],  units:[50,100,250], weight_per_unit:10 },
  };

  // ─── Cupom aplicado ──────────────────────────
  let appliedCoupon = null; // { code, discount_type, discount_value }

  // ─── Todos os produtos (para busca e relacionados) ─────
  let ALL_PRODUCTS = [];

  // ─── Cliente logado (em memória, espelha localStorage 'tf-customer') ─────
  let currentCustomer = null;

  const FRETE_TABLE = {
    'SP':[{nome:'📦 PAC',dias:'3–5 dias úteis',preco:18.90},{nome:'✈️ SEDEX',dias:'1–2 dias úteis',preco:32.90}],
    'RJ':[{nome:'📦 PAC',dias:'4–6 dias úteis',preco:25.90},{nome:'✈️ SEDEX',dias:'2–3 dias úteis',preco:42.90}],
    'MG':[{nome:'📦 PAC',dias:'4–7 dias úteis',preco:27.90},{nome:'✈️ SEDEX',dias:'2–3 dias úteis',preco:44.90}],
    'ES':[{nome:'📦 PAC',dias:'5–7 dias úteis',preco:29.90},{nome:'✈️ SEDEX',dias:'3–4 dias úteis',preco:46.90}],
    'PR':[{nome:'📦 PAC',dias:'4–7 dias úteis',preco:30.90},{nome:'✈️ SEDEX',dias:'2–3 dias úteis',preco:48.90}],
    'SC':[{nome:'📦 PAC',dias:'5–8 dias úteis',preco:33.90},{nome:'✈️ SEDEX',dias:'3–4 dias úteis',preco:52.90}],
    'RS':[{nome:'📦 PAC',dias:'5–9 dias úteis',preco:36.90},{nome:'✈️ SEDEX',dias:'3–5 dias úteis',preco:55.90}],
    'DF':[{nome:'📦 PAC',dias:'4–7 dias úteis',preco:33.90},{nome:'✈️ SEDEX',dias:'2–3 dias úteis',preco:50.90}],
    'GO':[{nome:'📦 PAC',dias:'5–8 dias úteis',preco:36.90},{nome:'✈️ SEDEX',dias:'3–4 dias úteis',preco:55.90}],
    'MT':[{nome:'📦 PAC',dias:'6–9 dias úteis',preco:40.90},{nome:'✈️ SEDEX',dias:'4–5 dias úteis',preco:62.90}],
    'MS':[{nome:'📦 PAC',dias:'5–8 dias úteis',preco:38.90},{nome:'✈️ SEDEX',dias:'3–5 dias úteis',preco:58.90}],
    'BA':[{nome:'📦 PAC',dias:'7–10 dias úteis',preco:44.90},{nome:'✈️ SEDEX',dias:'4–6 dias úteis',preco:68.90}],
    'SE':[{nome:'📦 PAC',dias:'7–11 dias úteis',preco:46.90},{nome:'✈️ SEDEX',dias:'5–6 dias úteis',preco:70.90}],
    'AL':[{nome:'📦 PAC',dias:'8–11 dias úteis',preco:48.90},{nome:'✈️ SEDEX',dias:'5–7 dias úteis',preco:72.90}],
    'PE':[{nome:'📦 PAC',dias:'8–12 dias úteis',preco:48.90},{nome:'✈️ SEDEX',dias:'5–7 dias úteis',preco:72.90}],
    'PB':[{nome:'📦 PAC',dias:'8–12 dias úteis',preco:50.90},{nome:'✈️ SEDEX',dias:'6–8 dias úteis',preco:75.90}],
    'RN':[{nome:'📦 PAC',dias:'9–13 dias úteis',preco:52.90},{nome:'✈️ SEDEX',dias:'6–8 dias úteis',preco:76.90}],
    'CE':[{nome:'📦 PAC',dias:'9–13 dias úteis',preco:54.90},{nome:'✈️ SEDEX',dias:'6–8 dias úteis',preco:78.90}],
    'PI':[{nome:'📦 PAC',dias:'10–14 dias úteis',preco:57.90},{nome:'✈️ SEDEX',dias:'7–9 dias úteis',preco:82.90}],
    'MA':[{nome:'📦 PAC',dias:'10–15 dias úteis',preco:60.90},{nome:'✈️ SEDEX',dias:'7–10 dias úteis',preco:86.90}],
    'TO':[{nome:'📦 PAC',dias:'9–13 dias úteis',preco:58.90},{nome:'✈️ SEDEX',dias:'6–9 dias úteis',preco:84.90}],
    'PA':[{nome:'📦 PAC',dias:'11–16 dias úteis',preco:65.90},{nome:'✈️ SEDEX',dias:'8–11 dias úteis',preco:92.90}],
    'AM':[{nome:'📦 PAC',dias:'14–20 dias úteis',preco:74.90},{nome:'✈️ SEDEX',dias:'10–14 dias úteis',preco:105.90}],
    'AP':[{nome:'📦 PAC',dias:'14–20 dias úteis',preco:72.90},{nome:'✈️ SEDEX',dias:'10–14 dias úteis',preco:102.90}],
    'RR':[{nome:'📦 PAC',dias:'15–22 dias úteis',preco:80.90},{nome:'✈️ SEDEX',dias:'12–16 dias úteis',preco:112.90}],
    'AC':[{nome:'📦 PAC',dias:'15–22 dias úteis',preco:82.90},{nome:'✈️ SEDEX',dias:'12–16 dias úteis',preco:115.90}],
    'RO':[{nome:'📦 PAC',dias:'12–18 dias úteis',preco:70.90},{nome:'✈️ SEDEX',dias:'9–13 dias úteis',preco:98.90}],
  };

  // Carrinho persistido no localStorage (compartilhado com product.html)
  let cart = (function() { try { return JSON.parse(localStorage.getItem('tf-cart') || '[]'); } catch { return []; } })();
  let selectedShipping = null;
  let freteOpcoes = [];
  // ─── Checkout state ───────────────────────
  let checkoutStep = 1;
  let ckFreteOpcoes = [];
  let checkoutData  = {};

  // ─── Produtos Dinâmicos (API) ─────────────
  const BADGE_CLASS = { green:'badge-hot', blue:'badge-new', orange:'badge-sale', red:'badge-sale' };
  const BADGE_LABEL = { green:'Mais Vendido', blue:'Novidade', orange:'Promoção', red:'Promoção' };

  // ─── Categorias (rótulo + emoji) — geradas dinamicamente a partir dos produtos ───
  const CAT_META = {
    pastel:           { label: 'Pastel',                    emoji: '🥟' },
    churros:          { label: 'Churros',                   emoji: '🍬' },
    hamburger:        { label: 'Hambúrguer',                emoji: '🍔' },
    fritas:           { label: 'Fritas',                    emoji: '🍟' },
    batata:           { label: 'Batata',                    emoji: '🥔' },
    pizza:            { label: 'Pizza',                     emoji: '🍕' },
    assados:          { label: 'Assados e Marmitas',        emoji: '🍗' },
    espetinho:        { label: 'Espetinho',                 emoji: '🍢' },
    'hot-dog':        { label: 'Hot Dog',                   emoji: '🌭' },
    doces:            { label: 'Doces e Salgados',          emoji: '🍩' },
    oriental:         { label: 'Oriental',                  emoji: '🍣' },
    porcoes:          { label: 'Porções',                   emoji: '🍱' },
    pipoca:           { label: 'Pipoca',                    emoji: '🍿' },
    presente:         { label: 'Presente',                  emoji: '🎁' },
    'envio-presente': { label: 'Envio e Presente',          emoji: '🎁' },
    papelao:          { label: 'Papelão e Envio',           emoji: '📦' },
    metalizadas:      { label: 'Metalizadas',               emoji: '✨' },
    urnas:            { label: 'Urnas',                     emoji: '🗳️' },
    displays:         { label: 'Displays',                  emoji: '🗂️' },
    outros:           { label: 'Outros',                    emoji: '📦' },
  };
  function catLabelOf(c) { return (CAT_META[c] && CAT_META[c].label) || (c ? c.charAt(0).toUpperCase() + c.slice(1) : ''); }
  function catEmojiOf(c) { return (CAT_META[c] && CAT_META[c].emoji) || '📦'; }

  // Clique numa categoria: aplica o filtro da vitrine e rola até os produtos
  function filterCategory(cat) {
    const sel = document.getElementById('category-filter');
    if (sel) { sel.value = cat || ''; }
    if (typeof filterProductsGrid === 'function') filterProductsGrid();
    const alvo = document.getElementById('produtos');
    if (alvo) alvo.scrollIntoView({ behavior: 'smooth' });
    // Marca o link ativo no menu
    document.querySelectorAll('.nav-bar a').forEach(a => a.classList.toggle('active', a.dataset.cat === cat));
  }

  // Monta a vitrine de categorias (cartões com foto + contagem) e o menu superior
  function renderCategoryUI(cats, products) {
    const grid = document.getElementById('cat-grid');
    if (grid) {
      grid.innerHTML = cats.map(c => {
        const doCat = products.filter(p => p.category === c);
        const comFoto = doCat.find(p => p.image || (p.images && p.images[0]));
        const img = comFoto ? ((comFoto.images && comFoto.images[0]) || comFoto.image) : '';
        const src = img ? (img.startsWith('http') || img.startsWith('/') ? img : '/' + img) : '';
        return `<div class="cat-card" onclick="filterCategory('${c}')">
          <div class="cat-ring">
            <div class="cat-img-wrap">${src ? `<img class="cat-img" src="${src}" alt="${catLabelOf(c)} — TopFood Embalagens" loading="lazy" />` : ''}</div>
            <div class="cat-badge">${catEmojiOf(c)}</div>
          </div>
          <div class="cat-label">
            <h3>${catLabelOf(c)}</h3>
            <p>${doCat.length} produto${doCat.length !== 1 ? 's' : ''}</p>
          </div>
        </div>`;
      }).join('');
    }
    const nav = document.getElementById('nav-cats');
    if (nav) {
      nav.innerHTML = cats.map(c =>
        `<a href="#produtos" data-cat="${c}" onclick="filterCategory('${c}');return false;">${catEmojiOf(c)} ${catLabelOf(c)}</a>`
      ).join('');
    }
    // Setas do carrossel: esconde nas pontas e acompanha a rolagem
    if (grid && !grid._arrowsWired) {
      grid._arrowsWired = true;
      grid.addEventListener('scroll', updateCatArrows, { passive: true });
      window.addEventListener('resize', updateCatArrows);
    }
    updateCatArrows();
  }

  // Desliza o carrossel de categorias (estilo Instagram)
  function catScroll(dir) {
    const g = document.getElementById('cat-grid');
    if (g) g.scrollBy({ left: dir * g.clientWidth * 0.8, behavior: 'smooth' });
  }
  function updateCatArrows() {
    const g = document.getElementById('cat-grid');
    const prev = document.getElementById('cat-prev');
    const next = document.getElementById('cat-next');
    if (!g || !prev || !next) return;
    prev.hidden = g.scrollLeft <= 5;
    next.hidden = g.scrollLeft >= g.scrollWidth - g.clientWidth - 5;
  }

  function renderProducts(list) {
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    // Filtra apenas produtos ativos
    const active = list.filter(p => p.active !== false);
    if (!active.length) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;color:#666">Nenhum produto disponível no momento.</p>';
      return;
    }
    // Reconstrói PRICES com dados da API
    active.forEach(p => {
      PRICES[p.id] = {
        values: p.variants.map(v => v.price),
        units:  p.variants.map(v => v.units),
        labels: p.variants.map(v => v.label || null),
        weight_per_unit: p.weight_per_unit || 15,
        no_frete: p.no_frete || false,
      };
    });
    ALL_PRODUCTS = active;
    // Filtro de categorias dinâmico — inclui as categorias novas (Starprint) sem mexer no HTML
    const catSel = document.getElementById('category-filter');
    const cats = [...new Set(active.map(p => p.category).filter(Boolean))];
    cats.sort((a, b) => catLabelOf(a).localeCompare(catLabelOf(b), 'pt-BR'));
    if (catSel) {
      const atual = catSel.value;
      catSel.innerHTML = '<option value="">Todas as categorias</option>' +
        cats.map(c => `<option value="${c}">${catLabelOf(c)}</option>`).join('');
      if (cats.includes(atual)) catSel.value = atual;
    }
    renderCategoryUI(cats, active);
    // Gera HTML dos cards
    grid.innerHTML = active.map(p => {
      const badgeCls = p.badge && p.badgeColor ? (BADGE_CLASS[p.badgeColor] || 'badge-hot') : '';
      const badgeLbl = p.badge || (p.badgeColor ? BADGE_LABEL[p.badgeColor] : '');
      const badgeHtml = badgeLbl ? `<div class="product-badges"><span class="badge ${badgeCls}">${badgeLbl}</span></div>` : '';
      const v0 = p.variants[0];
      const optionsHtml = p.variants.map((v, i) => {
        const lbl = v.label
          ? `${String(v.label).replace(/</g,'&lt;').replace(/"/g,'&quot;')} — ${v.units} un`
          : `Pacote ${v.units} unidades`;
        return `<option value="${i}">${lbl}</option>`;
      }).join('');
      const catLabel = p.category.charAt(0).toUpperCase() + p.category.slice(1);
      const priceInit = `R$ ${v0.price.toFixed(2).replace('.',',')}`;
      const unitInit  = `R$ ${(v0.price/v0.units).toFixed(2).replace('.',',')}/un`;
      const key = p.id;
      return `
      <div class="product-card" id="${key}">
        ${badgeHtml}
        <a href="/produto/${key}" class="product-img" style="display:block;text-decoration:none">
          <img src="/${p.image.startsWith("/") ? p.image.slice(1) : p.image}" alt="${p.name}" loading="lazy" />
        </a>
        <div class="product-body">
          <div class="product-cat">${catLabel}</div>
          <h3 style="cursor:pointer" onclick="window.location.href='/produto/${key}'">${p.name}</h3>
          <p>${p.description}</p>
          <select class="pack-select" id="sel-${key}" onchange="updatePrice('${key}')">
            ${optionsHtml}
          </select>
          <div class="qty-row">
            <button class="qty-btn" onclick="changeQty('${key}',-1)">−</button>
            <span class="qty-num" id="qty-${key}">1</span>
            <button class="qty-btn" onclick="changeQty('${key}',1)">+</button>
            <span class="qty-label">pacote(s)</span>
          </div>
          <div class="price-row">
            <div class="price-block">
              <div class="price-from">A partir de</div>
              <div class="price-val" id="price-${key}">${priceInit}</div>
              <div class="price-unit" id="unit-${key}">${unitInit}</div>
            </div>
            <button class="add-btn" onclick="addToCart('${p.name.replace(/'/g,"\\'")}','${p.image}','sel-${key}','qty-${key}','price-${key}','${key}')">🛒 Comprar</button>
          </div>
          <a href="https://wa.me/5511988856367?text=${encodeURIComponent('Olá! Tenho interesse no produto: ' + p.name + '. Link: https://topfoodembalagens.com.br/produto/' + key)}" target="_blank" style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:7px;background:#25D366;color:#fff;border-radius:6px;padding:7px 10px;font-size:.78rem;font-weight:700;text-decoration:none;"><svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"white\"><path d=\"M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z\"/><path d=\"M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.121 1.533 5.855L0 24l6.335-1.509A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.882a9.866 9.866 0 01-5.031-1.381l-.361-.214-3.741.981.998-3.648-.235-.374A9.845 9.845 0 012.118 12C2.118 6.538 6.538 2.118 12 2.118c5.463 0 9.882 4.42 9.882 9.882 0 5.463-4.419 9.882-9.882 9.882z\"/></svg> Comprar pelo WhatsApp</a>
          <a href=\"/produto/${key}\" style="display:block;text-align:center;margin-top:8px;font-size:.78rem;color:var(--red);font-weight:600;text-decoration:none">Ver detalhes →</a>
        </div>
      </div>`;
    }).join('');
  }

  // Fallback com os produtos originais caso API falhe
  const PRODUCTS_FALLBACK = [
    { id:'pastel',  name:'Embalagem de Pastel — Pillow Box',      category:'pastel',    active:true, badge:'MAIS VENDIDO', badgeColor:'green',
      image:'images/01 - Pastel.webp',        description:'Design chalk art com sabores impressos: Vinagrete, Carne, Frango c/ Catupiry, Queijo e mais.',
      variants:[{units:50,price:45},{units:100,price:85},{units:250,price:195}] },
    { id:'churros', name:'Embalagem de Churros — Caixa Tubular',  category:'churros',   active:true, badge:'NOVIDADE',    badgeColor:'blue',
      image:'images/02 - churrros fechado.webp', description:'Caixa preta longa com estilo chalk art. Sabor Doce de Leite em destaque. Elegante e prático.',
      variants:[{units:50,price:50},{units:100,price:95},{units:250,price:220}] },
    { id:'burger',  name:'Embalagem de Hambúrguer — Caixa Delivery', category:'hamburger', active:true, badge:'PROMOÇÃO', badgeColor:'orange',
      image:'images/04 - Hamburguer.webp',    description:'Caixa preta com "BURGUER" em destaque. Checklist de sabores: X-Bacon, X-Egg, X-Tudo e mais.',
      variants:[{units:50,price:42},{units:100,price:80},{units:250,price:185}] },
    { id:'fritas',  name:'Embalagem de Fritas — Cone e Balde',    category:'fritas',    active:true, badge:'',           badgeColor:'',
      image:'images/05 - fritas abertas.webp', description:'Formato cone/balde preto. Disponível aberta e fechada. Destaque "FRITAS" com chalk art exclusivo.',
      variants:[{units:50,price:38},{units:100,price:72},{units:250,price:168}] },
  ];

  // Lê link de orçamento da IA (?orcar=produto:pacote:qtd,...&cep=) e monta o carrinho
  function aplicarOrcamentoURL() {
    try {
      var params = new URLSearchParams(window.location.search);
      var orcar = params.get('orcar');
      if (!orcar) return;
      var cep = (params.get('cep') || '').replace(/\D/g, '');
      var add = 0;
      orcar.split(',').forEach(function(tok) {
        var parts = tok.split(':');
        var pid = parts[0], pacote = parseInt(parts[1]), qtd = Math.max(1, parseInt(parts[2]) || 1);
        var prod = (ALL_PRODUCTS || []).find(function(p) { return p.id === pid; });
        if (!prod || !prod.variants) return;
        var idx = prod.variants.findIndex(function(v) { return Number(v.units) === pacote; });
        if (idx < 0) return;
        var v = prod.variants[idx];
        var id = 'sel-' + pid + '-' + idx;
        var ex = cart.find(function(c) { return c.id === id; });
        if (ex) { ex.qty += qtd; ex.total = ex.price * ex.qty; }
        else cart.push({ id: id, name: prod.name, img: prod.image, pack: v.units, qty: qtd, price: v.price, total: v.price * qtd, no_frete: !!(PRICES[pid] && PRICES[pid].no_frete) });
        add++;
      });
      if (!add) return;
      saveCartLocal();
      renderCart();
      openCart();
      if (cep && cep.length === 8) {
        var inp = document.getElementById('cartCepInput');
        if (inp) { inp.value = cep; if (typeof calcularFrete === 'function') calcularFrete('cart'); }
      }
      if (window.history && history.replaceState) history.replaceState(null, '', window.location.pathname);
    } catch (e) {}
  }

  async function loadProducts() {
    try {
      const [productsRes, settingsRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/settings'),
      ]);
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        if (s.featured_banner) {
          const bar = document.getElementById('promo-bar');
          const txt = document.getElementById('promo-bar-text');
          if (bar && txt) { txt.textContent = s.featured_banner; bar.style.display = ''; }
        }
        // Armazena config PIX para uso no checkout
        window._pixConfig = {
          pix_key:  (s.pix_key  || '').trim(),
          pix_name: (s.pix_name || 'TopFood Embalagens').slice(0, 25),
          pix_city: (s.pix_city || 'SAO PAULO').slice(0, 15).toUpperCase(),
        };
      }
      if (!productsRes.ok) throw new Error('API indisponível');
      const products = await productsRes.json();
      if (!Array.isArray(products) || products.length === 0) throw new Error('Lista vazia');
      renderProducts(products);
    } catch (e) {
      // Servidor pode estar reiniciando (deploy) — tenta de novo antes do fallback
      window._prodRetry = (window._prodRetry || 0) + 1;
      if (window._prodRetry <= 3) { setTimeout(loadProducts, 2500); return; }
      renderProducts(PRODUCTS_FALLBACK);
    }
    aplicarOrcamentoURL();
    // Após carregar: rola para âncora do hash se existir (#pastel, #churros, etc.)
    const hash = window.location.hash;
    if (hash && hash !== '#cart') {
      const target = document.querySelector(hash);
      if (target) {
        setTimeout(() => {
          const offset = target.getBoundingClientRect().top + window.scrollY - 120;
          window.scrollTo({ top: offset, behavior: 'smooth' });
        }, 100);
      }
    }
  }

  // ─── Preços ───────────────────────────────
  function updatePrice(key) {
    const idx = parseInt(document.getElementById('sel-' + key).value);
    const p = PRICES[key];
    const val = p.values[idx], un = p.units[idx];
    document.getElementById('price-' + key).textContent = `R$ ${val.toFixed(2).replace('.', ',')}`;
    document.getElementById('unit-' + key).textContent = `R$ ${(val/un).toFixed(2).replace('.', ',')}/un`;
  }

  function changeQty(key, d) {
    const el = document.getElementById('qty-' + key);
    el.textContent = Math.max(1, parseInt(el.textContent) + d);
  }

  function saveCartLocal() {
    try { localStorage.setItem('tf-cart', JSON.stringify(cart)); } catch {}
  }

  function addToCart(name, img, selId, qtyId, priceId, key) {
    const idx = parseInt(document.getElementById(selId).value);
    const qty = parseInt(document.getElementById(qtyId).textContent);
    const price = PRICES[key].values[idx];
    const pack = PRICES[key].units[idx];
    const packLabel = (PRICES[key].labels || [])[idx] || null;
    const id = selId + '-' + idx;
    const ex = cart.find(c => c.id === id);
    if (ex) { ex.qty += qty; ex.total = ex.price * ex.qty; }
    else cart.push({ id, name, img, pack, packLabel, qty, price, total: price * qty, no_frete: !!(PRICES[key] && PRICES[key].no_frete) });
    saveCartLocal();
    renderCart();
    showToast(`✅ ${name} adicionado!`);
    // 📊 Tracking
    if (window.TFTrack) TFTrack.addToCart({ id: key, name, price, qty, pack, category: key });
    if (window.TFInsights) TFInsights.track('add_cart', key);
  }

  function removeFromCart(id) {
    cart = cart.filter(c => c.id !== id);
    selectedShipping = null;
    saveCartLocal();
    renderCart();
  }

  // Ajusta a quantidade de pacotes de um item já no carrinho (botões + / −)
  function changeCartQty(id, d) {
    const item = cart.find(c => c.id === id);
    if (!item) return;
    item.qty = Math.max(1, item.qty + d);
    item.total = item.price * item.qty;
    selectedShipping = null; // frete precisa ser recalculado
    saveCartLocal();
    renderCart();
  }

  // ─── Renderização ─────────────────────────
  function renderCartTotals() {
    const subtotal = cart.reduce((s, c) => s + c.total, 0);
    const count    = cart.reduce((s, c) => s + c.qty, 0);
    const setText  = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setText('cartCount',    count);
    setText('cartLabel',    count === 0 ? 'Carrinho' : `${count} item${count > 1 ? 's' : ''}`);
    setText('cartSubtotal', `R$ ${subtotal.toFixed(2).replace('.', ',')}`);
  }

  function selectShipping(idx) {
    selectedShipping = freteOpcoes[idx];
    document.querySelectorAll('.cart-frete-opt').forEach((el, i) => el.classList.toggle('selected', i === idx));
    document.getElementById('mpAlert').classList.remove('show');
    renderCartTotals();
  }

  // ─── Frete por peso ───────────────────────
  function getProductKeyFromItemId(itemId) {
    // item.id formato: "sel-pastel-0" -> extrair "pastel"
    const m = String(itemId).match(/^sel-(.+)-\d+$/);
    return m ? m[1] : itemId;
  }

  function calcCartWeightGrams() {
    return cart.reduce((total, item) => {
      const key = getProductKeyFromItemId(item.id);
      const w = (PRICES[key] && PRICES[key].weight_per_unit) || 15;
      return total + (item.qty * item.pack * w);
    }, 0);
  }
  // Item dispensa frete se tem a flag no_frete (vinda do produto) ou é o produto
  // interno de teste de pagamentos (detectado pelo nome, sem depender do banco).
  function cartItemNoFrete(i) {
    return !!(i && i.no_frete) || /produto de teste|teste\s*[—-]\s*pagamentos/i.test((i && i.name) || '');
  }
  // Carrinho inteiro dispensa frete? (usado pelo checkout p/ pular a etapa de frete)
  function cartAllNoFrete() {
    return cart.length > 0 && cart.every(cartItemNoFrete);
  }
  function applyWeightMultiplier(preco, weightGrams) {
    if (weightGrams <= 500)   return preco;
    if (weightGrams <= 2000)  return preco * 1.15;
    if (weightGrams <= 5000)  return preco * 1.35;
    if (weightGrams <= 10000) return preco * 1.60;
    return preco * 1.90;
  }

  // ─── Cupom de desconto ────────────────────
  async function applyCoupon() {
    const inputEl = document.getElementById('ckCouponInput') || document.getElementById('couponInput');
    const msgEl   = document.getElementById('ckCouponMsg')   || document.getElementById('coupon-msg');
    const code    = inputEl ? inputEl.value.trim().toUpperCase() : '';
    if (!code) { if (msgEl) { msgEl.style.color='var(--red)'; msgEl.textContent='Digite o código do cupom.'; } return; }
    if (msgEl) { msgEl.style.color='var(--gray)'; msgEl.textContent='Verificando...'; }
    try {
      const r = await fetch(`/api/coupons/${code}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Cupom inválido');
      appliedCoupon = d;
      if (msgEl) { msgEl.style.color='var(--green)'; msgEl.textContent = `✅ Cupom "${d.code}" aplicado! ${d.discount_type==='percent'?d.discount_value+'% OFF':'R$ '+d.discount_value+' OFF'}`; }
      renderCartTotals();
      // Re-render checkout step 1 to show applied coupon banner
      if (checkoutStep === 1 && document.getElementById('checkoutOverlay')?.classList.contains('open')) {
        setTimeout(renderCheckoutStep, 400);
      }
    } catch(e) {
      appliedCoupon = null;
      if (msgEl) { msgEl.style.color='var(--red)'; msgEl.textContent = '❌ ' + (e.message || 'Cupom inválido.'); }
      renderCartTotals();
    }
  }
  function removeCoupon() {
    appliedCoupon = null;
    const inp = document.getElementById('ckCouponInput') || document.getElementById('couponInput');
    const msg = document.getElementById('ckCouponMsg')   || document.getElementById('coupon-msg');
    if (inp) inp.value = '';
    if (msg) msg.textContent = '';
    renderCartTotals();
    if (document.getElementById('checkoutOverlay')?.classList.contains('open')) renderCheckoutStep();
  }

  // ─── Busca e filtro de produtos ───────────
  function filterProductsGrid() {
    const q   = (document.getElementById('product-search')?.value || '').toLowerCase();
    const cat = document.getElementById('category-filter')?.value || '';
    clearTimeout(window._searchTrackT);
    if (q && q.length >= 3 && window.TFInsights) window._searchTrackT = setTimeout(function(){ TFInsights.track('search', q); }, 900);
    const cards = document.querySelectorAll('#products-grid .product-card');
    let shown = 0;
    cards.forEach(card => {
      const id   = card.id;
      const prod = ALL_PRODUCTS.find(p => p.id === id);
      if (!prod) return;
      const matchQ   = !q || prod.name.toLowerCase().includes(q) || prod.description.toLowerCase().includes(q) || prod.category.toLowerCase().includes(q);
      const matchCat = !cat || prod.category === cat;
      card.style.display = (matchQ && matchCat) ? '' : 'none';
      if (matchQ && matchCat) shown++;
    });
    const noRes = document.getElementById('no-results');
    const term  = document.getElementById('search-term');
    if (noRes) noRes.style.display = shown === 0 ? '' : 'none';
    if (term)  term.textContent = q || cat;
  }

  // Liga a barra de busca grande (topo) na busca que já filtra a grade de produtos
  function heroSearch() {
    var hero = document.getElementById('hero-search');
    var grid = document.getElementById('product-search');
    if (hero && grid) grid.value = hero.value;
    if (typeof filterProductsGrid === 'function') filterProductsGrid();
    var sec = document.getElementById('produtos');
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  window.heroSearch = heroSearch;

  function fixImgPath(s) {
    if (!s) return '';
    if (s.startsWith('data:') || s.startsWith('http') || s.startsWith('/')) return s;
    return '/' + s;
  }

  function renderCart() {
    const body = document.getElementById('cartBody');
    Array.from(body.children).forEach(el => { if (!el.id) body.removeChild(el); });
    document.getElementById('cartEmpty').style.display = cart.length === 0 ? 'block' : 'none';
    cart.forEach(item => {
      const div = document.createElement('div');
      div.className = 'cart-item';
      div.innerHTML = `
        <img class="cart-item-img" src="${fixImgPath(item.img)}" alt="${item.name}" onerror="this.style.background='#eee'" />
        <div class="cart-item-info">
          <h4>${item.name}</h4>
          <small>${item.packLabel ? item.packLabel + ' · ' : ''}${item.pack} un por pacote</small>
          <div class="cart-item-bottom">
            <span style="display:inline-flex;align-items:center;gap:8px">
              <button onclick="changeCartQty('${item.id}',-1)" aria-label="Diminuir" style="width:26px;height:26px;border:1.5px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-weight:700;line-height:1">−</button>
              <b style="min-width:16px;text-align:center">${item.qty}</b>
              <button onclick="changeCartQty('${item.id}',1)" aria-label="Aumentar" style="width:26px;height:26px;border:1.5px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-weight:700;line-height:1">+</button>
            </span>
            <span class="cart-item-price">R$ ${item.total.toFixed(2).replace('.', ',')}</span>
            <button class="remove-item" onclick="removeFromCart('${item.id}')">🗑</button>
          </div>
        </div>`;
      body.appendChild(div);
    });
    renderCartTotals();
  }

  function openCart() {
    document.body.classList.add('painel-aberto');
    document.getElementById('cartSidebar').classList.add('open');
    document.getElementById('cartOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    // 📊 Tracking: InitiateCheckout
    if (window.TFTrack && cart.length > 0) {
      const subtotal = cart.reduce((s, c) => s + c.total, 0);
      TFTrack.beginCheckout({ items: cart, subtotal });
    }
  }
  function closeCart() {
    // Só reexibe o WhatsApp se o checkout NÃO estiver aberto (checkout abre antes do carrinho fechar)
    if (!document.getElementById('checkoutOverlay')?.classList.contains('open')) {
      document.body.classList.remove('painel-aberto');
    }
    document.getElementById('cartSidebar').classList.remove('open');
    document.getElementById('cartOverlay').classList.remove('open');
    // Não reseta overflow se o checkout modal estiver aberto
    if (!document.getElementById('checkoutOverlay').classList.contains('open')) {
      document.body.style.overflow = '';
    }
  }
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
  }

  // ─── CEP / Frete ──────────────────────────
  function maskCep(el) {
    let v = el.value.replace(/\D/g, '').slice(0, 8);
    if (v.length > 5) v = v.slice(0,5) + '-' + v.slice(5);
    el.value = v;
  }

  async function calcularFrete(ctx) {
    const isCart     = ctx === 'cart';
    const isCheckout = ctx === 'checkout';
    const isMain     = !isCart && !isCheckout;
    const inputId    = isCheckout ? 'ckCepInput' : isCart ? 'cartCepInput' : 'mainCepInput';
    const inputEl    = document.getElementById(inputId);
    if (!inputEl) return;
    const cep = inputEl.value.replace(/\D/g, '');
    if (cep.length !== 8) { showFreteErr(ctx, 'CEP inválido. Digite os 8 dígitos.'); return; }
    if (isMain) {
      document.getElementById('mainFreteLoading').classList.add('show');
      document.getElementById('mainFreteResult').classList.remove('show');
      const btn = document.getElementById('mainCalcBtn'); btn.textContent = 'Calculando…'; btn.disabled = true;
    }
    if (isCheckout) {
      const btn = document.getElementById('ckFreteBtn');
      if (btn) { btn.textContent = 'Calculando…'; btn.disabled = true; }
    }
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) { showFreteErr(ctx, 'CEP não encontrado.'); return; }
      checkoutData.cep = cep; // armazena para saveOrderToServer
      const baseOpcoes = FRETE_TABLE[data.uf] || [{nome:'📦 PAC',dias:'Consultar prazo',preco:69.90},{nome:'✈️ SEDEX',dias:'Consultar prazo',preco:99.90}];
      const weightGrams = (isCart || isCheckout) ? calcCartWeightGrams() : 0;
      const opcoes = baseOpcoes.map(o => ({
        ...o,
        preco: (isCart || isCheckout) ? Math.round(applyWeightMultiplier(o.preco, weightGrams) * 100) / 100 : o.preco,
        dias:  o.dias + ((isCart || isCheckout) && weightGrams > 500 ? ' (estimativa por peso)' : ''),
      }));
      renderFreteResult(ctx, data.localidade, data.uf, data.bairro, opcoes);
    } catch { showFreteErr(ctx, 'Erro ao buscar CEP. Verifique sua conexão.'); }
    finally {
      if (isMain) {
        document.getElementById('mainFreteLoading').classList.remove('show');
        const btn = document.getElementById('mainCalcBtn'); btn.textContent = 'Calcular'; btn.disabled = false;
      }
      if (isCheckout) {
        const btn = document.getElementById('ckFreteBtn');
        if (btn) { btn.textContent = 'Calcular'; btn.disabled = false; }
      }
    }
  }

  function showFreteErr(ctx, msg) {
    if (ctx === 'checkout') {
      const el = document.getElementById('ckFreteOptions');
      if (el) el.innerHTML = `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:10px 14px;color:var(--red);font-size:0.82rem">⚠️ ${msg}</div>`;
    } else if (ctx === 'cart') {
      const el = document.getElementById('cartFreteResult');
      if (el) { el.innerHTML = `<div class="cart-frete-opt error-opt">⚠️ ${msg}</div>`; el.classList.add('show'); }
    } else {
      document.getElementById('mainFreteLoading').classList.remove('show');
      const el = document.getElementById('mainFreteResult');
      el.className = 'frete-result error show';
      el.innerHTML = `<div style="color:var(--red);font-size:0.86rem">⚠️ ${msg}</div>`;
      document.getElementById('mainCalcBtn').textContent = 'Calcular';
      document.getElementById('mainCalcBtn').disabled = false;
    }
  }

  function renderFreteResult(ctx, cidade, uf, bairro, opcoes) {
    const addr = `Entregando em: <strong>${cidade} / ${uf}</strong>${bairro ? ' — ' + bairro : ''}`;
    if (ctx === 'checkout') {
      ckFreteOpcoes = opcoes; selectedShipping = null;
      const el = document.getElementById('ckFreteOptions');
      if (el) {
        el.innerHTML = `
          <div style="font-size:0.74rem;color:var(--gray);margin-bottom:10px">📍 ${addr}</div>
          ${opcoes.map((o, i) => `
            <div class="ck-frete-opt" id="ckfopt-${i}" onclick="ckSelectShipping(${i})">
              <div>
                <div class="fo-name">${o.nome}</div>
                <div class="fo-days">⏱ ${o.dias}</div>
              </div>
              <div class="fo-price">R$ ${o.preco.toFixed(2).replace('.', ',')}</div>
            </div>`).join('')}
          <p class="frete-hint">👆 Selecione uma opção de entrega</p>`;
      }
    } else if (ctx === 'cart') {
      freteOpcoes = opcoes; selectedShipping = null; renderCartTotals();
      const el = document.getElementById('cartFreteResult');
      if (el) {
        el.innerHTML = `
          <div style="font-size:0.74rem;color:var(--gray);margin-bottom:8px">📍 ${addr}</div>
          ${opcoes.map((o, i) => `
            <div class="cart-frete-opt" id="fopt-${i}" onclick="selectShipping(${i})">
              <div><div class="opt-name">${o.nome}</div><div class="opt-days">${o.dias}</div></div>
              <span class="opt-price">R$ ${o.preco.toFixed(2).replace('.', ',')}</span>
            </div>`).join('')}
          <p class="frete-hint">👆 Selecione uma opção de entrega</p>`;
        el.classList.add('show');
      }
    } else {
      const el = document.getElementById('mainFreteResult');
      el.className = 'frete-result show';
      document.getElementById('mainFreteAddress').innerHTML = `📍 ${addr}`;
      document.getElementById('mainFreteOptions').innerHTML = opcoes.map(o => `
        <div class="frete-opt">
          <div class="frete-opt-icon">${o.nome.split(' ')[0]}</div>
          <div><div class="frete-opt-name">${o.nome.replace(/^.\s/,'')}</div><div class="frete-opt-days">⏱ ${o.dias}</div></div>
          <div class="frete-opt-price">R$ ${o.preco.toFixed(2).replace('.', ',')}</div>
        </div>`).join('');
    }
  }

  // ─── Helper: cliente logado ───────────────
  function getLoggedCustomer() {
    try { return JSON.parse(localStorage.getItem('tf-customer') || 'null'); } catch { return null; }
  }

  // ─── Abre o modal "Minha Conta" ───────────
  function openAccount() {
    const overlay = document.getElementById('accountOverlay');
    if (!overlay) return;
    // Sincroniza o estado em memória com o localStorage (caso tenha logado em outra aba)
    if (!currentCustomer) currentCustomer = getLoggedCustomer();
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (currentCustomer) {
      showAccountPanel();        // já logado → vai direto para o painel da conta
    } else {
      switchAccTab('login');     // não logado → tela de entrar
    }
  }

  // ─── Fecha o modal "Minha Conta" ──────────
  function closeAccount() {
    const overlay = document.getElementById('accountOverlay');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ─── Mostra o painel da conta (perfil + pedidos) ─────
  function showAccountPanel() {
    if (!currentCustomer) currentCustomer = getLoggedCustomer();
    if (!currentCustomer) { switchAccTab('login'); return; }
    switchAccTab('account');
    const nome  = currentCustomer.name || 'Cliente';
    const email = currentCustomer.email || '';
    const avatar = document.getElementById('acc-avatar');
    const nameEl = document.getElementById('acc-name');
    const emailEl = document.getElementById('acc-email-display');
    if (avatar)  avatar.textContent  = (nome.trim()[0] || '?').toUpperCase();
    if (nameEl)  nameEl.textContent  = nome;
    if (emailEl) emailEl.textContent = email;
    updateAccountHeader();
    loadCustomerOrders();
  }

  // ─── Atualiza o botão "Minha Conta" no cabeçalho ─────
  function updateAccountHeader() {
    if (!currentCustomer) currentCustomer = getLoggedCustomer();
    const label = document.getElementById('accountHdrLabel');
    if (label) {
      label.textContent = currentCustomer
        ? (currentCustomer.name || 'Minha Conta').split(' ')[0]
        : 'Minha Conta';
    }
  }

  // ─── Helper: salva pedido no servidor ────
  async function saveOrderToServer(paymentMethod, extraNotes, mpPrefId) {
    try {
      const cust     = getLoggedCustomer();
      const subtotal = cart.reduce((s, c) => s + c.total, 0);
      let discount   = 0;
      if (appliedCoupon) {
        discount = appliedCoupon.discount_type === 'percent'
          ? subtotal * appliedCoupon.discount_value / 100
          : Math.min(appliedCoupon.discount_value, subtotal);
        discount = Math.round(discount * 100) / 100;
      }
      const frete    = selectedShipping ? selectedShipping.preco : 0;
      const total    = Math.max(0, subtotal - discount + frete);
      const cep      = checkoutData.cep
                    || document.getElementById('ckCepInput')?.value?.replace(/\D/g,'')
                    || document.getElementById('cartCepInput')?.value || '';
      // Customer info: prefer checkoutData (filled in step 2) over localStorage
      const custInfo = {
        name:    checkoutData.nome    || (cust ? cust.name  : `Cliente ${paymentMethod}`),
        email:   checkoutData.email   || (cust ? cust.email : ''),
        phone:   checkoutData.phone   || (cust ? cust.phone || '' : ''),
        cpf:     checkoutData.cpf     || '',
        addrNum: checkoutData.addrNum || '',
        cep:     checkoutData.cep     || '',
      };
      const utm      = window.TFTrack ? TFTrack.getUTM() : {};
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: custInfo,
          items: cart.map(i => ({
            id: i.id, name: i.name, qty: i.qty, pack: i.pack, pack_label: i.packLabel || undefined,
            unit_price: i.price, total: i.total
          })),
          shipping: selectedShipping
            ? { method: selectedShipping.nome, price: selectedShipping.preco,
                days: selectedShipping.dias, cep }
            : { cep },
          subtotal, discount,
          coupon_code: appliedCoupon?.code || '',
          total,
          payment_method: paymentMethod,
          notes: extraNotes || '',
          mp_preference_id: mpPrefId || '',
          utm,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      // 📊 Tracking: Purchase
      try {
        const total = parseFloat(window._checkoutTotal || 0);
        const items = (window._checkoutItems || []).map(i => ({ id: String(i.id||''), quantity: i.qty||1 }));
        // Meta Pixel
        if (typeof fbq === 'function') {
          fbq('track', 'Purchase', { value: total, currency: 'BRL', contents: items, content_type: 'product' });
        }
        // TikTok — compra concluída
        if (typeof ttq !== 'undefined') {
          ttq.track('CompletePayment', { value: total, currency: 'BRL', contents: items.map(i => ({ content_id: i.id, quantity: i.quantity })) });
        }
        // Google Analytics 4 — purchase event (importado pelo Google Ads via GA4)
        if (typeof gtag === 'function') {
          gtag('event', 'purchase', {
            transaction_id: window._checkoutOrderId || '',
            value: total,
            currency: 'BRL',
            items: items.map(i => ({ item_id: i.id, quantity: i.quantity }))
          });
        }
      } catch(e) { console.warn('Pixel error:', e); }
      if (window.TFTrack) {
        TFTrack.purchase({
          orderId: data.order_id || '',
          items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
          subtotal, discount, shipping: frete,
          coupon: appliedCoupon?.code || '',
        });
      }
      markCartRecovered();
      return data.order_id || null;
    } catch(e) {
      console.error('[TopFood] Falha ao salvar pedido:', e.message);
      return null;
    }
  }

  // ─── Checkout WhatsApp ────────────────────
  async function checkoutWhatsApp() {
    if (cart.length === 0) { showToast('❌ Carrinho vazio!'); return; }
    if (!getLoggedCustomer()) {
      showToast('⚠️ Faça login para finalizar o pedido.');
      closeCart();
      setTimeout(() => openAccount(), 300);
      return;
    }
    const subtotal = cart.reduce((s, c) => s + c.total, 0);
    const total    = subtotal + (selectedShipping ? selectedShipping.preco : 0);

    // Salva pedido no painel admin
    await saveOrderToServer('whatsapp', 'Pedido via WhatsApp');

    let msg = '🛒 *Olá! Quero fazer um pedido na TopFood Embalagens:*\n\n';
    cart.forEach(item => { msg += `• *${item.name}* (${item.packLabel ? item.packLabel + ', ' : ''}${item.pack} un) × ${item.qty} = R$ ${item.total.toFixed(2).replace('.', ',')}\n`; });
    if (selectedShipping) msg += `\n🚚 *Frete ${selectedShipping.nome}:* R$ ${selectedShipping.preco.toFixed(2).replace('.', ',')}`;
    msg += `\n\n*Total: R$ ${total.toFixed(2).replace('.', ',')}*\n\nPode confirmar disponibilidade e prazo? Obrigado!`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  // ─── Checkout Mercado Pago ────────────────
  async function checkoutMercadoPago() { /* removido */ }

  async function doCustomerRegister() {
    const btn = document.getElementById('registerBtn');
    const alert = document.getElementById('register-alert');
    const name     = document.getElementById('reg-name').value.trim();
    const email    = document.getElementById('reg-email').value.trim().toLowerCase();
    const phone    = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm  = document.getElementById('reg-confirm').value;
    const cep      = document.getElementById('reg-cep').value.trim();
    const state    = document.getElementById('reg-state').value.trim().toUpperCase();
    const city     = document.getElementById('reg-city').value.trim();
    const address  = document.getElementById('reg-address').value.trim();
    const marketing = document.getElementById('reg-marketing').checked;

    alert.className = 'acc-alert'; alert.style.display = 'none';

    // Validações
    if (!name) return showAccAlert('register', 'Informe seu nome completo.', 'error');
    if (!email || !/\S+@\S+\.\S+/.test(email)) return showAccAlert('register', 'E-mail inválido.', 'error');
    if (!phone) return showAccAlert('register', 'Informe seu WhatsApp.', 'error');
    if (password.length < 6) return showAccAlert('register', 'Senha deve ter pelo menos 6 caracteres.', 'error');
    if (password !== confirm) return showAccAlert('register', 'As senhas não coincidem.', 'error');

    btn.disabled = true; btn.textContent = 'Cadastrando...';

    const payload = { name, email, phone, password, cep, state, city, address, marketing_opt_in: marketing };

    try {
      const res = await fetch('/api/customer/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar');
      currentCustomer = data.customer;
      localStorage.setItem('tf-customer', JSON.stringify(currentCustomer));
      localStorage.setItem('tf-token', data.token);
      showAccAlert('register', '✅ Conta criada com sucesso! Bem-vindo à TopFood!', 'success');
      if (window.TFTrack) TFTrack.completeRegistration({ method: 'email' });
      setTimeout(() => { showAccountPanel(); }, 1200);
    } catch(e) {
      // Fallback local (sem servidor)
      const existing = JSON.parse(localStorage.getItem('tf-customers') || '[]');
      if (existing.find(c => c.email === email)) {
        showAccAlert('register', 'Este e-mail já está cadastrado. Faça login.', 'error');
        btn.disabled = false; btn.textContent = 'Criar minha conta →'; return;
      }
      const newCustomer = { id: 'C-' + Date.now(), name, email, phone, cep, state, city, address, marketing_opt_in: marketing, registered_at: new Date().toISOString() };
      existing.push(newCustomer);
      localStorage.setItem('tf-customers', JSON.stringify(existing));
      currentCustomer = newCustomer;
      localStorage.setItem('tf-customer', JSON.stringify(newCustomer));
      showAccAlert('register', '✅ Conta criada! Bem-vindo à TopFood!', 'success');
      setTimeout(() => { showAccountPanel(); }, 1200);
    }
    btn.disabled = false; btn.textContent = 'Criar minha conta →';
  }

  async function doCustomerLogin() {
    const btn   = document.getElementById('loginBtn');
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const pass  = document.getElementById('login-pass').value;

    if (!email) return showAccAlert('login', 'Informe seu e-mail.', 'error');
    if (!pass)  return showAccAlert('login', 'Informe sua senha.', 'error');

    btn.disabled = true; btn.textContent = 'Entrando...';

    try {
      const res = await fetch('/api/customer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'E-mail ou senha incorretos');
      currentCustomer = data.customer;
      localStorage.setItem('tf-customer', JSON.stringify(data.customer));
      localStorage.setItem('tf-token', data.token);
      showAccountPanel();
    } catch(e) {
      // Fallback local
      const customers = JSON.parse(localStorage.getItem('tf-customers') || '[]');
      const found = customers.find(c => c.email === email);
      if (found) {
        currentCustomer = found;
        localStorage.setItem('tf-customer', JSON.stringify(found));
        showAccountPanel();
      } else {
        showAccAlert('login', e.message || 'E-mail ou senha incorretos.', 'error');
      }
    }
    btn.disabled = false; btn.textContent = 'Entrar na minha conta';
  }

  function doCustomerLogout() {
    currentCustomer = null;
    localStorage.removeItem('tf-customer');
    localStorage.removeItem('tf-token');
    updateAccountHeader();
    switchAccTab('login');
    document.getElementById('login-email').value = '';
    document.getElementById('login-pass').value = '';
    showToast('Você saiu da conta.');
  }

  async function loadCustomerOrders() {
    const container = document.getElementById('acc-orders-list');
    if (!container || !currentCustomer) return;
    let orders = [];
    try {
      const token = localStorage.getItem('tf-token') || '';
      const res = await fetch('/api/customer/orders', { headers: { 'Authorization': 'Bearer ' + token } });
      if (res.ok) orders = await res.json();
    } catch(e) {}
    const countEl = document.getElementById('acc-orders-count');
    if(countEl) countEl.textContent = orders.length + ' pedido' + (orders.length!==1?'s':'');
    if (!orders.length) {
      container.innerHTML = `<div class="acc-empty"><div class="acc-empty-icon">📦</div><p>Você ainda não fez nenhum pedido.</p><p style="margin-top:6px;font-size:.75rem">Explore nossos produtos e faça seu primeiro pedido!</p></div>`;
      return;
    }
    const fmtR = v => Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    container.innerHTML = orders.map(o => {
      const payIcon = {whatsapp:'💬',credit_card:'💳',pix:'⚡',boleto:'🏦'}[o.payment_method]||'💰';
      const addr = o.shipping?.address
        ? `${o.shipping.address}, ${o.shipping.city||''} — ${o.shipping.state||''} · CEP ${o.shipping.cep||''}`
        : '';
      const itemLines = (o.items||[]).map(i=>`
        <div class="acc-order-line">
          <span class="acc-order-line-name">${i.name}</span>
          <span class="acc-order-line-qty">× ${i.qty||1}</span>
          <span class="acc-order-line-val">R$ ${fmtR(i.total||0)}</span>
        </div>`).join('');
      return `
      <div class="acc-order-item">
        <div class="acc-order-head">
          <div>
            <span class="acc-order-id">${o.id}</span>
            <span class="acc-order-date" style="margin-left:8px">${new Date(o.date).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}</span>
          </div>
          <span class="acc-order-status ${o.status}">${statusLabelAcc(o.status)}</span>
        </div>
        <div class="acc-order-body">
          ${itemLines || '<div style="font-size:.8rem;color:var(--gray)">Itens não disponíveis</div>'}
        </div>
        <div class="acc-order-foot">
          <div>
            <div class="acc-order-total">Total: R$ ${fmtR(o.total||0)}</div>
            <div style="font-size:.7rem;color:var(--gray);margin-top:2px">${payIcon} ${o.payment_method==='whatsapp'?'Via WhatsApp':o.payment_method==='credit_card'?'Cartão de Crédito':o.payment_method||'—'} · Frete: R$ ${fmtR(o.shipping?.price||0)}</div>
          </div>
          <div style="text-align:right">
            ${o.tracking_code
              ? `<span class="acc-order-track">📍 Rastreio: ${o.tracking_code}</span>`
              : (o.status==='shipped'||o.status==='delivered'?'':'') }
            ${addr ? `<div class="acc-order-addr" style="margin-top:4px">🏠 ${addr}</div>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  function statusLabelAcc(s) {
    return { delivered:'Entregue', shipped:'Enviado', paid:'Pago', pending:'Pendente', cancelled:'Cancelado' }[s] || s;
  }

  async function saveCustomerProfile() {
    const btn = document.getElementById('edit-alert');
    const name    = document.getElementById('edit-name').value.trim();
    const phone   = document.getElementById('edit-phone').value.trim();
    const cep     = document.getElementById('edit-cep').value.trim();
    const state   = document.getElementById('edit-state').value.trim().toUpperCase();
    const city    = document.getElementById('edit-city').value.trim();
    const address = document.getElementById('edit-address').value.trim();
    const newPass = document.getElementById('edit-pass').value;

    if (!name) return showAccAlert('edit', 'Nome não pode ficar em branco.', 'error');

    const updates = { name, phone, cep, state, city, address };
    if (newPass) { if (newPass.length < 6) return showAccAlert('edit', 'Nova senha deve ter pelo menos 6 caracteres.', 'error'); updates.password = newPass; }

    try {
      const token = localStorage.getItem('tf-token') || '';
      await fetch('/api/customer/me', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify(updates) });
    } catch(e) {}

    // Update local data
    currentCustomer = { ...currentCustomer, ...updates };
    localStorage.setItem('tf-customer', JSON.stringify(currentCustomer));
    showAccAlert('edit', '✅ Perfil atualizado com sucesso!', 'success');
    setTimeout(() => { showAccountPanel(); }, 1000);
  }

  function showAccAlert(panel, msg, type) {
    const el = document.getElementById(panel + '-alert');
    if (!el) return;
    el.textContent = msg;
    el.className = 'acc-alert show ' + type;
    setTimeout(() => { el.classList.remove('show'); }, 4000);
  }

  // Preenche endereço pelo CEP no cadastro
  async function fillAccAddress() {
    const cepInput = document.getElementById('reg-cep');
    if (!cepInput) return;
    const raw = cepInput.value.replace(/\D/g,'');
    if (raw.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
      const d = await res.json();
      if (d.erro) return;
      if (d.logradouro) document.getElementById('reg-address').value = d.logradouro;
      if (d.localidade)  document.getElementById('reg-city').value = d.localidade;
      if (d.uf)          document.getElementById('reg-state').value = d.uf.toUpperCase();
    } catch(e) {}
  }

  function maskCepField(inp) {
    let v = inp.value.replace(/\D/g,'').slice(0,8);
    if (v.length > 5) v = v.slice(0,5) + '-' + v.slice(5);
    inp.value = v;
  }

  function maskPhone(inp) {
    let v = inp.value.replace(/\D/g,'').slice(0,11);
    if (v.length > 10) v = '(' + v.slice(0,2) + ') ' + v.slice(2,7) + '-' + v.slice(7);
    else if (v.length > 6) v = '(' + v.slice(0,2) + ') ' + v.slice(2,6) + '-' + v.slice(6);
    else if (v.length > 2) v = '(' + v.slice(0,2) + ') ' + v.slice(2);
    inp.value = v;
  }

  // Preenche formulário de edição com dados atuais
  function switchAccTab(tab) {
    document.querySelectorAll('.acc-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.acc-tab').forEach(t => t.classList.remove('active'));
    const tabs = document.getElementById('accTabs');
    if (tab === 'account' || tab === 'edit') {
      tabs.style.display = 'none';
    } else {
      tabs.style.display = 'flex';
      const activeTab = document.getElementById('tab-' + tab);
      if (activeTab) activeTab.classList.add('active');
    }
    if (tab === 'edit' && currentCustomer) {
      document.getElementById('edit-name').value    = currentCustomer.name || '';
      document.getElementById('edit-phone').value   = currentCustomer.phone || '';
      document.getElementById('edit-cep').value     = currentCustomer.cep || '';
      document.getElementById('edit-state').value   = currentCustomer.state || '';
      document.getElementById('edit-city').value    = currentCustomer.city || '';
      document.getElementById('edit-address').value = currentCustomer.address || '';
      document.getElementById('edit-pass').value    = '';
    }
    // Oculta abas também na tela de recuperação
    if (tab === 'forgot') tabs.style.display = 'none';
    // Limpa campos e alertas ao entrar na tela de recuperação
    if (tab === 'forgot') {
      document.getElementById('forgot-email').value = '';
      document.getElementById('forgot-phone').value = '';
      document.getElementById('forgot-alert').style.display = 'none';
      document.getElementById('forgot-result').style.display = 'none';
      document.getElementById('forgot-result').textContent = '';
    }
    const panel = document.getElementById('panel-' + tab);
    if (panel) panel.classList.add('active');
  }

  async function doForgotPassword() {
    const email  = document.getElementById('forgot-email').value.trim();
    const phone  = document.getElementById('forgot-phone').value.trim();
    const alertEl  = document.getElementById('forgot-alert');
    const resultEl = document.getElementById('forgot-result');
    const btn      = document.getElementById('forgotBtn');
    alertEl.style.display = 'none';
    resultEl.style.display = 'none';
    if (!email) { alertEl.textContent = '⚠️ Informe seu e-mail.'; alertEl.style.display='block'; return; }
    btn.disabled = true; btn.textContent = 'Verificando...';
    try {
      const res  = await fetch('/api/customer/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        alertEl.textContent = '❌ ' + (data.error || 'Erro ao recuperar senha.');
        alertEl.style.display = 'block';
      } else {
        resultEl.innerHTML = `
          <b>✅ Senha temporária gerada, ${data.name.split(' ')[0]}!</b><br><br>
          Sua nova senha temporária é:<br>
          <span style="font-size:1.4rem;font-weight:800;letter-spacing:3px;display:block;margin:8px 0;color:#166534">${data.temp_password}</span>
          <span style="font-size:.78rem">Entre com ela agora e troque em <b>Editar perfil</b>.</span>`;
        resultEl.style.display = 'block';
        btn.textContent = '✅ Senha gerada!';
        setTimeout(() => { switchAccTab('login'); document.getElementById('login-email').value = email; }, 5000);
      }
    } catch(e) {
      alertEl.textContent = '❌ Servidor indisponível. Tente novamente.';
      alertEl.style.display = 'block';
    }
    btn.disabled = false;
    if(btn.textContent === 'Verificando...') btn.textContent = 'Recuperar senha';
  }

  // Verifica se já está logado ao carregar a página
  (function initAccount() {
    const saved = localStorage.getItem('tf-customer');
    if (saved) {
      try { currentCustomer = JSON.parse(saved); updateAccountHeader(); } catch(e) {}
    }
  })();

  // ─── HERO SLIDER ──────────────────────────
  (function() {
    const TOTAL   = document.querySelectorAll('#sliderTrack .slide').length || 2;
    const DELAY   = 5200;
    let current   = 0;
    let timer     = null;
    let dragStart = null;

    const track   = document.getElementById('sliderTrack');
    const fill    = document.getElementById('sliderProgressFill');
    const dots    = document.querySelectorAll('.slider-dot');

    function goTo(idx) {
      current = ((idx % TOTAL) + TOTAL) % TOTAL;
      track.style.transform = `translateX(-${current * 100}%)`;
      dots.forEach((d, i) => d.classList.toggle('active', i === current));
      resetProgress();
    }

    function resetProgress() {
      clearTimeout(timer);
      if (!fill) return;
      fill.style.transition = 'none';
      fill.style.width = '0%';
      // double rAF to force reflow
      requestAnimationFrame(() => requestAnimationFrame(() => {
        fill.style.transition = `width ${DELAY}ms linear`;
        fill.style.width = '100%';
      }));
      timer = setTimeout(() => goTo(current + 1), DELAY);
    }

    // Expõe globalmente para os onclick inline
    window.slideTo   = goTo;
    window.slideMove = dir => goTo(current + dir);

    // Swipe / drag
    const slider = document.getElementById('heroSlider');
    if (slider) {
      slider.addEventListener('mousedown',  e => { dragStart = e.clientX; });
      slider.addEventListener('touchstart', e => { dragStart = e.touches[0].clientX; }, { passive: true });
      slider.addEventListener('mouseup',  e => { if (dragStart !== null && Math.abs(e.clientX - dragStart) > 40) { slideMove(e.clientX < dragStart ? 1 : -1); } dragStart = null; });
      slider.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - dragStart; if (Math.abs(dx) > 40) slideMove(dx < 0 ? 1 : -1); dragStart = null; });
      slider.addEventListener('mouseenter', () => { clearTimeout(timer); fill.style.transition = 'none'; fill.style.width = parseFloat(fill.style.width||0) + '%'; });
      slider.addEventListener('mouseleave', resetProgress);
    }

    resetProgress();
  })();

  // ══════════════════════════════════════════════
  // CHECKOUT MODAL — MULTI-STEP
  // ══════════════════════════════════════════════

  function openCheckout() {
    try { if (typeof fbq==='function') fbq('track','InitiateCheckout'); } catch(e){}
    try { if (typeof ttq!=='undefined') ttq.track('InitiateCheckout'); } catch(e){}
    try { if (typeof gtag==='function') gtag('event','begin_checkout'); } catch(e){}
    if (cart.length === 0) { showToast('❌ Carrinho vazio!'); return; }
    const cust = getLoggedCustomer();
    checkoutData = {
      cep:   '',
      nome:  cust ? cust.name  : '',
      email: cust ? cust.email : '',
      phone: cust ? (cust.phone || '') : '',
      notes: '',
    };
    selectedShipping = null;
    ckFreteOpcoes    = [];
    checkoutStep     = 1;
    // Abre checkout PRIMEIRO (overflow já travado), depois fecha carrinho
    document.getElementById('checkoutOverlay').classList.add('open');
    document.body.classList.add('painel-aberto');
    document.body.style.overflow = 'hidden';
    renderCheckoutStep();
    closeCart(); // seguro: closeCart agora detecta que checkout está aberto e não reseta overflow
    if (window.TFTrack && cart.length > 0) {
      const subtotal = cart.reduce((s, c) => s + c.total, 0);
      TFTrack.beginCheckout({ items: cart, subtotal });
    }
  }

  function closeCheckout() {
    document.getElementById('checkoutOverlay').classList.remove('open');
    document.body.classList.remove('painel-aberto');
    document.body.style.overflow = '';
  }

  function ckGoBack() {
    if (checkoutStep === 1) { closeCheckout(); setTimeout(() => openCart(), 180); return; }
    checkoutStep--;
    renderCheckoutStep();
  }

  // Clicar numa etapa concluída do stepper volta pra ela (só pra trás; nunca pula validação)
  function goToStep(n) {
    if (checkoutStep === 4) return;   // pedido concluído — não navega
    if (n >= checkoutStep) return;    // só permite voltar a etapas já concluídas
    checkoutStep = n;
    renderCheckoutStep();
  }

  function renderCheckoutStep() {
    const titles = { 1: 'Seu Carrinho', 2: 'Dados de Entrega', 3: 'Forma de Pagamento', 4: 'Pedido Enviado! 🎉' };
    const titleEl = document.getElementById('ckTitle');
    const backBtn = document.getElementById('ckBack');
    if (titleEl) titleEl.textContent = titles[checkoutStep] || 'Finalizar Compra';
    if (backBtn) {
      backBtn.style.display = checkoutStep === 4 ? 'none' : '';
      backBtn.textContent   = '← Voltar';
    }
    // Stepper
    for (let i = 1; i <= 4; i++) {
      const s = document.getElementById(`cks-${i}`);
      if (s) {
        s.classList.remove('active', 'done');
        if (i < checkoutStep)      s.classList.add('done');
        else if (i === checkoutStep) s.classList.add('active');
        // Etapas já concluídas (anteriores à atual) ficam clicáveis pra voltar — nunca no passo final
        const canClick = (i < checkoutStep) && (checkoutStep !== 4);
        s.style.cursor = canClick ? 'pointer' : '';
        s.onclick = canClick ? function(){ goToStep(i); } : null;
      }
      if (i < 4) {
        const sep = document.getElementById(`ckSep${i}`);
        if (sep) sep.classList.toggle('done', i < checkoutStep);
      }
    }
    const body   = document.getElementById('ckBody');
    const footer = document.getElementById('ckFooter');
    if (!body || !footer) return;
    if      (checkoutStep === 1) renderCKStep1(body, footer);
    else if (checkoutStep === 2) renderCKStep2(body, footer);
    else if (checkoutStep === 3) renderCKStep3(body, footer);
    else                         renderCKStep4(body, footer);
    body.scrollTop = 0;
  }

  function ckGetTotals() {
    const subtotal = cart.reduce((s, c) => s + c.total, 0);
    const frete    = selectedShipping ? selectedShipping.preco : 0;
    let discount   = 0;
    if (appliedCoupon) {
      discount = appliedCoupon.discount_type === 'percent'
        ? subtotal * appliedCoupon.discount_value / 100
        : Math.min(appliedCoupon.discount_value, subtotal);
      discount = Math.round(discount * 100) / 100;
    }
    return { subtotal, frete, discount, total: Math.max(0, subtotal - discount + frete) };
  }

  // ── Step 1: Carrinho ─────────────────────────
  function renderCKStep1(body, footer) {
    const { subtotal, discount } = ckGetTotals();
    const fmt = n => `R$ ${n.toFixed(2).replace('.', ',')}`;
    const couponSection = appliedCoupon
      ? `<div style="display:flex;align-items:center;justify-content:space-between;background:#DCFCE7;border:1px solid #BBF7D0;border-radius:10px;padding:10px 14px;margin-top:16px">
           <span style="font-size:.82rem;font-weight:700;color:var(--green)">🏷️ Cupom <strong>${escHtml(appliedCoupon.code)}</strong> aplicado!</span>
           <button onclick="removeCoupon()" style="background:none;border:none;color:var(--red);font-size:.78rem;font-weight:600;cursor:pointer">Remover</button>
         </div>`
      : `<div class="ck-section" style="margin-top:16px;margin-bottom:0">
           <div class="ck-section-title">🏷️ Cupom de Desconto</div>
           <div class="ck-coupon-row">
             <input id="ckCouponInput" type="text" placeholder="Código do cupom"
               onkeydown="if(event.key==='Enter')applyCoupon()" />
             <button onclick="applyCoupon()">Aplicar</button>
           </div>
           <div id="ckCouponMsg"></div>
         </div>`;
    body.innerHTML = `
      <div style="background:linear-gradient(135deg,#fff5f5,#fff);border:1px solid #fecaca;border-radius:12px;padding:14px 16px;margin-bottom:18px;display:flex;align-items:center;gap:12px">
        <div style="font-size:2rem;flex-shrink:0">🛒</div>
        <div>
          <div style="font-size:.9rem;font-weight:700;color:var(--black)">Quase lá! Confirme seus itens</div>
          <div style="font-size:.78rem;color:var(--gray);margin-top:2px">Revise o pedido abaixo e clique em <strong>Continuar</strong> para informar os dados de entrega.</div>
        </div>
      </div>
      <div class="ck-section" style="margin-bottom:0">
        <div class="ck-section-title">📦 ${cart.length} produto${cart.length !== 1 ? 's' : ''} no carrinho</div>
        ${cart.map(item => `
          <div class="ck-item">
            <img class="ck-item-img" src="${fixImgPath(escHtml(item.img))}" alt="${escHtml(item.name)}" onerror="this.style.background='#eee'" />
            <div class="ck-item-info">
              <h4>${escHtml(item.name)}</h4>
              <small>${item.packLabel ? item.packLabel + ' · ' : ''}${item.pack} un por pacote</small>
              <span style="display:inline-flex;align-items:center;gap:8px;margin-top:6px">
                <button onclick="changeCartQty('${item.id}',-1); renderCheckoutStep()" aria-label="Diminuir" style="width:24px;height:24px;border:1.5px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-weight:700;line-height:1">−</button>
                <b style="min-width:14px;text-align:center;font-size:.85rem">${item.qty}</b>
                <button onclick="changeCartQty('${item.id}',1); renderCheckoutStep()" aria-label="Aumentar" style="width:24px;height:24px;border:1.5px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-weight:700;line-height:1">+</button>
                <span style="font-size:.72rem;color:var(--gray)">pacote${item.qty !== 1 ? 's' : ''}</span>
              </span>
            </div>
            <div class="ck-item-right">
              <span class="ck-item-price">${fmt(item.total)}</span>
              <button class="ck-item-remove" title="Remover"
                onclick="removeFromCart('${item.id}'); if(cart.length===0) closeCheckout(); else renderCheckoutStep()">🗑</button>
            </div>
          </div>`).join('')}
      </div>
      ${couponSection}`;
    const discLine = appliedCoupon && discount > 0
      ? `<small style="color:var(--green);font-size:.75rem;margin-left:4px">− ${fmt(discount)}</small>`
      : '';
    footer.innerHTML = `
      <div class="ck-footer-subtotal">
        <span>Subtotal ${discLine}</span>
        <strong>${fmt(subtotal - (appliedCoupon ? discount : 0))}</strong>
      </div>
      <button class="ck-btn-next" onclick="checkoutStep=2;renderCheckoutStep()">
        Continuar para Entrega &nbsp;→
      </button>
      <p style="text-align:center;font-size:.72rem;color:var(--gray);margin-top:8px">
        🔒 Compra segura · Dados protegidos
      </p>`;
  }

  // ── Step 2: Entrega ──────────────────────────
  function renderCKStep2(body, footer) {
    const noFrete = cartAllNoFrete();
    if (noFrete && !selectedShipping) {
      selectedShipping = { nome: 'Sem frete', preco: 0, dias: '—' };
    }
    const cepVal = checkoutData.cep
      ? checkoutData.cep.replace(/(\d{5})(\d{3})/, '$1-$2')
      : '';
    const freteOpts = ckFreteOpcoes.length > 0
      ? ckFreteOpcoes.map((o, i) => `
          <div class="ck-frete-opt${selectedShipping && selectedShipping.nome === o.nome ? ' selected' : ''}"
               id="ckfopt-${i}" onclick="ckSelectShipping(${i})">
            <div>
              <div class="fo-name">${o.nome}</div>
              <div class="fo-days">⏱ ${o.dias}</div>
            </div>
            <div class="fo-price">R$ ${o.preco.toFixed(2).replace('.', ',')}</div>
          </div>`).join('')
      : `<div style="font-size:.82rem;color:var(--gray);padding:6px 0">👆 Calcule o frete acima para ver as opções de entrega</div>`;
    body.innerHTML = `
      <div style="background:#EFF8FF;border:1px solid #BAE6FD;border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:.8rem;color:#0369A1">
        ${noFrete ? '✅ Este produto não precisa de frete — preencha seus dados e avance.' : '📍 Informe seus dados e o CEP para calcular o frete. Depois é só escolher a opção de entrega e avançar.'}
      </div>
      <div class="ck-section">
        <div class="ck-section-title">👤 Seus Dados</div>
        <div class="ck-form-group">
          <label>Nome completo <span class="req">*</span></label>
          <input class="ck-input" id="ckNome" type="text" placeholder="Seu nome completo"
            value="${escHtml(checkoutData.nome || '')}" />
        </div>
        <div class="ck-row">
          <div class="ck-form-group">
            <label>E-mail <span class="req">*</span></label>
            <input class="ck-input" id="ckEmail" type="email" placeholder="seu@email.com"
              value="${escHtml(checkoutData.email || '')}" />
          </div>
          <div class="ck-form-group">
            <label>Telefone <span class="req">*</span></label>
            <input class="ck-input" id="ckPhone" type="tel" placeholder="(11) 99999-9999"
              value="${escHtml(checkoutData.phone || '')}" maxlength="15" oninput="maskPhone(this)" />
          </div>
        </div>
        <div class="ck-row">
          <div class="ck-form-group">
            <label>CPF <span class="req">*</span></label>
            <input class="ck-input" id="ckCpf" type="text" placeholder="000.000.000-00"
              maxlength="14" oninput="fmtCpf(this)"
              value="${escHtml(checkoutData.cpf || '')}" />
          </div>
          <div class="ck-form-group">
            <label>Número do endereço <span class="req">*</span></label>
            <input class="ck-input" id="ckAddrNum" type="text" placeholder="Ex: 123"
              value="${escHtml(checkoutData.addrNum || '')}" />
          </div>
        </div>
      </div>
      <div class="ck-section">
        <div class="ck-section-title">🚚 Endereço de Entrega</div>
        <div class="ck-form-group">
          <label>CEP <span class="req">*</span></label>
          <div class="ck-cep-row">
            <input class="ck-input" id="ckCepInput" type="text" placeholder="00000-000" maxlength="9"
              value="${escHtml(cepVal)}"
              oninput="maskCep(this)" onkeydown="if(event.key==='Enter')calcularFrete('checkout')" />
            <button id="ckFreteBtn" onclick="calcularFrete('checkout')">Calcular</button>
          </div>
          <a href="https://buscacepinter.correios.com.br/" target="_blank" rel="noopener"
            style="font-size:.72rem;color:var(--red);text-decoration:underline;margin-top:4px;display:inline-block">
            Não sei meu CEP →
          </a>
        </div>
        <div id="ckFreteOptions">${freteOpts}</div>
      </div>
      <div class="ck-section" style="margin-bottom:4px">
        <div class="ck-form-group">
          <label>Observações (opcional)</label>
          <textarea class="ck-input" id="ckNotes" rows="2"
            placeholder="Número do apartamento, ponto de referência..."
            style="resize:none;min-height:62px">${escHtml(checkoutData.notes || '')}</textarea>
        </div>
      </div>`;
    const ready = selectedShipping !== null;
    footer.innerHTML = `
      <div class="ck-footer-subtotal">
        <span>Frete</span>
        <strong>${noFrete ? 'Grátis' : (ready ? `R$ ${selectedShipping.preco.toFixed(2).replace('.', ',')} · ${selectedShipping.nome}` : '— selecione acima')}</strong>
      </div>
      <button class="ck-btn-next" id="ckStep2Btn" onclick="ckGoStep3()" ${(noFrete || ready) ? '' : 'disabled'}>
        Continuar para Pagamento →
      </button>`;
  }

  function ckSelectShipping(idx) {
    selectedShipping = ckFreteOpcoes[idx];
    document.querySelectorAll('.ck-frete-opt').forEach((el, i) =>
      el.classList.toggle('selected', i === idx));
    const footer = document.getElementById('ckFooter');
    if (footer) footer.innerHTML = `
      <div class="ck-footer-subtotal">
        <span>Frete</span>
        <strong>R$ ${selectedShipping.preco.toFixed(2).replace('.', ',')} · ${selectedShipping.nome}</strong>
      </div>
      <button class="ck-btn-next" onclick="ckGoStep3()">Continuar para Pagamento →</button>`;
  }


  function validarCPF(cpf) {
    const d = cpf.replace(/\D/g, '');
    if (d.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(d)) return false; // todos iguais
    let s = 0;
    for (let i = 0; i < 9; i++) s += parseInt(d[i]) * (10 - i);
    let r = (s * 10) % 11; if (r === 10 || r === 11) r = 0;
    if (r !== parseInt(d[9])) return false;
    s = 0;
    for (let i = 0; i < 10; i++) s += parseInt(d[i]) * (11 - i);
    r = (s * 10) % 11; if (r === 10 || r === 11) r = 0;
    return r === parseInt(d[10]);
  }

  function ckGoStep3() {
    checkoutData.nome    = document.getElementById('ckNome')?.value.trim()       || checkoutData.nome;
    checkoutData.email   = document.getElementById('ckEmail')?.value.trim()      || checkoutData.email;
    checkoutData.phone   = document.getElementById('ckPhone')?.value.trim()      || checkoutData.phone;
    checkoutData.cpf     = document.getElementById('ckCpf')?.value.trim()        || checkoutData.cpf;
    checkoutData.addrNum = document.getElementById('ckAddrNum')?.value.trim()    || checkoutData.addrNum;
    checkoutData.notes   = document.getElementById('ckNotes')?.value.trim()      || '';
    checkoutData.cep     = document.getElementById('ckCepInput')?.value.replace(/\D/g,'') || checkoutData.cep;

    if (!checkoutData.nome)  { showToast('⚠️ Informe seu nome completo'); return; }
    if (!checkoutData.email || !checkoutData.email.includes('@')) {
      showToast('⚠️ Informe um e-mail válido'); return;
    }
    const phoneDigits = (checkoutData.phone || '').replace(/\D/g,'');
    if (phoneDigits.length < 10) {
      showToast('⚠️ Informe seu telefone com DDD'); return;
    }
    const cpfDigits = (checkoutData.cpf || '').replace(/\D/g, '');
    if (!cpfDigits) {
      showToast('⚠️ Preencha o CPF (campo obrigatório para a nota)'); return;
    }
    if (!validarCPF(cpfDigits)) {
      showToast('⚠️ CPF inválido — confira os números digitados'); return;
    }
    if (!cartAllNoFrete()) {
      if (!checkoutData.addrNum) { showToast('⚠️ Informe o número do endereço'); return; }
      if (!checkoutData.cep)     { showToast('⚠️ Informe o CEP para calcular o frete'); return; }
      if (!selectedShipping)     { showToast('⚠️ Selecione uma opção de frete'); return; }
    }
    captureAbandonedCart();
    checkoutStep = 3;
    renderCheckoutStep();
  }

  // ─── Recuperação de carrinho abandonado ───
  // Registra o carrinho assim que o cliente preenche os dados (passo 2 → 3).
  // Se concluir a compra, é marcado como recuperado automaticamente.
  async function captureAbandonedCart() {
    try {
      if (window._abandonedId) return; // já registrado nesta sessão
      const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
      const res = await fetch('/api/admin/abandoned', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:  checkoutData.nome  || '',
          email: checkoutData.email || '',
          phone: checkoutData.phone || '',
          cep:   checkoutData.cep   || '',
          items: cart.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price })),
          total: subtotal,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.id) window._abandonedId = data.id;
    } catch(e) { /* silencioso — não pode atrapalhar o checkout */ }
  }

  function markCartRecovered() {
    try {
      if (!window._abandonedId) return;
      fetch('/api/abandoned-recovered', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: window._abandonedId }),
      }).catch(() => {});
      window._abandonedId = null;
    } catch(e) {}
  }

  // ── Step 3: Pagamento ────────────────────────
  function renderCKStep3(body, footer) {
    const { subtotal, frete, discount, total } = ckGetTotals();
    const fmt = n => `R$ ${n.toFixed(2).replace('.', ',')}`;
    const discRow = appliedCoupon && discount > 0
      ? `<div class="sr discount"><span>🏷️ Desconto (${escHtml(appliedCoupon.code)})</span><span>− ${fmt(discount)}</span></div>`
      : '';
    const itemRows = cart.map(i =>
      `<div class="sr"><span>${escHtml(i.name)} (${i.qty}×)</span><span>${fmt(i.total)}</span></div>`
    ).join('');
    const pixKey   = window._pixConfig && String(window._pixConfig.pix_key || '').trim();
    const pixBlock = pixKey
      ? `<button class="ck-pix-btn" id="ckBtnPIX" onclick="ckPayPix()">
           <span class="pix-logo">
             <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
               <path d="M7.8 20.2l4.4-4.4-4.4-4.4 2.8-2.8 4.4 4.4 4.4-4.4 2.8 2.8-4.4 4.4 4.4 4.4-2.8 2.8-4.4-4.4-4.4 4.4z" fill="white"/>
             </svg>
           </span>
           Pagar com PIX
           <div style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.2">
             <span>Pagar com PIX</span>
             <small style="font-size:.72rem;opacity:.85;font-weight:400">QR Code · Copia e Cola · Instantâneo</small>
           </div>
           <span class="pix-badge">✦ Mais rápido</span>
         </button>`
      : `<div style="background:#F9FAFB;border:1.5px dashed var(--border);border-radius:12px;padding:14px;text-align:center;margin-bottom:10px;font-size:.8rem;color:var(--gray)">
           🟡 PIX não configurado — ative em <strong>Admin → Configurações → PIX</strong>
         </div>`;
    body.innerHTML = `
      <div class="ck-summary">
        <div class="ck-section-title" style="margin-bottom:12px">📋 Resumo do Pedido</div>
        ${itemRows}
        <div class="sr"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
        ${discRow}
        <div class="sr"><span>🚚 Frete · ${escHtml(selectedShipping.nome)}</span><span>${fmt(frete)}</span></div>
        <div class="sr final"><span>Total a pagar</span><span>${fmt(total)}</span></div>
      </div>
      <div class="ck-pay-alert" id="ckPayAlert"></div>
      <div class="ck-section-title" style="margin-bottom:14px">💳 Escolha como pagar</div>
      ${pixBlock}
      <div class="ck-pay-divider">ou</div>
      <button class="ck-pay-card" id="ckBtnCard" onclick="ckShowCardForm()">
        💳 Cartão de Crédito
        <small style="font-size:.74rem;opacity:.85;font-weight:400">&nbsp;em até 12x</small>
      </button>
      <div id="ckCardForm" style="display:none">
        <div class="ck-card-form">
          <label>Nome no cartão</label>
          <input id="cardHolder" type="text" placeholder="Como está impresso no cartão" autocomplete="cc-name" />
          <label>Número do cartão</label>
          <input id="cardNumber" type="text" placeholder="0000 0000 0000 0000" maxlength="19" autocomplete="cc-number" oninput="fmtCardNum(this)" />
          <div class="ck-card-row">
            <div>
              <label>Mês / Ano</label>
              <input id="cardExpiry" type="text" placeholder="MM/AA" maxlength="5" autocomplete="cc-exp" oninput="fmtCardExp(this)" />
            </div>
            <div>
              <label>CVV</label>
              <input id="cardCvv" type="text" placeholder="123" maxlength="4" autocomplete="cc-csc" />
            </div>
          </div>
          <label>CPF do titular</label>
          <input id="cardCpf" type="text" placeholder="000.000.000-00" maxlength="14" oninput="fmtCpf(this)" />
          <label>CEP de cobrança</label>
          <input id="cardCep" type="text" placeholder="00000-000" maxlength="9" oninput="fmtCep(this)" />
          <label>Número do endereço</label>
          <input id="cardAddrNum" type="text" placeholder="Ex: 123" />
          <label>Parcelas</label>
          <select id="cardInstallments">
            <option value="1">1x sem juros</option>
            <option value="2">2x sem juros</option>
            <option value="3">3x sem juros</option>
            <option value="6">6x</option>
            <option value="12">12x</option>
          </select>
        </div>
        <button class="ck-btn-next" id="ckBtnCardPay" onclick="ckPayCard()"
          style="margin-top:12px;background:#1E40AF;box-shadow:0 4px 16px rgba(30,64,175,.3)">
          Pagar com Cartão
        </button>
      </div>
      <div class="ck-pay-divider">ou</div>
      <button class="ck-pay-wa" onclick="ckPayWA()">
        💬 Finalizar pelo WhatsApp
      </button>
      <p style="text-align:center;font-size:.72rem;color:var(--gray);margin-top:12px">
        Ao finalizar, você concorda com nossos termos de compra.
      </p>`;
    footer.innerHTML = '';
  }

  function ckShowCardForm() {
    const form = document.getElementById('ckCardForm');
    const btn  = document.getElementById('ckBtnCard');
    if (!form || !btn) return;
    const open = form.style.display !== 'none';
    form.style.display = open ? 'none' : 'block';
    btn.textContent = open ? '💳 Cartão de Crédito' : '✕ Fechar formulário';
    // Pré-preencher nome e CPF do step 2
    if (!open) {
      const h = document.getElementById('cardHolder');
      if (h && !h.value && checkoutData.nome) h.value = checkoutData.nome;
      const cpfEl = document.getElementById('cardCpf');
      if (cpfEl && !cpfEl.value && checkoutData.cpf) cpfEl.value = checkoutData.cpf;
      const cepEl = document.getElementById('cardCep');
      if (cepEl && !cepEl.value && checkoutData.cep) cepEl.value = checkoutData.cep;
    }
  }

  function fmtCardNum(el) {
    let v = el.value.replace(/\D/g, '').slice(0, 16);
    el.value = v.match(/.{1,4}/g)?.join(' ') || v;
  }
  function fmtCardExp(el) {
    let v = el.value.replace(/\D/g, '').slice(0, 4);
    if (v.length >= 3) v = v.slice(0,2) + '/' + v.slice(2);
    el.value = v;
  }
  function fmtCpf(el) {
    let v = el.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 9) v = v.slice(0,3)+'.'+v.slice(3,6)+'.'+v.slice(6,9)+'-'+v.slice(9);
    else if (v.length > 6) v = v.slice(0,3)+'.'+v.slice(3,6)+'.'+v.slice(6);
    else if (v.length > 3) v = v.slice(0,3)+'.'+v.slice(3);
    el.value = v;
  }
  function fmtCep(el) {
    let v = el.value.replace(/\D/g, '').slice(0, 8);
    if (v.length > 5) v = v.slice(0,5)+'-'+v.slice(5);
    el.value = v;
  }

  async function ckPayCard() {
    const alertEl = document.getElementById('ckPayAlert');
    if (alertEl) alertEl.classList.remove('show');

    const holder   = (document.getElementById('cardHolder')?.value || '').trim();
    const number   = (document.getElementById('cardNumber')?.value || '').replace(/\s/g, '');
    const expiry   = (document.getElementById('cardExpiry')?.value || '');
    const cvv      = (document.getElementById('cardCvv')?.value || '').trim();
    const cpf      = (document.getElementById('cardCpf')?.value || '').replace(/\D/g, '');
    const cep      = (document.getElementById('cardCep')?.value || '').replace(/\D/g, '');
    const addrNum  = (document.getElementById('cardAddrNum')?.value || '').trim();
    const installs = document.getElementById('cardInstallments')?.value || '1';

    if (!holder || number.length < 13 || !expiry || !cvv) {
      if (alertEl) { alertEl.textContent = '⚠️ Preencha todos os dados do cartão.'; alertEl.classList.add('show'); }
      return;
    }
    if (!validarCPF(cpf)) {
      if (alertEl) { alertEl.textContent = '⚠️ CPF inválido — verifique os números.'; alertEl.classList.add('show'); }
      return;
    }
    const [expM, expY] = expiry.split('/');
    if (!expM || !expY) {
      if (alertEl) { alertEl.textContent = '⚠️ Data de validade inválida (MM/AA).'; alertEl.classList.add('show'); }
      return;
    }

    const btn = document.getElementById('ckBtnCardPay');
    if (btn) { btn.textContent = '⏳ Processando...'; btn.disabled = true; }

    // Salva pedido primeiro
    const orderId = await saveOrderToServer('credit_card', 'Aguardando pagamento cartão');
    if (!orderId) {
      if (btn) { btn.textContent = 'Pagar com Cartão'; btn.disabled = false; }
      if (alertEl) { alertEl.textContent = '❌ Erro ao registrar pedido. Tente novamente.'; alertEl.classList.add('show'); }
      return;
    }

    const { total } = ckGetTotals();

    try {
      const res = await fetch('/api/asaas/credit-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          total,
          customer: {
            name:  checkoutData.nome  || holder,
            email: checkoutData.email || '',
            phone: checkoutData.phone || '',
            cpf,
          },
          card: {
            holderName:  holder,
            number,
            expiryMonth: expM,
            expiryYear:  expY.length === 2 ? '20' + expY : expY,
            ccv:         cvv,
          },
          billingAddress: { cep, number: addrNum },
          installments: installs,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao processar cartão');

      // Sucesso — limpar carrinho e mostrar confirmação
      cart = []; appliedCoupon = null; selectedShipping = null;
      saveCartLocal(); renderCart(); renderCartTotals();
      checkoutStep = 4;
      renderCheckoutStep();

    } catch(err) {
      if (alertEl) { alertEl.textContent = '❌ ' + err.message; alertEl.classList.add('show'); }
      if (btn) { btn.textContent = 'Pagar com Cartão'; btn.disabled = false; }
    }
  }

  async function ckPayWA() {
    const { subtotal, frete, discount, total } = ckGetTotals();
    const fmt = n => n.toFixed(2).replace('.', ',');
    await saveOrderToServer('whatsapp',
      `Pedido via WhatsApp${checkoutData.notes ? '. Obs: ' + checkoutData.notes : ''}`);
    let msg = `🛒 *Olá! Quero fazer um pedido na TopFood Embalagens:*\n\n`;
    msg += `*Cliente:* ${checkoutData.nome  || 'Não informado'}\n`;
    msg += `*E-mail:*  ${checkoutData.email || 'Não informado'}\n`;
    if (checkoutData.phone) msg += `*Telefone:* ${checkoutData.phone}\n`;
    msg += `\n*Itens do pedido:*\n`;
    cart.forEach(i => { msg += `• *${i.name}* (${i.packLabel ? i.packLabel + ', ' : ''}${i.pack} un) × ${i.qty} = R$ ${fmt(i.total)}\n`; });
    msg += `\nSubtotal: R$ ${fmt(subtotal)}`;
    if (discount > 0) msg += `\n🏷️ Desconto (${appliedCoupon.code}): − R$ ${fmt(discount)}`;
    msg += `\n🚚 Frete ${selectedShipping.nome}: R$ ${fmt(frete)}`;
    msg += `\n\n💰 *Total: R$ ${fmt(total)}*`;
    if (checkoutData.cep) msg += `\n📦 CEP: ${checkoutData.cep.replace(/(\d{5})(\d{3})/, '$1-$2')}`;
    if (checkoutData.notes) msg += `\n📝 Obs: ${checkoutData.notes}`;
    msg += `\n\nPode confirmar disponibilidade e prazo? Obrigado!`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
    // Limpa carrinho apos envio
    cart = []; saveCartLocal(); appliedCoupon = null; selectedShipping = null;
    checkoutStep = 4;
    renderCheckoutStep();
    renderCart();
    renderCartTotals();
  }

  // ── Step 4: Confirmação ──────────────────────
  function renderCKStep4(body, footer) {
    body.innerHTML = `
      <div class="ck-confirm">
        <div class="ck-confirm-icon">✅</div>
        <h3>Pedido enviado pelo WhatsApp!</h3>
        <p>Sua mensagem com todos os detalhes do pedido foi enviada para o nosso WhatsApp.</p>
        <p>Em breve nossa equipe vai confirmar a disponibilidade e o prazo de entrega. 😊</p>
        <div class="ck-order-num">Aguardando confirmação 📲</div>
        <p style="font-size:.78rem;color:var(--gray)">
          Verifique o WhatsApp e responda caso precisemos de mais informações.
        </p>
      </div>`;
    footer.innerHTML = `
      <button class="ck-btn-next" onclick="closeCheckout()"
        style="background:var(--green);box-shadow:0 4px 16px rgba(22,163,74,0.3)">
        ✓ Fechar
      </button>`;
    const back = document.getElementById('ckBack');
    if (back) back.style.display = 'none';
  }

  // Utilitário: escapa HTML
  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ══════════════════════════════════════════════
  // PIX — Pagamento Direto (EMV / Bacen)
  // ══════════════════════════════════════════════

  /** CRC-16/CCITT-FALSE (polinômio 0x1021, init 0xFFFF) — padrão Bacen PIX */
  function crc16Pix(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  /**
   * Gera o payload EMV do PIX estático (padrão Bacen)
   * @param {string} key    - Chave PIX (CPF/CNPJ/email/telefone/EVP)
   * @param {string} name   - Nome do recebedor (max 25 chars)
   * @param {string} city   - Cidade do recebedor (max 15 chars, sem acento)
   * @param {number} amount - Valor em reais (ex: 129.90)
   * @param {string} txid   - ID da transação (max 25 chars, alphanum)
   * @param {string} desc   - Descrição (opcional, max 72 chars)
   */
  function generatePixPayload(key, name, city, amount, txid, desc) {
    const f = (id, val) => {
      const v = String(val);
      return id + String(v.length).padStart(2, '0') + v;
    };

    // Merchant Account Info (ID 26 = PIX)
    let mai = f('00', 'BR.GOV.BCB.PIX') + f('01', key.trim());
    if (desc) mai += f('02', String(desc).slice(0, 72));

    // Additional Data Field Template (txid para rastreio)
    const safeId  = String(txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
    const addData = f('05', safeId);

    // Monta payload sem CRC
    let p = '';
    p += f('00', '01');                                       // Payload Format Indicator
    p += f('26', mai);                                        // Merchant Account Info
    p += f('52', '0000');                                     // MCC
    p += f('53', '986');                                      // Moeda BRL
    if (amount && amount > 0) p += f('54', amount.toFixed(2)); // Valor
    p += f('58', 'BR');                                       // País
    p += f('59', String(name).slice(0, 25));                  // Nome recebedor
    p += f('60', String(city).slice(0, 15).toUpperCase());    // Cidade
    p += f('62', addData);                                    // Dados adicionais
    p += '6304';                                              // Tag CRC (sem valor)

    return p + crc16Pix(p);
  }

  // ── Variável global para controle do polling ──────────────────
  let _pixPollTimer = null;

  /** Inicia o fluxo PIX no step 3 */
  async function ckPayPix() {
    const cfg = window._pixConfig;
    if (!cfg || !cfg.pix_key) {
      const al = document.getElementById('ckPayAlert');
      if (al) { al.textContent = '⚠️ Chave PIX não configurada. Acesse Admin → Configurações → PIX.'; al.classList.add('show'); }
      return;
    }

    const body   = document.getElementById('ckBody');
    const footer = document.getElementById('ckFooter');
    if (!body || !footer) return;

    const { total } = ckGetTotals();
    const fmt = n => `R$ ${n.toFixed(2).replace('.', ',')}`;

    // Estado de loading enquanto salva pedido e busca QR
    body.innerHTML = `
      <div style="text-align:center;padding:50px 20px">
        <div class="qr-loading">Gerando sua cobrança PIX…</div>
      </div>`;
    footer.innerHTML = '';
    const back = document.getElementById('ckBack');
    if (back) back.style.display = 'none';

    // Salva pedido e captura o order_id
    const orderId = await saveOrderToServer('pix', 'Aguardando pagamento PIX');
    if (!orderId) {
      body.innerHTML = '';
      const al = document.getElementById('ckPayAlert') || body;
      body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--red)">❌ Erro ao registrar pedido. Tente novamente.</div>';
      footer.innerHTML = '<button class="ck-btn-next" onclick="checkoutStep=3;renderCheckoutStep()">← Voltar</button>';
      return;
    }

    // Solicita QR Code ao servidor — tenta Asaas, cai no estático se falhar
    let pixData;
    try {
      const pres = await fetch('/api/pix-charge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          total,
          customerName:  checkoutData.nome,
          customerEmail: checkoutData.email,
          customerPhone: checkoutData.phone,
          customerCpf:   checkoutData.cpf,
        }),
      });
      pixData = await pres.json();
    } catch(e) {
      pixData = {};
    }
    // Garantir fallback para PIX estático se dinâmico falhar
    if (!pixData || (!pixData.brCode && pixData.type !== 'static')) {
      pixData = { type: 'static', pix_key: cfg.pix_key, pix_name: cfg.pix_name, pix_city: cfg.pix_city };
    }

    // Decide payload e origem do QR Code
    let payload, qrImageSrc;
    if (pixData.type === 'dynamic' && pixData.brCode) {
      // PIX Dinâmico (OpenPix) — usa QR gerado pelo gateway
      payload    = pixData.brCode;
      qrImageSrc = pixData.qrCodeImage
        ? `data:image/png;base64,${pixData.qrCodeImage}`
        : `https://api.qrserver.com/v1/create-qr-code/?size=196x196&data=${encodeURIComponent(payload)}&qzone=2&format=png`;
    } else {
      // PIX Estático — gera payload localmente
      const txid = 'TF' + Date.now().toString().slice(-12);
      payload    = generatePixPayload(
        pixData.pix_key || cfg.pix_key,
        pixData.pix_name || cfg.pix_name || 'TopFood',
        pixData.pix_city || cfg.pix_city || 'SAOPAULO',
        total, txid, 'TopFood Embalagens'
      );
      qrImageSrc = `https://api.qrserver.com/v1/create-qr-code/?size=196x196&data=${encodeURIComponent(payload)}&qzone=2&format=png`;
    }

    const isDynamic = pixData.type === 'dynamic';

    // Renderiza tela PIX
    body.innerHTML = `
      <div class="ck-pix-screen">
        <h4>✅ Pedido registrado!</h4>
        ${orderId ? `<div style="font-size:.72rem;color:var(--gray);margin-bottom:4px">Pedido <strong>${orderId}</strong></div>` : ''}
        <div class="pix-total">${fmt(total)}</div>

        <div class="ck-pix-qr" id="pixQrDiv">
          <div class="qr-loading">Carregando QR Code…</div>
        </div>

        <p style="font-size:.75rem;color:var(--gray);margin-bottom:8px">
          ou use o código <strong>Copia e Cola</strong>:
        </p>
        <div class="ck-pix-copy">
          <input id="pixCodeInput" type="text" readonly value="${escHtml(payload)}" />
          <button id="pixCopyBtn" onclick="copyPixCode()">📋 Copiar</button>
        </div>

        <div class="ck-pix-steps">
          <p>📱 Como pagar:</p>
          <ol>
            <li>Abra o app do seu banco</li>
            <li>Acesse <strong>PIX → Pagar</strong></li>
            <li>Escaneie o QR Code <strong>ou</strong> cole o código acima</li>
            <li>Confirme o valor de <strong>${fmt(total)}</strong> para <strong>${escHtml(cfg.pix_name || 'TopFood')}</strong></li>
          </ol>
        </div>

        <div class="pix-timer" id="pixTimerDiv">
          ⏱ Código válido por <strong id="pixTimerVal">30:00</strong>
        </div>

        ${isDynamic && orderId ? `
        <div id="pixStatusPoll" style="margin-top:12px;padding:10px 14px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;font-size:.78rem;color:#166534;text-align:center;display:flex;align-items:center;justify-content:center;gap:8px">
          <span style="width:8px;height:8px;border-radius:50%;background:#16A34A;animation:pixBlink 1.2s infinite;display:inline-block"></span>
          Verificando pagamento automaticamente…
        </div>` : ''}
      </div>

      <div style="margin-top:14px;padding:12px 14px;background:#FFF8E1;border:1px solid #FFE082;border-radius:10px;font-size:.78rem;color:#92400E">
        <strong>⚠️ Importante:</strong> após o pagamento, envie o comprovante pelo
        <a href="https://wa.me/${WHATSAPP_NUMBER}" target="_blank" style="color:#92400E;font-weight:700;text-decoration:underline">WhatsApp</a>
        para confirmarmos seu pedido. 😊
      </div>`;

    footer.innerHTML = `
      <button class="ck-btn-next" id="pixDoneBtn" onclick="ckPixDone()"
        style="background:var(--green);box-shadow:0 4px 16px rgba(22,163,74,.3)">
        ✓ Já paguei — Fechar
      </button>
      <p style="text-align:center;font-size:.72rem;color:var(--gray);margin-top:8px">
        ${isDynamic ? 'Seu pedido será liberado automaticamente após confirmação do pagamento.' : 'Confirmaremos o recebimento em até 5 minutos em horário comercial.'}
      </p>`;

    // Carrega QR Code como imagem
    const qrDiv = document.getElementById('pixQrDiv');
    if (qrDiv) {
      const img = new Image();
      img.alt = 'QR Code PIX';
      img.style.cssText = 'width:196px;height:196px;display:block';
      img.onload = () => { qrDiv.innerHTML = ''; qrDiv.appendChild(img); };
      img.onerror = () => {
        qrDiv.innerHTML = '<p style="font-size:.78rem;color:var(--gray);text-align:center;padding:16px">QR Code indisponível.<br>Use o código Copia e Cola abaixo.</p>';
      };
      img.src = qrImageSrc;
    }

    // Countdown 30 min
    let secs = 30 * 60;
    const _iv = setInterval(() => {
      secs--;
      const el  = document.getElementById('pixTimerVal');
      const div = document.getElementById('pixTimerDiv');
      if (!el) { clearInterval(_iv); return; }
      if (secs <= 0) {
        clearInterval(_iv);
        el.textContent = 'Expirado';
        if (div) div.classList.add('urgent');
        return;
      }
      const m = Math.floor(secs / 60).toString().padStart(2, '0');
      const s = (secs % 60).toString().padStart(2, '0');
      el.textContent = `${m}:${s}`;
      if (secs <= 300 && div) div.classList.add('urgent');
    }, 1000);

    // Inicia polling de status (sempre ativo — funciona com admin manual também)
    if (orderId) startPixPolling(orderId);
  }

  /** Polling automático: verifica a cada 5s se o pedido foi confirmado */
  function startPixPolling(orderId) {
    if (_pixPollTimer) { clearInterval(_pixPollTimer); _pixPollTimer = null; }
    let attempts = 0;
    _pixPollTimer = setInterval(async () => {
      attempts++;
      if (attempts > 360) { clearInterval(_pixPollTimer); _pixPollTimer = null; return; } // 30 min max
      try {
        const r = await fetch(`/api/orders/${orderId}/status`);
        if (!r.ok) return;
        const d = await r.json();
        if (d.status === 'paid') {
          clearInterval(_pixPollTimer);
          _pixPollTimer = null;
          showPixConfirmed(orderId);
        }
      } catch(e) { /* ignora falhas de rede temporárias */ }
    }, 5000);
  }

  /** Exibe tela de pagamento confirmado */
  function showPixConfirmed(orderId) {
    const body   = document.getElementById('ckBody');
    const footer = document.getElementById('ckFooter');
    if (!body) return;
    // Limpa carrinho
    cart = []; appliedCoupon = null; selectedShipping = null;
    saveCartLocal(); renderCart(); renderCartTotals();

    body.innerHTML = `
      <div class="ck-confirm">
        <div class="ck-confirm-icon">💚</div>
        <h3>Pagamento Confirmado! 🎉</h3>
        ${orderId ? `<div class="ck-order-num">Pedido ${escHtml(orderId)}</div>` : ''}
        <p>Seu PIX foi recebido com sucesso!</p>
        <p>Seu pedido foi liberado para separação e envio.</p>
        <p style="font-size:.78rem;color:var(--gray)">
          Em breve você receberá as informações de rastreamento pelo WhatsApp. 😊
        </p>
      </div>`;
    if (footer) footer.innerHTML = `
      <button class="ck-btn-next" onclick="closeCheckout()"
        style="background:var(--green);box-shadow:0 4px 16px rgba(22,163,74,0.3)">
        ✓ Fechar
      </button>`;
    const back = document.getElementById('ckBack');
    if (back) back.style.display = 'none';
    showToast('💚 PIX confirmado! Pedido liberado para envio!');
  }

  /** Copia o código PIX para a área de transferência */
  function copyPixCode() {
    const input = document.getElementById('pixCodeInput');
    const btn   = document.getElementById('pixCopyBtn');
    if (!input) return;
    const code = input.value;

    const onSuccess = () => {
      if (btn) { btn.textContent = '✅ Copiado!'; btn.style.background = '#166534'; }
      showToast('✅ Código PIX copiado!');
      setTimeout(() => { if (btn) { btn.textContent = '📋 Copiar'; btn.style.background = ''; } }, 2500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(onSuccess).catch(() => {
        input.select(); document.execCommand('copy'); onSuccess();
      });
    } else {
      input.select(); document.execCommand('copy'); onSuccess();
    }
  }

  /** Fecha checkout após PIX — limpa carrinho e cancela polling */
  function ckPixDone() {
    if (_pixPollTimer) { clearInterval(_pixPollTimer); _pixPollTimer = null; }
    cart = []; appliedCoupon = null; selectedShipping = null;
    saveCartLocal();
    renderCart();
    renderCartTotals();
    closeCheckout();
    showToast('🟢 Pedido registrado! Aguardamos seu comprovante.');
  }

  // Init — carrega produtos da API e inicializa carrinho
  loadProducts();
  renderCart();
  // Abre carrinho automaticamente se vier de outra pagina com #cart
  if (window.location.hash === '#cart') {
    history.replaceState(null, '', window.location.pathname);
    setTimeout(() => openCart(), 300);
  }
  // Trata retorno do Mercado Pago (?payment=success/failure/pending)
  (function() {
    const params = new URLSearchParams(window.location.search);
    const pay = params.get('payment');
    if (!pay) return;
    history.replaceState(null, '', window.location.pathname);
    const msgs = {
      success: { icon: '✅', title: 'Pagamento aprovado!', text: 'Seu pagamento foi confirmado. Em breve entraremos em contato para confirmar o envio.', color: '#16a34a' },
      failure: { icon: '❌', title: 'Pagamento não aprovado', text: 'Houve um problema com seu pagamento. Tente novamente ou escolha outro método de pagamento.', color: '#dc2626' },
      pending: { icon: '⏳', title: 'Pagamento em análise', text: 'Seu pagamento está sendo processado. Você receberá uma confirmação em breve.', color: '#d97706' },
    };
    const m = msgs[pay];
    if (!m) return;
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    modal.innerHTML = '<div style="background:#fff;border-radius:16px;padding:40px 32px;max-width:420px;width:100%;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,.2)">'
      + '<div style="font-size:3rem;margin-bottom:16px">' + m.icon + '</div>'
      + '<h2 style="font-family:Poppins,sans-serif;font-size:1.4rem;color:#111;margin-bottom:8px">' + m.title + '</h2>'
      + '<p style="color:#6b7280;font-size:.92rem;line-height:1.6;margin-bottom:24px">' + m.text + '</p>'
      + '<button onclick="this.parentElement.parentElement.remove()" style="background:' + m.color + ';color:#fff;border:none;border-radius:8px;padding:12px 32px;font-weight:700;font-size:.95rem;cursor:pointer;width:100%">OK, entendi</button>'
      + '</div>';
    document.body.appendChild(modal);
  })();

/* ════════ bloco seguinte ════════ */

(function() {
  var consent = localStorage.getItem('tf-cookie-consent');
  if (!consent) document.getElementById('cookie-banner').style.display = 'flex';
})();
function setCookieConsent(val) {
  localStorage.setItem('tf-cookie-consent', val);
  document.getElementById('cookie-banner').style.display = 'none';
  if (val === 'granted' && typeof gtag === 'function') {
    gtag('consent', 'update', { ad_storage: 'granted', analytics_storage: 'granted' });
  }
}

  // Newsletter — envia para o servidor e salva no painel admin
  document.getElementById('form-newsletter')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const form  = this;
    const email = form.querySelector('input[type="email"]').value.trim();
    const btn   = form.querySelector('button[type="submit"]');

    btn.disabled    = true;
    btn.textContent = 'Enviando...';

    try {
      const resp = await fetch('/api/newsletter', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, source: 'home_banner' }),
      });
      const data = await resp.json();

      if (resp.ok) {
        const msg = data.duplicate
          ? '&#9989; Você já está cadastrado! Cupom: <strong>' + data.coupon + '</strong>'
          : '&#9989; Cadastro feito! Use o cupom <strong>' + (data.coupon || 'BEMVINDO10') + '</strong> na sua primeira compra.';
        form.innerHTML = '<p style="font-size:1.05rem;font-weight:600;line-height:1.5;">' + msg + '</p>';
      } else {
        btn.disabled    = false;
        btn.textContent = 'Quero meu desconto';
        alert(data.error || 'Erro ao cadastrar. Tente novamente.');
      }
    } catch(err) {
      btn.disabled    = false;
      btn.textContent = 'Quero meu desconto';
      alert('Erro de conexão. Tente novamente.');
    }
  });

/* ════════ bloco seguinte ════════ */

(function(){
  var shown = false;
  var dismissed = sessionStorage.getItem('exitBannerDismissed');
  if (dismissed) return;
  function show() {
    if (shown) return;
    shown = true;
    var el = document.getElementById('exit-banner');
    el.style.display = 'flex';
  }
  document.addEventListener('mouseleave', function(e) {
    if (e.clientY <= 5) show();
  });
  // Mobile: após 30s sem interação
  var mobileTimer = setTimeout(function(){
    if (!shown && window.innerWidth < 768) show();
  }, 30000);
})();
function closeExitBanner() {
  document.getElementById('exit-banner').style.display = 'none';
  sessionStorage.setItem('exitBannerDismissed', '1');
}
function applyExitCoupon() {
  sessionStorage.setItem('exitBannerDismissed', '1');
  // Copia o cupom para a área de transferência
  if (navigator.clipboard) navigator.clipboard.writeText('TOP10').catch(()=>{});
  // Fecha o banner e vai para o carrinho
  document.getElementById('exit-banner').style.display = 'none';
  // Mostra toast com o cupom
  var toast = document.createElement('div');
  toast.innerHTML = '✅ Cupom <strong>TOP10</strong> copiado! Cole no checkout para 10% OFF.';
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#16a34a;color:#fff;padding:14px 22px;border-radius:10px;font-size:14px;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.3);white-space:nowrap;';
  document.body.appendChild(toast);
  setTimeout(function(){ toast.remove(); }, 5000);
  // Rola para os produtos
  var produtos = document.querySelector('#produtos, [id*="product"], .products-section');
  if (produtos) produtos.scrollIntoView({ behavior: 'smooth' });
}