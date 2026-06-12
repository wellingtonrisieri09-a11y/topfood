/**
 * TopFood Embalagens — Marketing Tracking
 * Carrega Meta Pixel + Google Tag Manager dinamicamente via /api/settings
 * Rastreia: PageView, ViewContent, AddToCart, InitiateCheckout, Purchase,
 *           Lead, CompleteRegistration
 * UTM: captura da URL e persiste em sessionStorage para annexar aos pedidos
 */
(function () {
  'use strict';

  /* ── 1. Captura UTM da URL ───────────────────────────────────────── */
  (function captureUTM() {
    const params = new URLSearchParams(location.search);
    const keys   = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'];
    const utm    = {};
    keys.forEach(k => { if (params.get(k)) utm[k] = params.get(k); });

    // Detecta source automática via referrer se não vier por UTM
    if (!utm.utm_source && document.referrer) {
      try {
        const ref = new URL(document.referrer);
        const h = ref.hostname.replace('www.','');
        if (/google|bing|yahoo|duckduckgo/.test(h))      { utm.utm_source = h; utm.utm_medium = 'organic'; }
        else if (/facebook|instagram|fb\.com/.test(h))   { utm.utm_source = h; utm.utm_medium = 'social'; }
        else if (/whatsapp/.test(h))                     { utm.utm_source = 'whatsapp'; utm.utm_medium = 'social'; }
        else if (ref.hostname !== location.hostname)     { utm.utm_source = h; utm.utm_medium = 'referral'; }
      } catch(_) {}
    }

    if (Object.keys(utm).length) {
      // Sobrescreve apenas se vier parâmetros UTM explícitos na URL
      const hasExplicit = ['utm_source','utm_medium','utm_campaign'].some(k => params.get(k));
      if (hasExplicit || !sessionStorage.getItem('tf-utm')) {
        sessionStorage.setItem('tf-utm', JSON.stringify(utm));
      }
    }
  })();

  /* ── 2. Inicializa window.dataLayer antes do GTM ────────────────── */
  window.dataLayer = window.dataLayer || [];

  /* ── 3. Carrega configurações e injeta scripts ───────────────────── */
  fetch('/api/settings')
    .then(r => r.ok ? r.json() : {})
    .then(s => {
      window.__TF_SETTINGS = s;

      // ── GTM ─────────────────────────────────────────────
      if (s.gtm_id && s.gtm_id.startsWith('GTM-')) {
        injectGTM(s.gtm_id);
      }

      // ── Meta Pixel ──────────────────────────────────────
      if (s.meta_pixel_id && /^\d{10,16}$/.test(s.meta_pixel_id)) {
        injectMetaPixel(s.meta_pixel_id);
      }

      // ── Google Ads Remarketing tag (via gtag) ───────────
      if (s.google_ads_id && s.google_ads_id.startsWith('AW-')) {
        injectGoogleAds(s.google_ads_id);
      }

      // ── Dispara PageView manual se pixels já carregados ─
      dispatchPageView();
    })
    .catch(() => {
      // Servidor offline — tracking silencioso
    });

  /* ── 4. Injeta Google Tag Manager ───────────────────────────────── */
  function injectGTM(id) {
    const s = document.createElement('script');
    s.async = true;
    s.src   = `https://www.googletagmanager.com/gtm.js?id=${id}&l=dataLayer`;
    document.head.appendChild(s);
    // noscript fallback
    const ns = document.createElement('noscript');
    const fr = document.createElement('iframe');
    fr.src    = `https://www.googletagmanager.com/ns.html?id=${id}`;
    fr.height = '0'; fr.width = '0';
    fr.style.cssText = 'display:none;visibility:hidden';
    ns.appendChild(fr);
    if (document.body) document.body.insertBefore(ns, document.body.firstChild);
    else document.addEventListener('DOMContentLoaded', () => document.body.insertBefore(ns, document.body.firstChild));
    console.log('%c📊 GTM carregado:', 'color:#4285F4;font-weight:bold', id);
  }

  /* ── 5. Injeta Meta Pixel ────────────────────────────────────────── */
  function injectMetaPixel(pixelId) {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window,document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', pixelId);
    console.log('%c👤 Meta Pixel carregado:', 'color:#1877f2;font-weight:bold', pixelId);
  }

  /* ── 6. Injeta Google Ads (gtag) ─────────────────────────────────── */
  function injectGoogleAds(adsId) {
    const s = document.createElement('script');
    s.async = true;
    s.src   = `https://www.googletagmanager.com/gtag/js?id=${adsId}`;
    document.head.appendChild(s);
    window.gtag = window.gtag || function() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', adsId, { send_page_view: false });
    console.log('%c💰 Google Ads tag carregado:', 'color:#34a853;font-weight:bold', adsId);
  }

  /* ── 7. PageView ─────────────────────────────────────────────────── */
  function dispatchPageView() {
    // GTM dataLayer
    window.dataLayer.push({
      event: 'page_view',
      page_title: document.title,
      page_location: location.href,
      page_path: location.pathname,
    });
    // Meta Pixel
    if (window.fbq) window.fbq('track', 'PageView');
    // Google Ads
    if (window.gtag && window.__TF_SETTINGS?.google_ads_id) {
      window.gtag('event', 'page_view', { send_to: window.__TF_SETTINGS.google_ads_id });
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     API PÚBLICA — window.TFTrack
     Use em qualquer página para disparar eventos de conversão
  ══════════════════════════════════════════════════════════════════ */
  window.TFTrack = {

    /* Retorna UTM armazenado para anexar aos pedidos */
    getUTM() {
      try { return JSON.parse(sessionStorage.getItem('tf-utm') || '{}'); } catch { return {}; }
    },

    /* Visualização de produto */
    viewItem({ id, name, category, price, currency = 'BRL' } = {}) {
      window.dataLayer.push({
        event: 'view_item',
        ecommerce: {
          currency,
          value: parseFloat(price) || 0,
          items: [{ item_id: id, item_name: name, item_category: category, price: parseFloat(price) || 0, quantity: 1 }],
        },
      });
      if (window.fbq) window.fbq('track', 'ViewContent', {
        content_ids: [id], content_name: name, content_category: category,
        value: parseFloat(price) || 0, currency,
      });
    },

    /* Adicionar ao carrinho */
    addToCart({ id, name, category, price, qty = 1, pack = 1, currency = 'BRL' } = {}) {
      const value = parseFloat(price) * qty;
      window.dataLayer.push({
        event: 'add_to_cart',
        ecommerce: {
          currency, value,
          items: [{ item_id: id, item_name: name, item_category: category,
                    price: parseFloat(price), quantity: qty }],
        },
      });
      if (window.fbq) window.fbq('track', 'AddToCart', {
        content_ids: [id], content_name: name,
        value, currency, num_items: qty,
      });
      if (window.ttq) window.ttq.track('AddToCart', {
        content_id: String(id), content_name: name, content_type: 'product',
        value, currency, quantity: qty,
      });
    },

    /* Iniciar checkout */
    beginCheckout({ items = [], subtotal = 0, currency = 'BRL' } = {}) {
      window.dataLayer.push({
        event: 'begin_checkout',
        ecommerce: {
          currency, value: parseFloat(subtotal),
          items: items.map(i => ({
            item_id: i.id, item_name: i.name,
            price: parseFloat(i.price || 0), quantity: i.qty || 1,
          })),
        },
      });
      if (window.fbq) window.fbq('track', 'InitiateCheckout', {
        value: parseFloat(subtotal), currency, num_items: items.length,
        content_ids: items.map(i => i.id),
      });
      if (window.ttq) window.ttq.track('InitiateCheckout', {
        value: parseFloat(subtotal), currency,
        contents: items.map(i => ({ content_id: String(i.id), quantity: i.qty || 1 })),
      });
    },

    /* Compra realizada */
    purchase({ orderId, items = [], subtotal = 0, shipping = 0, discount = 0, coupon = '', currency = 'BRL' } = {}) {
      const revenue = Math.max(0, parseFloat(subtotal) - parseFloat(discount) + parseFloat(shipping));
      window.dataLayer.push({
        event: 'purchase',
        ecommerce: {
          transaction_id: orderId,
          currency, value: revenue,
          tax: 0, shipping: parseFloat(shipping), coupon,
          items: items.map(i => ({
            item_id: i.id, item_name: i.name,
            price: parseFloat(i.price || 0), quantity: i.qty || 1,
          })),
        },
      });
      if (window.fbq) window.fbq('track', 'Purchase', {
        value: revenue, currency,
        content_type: 'product',
        content_ids: items.map(i => i.id),
        num_items: items.length,
      });
      if (window.ttq) window.ttq.track('CompletePayment', {
        value: revenue, currency,
        contents: items.map(i => ({ content_id: String(i.id), quantity: i.qty || 1 })),
      });
      // Google Ads conversion
      const s = window.__TF_SETTINGS || {};
      if (window.gtag && s.google_ads_id && s.google_ads_label) {
        window.gtag('event', 'conversion', {
          send_to: `${s.google_ads_id}/${s.google_ads_label}`,
          value: revenue, currency,
          transaction_id: orderId,
        });
      }
      console.log('%c🛒 Purchase event fired!', 'color:#16a34a;font-weight:bold', orderId, 'R$', revenue.toFixed(2));
    },

    /* Cadastro de cliente */
    completeRegistration({ method = 'email' } = {}) {
      window.dataLayer.push({ event: 'sign_up', method });
      if (window.fbq) window.fbq('track', 'CompleteRegistration', { currency: 'BRL', value: 0 });
    },

    /* Lead (formulário de contato, orçamento) */
    lead({ source = 'contact_form', value = 0, currency = 'BRL' } = {}) {
      window.dataLayer.push({ event: 'generate_lead', currency, value });
      if (window.fbq) window.fbq('track', 'Lead', { value, currency, content_name: source });
    },

    /* Busca */
    search({ term } = {}) {
      window.dataLayer.push({ event: 'search', search_term: term });
    },
  };

})();
