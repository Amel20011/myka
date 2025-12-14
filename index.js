// ============================================
// ASTHERIC BOT - MULTI DEVICE WHATSAPP BOT
// ============================================

// ============================
// IMPORT MODULES
// ============================
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    jidDecode,
    proto,
    downloadContentFromMessage,
    getAggregateVotesInPollMessage
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const axios = require('axios');
const FormData = require('form-data');

// ============================
// KONFIGURASI
// ============================
const config = {
    ownerNumber: "13658700681",
    botName: "Astheric Bot",
    prefix: ".",
    sessionName: "session",
    version: "2.0.0",
    github: "https://github.com/astheric/astheric-bot"
};

// ============================
// INISIALISASI STORE
// ============================
const store = makeInMemoryStore({
    logger: pino().child({ level: 'silent', stream: 'store' })
});

// ============================
// SISTEM DATABASE
// ============================
const dbPath = './astheric_data.json';
let database = {
    users: {},
    groups: {},
    settings: {
        welcome: true,
        goodbye: true,
        antilink: false
    },
    registered: []
};

// Load database
if (fs.existsSync(dbPath)) {
    try {
        database = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    } catch (e) {
        console.error('Error loading database:', e);
    }
}

// Save database
const saveDB = () => {
    fs.writeFileSync(dbPath, JSON.stringify(database, null, 2));
};

// ============================
// FUNGSI UTILITAS
// ============================
const formatPhone = (num) => {
    let formatted = num.replace(/[^0-9]/g, '');
    if (!formatted.startsWith('1')) formatted = '1' + formatted;
    return formatted + '@s.whatsapp.net';
};

const isOwner = (jid) => {
    const num = jid.split('@')[0];
    return num === config.ownerNumber || num === config.ownerNumber.replace('+', '');
};

const getUserId = (jid) => {
    return jidDecode(jid)?.user || jid.split('@')[0];
};

const isGroup = (jid) => jid.endsWith('@g.us');

const isAdmin = async (groupId, participant, sock) => {
    try {
        const groupMetadata = await sock.groupMetadata(groupId);
        const admins = groupMetadata.participants
            .filter(p => p.admin)
            .map(p => p.id);
        return admins.includes(participant);
    } catch {
        return false;
    }
};

// ============================
// FUNGSI PENGIRIMAN PESAN
// ============================
const sendMessage = async (sock, jid, content, options = {}) => {
    try {
        return await sock.sendMessage(jid, content, options);
    } catch (error) {
        console.error('Send message error:', error);
    }
};

const sendButtonMessage = async (sock, jid, text, buttons, footer = null, mentions = []) => {
    const buttonMessage = {
        text: text,
        footer: footer || config.botName,
        buttons: buttons,
        headerType: 1
    };
    
    if (mentions.length > 0) {
        buttonMessage.mentions = mentions;
    }
    
    return await sendMessage(sock, jid, buttonMessage);
};

