const { MongoClient } = require('mongodb');

const MONGO_URI   = process.env.MONGO_URI;
const ADMIN_SENHA = process.env.ADMIN_SENHA || 'admin12';
const DB_NAME     = 'doxkey';

let client;
async function conectar() {
    if (!client) { client = new MongoClient(MONGO_URI); await client.connect(); }
    return client.db(DB_NAME);
}


function lerBody(req) {
    return new Promise((resolve) => {
        let raw = '';
        req.on('data', chunk => raw += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(raw)); }
            catch { resolve({}); }
        });
        req.on('error', () => resolve({}));
    });
}

function gerarId() {
    const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let r = 'DOXKEY-';
    for (let i = 0; i < 8; i++) r += c[Math.floor(Math.random() * c.length)];
    r += '-';
    for (let i = 0; i < 8; i++) r += c[Math.floor(Math.random() * c.length)];
    return r;
}

function calcularExpiracao(duracao) {
    if (duracao === 'forever') return null;
    const mapa = {
        '1h':   1 * 60 * 60 * 1000,
        '6h':   6 * 60 * 60 * 1000,
        '12h': 12 * 60 * 60 * 1000,
        '1d':   1 * 24 * 60 * 60 * 1000,
        '7d':   7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
    };
    const ms = mapa[duracao];
    if (!ms) return null;
    return new Date(Date.now() + ms);
}

function estaExpirada(key) {
    if (!key.expira_em) return false;
    return new Date() > new Date(key.expira_em);
}

function formatarData(date) {
    if (!date) return 'nunca';
    return new Date(date).toLocaleString('pt-BR');
}

async function adicionarLog(db, texto, tipo) {
    await db.collection('logs').insertOne({
        texto,
        tipo: tipo || 'g',
        hora: new Date().toLocaleTimeString('pt-BR'),
        data: new Date().toISOString()
    });
}

async function checarExpiradas(db) {
    await db.collection('keys').updateMany(
        { status: 'ativa', expira_em: { $ne: null, $lt: new Date() } },
        { $set: { status: 'expirada' } }
    );
}

