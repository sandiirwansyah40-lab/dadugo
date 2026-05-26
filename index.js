const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

const {
    TOKEN,
    OWNER_ID,
    BOT_USERNAME,
    START_MEDIA,
    QRIS_IMAGE,
    HARGA_PER_KOIN,
    PAJAK_WIN,
    KUR_LOCK_TIME,
    MIN_BET,
    MIN_WD,
    CHANNEL_LOG_ID,
    WAJIB_JOIN_1,
    WAJIB_JOIN_2,
    LINK_JOIN_1,
    LINK_JOIN_2
} = require('./config');

const DB_FILE = './database.json';

const bot = new Telegraf(TOKEN);

let db = {
    users: {},
    groups: {}
};

if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE));
    } catch {
        db = { users: {}, groups: {} };
    }
}

const saveDB = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
};

let kurCooldown = {};
let autoFillBet = {};
let sessionBet = {};
let groupHistory = {};
let gameCounter = {};
let rollCooldown = {};
let startGameOwner = {};
let startGameTimeout = {};
let angpauData = {};
let userHistory = {};
let groupMembers = {};
let duelSession = {};
let duelLastWin = {};

bot.use(async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        console.log(err);
    }
});

// Fungsi pembantu untuk cek status join member di grup/channel wajib
async function checkMustJoin(ctx) {
    if (ctx.chat.type !== 'private') return true;
    if (ctx.from.id === OWNER_ID) return true;

    try {
        const member1 = await ctx.telegram.getChatMember(WAJIB_JOIN_1, ctx.from.id);
        const member2 = await ctx.telegram.getChatMember(WAJIB_JOIN_2, ctx.from.id);
        
        const statusValid = ['member', 'administrator', 'creator'];
        
        if (!statusValid.includes(member1.status) || !statusValid.includes(member2.status)) {
            await ctx.replyWithHTML(`⚠️ <b>AKSES DITOLAK</b>\n\nAnda harus bergabung ke 2 grup/channel sponsor kami terlebih dahulu sebelum menggunakan bot ini.`, 
                Markup.inlineKeyboard([
                    [Markup.button.url('Join Grup 1 📢', LINK_JOIN_1)],
                    [Markup.button.url('Join Grup 2 📢', LINK_JOIN_2)],
                    [Markup.button.callback('🔄 Cek Status Join', 'check_status_join')]
                ])
            );
            return false;
        }
        return true;
    } catch (e) {
        // Jika bot belum dimasukkan sebagai admin di grup wajib, lewati proteksi agar tidak crash
        return true;
    }
}

function checkUser(ctx, targetUser = null) {
    const user = targetUser || ctx.from;
    if (!user) {
        return {
            name: 'User',
            balance: 0,
            state: null,
            ws: 0,
            to: 0,
            saldo_diam: 0
        };
    }

    const id = String(user.id);

    if (!db.users[id]) {
        db.users[id] = {
            id,
            name: user.first_name || 'User',
            username: user.username || '-',
            balance: 0,
            state: null,
            tempDepo: 0,
            tempWD: null,
            ws: 0,
            to: 0,
            saldo_diam: 0
        };
        saveDB();
    }

    db.users[id].name = user.first_name || 'User';
    db.users[id].username = user.username || '-';
    if (db.users[id].ws === undefined) db.users[id].ws = 0;

    saveDB();
    return db.users[id];
}

function getGroupConfig(chatId) {
    if (!db.groups[chatId]) {
        db.groups[chatId] = { mode: 3 };
        saveDB();
    }
    return db.groups[chatId];
}

function formatKoin(val) {
    let result = (val / HARGA_PER_KOIN).toFixed(2);
    return result.replace(/\.00$/, '').replace('.', ',');
}

function renderBetList(chatId) {
    const s = sessionBet[chatId];
    if (!s) return '❌ Tidak ada taruhan aktif.';

    const totalB = s.besar.reduce((a, b) => a + b.bet, 0);
    const totalK = s.kecil.reduce((a, b) => a + b.bet, 0);

    let text = `<b>KECIL : BL ( ${formatKoin(totalK)} )</b>\n`;
    if (s.kecil.length === 0) {
        text += `\n`;
    } else {
        s.kecil.forEach(u => {
            text += `- ${u.name} ${formatKoin(u.bet)}\n`;
        });
    }

    text += `\n<b>BESAR : BL ( ${formatKoin(totalB)} )</b>\n`;
    if (s.besar.length === 0) {
        text += `\n`;
    } else {
        s.besar.forEach(u => {
            text += `- ${u.name} ${formatKoin(u.bet)}\n`;
        });
    }

    return text;
}

async function sendStartMedia(ctx, caption, options = {}) {
    if (START_MEDIA.endsWith('.mp4')) {
        return ctx.replyWithVideo(START_MEDIA, {
            caption,
            parse_mode: 'HTML',
            ...options
        });
    }
    return ctx.replyWithPhoto(START_MEDIA, {
        caption,
        parse_mode: 'HTML',
        ...options
    });
}

bot.action('check_status_join', async (ctx) => {
    const isJoined = await checkMustJoin(ctx);
    if (isJoined) {
        await ctx.answerCbQuery('✅ Terimakasih! Akses bot diberikan.', { show_alert: true });
        await ctx.deleteMessage().catch(() => {});
        
        const user = checkUser(ctx);
        const caption = `💠 <b>SANZ SYSTEM</b>\n━━━━━━━━━━━━━━━\n💰 Saldo : <b>${formatKoin(user.balance)} </b>\n━━━━━━━━━━━━━━━\n📖 Gunakan tombol COMMAND\nuntuk melihat semua menu bot.`;
        return sendStartMedia(ctx, caption, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📥 DEPOSIT', callback_data: 'menu_depo' }, { text: '📤 WD', callback_data: 'menu_wd' }],
                    [{ text: '📖 COMMAND', callback_data: 'show_menu' }],
                    [{ text: '➕ TAMBAH GRUP', url: `https://t.me/${BOT_USERNAME}?startgroup=true` }]
                ]
            }
        });
    } else {
        await ctx.answerCbQuery('❌ Anda belum bergabung ke kedua grup wajib!', { show_alert: true });
    }
});

bot.start(async (ctx) => {
    if (!(await checkMustJoin(ctx))) return;

    const user = checkUser(ctx);
    
    db.users[String(ctx.from.id)] = {
        ...db.users[String(ctx.from.id)],
        id: String(ctx.from.id),
        name: ctx.from.first_name || 'User',
        username: ctx.from.username || '-',
        balance: db.users[String(ctx.from.id)]?.balance || 0,
        state: db.users[String(ctx.from.id)]?.state || null,
        tempDepo: db.users[String(ctx.from.id)]?.tempDepo || 0,
        tempWD: db.users[String(ctx.from.id)]?.tempWD || null,
        ws: db.users[String(ctx.from.id)]?.ws || 0
    };
    saveDB();

    if (ctx.chat.type !== 'private') {
        return ctx.replyWithPhoto(START_MEDIA, {
            caption: `🎲 <b>SANZ DICE ACTIVE</b>
━━━━━━━━━━━━━━━
<b>📖 CARA BERMAIN:</b>
<blockquote>1. Tambahkan bot ke grup Anda.
2. Isi saldo koin dengan deposit di PM.
3. Pasang taruhan:
B jumlah atau K jumlah
4. Ketik roll / r untuk mulai game.</blockquote>
<b>📜 COMMAND UTAMA</b>
<blockquote>• B angka - Pasang BESAR
• K angka - Pasang KECIL
• BALL - All in BESAR
• KALL - All in KECIL
• ROLL / R - Mengocok dadu
• SALDO - Melihat saldo koin
• TF jumlah - Transfer saldo
• SETGAME - Ubah mode BO
• KUR - Cancel taruhan
• DEPO - Deposit via PM
• WD - Withdraw via PM</blockquote>
━━━━━━━━━━━━━━━
💠 SANZ SYSTEM v104.0`,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: '📖 COMMAND', callback_data: 'show_menu' }]]
            }
        });
    }

    const caption = `
💠 <b>SANZ SYSTEM</b>
━━━━━━━━━━━━━━━
💰 Saldo : <b>${formatKoin(user.balance)} </b>
━━━━━━━━━━━━━━━
📖 Gunakan tombol COMMAND
untuk melihat semua menu bot.
`;

    return sendStartMedia(ctx, caption, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📥 DEPOSIT', callback_data: 'menu_depo' }, { text: '📤 WD', callback_data: 'menu_wd' }],
                [{ text: '📖 COMMAND', callback_data: 'show_menu' }],
                [{ text: '➕ TAMBAH GRUP', url: `https://t.me/${BOT_USERNAME}?startgroup=true` }]
            ]
        }
    });
});