// ============================
// HANDLER PERINTAH
// ============================
const commandHandlers = {
    // MAIN MENU
    '.menu': async (sock, msg, jid, user, text, args, pushname) => {
        await sendButtonMessage(sock, jid,
            `╭─── 🎀 ${config.botName.toUpperCase()} 🎀 ───╮
│ Bot : ${config.botName}
│ User : 🌸 @${getUserId(user)}
│ Mode : Multi Device
│ Prefix : ${config.prefix}
╰─────────────────────────────╯

🌸 *SILAHKAN PILIH MENU DI BAWAH*`,
            [
                { buttonId: '.mainmenu', buttonText: { displayText: '📱 MAIN MENU' }, type: 1 },
                { buttonId: '.groupmenu', buttonText: { displayText: '👥 GROUP MENU' }, type: 1 },
                { buttonId: '.adminmenu', buttonText: { displayText: '🛡 ADMIN MENU' }, type: 1 },
                { buttonId: '.ownermenu', buttonText: { displayText: '👑 OWNER MENU' }, type: 1 },
                { buttonId: '.allmenu', buttonText: { displayText: '📋 ALL COMMANDS' }, type: 1 }
            ],
            `Gunakan tombol untuk navigasi • ${config.botName}`,
            [user]
        );
    },

    '.allmenu': async (sock, msg, jid, user, text, args, pushname) => {
        const allMenu = `╭─── 📋 ALL COMMANDS ───╮

📱 *MAIN MENU*
${config.prefix}menu - Tampilkan menu
${config.prefix}info - Info bot
${config.prefix}ping - Cek status bot
${config.prefix}profile - Info profil
${config.prefix}daftar - Daftar user baru
${config.prefix}rules - Peraturan bot
${config.prefix}donasi - Donasi bot

👥 *GROUP MENU*
${config.prefix}antilink [on/off] - Anti link
${config.prefix}welcome [on/off] - Welcome message
${config.prefix}goodbye [on/off] - Goodbye message
${config.prefix}group [open/close] - Buka/tutup grup
${config.prefix}add 628xx - Tambah member
${config.prefix}kick 628xx - Keluarkan member
${config.prefix}promote 628xx - Jadikan admin
${config.prefix}demote 628xx - Turunkan admin
${config.prefix}tagall - Mention semua member
${config.prefix}mute [on/off] - Mute/unmute grup

🛡 *ADMIN MENU*
${config.prefix}del [reply] - Hapus pesan
${config.prefix}warn @user - Beri warning
${config.prefix}setdesc [text] - Ubah deskripsi
${config.prefix}setname [text] - Ubah nama grup
${config.prefix}hidetag [text] - Tag semua tanpa notif

👑 *OWNER MENU*
${config.prefix}owner - Info owner
${config.prefix}broadcast [text] - Broadcast
${config.prefix}restart - Restart bot
${config.prefix}setprefix [prefix] - Ganti prefix
${config.prefix}block 628xx - Block user
${config.prefix}unblock 628xx - Unblock user
╰─────────────────────╯`;

        await sendMessage(sock, jid, { text: allMenu });
    },

    '.info': async (sock, msg, jid, user, text, args, pushname) => {
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);

        await sendButtonMessage(sock, jid,
            `🤖 *${config.botName.toUpperCase()} INFORMATION*

📊 *STATISTICS*
• Users : ${database.registered.length} registered
• Groups : ${Object.keys(database.groups).length}
• Uptime : ${hours}h ${minutes}m ${seconds}s
• Version : ${config.version}
• Library : Baileys MD

⚙️ *SYSTEM*
• Owner : +${config.ownerNumber}
• Prefix : ${config.prefix}
• Mode : Multi Device
• Platform : Node.js ${process.version}

💾 *MEMORY USAGE*
• RAM : ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB
• CPU : ${process.cpuUsage().user / 1000000} seconds`,
            [
                { buttonId: '.owner', buttonText: { displayText: '👑 OWNER' }, type: 1 },
                { buttonId: '.donasi', buttonText: { displayText: '💝 DONASI' }, type: 1 },
                { buttonId: config.github, buttonText: { displayText: '📁 SOURCE' }, type: 2 }
            ],
            `${config.botName} • Made with ❤️`
        );
    },

    '.ping': async (sock, msg, jid, user, text, args, pushname) => {
        const start = Date.now();
        const pingMsg = await sendMessage(sock, jid, { text: '🏓 *Pinging...*' });
        const latency = Date.now() - start;
        
        await sock.sendMessage(jid, {
            text: `✅ *PONG!*\n\n📊 *STATUS*\n• Latency : ${latency}ms\n• Speed : ${latency < 200 ? '⚡ Excellent' : latency < 500 ? '✅ Good' : '🐢 Slow'}\n• Server : Active`,
            edit: pingMsg.key
        });
    },

    '.daftar': async (sock, msg, jid, user, text, args, pushname) => {
        const userId = getUserId(user);
        
        if (database.registered.includes(userId)) {
            await sendMessage(sock, jid, {
                text: `❌ *REGISTRATION FAILED*\n\n@${userId} kamu sudah terdaftar sebelumnya!`,
                mentions: [user]
            });
            return;
        }
        
        database.registered.push(userId);
        database.users[userId] = {
            name: pushname,
            registrationDate: new Date().toISOString(),
            level: 'user',
            warns: 0
        };
        saveDB();
        
        await sendButtonMessage(sock, jid,
            `🎉 *REGISTRATION SUCCESS*\n\n✅ @${userId} berhasil terdaftar!\n\n📝 *DETAIL*\n• Name : ${pushname}\n• ID : ${userId}\n• Date : ${new Date().toLocaleDateString('id-ID')}\n• Level : User\n\nSekarang kamu bisa menggunakan semua fitur bot!`,
            [
                { buttonId: '.menu', buttonText: { displayText: '📱 MENU' }, type: 1 },
                { buttonId: '.rules', buttonText: { displayText: '📜 RULES' }, type: 1 }
            ],
            `Terima kasih telah mendaftar! • ${config.botName}`,
            [user]
        );
    },

    '.profile': async (sock, msg, jid, user, text, args, pushname) => {
        const userId = getUserId(user);
        const userData = database.users[userId] || {};
        const isReg = database.registered.includes(userId);
        
        const profileText = `👤 *USER PROFILE*\n\n📛 *Name* : ${pushname}\n🆔 *ID* : ${userId}\n📅 *Status* : ${isReg ? '✅ Registered' : '❌ Not Registered'}\n⭐ *Level* : ${userData.level || 'User'}\n📅 *Join Date* : ${userData.registrationDate ? new Date(userData.registrationDate).toLocaleDateString('id-ID') : 'Not registered'}\n⚠️ *Warnings* : ${userData.warns || 0}/3`;
        
        await sendButtonMessage(sock, jid, profileText,
            isReg ? [
                { buttonId: '.menu', buttonText: { displayText: '📱 MENU' }, type: 1 },
                { buttonId: '.info', buttonText: { displayText: '🤖 BOT INFO' }, type: 1 }
            ] : [
                { buttonId: '.daftar', buttonText: { displayText: '📝 REGISTER' }, type: 1 },
                { buttonId: '.rules', buttonText: { displayText: '📜 RULES' }, type: 1 }
            ],
            `${config.botName} • User Profile`,
            [user]
        );
    },

    '.rules': async (sock, msg, jid, user, text, args, pushname) => {
        await sendMessage(sock, jid, { text: `📜 *PERATURAN BOT ${config.botName.toUpperCase()}*\n\n1. ❌ Dilarang spam command\n2. ❌ Dilarang mengirim konten illegal\n3. ❌ Dilarang abuse bug/error bot\n4. ✅ Gunakan bot dengan bijak\n5. ✅ Laporkan bug ke owner\n6. ✅ Baca menu sebelum menggunakan\n\n⚠️ *Peringatan* : Pelanggaran akan berakibat banned permanent!` });
    },

    '.donasi': async (sock, msg, jid, user, text, args, pushname) => {
        await sendButtonMessage(sock, jid,
            `💝 *DONASI & SUPPORT*\n\nSupport pengembangan ${config.botName} dengan donasi:\n\n📊 *KEUNTUNGAN DONASI*\n• Priority support\n• Request fitur custom\n• Akses fitur premium\n• Nama di credits bot\n\n💰 *METODE DONASI*\n• Saweria : saweria.co/astheric\n• Trakteer : trakteer.id/astheric\n• PayPal : paypal.me/astheric`,
            [
                { buttonId: 'https://saweria.co/astheric', buttonText: { displayText: '💸 SAWERIA' }, type: 2 },
                { buttonId: 'https://trakteer.id/astheric', buttonText: { displayText: '🎁 TRAKTEER' }, type: 2 },
                { buttonId: '.owner', buttonText: { displayText: '👑 OWNER' }, type: 1 }
            ],
            `Terima kasih untuk supportnya! • ${config.botName}`
        );
    },

    // GROUP MENU
    '.antilink': async (sock, msg, jid, user, text, args, pushname) => {
        if (!isGroup(jid)) {
            await sendMessage(sock, jid, { text: '❌ Command ini hanya untuk grup!' });
            return;
        }
        
        if (!await isAdmin(jid, user, sock)) {
            await sendMessage(sock, jid, { text: '❌ Hanya admin yang bisa menggunakan command ini!' });
            return;
        }
        
        const action = args[0]?.toLowerCase();
        if (!action || !['on', 'off'].includes(action)) {
            await sendMessage(sock, jid, { text: `❌ Penggunaan: ${config.prefix}antilink [on/off]` });
            return;
        }
        
        if (!database.groups[jid]) database.groups[jid] = {};
        database.groups[jid].antilink = action === 'on';
        saveDB();
        
        await sendMessage(sock, jid, {
            text: `✅ *ANTILINK ${action.toUpperCase()}*\n\nFitur antilink telah di${action === 'on' ? 'aktifkan' : 'nonaktifkan'}!`
        });
    },

    '.welcome': async (sock, msg, jid, user, text, args, pushname) => {
        if (!isGroup(jid)) {
            await sendMessage(sock, jid, { text: '❌ Command ini hanya untuk grup!' });
            return;
        }
        
        if (!await isAdmin(jid, user, sock)) {
            await sendMessage(sock, jid, { text: '❌ Hanya admin yang bisa menggunakan command ini!' });
            return;
        }
        
        const action = args[0]?.toLowerCase();
        if (!action || !['on', 'off'].includes(action)) {
            await sendMessage(sock, jid, { text: `❌ Penggunaan: ${config.prefix}welcome [on/off]` });
            return;
        }
        
        if (!database.groups[jid]) database.groups[jid] = {};
        database.groups[jid].welcome = action === 'on';
        saveDB();
        
        await sendMessage(sock, jid, {
            text: `✅ *WELCOME ${action.toUpperCase()}*\n\nFitur welcome message telah di${action === 'on' ? 'aktifkan' : 'nonaktifkan'}!`
        });
    },

    '.goodbye': async (sock, msg, jid, user, text, args, pushname) => {
        if (!isGroup(jid)) {
            await sendMessage(sock, jid, { text: '❌ Command ini hanya untuk grup!' });
            return;
        }
        
        if (!await isAdmin(jid, user, sock)) {
            await sendMessage(sock, jid, { text: '❌ Hanya admin yang bisa menggunakan command ini!' });
            return;
        }
        
        const action = args[0]?.toLowerCase();
        if (!action || !['on', 'off'].includes(action)) {
            await sendMessage(sock, jid, { text: `❌ Penggunaan: ${config.prefix}goodbye [on/off]` });
            return;
        }
        
        if (!database.groups[jid]) database.groups[jid] = {};
        database.groups[jid].goodbye = action === 'on';
        saveDB();
        
        await sendMessage(sock, jid, {
            text: `✅ *GOODBYE ${action.toUpperCase()}*\n\nFitur goodbye message telah di${action === 'on' ? 'aktifkan' : 'nonaktifkan'}!`
        });
    },

    '.group': async (sock, msg, jid, user, text, args, pushname) => {
        if (!isGroup(jid)) {
            await sendMessage(sock, jid, { text: '❌ Command ini hanya untuk grup!' });
            return;
        }
        
        if (!await isAdmin(jid, user, sock)) {
            await sendMessage(sock, jid, { text: '❌ Hanya admin yang bisa menggunakan command ini!' });
            return;
        }
        
        const action = args[0]?.toLowerCase();
        if (!action || !['open', 'close'].includes(action)) {
            await sendMessage(sock, jid, { text: `❌ Penggunaan: ${config.prefix}group [open/close]` });
            return;
        }
        
        try {
            await sock.groupSettingUpdate(jid, action === 'close' ? 'announcement' : 'not_announcement');
            await sendMessage(sock, jid, {
                text: `✅ *GROUP ${action.toUpperCase()}*\n\nGrup telah di${action === 'close' ? 'tutup' : 'buka'}!`
            });
        } catch (error) {
            await sendMessage(sock, jid, { text: `❌ Gagal mengubah setting grup: ${error.message}` });
        }
    },

    '.tagall': async (sock, msg, jid, user, text, args, pushname) => {
        if (!isGroup(jid)) {
            await sendMessage(sock, jid, { text: '❌ Command ini hanya untuk grup!' });
            return;
        }
        
        if (!await isAdmin(jid, user, sock)) {
            await sendMessage(sock, jid, { text: '❌ Hanya admin yang bisa menggunakan command ini!' });
            return;
        }
        
        try {
            const groupMetadata = await sock.groupMetadata(jid);
            const participants = groupMetadata.participants;
            const mentions = participants.map(p => p.id);
            const text = args.join(' ') || 'Halo semua!';
            
            await sendMessage(sock, jid, {
                text: `📢 *PEMBERITAHUAN*\n\n${text}\n\n${participants.map((p, i) => `${i + 1}. @${p.id.split('@')[0]}`).join('\n')}`,
                mentions: mentions
            });
        } catch (error) {
            await sendMessage(sock, jid, { text: `❌ Gagal tag all: ${error.message}` });
        }
    },

    // ADMIN MENU
    '.del': async (sock, msg, jid, user, text, args, pushname) => {
        if (!await isAdmin(jid, user, sock)) {
            await sendMessage(sock, jid, { text: '❌ Hanya admin yang bisa menggunakan command ini!' });
            return;
        }
        
        if (!msg.message.extendedTextMessage?.contextInfo?.quotedMessage) {
            await sendMessage(sock, jid, { text: `❌ Balas pesan yang ingin dihapus!\nContoh: ${config.prefix}del` });
            return;
        }
        
        try {
            const quoted = msg.message.extendedTextMessage.contextInfo;
            await sock.sendMessage(jid, {
                delete: {
                    remoteJid: jid,
                    fromMe: false,
                    id: quoted.stanzaId,
                    participant: quoted.participant
                }
            });
        } catch (error) {
            await sendMessage(sock, jid, { text: `❌ Gagal menghapus pesan: ${error.message}` });
        }
    },

    '.hidetag': async (sock, msg, jid, user, text, args, pushname) => {
        if (!isGroup(jid)) {
            await sendMessage(sock, jid, { text: '❌ Command ini hanya untuk grup!' });
            return;
        }
        
        if (!await isAdmin(jid, user, sock)) {
            await sendMessage(sock, jid, { text: '❌ Hanya admin yang bisa menggunakan command ini!' });
            return;
        }
        
        const message = args.join(' ');
        if (!message) {
            await sendMessage(sock, jid, { text: `❌ Masukkan pesan!\nContoh: ${config.prefix}hidetag Hello semua` });
            return;
        }
        
        try {
            const groupMetadata = await sock.groupMetadata(jid);
            const participants = groupMetadata.participants;
            const mentions = participants.map(p => p.id);
            
            await sendMessage(sock, jid, {
                text: `📢 ${message}`,
                mentions: mentions
            });
        } catch (error) {
            await sendMessage(sock, jid, { text: `❌ Gagal mengirim hidetag: ${error.message}` });
        }
    },

    // OWNER MENU
    '.owner': async (sock, msg, jid, user, text, args, pushname) => {
        await sendButtonMessage(sock, jid,
            `👑 *OWNER INFORMATION*\n\n📛 *Name* : Astheric Owner\n📞 *Phone* : +${config.ownerNumber}\n📧 *Email* : astheric@mail.com\n🌐 *GitHub* : github.com/astheric\n📸 *Instagram* : @astheric_\n\n💬 *CONTACT*\nJangan ragu untuk menghubungi owner untuk:\n• Laporan bug\n• Request fitur\n• Kerjasama\n• Pertanyaan lain`,
            [
                { buttonId: `https://wa.me/${config.ownerNumber}`, buttonText: { displayText: '📞 CHAT OWNER' }, type: 2 },
                { buttonId: 'https://github.com/astheric', buttonText: { displayText: '💻 GITHUB' }, type: 2 },
                { buttonId: 'https://instagram.com/astheric_', buttonText: { displayText: '📸 INSTAGRAM' }, type: 2 }
            ],
            `${config.botName} • Official Owner`
        );
    },

    '.broadcast': async (sock, msg, jid, user, text, args, pushname) => {
        if (!isOwner(user)) {
            await sendMessage(sock, jid, { text: '❌ Hanya owner yang bisa menggunakan command ini!' });
            return;
        }
        
        const message = args.join(' ');
        if (!message) {
            await sendMessage(sock, jid, { text: `❌ Masukkan pesan!\nContoh: ${config.prefix}broadcast Update terbaru!` });
            return;
        }
        
        const broadcastList = [...new Set([...database.registered, ...Object.keys(database.users)])];
        let success = 0, failed = 0;
        
        await sendMessage(sock, jid, { text: `📢 Memulai broadcast ke ${broadcastList.length} user...` });
        
        for (const userId of broadcastList) {
            try {
                const userJid = `${userId}@s.whatsapp.net`;
                await sendMessage(sock, userJid, {
                    text: `📢 *BROADCAST FROM OWNER*\n\n${message}\n\n_This is an automated broadcast message_`
                });
                success++;
                await new Promise(resolve => setTimeout(resolve, 500)); // Delay untuk anti-ban
            } catch (error) {
                failed++;
                console.error(`Failed to send to ${userId}:`, error);
            }
        }
        
        await sendMessage(sock, jid, {
            text: `✅ *BROADCAST COMPLETE*\n\n📊 *STATISTICS*\n• Success : ${success} users\n• Failed : ${failed} users\n• Total : ${broadcastList.length} users`
        });
    },

    '.restart': async (sock, msg, jid, user, text, args, pushname) => {
        if (!isOwner(user)) {
            await sendMessage(sock, jid, { text: '❌ Hanya owner yang bisa menggunakan command ini!' });
            return;
        }
        
        await sendMessage(sock, jid, { text: '🔄 *Restarting bot...*' });
        setTimeout(() => {
            process.exit(0);
        }, 2000);
    },

    '.setprefix': async (sock, msg, jid, user, text, args, pushname) => {
        if (!isOwner(user)) {
            await sendMessage(sock, jid, { text: '❌ Hanya owner yang bisa menggunakan command ini!' });
            return;
        }
        
        const newPrefix = args[0];
        if (!newPrefix || newPrefix.length > 2) {
            await sendMessage(sock, jid, { text: '❌ Prefix harus 1-2 karakter!' });
            return;
        }
        
        config.prefix = newPrefix;
        await sendMessage(sock, jid, {
            text: `✅ *PREFIX UPDATED*\n\nPrefix berhasil diubah dari "${config.prefix}" menjadi "${newPrefix}"`
        });
    }
};

