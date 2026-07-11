/* TopFood — JavaScript principal (extraído de admin.html) */
/* ══════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════ */
// Permissões espelhadas do servidor (para UI)
const ROLE_PERMISSIONS = {
  owner:      { pages: ['overview','orders','products','customers','abandoned','reports','adcenter','atendente','insights','campaigns','newsletter','contact','settings','nfe','users'], canDelete: true  },
  admin:      { pages: ['overview','orders','products','customers','abandoned','reports','adcenter','atendente','insights','campaigns','contact','settings','nfe','users'], canDelete: true  },
  socio:      { pages: ['overview','orders','reports','adcenter','campaigns'],                                                                 canDelete: true  },
  secretaria: { pages: ['orders','customers','abandoned','contact'],                                                                canDelete: false },
  designer:   { pages: ['orders'],                                                                                                  canDelete: false },
};
const ROLE_LABELS = { owner:'Proprietário', admin:'Administrador', socio:'Sócio', secretaria:'Secretária', designer:'Designer' };

let STATE = {
  orders: [],
  products: [],
  customers: [],
  settings: {},
  abandoned: [],
  coupons: [],
  contact_messages: [],
  users: [],
  currentPage: 'overview',
  onlineCount: 0,
  charts: {},
  // Auth
  role: 'admin',
  adminName: 'Admin',
  canDelete: true,
};

/* ══════════════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════════════ */
function doLogin() {
  const username = (document.getElementById('login-user')?.value || '').trim();
  const pass     = (document.getElementById('login-pass')?.value || '').trim();
  const err      = document.getElementById('login-error');
  err.style.display = 'none';

  fetch('/api/admin/login', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ username, password: pass })
  }).then(r=>r.json()).then(d=>{
    if(d.ok) {
      sessionStorage.setItem('admin-token', d.token);
      sessionStorage.setItem('admin-role',  d.role  || 'admin');
      sessionStorage.setItem('admin-name',  d.name  || 'Admin');
      enterApp();
    } else {
      err.style.display='block';
      err.textContent = d.error || 'Usuário ou senha incorretos.';
    }
  }).catch(()=>{
    // Fallback demo offline
    if(pass==='topfood2026'||pass==='demo') {
      sessionStorage.setItem('admin-token','demo-token');
      sessionStorage.setItem('admin-role','admin');
      sessionStorage.setItem('admin-name','Admin');
      enterApp();
    } else {
      err.style.display='block';
      err.textContent = 'Servidor offline — use usuário: wellington / senha: topfood2026';
    }
  });
}
function enterApp() {
  document.getElementById('login-wrap').classList.add('hidden');
  document.getElementById('admin-app').classList.remove('hidden');
  initApp();
}
async function doLogout() {
  try { await api('/api/admin/logout', { method:'POST' }); } catch(e) {}
  sessionStorage.clear();
  document.getElementById('admin-app').classList.add('hidden');
  document.getElementById('login-wrap').classList.remove('hidden');
  document.getElementById('login-error').style.display = 'none';
  if(document.getElementById('login-user')) document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}
function togglePass() {
  const inp = document.getElementById('login-pass');
  const icon = document.getElementById('eye-icon');
  if(inp.type==='password'){inp.type='text';icon.className='fa fa-eye-slash';}
  else{inp.type='password';icon.className='fa fa-eye';}
}

/* Aplica restrições visuais baseadas no perfil do usuário logado */
function applyRoleUI() {
  const role     = STATE.role;
  const perms    = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.designer;
  STATE.canDelete = perms.canDelete;

  // Atualiza nome / avatar no sidebar e topbar
  const initials = STATE.adminName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('sb-avatar').textContent = initials;
  document.getElementById('sb-name').textContent   = STATE.adminName;
  document.getElementById('sb-role').textContent   = ROLE_LABELS[role] || role;
  document.getElementById('tb-avatar').textContent = initials;
  document.getElementById('tb-name').textContent   = STATE.adminName;

  // Mostra / oculta itens do menu conforme o perfil
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    const page = el.dataset.page;
    el.style.display = perms.pages.includes(page) ? '' : 'none';
  });

  // Mostra / oculta botões de exclusão de pedidos
  document.querySelectorAll('.btn-delete-order').forEach(btn => {
    btn.style.display = STATE.canDelete ? '' : 'none';
  });
}

