const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = 'doxkey';

let client;
async function conectar() {
    if (!client) {
        client = new MongoClient(MONGO_URI);
        await client.connect();
    }
    return client.db(DB_NAME);
}

function gerarId() {
    const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let r = 'DOXKEY-';
    for (let i = 0; i < 8; i++) r += c[Math.floor(Math.random() * c.length)];
    r += '-';
    for (let i = 0; i < 8; i++) r += c[Math.floor(Math.random() * c.length)];
    return r;
}

async function adicionarLog(db, texto) {
    await db.collection('logs').insertOne({
        texto,
        hora: new Date().toLocaleTimeString('pt-BR')
    });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    const url = req.url;
    let db;

    try {
        db = await conectar();
    } catch (e) {
        res.status(500).json({ ok: false, erro: 'erro ao conectar no banco' });
        return;
    }

    // GET /api/keys
    if (req.method === 'GET' && url.startsWith('/api/keys') && !url.includes('/verificar')) {
        const keys = await db.collection('keys').find({}).toArray();
        res.status(200).json({ ok: true, keys });
        return;
    }

    // POST /api/keys/gerar
    if (req.method === 'POST' && url === '/api/keys/gerar') {
        const { quantidade, duracao } = req.body;
        const novas = [];
        for (let i = 0; i < Math.min(quantidade || 1, 100); i++) {
            const key = {
                id:     gerarId(),
                status: 'ativa',
                duracao: duracao || 'forever',
                hwid:   null,
                criada: new Date().toLocaleString('pt-BR')
            };
            await db.collection('keys').insertOne(key);
            novas.push(key);
        }
        await adicionarLog(db, `${novas.length} key(s) gerada(s) · ${duracao}`);
        res.status(200).json({ ok: true, novas });
        return;
    }

    // POST /api/keys/revogar
    if (req.method === 'POST' && url === '/api/keys/revogar') {
        const { id } = req.body;
        const k = await db.collection('keys').findOne({ id });
        if (!k) { res.status(404).json({ ok: false, erro: 'key não encontrada' }); return; }
        if (k.status === 'revogada') { res.status(400).json({ ok: false, erro: 'já revogada' }); return; }
        await db.collection('keys').updateOne({ id }, { $set: { status: 'revogada' } });
        await adicionarLog(db, `key ${id} revogada`);
        res.status(200).json({ ok: true });
        return;
    }

    // POST /api/keys/restaurar
    if (req.method === 'POST' && url === '/api/keys/restaurar') {
        const { id } = req.body;
        const k = await db.collection('keys').findOne({ id });
        if (!k) { res.status(404).json({ ok: false, erro: 'key não encontrada' }); return; }
        await db.collection('keys').updateOne({ id }, { $set: { status: 'ativa' } });
        await adicionarLog(db, `key ${id} restaurada`);
        res.status(200).json({ ok: true });
        return;
    }

    // POST /api/keys/resetar-hwid
    if (req.method === 'POST' && url === '/api/keys/resetar-hwid') {
        const { id } = req.body;
        const k = await db.collection('keys').findOne({ id });
        if (!k) { res.status(404).json({ ok: false, erro: 'key não encontrada' }); return; }
        await db.collection('keys').updateOne({ id }, { $set: { hwid: null } });
        await adicionarLog(db, `hwid de ${id} resetado`);
        res.status(200).json({ ok: true });
        return;
    }

    // GET /api/verificar?key=DOXKEY-XXX&hwid=HWID-XXX
    if (req.method === 'GET' && url.startsWith('/api/verificar')) {
        const params = new URLSearchParams(url.split('?')[1] || '');
        const keyId  = (params.get('key') || '').toUpperCase();
        const hwid   = params.get('hwid') || '';

        const k = await db.collection('keys').findOne({ id: keyId });
        if (!k) { res.status(200).json({ ok: false, motivo: 'key_nao_encontrada' }); return; }
        if (k.status === 'revogada') { res.status(200).json({ ok: false, motivo: 'key_revogada' }); return; }
        if (k.hwid && k.hwid !== hwid) { res.status(200).json({ ok: false, motivo: 'hwid_diferente' }); return; }

        if (!k.hwid && hwid) {
            await db.collection('keys').updateOne({ id: keyId }, { $set: { hwid } });
        }

        res.status(200).json({ ok: true, key: { id: k.id, status: k.status, duracao: k.duracao } });
        return;
    }

    // GET /api/logs
    if (req.method === 'GET' && url === '/api/logs') {
        const logs = await db.collection('logs').find({}).sort({ _id: -1 }).limit(100).toArray();
        res.status(200).json({ ok: true, logs });
        return;
    }

    res.status(404).json({ ok: false, erro: 'rota não encontrada' });
};