bot.action('show_menu', async (ctx) => {
    if (!(await checkMustJoin(ctx))) return;
    const text = `
<b>📖 CARA BERMAIN:</b>
<blockquote>1. Tambahkan bot ke grup Anda.
2. Isi saldo koin dengan deposit di PM.
3. Pasang taruhan:
B jumlah atau K jumlah
4. Ketik roll / r untuk mulai game.</blockquote>
<b>📜 COMMAND UTAMA</b>
<blockquote>• B angka - Pasang BESAR
• K angka - Pasang KECIL
• BALL - All in BESAR
• KALL - All in KECIL
• ROLL / R - Mengocok dadu
• SALDO - Melihat saldo koin
• TF jumlah - Transfer saldo
• SETGAME - Ubah mode BO
• KUR - Cancel taruhan
• DEPO - Deposit via PM
• WD - Withdraw via PM</blockquote>
`;

    return sendStartMedia(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '📥 DEPOSIT', callback_data: 'menu_depo' }, { text: '📤 WD', callback_data: 'menu_wd' }],
                [{ text: '📖 COMMAND', callback_data: 'show_menu' }],
                [{ text: '➕ TAMBAH GRUP', url: `https://t.me/${BOT_USERNAME}?startgroup=true` }]
            ]
        }
    });
});

bot.command('bc', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;

    if (!ctx.message.reply_to_message) {
        return ctx.replyWithHTML(`❌ <b>FORMAT SALAH</b>\n\nReply pesan yang ingin di broadcast.\n\nContoh:\nReply pesan lalu ketik:\n<code>/bc</code>`);
    }

    const msg = ctx.message.reply_to_message;
    const targets = [...new Set([...Object.keys(db.users), ...Object.keys(db.groups)])];

    let success = 0;
    let failed = 0;

    await ctx.replyWithHTML(`📢 <b>BROADCAST DIMULAI</b>\n━━━━━━━━━━━━━━━\n📨 Total Target:\n${targets.length} Chat\n━━━━━━━━━━━━━━━\n⏳ Mohon tunggu...`);

    for (const id of targets) {
        try {
            if (msg.text) {
                await bot.telegram.sendMessage(id, msg.text, { parse_mode: 'HTML' });
            } else if (msg.photo) {
                await bot.telegram.sendPhoto(id, msg.photo[msg.photo.length - 1].file_id, { caption: msg.caption || '', parse_mode: 'HTML' });
            } else if (msg.video) {
                await bot.telegram.sendVideo(id, msg.video.file_id, { caption: msg.caption || '', parse_mode: 'HTML' });
            } else if (msg.sticker) {
                await bot.telegram.sendSticker(id, msg.sticker.file_id);
            } else if (msg.audio) {
                await bot.telegram.sendAudio(id, msg.audio.file_id, { caption: msg.caption || '' });
            } else if (msg.voice) {
                await bot.telegram.sendVoice(id, msg.voice.file_id, { caption: msg.caption || '' });
            } else if (msg.document) {
                await bot.telegram.sendDocument(id, msg.document.file_id, { caption: msg.caption || '', parse_mode: 'HTML' });
            } else if (msg.video_note) {
                await bot.telegram.sendVideoNote(id, msg.video_note.file_id);
            } else if (msg.animation) {
                await bot.telegram.sendAnimation(id, msg.animation.file_id, { caption: msg.caption || '', parse_mode: 'HTML' });
            }
            success++;
        } catch (e) {
            failed++;
        }
    }

    return ctx.replyWithHTML(`✅ <b>BROADCAST SELESAI</b>\n━━━━━━━━━━━━━━━\n📤 Berhasil: ${success}\n❌ Gagal: ${failed}\n━━━━━━━━━━━━━━━\n💠 SANZ SYSTEM`);
});

bot.hears(/^(\/)?dc/, async (ctx) => {
    if (ctx.chat.type === 'private' && ctx.from.id !== OWNER_ID) {
        return ctx.reply('❌ Khusus owner.');
    }

    let isAdmin = false;
    if (ctx.chat.type !== 'private') {
        try {
            const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
            isAdmin = ['administrator', 'creator'].includes(member.status);
        } catch {}
    }

    if (ctx.from.id !== OWNER_ID && !isAdmin) {
        return ctx.reply('❌ Khusus admin grup.');
    }

    const args = ctx.message.text.split(/\s+/);
    let targetId;
    let jumlah;

    if (ctx.message.reply_to_message) {
        targetId = String(ctx.message.reply_to_message.from.id);
        jumlah = parseFloat(args[1]);
    } else {
        targetId = args[1];
        jumlah = parseFloat(args[2]);
    }

    if (!targetId || isNaN(jumlah)) {
        return ctx.replyWithHTML(`❌ <b>FORMAT SALAH</b>\n\n📌 Reply User:\n<code>/dc jumlah</code>\n\n📌 Via ID:\n<code>/dc id jumlah</code>\n\n━━━━━━━━━━━━━━━\nContoh:\n<code>/dc 5</code>\n<code>/dc 123456789 10</code>`);
    }

    if (!db.users[targetId]) {
        return ctx.reply('❌ User tidak ditemukan.');
    }

    const potong = jumlah * HARGA_PER_KOIN;
    if (db.users[targetId].balance < potong) {
        db.users[targetId].balance = 0;
    } else {
        db.users[targetId].balance -= potong;
    }

    saveDB();

    return ctx.replyWithHTML(`✅ <b>SALDO BERHASIL DIKURANGI</b>\n━━━━━━━━━━━━━━━\n👤 User:\n${db.users[targetId].name}\n\n💸 Dipotong:\n${jumlah} Koin\n\n💰 Saldo Sekarang:\n${formatKoin(db.users[targetId].balance)} K\n━━━━━━━━━━━━━━━\n💠 SANZ SYSTEM`);
});

bot.action('menu_depo', async (ctx) => {
    if (!(await checkMustJoin(ctx))) return;
    const user = checkUser(ctx);
    user.state = 'WAIT_DEPO_AMOUNT';
    saveDB();
    ctx.reply('Masukkan jumlah deposit.');
});

// FITUR BARU: MENU PREVIEW WITHDRAW INTERAKTIF SESUAI PICTURE
bot.action('menu_wd', async (ctx) => {
    if (!(await checkMustJoin(ctx))) return;
    const user = checkUser(ctx);
    
    const textWD = `
╔════════════════════╗
      💰 <b>WITHDRAW SYSTEM</b> 💰
╚════════════════════╝

<b>SALDO ANDA:</b>
<b>${formatKoin(user.balance)} KOIN</b>

⚠️ <b>PERATURAN:</b>
• Minimal Withdraw: ${MIN_WD} Koin
• Minimal To 10/10 silahkan cek /to
• Proses manual oleh admin (1-24 Jam)
• Pastikan nomor/tujuan sudah benar!

💠 SANZ SYSTEM`;

    await ctx.deleteMessage().catch(() => {});
    return sendStartMedia(ctx, textWD, {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ LANJUTKAN', callback_data: 'wd_lanjutkan' },
                    { text: '❌ BATAL', callback_data: 'wd_batal' }
                ]
            ]
        }
    });
});

bot.action('wd_lanjutkan', async (ctx) => {
    const user = checkUser(ctx);
    user.state = 'WAIT_WD_AMOUNT';
    saveDB();
    await ctx.answerCbQuery();
    return ctx.reply('✍️ Silakan masukkan jumlah koin yang ingin Anda WD:');
});

bot.action('wd_batal', async (ctx) => {
    await ctx.answerCbQuery('Withdraw dibatalkan');
    await ctx.deleteMessage().catch(() => {});
    const user = checkUser(ctx);
    const caption = `💠 <b>SANZ SYSTEM</b>\n━━━━━━━━━━━━━━━\n💰 Saldo : <b>${formatKoin(user.balance)} </b>\n━━━━━━━━━━━━━━━\n📖 Gunakan tombol COMMAND\nuntuk melihat semua menu bot.`;
    return sendStartMedia(ctx, caption, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📥 DEPOSIT', callback_data: 'menu_depo' }, { text: '📤 WD', callback_data: 'menu_wd' }],
                [{ text: '📖 COMMAND', callback_data: 'show_menu' }],
                [{ text: '➕ TAMBAH GRUP', url: `https://t.me/${BOT_USERNAME}?startgroup=true` }]
            ]
        }
    });
});

