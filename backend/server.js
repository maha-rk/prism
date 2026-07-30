require('dotenv').config();
const express = require('express');
const cors = require('cors');
const comicAnalyzeRoute = require('./routes/comicAnalyze');
const narrateRoute = require('./routes/narrate');
const ttsRoute = require('./routes/tts');
const askRoute = require('./routes/ask');
const reimagineRoute = require('./routes/reimagine');
const synesthesiaRoute = require('./routes/synesthesia');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: '20mb' })); // full comic page images as data URLs

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api/comic/analyze', comicAnalyzeRoute);
app.use('/api/comic/narrate', narrateRoute);
app.use('/api/tts', ttsRoute);
app.use('/api/comic/ask', askRoute);
app.use('/api/comic/reimagine', reimagineRoute);
app.use('/api/synesthesia', synesthesiaRoute);

app.listen(PORT, () => {
  console.log(`Prism backend listening on http://localhost:${PORT}`);
});
