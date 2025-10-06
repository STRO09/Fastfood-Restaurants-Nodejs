// restaurant.js
const http = require('http');
const { db } = require('./Connectdb');

const PORT = 4000;

// escape HTML
function esc(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// simple layout with Bootstrap and auto-refresh meta
function layout(title, inner) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { padding-top: 72px; background: #f1f3f5; }
    .menu-card { min-height: 170px; }
    .strike { text-decoration: line-through; color: #888; margin-right: 6px; }
    .kiosk { background: #fff; padding: 18px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .orders-list { max-height: 360px; overflow:auto; }
  </style>
</head>
<body>
<nav class="navbar navbar-expand-lg navbar-dark bg-dark fixed-top">
  <div class="container">
    <a class="navbar-brand" href="/">Node-Resto</a>
    <div class="collapse navbar-collapse">
      <ul class="navbar-nav ms-auto">
        <li class="nav-item"><a class="nav-link" href="/?cat=ALL">All</a></li>
        <li class="nav-item"><a class="nav-link" href="/?cat=BURGER">Burgers</a></li>
        <li class="nav-item"><a class="nav-link" href="/?cat=FRIES">Fries</a></li>
        <li class="nav-item"><a class="nav-link" href="/?cat=DRINK">Drinks</a></li>
      </ul>
    </div>
  </div>
</nav>

<div class="container">${inner}</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;
}

// parse POST body
function parseBody(req, cb) {
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    const params = new URLSearchParams(body);
    const obj = {};
    for (const key of params.keys()) {
      const values = params.getAll(key); // <-- ensures multiple checkboxes are captured
      obj[key] = values.length > 1 ? values : values[0];
    }
    cb(null, obj);
  });
}

// background worker: mark PENDING orders older than 10 seconds as FULFILLED
setInterval(() => {
  const q = "UPDATE orders SET status='FULFILLED' WHERE status='PENDING' AND TIMESTAMPDIFF(SECOND, order_time, NOW()) >= 10";
  db.query(q, (err, result) => {
    if (err) return console.error('Fulfill worker error:', err);
    if (result.affectedRows > 0) console.log('Fulfilled orders:', result.affectedRows);
  });
}, 2000); // runs every 2 seconds

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;
  const method = req.method;

  // Root: menu + place-order form + top: pending + last 10 fulfilled
  if (pathname === '/' && method === 'GET') {
    const cat = (parsed.searchParams.get('cat') || 'ALL').toUpperCase();

    // get pending orders and last 10 fulfilled
    const pendingQ = `SELECT id, items, total, order_time FROM orders WHERE status='PENDING' ORDER BY order_time ASC`;
    const fulfilledQ = `SELECT id, items, total, order_time FROM orders WHERE status='FULFILLED' ORDER BY order_time DESC LIMIT 10`;

    db.query(pendingQ, (err, pendingRows) => {
      if (err) { res.writeHead(500); return res.end('DB error pending'); }

      db.query(fulfilledQ, (err, fulfilledRows) => {
        if (err) { res.writeHead(500); return res.end('DB error fulfilled'); }

        // fetch menu, optionally filter by category
        const menuQ = cat === 'ALL' ? 'SELECT * FROM menu ORDER BY id' : 'SELECT * FROM menu WHERE category = ? ORDER BY id';
        const menuParams = cat === 'ALL' ? [] : [cat];

        db.query(menuQ, menuParams, (err, menuRows) => {
          if (err) { res.writeHead(500); return res.end('DB error menu'); }

          // build orders UI
          function renderOrderShort(r) {
            let items;
            try { items = JSON.parse(r.items); } catch (e) { items = []; }
            return `<div class="mb-2">
              <div class="d-flex justify-content-between">
                <div>Order <strong>#${r.id}</strong></div>
                <div><strong>₹${Number(r.total).toFixed(2)}</strong></div>
              </div>
              <div class="small text-muted">${new Date(r.order_time).toLocaleString()}</div>
              <div class="small">${items.map(it => esc(it.name) + (it.qty && it.qty>1 ? ' x' + it.qty : '')).join(', ')}</div>
            </div>`;
          }

          const pendingHtml = pendingRows.length === 0 ? '<div class="alert alert-success">No pending orders</div>' : pendingRows.map(r => `<div class="border rounded p-2 mb-2 bg-warning-subtle">${renderOrderShort(r)}</div>`).join('');
          const fulfilledHtml = fulfilledRows.length === 0 ? '<div class="text-muted">No recent fulfilled orders</div>' : fulfilledRows.map(r => `<div class="border rounded p-2 mb-2 bg-light">${renderOrderShort(r)}</div>`).join('');

          // menu UI: checkboxes to allow multiple selections. We'll send menu[] values with value=itemId::price
          // menu UI: checkboxes to allow multiple selections
          const menuCards = menuRows.map(item => {
            return `<div class="col-md-4 mb-3">
              <div class="card menu-card">
                <div class="card-body d-flex flex-column">
                  <div class="d-flex justify-content-between mb-2">
                    <h5 class="card-title mb-0">${esc(item.name)}</h5>
                    <span class="badge bg-secondary">${esc(item.category)}</span>
                  </div>
                  <p class="card-text flex-grow-1 small">${esc(item.name)}</p>
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
            </div>`;
          }).join('');


          // Build the full inner HTML
          const inner = `
          <div class="row mb-3">
            <div class="col-md-6">
              <div class="kiosk">
                <h4 class="mb-2">Kitchen Screen</h4>
                <div class="mb-2"><small class="text-muted">Pending Orders</small></div>
                <div class="orders-list mb-3">${pendingHtml}</div>

                <hr/>
                <div><small class="text-muted">Last 10 Fulfilled Orders</small></div>
                <div class="orders-list mt-2">${fulfilledHtml}</div>
              </div>
            </div>

            <div class="col-md-6">
              <div class="kiosk">
                <h4 class="mb-2">Place Order</h4>
                <form id="placeOrder" action="/order" method="POST">
                  <div class="mb-3">
                    <label class="form-label">Customer name (optional)</label>
                    <input name="customer" class="form-control" placeholder="Table/Name">
                  </div>

                  <div class="mb-3">
                    <label class="form-label">Filter: </label>
                    <div>
                      <a class="btn btn-sm btn-outline-primary me-1" href="/?cat=ALL">All</a>
                      <a class="btn btn-sm btn-outline-primary me-1" href="/?cat=BURGER">Burgers</a>
                      <a class="btn btn-sm btn-outline-primary me-1" href="/?cat=FRIES">Fries</a>
                      <a class="btn btn-sm btn-outline-primary me-1" href="/?cat=DRINK">Drinks</a>
                    </div>
                  </div>

                  <div class="row">
                    ${menuCards}
                  </div>

                  <div class="mt-3 d-flex justify-content-between align-items-center">
                    <div class="small text-muted">Select items and press Place Order</div>
                    <button class="btn btn-success" type="submit">Place Order</button>
                  </div>
                </form>
                <div class="mt-2"><small class="text-muted">Combo discount: 15% when you order at least 1 Burger + 1 Fries + 1 Drink.</small></div>
              </div>
            </div>
          </div>
          `;

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(layout('Node-Resto', inner));
        });
      });
    });
    return;
  }

  // Place order endpoint
  if (pathname === '/order' && method === 'POST') {
    parseBody(req, (err, params) => {
      if (err) { res.writeHead(400); return res.end('Bad request'); }

      // params will have keys like menu (single value or array depending on form submission) and qty_N for quantities
      // The form uses checkboxes named 'menu' for each selected item id and qty_<id> for quantity fields.

      // Extract selected menu ids: since we parsed into obj, 'menu' may be present multiple times => value handling
      // However our parseBody kept only last if duplicate keys. So we must handle differently:
      // Instead, parse raw body again to collect all menu= occurrences
      // Easiest: re-parse raw data from req - but req body already consumed.
      // To avoid this problem, earlier we set checkboxes named 'menu' but parseBody may collect duplicates into array.
      // Our parseBody stores duplicates as arrays. So handle both cases.

      // find selected menu ids
      let selected = [];
      if (params.menu === undefined) {
        // nothing selected
        selected = [];
      } else if (Array.isArray(params.menu)) {
        selected = params.menu;
      } else {
        selected = [params.menu];
      }

      // convert to ints and filter
      selected = selected.map(s => parseInt(s)).filter(n => !isNaN(n));

      if (!selected.length) {
        // nothing selected: redirect back with simple message (we'll just redirect)
        res.writeHead(302, { Location: '/' });
        return res.end();
      }

      // fetch these menu items from DB to compute totals and categories
      const q = 'SELECT id, name, category, price FROM menu WHERE id IN (' + selected.map(() => '?').join(',') + ')';
      db.query(q, selected, (err, rows) => {
        if (err) { res.writeHead(500); return res.end('DB error order items'); }

        // Build items array with qty from qty_<id> fields
        const items = rows.map(r => {
          const qtyKey = 'qty_' + r.id;
          const qtyRaw = params[qtyKey];
          let qty = 1;
          if (typeof qtyRaw !== 'undefined') {
            const parsedQty = parseInt(qtyRaw);
            if (!isNaN(parsedQty) && parsedQty > 0) qty = parsedQty;
          }
          return { id: r.id, name: r.name, category: r.category, price: Number(r.price), qty };
        });

        // Compute subtotal
        const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);

        // Determine if combo discount applies: at least one item from each category
        const cats = new Set(items.map(it => it.category));
        const isCombo = cats.has('BURGER') && cats.has('FRIES') && cats.has('DRINK');
        const discount = isCombo ? Number((subtotal * 0.15).toFixed(2)) : 0;
        const total = Number((subtotal - discount).toFixed(2));

        // insert into orders
        const itemsJson = JSON.stringify(items);
        db.query('INSERT INTO orders (items, total, discount, status) VALUES (?, ?, ?, ?)', [itemsJson, total, discount, 'PENDING'], (err, result) => {
          if (err) {
            console.error('Insert order error', err);
            res.writeHead(500); return res.end('DB error inserting order');
          }

          // redirect home (kitchen screen is on home)
          res.writeHead(302, { Location: '/' });
          res.end();
        });
      });
    });
    return;
  }

  // default 404
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(layout('Not found', '<div class="p-4 bg-white rounded">404 - Not Found. <a href="/">Home</a></div>'));
});

server.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