function autenticar(senha) {
    return senha === ADMIN_SENHA;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-senha');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    const url  = req.url;
    const body = req.method === 'POST' ? await lerBody(req) : {};
    const senha = req.headers['x-admin-senha'] || body.senha || '';


    if (req.method === 'POST' && url === '/api/login') {
        if (autenticar(body.senha || '')) {
            res.status(200).json({ ok: true });
        } else {
            res.status(401).json({ ok: false, erro: 'senha incorreta' });
        }
        return;
    }


    if (req.method === 'GET' && url.startsWith('/api/verificar')) {
        let db;
        try { db = await conectar(); } catch { res.status(500).json({ ok: false, erro: 'erro no banco' }); return; }

        const params = new URLSearchParams(url.split('?')[1] || '');
        const keyId  = (params.get('key') || '').toUpperCase();
        const hwid   = params.get('hwid') || '';

        const k = await db.collection('keys').findOne({ id: keyId });
        if (!k) { res.status(200).json({ ok: false, motivo: 'key_nao_encontrada' }); return; }
        if (k.status === 'revogada') { res.status(200).json({ ok: false, motivo: 'key_revogada' }); return; }
        if (estaExpirada(k)) {
            await db.collection('keys').updateOne({ id: keyId }, { $set: { status: 'expirada' } });
            await adicionarLog(db, `key ${keyId} expirou`, 'y');
            res.status(200).json({ ok: false, motivo: 'key_expirada' }); return;
        }
        if (k.status === 'expirada') { res.status(200).json({ ok: false, motivo: 'key_expirada' }); return; }
        if (k.hwid && k.hwid !== hwid) { res.status(200).json({ ok: false, motivo: 'hwid_diferente' }); return; }
        if (!k.hwid && hwid) {
            await db.collection('keys').updateOne({ id: keyId }, { $set: { hwid } });
            await adicionarLog(db, `key ${keyId} vinculada ao HWID`, 'b');
        }
        res.status(200).json({ ok: true, key: { id: k.id, status: k.status, duracao: k.duracao, expira: formatarData(k.expira_em) } });
        return;
    }


    if (!autenticar(senha)) {
        res.status(401).json({ ok: false, erro: 'não autorizado' });
        return;
    }

    let db;
    try { db = await conectar(); } catch { res.status(500).json({ ok: false, erro: 'erro no banco' }); return; }

    await checarExpiradas(db);


    if (req.method === 'GET' && url.startsWith('/api/keys')) {
        const keys = await db.collection('keys').find({}).sort({ _id: -1 }).toArray();
        const total_expiradas = keys.filter(k => k.status === 'expirada').length;
        const fmt = keys.map(k => ({ ...k, expira_formatado: formatarData(k.expira_em) }));
        res.status(200).json({ ok: true, keys: fmt, total_expiradas });
        return;
    }

  
    if (req.method === 'POST' && url === '/api/keys/gerar') {
        const { quantidade, duracao, lembrete } = body;
        const novas = [];
        for (let i = 0; i < Math.min(quantidade || 1, 100); i++) {
            const expira_em = calcularExpiracao(duracao || 'forever');
            const key = {
                id:               gerarId(),
                status:           'ativa',
                duracao:          duracao || 'forever',
                expira_em,
                hwid:             null,
                lembrete:         lembrete || null,
                criada:           new Date().toISOString(),
                criada_formatado: new Date().toLocaleString('pt-BR')
            };
            await db.collection('keys').insertOne(key);
            novas.push({ ...key, expira_formatado: formatarData(expira_em) });
        }
        const logTxt = `${novas.length} key(s) gerada(s) · ${duracao}${lembrete ? ' · lembrete: ' + lembrete : ''}`;
        await adicionarLog(db, logTxt, 'g');
        res.status(200).json({ ok: true, novas });
        return;
    }

   
    if (req.method === 'POST' && url === '/api/keys/revogar') {
        const { id } = body;
        const k = await db.collection('keys').findOne({ id });
        if (!k) { res.status(404).json({ ok: false, erro: 'key não encontrada' }); return; }
        if (k.status === 'revogada') { res.status(400).json({ ok: false, erro: 'já revogada' }); return; }
        await db.collection('keys').updateOne({ id }, { $set: { status: 'revogada' } });
        await adicionarLog(db, `key ${id} revogada`, 'r');
        res.status(200).json({ ok: true });
        return;
    }


    if (req.method === 'POST' && url === '/api/keys/restaurar') {
        const { id } = body;
        const k = await db.collection('keys').findOne({ id });
        if (!k) { res.status(404).json({ ok: false, erro: 'key não encontrada' }); return; }
        if (estaExpirada(k)) { res.status(400).json({ ok: false, erro: 'key já expirou' }); return; }
        await db.collection('keys').updateOne({ id }, { $set: { status: 'ativa' } });
        await adicionarLog(db, `key ${id} restaurada`, 'g');
        res.status(200).json({ ok: true });
        return;
    }


    if (req.method === 'POST' && url === '/api/keys/resetar-hwid') {
        const { id } = body;
        const k = await db.collection('keys').findOne({ id });
        if (!k) { res.status(404).json({ ok: false, erro: 'key não encontrada' }); return; }
        await db.collection('keys').updateOne({ id }, { $set: { hwid: null } });
        await adicionarLog(db, `hwid de ${id} resetado`, 'b');
        res.status(200).json({ ok: true });
        return;
    }

 
    if (req.method === 'POST' && url === '/api/keys/deletar') {
        const { id } = body;
        const k = await db.collection('keys').findOne({ id });
        if (!k) { res.status(404).json({ ok: false, erro: 'key não encontrada' }); return; }
        await db.collection('keys').deleteOne({ id });
        await adicionarLog(db, `key ${id} deletada permanentemente`, 'r');
        res.status(200).json({ ok: true });
        return;
    }

   
    if (req.method === 'POST' && url === '/api/logs/clear') {
        await db.collection('logs').deleteMany({});
        res.status(200).json({ ok: true });
        return;
    }

   
    if (req.method === 'POST' && url === '/api/keys/clear') {
        await db.collection('keys').deleteMany({});
        await adicionarLog(db, 'todas as keys foram apagadas', 'r');
        res.status(200).json({ ok: true });
        return;
    }

   
    if (req.method === 'GET' && url === '/api/logs') {
        const logs = await db.collection('logs').find({}).sort({ _id: -1 }).limit(100).toArray();
        res.status(200).json({ ok: true, logs });
        return;
    }

    res.status(404).json({ ok: false, erro: 'rota não encontrada' });
};