bot.on('text', async (ctx) => {
    if (ctx.chat.type !== 'private') {
        const chatId = String(ctx.chat.id);

        if (!groupMembers[chatId]) {
            groupMembers[chatId] = {};
        }

        groupMembers[chatId][ctx.from.id] = {
            id: ctx.from.id,
            name: ctx.from.first_name || 'User'
        };
    } else {
        if (!(await checkMustJoin(ctx))) return;
    }

    const rawMsg = ctx.message.text.trim();
    const upMsg = rawMsg.toUpperCase();
    const user = checkUser(ctx);
    const chatId = ctx.chat.id;
    
    if (upMsg === 'SECURITY' || upMsg === '/SECURITY') {
        if (ctx.chat.type === 'private') {
            return ctx.reply('❌ Hanya untuk grup.');
        }

        const admins = await ctx.getChatAdministrators();
        const isAdmin = admins.some(a => a.user.id === ctx.from.id);

        if (!isAdmin && ctx.from.id !== OWNER_ID) {
            return ctx.reply('❌ Hanya admin grup.');
        }

        const settings = getGroupConfig(ctx.chat.id);

        return ctx.replyWithHTML(
`⚙️ <b>SECURITY MENU</b>

🚫 Anti Link :
${settings.antiLink ? '✅ ON' : '❌ OFF'}

📨 Anti Forward :
${settings.antiForward ? '✅ ON' : '❌ OFF'}

⭐ Anti Emoji Premium :
${settings.antiEmoji ? '✅ ON' : '❌ OFF'}`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: 'ON LINK', callback_data: 'security_link_on' },
                            { text: 'OFF LINK', callback_data: 'security_link_off' }
                        ],
                        [
                            { text: 'ON FORWARD', callback_data: 'security_forward_on' },
                            { text: 'OFF FORWARD', callback_data: 'security_forward_off' }
                        ],
                        [
                            { text: 'ON EMOJI', callback_data: 'security_emoji_on' },
                            { text: 'OFF EMOJI', callback_data: 'security_emoji_off' }
                        ]
                    ]
                }
            }
        );
    }
    
    if (upMsg.startsWith('TAGALL') || upMsg.startsWith('/TAGALL')) {
        if (ctx.chat.type === 'private') {
            return ctx.reply('❌ Command hanya untuk grup.');
        }

        const admins = await ctx.getChatAdministrators();
        const isAdmin = admins.some(a => a.user.id === ctx.from.id);

        if (!isAdmin && ctx.from.id !== OWNER_ID) {
            return ctx.reply('❌ Hanya admin grup.');
        }

        const chatId = String(ctx.chat.id);
        const members = Object.values(groupMembers[chatId] || {});

        if (members.length === 0) {
            return ctx.reply('❌ Tidak ada member tersimpan.');
        }

        let pesan = rawMsg.split(' ').slice(1).join(' ');
        if (!pesan) {
            pesan = 'TAG ALL MEMBER';
        }

        let text = `📢 <b>TAG ALL MEMBER</b>\n\n📝 ${pesan}\n\n━━━━━━━━━━━━━━━\n`;

        for (const m of members) {
            text += `\n• <a href="tg://user?id=${m.id}">${m.name}</a>`;
        }

        return ctx.replyWithHTML(text, { disable_web_page_preview: true });
    }
    
    if (upMsg === 'TO' || upMsg === '/TO') {
        const totalMain = 10;
        const progress = user.to || 0;

        const saldoDipakai = Object.values(sessionBet)
            .flatMap(s => s ? [...s.besar, ...s.kecil] : [])
            .filter(x => String(x.id) === String(ctx.from.id))
            .reduce((a, b) => a + b.bet, 0);

        const saldoDiam = user.balance;
        const saldoBebas = saldoDipakai;

        return ctx.replyWithHTML(
`📊 <b>TURNOVER USER</b>
━━━━━━━━━━━━━━━
👤 ${user.name}
🎮 Progress Main:
${progress}/${totalMain}
💰 Saldo Diam:
${formatKoin(saldoDiam)} Coin
🎲 Saldo Bebas:
${formatKoin(saldoBebas)} Coin
━━━━━━━━━━━━━━━
${progress >= totalMain ? '✅ Kamu sudah bisa WD' : '❌ Minimal 10x main untuk WD'}
━━━━━━━━━━━━━━━
💠 SANZ SYSTEM`
        );
    }
    
    if (upMsg === 'HISTORY' || upMsg === '/HISTORY') {
        const history = userHistory[ctx.from.id];

        if (!history || history.length === 0) {
            return ctx.replyWithHTML(`❌ <b>HISTORY KOSONG</b>`);
        }

        let text = `👤 <b>USER ${user.name.toUpperCase()}</b>\n\n🕘 <b>10 pick terakhir kamu:</b>\n\n`;

        history.forEach(h => {
            const d = new Date(h.time);
            const tgl = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} WIB`;
            text += `• ${tgl} · ${h.side === 'BESAR' ? 'Besar' : 'Kecil'} · ${formatKoin(h.bet)} · ${h.result}\n`;
        });

        return ctx.replyWithHTML(text);
    }
    
    if (upMsg.startsWith('DELCOIN') || upMsg.startsWith('/DELCOIN')) {
        if (ctx.from.id !== OWNER_ID) return;
        if (ctx.chat.type !== 'private') {
            return ctx.reply('❌ Command hanya bisa digunakan di private chat bot.');
        }

        const args = rawMsg.split(/\s+/);
        let targetId;
        let jumlah;

        if (ctx.message.reply_to_message) {
            targetId = String(ctx.message.reply_to_message.from.id);
            jumlah = parseFloat(args[1]);
        } else {
            targetId = args[1];
            jumlah = parseFloat(args[2]);
        }
        
        if (!targetId || isNaN(jumlah)) {
            return ctx.replyWithHTML(`❌ <b>FORMAT SALAH</b>\n📌 Via ID:\n<code>/delcoin id jumlah</code>\n📌 Reply User:\n<code>/delcoin jumlah</code>\nContoh:\n<code>/delcoin 123456789 50</code>`);
        }

        if (!db.users[targetId]) {
            return ctx.reply('❌ User tidak ditemukan.');
        }

        const potong = jumlah * HARGA_PER_KOIN;

        if (db.users[targetId].balance < potong) {
            db.users[targetId].balance = 0;
        } else {
            db.users[targetId].balance -= potong;
        }
        saveDB();

        return ctx.replyWithHTML(
`✅ <b>DELCOIN BERHASIL</b>
━━━━━━━━━━━━━━━
👤 User:
${db.users[targetId].name}
💸 Coin Dihapus:
${jumlah} Coin
💰 Saldo Sekarang:
${formatKoin(db.users[targetId].balance)} Coin
━━━━━━━━━━━━━━━
💠 SANZ SYSTEM`
        );
    }
    
    if (upMsg.startsWith('/ANGPAU')) {
        if (ctx.chat.type === 'private') {
            return ctx.reply('❌ Hanya bisa digunakan di grup.');
        }

        const args = rawMsg.split(/\s+/);
        const totalCoin = parseFloat(args[1]);
        const totalUser = parseInt(args[2]);

        if (isNaN(totalCoin) || isNaN(totalUser)) {
            return ctx.replyWithHTML(`❌ <b>FORMAT SALAH</b>\n\nContoh:\n<code>/angpau 50 10</code>\n\nArtinya 50 coin untuk 10 orang`);
        }

        if (totalCoin <= 0 || totalUser <= 0) {
            return ctx.reply('❌ Jumlah tidak valid.');
        }

        const totalBalance = totalCoin * HARGA_PER_KOIN;

        if (user.balance < totalBalance) {
            return ctx.reply('❌ Saldo tidak cukup.');
        }

        user.balance -= totalBalance;
        saveDB();

        const angpauId = Date.now().toString();

        angpauData[angpauId] = {
            owner: ctx.from.id,
            totalBalance,
            totalUser,
            claimed: [],
            remaining: totalBalance
        };

        return ctx.replyWithHTML(
            `🧧 <b>ANGPAU DIBAGIKAN</b>\n━━━━━━━━━━━━━━━\n👤 ${user.name}\n💰 ${totalCoin} Coin\n👥 ${totalUser} Orang\n━━━━━━━━━━━━━━━\n🎁 Klik tombol dibawah untuk mengambil angpau`,
            {
                reply_markup: {
                    inline_keyboard: [[{ text: '🎁 AMBIL ANGPAU', callback_data: `claim_angpau_${angpauId}` }]]
                }
            }
        );
    }
        
    if (upMsg === 'WS') {
        const ws = user.ws || 0;
        return ctx.replyWithHTML(`🔥 <b>WIN STREAK</b>\n━━━━━━━━━━━━━━━\n👤 User: ${user.name}\n\n🔥 WS Kamu:\n${ws}\n\n🎁 <b>EVENT WS</b>\n4 WS = 1 Coin\n5 WS = 2 Coin\n6 WS = 3 Coin\n7 WS = 4 Coin\n8 WS = 5 Coin\n9 WS = 6 Coin\n10 WS = 7 Coin\n15 WS = 9 Coin\n━━━━━━━━━━━━━━━\n💠 SANZ SYSTEM`);
    }
        
    if (upMsg === 'CLAIMWS') {
        const ws = user.ws || 0;
        let rewardCoin = 0;

        if (ws >= 15) rewardCoin = 9;
        else if (ws >= 10) rewardCoin = 7;
        else if (ws >= 9) rewardCoin = 6;
        else if (ws >= 8) rewardCoin = 5;
        else if (ws >= 7) rewardCoin = 4;
        else if (ws >= 6) rewardCoin = 3;
        else if (ws >= 5) rewardCoin = 2;
        else if (ws >= 4) rewardCoin = 1;

        if (rewardCoin <= 0) {
            return ctx.replyWithHTML(`❌ <b>CLAIM GAGAL</b>\n━━━━━━━━━━━━━━━\n🔥 Minimal 4 WS untuk claim.\n━━━━━━━━━━━━━━━\n💠 SANZ SYSTEM`);
        }

        const rewardBalance = rewardCoin * HARGA_PER_KOIN;
        user.balance += rewardBalance;
        user.ws = 0;
        saveDB();
        
        return ctx.replyWithHTML(`✅ <b>CLAIM WS BERHASIL</b>\n━━━━━━━━━━━━━━━\n👤 ${user.name}\n🔥 WS: ${ws}\n🪙 Reward:\n${rewardCoin} Coin\n💰 Saldo Masuk:\n${formatKoin(rewardBalance)}\n━━━━━━━━━━━━━━━\n💠 SANZ SYSTEM`);
    }

    if (upMsg === 'SALDO') {
        return ctx.replyWithHTML(`💳 <b>DOMPET KOIN</b>\n\n<b>User:</b> ${user.name}\n<b>Saldo:</b> ${formatKoin(user.balance)} Koin\n\n1 koin : 1.000\nMin Bet : ${MIN_BET}\nMin WD : ${MIN_WD}`);
    }
    
    if (upMsg === 'LISTCOIN' || upMsg === '/LISTCOIN') {
        if (ctx.from.id !== OWNER_ID) return;
        if (ctx.chat.type !== 'private') {
            return ctx.reply('❌ Command hanya bisa digunakan di private chat bot.');
        }

        const users = Object.values(db.users)
            .sort((a, b) => b.balance - a.balance)
            .slice(0, 100);

        if (users.length === 0) {
            return ctx.reply('❌ Tidak ada data user.');
        }

        let text = `🏆 <b>LIST COIN USER</b>\n━━━━━━━━━━━━━━━\n`;

        users.forEach((u, i) => {
            text += `${i + 1}. ${u.name}\n`;
            text += `🆔 <code>${u.id}</code>\n`;
            text += `💰 ${formatKoin(u.balance)} Koin\n\n`;
        });

        text += `━━━━━━━━━━━━━━━\n`;
        text += `👑 Total User: ${users.length}\n`;
        text += `💠 SANZ SYSTEM`;

        return ctx.replyWithHTML(text);
    }

    if (upMsg.startsWith('TF')) {
        const parts = rawMsg.split(/\s+/);
        const amtK = parseFloat(parts[1]);
        let targetId;

        if (ctx.message.reply_to_message) {
            targetId = ctx.message.reply_to_message.from.id;
        } else {
            targetId = parts[2];
        }

        if (!targetId || isNaN(amtK)) return;

        const cost = amtK * HARGA_PER_KOIN;
        if (user.balance < cost) {
            return ctx.reply('Saldo tidak cukup.');
        }

        if (!db.users[targetId]) {
            db.users[targetId] = { id: String(targetId), balance: 0, name: 'User', ws: 0 };
        }

        user.balance -= cost;
        db.users[targetId].balance += cost;
        saveDB();

        const targetName = db.users[targetId].name || 'User';

        try {
            await bot.telegram.sendMessage(targetId, `💸 <b>KOIN MASUK!</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Dari:</b> ${user.name}\n💰 <b>Jumlah:</b> ${amtK.toLocaleString('id-ID')} Koin\n━━━━━━━━━━━━━━━━━━\n💠 <b>SANZ SYSTEM v104.0</b>`, { parse_mode: 'HTML' });
        } catch {}

        return ctx.replyWithHTML(`✅ <b>TF BERHASIL!</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Ke:</b> ${targetName}\n💰 <b>Jumlah:</b> ${amtK.toLocaleString('id-ID')} Koin\n━━━━━━━━━━━━━━━━━━\n💠 <b>SANZ SYSTEM v104.0</b>`);
    }

    if (upMsg.startsWith('SETMINBET')) {
        if (ctx.from.id !== OWNER_ID) return;
        const args = rawMsg.split(/\s+/);
        const amount = parseFloat(args[1]?.replace(',', '.'));

        if (isNaN(amount) || amount <= 0) {
            return ctx.replyWithHTML(`❌ <b>FORMAT SALAH</b>\n\nContoh:\n<code>SETMINBET 2</code>`);
        }

        MIN_BET = amount;
        return ctx.replyWithHTML(`✅ <b>MIN BET BERHASIL DIUBAH</b>\n━━━━━━━━━━━━━━━\n🎲 Minimal Bet:\n${MIN_BET} Coin\n━━━━━━━━━━━━━━━\n💠 SANZ SYSTEM`);
    }
        
    if (upMsg.startsWith('SETMINWD')) {
        if (ctx.from.id !== OWNER_ID) return;
        const args = rawMsg.split(/\s+/);
        const amount = parseFloat(args[1]?.replace(',', '.'));

        if (isNaN(amount) || amount <= 0) {
            return ctx.replyWithHTML(`❌ <b>FORMAT SALAH</b>\n\nContoh:\n<code>SETMINWD 5</code>`);
        }

        MIN_WD = amount;
        return ctx.replyWithHTML(`✅ <b>MIN WD BERHASIL DIUBAH</b>\n━━━━━━━━━━━━━━━\n💸 Minimal WD:\n${MIN_WD} Coin\n━━━━━━━━━━━━━━━\n💠 SANZ SYSTEM`);
    }

    if (upMsg === 'SETGAME') {
        return ctx.replyWithHTML('PILIH BO YANG DI INGINKAN', Markup.inlineKeyboard([
            [Markup.button.callback('BO1', 'set_1'), Markup.button.callback('BO3', 'set_3'), Markup.button.callback('BO5', 'set_5')]
        ]));
    }

    const bMatch = upMsg.replace(/\s+/g, '').match(/^(B|K)([0-9,.]+|ALL)$/);
    if (bMatch && ctx.chat.type !== 'private') {
        if (!sessionBet[chatId]) {
            sessionBet[chatId] = { besar: [], kecil: [], startTime: Date.now(), createdAt: Date.now() };
        }

        const s = sessionBet[chatId];
        let oldBet = null;
        let oldSide = null;

        if (s.besar.find(u => String(u.id) === String(ctx.from.id))) {
            oldBet = s.besar.find(u => String(u.id) === String(ctx.from.id));
            oldSide = 'besar';
        }
        if (s.kecil.find(u => String(u.id) === String(ctx.from.id))) {
            oldBet = s.kecil.find(u => String(u.id) === String(ctx.from.id));
            oldSide = 'kecil';
        }

        if (oldBet) {
            user.balance += oldBet.bet;
            s[oldSide] = s[oldSide].filter(u => String(u.id) !== String(ctx.from.id));
        }

        let cost;
        if (bMatch[2] === 'ALL') {
            cost = user.balance;
        } else {
            cost = parseFloat(bMatch[2].replace(',', '.')) * HARGA_PER_KOIN;
        }

        const minBetBalance = MIN_BET * HARGA_PER_KOIN;
        if (cost < minBetBalance) {
            return ctx.reply(`❌ Minimal taruhan ${MIN_BET} coin`);
        }

        if (user.balance < cost || cost <= 0) {
            return ctx.reply('Saldo kurang atau tidak valid.');
        }

        user.balance -= cost;
        user.to = (user.to || 0) + 1;

        const betData = {
            id: ctx.from.id,
            name: user.name,
            bet: cost,
            side: bMatch[1] === 'B' ? 'BESAR' : 'KECIL',
            time: Date.now(),
            result: 'PENDING'
        };
        s[bMatch[1] === 'B' ? 'besar' : 'kecil'].push(betData);

        if (!userHistory[ctx.from.id]) {
            userHistory[ctx.from.id] = [];
        }

        userHistory[ctx.from.id].unshift({
            time: betData.time,
            side: betData.side,
            bet: betData.bet,
            result: '⏳ belum'
        });

        if (userHistory[ctx.from.id].length > 10) {
            userHistory[ctx.from.id].pop();
        }

        saveDB();
        return ctx.replyWithHTML(renderBetList(chatId));
    }
        
    if (upMsg.startsWith('KURANG') && ctx.chat.type !== 'private') {
        const s = sessionBet[chatId];
        if (!s) return ctx.reply('❌ Tidak ada taruhan aktif.');

        let betUser = s.besar.find(u => u.id === ctx.from.id);
        let side = 'besar';

        if (!betUser) {
            betUser = s.kecil.find(u => u.id === ctx.from.id);
            side = 'kecil';
        }

        if (!betUser) return ctx.reply('❌ Kamu belum memasang taruhan.');

        const args = rawMsg.split(/\s+/);
        const amountK = parseFloat(args[1]);

        if (!amountK || isNaN(amountK) || amountK <= 0) {
            return ctx.replyWithHTML(`❌ <b>FORMAT SALAH</b>\n\nContoh:\n<code>KURANGI 30</code>`);
        }

        const reduceAmount = amountK * HARGA_PER_KOIN;
        if (reduceAmount >= betUser.bet) {
            return ctx.replyWithHTML(`❌ <b>GAGAL KURANGI</b>\n━━━━━━━━━━━━━━━\n💰 <b>Taruhan:</b>\n${formatKoin(betUser.bet)} K\n\n💸 <b>Pengurangan:</b>\n${formatKoin(reduceAmount)} K\n━━━━━━━━━━━━━━━\n⚠️ Pengurangan melebihi taruhan`);
        }

        betUser.bet -= reduceAmount;
        user.balance += reduceAmount;
        saveDB();

        await ctx.replyWithHTML(`✅ <b>TARUHAN ${user.name} DIKURANGI ${formatKoin(reduceAmount)}</b>`);
        return ctx.replyWithHTML(renderBetList(chatId));
    }      

    if ((upMsg === 'KUR' || upMsg === '/KUR') && ctx.chat.type !== 'private') {
        const s = sessionBet[chatId];
        if (!s) return ctx.reply('❌ Tidak ada taruhan.');

        const now = Date.now();
        let betUser = s.besar.find(u => u.id === ctx.from.id);
        let side = 'besar';

        if (!betUser) {
            betUser = s.kecil.find(u => u.id === ctx.from.id);
            side = 'kecil';
        }

        if (!betUser) return ctx.reply('❌ Kamu tidak ikut taruhan.');

        const betAge = now - betUser.time;
        if (betAge < 60000) {
            const sisa = Math.ceil((60000 - betAge) / 1000);
            return ctx.reply(`⏳ KUR hanya bisa setelah 60 detik.\nTunggu ${sisa} detik lagi.`);
        }

        if (kurCooldown[ctx.from.id] && now < kurCooldown[ctx.from.id]) {
            const sisa = Math.ceil((kurCooldown[ctx.from.id] - now) / 1000);
            return ctx.reply(`⏳ Tunggu ${sisa} detik sebelum KUR lagi.`);
        }

        user.balance += betUser.bet;
        s[side] = s[side].filter(u => u.id !== ctx.from.id);
        kurCooldown[ctx.from.id] = now + 30000;

        if (s.besar.length === 0 && s.kecil.length === 0) {
            sessionBet[chatId] = null;
        }

        saveDB();

        await ctx.replyWithHTML(`✅ <b>TARUHAN DIKEMBALIKAN</b>\n━━━━━━━━━━━━━━━\n👤 ${user.name}\n💰 Refund:${formatKoin(betUser.bet)}\n━━━━━━━━━━━━━━━\n⏳ Cooldown KUR 30 detik`);

        if (sessionBet[chatId]) {
            return ctx.replyWithHTML(renderBetList(chatId));
        }
        return ctx.reply('❌ Semua taruhan telah dibatalkan.');
    }
        
    if ((upMsg === 'R' || upMsg === 'ROLL') && ctx.chat.type !== 'private') {
        const s = sessionBet[chatId];
        if (!s) return;

        const now = Date.now();
        const gameAge = now - s.createdAt;

        if (gameAge < 15000) {
            const sisa = Math.ceil((15000 - gameAge) / 1000);
            return ctx.reply(`⏳ Roll bisa dilakukan ${sisa} detik lagi.`);
        }

        if (rollCooldown[chatId] && now < rollCooldown[chatId]) {
            const sisa = Math.ceil((rollCooldown[chatId] - now) / 1000);
            return ctx.reply(`⏳ Tunggu ${sisa} detik sebelum roll lagi.`);
        }

        rollCooldown[chatId] = now + 10000;
        const totalB = s.besar.reduce((a, b) => a + b.bet, 0);
        const totalK = s.kecil.reduce((a, b) => a + b.bet, 0);
        const selisih = Math.abs(totalB - totalK);

        if (selisih > 0) {
            let oldBet = null;
            let oldSide = null;

            if (s.besar.find(u => String(u.id) === String(ctx.from.id))) {
                oldBet = s.besar.find(u => String(u.id) === String(ctx.from.id));
                oldSide = 'besar';
            }
            if (s.kecil.find(u => String(u.id) === String(ctx.from.id))) {
                oldBet = s.kecil.find(u => String(u.id) === String(ctx.from.id));
                oldSide = 'kecil';
            }

            if (oldSide) s[oldSide] = s[oldSide].filter(u => String(u.id) !== String(ctx.from.id));
            if (oldBet) user.balance += oldBet.bet;

            const totalBBaru = s.besar.reduce((a, b) => a + b.bet, 0);
            const totalKBaru = s.kecil.reduce((a, b) => a + b.bet, 0);
            const side = totalBBaru < totalKBaru ? 'besar' : 'kecil';
            const needBet = Math.abs(totalBBaru - totalKBaru);

            if (needBet <= 0) return ctx.reply('🎲 Meja sudah seimbang.');
            if (user.balance < needBet) return ctx.reply('Saldo tidak cukup untuk auto balance.');

            user.balance -= needBet;
            s[side].push({ id: ctx.from.id, name: user.name, bet: needBet, time: Date.now() });
            saveDB();
        }

        startGameOwner[chatId] = String(ctx.from.id);
        startGameTimeout[chatId] = Date.now() + 30000;

        await ctx.replyWithHTML(renderBetList(chatId));

        return ctx.reply(`🎲 GAME READY\n👤 Yang bisa mulai:\n${user.name}\n\n⏳ Setelah 30 detik semua user bisa mulai.`,
            Markup.inlineKeyboard([[Markup.button.callback('✅ MULAI', 'start_game')]])
        );
    }

   
// FITUR DUEL BO3
if (
    upMsg.startsWith('/DUEL') ||
    upMsg.startsWith('/DUELB') ||
    upMsg.startsWith('/DUELK')
) {

    // support:
    // /duel b 1
    // /duelb1
    // /duelk5

    const duelMatch = rawMsg
        .replace(/\s+/g, '')
        .match(/^\/DUEL([BK])([0-9.,]+)$/i);

    let side;
    let amount;

    if (duelMatch) {

        side = duelMatch[1].toUpperCase();

        amount = parseFloat(
            duelMatch[2].replace(',', '.')
        );

    } else {

        const args = rawMsg.split(/\s+/);

        side = args[1]?.toUpperCase();

        amount = parseFloat(
            args[2]?.replace(',', '.')
        );
    }

    if (
        !side ||
        isNaN(amount)
    ) {
        return ctx.replyWithHTML(
`❌ <b>FORMAT SALAH</b>

Contoh:
<code>/duel b 1</code>
<code>/duel k 5</code>

Tanpa spasi juga bisa:
<code>/duelb1</code>
<code>/duelk5</code>`
        );
    }

    if (side !== 'B' && side !== 'K') {
        return ctx.reply('❌ Gunakan B atau K');
    }

    const bet = amount * HARGA_PER_KOIN;

    if (bet < MIN_BET * HARGA_PER_KOIN) {
        return ctx.reply(
            `❌ Minimal bet ${MIN_BET} coin`
        );
    }

    if (user.balance < bet) {
        return ctx.reply('❌ Saldo tidak cukup.');
    }

    user.balance -= bet;

user.to = (user.to || 0) + 1;

saveDB();

    const roomId =
        ctx.chat.type === 'private'
            ? `pv_${ctx.from.id}`
            : String(ctx.chat.id);

    await ctx.replyWithHTML(
`🎲 <b>DUEL DIMULAI!</b>
👤 Player: ${user.name}
💎 Bet: ${amount} 
🎯 Pilihan: ${side === 'B' ? 'BESAR' : 'KECIL'}
━━━━━━━━━━━━━━━
🤖 Bot sedang mengocok dadu...`
    );

    let diceResults = [];

    let pointBesar = 0;
    let pointKecil = 0;

    // SYSTEM BO3
   
    for (let i = 0; i < 3; i++) {

        const d = await ctx.replyWithDice();

        const nilai = d.dice.value;

diceResults.push(nilai);

const resultText =
    nilai >= 4
        ? 'BESAR'
        : 'KECIL';

await ctx.replyWithHTML(
`🎲 M${i + 1} 123 <b>${nilai}</b> (${resultText})`
);

if (nilai >= 4) {
    pointBesar++;
} else {
    pointKecil++;
}

        await new Promise(r => setTimeout(r, 4000));

        // jika sudah ada 2 point langsung selesai
        if (
            pointBesar >= 2 ||
            pointKecil >= 2
        ) {
            break;
        }
    }

    const hasil =
        pointBesar >= 2
            ? 'BESAR'
            : 'KECIL';

    const pilihanUser =
        side === 'B'
            ? 'BESAR'
            : 'KECIL';

    const menang = hasil === pilihanUser;

    let hadiah = 0;

    if (menang) {

        hadiah = bet * 2;

        const tax = hadiah * PAJAK_WIN;

        hadiah -= tax;

        user.balance += hadiah;

        user.ws = (user.ws || 0) + 1;

        const ws = user.ws;

        let reward = 0;

        if (ws >= 15) reward = 9;
        else if (ws >= 10) reward = 7;
        else if (ws >= 9) reward = 6;
        else if (ws >= 8) reward = 5;
        else if (ws >= 7) reward = 4;
        else if (ws >= 6) reward = 3;
        else if (ws >= 5) reward = 2;
        else if (ws >= 4) reward = 1;

        if (reward > 0) {

            bot.telegram.sendMessage(
                ctx.from.id,
`🎉 Selamat ${user.name}
🔥 WS kamu sudah ${ws}
🎁 Kamu bisa claim:
${reward} Coin

Ketik:
CLAIMWS`
            ).catch(() => {});
        }

    } else {

        user.ws = 0;
    }

    saveDB();

    // LAST WIN KHUSUS DUEL

    if (!duelLastWin[roomId]) {
    duelLastWin[roomId] = [];
}

if (!gameCounter[roomId]) {
    gameCounter[roomId] = 1;
}

duelLastWin[roomId].push(
    `${gameCounter[roomId]}. ${hasil}`
);

gameCounter[roomId]++;

if (duelLastWin[roomId].length > 80) {
    duelLastWin[roomId].shift();
}

let historyText = duelLastWin[roomId].join('\n');
    
    // HASIL AKHIR

    await ctx.replyWithHTML(
`${menang ? '✅' : '❌'} <b>HASIL DUEL BO3</b>
<blockquote expandable>👤 Player: ${user.name}
🎯 RESULT: ${hasil}
🎲 DADU: ${diceResults.join(' - ')}
📊 SCORE: BESAR ${pointBesar} : ${pointKecil} KECIL
💰 BET: ${amount} K
${menang
? `🏆 MENANG: +${formatKoin(hadiah)} K`
: `💀 KALAH: -${amount} K`}
🔥 WS: ${user.ws || 0}
💳 SALDO: ${formatKoin(user.balance)} </blockquote>
📊 <b>LAST WIN DUEL</b>
<blockquote expandable><b><i>${historyText}</i></b></blockquote>
💠 SANZ SYSTEM`
    );
}

    if (ctx.chat.type === 'private' && user.state === 'WAIT_DEPO_AMOUNT') {
        const amount = parseInt(rawMsg);
        if (isNaN(amount) || amount <= 0) return ctx.reply('Jumlah tidak valid.');

        user.tempDepo = amount;
        user.state = 'WAIT_PROOF';
        saveDB();

        return ctx.replyWithPhoto(QRIS_IMAGE, {
            caption: `💳 <b>DEPOSIT COIN</b>\n━━━━━━━━━━━━━━━\n🪙 <b>Jumlah Coin:</b>\n${formatKoin(amount * HARGA_PER_KOIN)}K\n💵 <b>Total Harga:</b>\nRp ${(amount * HARGA_PER_KOIN).toLocaleString('id-ID')}\n━━━━━━━━━━━━━━━\n📌 <b>INSTRUKSI</b>\n• Scan QRIS di atas\n• Transfer sesuai nominal\n• Kirim bukti transfer\n━━━━━━━━━━━━━━━\n⏳ Menunggu bukti pembayaran...`,
            parse_mode: 'HTML'
        });
    }

    // HANDLER INPUT JUMLAH WD: SUDAH FIX NILAI KOIN MURNI
    if (ctx.chat.type === 'private' && user.state === 'WAIT_WD_AMOUNT') {
        const amount = parseFloat(rawMsg.replace(',', '.'));
        if ((user.to || 0) < 10) {
            return ctx.replyWithHTML(
`❌ <b>WD DITOLAK</b>
━━━━━━━━━━━━━━━
🎮 TO Kamu:
${user.to || 0}/10
⚠️ Minimal 10x bermain
untuk melakukan withdraw.
━━━━━━━━━━━━━━━
💠 SANZ SYSTEM`
            );
        }
        if (isNaN(amount) || amount <= 0) return ctx.reply('Jumlah tidak valid.');

        if (amount < MIN_WD) return ctx.reply(`❌ Minimal WD ${MIN_WD} coin`);
        
        const wdRupiah = amount * HARGA_PER_KOIN;
        if (user.balance < wdRupiah) return ctx.reply('Saldo kurang.');

        user.tempWD = { amount: amount, rupiah: wdRupiah };
        user.state = 'WAIT_WD_BANK';
        saveDB();
        return ctx.reply('🏦 Masukkan nama Bank / E-Wallet (Contoh: DANA, OVO, BCA):');
    }

    if (user.state === 'WAIT_WD_BANK') {
        user.tempWD.bank = rawMsg;
        user.state = 'WAIT_WD_NAME';
        saveDB();
        return ctx.reply('👤 Masukkan Nama Pemilik Rekening:');
    }

    if (user.state === 'WAIT_WD_NAME') {
        user.tempWD.name = rawMsg;
        user.state = 'WAIT_WD_NUMBER';
        saveDB();
        return ctx.reply('🔢 Masukkan Nomor Rekening / No E-Wallet:');
    }

    if (user.state === 'WAIT_WD_NUMBER') {
        user.tempWD.number = rawMsg;
        user.balance -= user.tempWD.rupiah;
        saveDB();

        const wd = user.tempWD;
        try {
            await bot.telegram.sendMessage(OWNER_ID, `📤 <b>REQUEST WITHDRAW</b>\n━━━━━━━━━━━━━━━\n👤 <b>User:</b> ${user.name}\n🆔 <b>ID:</b> <code>${ctx.from.id}</code>\n\n🪙 <b>Jumlah Coin:</b>\n${wd.amount} Koin\n\n💵 <b>Total Rupiah:</b>\nRp ${wd.rupiah.toLocaleString('id-ID')}\n\n🏦 <b>Bank:</b> ${wd.bank}\n👤 <b>Nama:</b> ${wd.name}\n🔢 <b>No Rek:</b> <code>${wd.number}</code>\n━━━━━━━━━━━━━━━\n📌 <i>Periksa data sebelum ACC</i>`, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: `✅ ACC ${wd.amount} Koin`, callback_data: `accwd_${ctx.from.id}_${wd.amount}` }]]
                }
            });
        } catch {}

        user.state = null;
        saveDB();
        return ctx.reply('🚀 Request WD Anda berhasil dikirim ke Owner. Mohon tunggu proses ACC.');
    }
});

bot.on('photo', async (ctx) => {
    const user = checkUser(ctx);
    if (user.state !== 'WAIT_PROOF') return;

    user.state = null;
    saveDB();

    const coin = user.tempDepo;
    const rupiah = coin * HARGA_PER_KOIN;

    try {
        await bot.telegram.sendPhoto(OWNER_ID, ctx.message.photo[ctx.message.photo.length - 1].file_id, {
            caption: `📥 <b>REQUEST DEPOSIT</b>\n━━━━━━━━━━━━━━━\n👤 <b>User:</b> ${user.name}\n🆔 <b>ID:</b> <code>${ctx.from.id}</code>\n🪙 <b>Jumlah Coin:</b>\n${coin} \n💵 <b>Total Harga:</b>\nRp ${rupiah.toLocaleString('id-ID')}\n━━━━━━━━━━━━━━━\n📌 <i>Silakan cek bukti & ACC jika valid</i>`,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: `✅ ACC (${coin}K)`, callback_data: `accdepo_${ctx.from.id}_${coin}` }]]
            }
        });
    } catch {}

    ctx.reply('Deposit dikirim.');
});
    
bot.action('confirm_auto', async (ctx) => {
    const chatId = ctx.chat.id;
    const data = autoFillBet[chatId];
    if (!data) return;

    const s = sessionBet[chatId];
    if (!s) return;

    const user = db.users[data.userId];
    if (!user) return;

    if (user.balance < data.bet) {
        return ctx.answerCbQuery('Saldo tidak cukup');
    }

    user.balance -= data.bet;
    s[data.side].push({ id: data.userId, name: data.name, bet: data.bet });
    delete autoFillBet[chatId];
    saveDB();

    await ctx.editMessageText('✅ Auto balance berhasil ditambahkan');
    return ctx.reply('🎲 GAME READY', Markup.inlineKeyboard([[Markup.button.callback('✅ MULAI', 'start_game')]]));
});

bot.action('cancel_auto', async (ctx) => {
    const chatId = ctx.chat.id;
    delete autoFillBet[chatId];
    await ctx.editMessageText('❌ Auto balance dibatalkan');
});

bot.action(/^set_(\d+)$/, async (ctx) => {
    const mode = parseInt(ctx.match[1]);
    db.groups[ctx.chat.id] = { mode };
    saveDB();
    ctx.reply(`Mode BO${mode}`);
});

bot.action('start_game', async (ctx) => {
    const chatId = ctx.chat.id;
    const s = sessionBet[chatId];
    if (!s) return;

    const ownerRoll = startGameOwner[chatId];
    const timeout = startGameTimeout[chatId];
    const now = Date.now();

    if (timeout && now < timeout && String(ctx.from.id) !== ownerRoll) {
        return ctx.answerCbQuery('⏳ Hanya user yang roll yang bisa mulai game.', { show_alert: true });
    }

    const cfg = getGroupConfig(chatId);
    let wb = 0;
    let wk = 0;
    let diceResults = [];

    await ctx.deleteMessage().catch(() => {});

    const totalMeja = Math.floor((s.besar.reduce((a, b) => a + b.bet, 0) + s.kecil.reduce((a, b) => a + b.bet, 0)) / HARGA_PER_KOIN);

    for (let i = 1; i <= cfg.mode; i++) {
        const d = await ctx.replyWithDice();
        const res = d.dice.value <= 3 ? 'KECIL' : 'BESAR';
        diceResults.push(d.dice.value);

        if (res === 'BESAR') wb++;
        else wk++;

        await new Promise(r => setTimeout(r, 3500));
        await ctx.replyWithHTML(`🎲 M${i} 123 <b>${d.dice.value}</b> (${res})`);

        const needWin = Math.ceil(cfg.mode / 2);
        if (wb >= needWin || wk >= needWin) break;
    }

    const winSide = wb > wk ? 'besar' : 'kecil';
    const loseSide = winSide === 'besar' ? 'kecil' : 'besar';

    const totalPool = s.besar.reduce((a, b) => a + b.bet, 0) + s.kecil.reduce((a, b) => a + b.bet, 0);
    const totalWinnerBet = s[winSide].reduce((a, b) => a + b.bet, 0);

    s[winSide].forEach(u => {
        const gross = (u.bet / totalWinnerBet) * totalPool;
        const tax = gross * PAJAK_WIN;

        if (db.users[u.id]) {
            db.users[u.id].balance += (gross - tax);
            db.users[u.id].ws = (db.users[u.id].ws || 0) + 1;
        }

        if (userHistory[u.id]) {
            const h = userHistory[u.id].find(x => x.time === u.time && x.bet === u.bet);
            if (h) h.result = '✅ W';
        }
    });

    s[loseSide].forEach(u => {
        if (db.users[u.id]) {
            db.users[u.id].ws = 0;
        }

        if (userHistory[u.id]) {
            const h = userHistory[u.id].find(x => x.time === u.time && x.bet === u.bet);
            if (h) h.result = '❌ L';
        }
    });

    saveDB();

    if (!groupHistory[chatId]) groupHistory[chatId] = [];
    if (!gameCounter[chatId]) gameCounter[chatId] = 1;

    const score = `${Math.max(wb, wk)}-${Math.min(wb, wk)}`;
    groupHistory[chatId].push(`GAME ${gameCounter[chatId]} : ${winSide[0].toUpperCase()} ${score} ${totalMeja}`);

    if (groupHistory[chatId].length > 90) {
        groupHistory[chatId].shift();
    }

    gameCounter[chatId]++;
    const finalMsg = `<b>⎙ LAST WIN :</b>\n<blockquote expandable><b>${groupHistory[chatId].join('\n')}</b></blockquote>`;
    sessionBet[chatId] = null;
    saveDB();

    const sent = await ctx.replyWithHTML(finalMsg);
    try {
        await bot.telegram.pinChatMessage(chatId, sent.message_id);
    } catch {}
});
      
bot.action(/^accdepo_(\d+)_(\d+)$/, async (ctx) => {
    try {
        const uid = ctx.match[1];
        const amount = parseFloat(ctx.match[2]);

        if (!db.users[uid]) {
            return ctx.answerCbQuery('User tidak ditemukan');
        }

        // EVENT BONUS DEPOSIT
        let bonusCoin = 0;

        if (amount >= 20) bonusCoin = 2;
        else if (amount >= 15) bonusCoin = 1.5;
        else if (amount >= 10) bonusCoin = 1.1;
        else if (amount >= 9) bonusCoin = 1;
        else if (amount >= 8) bonusCoin = 0.9;
        else if (amount >= 7) bonusCoin = 0.8;
        else if (amount >= 6) bonusCoin = 0.7;
        else if (amount >= 5) bonusCoin = 0.6;
        else if (amount >= 4) bonusCoin = 0.5;
        else if (amount >= 3) bonusCoin = 0.4;

        const totalMasuk =
            (amount * HARGA_PER_KOIN) +
            (bonusCoin * HARGA_PER_KOIN);

        db.users[uid].balance += totalMasuk;

        saveDB();

        await ctx.answerCbQuery('Deposit berhasil di ACC');

        // EDIT PESAN OWNER
        try {
            await ctx.editMessageCaption(
`✅ <b>DEPOSIT BERHASIL</b>
━━━━━━━━━━━━━━━
👤 ID USER: <code>${uid}</code>
🪙 DEPOSIT: ${amount} Coin
🎁 BONUS EVENT: ${bonusCoin} Coin
💎 TOTAL MASUK: ${formatKoin(totalMasuk)}
💵 TOTAL: Rp ${(amount * HARGA_PER_KOIN).toLocaleString('id-ID')}
━━━━━━━━━━━━━━━
💠 SANZ SYSTEM v104.0`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: []
                    }
                }
            );
        } catch {}

        // NOTIF USER
        await bot.telegram.sendMessage(
            uid,
`✅ <b>DEPOSIT BERHASIL</b>
━━━━━━━━━━━━━━━
🪙 Coin Masuk:${formatKoin(totalMasuk)}
🎁 Bonus Event:${bonusCoin} Coin
💵 Total: Rp ${(amount * HARGA_PER_KOIN).toLocaleString('id-ID')}
━━━━━━━━━━━━━━━
💸SaldoSekarang: ${formatKoin(db.users[uid].balance)}
━━━━━━━━━━━━━━━
🎉 Deposit berhasil ditambahkan.`,
            {
                parse_mode: 'HTML'
            }
        );

        // LIVE NOTIFIKASI DEPOSIT KE CHANNEL
        try {

            const channelDepoMsg =
`🔔 <b>LIVE DEPOSIT</b>
━━━━━━━━━━━━━━━
👤 <b>User:</b> <a href="tg://user?id=${uid}">${db.users[uid].name}</a>
🆔 <b>User ID:</b> <code>${uid}</code>
🪙 <b>Deposit:</b> ${amount} Coin
🎁 <b>Bonus:</b> ${bonusCoin} Coin
💎 <b>Total Masuk:</b> ${formatKoin(totalMasuk)}K
💵 <b>Total Deposit:</b> Rp ${(amount * HARGA_PER_KOIN).toLocaleString('id-ID')}
🟢 <b>Status:</b> Deposit Berhasil
━━━━━━━━━━━━━━━
💠 <b>SANZ SYSTEM DICE BOT</b>`;

            await bot.telegram.sendMessage(
                CHANNEL_LOG_ID,
                channelDepoMsg,
                {
                    parse_mode: 'HTML'
                }
            );

        } catch (err) {
            console.log('Gagal kirim log deposit:', err);
        }

    } catch (err) {
        console.log(err);
    }
});
          
// HANDLER ACC WD: MEMAKAI TEMPLATE PERSIS YG ANDA MINTA & NOTIFIKASI CHANNEL
bot.action(/^accwd_(\d+)_([0-9.]+)$/, async (ctx) => {
    try {
        const uid = ctx.match[1];
        const amountCoin = parseFloat(ctx.match[2]);
        const totalRupiah = amountCoin * HARGA_PER_KOIN;

        if (!db.users[uid]) {
            return ctx.answerCbQuery('User tidak ditemukan');
        }

        await ctx.answerCbQuery('WD berhasil di ACC');

        const sisaSaldoText = formatKoin(db.users[uid].balance) + 'K';
        
        // Format teks mutlak sesuai permintaan Anda
        const msgWdTemplate = `✅ <b>WITHDRAW BERHASIL</b>
━━━━━━━━━━━━━━━
🪙 JUMLAH WD:
${amountCoin}
💵 TOTAL:
Rp ${totalRupiah.toLocaleString('id-ID')}
━━━━━━━━━━━━━━━
💸 SISA SALDO:
${sisaSaldoText}
━━━━━━━━━━━━━━━
🎉 Dana sedang diproses.`;

        // 1. Perbarui tampilan pesan di sisi Owner (Hapus Tombol Inline ACC)
        try {
            await ctx.editMessageText(`✅ <b>WITHDRAW BERHASIL</b>\n━━━━━━━━━━━━━━━\n👤 USER ID:\n<code>${uid}</code>\n🪙 JUMLAH WD:\n${amountCoin}\n💵 TOTAL:\nRp ${totalRupiah.toLocaleString('id-ID')}\n━━━━━━━━━━━━━━━\n💠 SANZ SYSTEM v104.0`, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [] }
            });
        } catch {}

        // 2. Kirim notifikasi sukses ke PM User
        await bot.telegram.sendMessage(uid, msgWdTemplate, { parse_mode: 'HTML' });

        // 3. Kirim notifikasi Log WD Sukses ke Channel Telegram Anda secara live
        try {
            const channelMsg = `🔔 <b>LIVE WITHDRAW</b>\n━━━━━━━━━━━━━━━\n👤 <b>User:</b> <a href="tg://user?id=${uid}">${db.users[uid].name}</a>\n🆔 <b>User ID:</b> <code>${uid}</code>\n🪙 <b>Jumlah WD:</b> ${amountCoin} Coin\n💵 <b>Total Dana:</b> Rp ${totalRupiah.toLocaleString('id-ID')}\n🟢 <b>Status:</b> Berhasil Dicairkan\n━━━━━━━━━━━━━━━\n💠 <b>SANZ SYSTEM DICE BOT</b>`;
            await bot.telegram.sendMessage(CHANNEL_LOG_ID, channelMsg, { parse_mode: 'HTML' });
        } catch (chErr) {
            console.log("Gagal kirim log ke channel. Pastikan bot sudah admin & ID Channel di config.js benar:", chErr);
        }

    } catch (err) {
        console.log(err);
    }
});
 
bot.action(/^claim_angpau_(.+)$/, async (ctx) => {
    const angpauId = ctx.match[1];
    const data = angpauData[angpauId];

    if (!data) {
        return ctx.answerCbQuery('❌ Angpau sudah habis.', { show_alert: true });
    }

    const uid = String(ctx.from.id);

    if (data.claimed.includes(uid)) {
        return ctx.answerCbQuery('❌ Kamu sudah mengambil angpau.', { show_alert: true });
    }

    if (data.claimed.length >= data.totalUser) {
        delete angpauData[angpauId];
        return ctx.answerCbQuery('❌ Angpau sudah habis.', { show_alert: true });
    }

    let reward;
    const sisaOrang = data.totalUser - data.claimed.length;

    if (sisaOrang === 1) {
        reward = data.remaining;
    } else {
        const min = 1 * HARGA_PER_KOIN;
        const max = Math.floor(data.remaining / sisaOrang * 2);

        reward = Math.floor(Math.random() * (max - min + 1)) + min;

        if (reward > data.remaining) {
            reward = data.remaining;
        }
    }

    if (!db.users[uid]) {
        db.users[uid] = {
            id: uid,
            name: ctx.from.first_name || 'User',
            username: ctx.from.username || '-',
            balance: 0,
            ws: 0
        };
    }

    db.users[uid].balance += reward;
    data.remaining -= reward;
    data.claimed.push(uid);
    saveDB();

    if (data.claimed.length >= data.totalUser || data.remaining <= 0) {
        try {
            await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        } catch {}
        delete angpauData[angpauId];
    }

    return ctx.answerCbQuery(`🎉 Kamu mendapatkan ${formatKoin(reward)} Coin`, { show_alert: true });
});

bot.action(/^security_(.+)_(on|off)$/, async (ctx) => {
    const type = ctx.match[1];
    const value = ctx.match[2];

    const admins = await ctx.getChatAdministrators();
    const isAdmin = admins.some(a => a.user.id === ctx.from.id);

    if (!isAdmin && ctx.from.id !== OWNER_ID) {
        return ctx.answerCbQuery('❌ Hanya admin grup.', { show_alert: true });
    }

    const settings = getGroupConfig(ctx.chat.id);
    const isOn = value === 'on';

    if (type === 'link') settings.antiLink = isOn;
    if (type === 'forward') settings.antiForward = isOn;
    if (type === 'emoji') settings.antiEmoji = isOn;

    await ctx.answerCbQuery(`✅ ${type.toUpperCase()} ${isOn ? 'ON' : 'OFF'}`);

    return ctx.editMessageText(
`⚙️ SECURITY MENU

🚫 Anti Link :
${settings.antiLink ? '✅ ON' : '❌ OFF'}

📨 Anti Forward :
${settings.antiForward ? '✅ ON' : '❌ OFF'}

⭐ Anti Emoji Premium :
${settings.antiEmoji ? '✅ ON' : '❌ OFF'}`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'ON LINK', callback_data: 'security_link_on' },
                        { text: 'OFF LINK', callback_data: 'security_link_off' }
                    ],
                    [
                        { text: 'ON FORWARD', callback_data: 'security_forward_on' },
                        { text: 'OFF FORWARD', callback_data: 'security_forward_off' }
                    ],
                    [
                        { text: 'ON EMOJI', callback_data: 'security_emoji_on' },
                        { text: 'OFF EMOJI', callback_data: 'security_emoji_off' }
                    ]
                ]
            }
        }
    );
});

bot.launch().then(() => {
    console.log('BOT ONLINE');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
