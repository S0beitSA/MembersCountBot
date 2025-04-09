import { fetchAndSaveGroups, getAllGroups, saveSelectedGroup, getSelectedGroups, incrementCounter, getDailyCounters } from './db.js';
import { fetchGroupMetadata } from './group.js';

export const CONFIG = {
    timeoutDuration: 10 * 60 * 1000,
    scheduleTime: ['59 23 * * *', '0 8 * * *', '0 13 * * *', '0 18 * * *'],
    resetTime: '0 0 * * *', 
    commands: {
        participants: '@participantes',
        select: '@selecionargrupo',
        remove: '@removerid',
        updateGroups: '@atualizargrupos' 
    },
    regex: {
        updescontaUrl: /https:\/\/updesconta\.com\.br.*/
    },
    operations: {
        select: {
            successMessage: 'Grupo salvo para verificação agendada.',
        },
    },
};

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const sendMessageWithRetry = async (sock, groupId, messageContent, groupName = '') => {
    let attempts = 0;
    while (true) {
        try {
            await sock.sendMessage(groupId, { text: messageContent });
            console.log(`Mensagem enviada para o grupo: ${groupName || groupId}`);
            break;
        } catch (error) {
            attempts++;
            console.log(`Erro ao enviar mensagem para o grupo ${groupName || groupId} (tentativa ${attempts}):`, error);
            console.log('Aguardando 5 segundos antes de tentar novamente...');
            await delay(5000);
        }
    }
};

export const handleGroupOperation = async (sock, chatId, operation) => {
    const metadata = await fetchGroupMetadata(sock, chatId); 
    if (!metadata) return;

    const { id: groupId, subject: groupName } = metadata;
    saveSelectedGroup(groupId, groupName);

    if (operation.successMessage) {
        await sock.sendMessage(chatId, { text: operation.successMessage });
    }
};

export const updateGroupList = async (sock) => {
    console.log('Atualizando lista de grupos...');
    try {
        const groupsObject = await sock.groupFetchAllParticipating();
        const groupsArray = Object.values(groupsObject);
        console.log(`Total de grupos encontrados: ${groupsArray.length}`);

        // Processa grupos em lotes de 5
        const batchSize = 5;
        for (let i = 0; i < groupsArray.length; i += batchSize) {
            const batch = groupsArray.slice(i, i + batchSize);
            console.log(`Processando lote ${Math.floor(i/batchSize) + 1} de ${Math.ceil(groupsArray.length/batchSize)}`);
            
            await fetchAndSaveGroups(batch);
            
            if (i + batchSize < groupsArray.length) {
                await delay(2000);
            }
        }

        console.log('Atualização de grupos concluída');
        return getAllGroups();
    } catch (error) {
        console.log('Erro ao atualizar lista de grupos:', error);
    }
};

export const handleParticipantCount = async (sock, chatId = null) => {
    console.log('Executando contagem de participantes...');
    const allGroups = getAllGroups();
    const todayDate = new Date().toLocaleDateString('pt-BR');
    
    const counters = getDailyCounters(todayDate);
    let totalParticipants = 0;
    let messageContent = '';

    for (const group of allGroups) {
        try {
            const metadata = await fetchGroupMetadata(sock, group.id);
            const currentParticipants = metadata.participants.length;
            totalParticipants += currentParticipants;

            const groupCounters = counters.find(c => c.group_id === group.id) || { entries: 0, exits: 0 };

            messageContent += `-----------------------------\n` +
                          `Grupo: ${group.name}\n` +
                          `Total de Participantes: ${currentParticipants}\n` +
                          `Entradas hoje: ${groupCounters.entries}\n` +
                          `Saídas hoje: ${groupCounters.exits}\n`;

        } catch (error) {
            console.log(`Erro ao processar grupo ${group.id}:`, error);
        }
    }

    const totalEntries = counters.reduce((sum, curr) => sum + curr.entries, 0);
    const totalExits = counters.reduce((sum, curr) => sum + curr.exits, 0);

    const summary = `Resumo do dia ${todayDate}:\n` +
                    `Total de grupos: ${allGroups.length}\n` +
                    `Total de participantes: ${totalParticipants}\n` +
                    `Total de entradas hoje: ${totalEntries}\n` +
                    `Total de saídas hoje: ${totalExits}\n` +
                    `-----------------------------\n`;

    messageContent = summary + messageContent;

    const selectedGroups = getSelectedGroups();

    if (chatId) {
        const isSelectedGroup = selectedGroups.some(group => group.id === chatId);
        if (!isSelectedGroup) {
            console.log(`O grupo ${chatId} não está na lista de grupos selecionados.`);
            await sendMessageWithRetry(sock, chatId, 'Este grupo não está na lista de grupos selecionados para contagem.');
            return;
        }
        await sendMessageWithRetry(sock, chatId, messageContent);
    } else {
        for (const group of selectedGroups) {
            await sendMessageWithRetry(sock, group.id, messageContent, group.name);
        }
    }
};

export const registerParticipantEvents = (sock) => {
    sock.ev.on('group-participants.update', async (update) => {
        const { id: groupId, action, participants } = update;
        const todayDate = new Date().toLocaleDateString('pt-BR');
        const selectedGroups = getSelectedGroups();

        const reportGroup = selectedGroups[0];
        if (!reportGroup) return;

        const groupMetadata = await fetchGroupMetadata(sock, groupId);
        if (!groupMetadata) return;

        const counters = getDailyCounters(todayDate);
        const groupCounters = counters.find(c => c.group_id === groupId) || { entries: 0, exits: 0 };

        if (action === 'add') {
            incrementCounter(groupId, todayDate, 'entries');
            const welcomeMessage = `🎉 Nova entrada no grupo!\n\n` +
                                 `Grupo: ${groupMetadata.subject}\n` +
                                 `Total de Participantes: ${groupMetadata.participants.length}\n` +
                                 `Entradas hoje: ${groupCounters.entries + 1}\n` +
                                 `Saídas hoje: ${groupCounters.exits}\n\n` +
                                 `Ficamos felizes em ter mais um membro! 🎉`;
            await sendMessageWithRetry(sock, reportGroup.id, welcomeMessage);
        } else if (action === 'remove') {
            incrementCounter(groupId, todayDate, 'exits');
            const goodbyeMessage = `😢 Alguém saiu do grupo!\n\n` +
                                 `Grupo: ${groupMetadata.subject}\n` +
                                 `Total de Participantes: ${groupMetadata.participants.length}\n` +
                                 `Entradas hoje: ${groupCounters.entries}\n` +
                                 `Saídas hoje: ${groupCounters.exits + 1}\n\n` +
                                 `Sentiremos sua falta! 😢`;
            await sendMessageWithRetry(sock, reportGroup.id, goodbyeMessage);
        }
    });
};

