import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import schedule from 'node-schedule';
import { CONFIG, handleGroupOperation, handleParticipantCount, registerParticipantEvents, updateGroupList } from './src/bot.js';
import { initializeNewDay } from './src/db.js';
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

    sock.ev.on("connection.update", async (update) => {
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

            await updateGroupList(sock);

            registerParticipantEvents(sock);

            CONFIG.scheduleTime.forEach((time) => {
                schedule.scheduleJob(time, async () => {
                    console.log(`Executando contagem de participantes no horário agendado: ${time}`);
                    await handleParticipantCount(sock); 
                });
            });

            schedule.scheduleJob(CONFIG.resetTime, () => {
                const newDate = new Date().toLocaleDateString('pt-BR');
                console.log('Inicializando contadores para o novo dia...');
                initializeNewDay(newDate);
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

                    case CONFIG.commands.updateGroups:
                        await updateGroupList(sock);
                        await sock.sendMessage(chatId, { text: 'Lista de grupos atualizada com sucesso!' });
                        break;
                }
            }
        } catch (error) {
            console.log('Erro no processamento de messages.upsert:', error);
        }
    });

    sock.ev.on("creds.update", saveCreds);
};

// Nico logs very crazy:
process.on('uncaughtException', (err) => {
    console.log('Unhandled Exception:', err);
    // Optionally, decide if you want to log, perform cleanup, or even restart gracefully
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection:', reason);
    // Optionally, add logic to handle the rejection gracefully
  });

startBot();
