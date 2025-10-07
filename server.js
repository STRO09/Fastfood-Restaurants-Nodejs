// restaurant.js (updated: conditional logout visible only when admin is logged in)
const PORT = 4000;
const http = require("http");
const {db} = require('./Connectdb');
const { URL, URLSearchParams } = require("url");

// small HTML escape helper
function esc(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// universal page wrapper (includes utf-8 meta)
// NEW: accepts isAdmin flag as third parameter to show Logout/Manage when admin is logged in
function page(title, innerHtml, isAdmin = false) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body{ background:#f6f7f9; padding-top:72px; }
    .kiosk{ background:#fff; padding:18px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.06); }
    .menu-card{ min-height:150px; }
    .orders-list{ max-height:320px; overflow:auto; }
  </style>
</head>
<body>
<nav class="navbar navbar-dark bg-dark fixed-top">
  <div class="container">
    <a class="navbar-brand" href="/">Node-Resto</a>
    <div>
      ${isAdmin
        ? `<a class="btn btn-sm btn-outline-light me-2" href="/manage">Manage</a><a class="btn btn-sm btn-outline-light" href="/logout">Logout</a>`
        : `<a class="btn btn-sm btn-outline-light" href="/admin">Admin Login</a>`}
    </div>
  </div>
</nav>

<div class="container py-3">${innerHtml}</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;
}

// parse POST body and preserve multiple values for same key
function parseBody(req, cb) {
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    const params = new URLSearchParams(body);
    const obj = {};
    for (const key of params.keys()) {
      const vals = params.getAll(key);
      obj[key] = vals.length > 1 ? vals : vals[0];
    }
    cb(obj);
  });
}

// helper: auto-fulfill an order after 10s
function autoFulfill(orderId) {
  setTimeout(() => {
    db.query('UPDATE orders SET status = ? WHERE id = ? AND status = ?', ['FULFILLED', orderId, 'PENDING'], (err) => {
      if (err) console.error('autoFulfill error', err);
      else console.log('Order auto-fulfilled:', orderId);
    });
  }, 10000);
}

// fallback worker: in case server restarted, mark older pending orders fulfilled
setInterval(() => {
  const q = "UPDATE orders SET status='FULFILLED' WHERE status='PENDING' AND TIMESTAMPDIFF(SECOND, order_time, NOW()) >= 10";
  db.query(q, (err, result) => {
    if (err) return console.error('fulfill-worker error', err);
    if (result && result.affectedRows) console.log('fulfill-worker updated', result.affectedRows);
  });
}, 3000);

