import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import schedule from 'node-schedule';
import { CONFIG, handleGroupOperation, handleParticipantCount } from './src/bot.js';
import fs from 'fs';
import './src/bot.js'; 

const clearCredentials = () => {
    const authPath = 'baileys_auth_info';
    if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
        console.log('Cleared authentication credentials.');
    }
};

const startBot = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
    const sock = makeWASocket({ auth: state, printQRInTerminal: true });

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const shouldReconnect =
                (lastDisconnect.error)?.output?.statusCode !==
                DisconnectReason.loggedOut;
            console.log(
                "connection closed due to ",
                lastDisconnect.error,
                ", reconnecting ",
                shouldReconnect
            );
            if (lastDisconnect.error?.output?.statusCode === 401) {
                clearCredentials();
            }
            // reconnect if not logged out
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === "open") {
            console.log("opened connection");

            CONFIG.scheduleTime.forEach((time) => {
                schedule.scheduleJob(time, async () => {
                    console.log(`Executando contagem de participantes no horário agendado: ${time}`);
                    await handleParticipantCount(sock);
                });
            });
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            for (const msg of messages) {
                const messageContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
                const chatId = msg.key.remoteJid;

                switch (messageContent.trim().toLowerCase()) {
                    case CONFIG.commands.participants:
                        await handleParticipantCount(sock, chatId);
                        break;

                    case CONFIG.commands.select:
                        await handleGroupOperation(sock, chatId, CONFIG.operations.select); 
                        break;
                }
            }
        } catch (error) {
            console.error('Erro no processamento de messages.upsert:', error);
        }
    });

    sock.ev.on("creds.update", saveCreds);
};

startBot();
