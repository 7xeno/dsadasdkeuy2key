const { MongoClient } = require('mongodb');
const https = require('https');
const http  = require('http');

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
        req.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
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
        '1min':  1 * 60 * 1000,
        '5min':  5 * 60 * 1000,
        '10min': 10 * 60 * 1000,
        '30min': 30 * 60 * 1000,
        '1h':    1 * 60 * 60 * 1000,
        '6h':    6 * 60 * 60 * 1000,
        '12h':  12 * 60 * 60 * 1000,
        '1d':    1 * 24 * 60 * 60 * 1000,
        '7d':    7 * 24 * 60 * 60 * 1000,
        '30d':  30 * 24 * 60 * 60 * 1000,
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
        texto, tipo: tipo || 'g',
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

function autenticar(senha) { return senha === ADMIN_SENHA; }

async function enviarWebhook(url, payload) {
    if (!url || !url.startsWith('http')) return;
    return new Promise((resolve) => {
        try {
            const body = JSON.stringify(payload);
            const parsed = new URL(url);
            const mod = parsed.protocol === 'https:' ? https : http;
            const opts = {
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
            };
            const req = mod.request(opts, (res) => { res.resume(); resolve(); });
            req.on('error', () => resolve());
            req.write(body);
            req.end();
        } catch { resolve(); }
    });
}

async function getWebhooks(db) {
    const doc = await db.collection('config').findOne({ _id: 'webhooks' });
    return doc || {};
}

// Embed SEM emoji, com ** e > nos campos
function makeEmbed(titulo, descricao, cor, campos) {
    const embed = {
        title: titulo,
        description: descricao,
        color: cor,
        timestamp: new Date().toISOString(),
        footer: { text: 'DoxKey System' }
    };
    if (campos && campos.length) embed.fields = campos;
    return { embeds: [embed] };
}

// Embed COM emoji — só para ping de site
function makePingEmbed(online) {
    return {
        embeds: [{
            title: online ? '🟢 Site Online' : '🔴 Site Caiu',
            description: online
                ? '> O **DoxKey** está **online** e respondendo normalmente.'
                : '> O **DoxKey** parou de responder.',
            color: online ? 0x4ade80 : 0xf87171,
            timestamp: new Date().toISOString(),
            footer: { text: 'DoxKey System' }
        }]
    };
}

const CORES = { verde: 0x4ade80, vermelho: 0xf87171, azul: 0x60a5fa, amarelo: 0xfbbf24 };

