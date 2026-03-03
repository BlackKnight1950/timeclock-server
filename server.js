const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // serves the app to staff

// ── Smartsheet config ─────────────────────────────────────────────
const SHEET_ID = '5334378914729860';
const TOKEN    = '4XVmJfCIU0ya0GUx5UxjKT1EXm5FrTP9krR';
const COL = {
  firstName : 3305598282846084,
  lastName  : 7809197910216580,
  clockIn   : 2179698376003460,
  clockOut  : 6683298003373956,
  date      : 6724421780459396,
  timestamp : 7850321687302020,
};

async function ss(method, path, body) {
  const r = await fetch(`https://api.smartsheet.com/2.0${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

// Clock In — creates new row
app.post('/api/clockin', async (req, res) => {
  try {
    const { firstName, lastName, clockIn, date } = req.body;
    const data = await ss('POST', `/sheets/${SHEET_ID}/rows`, [{
      toBottom: true,
      cells: [
        { columnId: COL.firstName, value: firstName },
        { columnId: COL.lastName,  value: lastName  },
        { columnId: COL.clockIn,   value: clockIn   },
        { columnId: COL.date,      value: date       },
        { columnId: COL.timestamp, value: clockIn    },
      ]
    }]);
    const rowId = data.result?.[0]?.id;
    if (!rowId) throw new Error('No row ID from Smartsheet');
    res.json({ success: true, rowId });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Clock Out — finds open row by name if rowId missing (page refresh), then updates it
app.post('/api/clockout', async (req, res) => {
  try {
    const { rowId, firstName, lastName, clockOut } = req.body;
    let targetId = rowId;

    if (!targetId) {
      const sheet = await ss('GET', `/sheets/${SHEET_ID}?pageSize=200`);
      const rows = sheet.rows || [];
      for (let i = rows.length - 1; i >= 0; i--) {
        const cells = {};
        (rows[i].cells || []).forEach(c => { cells[c.columnId] = c.value; });
        if (cells[COL.firstName] === firstName &&
            cells[COL.lastName]  === lastName  &&
            !cells[COL.clockOut]) {
          targetId = rows[i].id;
          break;
        }
      }
    }

    if (!targetId) return res.status(404).json({ success: false, error: 'No open clock-in found for this person' });

    await ss('PUT', `/sheets/${SHEET_ID}/rows`, [{
      id: targetId,
      cells: [{ columnId: COL.clockOut, value: clockOut }]
    }]);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Time Clock running on port ${PORT}`));