// RENDER: orders display used inside iframe (auto-refreshes)
function renderOrdersDisplay(req, res) {
  // pending first
  db.query("SELECT id, items, total, order_time FROM orders WHERE status='PENDING' ORDER BY order_time ASC", (err, pendingRows) => {
    if (err) { res.writeHead(500); res.end('DB error'); return; }

    // last 10 fulfilled
    db.query("SELECT id, items, total, order_time FROM orders WHERE status='FULFILLED' ORDER BY order_time DESC LIMIT 10", (err2, fulfilledRows) => {
      if (err2) { res.writeHead(500); res.end('DB error'); return; }

      // build HTML snippet for each order: parse JSON items
      function renderOrderCard(r) {
        let itemsList = '[]';
        try {
          const items = JSON.parse(r.items);
          itemsList = items.map(it => `${esc(it.name)}${it.qty && it.qty>1 ? ' x' + it.qty : ''}`).join(', ');
        } catch (e) { itemsList = esc(String(r.items || '')); }

        return `<div class="mb-2">
          <div class="d-flex justify-content-between">
            <div><strong>#${r.id}</strong> <small class="text-muted">${new Date(r.order_time).toLocaleTimeString()}</small></div>
            <div><strong>₹${Number(r.total).toFixed(2)}</strong></div>
          </div>
          <div class="small text-muted">${itemsList}</div>
        </div>`;
      }

      const pendingHtml = pendingRows.length ? pendingRows.map(r => `<div class="border rounded p-2 mb-2 bg-warning-subtle">${renderOrderCard(r)}</div>`).join('') : '<div class="alert alert-success">No pending orders</div>';
      const fulfilledHtml = fulfilledRows.length ? fulfilledRows.map(r => `<div class="border rounded p-2 mb-2 bg-light">${renderOrderCard(r)}</div>`).join('') : '<div class="text-muted">No recent fulfilled orders</div>';

      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="5">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>body{font-size:0.95rem;padding:8px;background:transparent}</style>
</head>
<body>
  <div class="row">
    <div class="col-md-6">
      <h6>Pending</h6>
      <div class="orders-list">${pendingHtml}</div>
    </div>
    <div class="col-md-6">
      <h6>Last 10 Fulfilled</h6>
      <div class="orders-list">${fulfilledHtml}</div>
    </div>
  </div>
</body>
</html>`;

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
  });
}

// RENDER: homepage (menu + iframe orders + place-order form)
function renderHome(req, res, category) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const placed = parsedUrl.searchParams.get('placed');

  const cat = (category || parsedUrl.searchParams.get('cat') || 'ALL').toUpperCase();

  const menuQ = cat === 'ALL' ? 'SELECT * FROM menu ORDER BY id' : 'SELECT * FROM menu WHERE category = ? ORDER BY id';
  const menuParams = cat === 'ALL' ? [] : [cat];

  db.query(menuQ, menuParams, (err, menuRows) => {
    if (err) { res.writeHead(500); res.end('DB error fetching menu'); return; }

    // build menu cards (ALL inside one form)
    const menuCards = menuRows.map(item => `
      <div class="col-md-4 mb-3">
        <div class="card menu-card h-100">
          <div class="card-body d-flex flex-column">
            <div class="d-flex justify-content-between mb-2">
              <h5 class="card-title mb-0">${esc(item.name)}</h5>
              <span class="badge bg-secondary">${esc(item.category)}</span>
            </div>
            <p class="card-text small flex-grow-1">${esc(item.description || '')}</p>
            <div class="d-flex align-items-center mt-2">
              <div class="me-2"><strong>₹${Number(item.price).toFixed(2)}</strong></div>
              <div class="form-check ms-auto">
                <input class="form-check-input" type="checkbox" name="menu" value="${item.id}" id="m${item.id}">
                <label class="form-check-label small" for="m${item.id}">Add</label>
              </div>
              <input type="number" name="qty_${item.id}" value="1" min="1" class="form-control form-control-sm ms-2" style="width:80px">
            </div>
          </div>
        </div>
      </div>`).join('');

    const filters = ['ALL','BURGER','FRIES','DRINK'].map(c => {
      const active = c === cat ? 'btn-primary' : 'btn-outline-primary';
      return `<a class="btn btn-sm ${active} me-1" href="/?cat=${c}">${c}</a>`;
    }).join(' ');

    const confirmBanner = placed ? `
      <div id="confirmBanner" class="alert alert-success text-center">
        Order <strong>#${esc(placed)}</strong> placed successfully.
      </div>
      <script>
        setTimeout(() => {
          const banner = document.getElementById('confirmBanner');
          if (banner) banner.style.display = 'none';
        }, 3000);
      </script>
    ` : '';

    const inner = `
      <div class="row mb-3">
        <div class="col-md-6">
          <div class="kiosk">
            <h5 class="mb-2">Kitchen Screen</h5>
            <iframe src="/orders_display" style="width:100%;height:360px;border:0;border-radius:6px" title="orders"></iframe>
          </div>
        </div>

        <div class="col-md-6">
          <div class="kiosk">
            <h5 class="mb-2">Place Order</h5>
            ${confirmBanner}
            <form action="/order" method="POST" id="placeOrder">
              <div class="mb-2"><small class="text-muted">Combo discount: 15% when you order at least 1 Burger + 1 Fries + 1 Drink.</small></div>
              <div class="mb-2">${filters}</div>
              <div class="row">${menuCards}</div>
              <div class="d-flex justify-content-between align-items-center mt-3">
                <div><small class="text-muted">Select items then press Place Order</small></div>
                <button class="btn btn-success" type="submit">Place Order</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    // pass isAdmin(req) so page() can render logout/manage
    res.end(page('Node-Resto', inner, isAdmin(req)));
  });
}

// HANDLE: place multi-item order
function handleOrder(req, res) {
  parseBody(req, (params) => {
    // extract selected menu items (checkboxes named 'menu')
    let selected = params.menu;
    if (!selected) {
      // no item selected -> redirect back
      res.writeHead(302, { Location: '/' });
      return res.end();
    }
    if (!Array.isArray(selected)) selected = [selected];
    // convert to ints
    selected = selected.map(s => parseInt(s)).filter(Boolean);
    if (!selected.length) {
      res.writeHead(302, { Location: '/' }); return res.end();
    }

    // fetch selected item details
    const q = 'SELECT id, name, category, price FROM menu WHERE id IN (?)';
    db.query(q, [selected], (err, rows) => {
      if (err) { res.writeHead(500); res.end('DB error'); return; }

      // build items array with quantities
      const items = rows.map(r => {
        const qtyKey = 'qty_' + r.id;
        let qty = 1;
        if (params[qtyKey]) {
          const parsed = parseInt(params[qtyKey]);
          if (!isNaN(parsed) && parsed > 0) qty = parsed;
        }
        return { id: r.id, name: r.name, category: r.category, price: Number(r.price), qty };
      });

      const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
      const cats = new Set(items.map(it => it.category));
      const combo = cats.has('BURGER') && cats.has('FRIES') && cats.has('DRINK');
      const discountRate = combo ? 0.15 : 0;
      const discount = Number((subtotal * discountRate).toFixed(2));
      const total = Number((subtotal - discount).toFixed(2));

      // insert order row
      const itemsJson = JSON.stringify(items);
      db.query('INSERT INTO orders (items, total, status) VALUES (?, ?, ?)', [itemsJson, total, 'PENDING'], (err2, result) => {
        if (err2) { console.error(err2); res.writeHead(500); res.end('DB insert error'); return; }
        const orderId = result.insertId;
        // auto-fulfill after 10s
        autoFulfill(orderId);
        // redirect home with confirmation
        res.writeHead(302, { Location: '/?placed=' + orderId });
        res.end();
      });
    });
  });
}

// ADMIN: simple login + manage (cookie-based minimal)
function renderAdminLogin(req, res) {
  const inner = `
    <div class="kiosk">
      <h5>Admin Login</h5>
      <form method="POST" action="/admin">
        <input name="username" class="form-control mb-2" placeholder="username">
        <input name="password" type="password" class="form-control mb-2" placeholder="password">
        <button class="btn btn-primary">Login</button>
        <a href="/" class="btn btn-link">Back</a>
      </form>
    </div>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page('Admin Login', inner, isAdmin(req)));
}

function handleAdminLogin(req, res) {
  parseBody(req, (params) => {
    const u = (params.username || '').trim();
    const p = (params.password || '').trim();

    if (u === 'admin' && p === 'admin') {
      // simple cookie (for local testing only)
      res.writeHead(302, {
        'Set-Cookie': 'admin=1; Path=/; HttpOnly',
        'Location': '/manage'
      });
      res.end();
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(page(
        'Admin Login',
        `<div class="alert alert-danger text-center">Invalid credentials</div>
         <a class="btn btn-primary mt-3" href="/admin">Back</a>`,
        isAdmin(req)
      ));
    }
  });
}

function handleAdminLogout(req, res) {
  // clear the cookie and redirect back to customer screen
  res.writeHead(302, {
    'Set-Cookie': 'admin=; Path=/; Max-Age=0', // expires immediately
    'Location': '/'
  });
  res.end();
}

// Check admin cookie
function isAdmin(req) {
  const cookie = req.headers.cookie || '';
  return cookie.split(';').map(s => s.trim()).some(c => c === 'admin=1');
}

// Admin manage page (add/update/delete)
function renderManage(req, res) {
  if (!isAdmin(req)) {
    res.writeHead(302, { Location: '/admin' }); res.end(); return;
  }
  db.query('SELECT * FROM menu ORDER BY id', (err, rows) => {
    if (err) { res.writeHead(500); res.end('DB error'); return; }
    const rowsHtml = rows.map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${esc(r.name)}</td>
        <td>₹${Number(r.price).toFixed(2)}</td>
        <td>${esc(r.category)}</td>
        <td>
          <a class="btn btn-sm btn-primary" href="/editItem?id=${r.id}">Edit</a>
          <a class="btn btn-sm btn-danger" href="/deleteItem?id=${r.id}">Delete</a>
        </td>
      </tr>`).join('');

    const inner = `
      <div class="kiosk">
        <h5>Manage Menu</h5>
        <form action="/addItem" method="POST" class="mb-3">
          <input name="name" class="form-control mb-2" placeholder="Name">
          <input name="price" class="form-control mb-2" placeholder="Price">
          <select name="category" class="form-select mb-2"><option>BURGER</option><option>FRIES</option><option>DRINK</option></select>
          <button class="btn btn-success">Add Item</button>
          <a class="btn btn-link" href="/">Back</a>
        </form>

        <table class="table">
          <thead><tr><th>ID</th><th>Name</th><th>Price</th><th>Category</th><th>Action</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page('Manage Menu', inner, isAdmin(req)));
  });
}

function handleAddItem(req, res) {
  if (!isAdmin(req)) { res.writeHead(302, { Location: '/admin' }); res.end(); return; }
  parseBody(req, (p) => {
    db.query('INSERT INTO menu (name, price, category) VALUES ( ?, ?, ?)', [p.name, p.price, p.category], (err) => {
      if (err) { res.writeHead(500); res.end('DB error'); return; }
      res.writeHead(302, { Location: '/manage' }); res.end();
    });
  });
}

function handleDeleteItem(req, res, parsedUrl) {
  if (!isAdmin(req)) { res.writeHead(302, { Location: '/admin' }); res.end(); return; }
  const id = new URL(parsedUrl, `http://${req.headers.host}`).searchParams.get('id');
  db.query('DELETE FROM menu WHERE id = ?', [id], (err) => {
    if (err) { res.writeHead(500); res.end('DB error'); return; }
    res.writeHead(302, { Location: '/manage' }); res.end();
  });
}

function renderEditItem(req, res, parsedUrl) {
  if (!isAdmin(req)) { res.writeHead(302, { Location: '/admin' }); res.end(); return; }
  const id = new URL(parsedUrl, `http://${req.headers.host}`).searchParams.get('id');
  db.query('SELECT * FROM menu WHERE id = ?', [id], (err, rows) => {
    if (err || !rows.length) { res.writeHead(404); res.end('Not found'); return; }
    const r = rows[0];
    const inner = `
      <div class="kiosk">
        <h5>Edit Item #${r.id}</h5>
        <form method="POST" action="/updateItem">
          <input type="hidden" name="id" value="${r.id}">
          <input name="name" class="form-control mb-2" value="${esc(r.name)}">
          <input name="price" class="form-control mb-2" value="${Number(r.price).toFixed(2)}">
          <select name="category" class="form-select mb-2"><option ${r.category==='BURGER'?'selected':''}>BURGER</option><option ${r.category==='FRIES'?'selected':''}>FRIES</option><option ${r.category==='DRINK'?'selected':''}>DRINK</option></select>
          <button class="btn btn-primary">Update</button>
          <a href="/manage" class="btn btn-link">Cancel</a>
        </form>
      </div>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page('Edit Item', inner, isAdmin(req)));
  });
}

function handleUpdateItem(req, res) {
  if (!isAdmin(req)) { res.writeHead(302, { Location: '/admin' }); res.end(); return; }
  parseBody(req, (p) => {
    db.query('UPDATE menu SET name=?, price=?, category=? WHERE id=?', [p.name, p.price, p.category, p.id], (err) => {
      if (err) { res.writeHead(500); res.end('DB error'); return; }
      res.writeHead(302, { Location: '/manage' }); res.end();
    });
  });
}

// Router
const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const path = parsed.pathname;

  if (path === '/orders_display' && req.method === 'GET') { renderOrdersDisplay(req, res); return; }
  if (path === '/' && req.method === 'GET') { renderHome(req, res); return; }
  if (path === '/order' && req.method === 'POST') { handleOrder(req, res); return; }

  // admin routes
  if (path === '/admin' && req.method === 'GET') { renderAdminLogin(req, res); return; }
  if (path === '/admin' && req.method === 'POST') { handleAdminLogin(req, res); return; }
  if (path === '/logout' && req.method === 'GET') {handleAdminLogout(req, res); return;}
  if (path === '/manage' && req.method === 'GET') { renderManage(req, res); return; }
  if (path === '/addItem' && req.method === 'POST') { handleAddItem(req, res); return; }
  if (path === '/deleteItem' && req.method === 'GET') { handleDeleteItem(req, res, req.url); return; }
  if (path === '/editItem' && req.method === 'GET') { renderEditItem(req, res, req.url); return; }
  if (path === '/updateItem' && req.method === 'POST') { handleUpdateItem(req, res); return; }

  // fallback 404
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page('Not found', '<div class="p-3"><h5>404 - Not Found</h5><a href="/">Home</a></div>', isAdmin(req)));
});

server.listen(PORT, () => console.log(`Server listening http://localhost:${PORT}`));