// Campo formatado com ** no nome e > no valor
function c(nome, valor, inline) {
    return { name: `**${nome}**`, value: `> ${valor}`, inline: inline !== false };
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-senha');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    const url   = req.url;
    const body  = req.method === 'POST' ? await lerBody(req) : {};
    const senha = req.headers['x-admin-senha'] || body.senha || '';

    // POST /api/login
    if (req.method === 'POST' && url === '/api/login') {
        if (autenticar(body.senha || '')) { res.status(200).json({ ok: true }); }
        else { res.status(401).json({ ok: false, erro: 'senha incorreta' }); }
        return;
    }

    // GET /api/verificar — público, sem senha
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

        const whs = await getWebhooks(db);
        if (whs.key_executada) {
            await enviarWebhook(whs.key_executada, makeEmbed(
                'Key Executada no Roblox',
                '> Uma key foi verificada com sucesso no jogo.',
                CORES.verde,
                [
                    c('Key', '`' + keyId + '`'),
                    c('HWID', '`' + (hwid.slice(0, 20) || 'N/A') + '...`'),
                    c('Status', k.status),
                    c('Duração', k.duracao),
                    c('Expira', formatarData(k.expira_em)),
                ]
            ));
        }
        await adicionarLog(db, `key ${keyId} executada no Roblox`, 'b');
        res.status(200).json({ ok: true, key: { id: k.id, status: k.status, duracao: k.duracao, hwid: k.hwid, expira: formatarData(k.expira_em) } });
        return;
    }

    // Rotas protegidas — exigem senha
    if (!autenticar(senha)) { res.status(401).json({ ok: false, erro: 'não autorizado' }); return; }

    let db;
    try { db = await conectar(); } catch { res.status(500).json({ ok: false, erro: 'erro no banco' }); return; }
    await checarExpiradas(db);
    const whs = await getWebhooks(db);

    // GET /api/keys
    if (req.method === 'GET' && url.startsWith('/api/keys')) {
        const keys = await db.collection('keys').find({}).sort({ _id: -1 }).toArray();
        const total_expiradas = keys.filter(k => k.status === 'expirada').length;
        const fmt = keys.map(k => ({ ...k, expira_formatado: formatarData(k.expira_em) }));
        res.status(200).json({ ok: true, keys: fmt, total_expiradas });
        return;
    }

    // POST /api/keys/gerar
    if (req.method === 'POST' && url === '/api/keys/gerar') {
        const { quantidade, duracao, lembrete } = body;
        const novas = [];
        for (let i = 0; i < Math.min(quantidade || 1, 100); i++) {
            const expira_em = calcularExpiracao(duracao || 'forever');
            const key = {
                id: gerarId(), status: 'ativa', duracao: duracao || 'forever',
                expira_em, hwid: null, lembrete: lembrete || null,
                criada: new Date().toISOString(),
                criada_formatado: new Date().toLocaleString('pt-BR')
            };
            await db.collection('keys').insertOne(key);
            novas.push({ ...key, expira_formatado: formatarData(expira_em) });
        }
        const logTxt = `${novas.length} key(s) gerada(s) · ${duracao}${lembrete ? ' · lembrete: ' + lembrete : ''}`;
        await adicionarLog(db, logTxt, 'g');

        if (whs.gerar_key) {
            const listaKeys = novas.map(k => '> `' + k.id + '`').join('\n');
            await enviarWebhook(whs.gerar_key, makeEmbed(
                'Keys Geradas',
                listaKeys,
                CORES.verde,
                [
                    c('Quantidade', String(novas.length)),
                    c('Duração', duracao || 'forever'),
                    c('Lembrete', lembrete || '—'),
                    c('Expira em', novas[0]?.expira_formatado || 'nunca', false),
                ]
            ));
        }
        res.status(200).json({ ok: true, novas });
        return;
    }

    // POST /api/keys/revogar
    if (req.method === 'POST' && url === '/api/keys/revogar') {
        const { id } = body;
        const k = await db.collection('keys').findOne({ id });
        if (!k) { res.status(404).json({ ok: false, erro: 'key não encontrada' }); return; }
        if (k.status === 'revogada') { res.status(400).json({ ok: false, erro: 'já revogada' }); return; }
        await db.collection('keys').updateOne({ id }, { $set: { status: 'revogada' } });
        await adicionarLog(db, `key ${id} revogada`, 'r');

        if (whs.revogar_key) {
            await enviarWebhook(whs.revogar_key, makeEmbed(
                'Key Revogada',
                '> Uma key foi revogada pelo administrador.',
                CORES.vermelho,
                [
                    c('Key', '`' + id + '`'),
                    c('Duração', k.duracao),
                    c('HWID', k.hwid ? '`' + k.hwid.slice(0, 20) + '...`' : 'sem hwid'),
                ]
            ));
        }
        res.status(200).json({ ok: true });
        return;
    }

    // POST /api/keys/restaurar
    if (req.method === 'POST' && url === '/api/keys/restaurar') {
        const { id } = body;
        const k = await db.collection('keys').findOne({ id });
        if (!k) { res.status(404).json({ ok: false, erro: 'key não encontrada' }); return; }
        if (estaExpirada(k)) { res.status(400).json({ ok: false, erro: 'key já expirou' }); return; }
        await db.collection('keys').updateOne({ id }, { $set: { status: 'ativa' } });
        await adicionarLog(db, `key ${id} restaurada`, 'g');

        if (whs.resetar_key) {
            await enviarWebhook(whs.resetar_key, makeEmbed(
                'Key Restaurada',
                '> Uma key foi restaurada para o status ativo.',
                CORES.azul,
                [
                    c('Key', '`' + id + '`'),
                    c('Duração', k.duracao),
                    c('Expira', formatarData(k.expira_em)),
                ]
            ));
        }
        res.status(200).json({ ok: true });
        return;
    }

    // POST /api/keys/resetar-hwid
    if (req.method === 'POST' && url === '/api/keys/resetar-hwid') {
        const { id } = body;
        const k = await db.collection('keys').findOne({ id });
        if (!k) { res.status(404).json({ ok: false, erro: 'key não encontrada' }); return; }
        await db.collection('keys').updateOne({ id }, { $set: { hwid: null } });
        await adicionarLog(db, `hwid de ${id} resetado`, 'b');

        if (whs.resetar_hwid) {
            await enviarWebhook(whs.resetar_hwid, makeEmbed(
                'HWID Resetado',
                '> O HWID de uma key foi resetado pelo administrador.',
                CORES.azul,
                [
                    c('Key', '`' + id + '`'),
                    c('HWID anterior', k.hwid ? '`' + k.hwid.slice(0, 20) + '...`' : 'sem hwid'),
                ]
            ));
        }
        res.status(200).json({ ok: true });
        return;
    }

    // POST /api/keys/deletar
    if (req.method === 'POST' && url === '/api/keys/deletar') {
        const { id } = body;
        const k = await db.collection('keys').findOne({ id });
        if (!k) { res.status(404).json({ ok: false, erro: 'key não encontrada' }); return; }
        await db.collection('keys').deleteOne({ id });
        await adicionarLog(db, `key ${id} deletada permanentemente`, 'r');

        if (whs.deletar_key) {
            await enviarWebhook(whs.deletar_key, makeEmbed(
                'Key Deletada',
                '> Uma key foi removida permanentemente do sistema.',
                CORES.vermelho,
                [
                    c('Key', '`' + id + '`'),
                    c('Duração era', k.duracao),
                    c('Status era', k.status),
                    c('Lembrete', k.lembrete || '—'),
                ]
            ));
        }
        res.status(200).json({ ok: true });
        return;
    }

    // POST /api/logs/clear
    if (req.method === 'POST' && url === '/api/logs/clear') {
        await db.collection('logs').deleteMany({});

        if (whs.logs_excluidos) {
            await enviarWebhook(whs.logs_excluidos, makeEmbed(
                'Logs Excluídos',
                '> Todos os logs foram apagados pelo administrador.',
                CORES.amarelo
            ));
        }
        res.status(200).json({ ok: true });
        return;
    }

    // POST /api/keys/clear
    if (req.method === 'POST' && url === '/api/keys/clear') {
        await db.collection('keys').deleteMany({});
        await adicionarLog(db, 'todas as keys foram apagadas', 'r');
        res.status(200).json({ ok: true });
        return;
    }

    // GET /api/logs
    if (req.method === 'GET' && url === '/api/logs') {
        const logs = await db.collection('logs').find({}).sort({ _id: -1 }).limit(100).toArray();
        res.status(200).json({ ok: true, logs });
        return;
    }

    // GET /api/webhooks
    if (req.method === 'GET' && url === '/api/webhooks') {
        const doc = await db.collection('config').findOne({ _id: 'webhooks' });
        res.status(200).json({ ok: true, webhooks: doc || {} });
        return;
    }

    // POST /api/webhooks
    if (req.method === 'POST' && url === '/api/webhooks') {
        const { webhooks } = body;
        await db.collection('config').updateOne(
            { _id: 'webhooks' },
            { $set: { ...webhooks, _id: 'webhooks' } },
            { upsert: true }
        );
        res.status(200).json({ ok: true });
        return;
    }

    // POST /api/webhooks/testar
    if (req.method === 'POST' && url === '/api/webhooks/testar') {
        const { tipo, whUrl } = body;
        if (!whUrl) { res.status(400).json({ ok: false, erro: 'url vazia' }); return; }
        try {
            await enviarWebhook(whUrl, makeEmbed(
                'Teste de Webhook',
                `> Webhook **${tipo}** configurado e funcionando corretamente.`,
                CORES.verde,
                [c('Status', 'Funcionando')]
            ));
            res.status(200).json({ ok: true });
        } catch { res.status(400).json({ ok: false, erro: 'falha ao enviar' }); }
        return;
    }

    // POST /api/ping — COM emoji, exceção confirmada
    if (req.method === 'POST' && url === '/api/ping') {
        const { status } = body;
        if (whs.ping_site) {
            await enviarWebhook(whs.ping_site, makePingEmbed(status === 'online'));
        }
        res.status(200).json({ ok: true });
        return;
    }

    res.status(404).json({ ok: false, erro: 'rota não encontrada' });
};