// ============================
// MAIN BOT FUNCTION
// ============================
async function startBot() {
    console.log('🚀 Starting Astheric Bot...');
    
    // Setup session
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionName);
    const { version } = await fetchLatestBaileysVersion();
    
    // Create socket
    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        getMessage: async (key) => {
            return store.loadMessage(key.remoteJid, key.id) || {};
        }
    });
    
    // Bind store
    store.bind(sock.ev);
    
    // ============================
    // EVENT HANDLERS
    // ============================
    
    // Connection update
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const reason = new DisconnectReason(lastDisconnect?.error);
            console.log('Connection closed:', reason);
            
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Reconnecting...');
                setTimeout(startBot, 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ Bot connected successfully!');
            console.log('🤖 Bot Name:', sock.user?.name || 'Unknown');
            console.log('📱 JID:', sock.user?.id);
            
            // Update bot status
            await sock.updateProfileName(config.botName);
            await sock.updateProfileStatus(`🌷 ${config.botName} • Multi Device`);
        }
    });
    
    // Credentials update
    sock.ev.on('creds.update', saveCreds);
    
    // Group participants update (Welcome/Goodbye)
    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        
        // Welcome new members
        if (action === 'add') {
            const groupConfig = database.groups[id] || {};
            if (groupConfig.welcome !== false) {
                for (const participant of participants) {
                    const userId = getUserId(participant);
                    await sendButtonMessage(sock, id,
                        `✨ *WELCOME TO THE GROUP!* ✨\n\n👋 Hello @${userId}\n💖 Welcome to the group!\n🌸 I'm ${config.botName}, your assistant bot\n\n📝 *INFORMATION*\n• Use ${config.prefix}menu to see commands\n• Read ${config.prefix}rules for group rules\n• Register with ${config.prefix}daftar to use all features`,
                        [
                            { buttonId: '.daftar', buttonText: { displayText: '📝 REGISTER' }, type: 1 },
                            { buttonId: '.menu', buttonText: { displayText: '📱 MENU' }, type: 1 },
                            { buttonId: '.rules', buttonText: { displayText: '📜 RULES' }, type: 1 }
                        ],
                        `Welcome to the group! • ${config.botName}`,
                        [participant]
                    );
                }
            }
        }
        
        // Goodbye members
        else if (action === 'remove') {
            const groupConfig = database.groups[id] || {};
            if (groupConfig.goodbye !== false) {
                for (const participant of participants) {
                    const userId = getUserId(participant);
                    await sendMessage(sock, id, {
                        text: `👋 Goodbye @${userId}\nWe'll miss you! 😢`,
                        mentions: [participant]
                    });
                }
            }
        }
    });
    
    // Message handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const jid = msg.key.remoteJid;
        const user = msg.key.participant || jid;
        const isGrp = isGroup(jid);
        const messageType = Object.keys(msg.message)[0];
        let text = (msg.message.conversation || 
                   msg.message.extendedTextMessage?.text || 
                   msg.message.imageMessage?.caption || '').toLowerCase();
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        const sender = getUserId(user);
        const pushname = msg.pushName || 'User';
        
        console.log(`[${isGrp ? 'GROUP' : 'PVT'}] ${pushname}: ${text}`);
        
        // Check if message starts with prefix
        if (!text.startsWith(config.prefix)) {
            // Anti-link feature
            if (isGrp) {
                const groupConfig = database.groups[jid] || {};
                if (groupConfig.antilink) {
                    const linkRegex = /(https?:\/\/[^\s]+)/g;
                    if (linkRegex.test(text)) {
                        const isUserAdmin = await isAdmin(jid, user, sock);
                        if (!isUserAdmin) {
                            await sendMessage(sock, jid, {
                                text: `⚠️ *ANTI-LINK DETECTED!*\n\n@${sender} mengirim link di grup!\nLink tidak diperbolehkan di grup ini.`,
                                mentions: [user]
                            });
                            await sock.groupParticipantsUpdate(jid, [user], 'remove');
                            return;
                        }
                    }
                }
            }
            return;
        }
        
        // Extract command and args
        const [cmd, ...args] = text.slice(config.prefix.length).trim().split(' ');
        const fullCmd = config.prefix + cmd;
        
        // Check registration for non-basic commands
        const allowedWithoutReg = ['.menu', '.daftar', '.rules', '.info', '.donasi', '.owner', '.ping', '.profile'];
        if (!database.registered.includes(sender) && !allowedWithoutReg.includes(fullCmd) && !isOwner(user)) {
            await sendButtonMessage(sock, jid,
                `🌸 *REGISTRATION REQUIRED* 🌸\n\nHi @${sender}! ✨\nKamu belum terdaftar di sistem ${config.botName} 💗\nSilakan daftar dulu untuk menggunakan semua fitur! 🌷`,
                [
                    { buttonId: '.daftar', buttonText: { displayText: '📝 DAFTAR SEKARANG' }, type: 1 },
                    { buttonId: '.rules', buttonText: { displayText: '📜 BACA RULES' }, type: 1 }
                ],
                `${config.botName} • Registration System`,
                [user]
            );
            return;
        }
        
        // Execute command
        if (commandHandlers[fullCmd]) {
            try {
                await commandHandlers[fullCmd](sock, msg, jid, user, text, args, pushname);
            } catch (error) {
                console.error('Command error:', error);
                await sendMessage(sock, jid, {
                    text: `❌ *ERROR*\n\nTerjadi kesalahan saat menjalankan command:\n\`\`\`${error.message}\`\`\``
                });
            }
        } else {
            // Command not found
            await sendButtonMessage(sock, jid,
                `❌ *COMMAND NOT FOUND*\n\nCommand "${fullCmd}" tidak ditemukan!\n\nGunakan ${config.prefix}menu untuk melihat daftar command yang tersedia.`,
                [
                    { buttonId: '.menu', buttonText: { displayText: '📱 SHOW MENU' }, type: 1 },
                    { buttonId: '.allmenu', buttonText: { displayText: '📋 ALL COMMANDS' }, type: 1 }
                ],
                `${config.botName} • Command Help`
            );
        }
    });
    
    // Button response handler
    sock.ev.on('messages.upsert', ({ messages }) => {
        const msg = messages[0];
        if (msg.message?.buttonsResponseMessage) {
            const buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            const jid = msg.key.remoteJid;
            const user = msg.key.participant || jid;
            
            console.log(`[BUTTON] ${getUserId(user)} clicked: ${buttonId}`);
            
            // Simulate command from button
            const simulatedMsg = {
                ...msg,
                message: {
                    conversation: buttonId
                }
            };
            
            // Trigger command handler
            sock.ev.emit('messages.upsert', { messages: [simulatedMsg] });
        }
    });
}

// ============================
// START BOT
// ============================
startBot().catch(console.error);

// Handle process events
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down bot...');
    saveDB();
    process.exit(0);
});