/* ══════════════════════════════════════════════════════
   API
══════════════════════════════════════════════════════ */
function token() { return sessionStorage.getItem('admin-token')||''; }
function escapeHtml(str) {
  return String(str==null?'':str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
async function api(path, opts={}) {
  const headers = {'Authorization':'Bearer '+token(),'Content-Type':'application/json',...(opts.headers||{})};
  const r = await fetch(path, {...opts, headers});
  if(!r.ok) throw new Error(r.status);
  return r.json();
}

/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */
async function initApp() {
  // Carrega perfil da sessão
  STATE.role      = sessionStorage.getItem('admin-role') || 'admin';
  STATE.adminName = sessionStorage.getItem('admin-name') || 'Admin';

  await loadAll();
  applyRoleUI();
  startOnlineCounter();

  // Navega para primeira página permitida
  const perms = ROLE_PERMISSIONS[STATE.role] || ROLE_PERMISSIONS.designer;
  const firstPage = perms.pages[0] || 'orders';
  navigate(firstPage);
  updateBadges();
}
// Wrapper que retorna null em vez de lançar erro em recursos restritos (403)
async function apiSafe(path, opts={}) {
  try { return await api(path, opts); } catch(e) {
    if(String(e.message).includes('403')) return null; // sem permissão
    throw e;
  }
}

async function loadAll() {
  try {
    const [orders, products, settings, abandoned, customers, coupons, contact_messages] = await Promise.all([
      apiSafe('/api/admin/orders'), apiSafe('/api/admin/products'),
      apiSafe('/api/admin/settings'), apiSafe('/api/admin/abandoned'),
      apiSafe('/api/admin/customers'), apiSafe('/api/admin/coupons'),
      apiSafe('/api/admin/contact'),
    ]);
    STATE.orders           = orders           || [];
    STATE.products         = products         || [];
    STATE.settings         = settings         || {};
    STATE.abandoned        = abandoned        || [];
    STATE.customers        = customers        || [];
    STATE.coupons          = coupons          || [];
    STATE.contact_messages = contact_messages || [];
    STATE.demoMode  = false;
  } catch(e) {
    // Se token inválido (401) → força novo login
    if(String(e.message).includes('401')) {
      sessionStorage.clear();
      document.getElementById('admin-app').classList.add('hidden');
      document.getElementById('login-wrap').classList.remove('hidden');
      document.getElementById('login-error').style.display = 'block';
      document.getElementById('login-error').textContent = 'Sessão expirada. Faça login novamente.';
      return;
    }
    // Servidor offline → modo demo
    STATE.orders    = DEMO_ORDERS;
    STATE.products  = DEMO_PRODUCTS;
    STATE.settings  = DEMO_SETTINGS;
    STATE.abandoned = DEMO_ABANDONED;
    STATE.demoMode  = true;
    document.getElementById('demo-banner').style.display = 'flex';
    toast('⚠️ Modo demo — servidor não encontrado. Dados reais não serão salvos.', 'info');
  }
}

/* ══════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════ */
const PAGE_TITLES = {
  atendente:'IA Atendente',
  insights:'Inteligência',
  overview:'Visão Geral', orders:'Pedidos', products:'Produtos',
  customers:'Clientes', abandoned:'Carrinhos Abandonados',
  reports:'Relatórios', campaigns:'Campanhas & SEO',
  newsletter:'Newsletter — Leads', contact:'Mensagens de Contato', settings:'Configurações',
  users:'Usuários do Painel'
};
function navigate(page) {
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
  event?.target?.closest('.nav-item')?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el=>{
    if(el.getAttribute('onclick')?.includes("'"+page+"'")) el.classList.add('active');
  });
  const pg = document.getElementById('page-'+page);
  if(pg) pg.classList.add('active');
  document.getElementById('topbar-title').textContent = PAGE_TITLES[page]||page;
  STATE.currentPage = page;
  // lazy init
  if(page==='overview')  renderOverview();
  if(page==='orders')    renderOrders();
  if(page==='products')  renderProducts();
  if(page==='customers') renderCustomers();
  if(page==='abandoned') renderAbandoned();
  if(page==='reports')   renderReports();
  if(page==='adcenter')   loadAdCenter();
  if(page==='atendente')  loadAtendente();
  if(page==='insights')   loadInsights();
    if(page==='campaigns')  loadCampaigns();
  if(page==='newsletter') loadNewsletterLeads();
  if(page==='contact')    loadContactMessages();
  if(page==='settings')   loadSettingsForm();
  if(page==='nfe')        loadNfeConfig();
  if(page==='users')     loadUsers();
}
function refreshPage() { navigate(STATE.currentPage); toast('Dados atualizados!'); }

/* ══════════════════════════════════════════════════════
   OVERVIEW
══════════════════════════════════════════════════════ */
function renderOverview() {
  const total = STATE.orders.filter(o=>o.status!=='cancelled').reduce((s,o)=>s+o.total,0);
  const paid  = STATE.orders.filter(o=>['paid','shipped','delivered'].includes(o.status)).length;
  const customers = uniqueCustomers();
  document.getElementById('kpi-revenue').textContent = 'R$ '+fmt(total);
  document.getElementById('kpi-orders').textContent  = paid;
  document.getElementById('kpi-customers').textContent = customers;
  document.getElementById('kpi-online').textContent  = STATE.onlineCount;
  document.getElementById('chart-total').textContent = 'Total: R$ '+fmt(total);
  renderRecentOrders();
  renderTopProducts();
  renderActivityFeed();
  renderRevenueChart();
  renderStatusChart();
}
function uniqueCustomers() {
  return [...new Set(STATE.orders.filter(o=>o.status!=='cancelled').map(o=>o.customer.email))].length;
}
function renderRecentOrders() {
  const tbody = document.getElementById('recent-orders');
  if(!tbody) return;
  tbody.innerHTML = STATE.orders.slice(0,5).map(o=>`
    <tr>
      <td><b>${o.id}</b></td>
      <td>${o.customer.name}</td>
      <td>R$ ${fmt(o.total)}</td>
      <td><span class="badge ${o.status}">${statusLabel(o.status)}</span></td>
      <td>${fmtDate(o.date)}</td>
    </tr>`).join('');
}
function renderTopProducts() {
  const el = document.getElementById('top-products');
  if(!el) return;
  const sold = {};
  STATE.orders.forEach(o=>o.items.forEach(i=>{
    const k = i.name.split(' ')[2]||i.name.split(' ')[0];
    sold[k] = (sold[k]||0)+i.qty;
  }));
  const prod = STATE.products.map(p=>({...p, soldQty: p.sold||0})).sort((a,b)=>b.soldQty-a.soldQty);
  el.innerHTML = prod.map((p,i)=>`
    <div style="display:flex;align-items:center;gap:10px">
      <div style="font-weight:700;color:var(--muted);font-size:.75rem;width:16px">${i+1}</div>
      <img src="${p.image}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;background:var(--bg)" onerror="this.style.display='none'" />
      <div style="flex:1;overflow:hidden">
        <div style="font-size:.78rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name.split(' — ')[0]}</div>
        <div style="font-size:.7rem;color:var(--muted)">${p.soldQty} vendidos</div>
      </div>
    </div>`).join('');
}
function renderActivityFeed() {
  const el = document.getElementById('activity-feed');
  if(!el) return;
  const acts = [
    ...STATE.orders.slice(0,4).map(o=>({icon:'fa-shopping-bag',color:'var(--green)',text:`<b>${o.customer.name}</b> fez um pedido de R$ ${fmt(o.total)}`,time:o.date})),
    ...STATE.abandoned.slice(0,2).map(a=>({icon:'fa-cart-arrow-down',color:'var(--orange)',text:`Carrinho abandonado — R$ ${fmt(a.total)}`,time:a.date}))
  ].sort((a,b)=>new Date(b.time)-new Date(a.time)).slice(0,6);
  el.innerHTML = acts.map(a=>`
    <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="width:32px;height:32px;border-radius:8px;background:var(--bg);display:flex;align-items:center;justify-content:center;color:${a.color};flex-shrink:0"><i class="fa ${a.icon}"></i></div>
      <div style="flex:1;font-size:.82rem">${a.text}</div>
      <div style="font-size:.72rem;color:var(--muted);white-space:nowrap">${timeAgo(a.time)}</div>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════════
   CHARTS
══════════════════════════════════════════════════════ */
function renderRevenueChart() {
  const ctx = document.getElementById('chart-revenue');
  if(!ctx) return;
  if(STATE.charts.revenue) STATE.charts.revenue.destroy();
  const labels=[],data=[];
  for(let i=29;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    labels.push(d.getDate()+'/'+(d.getMonth()+1));
    const day=d.toISOString().slice(0,10);
    const rev=STATE.orders.filter(o=>o.date.startsWith(day)&&o.status!=='cancelled').reduce((s,o)=>s+o.total,0);
    data.push(rev+(Math.random()*80+20));
  }
  STATE.charts.revenue = new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Receita (R$)',data,borderColor:'#CC0000',backgroundColor:'rgba(204,0,0,.08)',tension:.4,fill:true,pointRadius:0,pointHoverRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:10},maxTicksLimit:8}},y:{grid:{color:'#f1f5f9'},ticks:{font:{size:10},callback:v=>'R$'+v}}}}});
}
function renderStatusChart() {
  const ctx = document.getElementById('chart-status');
  if(!ctx) return;
  if(STATE.charts.status) STATE.charts.status.destroy();
  const cnts = {delivered:0,shipped:0,paid:0,pending:0,cancelled:0};
  STATE.orders.forEach(o=>cnts[o.status]=(cnts[o.status]||0)+1);
  STATE.charts.status = new Chart(ctx,{type:'doughnut',data:{labels:['Entregue','Enviado','Pago','Pendente','Cancelado'],datasets:[{data:[cnts.delivered,cnts.shipped,cnts.paid,cnts.pending,cnts.cancelled],backgroundColor:['#16a34a','#2563eb','#d97706','#94a3b8','#CC0000'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:11},padding:10}}}}});
}
function renderReports() {
  setTimeout(()=>{
    renderMonthlyChart();
    renderPaymentChart();
    renderProductsChart();
    renderStatesChart();
  }, 100);
}
function renderMonthlyChart() {
  const ctx=document.getElementById('chart-monthly');
  if(!ctx||STATE.charts.monthly) return;
  const months=['Jan','Fev','Mar','Abr','Mai','Jun'];
  const data=[1200,1800,2400,1900,3200,2800];
  STATE.charts.monthly=new Chart(ctx,{type:'bar',data:{labels:months,datasets:[{label:'Receita',data,backgroundColor:'rgba(204,0,0,.8)',borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{grid:{color:'#f1f5f9'},ticks:{callback:v=>'R$'+v}}}}});
}
function renderPaymentChart() {
  const ctx=document.getElementById('chart-payment');
  if(!ctx||STATE.charts.payment) return;
  const cnts={pix:0,credit_card:0,boleto:0};
  STATE.orders.forEach(o=>cnts[o.payment_method]=(cnts[o.payment_method]||0)+1);
  STATE.charts.payment=new Chart(ctx,{type:'pie',data:{labels:['Pix','Cartão','Boleto'],datasets:[{data:[cnts.pix,cnts.credit_card,cnts.boleto],backgroundColor:['#16a34a','#2563eb','#d97706'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}});
}
function renderProductsChart() {
  const ctx=document.getElementById('chart-products');
  if(!ctx||STATE.charts.prods) return;
  const labels=STATE.products.map(p=>p.name.split(' ')[2]||p.name.split(' ')[0]);
  const data=STATE.products.map(p=>p.sold||0);
  STATE.charts.prods=new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:'Vendidos',data,backgroundColor:['#CC0000','#2563eb','#16a34a','#d97706'],borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true}}}});
}
function renderStatesChart() {
  const ctx=document.getElementById('chart-states');
  if(!ctx||STATE.charts.states) return;
  const cnts={};
  STATE.orders.forEach(o=>{const s=o.shipping?.state||'?';cnts[s]=(cnts[s]||0)+1;});
  const sorted=Object.entries(cnts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  STATE.charts.states=new Chart(ctx,{type:'bar',data:{labels:sorted.map(s=>s[0]),datasets:[{label:'Pedidos',data:sorted.map(s=>s[1]),backgroundColor:'rgba(37,99,235,.8)',borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{stepSize:1}}}}});
}

/* ══════════════════════════════════════════════════════
   ORDERS
══════════════════════════════════════════════════════ */
function renderOrders(list) {
  const orders = list || STATE.orders;
  const tbody  = document.getElementById('orders-table');
  if(!tbody) return;
  tbody.innerHTML = orders.map(o=>`
    <tr>
      <td><b>${o.id}</b></td>
      <td>${o.customer.name}<br><small style="color:var(--muted)">${o.customer.email}</small></td>
      <td>${o.items.length} ${o.items.length===1?'item':'itens'}</td>
      <td><b>R$ ${fmt(o.total)}</b></td>
      <td>${payLabel(o.payment_method)}</td>
      <td><span class="badge ${o.status}">${statusLabel(o.status)}</span></td>
      <td>${fmtDate(o.date)}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-icon" onclick="viewOrder('${o.id}')" title="Ver detalhes"><i class="fa fa-eye"></i></button>
          <button class="btn btn-ghost btn-icon" onclick="contactWA('${o.customer.phone}','${o.customer.name}','${o.id}')" title="WhatsApp"><i class="fa-brands fa-whatsapp" style="color:#25D366"></i></button>
          <button class="btn btn-ghost btn-icon" onclick="printLabel('${o.id}')" title="Imprimir etiqueta" style="color:var(--orange)"><i class="fa fa-print"></i></button>
          <button class="btn btn-ghost btn-icon btn-delete-order" onclick="deleteOrder('${o.id}')" title="Excluir pedido" style="color:var(--red);${STATE.canDelete?'':'display:none'}"><i class="fa fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--muted)">Nenhum pedido encontrado</td></tr>';
}
function filterOrders() {
  const q   = document.getElementById('order-search')?.value.toLowerCase()||'';
  const st  = document.getElementById('order-status-filter')?.value||'';
  const pay = document.getElementById('order-payment-filter')?.value||'';
  renderOrders(STATE.orders.filter(o=>{
    const txt = (o.id+o.customer.name+o.customer.email).toLowerCase();
    return (!q||txt.includes(q))&&(!st||o.status===st)&&(!pay||o.payment_method===pay);
  }));
}
function viewOrder(id) {
  const o = STATE.orders.find(x=>x.id===id);
  if(!o) return;
  document.getElementById('modal-title').textContent = 'Pedido '+o.id;
  document.getElementById('modal-body').innerHTML = `
    <div class="order-detail-row">
      <div class="detail-item"><label>Cliente</label><p>${o.customer.name}</p></div>
      <div class="detail-item"><label>E-mail</label><p>${o.customer.email}</p></div>
      <div class="detail-item"><label>Telefone</label><p>${o.customer.phone}</p></div>
      <div class="detail-item"><label>Status</label><p><span class="badge ${o.status}">${statusLabel(o.status)}</span></p></div>
      <div class="detail-item"><label>Pagamento</label><p>${payLabel(o.payment_method)}</p></div>
      <div class="detail-item"><label>Data</label><p>${fmtDate(o.date)}</p></div>
    </div>
    <div style="margin-bottom:16px">
      <label style="font-size:.7rem;color:var(--muted);text-transform:uppercase;font-weight:600">Endereço de entrega</label>
      <p style="font-size:.85rem;margin-top:4px">${o.shipping?.address||'—'}, ${o.shipping?.city||''} — ${o.shipping?.state||''} | CEP ${o.shipping?.cep||''}</p>
      <p style="font-size:.78rem;color:var(--muted)">Frete: ${o.shipping?.method||'—'} — R$ ${fmt(o.shipping?.price||0)} | Prazo: ${o.shipping?.days||'—'}</p>
    </div>
    <div style="margin-bottom:16px">
      <label style="font-size:.7rem;color:var(--muted);text-transform:uppercase;font-weight:600;display:block;margin-bottom:8px">Itens do pedido</label>
      ${o.items.map(i=>`
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.83rem">
          <span>${i.name} × ${i.qty}</span>
          <b>R$ ${fmt(i.total)}</b>
        </div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:10px 0 0;font-size:.83rem;color:var(--muted)">
        <span>Subtotal</span><span>R$ ${fmt(o.subtotal)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:.83rem;color:var(--muted)">
        <span>Frete</span><span>R$ ${fmt(o.shipping?.price||0)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0 0;font-size:.95rem;font-weight:700;border-top:1px solid var(--border);margin-top:6px">
        <span>Total</span><span style="color:var(--red)">R$ ${fmt(o.total)}</span>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${(o.payment_method==='pix' && (o.status==='pending'||o.status==='aguardando_pix')) ? `
      <div style="background:#F0FDF4;border:1.5px solid #BBF7D0;border-radius:10px;padding:14px">
        <div style="font-size:.75rem;font-weight:700;color:#15803D;margin-bottom:8px">💚 PIX aguardando confirmação de recebimento</div>
        <button class="btn" style="background:#16A34A;color:#fff;border:none;width:100%;padding:11px;border-radius:8px;font-weight:700;font-size:.9rem" onclick="confirmPix('${o.id}')">
          ✅ Confirmar pagamento PIX recebido
        </button>
        <div style="font-size:.71rem;color:#166534;margin-top:6px;text-align:center">Clique após verificar o recebimento no seu banco</div>
      </div>` : ''}
      ${nfeBox(o)}
      <div>
        <label style="font-size:.7rem;color:var(--muted);text-transform:uppercase;font-weight:600;display:block;margin-bottom:6px">Atualizar status</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${['paid','shipped','delivered','cancelled'].map(s=>`<button class="btn btn-secondary" style="font-size:.75rem" onclick="updateStatus('${o.id}','${s}')">${statusLabel(s)}</button>`).join('')}
        </div>
      </div>
      <div>
        <label style="font-size:.7rem;color:var(--muted);text-transform:uppercase;font-weight:600;display:block;margin-bottom:6px">Código de rastreamento</label>
        <div style="display:flex;gap:8px">
          <input type="text" id="tracking-input" value="${o.tracking_code||''}" placeholder="BR000000000BR" style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:.85rem;outline:none" />
          <button class="btn btn-primary" onclick="saveTracking('${o.id}')">Salvar</button>
        </div>
      </div>
      ${o.notes?`<div style="padding:10px 14px;background:var(--yellow-l);border-radius:8px;font-size:.8rem;color:var(--yellow)"><i class="fa fa-note-sticky"></i> ${o.notes}</div>`:''}
    </div>`;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-wa" onclick="contactWA('${o.customer.phone}','${o.customer.name}','${o.id}')"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>
    <button class="btn btn-secondary" style="background:var(--orange-l);color:var(--orange);border-color:var(--orange)" onclick="printLabel('${o.id}')"><i class="fa fa-print"></i> Imprimir Etiqueta</button>
    ${STATE.canDelete ? `<button class="btn btn-secondary btn-delete-order" style="background:var(--red);color:#fff;border-color:var(--red)" onclick="deleteOrder('${o.id}')"><i class="fa fa-trash"></i> Excluir Pedido</button>` : ''}
    <button class="btn btn-secondary" onclick="closeModal()">Fechar</button>`;
  showModal();
}
function nfeBox(o) {
  const n = o.nfe;
  let inner;
  if (n && n.status === 'autorizado') {
    inner = `<p style="font-size:.78rem;color:#15803D;font-weight:600;margin-bottom:4px">Autorizada - no ${n.numero||''} / serie ${n.serie||'1'}</p>`
      + `<p style="font-size:.64rem;color:var(--muted);word-break:break-all;margin-bottom:8px">${n.chave||''}</p>`
      + `<button class="btn" style="background:#2563EB;color:#fff;border:none;width:100%;padding:10px;border-radius:8px;font-weight:700;font-size:.85rem" onclick="baixarDanfe('${o.id}')">Baixar DANFE (PDF)</button>`;
  } else if (n && (n.status === 'processando_autorizacao' || !n.status)) {
    inner = `<p style="font-size:.8rem;color:#B45309;margin-bottom:8px">Processando autorizacao na SEFAZ...</p>`
      + `<button class="btn btn-secondary" style="width:100%" onclick="pollNfe('${o.id}')">Verificar status</button>`;
  } else if (n && (n.status === 'erro_autorizacao' || n.status === 'cancelado')) {
    inner = `<p style="font-size:.76rem;color:var(--red);margin-bottom:8px">${n.status==='cancelado'?'Cancelada':'Rejeitada'}: ${n.erro||''}</p>`
      + `<button class="btn" style="background:#2563EB;color:#fff;border:none;width:100%;padding:10px;border-radius:8px;font-weight:700" onclick="emitirNF('${o.id}')">Tentar novamente</button>`;
  } else {
    inner = `<button class="btn" style="background:#2563EB;color:#fff;border:none;width:100%;padding:11px;border-radius:8px;font-weight:700;font-size:.9rem" onclick="emitirNF('${o.id}')">Emitir NF-e</button>`
      + `<div style="font-size:.71rem;color:#1E40AF;margin-top:6px;text-align:center">Gera a nota fiscal do pedido na SEFAZ</div>`;
  }
  return `<div style="background:#EFF6FF;border:1.5px solid #BFDBFE;border-radius:10px;padding:14px">`
    + `<div style="font-size:.75rem;font-weight:700;color:#1D4ED8;margin-bottom:8px">Nota Fiscal eletronica</div>${inner}</div>`;
}

async function emitirNF(id) {
  if (!confirm('Emitir NF-e para o pedido ' + id + '? Isso gera a nota fiscal na SEFAZ.')) return;
  toast('Emitindo NF-e... aguarde');
  try {
    const r = await api('/api/eco/nfe/emitir/' + id, { method: 'POST' });
    if (r.ok) {
      toast('NF-e enviada! Aguardando autorizacao...');
      const o = STATE.orders.find(x => x.id === id);
      if (o) o.nfe = { ref: r.ref, status: r.status };
      setTimeout(() => pollNfe(id), 4000);
    } else { toast('Erro: ' + (r.erro || 'falha na emissao'), 'error'); }
  } catch (e) { toast('Erro ao emitir: ' + e.message, 'error'); }
}

async function pollNfe(id) {
  try {
    const r = await api('/api/eco/nfe/status/' + id);
    const d = r.nfe || {};
    const st = d.status;
    const o = STATE.orders.find(x => x.id === id);
    if (o) o.nfe = Object.assign(o.nfe || {}, { status: st, chave: d.chave_nfe, numero: d.numero, serie: d.serie, caminho_danfe: d.caminho_danfe, erro: d.mensagem_sefaz || d.mensagem });
    if (st === 'autorizado') { toast('NF-e autorizada!'); viewOrder(id); }
    else if (st === 'erro_autorizacao' || st === 'cancelado') { toast('NF-e ' + (st==='cancelado'?'cancelada':'rejeitada') + ': ' + (d.mensagem_sefaz||''), 'error'); viewOrder(id); }
    else { toast('Ainda processando... aguarde'); setTimeout(() => pollNfe(id), 6000); }
  } catch (e) { toast('Erro ao consultar NF-e: ' + e.message, 'error'); }
}

async function baixarDanfe(id) {
  toast('Baixando DANFE...');
  try {
    const res = await fetch('/api/eco/nfe/danfe/' + id, { headers: { 'Authorization': 'Bearer ' + token() } });
    if (!res.ok) { toast('DANFE indisponivel ainda', 'error'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'DANFE-' + id + '.pdf';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('DANFE baixado! Abra o arquivo na pasta de downloads.');
  } catch (e) { toast('Erro ao baixar DANFE: ' + e.message, 'error'); }
}

function confirmPix(id) {
  const o = STATE.orders.find(x => x.id === id);
  if (!o) return;
  const now = new Date().toISOString();
  o.status  = 'paid';
  o.paid_at = now;
  api('/api/admin/orders/' + id, { method: 'PUT', body: JSON.stringify({ status: 'paid', paid_at: now }) }).catch(() => {});
  toast('✅ PIX confirmado! Pedido marcado como Pago.');
  closeModal(); renderOrders(); updateBadges();
}
function updateStatus(id, status) {
  const o = STATE.orders.find(x=>x.id===id);
  if(!o) return;
  o.status = status;
  api('/api/admin/orders/'+id,{method:'PUT',body:JSON.stringify({status})}).catch(()=>{});
  toast('Status atualizado: '+statusLabel(status));
  closeModal(); renderOrders(); updateBadges();
}
function saveTracking(id) {
  const code = document.getElementById('tracking-input')?.value||'';
  const o = STATE.orders.find(x=>x.id===id);
  if(o) { o.tracking_code=code; o.status='shipped'; }
  api('/api/admin/orders/'+id,{method:'PUT',body:JSON.stringify({tracking_code:code,status:'shipped'})}).catch(()=>{});
  toast('Rastreamento salvo! Status → Enviado');
  closeModal(); renderOrders(); updateBadges();
}

/* ══════════════════════════════════════════════════════
   DELETE ORDER
══════════════════════════════════════════════════════ */
async function deleteOrder(id) {
  const o = STATE.orders.find(x => x.id === id);
  if (!o) return;

  // Confirmação com dois passos para evitar exclusão acidental
  const confirm1 = confirm(
    `⚠️ Excluir pedido ${o.id}?\n\n` +
    `Cliente: ${o.customer?.name || '—'}\n` +
    `Total: R$ ${fmt(o.total)}\n\n` +
    `Esta ação não pode ser desfeita.`
  );
  if (!confirm1) return;

  closeModal();

  try {
    await api('/api/admin/orders/' + id, { method: 'DELETE' });
  } catch(e) {
    // Remove localmente mesmo se servidor falhar
  }

  STATE.orders = STATE.orders.filter(x => x.id !== id);
  renderOrders();
  updateBadges();
  renderOverview();
  toast('🗑️ Pedido ' + id + ' excluído.', 'info');
}

/* ══════════════════════════════════════════════════════
   USERS MANAGEMENT
══════════════════════════════════════════════════════ */
async function loadUsers() {
  try {
    STATE.users = await api('/api/admin/users');
  } catch(e) {
    STATE.users = [];
    if(String(e.message).includes('403')) {
      toast('Acesso negado. Somente administradores podem gerenciar usuários.', 'error');
      return;
    }
  }
  renderUsers();
}
function renderUsers() {
  const tbody = document.getElementById('users-table');
  if(!tbody) return;
  if(!STATE.users.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--muted)">Nenhum usuário encontrado</td></tr>';
    return;
  }
  tbody.innerHTML = STATE.users.map(u => `
    <tr>
      <td><b>${esc(u.name)}</b></td>
      <td><code style="background:var(--bg);padding:2px 8px;border-radius:5px;font-size:.78rem">${esc(u.username)}</code></td>
      <td><span class="badge ${u.role==='owner'?'red':u.role==='admin'?'red':u.role==='socio'?'purple':u.role==='secretaria'?'blue':'green'}">${ROLE_LABELS[u.role]||u.role}</span></td>
      <td><span class="badge ${u.active?'green':'gray'}">${u.active?'Ativo':'Inativo'}</span></td>
      <td style="color:var(--muted);font-size:.78rem">${u.last_login?fmtDate(u.last_login):'Nunca'}</td>
      <td style="color:var(--muted);font-size:.78rem">${fmtDate(u.created_at)}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-icon" onclick="openUserModal('${u.id}')" title="Editar"><i class="fa fa-pen"></i></button>
          <button class="btn btn-ghost btn-icon" onclick="toggleUserActive('${u.id}',${!u.active})" title="${u.active?'Desativar':'Ativar'}" style="color:${u.active?'var(--orange)':'var(--green)'}">
            <i class="fa fa-${u.active?'ban':'check'}"></i>
          </button>
        </div>
      </td>
    </tr>`).join('');
}
function openUserModal(id) {
  const u = id ? STATE.users.find(x=>x.id===id) : null;
  document.getElementById('modal-title').textContent = u ? 'Editar Usuário' : 'Novo Usuário';
  document.getElementById('modal-body').innerHTML = `
    <div class="form-row"><label>Nome completo</label>
      <input type="text" id="um-name" value="${u?esc(u.name):''}" placeholder="Ex: Maria Silva" /></div>
    <div class="form-row"><label>Nome de usuário (login)</label>
      <input type="text" id="um-username" value="${u?esc(u.username):''}" placeholder="Ex: maria" ${u?'readonly style="background:var(--bg);color:var(--muted)"':''} /></div>
    <div class="form-row"><label>Senha ${u?'(deixe em branco para manter)':''}</label>
      <input type="password" id="um-password" placeholder="${u?'Nova senha (mínimo 6 caracteres)':'Senha inicial (mínimo 6 caracteres)'}" /></div>
    <div class="form-row"><label>Perfil de acesso</label>
      <select id="um-role">
        <option value="admin"      ${u?.role==='admin'?'selected':''}>Administrador — acesso total</option>
        <option value="socio"      ${u?.role==='socio'?'selected':''}>Sócio — visão geral, métricas</option>
        <option value="secretaria" ${u?.role==='secretaria'?'selected':''}>Secretária — pedidos e clientes</option>
        <option value="designer"   ${u?.role==='designer'?'selected':''}>Designer — somente pedidos</option>
      </select>
    </div>
    <div style="padding:10px 14px;background:var(--blue-l);border-radius:8px;font-size:.78rem;color:var(--blue);line-height:1.6" id="um-role-hint"></div>`;
  // Atualiza hint de permissão ao mudar role
  const roleHints = {
    admin:'Acesso total: todas as páginas, pode excluir pedidos e gerenciar usuários.',
    socio:'Visão geral, pedidos, relatórios e campanhas. Pode excluir pedidos. Sem acesso a configurações.',
    secretaria:'Pedidos, clientes, carrinhos abandonados e mensagens. Não pode excluir pedidos.',
    designer:'Acesso apenas à página de pedidos (consulta). Sem exclusão.',
  };
  const updateHint = () => {
    const r = document.getElementById('um-role')?.value||'admin';
    const h = document.getElementById('um-role-hint');
    if(h) h.textContent = '🔐 ' + (roleHints[r]||'');
  };
  setTimeout(()=>{ document.getElementById('um-role')?.addEventListener('change',updateHint); updateHint(); }, 50);

  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="saveUser(${u?`'${u.id}'`:'null'})"><i class="fa fa-save"></i> Salvar</button>`;
  showModal();
}
async function saveUser(id) {
  const name     = document.getElementById('um-name')?.value.trim()||'';
  const username = document.getElementById('um-username')?.value.trim()||'';
  const password = document.getElementById('um-password')?.value||'';
  const role     = document.getElementById('um-role')?.value||'designer';

  if(!name) return toast('Informe o nome completo.','error');
  if(!id && !username) return toast('Informe o nome de usuário.','error');
  if(!id && password.length < 6) return toast('Senha deve ter ao menos 6 caracteres.','error');
  if(id && password && password.length < 6) return toast('Senha deve ter ao menos 6 caracteres.','error');

  try {
    if(id) {
      const body = { name, role };
      if(password) body.password = password;
      await api('/api/admin/users/'+id, { method:'PUT', body:JSON.stringify(body) });
      toast('Usuário atualizado!');
    } else {
      await api('/api/admin/users', { method:'POST', body:JSON.stringify({ name, username, password, role }) });
      toast('Usuário criado com sucesso!');
    }
    closeModal();
    await loadUsers();
  } catch(e) {
    if(String(e.message).includes('409')) toast('Nome de usuário já existe.','error');
    else toast('Erro ao salvar usuário.','error');
  }
}
async function toggleUserActive(id, active) {
  const u = STATE.users.find(x=>x.id===id);
  if(!u) return;
  const action = active ? 'ativar' : 'desativar';
  if(!confirm(`${active?'Ativar':'Desativar'} o usuário ${u.name}?`)) return;
  try {
    await api('/api/admin/users/'+id, { method:'PUT', body:JSON.stringify({ active }) });
    toast(`Usuário ${active?'ativado':'desativado'}.`);
    await loadUsers();
  } catch(e) {
    toast('Erro: '+e.message,'error');
  }
}

/* ══════════════════════════════════════════════════════
   PRINT LABEL — Etiqueta de Envio Correios
══════════════════════════════════════════════════════ */
function printLabel(id) {
  const o = STATE.orders.find(x => x.id === id);
  if (!o) return;

  const s  = STATE.settings || {};
  const storeName    = s.store_name    || 'TopFood Embalagens';
  const storePhone   = s.whatsapp      ? s.whatsapp.replace(/^55/,'').replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3') : '(11) 98885-6367';
  const storeAddress = s.store_address || 'Santo André — SP';
  const storeCEP     = s.store_cep     || '';

  const cust     = o.customer  || {};
  const ship     = o.shipping  || {};
  const dateStr  = new Date(o.date).toLocaleDateString('pt-BR');
  const tracking = o.tracking_code || '';
  const method   = ship.method || o.payment_method === 'whatsapp' ? (ship.method || 'A DEFINIR') : (ship.method || 'A DEFINIR');

  // Itens formatados
  const itemsHTML = o.items.map(i =>
    `<tr>
      <td style="padding:2px 4px;font-size:9px;border-bottom:1px dashed #ccc">${i.name || i.id}</td>
      <td style="padding:4px 6px;font-size:11px;text-align:center;border-bottom:1px dashed #ccc">${i.qty}</td>
      <td style="padding:4px 6px;font-size:11px;text-align:right;border-bottom:1px dashed #ccc">R$ ${fmt(i.total)}</td>
    </tr>`
  ).join('');

  // Desconto
  const discountRow = o.discount > 0 ? `
    <tr>
      <td colspan="2" style="padding:3px 6px;font-size:10px;color:#555">Desconto (${o.coupon_code || 'cupom'})</td>
      <td style="padding:3px 6px;font-size:10px;text-align:right;color:#cc0000">- R$ ${fmt(o.discount)}</td>
    </tr>` : '';

  const labelHTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Etiqueta — ${o.id}</title>
  <style>
    @page { size: 100mm 150mm; margin: 4mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: #111; }

    .label {
      width: 92mm; min-height: 142mm;
      border: 2.5px solid #111;
      border-radius: 6px;
      display: grid;
      grid-template-rows: auto auto 1fr auto auto;
      overflow: hidden;
      page-break-inside: avoid;
    }

    /* ── CABEÇALHO ── */
    .label-header {
      background: #CC0000;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 8px;
      gap: 6px;
    }
    .label-header .brand {
      font-size: 13px;
      font-weight: 900;
      letter-spacing: -.3px;
      white-space: nowrap;
    }
    .label-header .brand span { color: #FFD700; }
    .label-header .order-num {
      font-size: 11px;
      font-weight: 700;
      background: rgba(0,0,0,.25);
      padding: 2px 7px;
      border-radius: 20px;
      letter-spacing: .5px;
      white-space: nowrap;
    }
    .label-header .date-info {
      font-size: 8px;
      text-align: right;
      opacity: .9;
      white-space: nowrap;
    }

    /* ── MÉTODO ── */
    .label-method {
      background: #1C1C1C;
      color: #fff;
      text-align: center;
      font-size: 9px;
      font-weight: 700;
      padding: 2px 0;
      text-transform: uppercase;
      letter-spacing: 1.5px;
    }
    .label-method span {
      background: #FFD700;
      color: #111;
      padding: 1px 6px;
      border-radius: 2px;
      margin-left: 4px;
    }

    /* ── ENDEREÇOS ── */
    .label-addresses {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
    }
    .addr-box {
      padding: 6px 8px;
      border-right: 1.5px solid #111;
    }
    .addr-box:last-child { border-right: none; }
    .addr-label {
      font-size: 7px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #CC0000;
      border-bottom: 1px solid #eee;
      padding-bottom: 3px;
      margin-bottom: 4px;
    }
    .addr-name {
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 2px;
      line-height: 1.2;
    }
    .addr-line {
      font-size: 9px;
      color: #333;
      line-height: 1.45;
    }
    .addr-cep {
      font-size: 10px;
      font-weight: 700;
      margin-top: 3px;
      color: #111;
      letter-spacing: 1px;
    }

    /* ── ITENS ── */
    .label-items {
      padding: 5px 8px;
      border-top: 1.5px solid #111;
    }
    .items-title {
      font-size: 7px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #CC0000;
      margin-bottom: 4px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
    }
    .items-table thead th {
      font-size: 7px;
      font-weight: 700;
      text-transform: uppercase;
      color: #555;
      padding: 2px 4px;
      border-bottom: 1px solid #111;
    }
    .items-total td {
      padding: 3px 4px;
      font-size: 10px;
      font-weight: 700;
      border-top: 1.5px solid #111;
    }

    /* ── RASTREAMENTO ── */
    .label-tracking {
      background: #f8f8f8;
      border-top: 1.5px solid #111;
      padding: 5px 8px;
    }
    .tracking-label {
      font-size: 7px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #CC0000;
      display: block;
      margin-bottom: 3px;
    }
    .tracking-code {
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 2px;
      color: #111;
      font-family: 'Courier New', monospace;
      display: block;
      margin-bottom: 4px;
    }
    .tracking-empty {
      font-size: 9px;
      color: #999;
      font-style: italic;
    }
    .barcode-placeholder {
      display: block;
      width: 100%;
      height: 18px;
      background: repeating-linear-gradient(
        to right,
        #111 0px, #111 2px, #fff 2px, #fff 4px,
        #111 4px, #111 6px, #fff 6px, #fff 8px,
        #111 8px, #111 11px, #fff 11px, #fff 13px,
        #111 13px, #111 14px, #fff 14px, #fff 16px
      );
      border-radius: 1px;
    }
    .barcode-num {
      font-size: 8px;
      font-family: monospace;
      color: #555;
      margin-top: 1px;
      letter-spacing: 1.5px;
      text-align: center;
      display: block;
    }

    /* ── RODAPÉ ── */
    .label-footer {
      background: #CC0000;
      color: rgba(255,255,255,.85);
      font-size: 7px;
      text-align: center;
      padding: 3px 4px;
      letter-spacing: .3px;
    }

    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>

<!-- ── BOTÃO IMPRIMIR (não aparece na impressão) ── -->
<div class="no-print" style="text-align:center;padding:12px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;margin-bottom:10px;font-family:Arial">
  <button onclick="window.print()" style="background:#CC0000;color:#fff;border:none;padding:9px 24px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;margin-right:8px">
    🖨️ Imprimir Etiqueta
  </button>
  <button onclick="window.close()" style="background:#e2e8f0;color:#111;border:none;padding:9px 18px;border-radius:8px;font-size:12px;cursor:pointer">
    ✕ Fechar
  </button>
  <p style="margin-top:6px;font-size:10px;color:#6b7280">Tamanho: <b>10 × 15 cm</b> — etiqueta padrão Correios · Cole no pacote após imprimir</p>
</div>

<!-- ════════════════════════════════════════
     ETIQUETA PRINCIPAL
════════════════════════════════════════ -->
<div class="label">

  <!-- CABEÇALHO -->
  <div class="label-header">
    <div class="brand">Top<span>Food</span> Embalagens</div>
    <div class="order-num">${o.id}</div>
    <div class="date-info">${dateStr}<br>${new Date(o.date).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
  </div>

  <!-- MÉTODO DE ENVIO -->
  <div class="label-method">
    📦 Envio via Correios <span>${method}</span>
    ${ship.days ? `&nbsp;·&nbsp;Prazo: ${ship.days}` : ''}
  </div>

  <!-- ENDEREÇOS -->
  <div class="label-addresses">

    <!-- REMETENTE -->
    <div class="addr-box">
      <div class="addr-label">✉ Remetente</div>
      <div class="addr-name">${storeName}</div>
      <div class="addr-line">${storeAddress}</div>
      ${storeCEP ? `<div class="addr-cep">CEP: ${storeCEP}</div>` : ''}
      <div class="addr-line" style="margin-top:4px">📱 ${storePhone}</div>
    </div>

    <!-- DESTINATÁRIO -->
    <div class="addr-box">
      <div class="addr-label">📍 Destinatário</div>
      <div class="addr-name">${cust.name || '—'}</div>
      ${ship.address ? `<div class="addr-line">${ship.address}</div>` : ''}
      ${ship.city ? `<div class="addr-line">${ship.city}${ship.state ? ' — ' + ship.state : ''}</div>` : ''}
      <div class="addr-cep">CEP: ${ship.cep || '___________'}</div>
      ${cust.phone ? `<div class="addr-line" style="margin-top:4px">📱 ${cust.phone}</div>` : ''}
    </div>

  </div>

  <!-- ITENS -->
  <div class="label-items">
    <div class="items-title">🛒 Conteúdo do Pedido</div>
    <table class="items-table">
      <thead>
        <tr>
          <th style="text-align:left">Produto</th>
          <th style="text-align:center">Qtd</th>
          <th style="text-align:right">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
      </tbody>
      <tfoot>
        ${discountRow}
        ${(ship.price||0) > 0 ? `
        <tr>
          <td colspan="2" style="padding:3px 6px;font-size:10px;color:#555">Frete (${method})</td>
          <td style="padding:3px 6px;font-size:10px;text-align:right">R$ ${fmt(ship.price||0)}</td>
        </tr>` : ''}
        <tr class="items-total">
          <td colspan="2" style="font-size:12px;font-weight:700">TOTAL</td>
          <td style="text-align:right;color:#CC0000;font-size:14px">R$ ${fmt(o.total)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- RASTREAMENTO -->
  <div class="label-tracking">
    <div class="tracking-info">
      <span class="tracking-label">📍 Código de Rastreamento</span>
      ${tracking
        ? `<div class="tracking-code">${tracking}</div>`
        : `<div class="tracking-empty">A preencher após postagem</div>`
      }
    </div>
    <div class="barcode-area">
      ${tracking ? `
        <div class="barcode-placeholder"></div>
        <span class="barcode-num">${tracking}</span>
      ` : `
        <div style="width:90mm;height:24px;border:1px dashed #bbb;border-radius:3px;display:flex;align-items:center;justify-content:center">
          <span style="font-size:9px;color:#bbb">código de barras após postagem</span>
        </div>
      `}
    </div>
  </div>

  <!-- RODAPÉ -->
  <div class="label-footer">
    TopFood Embalagens · topfoodembalagens.com.br · ${storePhone}
    &nbsp;|&nbsp; Não recusável — Mercadoria frágil, manusear com cuidado
  </div>

</div>


</body>
</html>`;

  // mostra a etiqueta num overlay DENTRO do painel (nao abre janela/aba = nada pra bloquear).
  let _ov = document.getElementById('tf-label-overlay');
  if (_ov) _ov.remove();
  _ov = document.createElement('div');
  _ov.id = 'tf-label-overlay';
  _ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.65);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:18px;overflow:auto';
  _ov.innerHTML =
    '<div style="display:flex;gap:10px;margin-bottom:12px">'
    + '<button id="tf-lbl-print" style="background:#CC0000;color:#fff;border:none;padding:11px 26px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer">Imprimir etiqueta</button>'
    + '<button id="tf-lbl-close" style="background:#fff;color:#111;border:none;padding:11px 26px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer">Fechar</button>'
    + '</div>'
    + '<iframe id="tf-lbl-frame" style="width:100mm;height:150mm;max-width:96vw;background:#fff;border:0;border-radius:4px;box-shadow:0 8px 30px rgba(0,0,0,.4)"></iframe>';
  document.body.appendChild(_ov);
  const _fr = document.getElementById('tf-lbl-frame');
  const _fd = _fr.contentWindow.document;
  _fd.open(); _fd.write(labelHTML); _fd.close();
  document.getElementById('tf-lbl-print').onclick = function(){ try { _fr.contentWindow.focus(); _fr.contentWindow.print(); } catch (e) { toast('Nao foi possivel imprimir: ' + e.message, 'error'); } };
  document.getElementById('tf-lbl-close').onclick = function(){ _ov.remove(); };
  _ov.addEventListener('click', function(e){ if (e.target === _ov) _ov.remove(); });
}

/* ══════════════════════════════════════════════════════
   PRODUCTS
══════════════════════════════════════════════════════ */
function stockBadge(stock) {
  const n = stock ?? 0;
  if(n <= 0)  return '<span class="badge red">⚠️ Sem estoque</span>';
  if(n < 50)  return '<span class="badge red">🔴 Estoque baixo</span>';
  if(n < 150) return '<span class="badge yellow">🟡 Estoque médio</span>';
  return '<span class="badge green">🟢 Em estoque</span>';
}
function renderProducts() {
  const grid = document.getElementById('products-grid');
  if(!grid) return;
  grid.innerHTML = STATE.products.map(p=>`
    <div class="product-card">
      <img class="product-card-img" src="${p.image}" alt="${p.name}" onerror="this.style.background='var(--bg)'" />
      <div class="product-card-body">
        ${p.badge?`<span class="badge ${p.badgeColor||'gray'}" style="margin-bottom:6px">${p.badge}</span>`:''}
        <div class="product-card-name">${p.name}</div>
        <div class="product-card-cat">${p.sold||0} vendidos</div>
        <div class="product-card-prices">
          ${p.variants.map(v=>{
            const custo = parseFloat(v.cost)||0;
            if(!custo) return `<div class="product-card-price">${v.units} un: <b>R$ ${fmt(v.price)}</b></div>`;
            const margemPct = v.price ? (((v.price-custo)/v.price)*100) : 0;
            const cor = margemPct>=30 ? 'var(--green)' : (margemPct>=10 ? 'var(--yellow)' : 'var(--red)');
            return `<div class="product-card-price">${v.units} un: <b>R$ ${fmt(v.price)}</b> · custo R$ ${fmt(custo)} · <b style="color:${cor}">${margemPct.toFixed(0)}% margem</b></div>`;
          }).join('')}
        </div>
        <div style="margin-bottom:10px">
          ${stockBadge(p.stock)}
          <span style="font-size:.72rem;color:var(--muted);margin-left:6px">📦 ${p.stock??'—'} un em estoque</span>
        </div>
        <div class="product-card-footer">
          <div class="product-toggle">
            <div class="toggle ${p.active?'on':''}" onclick="toggleProduct('${p.id}',this)"></div>
            <span>${p.active?'Ativo':'Inativo'}</span>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-secondary" onclick="editProduct('${p.id}')" style="font-size:.75rem;padding:6px 12px"><i class="fa fa-pen"></i> Editar</button>
            <button class="btn btn-secondary" onclick="deleteProduct('${p.id}')" style="font-size:.75rem;padding:6px 10px;color:var(--red);border-color:var(--red)" title="Excluir produto"><i class="fa fa-trash"></i></button>
          </div>
        </div>
      </div>
    </div>`).join('');
}
async function toggleProduct(id, el) {
  const p = STATE.products.find(x=>x.id===id);
  if(!p) return;
  p.active = !p.active;
  el.classList.toggle('on', p.active);
  el.nextElementSibling.textContent = p.active?'Ativo':'Inativo';
  try {
    await api('/api/admin/products/'+id,{method:'PUT',body:JSON.stringify({active:p.active})});
    toast(p.active?'✅ Produto ativado!':'Produto desativado!');
  } catch(e) {
    // Reverte UI em caso de erro
    p.active = !p.active;
    el.classList.toggle('on', p.active);
    el.nextElementSibling.textContent = p.active?'Ativo':'Inativo';
    toast('❌ Erro ao atualizar produto.', 'error');
  }
}
function editProduct(id) {
  const p = STATE.products.find(x=>x.id===id);
  if(!p) return;
  _variantCount = (p.variants||[]).length;
  document.getElementById('modal-title').textContent = '✏️ Editar: '+p.name.split(' — ')[0];
  document.getElementById('modal-body').innerHTML = buildProductForm(p);
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="saveProduct('${id}')"><i class="fa fa-save"></i> Salvar produto</button>`;
  initImgManager(p.images && p.images.length ? p.images : (p.image ? [p.image] : []));
  initVideoManager(p.videos || []);
  showModal();
}
async function saveProduct(id) {
  const p = STATE.products.find(x=>x.id===id);
  if(!p) return;

  const data = readProductFromForm(p.variants);
  if(!data.name) return toast('Informe o nome do produto.', 'error');
  if(!data.variants.length) return toast('Adicione ao menos um pacote de preço.', 'error');

  // Atualiza objeto local imediatamente
  Object.assign(p, data);

  const saveBtn = document.querySelector('#modal-footer .btn-primary');
  if(saveBtn){ saveBtn.disabled=true; saveBtn.innerHTML='<i class="fa fa-spinner fa-spin"></i> Salvando...'; }

  try {
    await api('/api/admin/products/'+id, { method:'PUT', body:JSON.stringify(p) });
    closeModal();
    renderProducts();
    toast('✅ Produto atualizado com sucesso!');
  } catch(e) {
    if(saveBtn){ saveBtn.disabled=false; saveBtn.innerHTML='<i class="fa fa-save"></i> Salvar produto'; }
    if(String(e.message).includes('401')) {
      toast('⚠️ Sessão expirada. Faça login novamente.', 'error');
      setTimeout(()=>{ sessionStorage.clear(); location.reload(); }, 2000);
    } else {
      toast('❌ Erro ao salvar: servidor indisponível.', 'error');
    }
  }
}

// Recarrega produtos do servidor e re-renderiza
async function loadProducts() {
  try {
    const products = await api('/api/admin/products');
    STATE.products = products;
    renderProducts();
    toast('Produtos atualizados!');
  } catch(e) {
    toast('❌ Não foi possível recarregar produtos.', 'error');
  }
}

/* ══════════════════════════════════════════════════════
   NOVO PRODUTO — Cria produto do zero
══════════════════════════════════════════════════════ */
// Número de variantes no modal (controlado dinamicamente)
let _variantCount = 3;

function newProductModal() {
  _variantCount = 3;
  document.getElementById('modal-title').textContent = '➕ Novo Produto';
  document.getElementById('modal-body').innerHTML = buildProductForm(null);
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-primary" onclick="saveNewProduct()"><i class="fa fa-save"></i> Criar Produto</button>`;
  initImgManager([]);
  initVideoManager([]);
  // Inicia hint de variantes
  setTimeout(() => syncVariantHints(), 50);
  showModal();
}

function buildProductForm(p) {
  // p === null → novo produto; p === objeto → edição (reutiliza o mesmo HTML)
  const isNew = !p;
  const featsVal = p ? (p.features||[]).join('\n') : '';
  const specsVal = p ? (p.specs||[]).map(s=>`${s.label}: ${s.value}`).join('\n') : '';
  const variants = p ? p.variants : [
    {units:50, price:0, cost:0},
    {units:100, price:0, cost:0},
    {units:250, price:0, cost:0}
  ];
  _variantCount = variants.length;

  const variantsHTML = variants.map((v,i) => variantRow(i, v.units, v.price, v.cost)).join('');

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="form-row">
        <label>Nome do produto <span style="color:var(--red)">*</span></label>
        <input id="ep-name" type="text" value="${p?esc(p.name):''}" placeholder="Ex: Embalagem de Hambúrguer" />
      </div>
      <div class="form-row">
        <label>Categoria</label>
        <input id="ep-category" type="text" value="${p?esc(p.category):''}" placeholder="Ex: hamburguer" list="cat-list" />
        <datalist id="cat-list">
          <option value="pastel"><option value="hamburguer"><option value="churros">
          <option value="batata"><option value="outros">
        </datalist>
      </div>
    </div>
    <div class="form-row">
      <label>Descrição curta <span style="font-weight:400;color:var(--muted)">(aparece nos cards da loja)</span></label>
      <textarea id="ep-desc" rows="2" placeholder="Frase de impacto sobre o produto...">${p?esc(p.description):''}</textarea>
    </div>
    <div class="form-row">
      <label>Descrição completa <span style="font-weight:400;color:var(--muted)">(página do produto)</span></label>
      <textarea id="ep-longdesc" rows="4" placeholder="Detalhes completos, benefícios, história do produto...">${p?esc(p.long_description||''):''}</textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="form-row">
        <label>Badge <span style="font-weight:400;color:var(--muted)">(ex: MAIS VENDIDO)</span></label>
        <input id="ep-badge" type="text" value="${p?esc(p.badge||''):''}" placeholder="MAIS VENDIDO" />
      </div>
      <div class="form-row">
        <label>Cor do badge</label>
        <select id="ep-badgeColor">
          ${['','green','blue','orange','red','yellow'].map(c=>`<option value="${c}" ${p?.badgeColor===c?'selected':''}>${c||'— nenhuma —'}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="form-row">
        <label>Estoque (unidades)</label>
        <input id="ep-stock" type="number" min="0" value="${p?p.stock??0:0}" placeholder="0" />
        <span class="hint">Abaixo de 50 mostra alerta de estoque baixo.</span>
      </div>
      <div class="form-row">
        <label>Peso por unidade (gramas)</label>
        <input id="ep-weight" type="number" min="0" step="0.1" value="${p?p.weight_per_unit??0:0}" placeholder="0" />
        <span class="hint">Usado para calcular o frete pelo peso real.</span>
      </div>
    </div>
    <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;font-weight:600;margin:10px 0 6px;display:flex;align-items:center;justify-content:space-between">
      Preços e custo por pacote
      <button type="button" class="btn btn-secondary" style="font-size:.72rem;padding:4px 10px" onclick="addVariantRow()"><i class="fa fa-plus"></i> Adicionar pacote</button>
    </div>
    <div id="variants-container">${variantsHTML}</div>
    <div class="form-row" style="margin-top:14px">
      <label>Fotos do produto <span style="color:var(--muted);font-weight:400;font-size:.7rem">(máx. 8 fotos)</span></label>
      <div class="img-mgr">
        <div class="img-mgr-header">
          <div class="img-mgr-count"><b id="img-count">0</b> <span>/ 8 fotos</span></div>
          <label class="btn-upload-img" id="btn-upload-img">
            <i class="fa fa-cloud-arrow-up"></i> Adicionar fotos
            <input type="file" id="img-upload-input" multiple accept="image/*" onchange="handleImgUpload(event)" style="display:none" />
          </label>
        </div>
        <div class="img-grid" id="img-grid"></div>
        <div class="img-upload-bar">
          <div class="img-upload-progress" id="img-upload-progress"><div class="img-upload-progress-fill" id="img-upload-fill" style="width:0%"></div></div>
          <div class="img-upload-msg" id="img-upload-msg"></div>
        </div>
        <div class="img-drop-hint">💡 Arraste para reordenar. A <b>primeira</b> foto é a imagem principal.</div>
      </div>
    </div>
    <div class="form-row" style="margin-top:14px">
      <label>Vídeos do produto <span style="color:var(--muted);font-weight:400;font-size:.7rem">(máx. 3 vídeos · MP4 até 80 MB · aparecem na galeria com ▶)</span></label>
      <div class="img-mgr">
        <div class="img-mgr-header">
          <div class="img-mgr-count"><b id="video-count">0</b> <span>/ 3 vídeos</span></div>
          <label class="btn-upload-img" id="btn-upload-video">
            <i class="fa fa-video"></i> Adicionar vídeos
            <input type="file" id="video-upload-input" multiple accept="video/mp4,video/webm,video/quicktime" onchange="handleVideoUpload(event)" style="display:none" />
          </label>
        </div>
        <div class="img-grid" id="video-grid"></div>
        <div class="img-upload-bar">
          <div class="img-upload-progress" id="video-upload-progress"><div class="img-upload-progress-fill" id="video-upload-fill" style="width:0%"></div></div>
          <div class="img-upload-msg" id="video-upload-msg"></div>
        </div>
      </div>
    </div>
    <div class="form-row">
      <label>Características <span style="font-weight:400;color:var(--muted)">(uma por linha)</span></label>
      <textarea id="ep-features" rows="5" placeholder="Material kraft impermeabilizado&#10;Design exclusivo chalk art&#10;Aprovado para contato alimentar">${featsVal}</textarea>
    </div>
    <div class="form-row">
      <label>Especificações <span style="font-weight:400;color:var(--muted)">(formato "Label: Valor", uma por linha)</span></label>
      <textarea id="ep-specs" rows="5" placeholder="Material: Kraft preto&#10;Gramatura: 350g/m²&#10;Formato: Pillow Box">${specsVal}</textarea>
    </div>
    ${isNew ? '' : mlSectionHtml(p)}`;
}

function mlSectionHtml(p) {
  const publicados = (p.variants || []).filter(v => v.ml_item_id);
  return `
    <div class="form-row" style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px">
      <label>Categoria no Mercado Livre <span style="font-weight:400;color:var(--muted)">(ex: MLB271599)</span></label>
      <div style="display:flex;gap:8px">
        <input id="ep-ml-cat" type="text" value="${esc(p.ml_category_id||'')}" placeholder="Cole o ID da categoria ou clique em Sugerir" style="flex:1" />
        <button type="button" class="btn btn-secondary" onclick="mlSugerirCategoria('${p.id}')">Sugerir</button>
      </div>
      <span class="hint" id="ml-cat-hint"></span>
      <div style="display:flex;align-items:center;gap:10px;margin-top:10px">
        <button type="button" class="btn btn-primary" onclick="mlPublicarProduto('${p.id}')" id="ml-publicar-btn"><i class="fa fa-store"></i> Publicar no Mercado Livre</button>
        <span style="font-size:.78rem;color:var(--muted)" id="ml-publicados-count">${publicados.length} de ${(p.variants||[]).length} pacote(s) publicado(s)</span>
      </div>
      <div id="ml-status-list" style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
        ${(p.variants||[]).map(v=>`<div style="font-size:.78rem">${v.units} un: ${v.ml_item_id ? `<a href="https://produto.mercadolivre.com.br/${v.ml_item_id}" target="_blank" rel="noopener">publicado (${v.ml_item_id})</a>` : '<span style="color:var(--muted)">não publicado</span>'}</div>`).join('')}
      </div>
    </div>`;
}

async function mlSugerirCategoria(id) {
  const p = STATE.products.find(x=>x.id===id);
  const hint = document.getElementById('ml-cat-hint');
  if(hint) hint.textContent = 'Buscando sugestão...';
  try {
    const data = await api('/api/eco/ml/sugerir-categoria?titulo='+encodeURIComponent(p.name));
    if(data.sugestao) {
      document.getElementById('ep-ml-cat').value = data.sugestao.category_id;
      if(hint) hint.textContent = 'Sugestão: '+data.sugestao.category_name+' ('+data.sugestao.category_id+') — confira antes de publicar.';
    } else if(hint) hint.textContent = 'Não encontrei sugestão automática. Cole o ID da categoria manualmente.';
  } catch(e) {
    if(hint) hint.textContent = 'Erro ao buscar sugestão: '+e.message;
  }
}

async function mlPublicarProduto(id) {
  const catInput = document.getElementById('ep-ml-cat');
  const catId = catInput?.value.trim();
  if(!catId) return toast('Defina a categoria do Mercado Livre antes de publicar.', 'error');

  const btn = document.getElementById('ml-publicar-btn');
  if(btn){ btn.disabled=true; btn.innerHTML='<i class="fa fa-spinner fa-spin"></i> Publicando...'; }
  try {
    await api('/api/eco/ml/produto/'+id, { method:'PUT', body: JSON.stringify({ ml_category_id: catId }) });
    const out = await api('/api/eco/ml/publicar/'+id, { method:'POST' });
    const lista = document.getElementById('ml-status-list');
    if(lista && out.resultados) {
      lista.innerHTML = out.resultados.map(r => r.ok
        ? `<div style="font-size:.78rem">${r.units} un: <a href="${r.permalink||'#'}" target="_blank" rel="noopener">publicado (${r.ml_item_id})</a></div>`
        : `<div style="font-size:.78rem;color:var(--red)">${r.units} un: erro — ${esc(r.error)}</div>`
      ).join('');
      const count = document.getElementById('ml-publicados-count');
      if(count) count.textContent = out.resultados.filter(r=>r.ok).length+' de '+out.resultados.length+' pacote(s) publicado(s)';
    }
    if(out.ok) toast('✅ Publicado no Mercado Livre! Confira os links.');
    else toast('⚠️ Nenhum pacote foi publicado — veja os erros abaixo do botão.', 'error');
    await loadProducts();
  } catch(e) {
    toast('❌ Erro ao publicar: '+e.message, 'error');
  } finally {
    if(btn){ btn.disabled=false; btn.innerHTML='<i class="fa fa-store"></i> Publicar no Mercado Livre'; }
  }
}

function variantRow(i, units, price, cost) {
  return `
    <div id="variant-row-${i}" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;margin-bottom:8px;align-items:end">
      <div class="form-row" style="margin:0">
        <label>Pacote ${i+1} — Unidades</label>
        <input id="ep-units-${i}" type="number" min="1" value="${units||''}" placeholder="50" />
      </div>
      <div class="form-row" style="margin:0">
        <label>Preço de venda R$</label>
        <input id="ep-price-${i}" type="number" min="0" step="0.01" value="${price||''}" placeholder="0,00" />
      </div>
      <div class="form-row" style="margin:0">
        <label>Custo R$ <span style="font-weight:400;color:var(--muted)">(interno)</span></label>
        <input id="ep-cost-${i}" type="number" min="0" step="0.01" value="${cost||''}" placeholder="0,00" />
      </div>
      <button type="button" class="btn btn-secondary btn-icon" style="color:var(--red);border-color:var(--red);margin-bottom:0" title="Remover" onclick="removeVariantRow(${i})" ${i===0?'disabled style="opacity:.3;cursor:not-allowed"':''}><i class="fa fa-trash"></i></button>
    </div>`;
}

function addVariantRow() {
  const container = document.getElementById('variants-container');
  if(!container) return;
  if(_variantCount >= 6) return toast('Máximo de 6 pacotes por produto.', 'error');
  const i = _variantCount++;
  const div = document.createElement('div');
  div.innerHTML = variantRow(i, '', '', '');
  container.appendChild(div.firstElementChild);
}

function removeVariantRow(i) {
  const row = document.getElementById('variant-row-'+i);
  if(row) row.remove();
}

function syncVariantHints() {
  // Atualiza labels dos pacotes após remoção
  document.querySelectorAll('[id^="variant-row-"]').forEach((row, idx) => {
    const lbl = row.querySelector('label');
    if(lbl) lbl.textContent = `Pacote ${idx+1} — Unidades`;
  });
}

function readVariantsFromForm(existingVariants) {
  const variants = [];
  document.querySelectorAll('[id^="variant-row-"]').forEach(row => {
    const i   = row.id.replace('variant-row-', '');
    const u   = document.getElementById('ep-units-'+i);
    const pr  = document.getElementById('ep-price-'+i);
    const co  = document.getElementById('ep-cost-'+i);
    if(u && pr && u.value) {
      const units = +u.value;
      // Preserva o vínculo com o anúncio do Mercado Livre se o pacote (mesmas unidades) já foi publicado
      const anterior = (existingVariants||[]).find(v => v.units === units && v.ml_item_id);
      const v = { units, price: parseFloat(pr.value)||0, cost: parseFloat(co?.value)||0 };
      if(anterior) v.ml_item_id = anterior.ml_item_id;
      variants.push(v);
    }
  });
  return variants;
}

function readProductFromForm(existingVariants) {
  const feats = (document.getElementById('ep-features')?.value.trim()||'')
    .split('\n').map(s=>s.trim()).filter(Boolean);
  const specs = (document.getElementById('ep-specs')?.value.trim()||'')
    .split('\n').map(line => {
      const sep = line.indexOf(':');
      if(sep===-1) return null;
      return { label: line.slice(0,sep).trim(), value: line.slice(sep+1).trim() };
    }).filter(Boolean);

  return {
    name:             document.getElementById('ep-name')?.value.trim()||'',
    category:         document.getElementById('ep-category')?.value.trim()||'',
    description:      document.getElementById('ep-desc')?.value.trim()||'',
    long_description: document.getElementById('ep-longdesc')?.value.trim()||'',
    badge:            document.getElementById('ep-badge')?.value.trim()||'',
    badgeColor:       document.getElementById('ep-badgeColor')?.value||'',
    stock:            parseInt(document.getElementById('ep-stock')?.value)||0,
    weight_per_unit:  parseFloat(document.getElementById('ep-weight')?.value)||0,
    variants:         readVariantsFromForm(existingVariants),
    ml_category_id:   document.getElementById('ep-ml-cat')?.value.trim() ?? undefined,
    images:           [..._editImages],
    image:            _editImages[0] || '',
    videos:           [..._editVideos],
    features:         feats,
    specs:            specs,
  };
}

async function saveNewProduct() {
  const data = readProductFromForm();
  if(!data.name) return toast('Informe o nome do produto.', 'error');
  if(!data.variants.length) return toast('Adicione ao menos um pacote de preço.', 'error');

  const saveBtn = document.querySelector('#modal-footer .btn-primary');
  if(saveBtn){ saveBtn.disabled=true; saveBtn.innerHTML='<i class="fa fa-spinner fa-spin"></i> Criando...'; }

  try {
    const created = await api('/api/admin/products', { method:'POST', body: JSON.stringify(data) });
    STATE.products.push(created);
    closeModal();
    renderProducts();
    toast('✅ Produto "' + created.name + '" criado com sucesso!');
  } catch(e) {
    if(saveBtn){ saveBtn.disabled=false; saveBtn.innerHTML='<i class="fa fa-save"></i> Criar Produto'; }
    toast('❌ Erro ao criar produto.', 'error');
  }
}

async function deleteProduct(id) {
  const p = STATE.products.find(x=>x.id===id);
  if(!p) return;
  if(!confirm(`⚠️ Excluir o produto "${p.name}"?\n\nEsta ação não pode ser desfeita.`)) return;

  try {
    await api('/api/admin/products/'+id, { method:'DELETE' });
  } catch(e) {
    if(!String(e.message).includes('404')) {
      toast('❌ Erro ao excluir produto.', 'error');
      return;
    }
  }
  STATE.products = STATE.products.filter(x=>x.id!==id);
  renderProducts();
  toast('🗑️ Produto excluído.');
}

/* ══════════════════════════════════════════════════════
   IMAGE MANAGER — gerenciador de fotos dos produtos
══════════════════════════════════════════════════════ */
let _editImages = [];  // caminhos relativos das imagens em edição: ['images/01 - Pastel.png', ...]
let _imgDragIdx = null;

function initImgManager(images) {
  _editImages = Array.isArray(images) ? [...images] : [];
  renderImgGrid();
}

function renderImgGrid() {
  const grid    = document.getElementById('img-grid');
  const countEl = document.getElementById('img-count');
  const btn     = document.getElementById('btn-upload-img');
  if(!grid) return;
  const n = _editImages.length;
  if(countEl) countEl.textContent = n;
  if(btn) btn.classList.toggle('disabled', n >= 8);
  if(n === 0) {
    grid.innerHTML = `<div class="img-grid-empty">
      <i class="fa fa-image" style="font-size:2rem;opacity:.3;display:block;margin-bottom:8px"></i>
      Nenhuma imagem. Clique em "Adicionar fotos" para fazer upload.
    </div>`;
    return;
  }
  grid.innerHTML = _editImages.map((src, i) => `
    <div class="img-card" draggable="true"
      ondragstart="imgDragStart(${i})" ondragover="imgDragOver(event,${i})"
      ondrop="imgDrop(event,${i})" ondragend="imgDragEnd()">
      <img src="${src}" onerror="this.style.background='var(--bg)'" />
      <div class="img-card-num">${i + 1}</div>
      ${i === 0 ? '<div class="img-card-main">Principal</div>' : ''}
      <button class="img-card-del" onclick="removeImg(${i})" title="Remover foto"><i class="fa fa-xmark"></i></button>
    </div>`).join('');
}

function removeImg(idx) {
  _editImages.splice(idx, 1);
  renderImgGrid();
  imgMsg('Imagem removida.');
  setTimeout(() => imgMsg(''), 2000);
}

function imgDragStart(idx) {
  _imgDragIdx = idx;
  setTimeout(() => {
    const cards = document.querySelectorAll('#img-grid .img-card');
    if(cards[idx]) cards[idx].classList.add('dragging');
  }, 0);
}
function imgDragOver(e, idx) {
  e.preventDefault();
  document.querySelectorAll('#img-grid .img-card').forEach((c, i) =>
    c.classList.toggle('drag-target', i === idx && i !== _imgDragIdx)
  );
}
function imgDrop(e, idx) {
  e.preventDefault();
  if(_imgDragIdx === null || _imgDragIdx === idx) { imgDragEnd(); return; }
  const moved = _editImages.splice(_imgDragIdx, 1)[0];
  _editImages.splice(idx, 0, moved);
  _imgDragIdx = null;
  renderImgGrid();
  imgMsg('Ordem atualizada. A foto 1 será a imagem principal.');
  setTimeout(() => imgMsg(''), 2500);
}
function imgDragEnd() {
  _imgDragIdx = null;
  document.querySelectorAll('#img-grid .img-card').forEach(c =>
    c.classList.remove('dragging', 'drag-target')
  );
}

async function handleImgUpload(event) {
  const files = Array.from(event.target.files);
  if(!files.length) return;
  const slots = 8 - _editImages.length;
  if(slots <= 0) {
    imgMsg('⚠️ Limite de 8 fotos atingido. Remova uma antes de adicionar.');
    event.target.value = '';
    return;
  }
  const toUpload = files.slice(0, slots);
  if(files.length > slots) {
    imgMsg(`⚠️ Serão enviadas apenas ${slots} imagem${slots > 1 ? 'ns' : ''} (limite de 8 fotos).`);
  }
  const prog = document.getElementById('img-upload-progress');
  const fill = document.getElementById('img-upload-fill');
  if(prog) prog.style.display = 'block';
  let ok = 0;
  for(let i = 0; i < toUpload.length; i++) {
    const file = toUpload[i];
    if(fill) fill.style.width = Math.round((i / toUpload.length) * 90) + '%';
    imgMsg(`Enviando ${i + 1}/${toUpload.length}: ${file.name}…`);
    try {
      const dataUrl = await readFileAsBase64(file);
      const res = await api('/api/admin/upload-image', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, data: dataUrl })
      });
      _editImages.push(res.path);
      renderImgGrid();
      ok++;
    } catch(err) {
      const msg = String(err.message).includes('401')
        ? '❌ Sessão expirada. Faça login novamente.'
        : String(err.message).includes('413')
        ? `❌ "${file.name}" é muito grande. Máximo 8 MB por imagem.`
        : `❌ Erro ao enviar "${file.name}" (${err.message}). Verifique se o servidor está rodando.`;
      imgMsg(msg);
      await new Promise(r => setTimeout(r, 1400));
    }
  }
  if(fill) fill.style.width = '100%';
  if(ok > 0) imgMsg(`✅ ${ok} foto${ok !== 1 ? 's' : ''} adicionada${ok !== 1 ? 's' : ''} com sucesso!`);
  setTimeout(() => {
    if(prog) { prog.style.display = 'none'; }
    if(fill) fill.style.width = '0%';
    if(ok > 0) imgMsg('');
  }, 2600);
  event.target.value = '';
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

function imgMsg(msg) {
  const el = document.getElementById('img-upload-msg');
  if(el) el.textContent = msg;
}

/* ══════════════════════════════════════════════════════
   VIDEO MANAGER — upload de vídeos do produto
══════════════════════════════════════════════════════ */
let _editVideos = [];

function initVideoManager(videos) {
  _editVideos = Array.isArray(videos) ? [...videos] : [];
  renderVideoGrid();
}

function renderVideoGrid() {
  const grid = document.getElementById('video-grid');
  const countEl = document.getElementById('video-count');
  const btn = document.getElementById('btn-upload-video');
  if(!grid) return;
  const n = _editVideos.length;
  if(countEl) countEl.textContent = n;
  if(btn) btn.classList.toggle('disabled', n >= 3);
  if(n === 0) {
    grid.innerHTML = `<div class="img-grid-empty">
      <i class="fa fa-video" style="font-size:2rem;opacity:.3;display:block;margin-bottom:8px"></i>
      Nenhum vídeo. Clique em "Adicionar vídeos" para fazer upload.
    </div>`;
    return;
  }
  grid.innerHTML = _editVideos.map((src, i) => `
    <div class="img-card">
      <video src="${src.startsWith('/') ? src : '/' + src}" muted preload="metadata" style="width:100%;height:100%;object-fit:cover"></video>
      <div class="img-card-num">▶ ${i + 1}</div>
      <button class="img-card-del" onclick="removeVideo(${i})" title="Remover vídeo"><i class="fa fa-trash"></i></button>
    </div>`).join('');
}

function removeVideo(idx) {
  _editVideos.splice(idx, 1);
  renderVideoGrid();
}

function videoMsg(msg) {
  const el = document.getElementById('video-upload-msg');
  if(el) el.textContent = msg;
}

async function handleVideoUpload(event) {
  const files = Array.from(event.target.files || []);
  if(!files.length) return;
  const slots = 3 - _editVideos.length;
  if(slots <= 0) { videoMsg('❌ Máximo de 3 vídeos atingido. Remova um para adicionar outro.'); return; }
  const toUpload = files.slice(0, slots);
  const prog = document.getElementById('video-upload-progress');
  const fill = document.getElementById('video-upload-fill');
  if(prog) prog.style.display = 'block';
  let okCount = 0;
  for(let i = 0; i < toUpload.length; i++) {
    const file = toUpload[i];
    if(file.size > 80 * 1024 * 1024) {
      videoMsg(`❌ "${file.name}" tem ${(file.size/1024/1024).toFixed(0)} MB. Máximo 80 MB — comprima o vídeo.`);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    if(fill) fill.style.width = Math.round((i / toUpload.length) * 90) + '%';
    videoMsg(`Enviando ${i + 1}/${toUpload.length}: ${file.name} (${(file.size/1024/1024).toFixed(1)} MB)… aguarde, vídeos demoram mais`);
    try {
      const r = await fetch('/api/admin/upload-video?filename=' + encodeURIComponent(file.name), {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token(), 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if(!r.ok) throw new Error(r.status);
      const data = await r.json();
      _editVideos.push(data.path);
      renderVideoGrid();
      okCount++;
    } catch(e) {
      const msg = String(e.message).includes('401') ? '❌ Sessão expirada. Faça login novamente.'
        : String(e.message).includes('413') ? `❌ "${file.name}" é muito grande para o servidor.`
        : `❌ Erro ao enviar "${file.name}" (${e.message}).`;
      videoMsg(msg);
      await new Promise(r => setTimeout(r, 1800));
    }
  }
  if(fill) fill.style.width = '100%';
  if(okCount > 0) videoMsg(`✅ ${okCount} vídeo${okCount !== 1 ? 's' : ''} enviado${okCount !== 1 ? 's' : ''} com sucesso! Salve o produto para publicar.`);
  setTimeout(() => {
    if(prog) prog.style.display = 'none';
    if(fill) fill.style.width = '0%';
  }, 3000);
  event.target.value = '';
}

/* ══════════════════════════════════════════════════════
   CUSTOMERS
══════════════════════════════════════════════════════ */
function buildCustomers() {
  const map = {};
  // 1) Clientes registrados (customers.json)
  (STATE.customers || []).forEach(c => {
    const k = c.email;
    if(!k) return;
    map[k] = { ...c, orders: 0, total_spent: 0,
      last_order: c.last_login || c.registered_at || '',
      city: c.city || '', state: c.state || '',
      source: 'registered' };
  });
  // 2) Clientes dos pedidos (orders.json)
  STATE.orders.filter(o=>o.status!=='cancelled').forEach(o=>{
    const k = o.customer?.email;
    if(!k) return;
    if(!map[k]) map[k] = { ...o.customer, orders:0, total_spent:0,
      last_order: o.date, city: o.shipping?.city||'', state: o.shipping?.state||'',
      source: 'order' };
    map[k].orders = (map[k].orders||0) + 1;
    map[k].total_spent = (map[k].total_spent||0) + o.total;
    if(!map[k].last_order || new Date(o.date) > new Date(map[k].last_order))
      map[k].last_order = o.date;
    if(!map[k].city && o.shipping?.city) map[k].city = o.shipping.city;
    if(!map[k].state && o.shipping?.state) map[k].state = o.shipping.state;
  });
  return Object.values(map).sort((a,b) => (b.total_spent||0)-(a.total_spent||0));
}
function renderCustomers(list) {
  const customers = list || buildCustomers();
  const tbody = document.getElementById('customers-table');
  if(!tbody) return;
  // stats
  const total = customers.length;
  const returning = customers.filter(c=>c.orders>1).length;
  const avgSpend = total ? customers.reduce((s,c)=>s+c.total_spent,0)/total : 0;
  document.getElementById('stat-total-customers').textContent = total;
  document.getElementById('stat-returning').textContent = returning;
  document.getElementById('stat-avg-spend').textContent = 'R$ '+fmt(avgSpend);
  tbody.innerHTML = customers.map(c=>{
    const addr   = c.address || '';
    const cep    = c.cep ? `CEP ${c.cep}` : '';
    const cityUF = [c.city, c.state].filter(Boolean).join(' — ');
    const since  = c.registered_at ? fmtDate(c.registered_at) : (c.last_order ? fmtDate(c.last_order) : '—');
    const srcBadge = c.source==='registered'
      ? '<span class="badge blue" style="font-size:.6rem;padding:2px 6px">cadastrado</span>'
      : '<span class="badge gray" style="font-size:.6rem;padding:2px 6px">pedido</span>';
    return `<tr>
      <td><b>${c.name}</b><br><span style="margin-top:3px;display:inline-block">${srcBadge}</span></td>
      <td>
        <div style="font-size:.82rem">${c.email||'—'}</div>
        <div style="font-size:.78rem;color:var(--muted);margin-top:2px">${c.phone||'—'}</div>
      </td>
      <td>
        <div style="font-size:.82rem;font-weight:600">${addr||'—'}</div>
        <div style="font-size:.75rem;color:var(--muted);margin-top:2px">${[cep,cityUF].filter(Boolean).join(' · ')||'—'}</div>
      </td>
      <td style="text-align:center"><b>${c.orders||0}</b></td>
      <td><b>R$ ${fmt(c.total_spent||0)}</b></td>
      <td style="font-size:.78rem;color:var(--muted)">${since}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-icon" onclick="viewCustomer('${c.email}')" title="Ver detalhes"><i class="fa fa-eye"></i></button>
          <button class="btn btn-ghost btn-icon" onclick="contactWA('${(c.phone||'').replace(/\D/g,'')}','${c.name}','')" title="WhatsApp"><i class="fa-brands fa-whatsapp" style="color:#25D366"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--muted)">Nenhum cliente encontrado</td></tr>';
}
function filterCustomers() {
  const q = document.getElementById('customer-search')?.value.toLowerCase()||'';
  renderCustomers(buildCustomers().filter(c=>(c.name+c.email+(c.city||'')+(c.address||'')).toLowerCase().includes(q)));
}
function viewCustomer(email) {
  const all = buildCustomers();
  const c   = all.find(x=>x.email===email);
  if(!c) return;
  const orders = STATE.orders.filter(o=>o.customer?.email===email);
  document.getElementById('modal-title').textContent = '👤 '+c.name;
  document.getElementById('modal-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px">
      <div class="detail-item"><label>Nome completo</label><p>${c.name}</p></div>
      <div class="detail-item"><label>E-mail</label><p>${c.email||'—'}</p></div>
      <div class="detail-item"><label>Telefone / WhatsApp</label><p>${c.phone||'—'}</p></div>
      <div class="detail-item"><label>CEP</label><p>${c.cep||'—'}</p></div>
      <div class="detail-item"><label>Endereço</label><p>${c.address||'—'}</p></div>
      <div class="detail-item"><label>Cidade / Estado</label><p>${[c.city,c.state].filter(Boolean).join(' — ')||'—'}</p></div>
      <div class="detail-item"><label>Cadastrado em</label><p>${c.registered_at?fmtDate(c.registered_at):'—'}</p></div>
      <div class="detail-item"><label>Newsletter</label><p>${c.marketing_opt_in?'✅ Optou por receber':'❌ Não optou'}</p></div>
    </div>
    <div style="font-size:.7rem;color:var(--muted);text-transform:uppercase;font-weight:600;margin-bottom:10px">
      Histórico de Pedidos
      <span style="background:var(--red);color:#fff;border-radius:20px;padding:1px 8px;font-size:.65rem;margin-left:6px">${orders.length}</span>
    </div>
    ${orders.length ? orders.map(o=>`
      <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 14px;background:#f8fafc;border-bottom:1px solid var(--border)">
          <div>
            <b style="font-size:.83rem">${o.id}</b>
            <span style="font-size:.72rem;color:var(--muted);margin-left:8px">${fmtDate(o.date)}</span>
          </div>
          <span class="badge ${o.status}">${statusLabel(o.status)}</span>
        </div>
        <div style="padding:10px 14px">
          ${(o.items||[]).map(i=>`
            <div style="display:flex;justify-content:space-between;font-size:.8rem;padding:4px 0;border-bottom:1px solid #f1f5f9">
              <span style="flex:1">${i.name}</span>
              <span style="color:var(--muted);margin:0 12px">× ${i.qty||1}</span>
              <b>R$ ${fmt(i.total||0)}</b>
            </div>`).join('')}
        </div>
        <div style="padding:8px 14px;background:#fafafa;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
          <div>
            <b style="color:var(--red)">Total: R$ ${fmt(o.total)}</b>
            <span style="font-size:.72rem;color:var(--muted);margin-left:8px">${payLabel(o.payment_method)}</span>
          </div>
          ${o.shipping?.address ? `<span style="font-size:.72rem;color:var(--muted)">🚚 ${o.shipping.address}, ${o.shipping.city||''} — ${o.shipping.state||''} | CEP ${o.shipping.cep||''}</span>` : ''}
          ${o.tracking_code ? `<span style="background:#dcfce7;color:#15803d;font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:20px">📍 ${o.tracking_code}</span>` : ''}
        </div>
      </div>`).join('')
    : '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.85rem">📦 Nenhum pedido ainda.</div>'}`;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-secondary" onclick="adminResetPassword('${c.id}','${c.name}','${(c.phone||'').replace(/\D/g,'')}')"><i class="fa fa-key"></i> Redefinir senha</button>
    <button class="btn btn-wa" onclick="contactWA('${(c.phone||'').replace(/\D/g,'')}','${c.name}','')"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>
    <button class="btn btn-secondary" onclick="closeModal()">Fechar</button>`;
  showModal();
}

async function adminResetPassword(id, name, phone) {
  if(!confirm(`Redefinir senha de ${name}? Uma senha temporária será gerada.`)) return;
  try {
    const data = await api('/api/admin/customers/'+id+'/reset-password', { method:'POST' });
    document.getElementById('modal-body').insertAdjacentHTML('afterbegin', `
      <div style="background:#dcfce7;border:1px solid #16a34a;border-radius:10px;padding:14px 16px;margin-bottom:16px">
        <b style="color:#15803d">✅ Senha temporária gerada para ${data.name}:</b><br>
        <span style="font-size:1.5rem;font-weight:800;letter-spacing:4px;color:#166534;display:block;margin:8px 0">${data.temp_password}</span>
        <span style="font-size:.78rem;color:#15803d">Envie esta senha ao cliente via WhatsApp. Ele pode trocá-la em "Editar perfil".</span>
        <br><button class="btn btn-wa" style="margin-top:8px;font-size:.78rem" onclick="contactWA('${phone}','${name}','')"><i class='fa-brands fa-whatsapp'></i> Enviar via WhatsApp</button>
      </div>`);
    toast('✅ Senha temporária: '+data.temp_password);
  } catch(e) {
    toast('❌ Erro ao redefinir senha.','error');
  }
}

/* ══════════════════════════════════════════════════════
   ABANDONED CARTS
══════════════════════════════════════════════════════ */
function renderAbandoned() {
  const tbody = document.getElementById('abandoned-table');
  if(!tbody) return;
  const list = STATE.abandoned;
  const total = list.length;
  const recovered = list.filter(a=>a.recovered).length;
  const lostVal = list.filter(a=>!a.recovered).reduce((s,a)=>s+a.total,0);
  document.getElementById('stat-abandoned').textContent = total-recovered;
  document.getElementById('stat-recovered').textContent = recovered;
  document.getElementById('stat-lost-value').textContent = 'R$ '+fmt(lostVal);
  updateBadges();
  tbody.innerHTML = list.map(a=>`
    <tr>
      <td><b>${a.id}</b></td>
      <td>${a.name ? `<b>${a.name}</b><br><span style="color:var(--muted);font-size:.78rem">${a.phone||'sem telefone'}</span>` : (a.cep||'—')}</td>
      <td>${a.items.map(i=>i.name.split('(')[0].trim()).join(', ')}</td>
      <td><b>R$ ${fmt(a.total)}</b></td>
      <td>${timeAgo(a.date)}</td>
      <td><span class="badge ${a.recovered?'delivered':'orange'}">${a.recovered?'Recuperado':'Abandonado'}</span></td>
      <td>
        ${!a.recovered?`<button class="btn btn-wa" style="font-size:.75rem" onclick="recoverCart('${a.id}')"><i class="fa-brands fa-whatsapp"></i> Recuperar</button>`:'<span style="color:var(--muted);font-size:.78rem">—</span>'}
      </td>
    </tr>`).join('');
}
function recoverCart(id) {
  const a = STATE.abandoned.find(x=>x.id===id);
  if(!a) return;
  // Telefone do CLIENTE (com DDI 55)
  let phone = String(a.phone || '').replace(/\D/g, '');
  if (!phone) { toast('❌ Este carrinho não tem telefone do cliente.', 'error'); return; }
  if (!phone.startsWith('55')) phone = '55' + phone;

  const nome = (a.name || '').split(' ')[0] || 'tudo bem';
  const itens = a.items.map(i => `• ${i.qty || 1}x ${i.name.split('(')[0].trim()}`).join('\n');
  const msg = encodeURIComponent(
`Olá ${nome}! 👋 Aqui é da *TopFood Embalagens*.

Vimos que você montou seu carrinho no nosso site mas não finalizou:

${itens}
*Total: R$ ${fmt(a.total)}*

🎁 Use o cupom *PIX5* e ganhe *5% de desconto* pagando no PIX!

Finalize aqui: https://topfoodembalagens.com.br

Qualquer dúvida estamos à disposição! 😊`);
  window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  a.recovered = true;
  api('/api/admin/abandoned/'+id,{method:'PUT',body:JSON.stringify({recovered:true})}).catch(()=>{});
  renderAbandoned();
}

/* ══════════════════════════════════════════════════════
   CONTACT MESSAGES
══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   NEWSLETTER — LEADS
══════════════════════════════════════════════════════ */
async function loadNewsletterLeads() {
  const tbody = document.getElementById('newsletter-table');
  const countEl = document.getElementById('newsletter-count');
  const badgeEl = document.getElementById('badge-newsletter');
  try {
    const leads = await api('/api/admin/newsletter');
    const today = new Date().toDateString();

    // KPIs
    document.getElementById('nl-total').textContent = leads.length;
    document.getElementById('nl-today').textContent = leads.filter(l =>
      new Date(l.created_at).toDateString() === today
    ).length;

    // Badge no menu
    if (leads.length > 0) {
      badgeEl.textContent = leads.length;
      badgeEl.style.display = '';
    }
    countEl.textContent = leads.length + ' lead(s) cadastrado(s)';

    if (!leads.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted)">Nenhum lead ainda. O formulário da home enviará os e-mails para cá.</td></tr>';
      return;
    }

    tbody.innerHTML = leads.slice().reverse().map((l, i) => `
      <tr>
        <td style="color:var(--muted);font-size:.78rem">${leads.length - i}</td>
        <td><strong>${l.email}</strong></td>
        <td style="color:var(--muted)">${l.name || '—'}</td>
        <td><span style="background:#F0FDF4;color:var(--green);padding:2px 8px;border-radius:20px;font-size:.78rem;font-weight:600">${l.coupon || 'BEMVINDO10'}</span></td>
        <td style="font-size:.78rem;color:var(--muted)">${l.source || 'home_banner'}</td>
        <td style="font-size:.78rem;color:var(--muted)">${new Date(l.created_at).toLocaleString('pt-BR')}</td>
        <td>
          <button onclick="deleteNewsletterLead('${l.id}')" class="btn" style="background:#FEF2F2;color:var(--red);border:1px solid #FECACA;padding:4px 10px;font-size:.75rem" title="Remover lead">
            <i class="fa fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--red)">Erro ao carregar leads: ' + e.message + '</td></tr>';
    if (countEl) countEl.textContent = 'Erro ao carregar';
  }
}

async function deleteNewsletterLead(id) {
  if (!confirm('Remover este lead da lista?')) return;
  try {
    await api('/api/admin/newsletter/' + id, { method: 'DELETE' });
    toast('Lead removido.');
    loadNewsletterLeads();
  } catch(e) { toast('Erro ao remover: ' + e.message, 'error'); }
}

function exportNewsletterCSV() {
  api('/api/admin/newsletter').then(leads => {
    if (!leads.length) { toast('Nenhum lead para exportar.', 'warn'); return; }
    const header = 'ID,Email,Nome,Cupom,Origem,Data Cadastro';
    const rows = leads.map(l =>
      [l.id, l.email, l.name || '', l.coupon || 'BEMVINDO10', l.source || '', new Date(l.created_at).toLocaleString('pt-BR')].join(',')
    );
    const csv  = [header, ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'newsletter_leads_' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV exportado com ' + leads.length + ' leads!');
  });
}

async function loadContactMessages() {
  try {
    STATE.contact_messages = await api('/api/admin/contact');
  } catch(e) { /* usa cache local */ }
  renderContactMessages();
  updateBadges();
}
function renderContactMessages() {
  const el  = document.getElementById('contact-messages-list');
  if (!el) return;
  const msgs = STATE.contact_messages || [];
  if (msgs.length === 0) {
    el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted)"><i class="fa fa-inbox" style="font-size:2.5rem;margin-bottom:12px;display:block;opacity:.3"></i>Nenhuma mensagem recebida ainda.</div>';
    return;
  }
  el.innerHTML = msgs.map(m => `
    <div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:16px;background:${m.read?'#fff':'#fffbeb'}">
      <div style="width:40px;height:40px;border-radius:50%;background:${m.read?'var(--border)':'var(--yellow)'};display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">${m.read?'✉️':'📬'}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <div>
            <span style="font-weight:700;font-size:.9rem">${esc(m.name)}</span>
            <span style="color:var(--muted);font-size:.8rem;margin-left:8px">${esc(m.email)}</span>
            ${m.phone?`<span style="color:var(--muted);font-size:.8rem;margin-left:8px">${esc(m.phone)}</span>`:''}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <span style="background:var(--blue-l);color:var(--blue);font-size:.72rem;font-weight:700;padding:3px 9px;border-radius:99px">${esc(m.subject)}</span>
            <span style="font-size:.75rem;color:var(--muted)">${fmtDate(m.date)}</span>
          </div>
        </div>
        <p style="margin-top:6px;font-size:.87rem;color:var(--text);line-height:1.6;white-space:pre-wrap">${esc(m.message)}</p>
        <div style="margin-top:8px;display:flex;gap:8px">
          <a href="mailto:${esc(m.email)}?subject=Re: ${esc(m.subject)}&body=Olá ${esc(m.name)},%0A%0A" style="font-size:.78rem;color:var(--blue);font-weight:600"><i class="fa fa-reply"></i> Responder</a>
          ${!m.read?`<button onclick="markContactRead('${m.id}')" style="background:none;border:none;font-size:.78rem;color:var(--green);font-weight:600;padding:0"><i class="fa fa-check"></i> Marcar como lida</button>`:''}
          ${m.phone?`<a href="https://wa.me/${m.phone.replace(/\D/g,'')}" target="_blank" style="font-size:.78rem;color:#25D366;font-weight:600"><i class="fa fa-brands fa-whatsapp"></i> WhatsApp</a>`:''}
        </div>
      </div>
    </div>
  `).join('');
}
async function markContactRead(id) {
  const idx = STATE.contact_messages.findIndex(m => m.id === id);
  if (idx === -1) return;
  STATE.contact_messages[idx].read = true;
  renderContactMessages();
  updateBadges();
  api('/api/admin/contact/'+id, { method:'PUT', body: JSON.stringify({ read: true }) }).catch(()=>{});
}

/* ══════════════════════════════════════════════════════
   CAMPAIGNS / SEO
══════════════════════════════════════════════════════ */
function loadCampaigns() {
  document.getElementById('seo-title').value = STATE.settings.seo_title||'';
  document.getElementById('seo-description').value = STATE.settings.seo_description||'';
  document.getElementById('seo-keywords').value = STATE.settings.seo_keywords||'';
  document.getElementById('banner-text').value = STATE.settings.featured_banner||'';
  renderCoupons();
  renderUTMReport();
  loadAnuncios();
  const emails = [...new Set(STATE.orders.filter(o=>o.customer?.email).map(o=>o.customer.email))];
  document.getElementById('newsletter-count').textContent = emails.length+' contatos';
  document.getElementById('newsletter-list').innerHTML = emails.length
    ? emails.map(e=>`<div class="newsletter-item"><span>${e}</span><button class="btn btn-ghost btn-icon" style="font-size:.75rem"><i class="fa fa-copy"></i></button></div>`).join('')
    : document.getElementById('newsletter-list').innerHTML;
}

/* ══════════════════════════════════════════════════════
   M14 — PUBLICAR ANÚNCIO
══════════════════════════════════════════════════════ */
const PLAT_INFO = {
  meta:   { nome:'Meta (Face/Insta)', icon:'fa-brands fa-facebook', cor:'#1877f2' },
  google: { nome:'Google',            icon:'fa-brands fa-google',   cor:'#ea4335' },
  tiktok: { nome:'TikTok',            icon:'fa-brands fa-tiktok',   cor:'#111' },
};

function loadAnuncios() {
  const sel = document.getElementById('ad-produto');
  if (sel) {
    sel.innerHTML = '<option value="">— Selecione um produto —</option>' +
      (STATE.products||[]).map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  }
  renderAnuncios();
}

async function renderAnuncios() {
  const wrap = document.getElementById('ads-list');
  const countEl = document.getElementById('ads-count');
  if (!wrap) return;
  let ads = [];
  try { const r = await api('/api/eco/anuncios'); ads = r.ads || []; } catch(e){}
  STATE.ads = ads;
  if (countEl) countEl.textContent = ads.length;
  if (!ads.length) {
    wrap.innerHTML = '<div style="text-align:center;padding:28px;color:var(--muted);font-size:.85rem"><i class="fa fa-rocket" style="font-size:1.8rem;opacity:.3;display:block;margin-bottom:8px"></i>Nenhum anúncio ainda. Crie o primeiro ao lado.</div>';
    return;
  }
  wrap.innerHTML = ads.map(adCardHtml).join('');
}

function adCardHtml(a) {
  const pub = a.status === 'publicado';
  const badge = pub
    ? '<span style="background:#dcfce7;color:#15803d;font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:20px">✅ Publicado</span>'
    : '<span style="background:#fef9c3;color:#854d0e;font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:20px">📝 Rascunho</span>';
  const plats = (a.plataformas||[]).map(p=>{
    const i = PLAT_INFO[p]||{icon:'fa fa-bullhorn',cor:'#666'};
    return `<i class="${i.icon}" style="color:${i.cor}" title="${i.nome||p}"></i>`;
  }).join(' ');
  const artes = (Array.isArray(a.artes) && a.artes.length) ? `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
      ${a.artes.map(art=>`<a href="${escapeHtml(art.url)}" target="_blank" title="${escapeHtml(art.nome||'')}"><img src="${escapeHtml(art.url)}" style="width:54px;height:54px;object-fit:cover;border-radius:6px;border:1px solid var(--border)" /></a>`).join('')}
    </div>` : '';
  const pacote = (pub && Array.isArray(a.pacote)) ? a.pacote.map(pk=>`
    <div style="background:var(--bg);border-radius:8px;padding:8px 10px;margin-top:6px">
      <div style="font-size:.72rem;font-weight:700;color:${(PLAT_INFO[pk.plataforma]||{}).cor||'#333'};margin-bottom:4px"><i class="${(PLAT_INFO[pk.plataforma]||{}).icon||''}"></i> ${(PLAT_INFO[pk.plataforma]||{}).nome||pk.plataforma}</div>
      <div style="display:flex;gap:6px;align-items:center">
        <input type="text" readonly value="${escapeHtml(pk.link)}" style="flex:1;font-size:.72rem;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text)" />
        <button class="btn btn-secondary" style="padding:5px 9px;font-size:.72rem" onclick="copyAdLink(this,'${encodeURIComponent(pk.link)}')"><i class="fa fa-copy"></i></button>
      </div>
    </div>`).join('') : '';
  return `
    <div style="border:1px solid var(--border);border-radius:10px;padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="min-width:0">
          <div style="font-weight:700;font-size:.9rem;overflow:hidden;text-overflow:ellipsis">${escapeHtml(a.titulo||'(sem título)')}</div>
          <div style="font-size:.72rem;color:var(--muted);margin-top:2px">${escapeHtml(a.produto_nome||a.produto||'—')} · ${plats} ${a.orcamento_diario?('· R$ '+a.orcamento_diario+'/dia'):''}</div>
        </div>
        ${badge}
      </div>
      ${a.texto?`<div style="font-size:.76rem;color:var(--muted);margin-top:6px">${escapeHtml(a.texto)}</div>`:''}
      ${artes}
      ${pacote}
      <div style="display:flex;gap:6px;margin-top:10px">
        ${!pub?`<button class="btn btn-primary" style="padding:5px 10px;font-size:.74rem" onclick="publishAnuncio('${a.id}')"><i class="fa fa-rocket"></i> Publicar</button>`:''}
        <button class="btn btn-secondary" style="padding:5px 10px;font-size:.74rem" onclick="editAnuncio('${a.id}')"><i class="fa fa-pen"></i> Editar</button>
        <button class="btn btn-ghost" style="padding:5px 10px;font-size:.74rem;color:var(--red)" onclick="deleteAnuncio('${a.id}')"><i class="fa fa-trash"></i></button>
      </div>
    </div>`;
}

let AD_ARTES = []; // artes carregadas no formulário: [{url, nome}]

function adFormData() {
  const sel = document.getElementById('ad-produto');
  const produto = sel ? sel.value : '';
  const produto_nome = (sel && sel.selectedIndex>0) ? sel.options[sel.selectedIndex].text : '';
  const plataformas = Array.from(document.querySelectorAll('.ad-plat:checked')).map(c=>c.value);
  return {
    id: document.getElementById('ad-id').value || undefined,
    produto, produto_nome, plataformas,
    landing: produto ? '/#'+produto : '/',
    titulo:  document.getElementById('ad-titulo').value.trim(),
    texto:   document.getElementById('ad-texto').value.trim(),
    artes:   AD_ARTES.slice(),
    imagem:  AD_ARTES[0]?.url || '',
    orcamento_diario: document.getElementById('ad-orcamento').value,
    publico: document.getElementById('ad-publico').value.trim(),
  };
}

// Sobe as artes (arquivos) para o servidor e guarda as URLs
async function uploadArtes(files) {
  const list = Array.from(files||[]);
  if (!list.length) return;
  for (const file of list) {
    if (!file.type.startsWith('image/')) { toast('Só imagens (PNG/JPG).','error'); continue; }
    try {
      const dataUrl = await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
      const resp = await api('/api/eco/anuncios/upload',{method:'POST',body:JSON.stringify({ dataUrl, nome: file.name })});
      if (resp && resp.url) AD_ARTES.push({ url: resp.url, nome: file.name });
    } catch(e) { toast('❌ Erro ao subir '+file.name,'error'); }
  }
  document.getElementById('ad-file').value = '';
  renderArtesPreview();
  toast('🎨 Arte(s) carregada(s)!');
}

function renderArtesPreview() {
  const wrap = document.getElementById('ad-artes-preview');
  if (!wrap) return;
  wrap.innerHTML = AD_ARTES.map((a,i)=>`
    <div style="position:relative;width:70px;height:70px;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
      <img src="${a.url}" style="width:100%;height:100%;object-fit:cover" />
      <button onclick="removeArte(${i})" title="Remover" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.65);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:.7rem;cursor:pointer;line-height:1">✕</button>
    </div>`).join('');
}

function removeArte(i) { AD_ARTES.splice(i,1); renderArtesPreview(); }

async function saveAnuncio(publish) {
  const data = adFormData();
  if (!data.titulo) { toast('Informe o título do anúncio.','error'); return; }
  if (!data.plataformas.length) { toast('Escolha ao menos uma plataforma.','error'); return; }
  try {
    const r = await api('/api/eco/anuncios',{method:'POST',body:JSON.stringify(data)});
    if (publish && r.ad) {
      await api('/api/eco/anuncios/'+r.ad.id+'/publish',{method:'POST'});
      toast('🚀 Anúncio publicado! Pacote pronto na lista.');
    } else {
      toast('📝 Rascunho salvo.');
    }
    resetAdForm();
    renderAnuncios();
  } catch(e) { toast('❌ Erro ao salvar anúncio.','error'); }
}

async function publishAnuncio(id) {
  try {
    await api('/api/eco/anuncios/'+id+'/publish',{method:'POST'});
    toast('🚀 Anúncio publicado! Pacote pronto na lista.');
    renderAnuncios();
  } catch(e) { toast('❌ Erro ao publicar.','error'); }
}

function editAnuncio(id) {
  const a = (STATE.ads||[]).find(x=>x.id===id);
  if (!a) return;
  document.getElementById('ad-id').value = a.id;
  document.getElementById('ad-produto').value = a.produto||'';
  document.getElementById('ad-titulo').value = a.titulo||'';
  document.getElementById('ad-texto').value = a.texto||'';
  document.getElementById('ad-orcamento').value = a.orcamento_diario||'';
  document.getElementById('ad-publico').value = a.publico||'';
  document.querySelectorAll('.ad-plat').forEach(c=>{ c.checked = (a.plataformas||[]).includes(c.value); });
  AD_ARTES = Array.isArray(a.artes) ? a.artes.slice() : (a.imagem ? [{url:a.imagem,nome:'arte'}] : []);
  renderArtesPreview();
  document.getElementById('ad-titulo').scrollIntoView({behavior:'smooth',block:'center'});
}

async function deleteAnuncio(id) {
  if (!confirm('Excluir este anúncio? Esta ação não pode ser desfeita.')) return;
  try {
    await api('/api/eco/anuncios/'+id,{method:'DELETE'});
    toast('Anúncio excluído.');
    renderAnuncios();
  } catch(e) { toast('❌ Erro ao excluir.','error'); }
}

function resetAdForm() {
  document.getElementById('ad-id').value = '';
  document.getElementById('ad-produto').value = '';
  document.getElementById('ad-titulo').value = '';
  document.getElementById('ad-texto').value = '';
  document.getElementById('ad-orcamento').value = '';
  document.getElementById('ad-publico').value = '';
  document.querySelectorAll('.ad-plat').forEach(c=>{ c.checked = (c.value==='meta'||c.value==='google'); });
  AD_ARTES = [];
  renderArtesPreview();
}

function copyAdLink(btn, encoded) {
  const link = decodeURIComponent(encoded);
  const done = ()=>{ const o=btn.innerHTML; btn.innerHTML='<i class="fa fa-check"></i>'; setTimeout(()=>btn.innerHTML=o,1200); };
  if (navigator.clipboard) navigator.clipboard.writeText(link).then(done).catch(done);
  else done();
}

/* ══════════════════════════════════════════════════════
   UTM / TRAFFIC SOURCES REPORT
══════════════════════════════════════════════════════ */
function renderUTMReport() {
  const orders = STATE.orders.filter(o => o.utm && (o.utm.utm_source || o.utm.utm_medium || o.utm.utm_campaign));
  const total  = orders.length;
  const revenue = orders.reduce((s,o) => s + (o.total||0), 0);

  // Agrega por fonte/mídia/campanha
  const sources = {};
  orders.forEach(o => {
    const src  = o.utm.utm_source   || '(desconhecido)';
    const med  = o.utm.utm_medium   || '(direto)';
    const camp = o.utm.utm_campaign || '(sem campanha)';
    const key  = `${src} / ${med}`;
    if (!sources[key]) sources[key] = { source: src, medium: med, orders: 0, revenue: 0, campaigns: {} };
    sources[key].orders++;
    sources[key].revenue += o.total || 0;
    sources[key].campaigns[camp] = (sources[key].campaigns[camp] || 0) + 1;
  });

  const rows = Object.values(sources).sort((a,b) => b.revenue - a.revenue);
  const topSrc = rows[0]?.source || '—';

  // KPIs
  document.getElementById('utm-orders-total').textContent = total || '—';
  document.getElementById('utm-revenue-tracked').textContent = total ? 'R$ '+fmt(revenue) : '—';
  document.getElementById('utm-top-source').textContent = topSrc;

  // Tabela
  const wrap = document.getElementById('utm-table-wrap');
  if (!rows.length) {
    wrap.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);font-size:.84rem"><i class="fa fa-chart-pie" style="font-size:2rem;opacity:.25;display:block;margin-bottom:8px"></i>Nenhum pedido rastreado por UTM ainda.<br>Crie links com UTM usando o gerador abaixo.</div>';
    return;
  }
  wrap.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:.83rem">
      <thead>
        <tr style="background:var(--bg);text-align:left">
          <th style="padding:10px 12px;font-weight:700;color:var(--muted);font-size:.72rem;text-transform:uppercase">Fonte / Mídia</th>
          <th style="padding:10px 12px;font-weight:700;color:var(--muted);font-size:.72rem;text-transform:uppercase">Campanhas</th>
          <th style="padding:10px 12px;font-weight:700;color:var(--muted);font-size:.72rem;text-transform:uppercase;text-align:right">Pedidos</th>
          <th style="padding:10px 12px;font-weight:700;color:var(--muted);font-size:.72rem;text-transform:uppercase;text-align:right">Receita</th>
          <th style="padding:10px 12px;font-weight:700;color:var(--muted);font-size:.72rem;text-transform:uppercase;text-align:right">% do Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r,i) => {
          const pct = revenue > 0 ? Math.round(r.revenue / revenue * 100) : 0;
          const camps = Object.keys(r.campaigns).slice(0,3).join(', ');
          const srcIcon = {facebook:'👍',instagram:'📸',google:'🔍',email:'📧',whatsapp:'💬',organic:'🌱'}[r.source] || '📌';
          return `
          <tr style="border-top:1px solid var(--border);${i===0?'background:#f0fdf4':''}">
            <td style="padding:10px 12px">
              <span style="font-size:1rem;margin-right:6px">${srcIcon}</span>
              <b>${esc(r.source)}</b>
              <span style="color:var(--muted);font-size:.78rem"> / ${esc(r.medium)}</span>
            </td>
            <td style="padding:10px 12px;color:var(--muted);font-size:.8rem">${esc(camps)||'—'}</td>
            <td style="padding:10px 12px;text-align:right;font-weight:700">${r.orders}</td>
            <td style="padding:10px 12px;text-align:right;font-weight:700;color:var(--green)">R$ ${fmt(r.revenue)}</td>
            <td style="padding:10px 12px;text-align:right">
              <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px">
                <div style="width:60px;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
                  <div style="width:${pct}%;height:100%;background:var(--green);border-radius:3px"></div>
                </div>
                <span style="font-size:.78rem;color:var(--muted)">${pct}%</span>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

/* ── UTM Link Generator ──────────────────────────────────────── */
function generateUTM() {
  const base   = window.location.origin;
  const page   = document.getElementById('utm-page').value || '';
  const src    = document.getElementById('utm-src').value.trim().replace(/\s+/g,'-').toLowerCase();
  const med    = document.getElementById('utm-med').value.trim().replace(/\s+/g,'-').toLowerCase();
  const camp   = document.getElementById('utm-camp').value.trim().replace(/\s+/g,'-').toLowerCase();
  const cont   = document.getElementById('utm-cont').value.trim().replace(/\s+/g,'-').toLowerCase();
  if (!src || !med || !camp) { toast('Preencha Fonte, Mídia e Campanha.','error'); return; }
  const params = new URLSearchParams();
  params.set('utm_source', src);
  params.set('utm_medium', med);
  params.set('utm_campaign', camp);
  if (cont) params.set('utm_content', cont);
  const url = `${base}${page}?${params.toString()}`;
  document.getElementById('utm-link-out').value = url;
  document.getElementById('utm-result').style.display = 'block';
}
function copyUTMLink() {
  const inp = document.getElementById('utm-link-out');
  inp.select(); document.execCommand('copy');
  toast('✅ Link copiado!');
}
/* ══════════════════════════════════════════════════════
   COUPONS
══════════════════════════════════════════════════════ */
function renderCoupons() {
  const list = STATE.coupons || [];
  const el = document.getElementById('coupons-list');
  const cnt = document.getElementById('coupons-count');
  if(cnt) cnt.textContent = list.filter(c=>c.active).length;
  if(!el) return;
  if(!list.length) { el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.82rem">Nenhum cupom criado ainda.</div>'; return; }
  el.innerHTML = list.map(c=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
      <div>
        <div style="display:flex;align-items:center;gap:8px">
          <b style="font-size:.88rem;letter-spacing:1px">${c.code}</b>
          <span class="badge ${c.active?'green':'gray'}" style="font-size:.6rem">${c.active?'Ativo':'Inativo'}</span>
        </div>
        <div style="font-size:.75rem;color:var(--muted);margin-top:2px">
          ${c.discount_type==='percent'?c.discount_value+'% OFF':'R$ '+c.discount_value+' OFF'}
          ${c.max_uses?` · ${c.uses||0}/${c.max_uses} usos`:` · ${c.uses||0} usos`}
          ${c.expires_at?` · expira ${new Date(c.expires_at).toLocaleDateString('pt-BR')}`:''}
        </div>
        <div style="font-size:.72rem;color:var(--muted)">${c.description||''}</div>
      </div>
      <div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-icon" onclick="toggleCoupon('${c.id}',${!c.active})" title="${c.active?'Desativar':'Ativar'}">
          <i class="fa fa-${c.active?'eye-slash':'eye'}" style="color:var(--muted)"></i>
        </button>
        <button class="btn btn-ghost btn-icon" onclick="deleteCoupon('${c.id}','${c.code}')" title="Excluir">
          <i class="fa fa-trash" style="color:var(--red)"></i>
        </button>
      </div>
    </div>`).join('');
}
async function createCoupon() {
  const code     = document.getElementById('cup-code').value.trim().toUpperCase();
  const type     = document.getElementById('cup-type').value;
  const value    = document.getElementById('cup-value').value;
  const maxUses  = document.getElementById('cup-max').value;
  const expires  = document.getElementById('cup-expires').value;
  const desc     = document.getElementById('cup-desc').value.trim();
  if(!code||!value) { toast('Preencha o código e o valor do desconto.','error'); return; }
  try {
    const coupon = await api('/api/admin/coupons',{method:'POST',body:JSON.stringify({
      code, discount_type:type, discount_value:value,
      max_uses: maxUses&&maxUses!=='0'?maxUses:null,
      expires_at: expires||null, description: desc
    })});
    STATE.coupons.push(coupon);
    renderCoupons();
    document.getElementById('cup-code').value='';
    document.getElementById('cup-value').value='';
    document.getElementById('cup-max').value='';
    document.getElementById('cup-expires').value='';
    document.getElementById('cup-desc').value='';
    toast('✅ Cupom '+coupon.code+' criado!');
  } catch(e) { toast('❌ Erro ao criar cupom.','error'); }
}
async function toggleCoupon(id, active) {
  const idx = STATE.coupons.findIndex(c=>c.id===id);
  if(idx===-1) return;
  STATE.coupons[idx].active = active;
  api('/api/admin/coupons/'+id,{method:'PUT',body:JSON.stringify({active})}).catch(()=>{});
  renderCoupons();
  toast(active?'Cupom ativado!':'Cupom desativado.');
}
async function deleteCoupon(id, code) {
  if(!confirm(`Excluir o cupom "${code}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await api('/api/admin/coupons/'+id,{method:'DELETE'});
    STATE.coupons = STATE.coupons.filter(c=>c.id!==id);
    renderCoupons();
    toast('Cupom excluído.');
  } catch(e) { toast('❌ Erro ao excluir cupom.','error'); }
}

function saveSEO() {
  STATE.settings.seo_title = document.getElementById('seo-title').value;
  STATE.settings.seo_description = document.getElementById('seo-description').value;
  STATE.settings.seo_keywords = document.getElementById('seo-keywords').value;
  api('/api/admin/settings',{method:'PUT',body:JSON.stringify(STATE.settings)}).catch(()=>{});
  toast('SEO atualizado!');
}
function saveBanner() {
  STATE.settings.featured_banner = document.getElementById('banner-text').value;
  api('/api/admin/settings',{method:'PUT',body:JSON.stringify(STATE.settings)}).catch(()=>{});
  toast('Banner atualizado! Recarregue a loja para ver.');
}

/* ══════════════════════════════════════════════════════
   SETTINGS
══════════════════════════════════════════════════════ */
function loadSettingsForm() {
  const s = STATE.settings;
  document.getElementById('cfg-store-name').value = s.store_name||'';
  document.getElementById('cfg-email').value = s.store_email||'';
  document.getElementById('cfg-whatsapp').value = s.whatsapp||'';
  document.getElementById('cfg-store-address').value = s.store_address||'';
  document.getElementById('cfg-store-cep').value = s.store_cep||'';
  document.getElementById('cfg-instagram').value = s.instagram||'';
  document.getElementById('cfg-pix-key').value  = s.pix_key||'';
  document.getElementById('cfg-pix-name').value = s.pix_name||'TopFood Embalagens';
  document.getElementById('cfg-pix-city').value = s.pix_city||'SAO PAULO';
  if (s.pix_key) {
    document.getElementById('pix-key-preview').style.display = '';
    document.getElementById('pix-key-val').textContent = s.pix_key;
  }
  // OpenPix
  document.getElementById('cfg-openpix-id').value = ''; // token nunca é retornado ao client
  if (s.openpix_configured) {
    document.getElementById('openpix-status').style.display = '';
    document.getElementById('cfg-openpix-id').placeholder = '*** App ID já configurado — cole um novo para alterar ***';
  }
  // Mostra URL do webhook
  const wh = document.getElementById('webhookUrlDisplay');
  if (wh) wh.textContent = (s.base_url || window.location.origin) + '/api/pix-webhook';
  document.getElementById('cfg-mp-token').value = s.mp_access_token||'';
  document.getElementById('cfg-mp-pubkey').value = s.mp_public_key||'';
  document.getElementById('cfg-free-shipping').value = s.free_shipping_above||'0';
  document.getElementById('cfg-min-order').value = s.min_order_units||'50';
  document.getElementById('cfg-melhor-envio').value = s.melhor_envio_token||'';
  document.getElementById('cfg-notif-email').value = s.notification_email||'';
  document.getElementById('cfg-base-url').value = s.base_url||window.location.origin;
  document.getElementById('cfg-pixel-id').value  = s.meta_pixel_id||'';
  document.getElementById('cfg-gtm-id').value    = s.gtm_id||'';
  document.getElementById('cfg-gads-id').value   = s.google_ads_id||'';
  document.getElementById('cfg-gads-label').value= s.google_ads_label||'';
}
async function saveSettings() {
  const np = document.getElementById('cfg-new-pass').value;
  const cp = document.getElementById('cfg-confirm-pass').value;
  if(np && np!==cp) { toast('As senhas não coincidem','error'); return; }
  const s = STATE.settings;
  s.store_name        = document.getElementById('cfg-store-name').value;
  s.store_email       = document.getElementById('cfg-email').value;
  s.whatsapp          = document.getElementById('cfg-whatsapp').value;
  s.store_address     = document.getElementById('cfg-store-address').value;
  s.store_cep         = document.getElementById('cfg-store-cep').value;
  s.instagram         = document.getElementById('cfg-instagram').value;
  s.pix_key           = document.getElementById('cfg-pix-key').value.trim();
  s.pix_name          = document.getElementById('cfg-pix-name').value.trim().slice(0,25);
  s.pix_city          = document.getElementById('cfg-pix-city').value.trim().toUpperCase().slice(0,15);
  // OpenPix: só atualiza se o campo tiver valor (não sobrescreve com vazio)
  const openpixVal = document.getElementById('cfg-openpix-id').value.trim();
  if (openpixVal) s.openpix_app_id = openpixVal;
  s.mp_access_token   = document.getElementById('cfg-mp-token').value;
  s.mp_public_key     = document.getElementById('cfg-mp-pubkey').value;
  s.free_shipping_above = +document.getElementById('cfg-free-shipping').value;
  s.min_order_units   = +document.getElementById('cfg-min-order').value;
  s.melhor_envio_token= document.getElementById('cfg-melhor-envio').value;
  s.notification_email= document.getElementById('cfg-notif-email').value;
  s.meta_pixel_id     = document.getElementById('cfg-pixel-id').value.trim();
  s.gtm_id            = document.getElementById('cfg-gtm-id').value.trim();
  s.google_ads_id     = document.getElementById('cfg-gads-id').value.trim();
  s.google_ads_label  = document.getElementById('cfg-gads-label').value.trim();
  s.tiktok_pixel_id   = document.getElementById('cfg-tiktok-pixel')?.value?.trim() || STATE.settings.tiktok_pixel_id || '';
  s.base_url          = document.getElementById('cfg-base-url').value.trim();

  // Troca de senha — atualiza users.json via API (não settings)
  if (np) {
    try {
      const me = await api('/api/admin/me');
      const meId = me.user?.id || me.userId;
      if (meId && meId !== 'legacy') {
        await api('/api/admin/users/' + meId, { method:'PUT', body: JSON.stringify({ password: np }) });
        toast('🔑 Senha alterada com sucesso!');
      } else {
        s.admin_password = np; // fallback para token legacy
      }
    } catch(e) { toast('⚠️ Não foi possível alterar a senha.', 'error'); }
    document.getElementById('cfg-new-pass').value    = '';
    document.getElementById('cfg-confirm-pass').value = '';
  }

  try {
    await api('/api/admin/settings',{method:'PUT',body:JSON.stringify(s)});
    if (!np) toast('✅ Configurações salvas! Pixels ativos na próxima visita à loja.');
  } catch(e) { toast('Configurações salvas localmente (inicie o servidor para persistir)','info'); }
}

/* ══════════════════════════════════════════════════════
   BADGES / COUNTERS
══════════════════════════════════════════════════════ */
function updateBadges() {
  const pendingOrders = STATE.orders.filter(o=>o.status==='paid'||o.status==='pending').length;
  const aband = STATE.abandoned.filter(a=>!a.recovered).length;
  const unreadMsgs = (STATE.contact_messages||[]).filter(m=>!m.read).length;
  document.getElementById('badge-orders').textContent = pendingOrders;
  document.getElementById('badge-abandoned').textContent = aband;
  document.getElementById('badge-orders').style.display = pendingOrders?'':'none';
  document.getElementById('badge-abandoned').style.display = aband?'':'none';
  const bc = document.getElementById('badge-contact');
  if (bc) { bc.textContent = unreadMsgs; bc.style.display = unreadMsgs?'':'none'; }
}

/* ══════════════════════════════════════════════════════
   ONLINE COUNTER (real — visitantes únicos nos últimos 5 min)
══════════════════════════════════════════════════════ */
function startOnlineCounter() {
  async function update() {
    try {
      const r = await api('/api/eco/online');
      STATE.onlineCount = r.online;
      document.getElementById('online-count').textContent = STATE.onlineCount;
      document.getElementById('kpi-online').textContent   = STATE.onlineCount;
    } catch(e) {}
  }
  update();
  setInterval(update, 30000);
}

/* ══════════════════════════════════════════════════════
   MODAL
══════════════════════════════════════════════════════ */
function showModal() { document.getElementById('modal-overlay').classList.remove('hidden'); }
function closeModal(e) {
  if(!e || e.target===document.getElementById('modal-overlay')) {
    document.getElementById('modal-overlay').classList.add('hidden');
  }
}

/* ══════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════ */

/* ── Nota Fiscal (NF-e) ───────────────────────────────── */
function nfeVal(id){ const e=document.getElementById(id); return e? e.value.trim() : ''; }
async function loadNfeConfig(){
  try{
    const c = await api('/api/eco/nfe/config');
    const st = document.getElementById('nfe-status');
    if(st){
      if(c.configurado) st.innerHTML = '<div style="background:#dcfce7;color:#166534;padding:12px 16px;border-radius:8px;font-weight:600">Configuracao completa &mdash; pronto para emitir ('+c.ambiente+')</div>';
      else st.innerHTML = '<div style="background:#fef9c3;color:#854d0e;padding:12px 16px;border-radius:8px">Ainda falta preencher: <strong>'+((c.faltam||[]).join(', ')||'-')+'</strong></div>';
    }
    if(c.ambiente) document.getElementById('nfe-ambiente').value=c.ambiente;
    if(c.ncm) document.getElementById('nfe-ncm').value=c.ncm;
    if(c.cfop_dentro) document.getElementById('nfe-cfop-dentro').value=c.cfop_dentro;
    if(c.cfop_fora) document.getElementById('nfe-cfop-fora').value=c.cfop_fora;
    if(c.csosn) document.getElementById('nfe-csosn').value=c.csosn;
    const th=document.getElementById('nfe-token-homologacao'); if(th&&c.tem_token_homologacao) th.placeholder='(token ja salvo — deixe em branco p/ manter)';
    const tp=document.getElementById('nfe-token-producao');   if(tp&&c.tem_token_producao)   tp.placeholder='(token ja salvo — deixe em branco p/ manter)';
  }catch(e){ toast('Erro ao carregar config fiscal','error'); }
}
async function saveNfeConfig(){
  const body = {
    ambiente: nfeVal('nfe-ambiente'),
    token_homologacao: nfeVal('nfe-token-homologacao'),
    token_producao: nfeVal('nfe-token-producao'),
    inscricao_estadual: nfeVal('nfe-ie'),
    regime_tributario: parseInt(nfeVal('nfe-regime'))||1,
    ncm: nfeVal('nfe-ncm'), cest: nfeVal('nfe-cest'),
    cfop_dentro: nfeVal('nfe-cfop-dentro'), cfop_fora: nfeVal('nfe-cfop-fora'),
    csosn: nfeVal('nfe-csosn'), unidade: nfeVal('nfe-unidade')
  };
  if(!body.token_homologacao) delete body.token_homologacao;
  if(!body.token_producao) delete body.token_producao;
  try{
    const r = await api('/api/eco/nfe/config',{method:'POST',body:JSON.stringify(body)});
    toast(r.configurado ? 'Salvo! Configuracao completa.' : 'Salvo. Falta: '+((r.faltam||[]).join(', ')||'-'));
    loadNfeConfig();
  }catch(e){ toast('Erro ao salvar configuracao','error'); }
}

function toast(msg, type='success') {
  const icons = {success:'fa-circle-check',error:'fa-circle-xmark',info:'fa-circle-info'};
  const t = document.createElement('div');
  t.className = 'toast '+(type==='error'?'error':type==='info'?'info':'');
  t.innerHTML = `<i class="fa ${icons[type]||icons.success}"></i>${msg}`;
  document.getElementById('toasts').appendChild(t);
  setTimeout(()=>t.remove(), 3500);
}

/* ══════════════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════════════ */
function fmt(n) { return Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtDate(d) { return new Date(d).toLocaleDateString('pt-BR'); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function timeAgo(d) {
  const diff = (Date.now()-new Date(d))/1000;
  if(diff<60) return 'agora';
  if(diff<3600) return Math.floor(diff/60)+'min atrás';
  if(diff<86400) return Math.floor(diff/3600)+'h atrás';
  return Math.floor(diff/86400)+'d atrás';
}
function statusLabel(s) {
  return {
    delivered:      'Entregue',
    shipped:        'Enviado',
    paid:           'Pago',
    pending:        'Pendente',
    aguardando_pix: '🟢 Aguardando PIX',
    cancelled:      'Cancelado',
  }[s] || s;
}
function payLabel(p) {
  return {
    pix:            '🟢 PIX',
    whatsapp:       '💬 WhatsApp',
    mercadopago:    '💳 Mercado Pago',
    credit_card:    '💳 Cartão',
    boleto:         '📄 Boleto',
    mercado_livre:  '🛒 Mercado Livre',
  }[p] || (p || '—');
}
function contactWA(phone,name,orderId) {
  const msg = orderId
    ? encodeURIComponent(`Olá ${name}! Aqui é a TopFood Embalagens. Estou entrando em contato sobre o pedido ${orderId}.`)
    : encodeURIComponent(`Olá ${name}! Aqui é a TopFood Embalagens.`);
  window.open(`https://wa.me/55${phone}?text=${msg}`,'_blank');
}
function exportCSV(type) {
  let rows=[], filename='';
  if(type==='orders') {
    filename='pedidos-topfood.csv';
    rows=[['ID','Cliente','Email','Telefone','Total','Status','Pagamento','Data'],...STATE.orders.map(o=>[o.id,o.customer.name,o.customer.email,o.customer.phone,o.total,statusLabel(o.status),payLabel(o.payment_method),fmtDate(o.date)])];
  } else if(type==='customers') {
    filename='clientes-topfood.csv';
    const cs=buildCustomers();
    rows=[['Nome','Email','Telefone','Endereço','CEP','Cidade','Estado','Pedidos','Total Gasto','Cadastro'],...cs.map(c=>[c.name,c.email||'',c.phone||'',c.address||'',c.cep||'',c.city||'',c.state||'',c.orders||0,c.total_spent||0,c.registered_at?fmtDate(c.registered_at):''])];
  } else if(type==='newsletter') {
    filename='newsletter-topfood.csv';
    // Deduplica por e-mail — pega o nome do pedido mais recente
    const seen = new Map();
    STATE.orders.forEach(o => { if(!seen.has(o.customer.email)) seen.set(o.customer.email, o.customer.name); });
    rows=[['Email','Nome'],...[...seen.entries()].map(([email,name])=>[email,name])];
  } else if(type==='products') {
    filename='precos-custos-topfood.csv';
    rows=[['Produto','Categoria','Pacote (un)','Preço venda','Custo','Lucro R$','Margem %']];
    STATE.products.forEach(p=>{
      (p.variants||[]).forEach(v=>{
        const custo  = parseFloat(v.cost)||0;
        const lucro  = (v.price||0) - custo;
        const margem = v.price ? ((lucro/v.price)*100).toFixed(1) : '0.0';
        rows.push([p.name, p.category||'', v.units, v.price||0, custo, lucro.toFixed(2), margem]);
      });
    });
  }
  if(!rows.length) return;
  const csv=rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,﻿'+encodeURIComponent(csv);
  a.download=filename; a.click();
  toast('Exportação concluída!');
}

/* ══════════════════════════════════════════════════════
   DEMO DATA (fallback when no server)
══════════════════════════════════════════════════════ */
const DEMO_ORDERS = [
  {id:'TF-2026-001',mp_id:'MP-001',date:'2026-05-25T09:15:00Z',customer:{name:'Maria Santos',email:'maria.santos@gmail.com',phone:'11999001234'},items:[{name:'Embalagem de Pastel (pacote 50 un)',qty:2,unit_price:45,total:90}],shipping:{method:'PAC',price:28.50,address:'Rua das Flores, 123',city:'São Paulo',state:'SP',cep:'01310-100',days:'7 a 14 dias úteis'},subtotal:90,total:118.50,status:'delivered',payment_method:'pix',tracking_code:'BR000001234BR',notes:''},
  {id:'TF-2026-002',mp_id:'MP-002',date:'2026-05-24T14:30:00Z',customer:{name:'João Pereira',email:'joao.pereira@hotmail.com',phone:'21988002345'},items:[{name:'Embalagem de Hamburguer (pacote 100 un)',qty:1,unit_price:80,total:80}],shipping:{method:'SEDEX',price:45,address:'Av. Atlântica, 456',city:'Rio de Janeiro',state:'RJ',cep:'22010-000',days:'2 a 3 dias úteis'},subtotal:80,total:125,status:'shipped',payment_method:'credit_card',tracking_code:'BR000002345BR',notes:''},
  {id:'TF-2026-003',mp_id:'MP-003',date:'2026-05-24T10:00:00Z',customer:{name:'Ana Lima',email:'ana.lima@gmail.com',phone:'31977003456'},items:[{name:'Embalagem de Churros (pacote 250 un)',qty:1,unit_price:220,total:220},{name:'Embalagem de Fritas (pacote 50 un)',qty:1,unit_price:38,total:38}],shipping:{method:'PAC',price:32,address:'Rua Bahia, 789',city:'Belo Horizonte',state:'MG',cep:'30160-011',days:'7 a 14 dias úteis'},subtotal:258,total:290,status:'paid',payment_method:'pix',tracking_code:'',notes:'Cliente solicitou entrega urgente'},
  {id:'TF-2026-004',mp_id:'MP-004',date:'2026-05-23T16:45:00Z',customer:{name:'Carlos Oliveira',email:'carlos.delivery@gmail.com',phone:'11966004567'},items:[{name:'Embalagem de Hamburguer (pacote 250 un)',qty:2,unit_price:185,total:370}],shipping:{method:'SEDEX',price:52,address:'Rua Oscar Freire, 321',city:'São Paulo',state:'SP',cep:'01426-001',days:'2 a 3 dias úteis'},subtotal:370,total:422,status:'paid',payment_method:'credit_card',tracking_code:'',notes:''},
  {id:'TF-2026-005',mp_id:'MP-005',date:'2026-05-23T08:20:00Z',customer:{name:'Fernanda Costa',email:'fercosta@outlook.com',phone:'41955005678'},items:[{name:'Embalagem de Pastel (pacote 100 un)',qty:3,unit_price:85,total:255}],shipping:{method:'PAC',price:38,address:'Rua XV de Novembro, 500',city:'Curitiba',state:'PR',cep:'80020-310',days:'7 a 14 dias úteis'},subtotal:255,total:293,status:'delivered',payment_method:'boleto',tracking_code:'BR000005678BR',notes:''},
  {id:'TF-2026-006',mp_id:'MP-006',date:'2026-05-22T11:10:00Z',customer:{name:'Roberto Mendes',email:'robmendes@gmail.com',phone:'51944006789'},items:[{name:'Embalagem de Fritas (pacote 250 un)',qty:1,unit_price:168,total:168},{name:'Embalagem de Churros (pacote 100 un)',qty:2,unit_price:95,total:190}],shipping:{method:'PAC',price:42,address:'Av. Ipiranga, 1200',city:'Porto Alegre',state:'RS',cep:'90160-093',days:'7 a 14 dias úteis'},subtotal:358,total:400,status:'pending',payment_method:'boleto',tracking_code:'',notes:'Aguardando compensação do boleto'},
  {id:'TF-2026-007',mp_id:'MP-007',date:'2026-05-21T15:00:00Z',customer:{name:'Patrícia Rocha',email:'patrocha@gmail.com',phone:'85933007890'},items:[{name:'Embalagem de Pastel (pacote 50 un)',qty:1,unit_price:45,total:45}],shipping:{method:'PAC',price:25,address:'Rua Tibúrcio, 800',city:'Fortaleza',state:'CE',cep:'60125-100',days:'7 a 14 dias úteis'},subtotal:45,total:70,status:'cancelled',payment_method:'credit_card',tracking_code:'',notes:'Cartão recusado'},
  {id:'TF-2026-008',mp_id:'MP-008',date:'2026-05-21T09:30:00Z',customer:{name:'Lucas Almeida',email:'lucasalm@gmail.com',phone:'71922008901'},items:[{name:'Embalagem de Hamburguer (pacote 50 un)',qty:4,unit_price:42,total:168}],shipping:{method:'SEDEX',price:48,address:'Rua Chile, 230',city:'Salvador',state:'BA',cep:'40020-030',days:'2 a 3 dias úteis'},subtotal:168,total:216,status:'shipped',payment_method:'pix',tracking_code:'BR000008901BR',notes:''},
];
const DEMO_PRODUCTS = [
  {id:'pastel',name:'Embalagem de Pastel — Pillow Box',category:'pastel',description:'Embalagem pillow box preta.',image:'images/01 - Pastel.png',badge:'MAIS VENDIDO',badgeColor:'green',stars:5,active:true,sold:156,variants:[{units:50,price:45},{units:100,price:85},{units:250,price:195}]},
  {id:'churros',name:'Embalagem de Churros — Caixa Tubular',category:'churros',description:'Caixa tubular longa.',image:'images/02 - churrros fechado.png',badge:'NOVIDADE',badgeColor:'blue',stars:5,active:true,sold:89,variants:[{units:50,price:50},{units:100,price:95},{units:250,price:220}]},
  {id:'burger',name:'Embalagem de Hamburguer — Caixa Delivery',category:'hamburger',description:'Caixa delivery gourmet.',image:'images/04 - Hamburguer.png',badge:'PROMOÇÃO',badgeColor:'orange',stars:5,active:true,sold:203,variants:[{units:50,price:42},{units:100,price:80},{units:250,price:185}]},
  {id:'fritas',name:'Embalagem de Fritas — Cone e Balde',category:'fritas',description:'Cone e balde para fritas.',image:'images/05 - fritas abertas.png',badge:'',badgeColor:'',stars:4,active:true,sold:124,variants:[{units:50,price:38},{units:100,price:72},{units:250,price:168}]},
];
const DEMO_SETTINGS = {store_name:'TopFood Embalagens',store_email:'contato@topfoodembalagens.com.br',whatsapp:'5511988856367',instagram:'',admin_password:'topfood2026',mp_access_token:'',mp_public_key:'',seo_title:'TopFood Embalagens — Embalagens que valorizam seu alimento',seo_description:'Embalagens food service para restaurantes.',seo_keywords:'embalagens food service',featured_banner:'Novidades 2026 chegando!',min_order_units:50,free_shipping_above:0};
const DEMO_ABANDONED = [
  {id:'AB-001',date:'2026-05-25T08:45:00Z',cep:'01310-100',items:[{name:'Embalagem de Pastel (pacote 100 un)',qty:2,price:85},{name:'Embalagem de Fritas (pacote 50 un)',qty:1,price:38}],total:208,recovered:false},
  {id:'AB-002',date:'2026-05-24T17:20:00Z',cep:'20040-020',items:[{name:'Embalagem de Hamburguer (pacote 250 un)',qty:1,price:185}],total:185,recovered:false},
  {id:'AB-003',date:'2026-05-24T11:05:00Z',cep:'30130-110',items:[{name:'Embalagem de Churros (pacote 100 un)',qty:3,price:95}],total:285,recovered:true},
];

// Auto-load if already logged in
if(sessionStorage.getItem('admin-token')) {
  document.getElementById('login-wrap').classList.add('hidden');
  document.getElementById('admin-app').classList.remove('hidden');
  initApp();
}
/* ══════════════════════════════════════════════════════
   M2 — AD CENTER
══════════════════════════════════════════════════════ */
function loadAdCenter() {
  const s = STATE.settings;
  loadBudgets();
  document.getElementById('ac-meta-pixel').value  = s.meta_pixel_id    || '';
  document.getElementById('ac-gtm-id').value      = s.gtm_id           || '';
  document.getElementById('ac-gads-id').value     = s.google_ads_id    || '';
  document.getElementById('ac-gads-label').value  = s.google_ads_label || '';
  document.getElementById('ac-tiktok-pixel').value= s.tiktok_pixel_id  || '';
  updateAdStatus();
}

function updateAdStatus() {
  const items = [
    { key: 'meta',   inputId: 'ac-meta-pixel',   label: 'Meta Pixel' },
    { key: 'gtm',    inputId: 'ac-gtm-id',        label: 'GTM' },
    { key: 'gads',   inputId: 'ac-gads-id',       label: 'Google Ads' },
    { key: 'tiktok', inputId: 'ac-tiktok-pixel',  label: 'TikTok Pixel' },
  ];
  items.forEach(({ key, inputId, label }) => {
    const val   = (document.getElementById(inputId)?.value || '').trim();
    const badge = document.getElementById('ac-badge-' + key);
    const valEl = document.getElementById('ac-val-' + key);
    if (!badge || !valEl) return;
    if (val) {
      badge.textContent = '✅ Ativo';
      badge.style.background = 'var(--green)';
      valEl.textContent = val;
      valEl.style.color = 'var(--text)';
    } else {
      badge.textContent = 'Não configurado';
      badge.style.background = 'var(--muted)';
      valEl.textContent = '—';
      valEl.style.color = 'var(--muted)';
    }
  });
}

async function saveAdCenter() {
  const updates = {
    meta_pixel_id:    document.getElementById('ac-meta-pixel').value.trim(),
    gtm_id:           document.getElementById('ac-gtm-id').value.trim(),
    google_ads_id:    document.getElementById('ac-gads-id').value.trim(),
    google_ads_label: document.getElementById('ac-gads-label').value.trim(),
    tiktok_pixel_id:  document.getElementById('ac-tiktok-pixel').value.trim(),
  };
  try {
    Object.assign(STATE.settings, updates);
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(STATE.settings) });
    updateAdStatus();
    toast('✅ Pixels salvos com sucesso!');
  } catch(e) {
    toast('❌ Erro ao salvar: ' + e.message, 'error');
  }
}

function gerarUTM() {
  const base   = 'https://topfoodembalagens.com.br/';
  const source = document.getElementById('utm-source')?.value || '';
  const medium = document.getElementById('utm-medium')?.value || '';
  const camp   = (document.getElementById('utm-campaign-name')?.value || '').trim().replace(/\s+/g, '-').toLowerCase();
  if (!camp) { toast('⚠️ Informe o nome da campanha'); return; }
  const link = `${base}?utm_source=${source}&utm_medium=${medium}&utm_campaign=${encodeURIComponent(camp)}`;
  document.getElementById('utm-generated-link').value = link;
}

function copiarUTM() {
  const el = document.getElementById('utm-generated-link');
  if (!el || !el.value) { toast('⚠️ Gere um link primeiro'); return; }
  navigator.clipboard.writeText(el.value).then(() => toast('✅ Link copiado!')).catch(() => {
    el.select(); document.execCommand('copy'); toast('✅ Copiado!');
  });
}


/* ══════════════════════════════════════════════════════
   M3 — ORÇAMENTO DE ANÚNCIOS
══════════════════════════════════════════════════════ */
const PLATFORM_META = { key:'meta',   label:'Meta Ads',    emoji:'📘', color:'#1877F2' };
const PLATFORM_GADS = { key:'google', label:'Google Ads',  emoji:'🔍', color:'#34A853' };
const PLATFORM_TKTK = { key:'tiktok', label:'TikTok Ads',  emoji:'🎵', color:'#000000' };
const ALL_PLATFORMS = [PLATFORM_META, PLATFORM_GADS, PLATFORM_TKTK];

let _budgetData = [];

async function loadBudgets() {
  try {
    const data = await api('/api/eco/budget');
    if (data.ok) { _budgetData = data.budgets; renderBudgetCards(); }
  } catch(e) {
    console.warn('Budget load error:', e);
    const c = document.getElementById('budget-cards');
    if (c) c.innerHTML = '<div style="color:var(--muted);padding:12px">Erro ao carregar orçamentos. Recarregue a página.</div>';
  }
}

function renderBudgetCards() {
  const container = document.getElementById('budget-cards');
  if (!container) return;
  if (!_budgetData.length) { container.innerHTML = '<div style="color:var(--muted)">Nenhum dado de orçamento.</div>'; return; }

  container.innerHTML = ALL_PLATFORMS.map(plat => {
    const b = _budgetData.find(x => x.platform === plat.key) || { monthly_budget: 0, current_spend: 0 };
    const budget  = parseFloat(b.monthly_budget) || 0;
    const spent   = parseFloat(b.current_spend)  || 0;
    const pct     = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
    const remaining = Math.max(0, budget - spent);
    const alertColor = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--orange)' : 'var(--green)';
    const barColor   = pct >= 100 ? '#ef4444'    : pct >= 80 ? '#f97316'       : plat.color;

    return `
    <div class="kpi-card" style="position:relative">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span style="font-size:1.4rem">${plat.emoji}</span>
        <div>
          <div style="font-weight:800;font-size:.9rem">${plat.label}</div>
          ${budget === 0 ? '<div style="font-size:.72rem;color:var(--muted)">Sem orçamento definido</div>' : ''}
        </div>
        <button onclick="openBudgetEdit('${plat.key}')" title="Editar orçamento"
          style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--muted);font-size:.85rem">
          <i class="fa fa-pen"></i>
        </button>
      </div>

      ${budget > 0 ? `
      <!-- Barra de progresso -->
      <div style="background:var(--border);border-radius:99px;height:8px;margin-bottom:10px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${barColor};border-radius:99px;transition:width .4s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.75rem;color:var(--muted);margin-bottom:8px">
        <span>Gasto: <strong style="color:var(--text)">R$ ${spent.toFixed(2).replace('.',',')}</strong></span>
        <span style="color:${alertColor};font-weight:700">${pct}%</span>
      </div>
      <div style="font-size:.8rem">
        <span style="color:var(--muted)">Budget: </span>
        <strong>R$ ${budget.toFixed(2).replace('.',',')}</strong>
        &nbsp;·&nbsp;
        <span style="color:${remaining===0?'var(--red)':'var(--green)'}">
          ${remaining === 0 ? '⚠️ Esgotado' : 'Restam R$ ' + remaining.toFixed(2).replace('.',',')}
        </span>
      </div>
      ${pct >= 80 ? `<div style="margin-top:8px;padding:6px 10px;background:#fef3c720;border:1px solid #fde68a;border-radius:6px;font-size:.75rem;color:#92400e">
        ${pct >= 100 ? '🚨 Orçamento esgotado!' : '⚠️ Atenção: acima de 80%'}
      </div>` : ''}
      ` : `
      <button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="openBudgetEdit('${plat.key}')">
        <i class="fa fa-plus"></i> Definir orçamento
      </button>
      `}
    </div>`;
  }).join('');
}

function openBudgetEdit(platform) {
  const plat = ALL_PLATFORMS.find(p => p.key === platform);
  const b = _budgetData.find(x => x.platform === platform) || { monthly_budget: 0 };
  const val = prompt(`${plat.emoji} ${plat.label} — Orçamento mensal (R$):`, b.monthly_budget || '');
  if (val === null) return;
  const num = parseFloat(String(val).replace(',','.'));
  if (isNaN(num) || num < 0) { toast('⚠️ Valor inválido'); return; }
  saveBudget(platform, num);
}

async function saveBudget(platform, monthly_budget) {
  try {
    const data = await api(`/api/eco/budget/${platform}`, {
      method: 'PUT', body: JSON.stringify({ monthly_budget })
    });
    if (!data.ok) throw new Error(data.error || 'Falha ao salvar');
    toast('✅ Orçamento salvo!');
    await loadBudgets();
  } catch(e) {
    toast(String(e.message).includes('403') ? '❌ Apenas o proprietário pode alterar orçamentos' : '❌ Erro: ' + e.message, 'error');
  }
}

async function registerSpend() {
  const platform = document.getElementById('budget-spend-platform')?.value;
  const amount   = parseFloat(document.getElementById('budget-spend-amount')?.value || '0');
  if (!platform || isNaN(amount) || amount <= 0) { toast('⚠️ Preencha plataforma e valor'); return; }
  try {
    const data = await api(`/api/eco/budget/${platform}/spend`, {
      method: 'POST', body: JSON.stringify({ amount })
    });
    if (!data.ok) throw new Error(data.error || 'Falha');
    toast('✅ Gasto registrado!');
    document.getElementById('budget-spend-amount').value = '';
    await loadBudgets();
  } catch(e) {
    toast(String(e.message).includes('403') ? '❌ Apenas o proprietário pode registrar gastos' : '❌ Erro: ' + e.message, 'error');
  }
}

async function resetBudgetMonth() {
  if (!confirm('Zerar os gastos de todas as plataformas para o novo mês?')) return;
  try {
    for (const plat of ALL_PLATFORMS) {
      const b = _budgetData.find(x => x.platform === plat.key);
      if (b) await api(`/api/eco/budget/${plat.key}`, {
        method: 'PUT', body: JSON.stringify({ monthly_budget: b.monthly_budget })
      });
    }
    toast('✅ Gastos zerados para o novo mês!');
    await loadBudgets();
  } catch(e) { toast('❌ Erro ao zerar: ' + e.message, 'error'); }
}



/* ══════════════════════════════════════════════════════
   M5 — IA ATENDENTE WHATSAPP
══════════════════════════════════════════════════════ */
let atQrTimer = null;

function loadAtendente(){ atRefresh(); atLoadConversas(); atLoadPausados(); loadWaOficial(); waLoadConversas(); }

// ─── Caixa de entrada do WhatsApp Oficial ───
let WA_CURRENT_PHONE = null;
async function waLoadConversas(){
  const list = document.getElementById('wa-conv-list');
  const view = document.getElementById('wa-conv-view');
  if(!list || !view) return;
  view.style.display='none'; list.style.display='flex';
  let convs=[];
  try{ const r=await api('/api/eco/wa/conversas'); convs=r.conversas||[]; }catch(e){}
  if(!convs.length){ list.innerHTML='<div style="text-align:center;padding:24px;color:var(--muted);font-size:.85rem">Nenhuma conversa ainda. Quando um cliente mandar mensagem, ela aparece aqui.</div>'; return; }
  list.innerHTML = convs.map(c=>`
    <div onclick="waOpenConversa('${c.phone}')" style="cursor:pointer;border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;gap:8px">
      <div style="min-width:0">
        <div style="font-weight:700;font-size:.88rem">${escapeHtml(c.name||c.phone)} ${c.unread?('<span style="background:var(--red);color:#fff;font-size:.65rem;padding:1px 6px;border-radius:10px">'+c.unread+'</span>'):''}</div>
        <div style="font-size:.76rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(c.last||'')}</div>
      </div>
      <div style="font-size:.68rem;color:var(--muted);white-space:nowrap">${c.updated?new Date(c.updated).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):''}</div>
    </div>`).join('');
}
async function waOpenConversa(phone){
  WA_CURRENT_PHONE=phone;
  const list=document.getElementById('wa-conv-list');
  const view=document.getElementById('wa-conv-view');
  let conv={messages:[]};
  try{ const r=await api('/api/eco/wa/conversas/'+encodeURIComponent(phone)); conv=r.conversa||conv; }catch(e){}
  list.style.display='none'; view.style.display='block';
  document.getElementById('wa-conv-header').textContent = (conv.name||phone)+' · '+phone;
  const box=document.getElementById('wa-conv-msgs');
  box.innerHTML = (conv.messages||[]).map(m=>{
    const mine = m.dir==='out';
    return `<div style="align-self:${mine?'flex-end':'flex-start'};max-width:80%;background:${mine?'#dcf8c6':'#fff'};border:1px solid var(--border);border-radius:10px;padding:6px 10px;font-size:.82rem;color:#111">${escapeHtml(m.text)}<div style="font-size:.62rem;color:#666;margin-top:2px;text-align:right">${m.ts?new Date(m.ts).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):''}</div></div>`;
  }).join('');
  box.scrollTop=box.scrollHeight;
}
function waVoltarLista(){ waLoadConversas(); }
async function waReply(){
  const phone=WA_CURRENT_PHONE; const inp=document.getElementById('wa-reply-text');
  const text=(inp.value||'').trim();
  if(!phone||!text) return;
  try{ await api('/api/eco/wa/send',{method:'POST',body:JSON.stringify({phone,text})}); inp.value=''; waOpenConversa(phone); }
  catch(e){ toast('❌ Erro ao enviar. Verifique o token do WhatsApp.','error'); }
}

// ─── WhatsApp Oficial (Cloud API) ───
async function loadWaOficial(){
  try{
    const s = await api('/api/eco/wa/status');
    const url = document.getElementById('wa-webhook-url');
    const vt  = document.getElementById('wa-verify-token');
    const st  = document.getElementById('wa-oficial-status');
    if(url) url.value = s.webhook_url || '';
    if(vt)  vt.value  = s.verify_token || '';
    if(st){
      const d = s.diag || {};
      let base = s.configurado ? ('✅ configurado') : '⚠️ não configurado';
      base += ' · nº salvo: '+(d.numero_salvo?'SIM':'NÃO')+' · token salvo: '+(d.token_salvo?('SIM ('+d.token_tam+' car.)'):'NÃO');
      if(s.total_chamadas){
        const u = s.ultima_chamada;
        const q = u ? new Date(u.ts).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';
        base += ' · 📡 Meta bateu '+s.total_chamadas+'x (última '+q+', '+(u?u.mensagens:0)+' msg)';
      } else {
        base += ' · 📡 Meta ainda NÃO bateu no servidor';
      }
      st.innerHTML = base;
    }
  }catch(e){}
}
async function saveWaOficial(){
  const phone_number_id = (document.getElementById('wa-phone-id').value||'').trim();
  const token = (document.getElementById('wa-token').value||'').trim();
  const body = {};
  if(phone_number_id) body.phone_number_id = phone_number_id;
  if(token) body.token = token;
  if(!Object.keys(body).length){ toast('Preencha o número ID e/ou cole o token.','error'); return; }
  try{
    await api('/api/eco/wa/config',{method:'PUT',body:JSON.stringify(body)});
    document.getElementById('wa-token').value=''; // não deixa a senha na tela
    toast('✅ Credenciais do WhatsApp oficial salvas!');
    loadWaOficial();
  }catch(e){ toast('❌ Erro ao salvar credenciais.','error'); }
}

async function atRefresh() {
  try {
    const s = await api('/api/eco/atendente/status');
    const mapa = { conectado:'✅ conectado', aguardando_qr:'🔄 aguardando QR', desconectado:'⚠️ desconectado' };
    document.getElementById('at-conexao').textContent = mapa[s.conexao] || s.conexao;
    document.getElementById('at-enabled').textContent = s.enabled ? '✅ ativa' : '⏸️ desligada';
    document.getElementById('at-apikey').textContent = s.apiKeyOk ? '✅ ok' : '⚠️ falta ANTHROPIC_API_KEY';
    document.getElementById('at-pausados').textContent = s.pausados;
    document.getElementById('at-recebidas').textContent = s.stats.recebidas;
    document.getElementById('at-respondidas').textContent = s.stats.respondidas;
    document.getElementById('at-escaladas').textContent = s.stats.escaladas;
    document.getElementById('at-cfg-enabled').checked = s.enabled;
    document.getElementById('at-cfg-autostart').checked = s.autostart;
    document.getElementById('at-cfg-notify').value = s.notifyNumber || '';
    document.getElementById('at-cfg-prompt').value = s.promptExtra || '';
    if (s.temQR) atShowQR(); else document.getElementById('at-qr-box').style.display = 'none';
  } catch(e) { toast('Erro ao carregar status do atendente', 'error'); }
}

async function atShowQR() {
  try {
    const r = await api('/api/eco/atendente/qr');
    if (r.qr) {
      document.getElementById('at-qr-img').src = r.qr;
      document.getElementById('at-qr-box').style.display = 'block';
    }
    if (r.conexao === 'conectado') {
      document.getElementById('at-qr-box').style.display = 'none';
      clearInterval(atQrTimer); atQrTimer = null;
      toast('WhatsApp conectado!');
      atRefresh();
    }
  } catch(e) {}
}

async function atStart() {
  try {
    await api('/api/eco/atendente/start', { method:'POST' });
    toast('Iniciando conexão — o QR aparece em alguns segundos…');
    if (!atQrTimer) atQrTimer = setInterval(atShowQR, 3000);
  } catch(e) { toast('Erro ao iniciar: ' + e.message, 'error'); }
}

async function atStop() {
  try {
    await api('/api/eco/atendente/stop', { method:'POST' });
    clearInterval(atQrTimer); atQrTimer = null;
    toast('Atendente parado.'); atRefresh();
  } catch(e) { toast('Erro ao parar', 'error'); }
}

async function atLogout() {
  if (!confirm('Desparear o WhatsApp? Será preciso escanear um novo QR.')) return;
  try {
    await api('/api/eco/atendente/logout', { method:'POST' });
    toast('Sessão removida.'); atRefresh();
  } catch(e) { toast('Erro ao desparear', 'error'); }
}

async function atSaveCfg() {
  try {
    await api('/api/eco/atendente/config', { method:'POST', body: JSON.stringify({
      enabled: document.getElementById('at-cfg-enabled').checked,
      autostart: document.getElementById('at-cfg-autostart').checked,
      notifyNumber: document.getElementById('at-cfg-notify').value,
      promptExtra: document.getElementById('at-cfg-prompt').value
    })});
    toast('Configuração salva!'); atRefresh();
  } catch(e) { toast('Erro ao salvar', 'error'); }
}

async function atLoadConversas() {
  try {
    const lista = await api('/api/eco/atendente/conversas');
    const icone = { cliente:'👤', ia:'🤖', sistema:'ℹ️', erro:'❌' };
    document.getElementById('at-conversas').innerHTML = lista.map(function(l){
      const hora = new Date(l.ts).toLocaleString('pt-BR');
      const num = (l.jid || '').replace('@s.whatsapp.net','');
      return '<div style="padding:6px;border-bottom:1px solid rgba(128,128,128,.2)">'
        + (icone[l.tipo]||'·') + ' <b>' + num + '</b> <span style="opacity:.6">' + hora + '</span><br>'
        + String(l.texto||'').replace(/</g,'&lt;') + '</div>';
    }).join('') || '<p>Nenhuma conversa ainda.</p>';
  } catch(e) {}
}


async function atLoadPausados() {
  try {
    const lista = await api('/api/eco/atendente/pausados');
    const el = document.getElementById('at-pausados-lista');
    if (!lista.length) { el.innerHTML = '<p>Nenhum chat pausado.</p>'; return; }
    el.innerHTML = lista.map(function(p){
      return '<div style="display:flex;align-items:center;gap:12px;padding:8px;border-bottom:1px solid rgba(128,128,128,.2)">'
        + '<div style="flex:1"><b>' + p.numero + '</b><br><span style="opacity:.7;font-size:12px">'
        + p.motivo + ' · IA volta sozinha em ' + (p.expiraEmMin > 60 ? Math.round(p.expiraEmMin/60) + 'h' : p.expiraEmMin + 'min') + '</span></div>'
        + '<button class="btn btn-primary" onclick="atResume(\'' + p.jid + '\')">▶️ Retomar IA agora</button></div>';
    }).join('');
  } catch(e) {}
}

async function atResume(jid) {
  try {
    await api('/api/eco/atendente/chat-resume', { method:'POST', body: JSON.stringify({ jid: jid }) });
    toast('IA retomada nesse chat!');
    atLoadPausados(); atRefresh();
  } catch(e) { toast('Erro ao retomar', 'error'); }
}


/* ══════════════════════════════════════════════════════
   M15 — INTELIGÊNCIA (IA Gestora · Camada 1)
══════════════════════════════════════════════════════ */
function inList(elId, arr, fmt) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!arr || !arr.length) { el.innerHTML = '<p style="opacity:.6">Ainda sem dados — vão aparecer conforme os clientes navegam.</p>'; return; }
  el.innerHTML = arr.map(function(x){
    return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(128,128,128,.15)">' + fmt(x) + '</div>';
  }).join('');
}

async function loadInsights() {
  try {
    const d = await api('/api/eco/insights');
    document.getElementById('in-eventos').textContent = d.resumo.eventos;
    document.getElementById('in-pedidos').textContent = d.resumo.pedidos;
    document.getElementById('in-fat').textContent = 'R$ ' + Number(d.resumo.faturamento||0).toFixed(2).replace('.',',');
    document.getElementById('in-aband').textContent = d.resumo.carrinhos_abandonados;
    inList('in-buscas', d.buscas_top, function(x){ return '<span>'+x.ref+'</span><b>'+x.n+'</b>'; });
    inList('in-vistos', d.produtos_vistos, function(x){ return '<span>'+x.ref+'</span><b>'+x.n+'</b>'; });
    inList('in-carts', d.produtos_add_carrinho, function(x){ return '<span>'+x.ref+'</span><b>'+x.n+'</b>'; });
    inList('in-oport', d.oportunidades, function(o){ return '<span>'+o.id+'</span><b>'+o.views+' views · '+o.conversao+'% carrinho</b>'; });
  } catch(e) { toast('Erro ao carregar inteligência', 'error'); }
  iaRender();   // inicializa/mostra o chat da IA Gestora
  loadMetrics(); // M7: dashboard de métricas reais (Windsor)
}

/* ── M7: Dashboard de Métricas de Marketing (via Windsor) ── */
async function loadMetrics(force) {
  const box = document.getElementById('mkt-metrics');
  if (!box) return;
  box.innerHTML = '<p style="opacity:.6">Carregando métricas reais…</p>';
  try {
    const r = await api('/api/eco/metrics' + (force ? '?force=1' : ''));
    if (!r || !r.ok || !r.configured) {
      box.innerHTML = '<p style="opacity:.7">Métricas de marketing ainda não conectadas (WINDSOR_API_KEY ausente no servidor).</p>';
      return;
    }
    const f = (r.data && r.data.fontes) || {};
    box.innerHTML = mktOrganico(f.busca_google) + mktLocal(f.google_meu_negocio) + mktAds(f.anuncios_pagos);
  } catch (e) {
    box.innerHTML = '<p style="color:#CC0000">Erro ao carregar métricas: ' + (e.message || e) + '</p>';
  }
}
function mktStat(label, val) {
  return '<div style="background:rgba(128,128,128,.08);border-radius:8px;padding:9px 14px;min-width:110px">'
    + '<div style="font-size:1.2rem;font-weight:800">' + val + '</div>'
    + '<div style="font-size:.7rem;opacity:.65">' + label + '</div></div>';
}
function mktRow(items) { return '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 4px">' + items.join('') + '</div>'; }
function mktBlock(title, inner) {
  return '<div style="border-top:1px solid rgba(128,128,128,.15);padding:12px 0"><div style="font-weight:700;margin-bottom:6px">' + title + '</div>' + inner + '</div>';
}
function mktOrganico(g) {
  if (!g || g.indisponivel) return mktBlock('🔍 Orgânico (Google)', '<p style="opacity:.6">' + ((g && g.indisponivel) || 'sem dados') + '</p>');
  const stats = mktRow([ mktStat('Impressões', g.total_impressoes || 0), mktStat('Cliques', g.total_cliques || 0), mktStat('CTR', g.ctr || '0%') ]);
  const op = (g.oportunidades_pagina2a4 || []).slice(0, 6).map(function (o) {
    return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(128,128,128,.12);font-size:.84rem"><span>' + o.termo + '</span><b>pos ' + o.posicao + ' · ' + o.impressoes + ' impr</b></div>';
  }).join('');
  return mktBlock('🔍 Orgânico (Google Search Console)', stats + (op ? '<div style="font-size:.78rem;opacity:.7;margin:10px 0 4px">⭐ Oportunidades (página 2-4 — empurrar p/ a 1ª):</div>' + op : ''));
}
function mktLocal(l) {
  if (!l || l.indisponivel) return mktBlock('📍 Local (Meu Negócio)', '<p style="opacity:.6">' + ((l && l.indisponivel) || 'sem dados') + '</p>');
  return mktBlock('📍 Local (Google Meu Negócio)', mktRow([
    mktStat('Aparições', l.aparicoes_maps_busca || 0), mktStat('Cliques no site', l.cliques_site || 0),
    mktStat('Pedidos de rota', l.pedidos_rota || 0), mktStat('Avaliações', (l.avaliacoes || 0) + ' (' + (l.nota_media || 0) + '★)')
  ]));
}
function mktAds(a) {
  if (!a) return mktBlock('📢 Anúncios pagos', '<p style="opacity:.6">sem dados</p>');
  return mktBlock('📢 Anúncios pagos', mktAdsOne('Meta (Facebook/Instagram)', a.meta_ads) + mktAdsOne('Google Ads', a.google_ads));
}
function mktAdsOne(nome, x) {
  if (!x) return '';
  if (x.sem_dados)    return '<div style="margin:6px 0;font-size:.85rem"><b>' + nome + ':</b> <span style="opacity:.6">' + (x.nota || 'sem dados ainda') + '</span></div>';
  if (x.indisponivel) return '<div style="margin:6px 0;font-size:.85rem"><b>' + nome + ':</b> <span style="opacity:.6">' + x.indisponivel + '</span></div>';
  const camp = (x.campanhas || []).slice(0, 5).map(function (c) {
    const caro = Number(c.cpc) >= 0.40;
    return '<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid rgba(128,128,128,.1);font-size:.8rem"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">' + c.campanha + '</span><b>R$ ' + c.gasto + ' · CPC R$ ' + c.cpc + (caro ? ' 🔴' : ' ✅') + '</b></div>';
  }).join('');
  return '<div style="margin:10px 0"><div style="font-weight:700;margin-bottom:4px">' + nome + '</div>'
    + mktRow([ mktStat('Gasto', 'R$ ' + (x.gasto || 0)), mktStat('Cliques', x.cliques || 0), mktStat('CPC médio', 'R$ ' + (x.cpc_medio || 0)), mktStat('CTR', x.ctr || '0%') ])
    + camp + '</div>';
}

/* ── Chat com a IA Gestora (conversa com histórico) ── */
var iaChatHistory = [];   // [{role:'user'|'assistant', content:'...'}]
var iaChatBusy = false;

function iaEscape(s){ return String(s).replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); }
function iaMarkdown(s){
  return iaEscape(s)
    .replace(/^###\s+(.+)$/gm, '<b style="font-size:1.02em">$1</b>')
    .replace(/^##\s+(.+)$/gm,  '<b style="font-size:1.05em">$1</b>')
    .replace(/^#\s+(.+)$/gm,   '<b style="font-size:1.1em">$1</b>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/^\s*[-*]\s+(.+)$/gm, '• $1')
    .replace(/\n/g, '<br>');
}
function iaRender(){
  var box = document.getElementById('in-chat');
  if (!box) return;
  if (!iaChatHistory.length && !iaChatBusy){
    box.innerHTML = '<p style="opacity:.55;margin:auto;text-align:center;max-width:420px">Pergunte qualquer coisa sobre o site: o que estão buscando, qual produto anunciar primeiro, onde está perdendo cliente… A conversa fica salva enquanto você estiver aqui.</p>';
    return;
  }
  var html = iaChatHistory.map(function(m){
    var mine = m.role === 'user';
    var style = mine
      ? 'align-self:flex-end;background:var(--primary,#e11d2a);color:#fff;border-bottom-right-radius:4px'
      : 'align-self:flex-start;background:#fff;color:#111;border:1px solid rgba(128,128,128,.2);border-bottom-left-radius:4px';
    var body = mine ? iaEscape(m.content) : iaMarkdown(m.content);
    return '<div style="max-width:82%;padding:10px 13px;border-radius:14px;line-height:1.5;'+style+'">'+body+'</div>';
  }).join('');
  if (iaChatBusy) html += '<div style="align-self:flex-start;opacity:.6;font-style:italic;padding:6px 4px">🤔 Analisando os dados do site…</div>';
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
}
async function iaSend(pergunta){
  if (iaChatBusy) return;
  pergunta = (pergunta || '').trim();
  if (!pergunta) return;
  iaChatHistory.push({ role:'user', content: pergunta });
  iaChatBusy = true; iaRender();
  document.getElementById('in-send').disabled = true;
  try {
    var r = await api('/api/eco/insights/perguntar', { method:'POST', body: JSON.stringify({ messages: iaChatHistory }) });
    iaChatHistory.push({ role:'assistant', content: r.resposta || r.error || 'Sem resposta.' });
  } catch(e) {
    iaChatHistory.push({ role:'assistant', content: 'Erro: ' + e.message });
  }
  iaChatBusy = false;
  document.getElementById('in-send').disabled = false;
  iaRender();
}
function askIAFromBox(){
  var ta = document.getElementById('in-pergunta');
  var q = ta.value.trim();
  if (!q) { toast('Escreva uma mensagem', 'error'); return; }
  ta.value = ''; iaAutoGrow(ta);
  iaSend(q);
}
function iaQuick(q){ iaSend(q); }
function askIA(q){ iaSend(q); }   // compat: chamadas antigas
function iaChatReset(){ iaChatHistory = []; iaChatBusy = false; iaRender(); }
function iaChatKey(ev){ if (ev.key === 'Enter' && !ev.shiftKey){ ev.preventDefault(); askIAFromBox(); } }
function iaAutoGrow(el){ el.style.height='auto'; el.style.height=Math.min(120, el.scrollHeight)+'px'; }
